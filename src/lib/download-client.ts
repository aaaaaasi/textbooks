"use client"

// 通用下载工具：优先使用 File System Access API 流式写盘（大文件友好），
// 不支持或用户取消选择器时回退到 Blob 方案。均带进度回调与中断支持。
//
// 稳定性设计（修复线上两处故障）：
// 1. "Failed to execute 'getReader' on 'ReadableStream': ReadableStream is locked"
//    根因：旧版在 FS 写盘中途失败后，对同一个已锁定的 response.body 再次
//    getReader() 走 Blob 回退。一个响应体只允许一个读取器 —— 现仅在
//    "保存选择器建立失败（流尚未消费）"时才复用原响应；流一旦开始消费，
//    后续失败一律 cancel 旧流，绝不复用。
// 2. 中途网络断流（ERR_INCOMPLETE_CHUNKED_ENCODING）：基于 Accept-Ranges
//    从已收字节续传（最多 3 次），FS 通道用显式 position 写入保证不串位。

export interface StreamOptions {
  url: string
  suggestedName: string
  signal: AbortSignal
  onProgress?: (received: number, total: number) => void
}

interface WritableLike {
  write: (d: unknown) => Promise<void>
  close: () => Promise<void>
  abort?: (reason?: unknown) => Promise<void>
}

interface FSWindow {
  showSaveFilePicker?: (o: unknown) => Promise<{
    createWritable: () => Promise<WritableLike>
  }>
}

const MAX_RESUMES = 3

function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === "AbortError"
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** 发起下载请求；from > 0 时携带 Range 续传头。 */
async function fetchOnce(url: string, signal: AbortSignal, from: number): Promise<Response> {
  const headers: Record<string, string> = from > 0 ? { Range: `bytes=${from}-` } : {}
  const res = await fetch(url, { signal, headers, cache: "no-store" })
  if (!res.ok || !res.body) throw new Error(`下载失败（HTTP ${res.status}）`)
  return res
}

/** 服务器是否声明支持 Range 续传。 */
function acceptsRanges(res: Response): boolean {
  return (res.headers.get("accept-ranges") ?? "").includes("bytes")
}

/**
 * 消费一个响应体到 sink。逐块更新 state.received（即使中途断流，
 * 外层也能拿到已完成的最新偏移用于续传）。
 * offset 参数告知 sink 当前块的起始字节（FS 通道据此做显式 position 写入）。
 */
async function readInto(
  body: ReadableStream<Uint8Array>,
  sink: (chunk: Uint8Array, offset: number) => Promise<void>,
  opts: StreamOptions,
  state: { received: number },
  total: number,
): Promise<void> {
  const reader = body.getReader()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return
      await sink(value, state.received)
      state.received += value.byteLength
      opts.onProgress?.(state.received, total)
    }
  } catch (e) {
    reader.cancel().catch(() => {})
    throw e
  }
}

/**
 * 带断点续传的下载核心：从首个响应开始，写入 sink。
 * 中途流断开时，若服务器支持 Range，则从已收字节续传（最多 MAX_RESUMES 次）。
 * 续传响应必须为 206，否则视为服务端不支持，直接抛错。
 */
async function pumpWithResume(
  opts: StreamOptions,
  first: Response,
  sink: (chunk: Uint8Array, offset: number) => Promise<void>,
): Promise<void> {
  let curTotal = Number(first.headers.get("content-length") ?? 0)
  const resumeOK = acceptsRanges(first)
  const state = { received: 0 }
  let body: ReadableStream<Uint8Array> = first.body!
  let resumes = 0
  for (;;) {
    try {
      await readInto(body, sink, opts, state, curTotal)
      return
    } catch (e) {
      if (isAbort(e)) throw e
      if (!resumeOK || resumes >= MAX_RESUMES) throw e
      resumes++
      await sleep(400 * resumes)
      // 从最后已完成的字节偏移续传（state.received 逐块更新，无滞后）
      const next = await fetchOnce(opts.url, opts.signal, state.received)
      if (next.status !== 206) {
        next.body?.cancel()
        throw new Error("服务器不支持断点续传")
      }
      const crTotal = Number(next.headers.get("content-range")?.split("/")[1] ?? 0)
      if (crTotal > 0) curTotal = crTotal
      body = next.body!
    }
  }
}

/** Blob 收尾：内存合包并触发浏览器保存。 */
function saveBlob(chunks: Uint8Array[], suggestedName: string): void {
  const blob = new Blob(chunks as BlobPart[], { type: "application/pdf" })
  const href = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = href
  a.download = suggestedName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(href), 60_000)
}

/** Blob 方案（带续传）：以 first 为首个响应，累积到内存后保存。 */
async function blobFlow(first: Response, opts: StreamOptions): Promise<void> {
  const chunks: Uint8Array[] = []
  await pumpWithResume(opts, first, async (c) => {
    chunks.push(c)
  })
  saveBlob(chunks, opts.suggestedName)
}

export async function streamDownload(opts: StreamOptions): Promise<void> {
  const w = window as unknown as FSWindow

  // 无 File System Access API：直接走内存 Blob（带续传）
  if (typeof w.showSaveFilePicker !== "function") {
    const first = await fetchOnce(opts.url, opts.signal, 0)
    return await blobFlow(first, opts)
  }

  const first = await fetchOnce(opts.url, opts.signal, 0)
  const total = Number(first.headers.get("content-length") ?? 0)

  // 建立保存通道。此阶段响应体尚未消费，失败可安全复用原响应走 Blob。
  let writable: WritableLike
  try {
    const handle = await w.showSaveFilePicker({
      suggestedName: opts.suggestedName,
      types: [{ description: "PDF 文档", accept: { "application/pdf": [".pdf"] } }],
    })
    writable = await handle.createWritable()
  } catch (e) {
    if (isAbort(e)) throw e // 用户取消保存对话框
    return await blobFlow(first, opts)
  }

  // FS 流式写盘：显式 position 写入（续传/重试都不会错位）
  try {
    await pumpWithResume(opts, first, (c, offset) =>
      writable.write({ type: "write", position: offset, data: c }),
    )
    await writable.close()
    return
  } catch (e) {
    // 流已消费，不可复用原响应：丢弃半成品临时文件后上抛
    await writable.abort?.(e).catch(() => {})
    throw e instanceof Error ? e : new Error("写入磁盘失败")
  }
}

// 进行中的下载控制器（按任务 id 记录，支持从下载托盘取消）
const controllers = new Map<string, AbortController>()

export function registerController(id: string, c: AbortController): void {
  controllers.set(id, c)
}

export function unregisterController(id: string): void {
  controllers.delete(id)
}

export function cancelDownload(id: string): void {
  controllers.get(id)?.abort()
  controllers.delete(id)
}

export function formatSize(bytes: number): string {
  if (!bytes) return "—"
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

"use client"

// 通用下载工具：优先使用 File System Access API 流式写盘（大文件友好），
// 不支持或用户取消选择器时回退到 Blob 方案。均带进度回调与中断支持。

export interface StreamOptions {
  url: string
  suggestedName: string
  signal: AbortSignal
  onProgress?: (received: number, total: number) => void
}

interface FSPicker extends Promise<unknown> {
  __flag?: never
}

export async function streamDownload(opts: StreamOptions): Promise<void> {
  const res = await fetch(opts.url, { signal: opts.signal })
  if (!res.ok || !res.body) throw new Error(`下载失败（HTTP ${res.status}）`)
  const total = Number(res.headers.get("content-length") ?? 0)

  const w = window as unknown as {
    showSaveFilePicker?: (o: unknown) => Promise<{
      createWritable: () => Promise<{
        write: (d: unknown) => Promise<void>
        close: () => Promise<void>
      }>
    }>
  }

  if (typeof w.showSaveFilePicker === "function") {
    try {
      const handle = await w.showSaveFilePicker({
        suggestedName: opts.suggestedName,
        types: [{ description: "PDF 文档", accept: { "application/pdf": [".pdf"] } }],
      })
      const writable = await handle.createWritable()
      const reader = res.body.getReader()
      let received = 0
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        await writable.write(value)
        received += value.byteLength
        opts.onProgress?.(received, total)
      }
      await writable.close()
      return
    } catch (e) {
      const err = e as DOMException
      if (err?.name === "AbortError") throw err // 用户取消保存对话框
      // 其他错误（如沙箱限制）回退 Blob 方案；需重建响应流
      return blobDownload(res, total, opts)
    }
  }
  return blobDownload(res, total, opts)
}

async function blobDownload(res: Response, total: number, opts: StreamOptions): Promise<void> {
  const reader = res.body!.getReader()
  const chunks: Uint8Array[] = []
  let received = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    received += value.byteLength
    opts.onProgress?.(received, total)
  }
  const blob = new Blob(chunks as BlobPart[], { type: "application/pdf" })
  const href = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = href
  a.download = opts.suggestedName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(href), 60_000)
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

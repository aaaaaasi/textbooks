// PDF 磁盘 LRU 缓存
// data/pdfs/{id}.pdf       完整文件，可按 Range 秒开
// data/pdfs/{id}.pdf.part  写入中的临时文件，不对外服务
//
// 效果：预览/下载过的书落盘后，再次预览、翻页、下载全部走本地磁盘，
// 彻底摆脱上游 CDN 与网关的不确定性（此前"卡死 0%"的故障面）。
// 总量上限 3GB，按最近访问淘汰，写盘失败不影响在线流式回源。

import { createReadStream, createWriteStream, type WriteStream } from "fs"
import { mkdir, readdir, rename, stat, unlink, utimes } from "fs/promises"
import path from "path"
import { Readable } from "stream"

export const PDF_CACHE_DIR = path.join(process.cwd(), "data", "pdfs")
const CAP_BYTES = 3 * 1024 * 1024 * 1024

const fullPath = (id: string) => path.join(PDF_CACHE_DIR, `${id}.pdf`)
const partPath = (id: string) => path.join(PDF_CACHE_DIR, `${id}.pdf.part`)

interface Entry {
  size: number
  lastAccess: number
}
const registry = new Map<string, Entry>()
const activeWrites = new Set<string>()
let scanned = false

async function readyOnce(): Promise<void> {
  try {
    await mkdir(PDF_CACHE_DIR, { recursive: true })
  } catch {
    // 目录已存在或不可建：后续读写会各自报错
  }
  if (scanned) return
  scanned = true
  try {
    for (const f of await readdir(PDF_CACHE_DIR)) {
      if (!f.endsWith(".pdf") || f.endsWith(".pdf.part")) continue
      const st = await stat(path.join(PDF_CACHE_DIR, f)).catch(() => null)
      if (st?.isFile()) registry.set(f.slice(0, -4), { size: st.size, lastAccess: st.mtimeMs })
    }
  } catch {
    // 空目录/不可读：视为空缓存
  }
}

export function isWriteActive(id: string): boolean {
  return activeWrites.has(id)
}

/** 取完整缓存文件路径；命中则触摸访问时间（LRU）。 */
export async function getPdfPath(id: string): Promise<string | null> {
  await readyOnce()
  try {
    const st = await stat(fullPath(id))
    if (!st.isFile() || st.size === 0) return null
    registry.set(id, { size: st.size, lastAccess: Date.now() })
    utimes(fullPath(id), Date.now() / 1000, Date.now() / 1000).catch(() => {})
    return fullPath(id)
  } catch {
    return null
  }
}

/** LRU 淘汰：超出容量时从最久未访问开始删（跳过正在写入的）。 */
async function evict(): Promise<void> {
  const entries = [...registry.entries()].sort((a, b) => a[1].lastAccess - b[1].lastAccess)
  let total = entries.reduce((s, [, e]) => s + e.size, 0)
  for (const [id, e] of entries) {
    if (total <= CAP_BYTES) break
    if (activeWrites.has(id)) continue
    try {
      await unlink(fullPath(id))
      total -= e.size
    } catch {
      // 文件已不在：仅清理登记
    }
    registry.delete(id)
  }
}

/**
 * 磁盘写入会话：同一本书同一时刻只允许一个写入者（多路并发请求共享流、
 * 不重复落盘）。open 返回 null 表示已有活跃写入，调用方走纯流式路径。
 */
export class WriteSession {
  private constructor(
    private readonly id: string,
    private ws: WriteStream | null,
  ) {
    activeWrites.add(id)
  }

  static async open(id: string): Promise<WriteSession | null> {
    await readyOnce()
    if (activeWrites.has(id)) return null
    try {
      await unlink(partPath(id))
    } catch {
      // 无残留 .part
    }
    const ws = createWriteStream(partPath(id))
    ws.on("error", () => {})
    return new WriteSession(id, ws)
  }

  async write(chunk: Uint8Array): Promise<void> {
    if (!this.ws) return
    await new Promise<void>((resolve, reject) => {
      this.ws!.write(chunk, (err) => (err ? reject(err) : resolve()))
    })
  }

  async finalize(): Promise<void> {
    const ws = this.ws
    this.ws = null
    if (!ws) return
    await new Promise<void>((resolve) => ws.end(() => resolve()))
    try {
      await rename(partPath(this.id), fullPath(this.id))
      const st = await stat(fullPath(this.id))
      registry.set(this.id, { size: st.size, lastAccess: Date.now() })
      await evict()
    } catch {
      // rename 失败等：缓存缺失可接受，在线路径不受影响
    } finally {
      activeWrites.delete(this.id)
    }
  }

  async discard(): Promise<void> {
    const ws = this.ws
    this.ws = null
    try {
      ws?.destroy()
    } catch {
      // 已销毁
    }
    try {
      await unlink(partPath(this.id))
    } catch {
      // 无文件
    }
    activeWrites.delete(this.id)
  }
}

/**
 * 按本地文件服务 Range/全量请求（206/200）。
 * base 由调用方给好 Content-Type 等头，这里补齐长度相关头与状态码。
 */
export async function serveFileRange(
  p: string,
  range: string | null,
  base: Record<string, string>,
): Promise<Response> {
  const st = await stat(p)
  const total = st.size
  const headers = new Headers(base)
  headers.set("Accept-Ranges", "bytes")

  const m = range ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null
  if (!m) {
    headers.set("Content-Length", String(total))
    headers.set("ETag", `"tb-${path.basename(p, ".pdf")}"`)
    return new Response(Readable.toWeb(createReadStream(p)) as ReadableStream<Uint8Array>, {
      status: 200,
      headers,
    })
  }

  let start = m[1] === "" ? NaN : parseInt(m[1], 10)
  let end = m[2] === "" ? NaN : parseInt(m[2], 10)
  if (Number.isNaN(start)) {
    // 后缀语义 bytes=-N：最后 N 字节
    const n = Number.isNaN(end) ? 0 : end
    start = Math.max(0, total - n)
    end = total - 1
  } else {
    end = Number.isNaN(end) ? total - 1 : Math.min(end, total - 1)
  }
  if (start >= total || start > end) {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${total}` },
    })
  }
  headers.set("Content-Range", `bytes ${start}-${end}/${total}`)
  headers.set("Content-Length", String(end - start + 1))
  headers.set("ETag", `"tb-${path.basename(p, ".pdf")}"`)
  const stream = Readable.toWeb(
    createReadStream(p, { start, end }),
  ) as ReadableStream<Uint8Array>
  return new Response(stream, { status: 206, headers })
}

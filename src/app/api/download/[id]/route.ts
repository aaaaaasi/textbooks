import { fetchWithHeaderTimeout, resolvePdf, UPSTREAM_HEADERS, safeFilename } from "@/lib/smartedu"
import { getPdfPath, isWriteActive, serveFileRange, WriteSession } from "@/lib/pdf-cache"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * 教材 PDF 下载/预览代理（三级降级，杜绝"卡死 0%"）：
 *
 * ① 本地磁盘缓存命中 → 直接从盘服务（含 Range 206），毫秒级，零上游依赖；
 * ② 整本请求（无 Range）→ 先用 bytes=0-0 探测上游是否支持 Range 与总大小，
 *    支持则走并行分块管线：6 路并发 × 4MB 有序下发（实测 ~3 倍于单流速度），
 *    同时写盘缓存（写盘失败不影响下发），任一分块失败自动换镜像重试；
 * ③ 客户端带 Range（pdf.js 补块/翻页）或上游不支持 Range → 单流透传，
 *    响应头 12s 超时防止上游挂起导致无限等待（旧版卡死根因），正文不限速。
 *
 * 所有上游请求均带超时与镜像轮换（r1/r2/r3）；客户端断开立即中止全部上游请求。
 */

const CHUNK_SIZE = 4 * 1024 * 1024
const PIPELINE_CONCURRENCY = 6
const CHUNK_TIMEOUT_MS = 25_000 // 单分块整体超时（4MB @ ≥160KB/s）
const HEADER_TIMEOUT_MS = 12_000 // 只约束"等到响应头"，收到头后正文不限时

function dispositionFor(inline: boolean, id: string, name: string): string {
  const filename = `${safeFilename(name)}.pdf`
  return `${inline ? "inline" : "attachment"}; filename="textbook-${id.slice(0, 8)}.pdf"; filename*=UTF-8''${encodeURIComponent(filename)}`
}

function baseHeaders(id: string, inline: boolean, name: string): Record<string, string> {
  return {
    "Content-Type": "application/pdf",
    "Accept-Ranges": "bytes",
    ETag: `"tb-${id}"`,
    // 告知反代/网关不要缓冲本响应，保证流式渐进下发
    "X-Accel-Buffering": "no",
    "Content-Disposition": dispositionFor(inline, id, name),
    "Cache-Control": "public, max-age=86400",
  }
}

/** bytes=0-0 探测：返回上游总大小（仅当上游确实支持 Range）。 */
async function probeTotalSize(
  urls: string[],
  signal: AbortSignal,
): Promise<number | null> {
  for (const url of urls) {
    try {
      const res = await fetchWithHeaderTimeout(
        url,
        { headers: { ...UPSTREAM_HEADERS, Range: "bytes=0-0" }, cache: "no-store" },
        HEADER_TIMEOUT_MS,
        signal,
      )
      const cr = res.headers.get("content-range")
      res.body?.cancel()
      if (res.status === 206 && cr) {
        const total = Number(cr.split("/")[1])
        if (Number.isFinite(total) && total > 0) return total
      }
    } catch {
      // 换下一个镜像
    }
  }
  return null
}

/** 拉取一个分块：逐镜像重试，206 + Content-Range 双重校验，防止错块污染。
 *  全部镜像失败后再整轮重试一轮（含退避），只有 CDN 持续不可用才抛错断流。 */
async function fetchChunk(
  urls: string[],
  start: number,
  end: number,
  signal: AbortSignal,
): Promise<Uint8Array> {
  let lastErr: unknown = new Error("no attempt")
  const rounds = 2
  for (let attempt = 0; attempt < urls.length * rounds; attempt++) {
    // 进入第二轮前稍作退避，避开镜像瞬时抖动
    if (attempt > 0 && attempt % urls.length === 0) {
      await new Promise((r) => setTimeout(r, 300))
    }
    const url = urls[attempt % urls.length]
    try {
      const res = await fetch(url, {
        headers: { ...UPSTREAM_HEADERS, Range: `bytes=${start}-${end}` },
        cache: "no-store",
        signal: AbortSignal.any([signal, AbortSignal.timeout(CHUNK_TIMEOUT_MS)]),
      })
      const cr = res.headers.get("content-range")
      if (res.status !== 206 || !cr || !cr.startsWith(`bytes ${start}-`)) {
        res.body?.cancel()
        lastErr = new Error(`镜像 ${new URL(url).hostname} 返回异常 ${res.status}`)
        continue
      }
      const buf = new Uint8Array(await res.arrayBuffer())
      if (buf.byteLength !== end - start + 1) {
        lastErr = new Error(`分块长度不匹配 ${buf.byteLength} != ${end - start + 1}`)
        continue
      }
      return buf
    } catch (e) {
      lastErr = e
      if (signal.aborted) throw e
    }
  }
  throw lastErr
}

/**
 * 并行分块有序下发管线（pull 模式，天然背压）：
 * 内存中最多存在 CONCURRENCY 个分块（约 24MB），按序 enqueue。
 */
function parallelPipeline(
  urls: string[],
  total: number,
  opts: { signal: AbortSignal; onChunk?: (c: Uint8Array) => Promise<void>; onDone?: () => void; onError?: (e: unknown) => void },
): ReadableStream<Uint8Array> {
  const count = Math.ceil(total / CHUNK_SIZE)
  let nextToStart = 0
  let nextToEmit = 0
  const inflight = new Map<number, Promise<Uint8Array>>()

  const startChunk = (i: number) => {
    const start = i * CHUNK_SIZE
    const end = Math.min(total, (i + 1) * CHUNK_SIZE) - 1
    const p = fetchChunk(urls, start, end, opts.signal)
    p.catch(() => {}) // 标记已处理，避免 Node unhandledRejection；真正错误在 pull 中等待处接管
    inflight.set(i, p)
  }

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (nextToEmit >= count) {
        controller.close()
        opts.onDone?.()
        return
      }
      while (inflight.size < PIPELINE_CONCURRENCY && nextToStart < count) startChunk(nextToStart++)
      try {
        const pending = inflight.get(nextToEmit)
        if (!pending) throw new Error("分块状态丢失")
        const data = await pending
        inflight.delete(nextToEmit)
        // 写盘失败不应影响下发
        await opts.onChunk?.(data).catch(() => {})
        controller.enqueue(data)
        nextToEmit++
      } catch (e) {
        inflight.delete(nextToEmit)
        opts.onError?.(e)
        controller.error(e)
      }
    },
    cancel() {
      // 客户端断开：request.signal 已 abort，全部在途 fetch 随之取消；丢弃半成品
      opts.onError?.(new Error("客户端断开"))
    },
  })
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{16,64}$/i.test(id)) {
    return Response.json({ error: "invalid id" }, { status: 400 })
  }

  const inline = new URL(req.url).searchParams.get("inline") === "1"
  const range = req.headers.get("range")
  const signal = req.signal

  const pdf = await resolvePdf(id)
  if (!pdf) {
    return Response.json({ error: "resource not found" }, { status: 404 })
  }
  const base = baseHeaders(id, inline, pdf.name)

  // ① 磁盘缓存命中：本地服务（自动支持 Range），毫秒级
  const cached = await getPdfPath(id)
  if (cached) {
    return serveFileRange(cached, range, base)
  }

  // ②+③ 见下方分流
  const upstreamSingleStream = async (writeSession: WriteSession | null): Promise<Response> => {
    for (const url of pdf.urls) {
      let upstream: Response | null = null
      try {
        const headers: Record<string, string> = { ...UPSTREAM_HEADERS }
        if (range) headers.Range = range
        upstream = await fetchWithHeaderTimeout(
          url,
          { headers, cache: "no-store" },
          HEADER_TIMEOUT_MS,
          signal,
        )
        if (!((upstream.ok || upstream.status === 206) && upstream.body)) {
          upstream = null
        }
      } catch {
        upstream = null
      }
      if (!upstream?.body) continue

      const status = upstream.status === 206 ? 206 : 200
      const headers = new Headers(base)
      if (status === 206) {
        const cr = upstream.headers.get("content-range")
        if (cr) headers.set("Content-Range", cr)
      }
      const len = upstream.headers.get("content-length")
      if (len) headers.set("Content-Length", len)

      const reader = upstream.body.getReader()
      let settled = false
      const finish = (ok: boolean) => {
        if (settled) return
        settled = true
        const p = ok ? writeSession?.finalize() : writeSession?.discard()
        p?.catch(() => {})
      }
      if (signal.aborted) finish(false)

      const stream = new ReadableStream<Uint8Array>({
        async pull(controller) {
          try {
            const { done, value } = await reader.read()
            if (done) {
              finish(true)
              controller.close()
              return
            }
            if (writeSession) await writeSession.write(value).catch(() => {})
            controller.enqueue(value)
          } catch (e) {
            finish(false)
            controller.error(e)
          }
        },
        cancel() {
          finish(false)
          reader.cancel().catch(() => {})
        },
      })
      return new Response(stream, { status, headers })
    }
    return Response.json({ error: "all upstream mirrors failed" }, { status: 502 })
  }

  // 客户端带 Range（pdf.js 补块）：透传即可，不写盘
  if (range) {
    return upstreamSingleStream(null)
  }

  // 整本请求：探测 → 并行管线（含写盘缓存）；探测失败或另一请求正在写盘 → 单流兜底
  let total = pdf.size > 0 ? pdf.size : null
  const probed = await probeTotalSize(pdf.urls, signal)
  if (probed) total = probed

  if (total && !isWriteActive(id)) {
    const session = await WriteSession.open(id)
    if (session) {
      const stream = parallelPipeline(pdf.urls, total, {
        signal,
        onChunk: (c) => session.write(c),
        onDone: () => session.finalize().catch(() => {}),
        onError: () => session.discard().catch(() => {}),
      })
      const headers = new Headers(base)
      headers.set("Content-Length", String(total))
      return new Response(stream, { status: 200, headers })
    }
  }

  // ④ 单流透传兜底（顺手写盘，能写多少算多少）
  const session = isWriteActive(id) ? null : await WriteSession.open(id)
  return upstreamSingleStream(session)
}

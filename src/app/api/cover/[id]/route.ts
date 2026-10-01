import { mkdir, readFile, writeFile } from "fs/promises"
import path from "path"
import {
  fetchDetails,
  isAllowedUpstream,
  mirrorVariants,
  pickCover,
  UPSTREAM_HEADERS,
  fetchWithHeaderTimeout,
} from "@/lib/smartedu"

export const dynamic = "force-dynamic"

/**
 * 课本封面代理 + 磁盘缓存：
 * 首次请求回源（仅限 *.ykt.cbern.com.cn，r1/r2/r3 轮换 + 12s 头超时）并写入
 * data/covers/{id}.{jpg|png}，之后直接读本地文件返回。
 *
 * 稳定性设计：
 * - 全量缓冲后返回并显式携带 Content-Length，避免反代 chunked 半包
 *   （ERR_INCOMPLETE_CHUNKED_ENCODING）；
 * - 平台本就没有封面的教材不再回 404 打爆控制台，而是返回一张内联 SVG
 *   占位图（HTTP 200），并做 10 分钟内存负缓存，避免反复回源 details；
 * - details 回源失败（瞬时抖动）返回占位图但 no-store，下次访问自动重试。
 */
const COVER_DIR = path.join(process.cwd(), "data", "covers")

const CACHE_HEADERS: Record<string, string> = {
  "Cache-Control": "public, max-age=31536000, immutable",
}

async function serveCached(id: string): Promise<Response | null> {
  for (const [ext, type] of [
    ["jpg", "image/jpeg"],
    ["png", "image/png"],
  ] as const) {
    try {
      // 注意：路径必须保持运行时拼接（不要写回 path.join(COVER_DIR, `${id}.${ext}`)）。
      // 静态可推断的动态文件模式会让 Turbopack 构建期把整个 data/covers 目录
      // （74MB/2594 个文件）追踪进 standalone 部署包，直接拖垮平台部署。
      const seg = id + "." + ext
      const file = [COVER_DIR, seg].join("/")
      const buf = await readFile(file)
      return new Response(new Uint8Array(buf), {
        headers: { "Content-Type": type, "Content-Length": String(buf.byteLength), ...CACHE_HEADERS },
      })
    } catch {
      // 该扩展名不存在，继续
    }
  }
  return null
}

/** 平台无封面的教材 id 负缓存（10 分钟），避免重复回源 details。 */
const noCoverIds = new Map<string, number>()
const NO_COVER_TTL = 10 * 60 * 1000

/** 内联 SVG 占位封面：与站点灰阶风格一致，避免 <img> 404 报错与破图。 */
function placeholderResponse(cacheable: boolean): Response {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="150" height="212" viewBox="0 0 150 212"><rect width="150" height="212" rx="6" fill="#f4f4f5"/><rect x="14" y="14" width="122" height="184" rx="4" fill="#fafafa" stroke="#e4e4e7"/><path d="M52 68h46M52 84h46M52 100h30" stroke="#d4d4d8" stroke-width="5" stroke-linecap="round"/><text x="75" y="150" text-anchor="middle" font-family="system-ui, sans-serif" font-size="13" fill="#a1a1aa">暂无封面</text></svg>`
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Content-Length": String(Buffer.byteLength(svg)),
      "Cache-Control": cacheable ? "public, max-age=86400" : "no-store",
    },
  })
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{16,64}$/i.test(id)) {
    return Response.json({ error: "invalid id" }, { status: 400 })
  }

  const cached = await serveCached(id)
  if (cached) return cached

  const negHit = noCoverIds.get(id)
  if (negHit && Date.now() - negHit < NO_COVER_TTL) {
    return placeholderResponse(true)
  }

  const details = await fetchDetails(id)
  if (!details) {
    // 瞬时上游故障：占位图兜底但不缓存，下次访问自动重试
    return placeholderResponse(false)
  }

  const cover = pickCover(details)
  if (!cover || !isAllowedUpstream(cover)) {
    noCoverIds.set(id, Date.now())
    return placeholderResponse(true)
  }

  // r1/r2/r3 镜像轮换 + 12s 响应头超时，全量缓冲后再返回
  for (const url of mirrorVariants(cover)) {
    try {
      const res = await fetchWithHeaderTimeout(
        url,
        { headers: UPSTREAM_HEADERS, cache: "no-store" },
        12_000,
        _req.signal,
      )
      if (!res.ok || !res.body) continue
      const type = res.headers.get("content-type") ?? "image/jpeg"
      const ext = type.includes("png") ? "png" : "jpg"
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.byteLength === 0) continue

      await mkdir(COVER_DIR, { recursive: true })
      await writeFile(path.join(COVER_DIR, `${id}.${ext}`), buf)

      return new Response(new Uint8Array(buf), {
        headers: {
          "Content-Type": ext === "png" ? "image/png" : "image/jpeg",
          "Content-Length": String(buf.byteLength),
          ...CACHE_HEADERS,
        },
      })
    } catch {
      // 换下一个镜像
    }
  }
  // 全部镜像失败：瞬时故障，不写负缓存
  return placeholderResponse(false)
}

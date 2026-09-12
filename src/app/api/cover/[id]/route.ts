import { mkdir, readFile, writeFile } from "fs/promises"
import path from "path"
import { fetchDetails, isAllowedUpstream, pickCover, UPSTREAM_HEADERS } from "@/lib/smartedu"

export const dynamic = "force-dynamic"

/**
 * 课本封面代理 + 磁盘缓存：
 * 首次请求回源（仅限 *.ykt.cbern.com.cn）并写入 data/covers/{id}.{jpg|png}，
 * 之后直接读本地文件返回，并携带 immutable 浏览器缓存头。
 * 配合 scripts/warm_covers.py 可全量预热，站点离线目录也能出图。
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
        headers: { "Content-Type": type, ...CACHE_HEADERS },
      })
    } catch {
      // 该扩展名不存在，继续
    }
  }
  return null
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{16,64}$/i.test(id)) {
    return Response.json({ error: "invalid id" }, { status: 400 })
  }

  const cached = await serveCached(id)
  if (cached) return cached

  const details = await fetchDetails(id)
  if (!details) {
    return Response.json({ error: "resource not found" }, { status: 404 })
  }

  const cover = pickCover(details)
  if (!cover || !isAllowedUpstream(cover)) {
    return Response.json({ error: "cover not available" }, { status: 404 })
  }

  try {
    const res = await fetch(cover, { headers: UPSTREAM_HEADERS, cache: "no-store" })
    if (!res.ok || !res.body) {
      return Response.json({ error: `upstream ${res.status}` }, { status: 502 })
    }
    const type = res.headers.get("content-type") ?? "image/jpeg"
    const ext = type.includes("png") ? "png" : "jpg"
    const buf = Buffer.from(await res.arrayBuffer())

    await mkdir(COVER_DIR, { recursive: true })
    await writeFile(path.join(COVER_DIR, `${id}.${ext}`), buf)

    return new Response(new Uint8Array(buf), {
      headers: { "Content-Type": ext === "png" ? "image/png" : "image/jpeg", ...CACHE_HEADERS },
    })
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "fetch failed" },
      { status: 502 },
    )
  }
}

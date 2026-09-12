import { isAllowedUpstream, UPSTREAM_HEADERS } from "@/lib/smartedu"

export const dynamic = "force-dynamic"

/**
 * 平台 CDN 资源代理（仅限 *.ykt.cbern.com.cn）：
 * 用于封面缩略图、教材配套音频等资源的展示与下载。
 * ?dl=1&name=xxx 以附件形式下载。
 */
export async function GET(req: Request) {
  const target = new URL(req.url).searchParams.get("url")
  if (!target || !isAllowedUpstream(target)) {
    return Response.json({ error: "blocked" }, { status: 400 })
  }

  const dl = new URL(req.url).searchParams.get("dl") === "1"
  const name = new URL(req.url).searchParams.get("name") ?? "resource"

  let upstream: Response
  try {
    upstream = await fetch(target, { headers: UPSTREAM_HEADERS, cache: "no-store" })
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "fetch failed" }, { status: 502 })
  }
  if (!upstream.ok || !upstream.body) {
    return Response.json({ error: `upstream ${upstream.status}` }, { status: 502 })
  }

  const headers = new Headers()
  headers.set("Content-Type", upstream.headers.get("content-type") ?? "application/octet-stream")
  const len = upstream.headers.get("content-length")
  if (len) headers.set("Content-Length", len)
  headers.set("Cache-Control", "public, max-age=86400")
  if (dl) {
    headers.set(
      "Content-Disposition",
      `attachment; filename="resource"; filename*=UTF-8''${encodeURIComponent(name)}`,
    )
  }

  return new Response(upstream.body, { status: 200, headers })
}

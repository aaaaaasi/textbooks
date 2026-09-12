import { getCatalog } from "@/lib/catalog"

// 必须动态：月度自动更新重写 catalog.json 后，接口要能立即返回新目录，
// force-static 会在构建期固化数据导致运行时永不更新。
export const dynamic = "force-dynamic"

export async function GET() {
  const catalog = await getCatalog()
  return Response.json(catalog, {
    headers: { "Cache-Control": "public, max-age=600" },
  })
}

import { fetchAudios, fetchDetails, pickCover, pickPdfCandidates } from "@/lib/smartedu"
import { getCatalog, resTypeOf, type BookRecord } from "@/lib/catalog"

export const dynamic = "force-dynamic"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{16,64}$/i.test(id)) {
    return Response.json({ error: "invalid id" }, { status: 400 })
  }

  // 目录条目：用于无 details 权限资源的兜底（教师用书/课件/专题课），以及补充类型/幻灯片信息
  let rec: BookRecord | undefined
  try {
    rec = (await getCatalog()).books.find((b) => b.id === id)
  } catch {
    rec = undefined
  }

  const details = await fetchDetails(id)
  if (!details) {
    if (rec) {
      // 教师用书/课件等：上游 details 403，用目录条目兜底（阅读走幻灯片）
      return Response.json(
        {
          id: rec.id,
          title: rec.title,
          cover: rec.thumb ?? null,
          pdfUrl: null,
          size: 0,
          audios: [],
          resType: resTypeOf(rec),
          slidesBase: rec.slides ?? null,
          slideCount: rec.slide_count ?? 0,
        },
        { headers: { "Cache-Control": "public, max-age=300" } },
      )
    }
    return Response.json({ error: "resource not found" }, { status: 404 })
  }

  const pdf = pickPdfCandidates(details)
  const audios = await fetchAudios(id)

  return Response.json(
    {
      id: details.id,
      title: pdf.name || details.title,
      cover: pickCover(details),
      pdfUrl: pdf.urls[0] ?? null,
      size: pdf.size,
      audios,
      resType: rec ? resTypeOf(rec) : "student",
      slidesBase: rec?.slides ?? null,
      slideCount: rec?.slide_count ?? 0,
    },
    { headers: { "Cache-Control": "public, max-age=300" } },
  )
}

import { fetchAudios, fetchDetails, pickCover, pickPdfCandidates } from "@/lib/smartedu"

export const dynamic = "force-dynamic"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{16,64}$/i.test(id)) {
    return Response.json({ error: "invalid id" }, { status: 400 })
  }

  const details = await fetchDetails(id)
  if (!details) {
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
    },
    { headers: { "Cache-Control": "public, max-age=300" } },
  )
}

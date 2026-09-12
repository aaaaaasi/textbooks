"use client"

import { useEffect, useState } from "react"
import { BookOpen, DownloadSimple, FileAudio, WarningCircle } from "@phosphor-icons/react/dist/ssr"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { formatSize } from "@/lib/download-client"

interface BookDetail {
  id: string
  title: string
  cover: string | null
  size: number
  audios: { title: string; url: string }[]
}

interface Props {
  id: string | null
  meta: { stage: string; grade: string; subject: string; version: string; volume: string; revised: boolean } | null
  onClose: () => void
  onDownload: (id: string, name: string) => void
}

export function BookDialog({ id, meta, onClose, onDownload }: Props) {
  const [detail, setDetail] = useState<BookDetail | null>(null)
  const [failed, setFailed] = useState(false)
  const [coverOk, setCoverOk] = useState(true)
  const [prevId, setPrevId] = useState<string | null>(id)

  // 属性变化时在渲染期重置状态（React 推荐模式，避免 effect 级联渲染）
  if (prevId !== id) {
    setPrevId(id)
    setDetail(null)
    setFailed(false)
    setCoverOk(true)
  }

  useEffect(() => {
    if (!id) return
    let alive = true
    fetch(`/api/book/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: BookDetail) => {
        if (alive) setDetail(d)
      })
      .catch(() => {
        if (alive) setFailed(true)
      })
    return () => {
      alive = false
    }
  }, [id])

  const loading = !!id && !detail && !failed

  return (
    <Dialog open={!!id} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto rounded-lg">
        <DialogHeader>
          <DialogTitle className="text-[15px] leading-snug pr-6 font-medium">
            {meta?.revised && (
              <span className="mr-2 inline-block align-middle rounded-[4px] border border-primary/25 bg-primary/10 px-1 py-px text-[10px] font-normal text-primary">
                2022修订
              </span>
            )}
            {detail?.title ?? "教材详情"}
          </DialogTitle>
          <DialogDescription className="sr-only">查看教材详情、封面与配套资源</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex gap-4">
            <Skeleton className="h-44 w-32 shrink-0 rounded-md" />
            <div className="flex-1 space-y-3 pt-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-9 w-full mt-4" />
            </div>
          </div>
        ) : detail ? (
          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="w-32 shrink-0 aspect-[3/4] overflow-hidden rounded-lg border bg-muted flex items-center justify-center shadow-[0_10px_24px_-14px_rgba(41,37,36,0.3)]">
                {coverOk ? (
                  <img
                    src={`/api/cover/${detail.id}`}
                    alt={`${detail.title} 封面`}
                    className="h-full w-full object-cover"
                    onError={() => setCoverOk(false)}
                  />
                ) : (
                  <span className="text-3xl font-medium text-muted-foreground/60">
                    {(detail.title || "教材").slice(0, 1)}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0 space-y-1.5 text-sm">
                {[
                  ["学段", meta?.stage],
                  ["年级", meta?.grade],
                  ["学科", meta?.subject],
                  ["版本", meta?.version],
                  ["册次", meta?.volume],
                  ["文件大小", formatSize(detail.size)],
                ]
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <div key={k as string} className="flex gap-3">
                      <span className="w-16 shrink-0 text-muted-foreground">{k}</span>
                      <span className="truncate">{v}</span>
                    </div>
                  ))}
              </div>
            </div>

            <div className="flex gap-2">
              <Button className="flex-1 rounded-md active:scale-[0.98]" onClick={() => onDownload(detail.id, detail.title)}>
                <DownloadSimple className="mr-1.5 h-4 w-4" aria-hidden />
                下载 PDF
              </Button>
              <Button
                variant="outline"
                className="flex-1 rounded-md bg-card active:scale-[0.98]"
                onClick={() => window.open(`/preview/${detail.id}`, "_blank", "noopener")}
              >
                <BookOpen className="mr-1.5 h-4 w-4" aria-hidden />
                在线阅读
              </Button>
            </div>

            {detail.audios.length > 0 && (
              <div>
                <Separator className="mb-3" />
                <div className="text-sm font-medium mb-2">配套音频（{detail.audios.length}）</div>
                <ScrollArea className="max-h-56">
                  <ul className="space-y-1 pr-3">
                    {detail.audios.map((a, i) => (
                      <li key={i} className="flex items-center gap-2 rounded-md bg-muted/60 px-2.5 py-1.5 text-sm">
                        <FileAudio className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                        <span className="flex-1 truncate" title={a.title}>{a.title}</span>
                        <a
                          href={`/api/proxy?dl=1&name=${encodeURIComponent(a.title.endsWith(".mp3") ? a.title : a.title + ".mp3")}&url=${encodeURIComponent(a.url)}`}
                          className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted"
                          aria-label={`下载 ${a.title}`}
                          title="下载音频"
                        >
                          <DownloadSimple className="h-3.5 w-3.5" aria-hidden />
                        </a>
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <WarningCircle className="h-4 w-4" aria-hidden />
            无法加载详情，请稍后重试
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

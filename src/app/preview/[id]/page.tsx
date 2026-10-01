"use client"

// 教材预览页，三种模式：
// - PDF：默认浏览器原生查看器（iframe，最稳），可切换内置流式阅读器（pdf.js + Range 透传）
// - 图文：教师用书/课件/专题课等无 PDF 资源，用上游 CDN 的逐页幻灯片图片阅读
// - 无内容：上游既无 PDF 也无幻灯片，显示占位说明

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import {
  ArrowLeft,
  ArrowClockwise,
  DownloadSimple,
  Minus,
  Plus,
  FileText,
  Globe,
  Images,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr"
import type { PDFDocumentProxy } from "pdfjs-dist"
import { useLang } from "@/components/textbooks/lang"

interface BookMeta {
  title?: string
  resType?: "student" | "teacher" | "resource" | "thematic"
  slidesBase?: string | null
  slideCount?: number
}

type Mode = "pdf" | "slides" | "none"

export default function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { t } = useLang()
  const [id, setId] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode | null>(null) // null=元数据未就绪
  const [native, setNative] = useState(true) // PDF 模式默认原生预览：至少一定能加载出来
  const [title, setTitle] = useState(t("previewTitle"))
  const [numPages, setNumPages] = useState(0)
  const [page, setPage] = useState(1)
  const [loaded, setLoaded] = useState(0)
  const [total, setTotal] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [renderTick, setRenderTick] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [rendering, setRendering] = useState(false)

  const [loadTick, setLoadTick] = useState(0)

  const docRef = useRef<PDFDocumentProxy | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null)
  const fitScaleRef = useRef(1)

  useEffect(() => {
    params.then((p) => setId(p.id))
  }, [params])

  // 打开文档（Range 渐进：首页就绪即可渲染，其余分块后台续传）
  useEffect(() => {
    if (!id || mode !== "pdf" || native) return
    let cancelled = false
    setError(null)
    setLoaded(0)
    setTotal(0)
    setNumPages(0)
    setPage(1)
    docRef.current = null

    ;(async () => {
      try {
        const pdfjs = await import("pdfjs-dist")
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"
        const task = pdfjs.getDocument({
          url: `/api/download/${id}?inline=1`,
          rangeChunkSize: 262144,
          cMapUrl: "/cmaps/",
          cMapPacked: true,
        })
        task.onProgress = ({ loaded: l, total: t }: { loaded: number; total: number }) => {
          if (!cancelled) {
            setLoaded(l)
            setTotal(t)
          }
        }
        const doc = await task.promise
        if (cancelled) {
          doc.destroy()
          return
        }
        docRef.current = doc
        setNumPages(doc.numPages)
        doc.getPage(1).then((p) => {
          const vp = p.getViewport({ scale: 1 })
          const w = wrapRef.current?.clientWidth ?? 800
          fitScaleRef.current = Math.min(2, Math.max(0.4, (w - 32) / vp.width))
          setRenderTick((t2) => t2 + 1) // 触发首渲染
        })
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "加载失败")
      }
    })()

    return () => {
      cancelled = true
      renderTaskRef.current?.cancel()
      docRef.current?.destroy()
      docRef.current = null
    }
  }, [id, loadTick, native, mode])

  // 渲染当前页（翻页 / 缩放 / 尺寸变化时触发）
  useEffect(() => {
    const doc = docRef.current
    const canvas = canvasRef.current
    if (!doc || !canvas || numPages === 0 || mode !== "pdf" || native) return
    let cancelled = false
    setRendering(true)
    renderTaskRef.current?.cancel()

    ;(async () => {
      try {
        const p = await doc.getPage(page)
        if (cancelled) return
        const scale = fitScaleRef.current * zoom
        const vp = p.getViewport({ scale })
        const dpr = Math.min(2, window.devicePixelRatio || 1)
        canvas.width = Math.floor(vp.width * dpr)
        canvas.height = Math.floor(vp.height * dpr)
        canvas.style.width = `${Math.floor(vp.width)}px`
        canvas.style.height = `${Math.floor(vp.height)}px`
        const ctx = canvas.getContext("2d")
        if (!ctx) return
        const task = p.render({ canvasContext: ctx, viewport: vp, transform: [dpr, 0, 0, dpr, 0, 0] })
        renderTaskRef.current = task
        await task.promise
        if (!cancelled) setRendering(false)
      } catch (e) {
        const name = (e as { name?: string })?.name
        if (!cancelled && name !== "RenderingCancelledException") {
          setRendering(false)
          setError(t("renderFail"))
        } else if (name === "RenderingCancelledException") {
          setRendering(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [page, zoom, renderTick, numPages, native, mode, t])

  // 容器宽度变化时重算 fit 缩放
  useEffect(() => {
    const el = wrapRef.current
    if (!el || typeof ResizeObserver === "undefined") return
    let timer: ReturnType<typeof setTimeout>
    const ro = new ResizeObserver(() => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        const doc = docRef.current
        if (!doc) return
        doc.getPage(page).then((p) => {
          const vp = p.getViewport({ scale: 1 })
          fitScaleRef.current = Math.min(2, Math.max(0.4, (el.clientWidth - 32) / vp.width))
          setRenderTick((t2) => t2 + 1) // 触发重渲染
        })
      }, 150)
    })
    ro.observe(el)
    return () => {
      ro.disconnect()
      clearTimeout(timer)
    }
  }, [page])

  const go = useCallback(
    (n: number) => {
      setPage((cur) => Math.min(numPages || 1, Math.max(1, n)))
      wrapRef.current?.scrollTo({ top: 0 })
    },
    [numPages],
  )

  // 元数据就绪：决定预览模式（幻灯片优先 → 学生教材走 PDF → 其余无内容）
  const handleMeta = useCallback((m: BookMeta) => {
    if (m.title) setTitle(m.title)
    setMode(
      m.slidesBase && (m.slideCount ?? 0) > 0
        ? "slides"
        : m.resType === "student" || !m.resType
          ? "pdf"
          : "none",
    )
  }, [])

  // 键盘翻页（仅 PDF 流式模式）
  useEffect(() => {
    if (mode !== "pdf" || native) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") go(page - 1)
      if (e.key === "ArrowRight") go(page + 1)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [go, page, mode, native])

  const pct = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0
  const loading = mode === "pdf" && numPages === 0 && !error

  return (
    <div className="min-h-[100dvh] flex flex-col bg-muted/50 dark:bg-background">
      {/* 工具栏 */}
      <header className="relative shrink-0 border-b bg-background">
        <div className="h-12 px-3 flex items-center gap-2">
          <Link
            href="/"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted transition-colors"
            aria-label={t("backHome")}
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="flex-1 min-w-0 truncate text-sm font-medium">{title}</h1>

          {mode === "pdf" && (native ? (
            <a
              href={`/api/download/${id ?? ""}?inline=1`}
              target="_blank"
              rel="noreferrer"
              className="hidden sm:inline-flex h-8 items-center rounded-md border px-2.5 text-[13px] text-muted-foreground hover:bg-muted transition-colors"
            >
              {t("openNew")}
            </a>
          ) : (
            <>
              <div className="flex items-center rounded-md border text-[13px] tabular-nums">
                <button
                  className="h-8 w-8 inline-flex items-center justify-center hover:bg-muted rounded-l-md disabled:opacity-40 transition-colors"
                  onClick={() => go(page - 1)}
                  disabled={page <= 1 || !numPages}
                  aria-label={t("prevPage")}
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <input
                  value={page}
                  onChange={(e) => {
                    const n = parseInt(e.target.value, 10)
                    if (Number.isFinite(n)) go(n)
                  }}
                  className="w-10 h-8 text-center bg-transparent outline-none"
                  aria-label={t("pageInput")}
                />
                <span className="pr-2 text-muted-foreground">/ {numPages || "…"}</span>
                <button
                  className="h-8 w-8 inline-flex items-center justify-center hover:bg-muted rounded-r-md disabled:opacity-40 transition-colors"
                  onClick={() => go(page + 1)}
                  disabled={page >= numPages || !numPages}
                  aria-label={t("nextPage")}
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="hidden sm:flex items-center rounded-md border text-[13px]">
                <button
                  className="h-8 w-8 inline-flex items-center justify-center hover:bg-muted rounded-l-md disabled:opacity-40 transition-colors"
                  onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.15).toFixed(2)))}
                  disabled={zoom <= 0.5}
                  aria-label={t("zoomOut")}
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="w-11 text-center tabular-nums text-muted-foreground">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  className="h-8 w-8 inline-flex items-center justify-center hover:bg-muted rounded-r-md disabled:opacity-40 transition-colors"
                  onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.15).toFixed(2)))}
                  disabled={zoom >= 2.5}
                  aria-label={t("zoomIn")}
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            </>
          ))}

          {/* 预览模式切换：仅 PDF 模式提供（原生 / 流式阅读器） */}
          {mode === "pdf" && (
            <button
              onClick={() => setNative((v) => !v)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[13px] text-muted-foreground hover:bg-muted transition-colors"
              title={native ? t("switchToFlow") : t("switchToNative")}
            >
              {native ? <FileText className="h-4 w-4" /> : <Globe className="h-4 w-4" />}
              <span className="hidden sm:inline">{native ? t("flowReader") : t("nativePreview")}</span>
            </button>
          )}

          {/* 图文模式标识 */}
          {mode === "slides" && (
            <span className="inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[13px] text-muted-foreground">
              <Images className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">{t("slidesReader")}</span>
            </span>
          )}

          {/* 下载：仅 PDF 模式提供 */}
          {id && mode === "pdf" && (
            <a
              href={`/api/download/${id}`}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground hover:opacity-90 active:scale-[0.98] transition-all"
            >
              <DownloadSimple className="h-4 w-4" />
              <span className="hidden sm:inline">{t("download")}</span>
            </a>
          )}
        </div>

        {/* 加载进度：字节级，首页可渲染后依然显示直到完成（仅流式阅读器） */}
        {mode === "pdf" && !native && total > 0 && pct < 100 && (
          <div
            className="absolute bottom-0 left-0 h-[2px] bg-primary transition-all duration-300"
            style={{ width: `${pct}%` }}
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        )}
      </header>

      {/* 阅读区 */}
      {mode === "pdf" ? (
        native ? (
          id && (
            <iframe
              key={id}
              src={`/api/download/${id}?inline=1`}
              title={t("nativeFrameTitle")}
              className="flex-1 w-full bg-background"
            />
          )
        ) : (
          <div ref={wrapRef} className="flex-1 overflow-auto">
            <div className="mx-auto w-fit px-4 py-6">
              {error ? (
                <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
                  <p>{t("loadFail", { msg: error })}</p>
                  <button
                    onClick={() => {
                      setError(null)
                      setRenderTick((t2) => t2 + 1)
                      // 重置文档：先清空再重建，触发完整重新加载
                      docRef.current?.destroy()
                      docRef.current = null
                      setNumPages(0)
                      setLoadTick((t2) => t2 + 1)
                    }}
                    className="inline-flex items-center gap-1.5 rounded-md border px-3 h-8 hover:bg-muted transition-colors"
                  >
                    <ArrowClockwise className="h-4 w-4" />
                    {t("retry")}
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <canvas
                    ref={canvasRef}
                    className="block rounded-sm bg-white shadow-[0_18px_44px_-20px_rgba(41,37,36,0.45)]"
                  />
                  {(loading || rendering) && (
                    <div className="absolute inset-0 flex items-center justify-center" aria-hidden>
                      <div className="rounded-md bg-background/90 border px-3 py-1.5 text-xs text-muted-foreground">
                        {loading ? t("loadingPct", { n: pct }) : t("rendering")}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )
      ) : mode === "slides" ? (
        <SlidesReader id={id} />
      ) : mode === "none" ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-sm text-muted-foreground px-4 text-center">
          <WarningCircle className="h-6 w-6" aria-hidden />
          <p>{t("noPreview")}</p>
        </div>
      ) : (
        <div className="flex-1" />
      )}

      {/* 标题与模式元数据：从 /api/book 拉取 */}
      <MetaSync id={id} onMeta={handleMeta} />
    </div>
  )
}

/** 逐页幻灯片阅读：上游 CDN 公开图片，直连失败自动换 /api/proxy 代理 */
function SlidesReader({ id }: { id: string | null }) {
  const { t } = useLang()
  const [meta, setMeta] = useState<{ base: string; count: number } | null>(null)
  const [maxUsable, setMaxUsable] = useState<number>(Number.MAX_SAFE_INTEGER)
  const [firstReady, setFirstReady] = useState(false)
  const [prevId, setPrevId] = useState<string | null>(id)

  // 换书时在渲染期重置状态（避免 effect 级联渲染）
  if (prevId !== id) {
    setPrevId(id)
    setMeta(null)
    setFirstReady(false)
    setMaxUsable(Number.MAX_SAFE_INTEGER)
  }

  useEffect(() => {
    if (!id) return
    let alive = true
    fetch(`/api/book/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: BookMeta) => {
        if (alive && d.slidesBase && (d.slideCount ?? 0) > 0) {
          setMeta({ base: d.slidesBase, count: Math.min(d.slideCount ?? 0, 200) })
        }
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [id])

  if (!meta) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-full max-w-3xl px-4 space-y-3">
          <div className="aspect-video rounded-md bg-muted animate-pulse" />
        </div>
      </div>
    )
  }

  const count = Math.min(meta.count, maxUsable)
  if (count < 1) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-sm text-muted-foreground px-4 text-center">
        <WarningCircle className="h-6 w-6" aria-hidden />
        <p>{t("noPreview")}</p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto w-fit max-w-full px-4 py-6 space-y-4">
        {Array.from({ length: count }, (_, i) => i + 1).map((n) => (
          <SlideImg
            key={n}
            n={n}
            base={meta.base}
            total={meta.count}
            onFirstReady={() => setFirstReady(true)}
            onBroken={() => setMaxUsable((m) => Math.min(m, n - 1))}
            showSkeleton={n === 1 && !firstReady}
          />
        ))}
        {count < meta.count && (
          <p className="text-center text-xs text-muted-foreground pb-4">{t("slideOf", { cur: count, total: meta.count })}</p>
        )}
      </div>
      {!firstReady && count > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-md bg-background/90 border px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
          {t("loading")}…
        </div>
      )}
    </div>
  )
}

function SlideImg({
  n,
  base,
  total,
  onFirstReady,
  onBroken,
  showSkeleton,
}: {
  n: number
  base: string
  total: number
  onFirstReady: () => void
  onBroken: () => void
  showSkeleton: boolean
}) {
  const { t } = useLang()
  const [step, setStep] = useState(0) // 0=直连 CDN，1=走本站代理，2=彻底失败
  const src =
    step === 0
      ? `https://r1-ndr.ykt.cbern.com.cn/${base}/${n}.jpg`
      : `/api/proxy?url=${encodeURIComponent(`https://r1-ndr.ykt.cbern.com.cn/${base}/${n}.jpg`)}`

  if (step === 2) return null

  return (
    <div className="relative">
      {showSkeleton && <div className="absolute inset-0 rounded-md bg-muted animate-pulse" aria-hidden />}
      {/* 上游 CDN 有 Referer 热链保护：必须 no-referrer 直连（403 时自动换本站代理兜底） */}
      <img
        src={src}
        alt={t("slideOf", { cur: n, total })}
        loading={n <= 2 ? "eager" : "lazy"}
        referrerPolicy="no-referrer"
        onLoad={n === 1 ? onFirstReady : undefined}
        onError={() => (step === 0 ? setStep(1) : onBroken())}
        className="block w-full max-w-3xl rounded-sm bg-white shadow-[0_18px_44px_-20px_rgba(41,37,36,0.45)]"
      />
      <span className="absolute top-2 right-2 rounded bg-background/85 border px-1.5 text-[10px] tabular-nums text-muted-foreground">
        {n}/{total}
      </span>
    </div>
  )
}

/** 拉取标题与资源形态，决定预览模式 */
function MetaSync({ id, onMeta }: { id: string | null; onMeta: (m: BookMeta) => void }) {
  useEffect(() => {
    if (!id) return
    let alive = true
    fetch(`/api/book/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: BookMeta) => {
        if (alive) onMeta(d)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [id, onMeta])
  return null
}

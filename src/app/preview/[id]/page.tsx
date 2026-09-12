"use client"

// 教材预览页：默认走浏览器原生 PDF 查看器（iframe，最稳，天然渐进加载），
// 可一键切换到内置流式阅读器（pdf.js + /api/download Range 透传，带字节级进度条）。
// 两种模式共用同一代理端点，命中磁盘缓存时均为毫秒级打开。

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
} from "@phosphor-icons/react/dist/ssr"
import type { PDFDocumentProxy } from "pdfjs-dist"

export default function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState<string | null>(null)
  const [native, setNative] = useState(true) // 默认原生预览：至少一定能加载出来
  const [title, setTitle] = useState("教材预览")
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
    if (!id || native) return
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
          setRenderTick((t) => t + 1) // 触发首渲染
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
  }, [id, loadTick, native])

  // 渲染当前页（翻页 / 缩放 / 尺寸变化时触发）
  useEffect(() => {
    const doc = docRef.current
    const canvas = canvasRef.current
    if (!doc || !canvas || numPages === 0 || native) return
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
          setError("页面渲染失败，请重试")
        } else if (name === "RenderingCancelledException") {
          setRendering(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [page, zoom, renderTick, numPages, native])

  // 容器宽度变化时重算 fit 缩放
  useEffect(() => {
    const el = wrapRef.current
    if (!el || typeof ResizeObserver === "undefined") return
    let t: ReturnType<typeof setTimeout>
    const ro = new ResizeObserver(() => {
      clearTimeout(t)
      t = setTimeout(() => {
        const doc = docRef.current
        if (!doc) return
        doc.getPage(page).then((p) => {
          const vp = p.getViewport({ scale: 1 })
          fitScaleRef.current = Math.min(2, Math.max(0.4, (el.clientWidth - 32) / vp.width))
          setRenderTick((t) => t + 1) // 触发重渲染
        })
      }, 150)
    })
    ro.observe(el)
    return () => {
      ro.disconnect()
      clearTimeout(t)
    }
  }, [page])

  const go = useCallback(
    (n: number) => {
      setPage((cur) => Math.min(numPages || 1, Math.max(1, n)))
      wrapRef.current?.scrollTo({ top: 0 })
    },
    [numPages],
  )

  // 键盘翻页
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") go(page - 1)
      if (e.key === "ArrowRight") go(page + 1)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [go, page])

  const pct = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0
  const loading = numPages === 0 && !error

  return (
    <div className="min-h-[100dvh] flex flex-col bg-muted/50 dark:bg-background">
      {/* 工具栏 */}
      <header className="relative shrink-0 border-b bg-background">
        <div className="h-12 px-3 flex items-center gap-2">
          <Link
            href="/"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted transition-colors"
            aria-label="返回教材库"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="flex-1 min-w-0 truncate text-sm font-medium">{title}</h1>

          {native ? (
            <a
              href={`/api/download/${id ?? ""}?inline=1`}
              target="_blank"
              rel="noreferrer"
              className="hidden sm:inline-flex h-8 items-center rounded-md border px-2.5 text-[13px] text-muted-foreground hover:bg-muted transition-colors"
            >
              新窗口打开
            </a>
          ) : (
            <>
              <div className="flex items-center rounded-md border text-[13px] tabular-nums">
                <button
                  className="h-8 w-8 inline-flex items-center justify-center hover:bg-muted rounded-l-md disabled:opacity-40 transition-colors"
                  onClick={() => go(page - 1)}
                  disabled={page <= 1 || !numPages}
                  aria-label="上一页"
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
                  aria-label="当前页码"
                />
                <span className="pr-2 text-muted-foreground">/ {numPages || "…"}</span>
                <button
                  className="h-8 w-8 inline-flex items-center justify-center hover:bg-muted rounded-r-md disabled:opacity-40 transition-colors"
                  onClick={() => go(page + 1)}
                  disabled={page >= numPages || !numPages}
                  aria-label="下一页"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="hidden sm:flex items-center rounded-md border text-[13px]">
                <button
                  className="h-8 w-8 inline-flex items-center justify-center hover:bg-muted rounded-l-md disabled:opacity-40 transition-colors"
                  onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.15).toFixed(2)))}
                  disabled={zoom <= 0.5}
                  aria-label="缩小"
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
                  aria-label="放大"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            </>
          )}

          {/* 预览模式切换：原生 / 流式阅读器 */}
          <button
            onClick={() => setNative((v) => !v)}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[13px] text-muted-foreground hover:bg-muted transition-colors"
            title={native ? "切换到流式阅读器（带加载进度与缩放）" : "切换到浏览器原生预览"}
          >
            {native ? <FileText className="h-4 w-4" /> : <Globe className="h-4 w-4" />}
            <span className="hidden sm:inline">{native ? "流式阅读器" : "原生预览"}</span>
          </button>

          {id && (
            <a
              href={`/api/download/${id}`}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground hover:opacity-90 active:scale-[0.98] transition-all"
            >
              <DownloadSimple className="h-4 w-4" />
              <span className="hidden sm:inline">下载</span>
            </a>
          )}
        </div>

        {/* 加载进度：字节级，首页可渲染后依然显示直到完成（仅流式阅读器） */}
        {!native && total > 0 && pct < 100 && (
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
      {native ? (
        id && (
          <iframe
            key={id}
            src={`/api/download/${id}?inline=1`}
            title="教材原生预览"
            className="flex-1 w-full bg-background"
          />
        )
      ) : (
        <div ref={wrapRef} className="flex-1 overflow-auto">
          <div className="mx-auto w-fit px-4 py-6">
            {error ? (
              <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
                <p>加载失败：{error}</p>
                <button
                  onClick={() => {
                    setError(null)
                    setRenderTick((t) => t + 1)
                    // 重置文档：先清空再重建，触发完整重新加载
                    docRef.current?.destroy()
                    docRef.current = null
                    setNumPages(0)
                    setLoadTick((t) => t + 1)
                  }}
                  className="inline-flex items-center gap-1.5 rounded-md border px-3 h-8 hover:bg-muted transition-colors"
                >
                  <ArrowClockwise className="h-4 w-4" />
                  重试
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
                      {loading ? `加载中 ${pct}%` : "渲染中"}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 标题与字节进度同步：首屏占位时从 /api/book 拉标题 */}
      <TitleSync id={id} onTitle={setTitle} />
    </div>
  )
}

function TitleSync({ id, onTitle }: { id: string | null; onTitle: (t: string) => void }) {
  useEffect(() => {
    if (!id) return
    let alive = true
    fetch(`/api/book/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { title?: string }) => {
        if (alive && d.title) onTitle(d.title)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [id, onTitle])
  return null
}

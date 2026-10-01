"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowsCounterClockwise,
  BookOpen,
  DownloadSimple,
  MagnifyingGlass,
} from "@phosphor-icons/react/dist/ssr"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { BookDialog } from "@/components/textbooks/book-dialog"
import { DownloadTray } from "@/components/textbooks/download-tray"
import { LangToggle, useLang } from "@/components/textbooks/lang"
import { useDownloadStore } from "@/lib/download-store"
import { cancelDownload, registerController, streamDownload, unregisterController } from "@/lib/download-client"
import { resTypeOf, type ResType } from "@/lib/res-type"
import type { BookRecord, CatalogFile } from "@/lib/catalog"
import {
  expandQuery,
  labelGrade,
  labelSubject,
  STAGE_KEY,
  tokenHits,
  TYPE_KEY,
} from "@/lib/i18n"

const STAGE_TABS = ["全部", "小学", "初中", "高中", "特殊教育"] as const
const STAGE_RANK: Record<string, number> = { 小学: 1, 初中: 2, 高中: 3, 特殊教育: 4 }
const GRADE_RANK: string[] = [
  "一年级", "二年级", "三年级", "四年级", "五年级", "六年级",
  "七年级", "八年级", "九年级",
  "高一", "高二", "高三",
]
const TYPE_VALUES: ResType[] = ["student", "teacher", "resource", "thematic"]
const PAGE_STEP = 60

function gradeRank(g: string): number {
  const i = GRADE_RANK.indexOf(g)
  return i === -1 ? 50 : i
}

function stageTabMatch(stageField: string, tab: string): boolean {
  if (tab === "全部") return true
  if (tab === "特殊教育") return stageField === "特殊教育"
  return stageField.startsWith(tab)
}

function cleanTitle(t: string): string {
  return t
    .replace(/^（根据2022年版课程标准修订）/, "")
    .replace(/^义务教育教科书\s*[·•]?\s*/, "")
    .trim() || t
}

function matchStage(stageField: string): number {
  return STAGE_RANK[stageField] ?? 9
}

function uniqSorted(arr: string[], rank?: (s: string) => number): string[] {
  return Array.from(new Set(arr.filter(Boolean))).sort((a, b) =>
    rank ? rank(a) - rank(b) : a.localeCompare(b, "zh"),
  )
}

/** 封面图：走磁盘缓存路由，加载失败退化为标题字占位 */
function Cover({ id, title }: { id: string; title: string }) {
  const { t } = useLang()
  const [ok, setOk] = useState(true)
  if (!ok) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-muted">
        <span className="text-2xl font-medium text-muted-foreground/70">{cleanTitle(title).slice(0, 1)}</span>
      </div>
    )
  }
  return (
    <img
      src={`/api/cover/${id}`}
      alt={t("coverOf", { title: cleanTitle(title) })}
      loading="lazy"
      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
      onError={() => setOk(false)}
    />
  )
}

export default function Home() {
  const { lang, t } = useLang()
  const [catalog, setCatalog] = useState<CatalogFile | null>(null)
  const [loadErr, setLoadErr] = useState(false)

  const [query, setQuery] = useState("")
  const [stage, setStage] = useState<string>("全部")
  const [type, setType] = useState<string>("all")
  const [subject, setSubject] = useState("all")
  const [grade, setGrade] = useState("all")
  const [volume, setVolume] = useState("all")
  const [version, setVersion] = useState("all")
  const [revisedOnly, setRevisedOnly] = useState(false)
  const [visible, setVisible] = useState(PAGE_STEP)
  const [selected, setSelected] = useState<BookRecord | null>(null)

  const tasks = useDownloadStore((s) => s.tasks)
  const controllers = useRef(new Map<string, AbortController>())

  useEffect(() => {
    let alive = true
    fetch("/api/catalog")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: CatalogFile) => alive && setCatalog(d))
      .catch(() => alive && setLoadErr(true))
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    setVisible(PAGE_STEP)
  }, [query, subject, grade, volume, version, revisedOnly, stage, type])

  const books = catalog?.books ?? []

  const stageBooks = useMemo(() => books.filter((b) => stageTabMatch(b.stage, stage)), [books, stage])

  // 级联选项：学科/年级互相约束，册次依赖两者，版本只列出当前组合下真实存在的
  const subjectOpts = useMemo(
    () => uniqSorted(stageBooks.filter((b) => grade === "all" || b.grade === grade).map((b) => b.subject)),
    [stageBooks, grade],
  )
  const gradeOpts = useMemo(
    () => uniqSorted(stageBooks.filter((b) => subject === "all" || b.subject === subject).map((b) => b.grade), gradeRank),
    [stageBooks, subject],
  )
  const volumeOpts = useMemo(
    () =>
      uniqSorted(
        stageBooks
          .filter((b) => (subject === "all" || b.subject === subject) && (grade === "all" || b.grade === grade))
          .map((b) => b.volume),
      ),
    [stageBooks, subject, grade],
  )
  const versionOpts = useMemo(
    () =>
      uniqSorted(
        stageBooks
          .filter(
            (b) =>
              (subject === "all" || b.subject === subject) &&
              (grade === "all" || b.grade === grade) &&
              (volume === "all" || b.volume === volume),
          )
          .map((b) => b.version),
      ),
    [stageBooks, subject, grade, volume],
  )

  // 上游筛选变化时，失效的下游选择立即回到“全部”（渲染期校正，避免闪现空结果）
  if (subject !== "all" && !subjectOpts.includes(subject)) setSubject("all")
  if (grade !== "all" && !gradeOpts.includes(grade)) setGrade("all")
  if (volume !== "all" && !volumeOpts.includes(volume)) setVolume("all")
  if (version !== "all" && !versionOpts.includes(version)) setVersion("all")

  const filtered = useMemo(() => {
    // 英文查询展开：History→历史、physics→物理、Grade 9→九年级……
    const tokens = expandQuery(query)
    const out = stageBooks.filter((b) => {
      if (type !== "all" && resTypeOf(b) !== type) return false
      if (subject !== "all" && b.subject !== subject) return false
      if (grade !== "all" && b.grade !== grade) return false
      if (volume !== "all" && b.volume !== volume) return false
      if (version !== "all" && b.version !== version) return false
      if (revisedOnly && !b.revised) return false
      if (tokens.length > 0) {
        const hay = `${b.title} ${b.version} ${b.subject} ${b.grade} ${b.volume} ${b.stage}`.toLowerCase()
        if (!tokens.every((tk) => tokenHits(tk, hay))) return false
      }
      return true
    })
    out.sort((a, b) => {
      // 学生教材在前，教师用书/课件等资源靠后
      const tr = (resTypeOf(a) === "student" ? 0 : 1) - (resTypeOf(b) === "student" ? 0 : 1)
      if (tr !== 0) return tr
      if (a.revised !== b.revised) return a.revised ? -1 : 1
      const s = matchStage(a.stage) - matchStage(b.stage)
      if (s !== 0) return s
      const g = gradeRank(a.grade) - gradeRank(b.grade)
      if (g !== 0) return g
      return cleanTitle(a.title).localeCompare(cleanTitle(b.title), "zh")
    })
    return out
  }, [stageBooks, query, type, subject, grade, volume, version, revisedOnly])

  const revisedCount = useMemo(() => books.filter((b) => b.revised).length, [books])
  const hasFilter =
    subject !== "all" || grade !== "all" || volume !== "all" || version !== "all" || revisedOnly || type !== "all" || query.trim() !== ""

  function resetFilters() {
    setQuery("")
    setSubject("all")
    setGrade("all")
    setVolume("all")
    setVersion("all")
    setType("all")
    setRevisedOnly(false)
  }

  async function handleDownload(id: string, name: string) {
    const store = useDownloadStore.getState()
    const cur = store.tasks[id]
    if (cur && cur.status === "active") return
    const controller = new AbortController()
    controllers.current.set(id, controller)
    registerController(id, controller)
    store.start(id, name)
    try {
      await streamDownload({
        url: `/api/download/${id}`,
        suggestedName: `${name}.pdf`,
        signal: controller.signal,
        onProgress: (received, total) => useDownloadStore.getState().progress(id, received, total),
      })
      useDownloadStore.getState().finish(id)
    } catch (e) {
      const err = e as DOMException
      if (err?.name === "AbortError") useDownloadStore.getState().cancel(id)
      else useDownloadStore.getState().fail(id, err?.message ?? t("dlFailed"))
    } finally {
      controllers.current.delete(id)
      unregisterController(id)
    }
  }

  const activeCount = Object.values(tasks).filter((t2) => t2.status === "active").length

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background">
      {/* 页头：品牌与数据来源 */}
      <header className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <BookOpen className="h-4 w-4" weight="bold" aria-hidden />
          </span>
          <span className="font-brand text-[17px] font-semibold tracking-wide">{t("brand")}</span>
          <span className="h-4 w-px bg-border hidden sm:block" aria-hidden />
          <span className="text-xs text-muted-foreground hidden sm:inline">{t("platform")}</span>
          <span className="ml-auto flex items-center gap-3 text-xs text-muted-foreground tabular-nums">
            {catalog && (
              <span className="hidden md:inline">
                {t("stats", { total: catalog.total, revised: revisedCount })}
              </span>
            )}
            {catalog?.updated && (
              <span className="hidden lg:inline text-muted-foreground/70">
                {t("catalogUpdated", { time: catalog.updated })}
              </span>
            )}
            <LangToggle />
          </span>
        </div>
      </header>

      {/* 吸顶工具栏：搜索 + 级联筛选 */}
      <div className="sticky top-0 z-30 border-b bg-background">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col gap-2.5">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-xl">
              <MagnifyingGlass
                className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("searchPlaceholder")}
                className="h-10 pl-10 rounded-md bg-card text-[15px]"
                aria-label={t("searchLabel")}
              />
            </div>
            <label className="flex items-center gap-2 text-[13px] text-muted-foreground cursor-pointer select-none ml-auto">
              <Switch checked={revisedOnly} onCheckedChange={setRevisedOnly} aria-label={t("revisedOnlyAria")} />
              {t("revisedOnly")}
            </label>
            <span className="text-xs text-muted-foreground tabular-nums hidden sm:block w-20 text-right">
              {t("countBooks", { n: filtered.length })}
              {activeCount > 0 && <span className="block text-primary">{t("downloading", { n: activeCount })}</span>}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-md border p-0.5 gap-0.5 overflow-x-auto" role="tablist" aria-label={t("stageAria")}>
              {STAGE_TABS.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setStage(tab)}
                  className={`px-3 h-8 rounded-[5px] text-[13px] whitespace-nowrap transition-colors ${
                    stage === tab ? "bg-primary text-primary-foreground font-medium" : "hover:bg-accent hover:text-accent-foreground text-muted-foreground"
                  }`}
                  aria-pressed={stage === tab}
                >
                  {t(STAGE_KEY[tab])}
                </button>
              ))}
            </div>

            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="w-[8.5rem] h-9 rounded-md" aria-label={t("filterType")}>
                <SelectValue placeholder={t("filterType")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allTypes")}</SelectItem>
                {TYPE_VALUES.map((tp) => (
                  <SelectItem key={tp} value={tp}>{t(TYPE_KEY[tp])}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={subject} onValueChange={setSubject}>
              <SelectTrigger className="w-[9rem] h-9 rounded-md" aria-label={t("filterSubject")}>
                <SelectValue placeholder={t("filterSubject")} />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="all">{t("allSubjects")}</SelectItem>
                {subjectOpts.map((s) => (
                  <SelectItem key={s} value={s}>{labelSubject(s, lang)}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={grade} onValueChange={setGrade}>
              <SelectTrigger className="w-[8.5rem] h-9 rounded-md" aria-label={t("filterGrade")}>
                <SelectValue placeholder={t("filterGrade")} />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="all">{t("allGrades")}</SelectItem>
                {gradeOpts.map((g) => (
                  <SelectItem key={g} value={g}>{labelGrade(g, lang)}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={volume} onValueChange={setVolume}>
              <SelectTrigger className="w-[8rem] h-9 rounded-md" aria-label={t("filterVolume")}>
                <SelectValue placeholder={t("filterVolume")} />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="all">{t("allVolumes")}</SelectItem>
                {volumeOpts.map((v) => (
                  <SelectItem key={v} value={v}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={version} onValueChange={setVersion}>
              <SelectTrigger className="w-[9.5rem] h-9 rounded-md" aria-label={t("filterVersionAria")}>
                <SelectValue placeholder={t("filterVersion")} />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="all">{t("allVersions")}</SelectItem>
                {versionOpts.map((v) => (
                  <SelectItem key={v} value={v}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {hasFilter && (
              <button
                onClick={resetFilters}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground h-8 px-2 rounded-md hover:bg-muted transition-colors"
              >
                <ArrowsCounterClockwise className="h-3.5 w-3.5" aria-hidden />
                {t("reset")}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 结果区 */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">
        {loadErr ? (
          <div className="py-24 text-center text-sm text-muted-foreground">{t("loadErr")}</div>
        ) : !catalog ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-4 gap-y-6">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i}>
                <Skeleton className="aspect-[3/4] rounded-md" />
                <Skeleton className="h-3.5 w-4/5 mt-2.5" />
                <Skeleton className="h-3 w-3/5 mt-1.5" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-24 flex flex-col items-center gap-4 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <MagnifyingGlass className="h-5 w-5 text-muted-foreground" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-medium">{t("noMatch")}</p>
              <p className="mt-1 text-[13px] text-muted-foreground">{t("noMatchHint")}</p>
            </div>
            <Button variant="outline" size="sm" onClick={resetFilters} className="rounded-md">
              {t("resetFilters")}
            </Button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-4 gap-y-6">
              {filtered.slice(0, visible).map((b) => {
                const rt = resTypeOf(b)
                return (
                  <article
                    key={b.id}
                    className="group cursor-pointer"
                    onClick={() => setSelected(b)}
                    aria-label={t("viewDetail", { title: cleanTitle(b.title) })}
                  >
                    <div className="relative aspect-[3/4] overflow-hidden rounded-lg border bg-muted transition-[transform,box-shadow] duration-300 group-hover:-translate-y-0.5 group-hover:shadow-[0_16px_32px_-18px_rgba(41,37,36,0.35)]">
                      <Cover id={b.id} title={b.title} />
                    </div>
                    <div className="pt-2">
                      <div className="flex items-start gap-1.5">
                        {b.revised && (
                          <span className="shrink-0 mt-[2px] rounded-[4px] border border-primary/25 bg-primary/10 px-1 text-[10px] leading-[15px] font-medium text-primary">
                            {t("badgeRevised")}
                          </span>
                        )}
                        {rt !== "student" && (
                          <span className="shrink-0 mt-[2px] rounded-[4px] border bg-muted px-1 text-[10px] leading-[15px] text-muted-foreground">
                            {t(TYPE_KEY[rt])}
                          </span>
                        )}
                        <h3 className="text-[13px] font-medium leading-snug line-clamp-2" title={b.title}>
                          {cleanTitle(b.title)}
                        </h3>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground truncate">
                        {[b.version, labelGrade(b.grade, lang), b.volume].filter(Boolean).join(" ")}
                      </p>
                    </div>
                    <div className="mt-2 flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 h-8 rounded-md bg-card active:scale-[0.98]"
                        onClick={() => window.open(`/preview/${b.id}`, "_blank", "noopener")}
                      >
                        <BookOpen className="mr-1 h-3.5 w-3.5" aria-hidden />
                        {t("read")}
                      </Button>
                      {rt === "student" && (
                        <Button
                          size="sm"
                          className="flex-1 h-8 rounded-md active:scale-[0.98]"
                          onClick={() => handleDownload(b.id, b.title)}
                        >
                          <DownloadSimple className="mr-1 h-3.5 w-3.5" aria-hidden />
                          {t("download")}
                        </Button>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>

            {visible < filtered.length && (
              <div className="mt-10 text-center">
                <Button variant="outline" onClick={() => setVisible((v) => v + PAGE_STEP)} className="px-10 rounded-md">
                  {t("loadMore", { n: filtered.length - visible })}
                </Button>
              </div>
            )}
          </>
        )}
      </main>

      <footer className="mt-auto border-t bg-card">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col sm:flex-row items-center gap-1.5 sm:gap-2 justify-between text-xs text-muted-foreground">
          <span>{t("footerNote")}</span>
          <span className="tabular-nums">
            {catalog?.updated ? t("catalogUpdated", { time: catalog.updated }) : ""}
          </span>
        </div>
      </footer>

      <BookDialog
        id={selected?.id ?? null}
        meta={selected}
        onClose={() => setSelected(null)}
        onDownload={handleDownload}
      />
      <DownloadTray />
    </div>
  )
}

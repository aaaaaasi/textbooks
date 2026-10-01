"use client"

import { useState } from "react"
import { CheckCircle, CaretDown, CaretUp, CircleNotch, X, XCircle } from "@phosphor-icons/react/dist/ssr"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { useDownloadStore } from "@/lib/download-store"
import { cancelDownload, formatSize } from "@/lib/download-client"
import { useLang } from "@/components/textbooks/lang"

export function DownloadTray() {
  const { t } = useLang()
  const tasks = useDownloadStore((s) => s.tasks)
  const remove = useDownloadStore((s) => s.remove)
  const clearFinished = useDownloadStore((s) => s.clearFinished)
  const [collapsed, setCollapsed] = useState(false)

  const list = Object.values(tasks)
  if (list.length === 0) return null

  const activeCount = list.filter((t) => t.status === "active").length
  const finished = list.filter((t) => t.status !== "active")

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[19rem] max-w-[calc(100vw-2rem)] rounded-lg border bg-popover shadow-lg">
      <div className="flex items-center gap-2 px-3.5 py-2.5 border-b">
        {activeCount > 0 && <CircleNotch className="h-4 w-4 animate-spin text-foreground" aria-hidden />}
        <span className="text-sm font-medium flex-1 truncate">
          {activeCount > 0 ? t("trayActive", { n: activeCount }) : t("trayDone")}
        </span>
        {finished.length > 0 && (
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground" onClick={clearFinished}>
            {t("clear")}
          </Button>
        )}
        <button
          className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted transition-colors"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? t("expandTray") : t("collapseTray")}
        >
          {collapsed ? <CaretUp className="h-3.5 w-3.5" /> : <CaretDown className="h-3.5 w-3.5" />}
        </button>
      </div>

      {!collapsed && (
        <ul className="max-h-72 overflow-y-auto p-2 space-y-2">
          {list.slice(0, 12).map((t) => {
            const pct = t.total > 0 ? Math.min(100, Math.round((t.received / t.total) * 100)) : 0
            return (
              <li key={t.id} className="rounded-md border px-2.5 py-2">
                <div className="flex items-center gap-2">
                  <span className="flex-1 min-w-0 text-xs font-medium truncate" title={t.name}>
                    {t.name}
                  </span>
                  {t.status === "active" && (
                    <X
                      className="h-3.5 w-3.5 shrink-0 cursor-pointer text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        cancelDownload(t.id)
                        useDownloadStore.getState().cancel(t.id)
                      }}
                      aria-label={t("cancelDownload")}
                      role="button"
                    />
                  )}
                  {t.status === "done" && <CheckCircle className="h-4 w-4 shrink-0 text-primary" aria-hidden />}
                  {t.status === "error" && <XCircle className="h-4 w-4 shrink-0 text-destructive" aria-label={t("dlFailed")} />}
                  {t.status === "cancelled" && <XCircle className="h-4 w-4 shrink-0 text-muted-foreground" aria-label={t("cancelled")} />}
                  {t.status !== "active" && (
                    <X
                      className="h-3.5 w-3.5 shrink-0 cursor-pointer text-muted-foreground hover:text-foreground"
                      onClick={() => remove(t.id)}
                      aria-label={t("removeRecord")}
                      role="button"
                    />
                  )}
                </div>
                {t.status === "active" && (
                  <>
                    <Progress value={pct} className="h-1.5 mt-2" aria-label={t("progressAria", { n: pct })} />
                    <div className="mt-1 text-[10px] text-muted-foreground tabular-nums">
                      {formatSize(t.received)}{t.total ? ` / ${formatSize(t.total)}` : ""} · {pct}%
                    </div>
                  </>
                )}
                {t.status === "done" && <div className="mt-1 text-[10px] text-muted-foreground">{t("doneSize", { size: formatSize(t.received) })}</div>}
                {t.status === "error" && <div className="mt-1 text-[10px] text-destructive truncate" title={t.error}>{t.error ?? t("dlFailed")}</div>}
                {t.status === "cancelled" && <div className="mt-1 text-[10px] text-muted-foreground">{t("cancelled")}</div>}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

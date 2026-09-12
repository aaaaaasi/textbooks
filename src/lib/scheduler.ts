// 月度目录自动更新调度器（仅 Node.js 运行时，由 src/instrumentation.ts 启动）
//
// 策略：
//   - 服务启动 30s 后 + 之后每小时检查一次是否到期
//   - 到期：距上次「成功」更新超过 30 天，且当前处于空闲时段（本地 03:00–05:59）
//   - 严重超期（超过 34 天）任意时段补跑，避免长期不停机导致永远错过窗口
//   - 执行交给 lib/catalog-update（纯 Node 实现，线上 FC 无 python3 也可运行）
//   - 失败退避 24h（只认成功记录计算周期，失败不会把 30 天周期重置）；
//     锁冲突视为他处正在更新，下个整点再查
//   - 结果经部署探针外发一份（线上无日志时的可见性通道），发送失败静默

import { readFile, stat } from "fs/promises"
import path from "path"
import { runCatalogUpdate, type UpdateResult } from "./catalog-update"
import { probe } from "./deploy-probe"

const ROOT = process.cwd()
const LAST_UPDATE_FILE = path.join(ROOT, "data", "last_update.json")
const CATALOG_FILE = path.join(ROOT, "data", "catalog.json")

const INTERVAL_DUE_MS = 30 * 24 * 3600 * 1000 // 30 天
const INTERVAL_CATCHUP_MS = 34 * 24 * 3600 * 1000 // 超期补跑
const IDLE_HOURS: readonly number[] = [3, 4, 5] // 03:00–05:59 本地时间

let lastAttempt = 0
let attempted = false

/** 最近一次「成功」更新的时间；失败记录不算，回退到 catalog.json 的修改时间 */
async function lastSuccessMs(): Promise<number> {
  try {
    const raw = await readFile(LAST_UPDATE_FILE, "utf8")
    const data = JSON.parse(raw) as { ok?: boolean; finished_at?: string }
    if (data.ok && data.finished_at) {
      const t = Date.parse(data.finished_at.replace(" ", "T"))
      if (Number.isFinite(t)) return t
    }
  } catch {
    // 无记录：回退到 catalog.json 的修改时间
  }
  try {
    const st = await stat(CATALOG_FILE)
    return st.mtimeMs
  } catch {
    return 0
  }
}

async function maybeRun(): Promise<void> {
  const now = Date.now()
  // 失败后 24h 内不重复启动（退避）
  if (attempted && now - lastAttempt < 24 * 3600 * 1000) return

  const last = await lastSuccessMs()
  const overdue = now - last >= INTERVAL_DUE_MS
  const catchup = now - last >= INTERVAL_CATCHUP_MS
  const hour = new Date().getHours()
  if (!overdue || (!IDLE_HOURS.includes(hour) && !catchup)) return

  attempted = true
  lastAttempt = now
  console.log(
    `[scheduler] 目录更新到期（距上次成功 ${Math.round((now - last) / 86400000)} 天），启动月度更新`,
  )

  let result: UpdateResult
  try {
    result = await runCatalogUpdate("scheduler")
  } catch {
    result = { ok: false, trigger: "scheduler", error: "unhandled exception" } as UpdateResult
  }

  if (result.skipped === "locked") {
    // 他处（如手动触发）正在更新：不算失败，下个整点再查
    attempted = false
    return
  }
  if (!result.ok) {
    console.warn(`[scheduler] 月度更新失败（24h 后重试）：${result.error ?? "unknown"}`)
    probe("catalog-update-failed", { error: (result.error ?? "").slice(0, 200) })
    return
  }
  console.log(`[scheduler] 月度更新成功：${result.total} 本`)
  probe("catalog-updated", {
    total: result.total,
    added: result.added,
    removed: result.removed,
    pruned_covers: result.pruned_covers,
    duration_ms: result.duration_ms,
  })
}

export function startCatalogScheduler(): void {
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  const tick = () => maybeRun().catch(() => {})
  setTimeout(tick, 30 * 1000).unref()
  setInterval(tick, 3600 * 1000).unref()
}

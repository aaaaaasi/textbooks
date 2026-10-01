// 上游版本探测调度器（仅 Node.js 运行时，由 src/instrumentation.ts 启动）
//
// 策略（变更驱动，替代原 30 天周期；用户要求每天轻量检查一次，防止频繁请求被封禁）：
//   - 服务启动 30s 后首次检查，之后每小时 tick，但每 24h 只真正探测一次上游
//   - 探测：GET data_version.json（仅 ~400B），比对 ETag（缺失时退回 Last-Modified）
//   - 首次运行只记录 ETag 基线，不触发更新（随部署打包的目录就是最新抓取的）
//   - ETag 与基线不同 → 立即全量重建目录（runCatalogUpdate）
//   - 更新失败 24h 退避；锁冲突视为他处正在更新，下个整点再查
//   - 状态持久化 data/version_check.json（进程重启不丢基线）
//   - 结果经部署探针外发（线上无日志时的可见性通道），发送失败静默

import { readFile, rename, writeFile } from "fs/promises"
import path from "path"
import { runCatalogUpdate, type UpdateResult } from "./catalog-update"
import { probe } from "./deploy-probe"
import { fetchJsonRetry } from "./smartedu"

const ROOT = process.cwd()
const STATE_FILE = path.join(ROOT, "data", "version_check.json")
const DATA_VERSION_URL =
  "https://s-file-1.ykt.cbern.com.cn/zxx/ndrs/resources/tch_material/version/data_version.json"

const CHECK_INTERVAL_MS = 24 * 3600 * 1000 // 每日一次探测
const RETRY_BACKOFF_MS = 24 * 3600 * 1000 // 同步失败退避

interface VcState {
  etag?: string
  checked_ms?: number
  attempt_ms?: number
  attempt_ok?: boolean
}

let state: VcState | null = null

async function loadState(): Promise<VcState> {
  if (state) return state
  try {
    state = JSON.parse(await readFile(STATE_FILE, "utf8")) as VcState
  } catch {
    state = {}
  }
  return state
}

async function saveState(): Promise<void> {
  if (!state) return
  try {
    const tmp = `${STATE_FILE}.tmp`
    await writeFile(tmp, JSON.stringify(state), "utf8")
    await rename(tmp, STATE_FILE)
  } catch {
    // 状态写不进去只影响跨重启的记忆，不影响业务
  }
}

/** 轻量探测上游版本：只取 ETag / Last-Modified 头 */
async function fetchUpstreamEtag(): Promise<string | null> {
  try {
    const res = await fetchJsonRetry(DATA_VERSION_URL, 2, 15_000)
    if (!res) return null
    return res.headers.get("etag") ?? res.headers.get("last-modified")
  } catch {
    return null
  }
}

async function tick(): Promise<void> {
  const s = await loadState()
  const now = Date.now()
  if (s.checked_ms && now - s.checked_ms < CHECK_INTERVAL_MS) return

  const etag = await fetchUpstreamEtag()
  if (!etag) return // 探测失败：不打扰，下个整点再试
  s.checked_ms = now

  if (!s.etag) {
    // 首次运行：只记录基线，不触发更新
    s.etag = etag
    await saveState()
    probe("version-check", { first: true, etag: etag.slice(0, 32) })
    return
  }

  if (etag === s.etag) {
    await saveState()
    return
  }

  // 上游有变更 → 立即同步（失败退避期内除外）
  if (s.attempt_ms && !s.attempt_ok && now - s.attempt_ms < RETRY_BACKOFF_MS) {
    await saveState()
    return
  }
  console.log(
    `[scheduler] 检测到上游目录变更（ETag ${s.etag.slice(0, 16)}… → ${etag.slice(0, 16)}…），启动全量同步`,
  )

  let result: UpdateResult
  try {
    result = await runCatalogUpdate("upstream-change")
  } catch {
    result = { ok: false, trigger: "upstream-change", error: "unhandled exception" } as UpdateResult
  }

  if (result.skipped === "locked") {
    // 他处（如手动触发）正在更新：不算失败，下个整点再查
    return
  }
  s.attempt_ms = Date.now()
  if (!result.ok) {
    s.attempt_ok = false
    await saveState()
    console.warn(`[scheduler] 目录同步失败（24h 后重试）：${result.error ?? "unknown"}`)
    probe("catalog-update-failed", { error: (result.error ?? "").slice(0, 200) })
    return
  }
  s.attempt_ok = true
  s.etag = etag
  await saveState()
  console.log(`[scheduler] 目录同步完成：${result.total} 条`)
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
  const tickOnce = () => tick().catch(() => {})
  setTimeout(tickOnce, 30 * 1000).unref()
  setInterval(tickOnce, 3600 * 1000).unref()
}

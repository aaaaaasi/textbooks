// 月度目录全量更新（纯 Node/TS 实现，零外部依赖）
//
// 背景：v1 依赖 python3 scripts/monthly_update.py，但线上 FC 运行环境
// （/app/next-service-dist）没有 python3，调度器在线上会静默失效（每次失败退避 7 天）。
// 本实现与 build_catalog.py + monthly_update.py 逻辑等价，Node 运行时天然可用。
//
// 流程（与原 python 版一致）：
//   1. 双重锁防并发：模块内 promise（同进程）+ data/catalog_update.lock 文件锁
//      （跨进程；残留 30 分钟以上视为陈锁回收）
//   2. 拉取标签树 + data_version 分片清单 → 全量重建目录（原子写入 catalog.json）
//   3. 清空 PDF 磁盘缓存 data/pdfs（教材可能被新版本替换，避免旧 PDF 长期占盘；
//      5 分钟内仍在写入的活跃下载不碰）
//   4. 裁剪孤儿封面 data/covers（新目录中已不存在的 book id）
//   5. 写 data/last_update.json（调度器据此计算下次到期）+ data/update.log 留痕
//
// 失败安全：任何一步失败都保留旧 catalog.json；last_update.json 照常记录（ok:false），
// 调度器只认成功记录计算周期，失败次日空闲窗口自动重试。
//
// 手动触发：bun src/lib/catalog-update.ts（import.meta.main 直跑）

import { appendFileSync, closeSync, openSync, statSync, unlinkSync } from "fs"
import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from "fs/promises"
import path from "path"
import { fetchJsonRetry } from "./smartedu"

const ROOT = process.cwd()
const DATA_DIR = path.join(ROOT, "data")
const CATALOG_FILE = path.join(DATA_DIR, "catalog.json")
const LOCK_FILE = path.join(DATA_DIR, "catalog_update.lock")
const LAST_UPDATE_FILE = path.join(DATA_DIR, "last_update.json")
const LOG_FILE = path.join(DATA_DIR, "update.log")
const COVERS_DIR = path.join(DATA_DIR, "covers")
const PDFS_DIR = path.join(DATA_DIR, "pdfs")

const TAGS_URL = "https://s-file-1.ykt.cbern.com.cn/zxx/ndrs/tags/tch_material_tag.json"
const DATA_VERSION_URL =
  "https://s-file-1.ykt.cbern.com.cn/zxx/ndrs/resources/tch_material/version/data_version.json"

// 与 build_catalog.py 相同的标签维度 → 目录字段映射
const DIM_NAMES: Record<string, string> = {
  zxxxd: "stage",
  zxxxk: "subject",
  zxxbb: "version",
  zxxnj: "grade",
  zxxcc: "volume",
}

interface RawTagNode {
  tag_id?: string
  tag_name?: string
  tag_dimension_id?: string
  children?: RawTagNode[]
  hierarchies?: { children?: RawTagNode[] }[]
}

interface RawBook {
  id: string
  title?: string
  name?: string
  container?: string | null
  tag_paths?: string[]
  tag_list?: { tag_dimension_id?: string; tag_name?: string }[]
}

type Rec = {
  id: string
  title: string
  stage: string
  grade: string
  subject: string
  version: string
  volume: string
  container: string | null
  revised?: boolean
}

export interface UpdateResult {
  ok: boolean
  trigger: string
  total: number
  revised: number
  added: number
  removed: number
  cleared_pdfs: number
  pruned_covers: number
  shards_failed: number
  duration_ms: number
  error?: string
  skipped?: "locked"
  started_at: string
  finished_at?: string
}

/** 本地时间 "YYYY-MM-DD HH:MM:SS"（与原 python 记录格式一致，调度器可解析） */
function timestamp(withSeconds = true): string {
  const s = new Date().toLocaleString("sv-SE") // "YYYY-MM-DD HH:MM:SS"
  return withSeconds ? s : s.slice(0, 16)
}

function logLine(msg: string): void {
  console.log(`[catalog-update] ${msg}`)
  try {
    appendFileSync(LOG_FILE, `[${timestamp()}] ${msg}\n`)
  } catch {
    // 日志写不进去不影响更新本身（如线上只读文件系统）
  }
}

/** BFS 展开标签树：tag_id → { name, dim }（与 build_catalog.py flatten_tags 等价） */
function flattenTags(hierarchies: RawTagNode[]): Map<string, { name: string; dim: string }> {
  const info = new Map<string, { name: string; dim: string }>()
  const queue: RawTagNode[] = []
  for (const root of hierarchies) {
    for (const child of root.children ?? []) queue.push(child)
  }
  while (queue.length) {
    const node = queue.shift() as RawTagNode
    if (!node.tag_id) continue
    info.set(node.tag_id, { name: node.tag_name ?? "", dim: node.tag_dimension_id ?? "" })
    for (const h of node.hierarchies ?? []) {
      for (const c of h.children ?? []) queue.push(c)
    }
  }
  return info
}

/** JSON GET：复用 smartedu 的匿名鉴权头 + 超时重试；失败返回 null */
async function fetchJson<T>(url: string, attempts = 3, timeoutMs = 30000): Promise<T | null> {
  const res = await fetchJsonRetry(url, attempts, timeoutMs)
  if (!res) return null
  try {
    return (await res.json()) as T
  } catch {
    return null
  }
}

/** 全量重建目录记录（不落盘） */
async function buildBooks(): Promise<{ books: Rec[]; shardsFailed: number }> {
  const tags = await fetchJson<{ hierarchies: RawTagNode[] }>(TAGS_URL)
  if (!tags?.hierarchies) throw new Error("标签树拉取失败")
  const tagInfo = flattenTags(tags.hierarchies)
  logLine(`标签节点 ${tagInfo.size} 个`)

  const dv = await fetchJson<{ urls: string }>(DATA_VERSION_URL)
  if (!dv?.urls) throw new Error("data_version 拉取失败")
  const urls = dv.urls
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean)
  logLine(`分片文件 ${urls.length} 个`)

  const books: Rec[] = []
  const seen = new Set<string>()
  let shardsFailed = 0
  for (let i = 0; i < urls.length; i++) {
    const part = await fetchJson<RawBook[]>(urls[i])
    if (!Array.isArray(part)) {
      shardsFailed += 1
      logLine(`分片 ${i + 1}/${urls.length} 拉取失败，跳过`)
      continue
    }
    for (const b of part) {
      if (!b?.tag_paths?.length || seen.has(b.id)) continue
      seen.add(b.id)
      // 字段顺序与 python 版保持一致（id,title,stage,grade,subject,version,volume,container,revised）
      const rec: Rec = {
        id: b.id,
        title: (b.title || b.name || "").trim(),
        stage: "",
        grade: "",
        subject: "",
        version: "",
        volume: "",
        container: b.container ?? null,
      }
      for (const tid of b.tag_paths[0].split("/")) {
        const meta = tagInfo.get(tid)
        if (!meta) continue
        const field = DIM_NAMES[meta.dim]
        if (field && !rec[field as keyof Rec]) rec[field as keyof Rec] = meta.name as never
      }
      if (!rec.version) {
        for (const t of b.tag_list ?? []) {
          if (t.tag_dimension_id === "zxxbb" && t.tag_name) {
            rec.version = t.tag_name
            break
          }
        }
      }
      rec.revised =
        rec.title.includes("2022年版课程标准修订") || rec.title.includes("2022年版课程标准")
      books.push(rec)
    }
  }
  return { books, shardsFailed }
}

/** 现有目录中的 book id 集合（用于 diff 与防半残数据） */
async function currentIds(): Promise<Set<string>> {
  try {
    const raw = await readFile(CATALOG_FILE, "utf8")
    const data = JSON.parse(raw) as { books?: { id?: string }[] }
    return new Set((data.books ?? []).map((b) => b.id).filter((x): x is string => !!x))
  } catch {
    return new Set()
  }
}

/** 清空 PDF 磁盘缓存；5 分钟内修改过的文件视为活跃下载，跳过 */
async function clearPdfs(): Promise<number> {
  let names: string[]
  try {
    names = await readdir(PDFS_DIR)
  } catch {
    return 0
  }
  let n = 0
  const now = Date.now()
  for (const name of names) {
    const p = path.join(PDFS_DIR, name)
    try {
      const st = await stat(p)
      if (now - st.mtimeMs < 5 * 60 * 1000) continue
      await unlink(p)
      n += 1
    } catch {
      // 单个文件失败不影响其余清理
    }
  }
  return n
}

/** 裁剪孤儿封面：文件名（去扩展名）不在新目录 id 集合中的删除 */
async function pruneCovers(ids: Set<string>): Promise<number> {
  let names: string[]
  try {
    names = await readdir(COVERS_DIR)
  } catch {
    return 0
  }
  let n = 0
  for (const name of names) {
    const dot = name.lastIndexOf(".")
    const stem = dot > 0 ? name.slice(0, dot) : name
    if (ids.has(stem)) continue
    try {
      await unlink(path.join(COVERS_DIR, name))
      n += 1
    } catch {
      // 忽略单个失败
    }
  }
  return n
}

// ---- 跨进程文件锁 ----

function acquireLock(): boolean {
  for (let i = 0; i < 2; i++) {
    try {
      const fd = openSync(LOCK_FILE, "wx") // 独占创建，存在即失败
      closeSync(fd)
      return true
    } catch {
      // 锁已存在：检查是否陈锁（>30 分钟视为上次异常残留）
      try {
        const st = statSync(LOCK_FILE)
        if (Date.now() - st.mtimeMs > 30 * 60 * 1000) {
          unlinkSync(LOCK_FILE)
          continue
        }
      } catch {
        // 锁刚好被释放：下一轮直接重新尝试创建
        continue
      }
      return false
    }
  }
  return false
}

function releaseLock(): void {
  try {
    unlinkSync(LOCK_FILE)
  } catch {
    // 忽略
  }
}

async function doRun(trigger: string): Promise<UpdateResult> {
  const startedAt = Date.now()
  const result: UpdateResult = {
    ok: false,
    trigger,
    total: 0,
    revised: 0,
    added: 0,
    removed: 0,
    cleared_pdfs: 0,
    pruned_covers: 0,
    shards_failed: 0,
    duration_ms: 0,
    started_at: timestamp(),
  }
  if (!acquireLock()) {
    result.skipped = "locked"
    logLine("已有更新在进行中，本次跳过")
    return result
  }
  try {
    await mkdir(DATA_DIR, { recursive: true })
    logLine(`开始全量更新目录（触发：${trigger}）...`)

    const prev = await currentIds()
    const { books, shardsFailed } = await buildBooks()
    result.shards_failed = shardsFailed

    // 防上游半残数据：新目录比旧目录少一半以上视为异常，保留旧目录
    if (prev.size > 100 && books.length < prev.size * 0.5) {
      throw new Error(`新目录仅 ${books.length} 本（旧 ${prev.size} 本），疑似上游异常，保留旧目录`)
    }
    const ids = new Set(books.map((b) => b.id))

    // 原子写入：先写临时文件再 replace，失败不会损坏旧目录
    const payload = JSON.stringify({ updated: timestamp(false), total: books.length, books })
    const tmp = `${CATALOG_FILE}.tmp`
    await writeFile(tmp, payload, "utf8")
    await rename(tmp, CATALOG_FILE)

    result.total = books.length
    result.revised = books.filter((b) => b.revised).length
    for (const id of ids) if (!prev.has(id)) result.added += 1
    for (const id of prev) if (!ids.has(id)) result.removed += 1

    // 更新后清缓存：PDF 全清（教材可能被替换），封面只裁孤儿
    result.cleared_pdfs = await clearPdfs()
    result.pruned_covers = await pruneCovers(ids)

    result.ok = true
    logLine(
      `更新完成：${result.total} 本（2022修订版 ${result.revised}），新增 ${result.added}，` +
        `下架 ${result.removed}，分片失败 ${shardsFailed}，清 PDF ${result.cleared_pdfs} 个，裁封面 ${result.pruned_covers} 张`,
    )
  } catch (e) {
    result.error = e instanceof Error ? e.message : String(e)
    logLine(`更新失败：${result.error}（保留旧目录）`)
  } finally {
    result.finished_at = timestamp()
    result.duration_ms = Date.now() - startedAt
    try {
      const tmp = `${LAST_UPDATE_FILE}.tmp`
      await writeFile(tmp, JSON.stringify(result, null, 2), "utf8")
      await rename(tmp, LAST_UPDATE_FILE)
    } catch {
      // 状态写不进去只影响下次到期判断精度，不影响本次结果
    }
    releaseLock()
  }
  return result
}

// 同进程互斥：调度器每小时 tick，人工触发与调度可能撞在同一进程内
let inflight: Promise<UpdateResult> | null = null

export function runCatalogUpdate(trigger = "manual"): Promise<UpdateResult> {
  if (inflight) return inflight
  inflight = doRun(trigger).finally(() => {
    inflight = null
  })
  return inflight
}

// 直接运行：bun src/lib/catalog-update.ts
if ((import.meta as { main?: boolean }).main) {
  runCatalogUpdate("manual").then((r) => {
    console.log(JSON.stringify(r, null, 2))
    process.exit(r.ok ? 0 : 1)
  })
}

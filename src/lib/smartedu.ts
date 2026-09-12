// 国家中小学智慧教育平台电子教材上游访问工具
// API 链路参考开源项目 tchMaterial-parser (MIT): https://github.com/happycola233/tchMaterial-parser

export const UPSTREAM_HEADERS: Record<string, string> = {
  Authorization: "Bearer 0",
  Origin: "https://basic.smartedu.cn",
  Referer: "https://basic.smartedu.cn/",
  "User-Agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
  "X-ND-AUTH": 'MAC id="0",nonce="0",mac="0"',
}

export const PRIVATE_CDN = "https://r1-ndr-private.ykt.cbern.com.cn"
// 公共镜像域：封面图与公开 PDF 均可匿名访问，且无需鉴权头
export const PUBLIC_CDN = "https://r1-ndr.ykt.cbern.com.cn"
const STORAGE_PREFIX = "cs_path:${ref-path}"

function expandStorage(u: string): string {
  return u.replace(STORAGE_PREFIX, PRIVATE_CDN)
}

/** 把 private 域 / cs_path 形式的资源地址改写到公共镜像域。 */
function toPublicUrl(u: string): string {
  return u.replace(STORAGE_PREFIX, PUBLIC_CDN).replace("-private.ykt.cbern.com.cn", ".ykt.cbern.com.cn")
}

export interface TiItem {
  ti_file_flag?: string
  ti_format?: string
  ti_size?: number
  ti_is_source_file?: boolean
  ti_storage?: string
  ti_storages?: string[]
}

export interface SeduDetails {
  id: string
  title?: string
  global_title?: Record<string, string>
  container?: string | null
  ti_items?: TiItem[]
  relations?: Record<string, unknown[]>
  tag_list?: { tag_dimension_id?: string; tag_name?: string }[]
}

export interface SeduAudio {
  id?: string
  global_title?: Record<string, string>
  title?: string
  ti_items?: TiItem[]
}

function urlOf(item: TiItem): string | null {
  if (item.ti_storage) return expandStorage(item.ti_storage)
  const first = (item.ti_storages ?? []).find(Boolean)
  return first ?? null
}

function displayName(data: SeduDetails): string {
  const gt = data.global_title
  if (gt && typeof gt === "object") return gt["zh-CN"] || gt.en || data.title || data.id
  return data.title || data.id
}

/** 找源 PDF：公共镜像优先 + private 主链 + 其余镜像，供逐个重试。 */
export function pickPdfCandidates(data: SeduDetails): { urls: string[]; size: number; name: string } {
  const items = data.ti_items ?? []
  let chosen: TiItem | null = null
  for (const it of items) {
    if (it.ti_is_source_file && (it.ti_format ?? "pdf") !== "folder") {
      chosen = it
      break
    }
  }
  if (!chosen) {
    for (const it of items) {
      if (["source", "pdf"].includes(it.ti_file_flag ?? "") && (it.ti_format ?? "pdf") !== "folder") {
        chosen = it
        break
      }
    }
  }
  if (!chosen) return { urls: [], size: 0, name: displayName(data) }

  const urls: string[] = []
  const push = (u: string) => {
    if (u && !urls.includes(u)) urls.push(u)
  }
  if (chosen.ti_storage) {
    // 公共镜像域在前（免鉴权、命中率高），private 域兜底
    push(toPublicUrl(chosen.ti_storage))
    push(expandStorage(chosen.ti_storage))
  }
  for (const u of chosen.ti_storages ?? []) push(toPublicUrl(u))
  for (const u of chosen.ti_storages ?? []) push(u)
  return { urls, size: chosen.ti_size ?? 0, name: displayName(data) }
}

/** 封面缩略图地址（公共镜像域，可匿名访问；仍建议经 /api/cover 磁盘缓存）。 */
export function pickCover(data: SeduDetails): string | null {
  for (const it of data.ti_items ?? []) {
    if (it.ti_file_flag === "thumbnail_1" && (it.ti_format === "jpg" || it.ti_format === "png")) {
      const u = urlOf(it)
      if (u) return toPublicUrl(u)
    }
  }
  for (const it of data.ti_items ?? []) {
    if (it.ti_format === "jpg" || it.ti_format === "png") {
      const u = urlOf(it)
      if (u) return toPublicUrl(u)
    }
  }
  // 部分教材只有 thumbnail 目录：按平台规则拼首页图 1.jpg
  for (const it of data.ti_items ?? []) {
    if (it.ti_file_flag === "thumbnail" || it.ti_format === "folder") {
      const base = urlOf(it)
      if (base) return `${toPublicUrl(base.replace(/\/$/, ""))}/1.jpg`
    }
  }
  return null
}

/** 解析教材配套音频（如英语课本听力）。 */
export function pickAudioUrls(audio: SeduAudio): string[] {
  const urls: string[] = []
  for (const it of audio.ti_items ?? []) {
    if (!["href", "source"].includes(it.ti_file_flag ?? "")) continue
    if ((it.ti_format ?? "mp3") !== "mp3") continue
    const u = urlOf(it)
    if (u) urls.push(u)
  }
  return urls
}

export function audioTitle(audio: SeduAudio, idx: number): string {
  const gt = audio.global_title
  const t = (gt && (gt["zh-CN"] || gt.en)) || audio.title
  return t?.trim() || `音频 ${idx + 1}`
}

// ---- 上游请求健壮性工具 ----
// 此前线上故障根因：所有上游 fetch 均无超时，上游一旦挂起，路由永不响应，
// 前端表现为“永远卡在 0% 且无任何报错”。以下工具统一修复该问题。

/**
 * 带响应头超时的 fetch：定时器只作用于“等到响应头”阶段，
 * 收到响应头后立即清除定时器，正文流不再受该超时影响（大文件慢速传输不会被误杀）。
 * outer 信号（如客户端断开）始终可中断。
 */
export async function fetchWithHeaderTimeout(
  url: string,
  init: RequestInit,
  headerTimeoutMs: number,
  outer?: AbortSignal,
): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(new Error("上游响应头超时")), headerTimeoutMs)
  const onAbort = () => ctrl.abort(outer?.reason)
  outer?.addEventListener("abort", onAbort, { once: true })
  try {
    return await fetch(url, { ...init, signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
    outer?.removeEventListener("abort", onAbort)
  }
}

/** 带 8s 超时 + 退避重试的 JSON GET，全部尝试失败返回 null。 */
export async function fetchJsonRetry(url: string, attempts = 3, timeoutMs = 8000): Promise<Response | null> {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        headers: UPSTREAM_HEADERS,
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (res.ok) return res
    } catch {
      // 超时/网络错误：退避后重试
    }
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, 300 * (i + 1)))
  }
  return null
}

const MIRROR_RE = /^(https:\/\/)r\d(-ndr(?:-private)?)\.ykt\.cbern\.com\.cn(\/.*)$/

/** 把 rN 镜像域名展开为 r1/r2/r3 三个变体（原顺序在前），供逐个重试。 */
export function mirrorVariants(url: string): string[] {
  const m = MIRROR_RE.exec(url)
  if (!m) return [url]
  return ["r1", "r2", "r3"].map((n) => `${m[1]}${n}${m[2]}.ykt.cbern.com.cn${m[3]}`)
}

// ---- 详情缓存（10 分钟 TTL，避免重复回源）----
interface CacheEntry {
  data: SeduDetails
  ts: number
}
const detailsCache = new Map<string, CacheEntry>()
const DETAILS_TTL = 10 * 60 * 1000

export async function fetchDetails(id: string): Promise<SeduDetails | null> {
  const hit = detailsCache.get(id)
  if (hit && Date.now() - hit.ts < DETAILS_TTL) return hit.data
  const res = await fetchJsonRetry(
    `https://s-file-1.ykt.cbern.com.cn/zxx/ndrv2/resources/tch_material/details/${id}.json`,
  )
  if (!res) return null
  try {
    const data = (await res.json()) as SeduDetails
    detailsCache.set(id, { data, ts: Date.now() })
    return data
  } catch {
    return null
  }
}

// ---- PDF 地址解析缓存（24h TTL）----
// pdf.js 每个分块请求都会打到 /api/download，若每次都回源 details 接口
// 会引入大量额外往返与故障点；缓存解析结果后，分块请求零回源。
export interface PdfResolve {
  urls: string[]
  size: number
  name: string
}

const pdfUrlCache = new Map<string, { r: PdfResolve; ts: number }>()
const PDF_URL_TTL = 24 * 60 * 60 * 1000

export async function resolvePdf(id: string): Promise<PdfResolve | null> {
  const hit = pdfUrlCache.get(id)
  if (hit && Date.now() - hit.ts < PDF_URL_TTL) return hit.r
  const details = await fetchDetails(id)
  if (!details) return hit?.r ?? null // 回源失败时旧解析结果兜底
  const pdf = pickPdfCandidates(details)
  if (pdf.urls.length === 0) return null
  const urls: string[] = []
  for (const u of pdf.urls) {
    for (const v of mirrorVariants(u)) {
      if (!urls.includes(v)) urls.push(v)
    }
  }
  const r: PdfResolve = { urls, size: pdf.size, name: pdf.name }
  pdfUrlCache.set(id, { r, ts: Date.now() })
  return r
}

export interface AudioEntry {
  title: string
  url: string
}

export async function fetchAudios(id: string): Promise<AudioEntry[]> {
  try {
    const res = await fetchJsonRetry(
      `https://s-file-1.ykt.cbern.com.cn/zxx/ndrs/resources/${id}/relation_audios.json`,
    )
    if (!res) return []
    const list = (await res.json()) as SeduAudio[]
    const out: AudioEntry[] = []
    list.forEach((a, i) => {
      for (const u of pickAudioUrls(a)) out.push({ title: audioTitle(a, out.length), url: u })
    })
    return out
  } catch {
    return []
  }
}

/** 仅允许平台 CDN 域名走代理。 */
export function isAllowedUpstream(url: string): boolean {
  try {
    const u = new URL(url)
    return (
      (u.protocol === "https:" || u.protocol === "http:") &&
      (u.hostname === "ykt.cbern.com.cn" || u.hostname.endsWith(".ykt.cbern.com.cn"))
    )
  } catch {
    return false
  }
}

/** 清理 Windows 文件名非法字符。 */
export function safeFilename(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|\r\n]+/g, " ").replace(/\s+/g, " ").trim()
  return (cleaned || "教材").slice(0, 120)
}

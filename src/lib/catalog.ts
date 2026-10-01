import { readFile, stat } from "fs/promises"
import path from "path"
import { resTypeOf, type ResType } from "./res-type"

// 服务端目录模块：重导出客户端安全的类型与工具（book/cover 路由使用）
export { resTypeOf }
export type { ResType }

export interface BookRecord {
  id: string
  title: string
  stage: string
  grade: string
  subject: string
  version: string
  volume: string
  revised: boolean
  res_type?: ResType
  /** 无详情接口权限的资源：分片自带的封面缩略图 URL */
  thumb?: string
  /** 幻灯片阅读路径前缀（r*-ndr 域名后），第 n 页 = https://r1-ndr.ykt.cbern.com.cn/{slides}/{n}.jpg */
  slides?: string
  slide_count?: number
}

export interface CatalogFile {
  updated: string
  total: number
  books: BookRecord[]
}

let cache: CatalogFile | null = null
let cachedMtimeMs = -1

/**
 * 目录读取（内存缓存 + mtime 失效）：
 * 月度自动更新脚本重写 catalog.json 后，无需重启进程即可生效。
 */
export async function getCatalog(): Promise<CatalogFile> {
  const file = path.join(process.cwd(), "data", "catalog.json")
  try {
    const st = await stat(file)
    if (cache && st.mtimeMs === cachedMtimeMs) return cache
    const raw = await readFile(file, "utf8")
    cache = JSON.parse(raw) as CatalogFile
    cachedMtimeMs = st.mtimeMs
  } catch {
    // 文件缺失/损坏：沿用旧缓存，完全没有时返回空目录
    if (!cache) cache = { updated: "", total: 0, books: [] }
  }
  return cache
}

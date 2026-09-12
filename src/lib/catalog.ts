import { readFile, stat } from "fs/promises"
import path from "path"

export interface BookRecord {
  id: string
  title: string
  stage: string
  grade: string
  subject: string
  version: string
  volume: string
  revised: boolean
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

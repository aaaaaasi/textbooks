// 全站中英文案字典与数据标签翻译。
// zh 为基准语言；en 缺失的键自动回落 zh（t() 内处理）。

export type Lang = "zh" | "en"

const zh = {
  brand: "电子教材库",
  platform: "国家中小学智慧教育平台",
  stats: "{total} 本教材，其中 2022 修订版 {revised} 本",
  catalogUpdated: "目录更新 {time}",
  searchPlaceholder: "搜索书名或关键词，如：九年级物理、History",
  searchLabel: "搜索教材",
  revisedOnly: "仅看修订版",
  revisedOnlyAria: "仅看2022课标修订版",
  countBooks: "{n} 本",
  downloading: "{n} 个下载中",
  stageAll: "全部",
  stagePrimary: "小学",
  stageJunior: "初中",
  stageSenior: "高中",
  stageSpecial: "特殊教育",
  stageAria: "学段",
  filterSubject: "学科",
  filterGrade: "年级",
  filterVolume: "册次",
  filterVersion: "版本",
  filterType: "类型",
  filterVersionAria: "按版本筛选，选项随前面条件变化",
  allSubjects: "全部学科",
  allGrades: "全部年级",
  allVolumes: "全部册次",
  allVersions: "全部版本",
  allTypes: "全部类型",
  typeStudent: "学生教材",
  typeTeacher: "教师用书",
  typeResource: "课件与指南",
  typeThematic: "专题课",
  reset: "重置",
  loadErr: "目录加载失败，请刷新页面重试。",
  noMatch: "没有找到匹配的教材",
  noMatchHint: "换个关键词，或放宽筛选条件再试",
  resetFilters: "重置筛选",
  viewDetail: "查看 {title} 详情",
  badgeRevised: "2022修订",
  read: "阅读",
  download: "下载",
  loadMore: "加载更多（还有 {n} 本）",
  footerNote:
    "教材数据与文件来源：国家中小学智慧教育平台（basic.smartedu.cn），电子资源仅供个人学习、备课使用，请尊重出版社版权。",
  langSwitch: "切换到英文",
  // 详情弹窗
  detailTitle: "教材详情",
  detailDesc: "查看教材详情、封面与配套资源",
  fStage: "学段",
  fGrade: "年级",
  fSubject: "学科",
  fVersion: "版本",
  fVolume: "册次",
  fSize: "文件大小",
  downloadPdf: "下载 PDF",
  readOnline: "在线阅读",
  audios: "配套音频（{n}）",
  downloadAudio: "下载音频",
  detailFail: "无法加载详情，请稍后重试",
  noSourceFile: "上游未提供源文件，可在线阅读",
  coverOf: "{title} 封面",
  // 下载托盘
  trayActive: "正在下载 {n} 个文件",
  trayDone: "下载完成",
  clear: "清除",
  expandTray: "展开下载列表",
  collapseTray: "收起下载列表",
  cancelDownload: "取消下载",
  removeRecord: "移除记录",
  progressAria: "下载进度 {n}%",
  doneSize: "已完成 {size}",
  dlFailed: "下载失败",
  cancelled: "已取消",
  // 预览页
  previewTitle: "教材预览",
  backHome: "返回教材库",
  openNew: "新窗口打开",
  prevPage: "上一页",
  nextPage: "下一页",
  zoomIn: "放大",
  zoomOut: "缩小",
  pageInput: "当前页码",
  flowReader: "流式阅读器",
  nativePreview: "原生预览",
  switchToFlow: "切换到流式阅读器（带加载进度与缩放）",
  switchToNative: "切换到浏览器原生预览",
  rendering: "渲染中",
  loadingPct: "加载中 {n}%",
  retry: "重试",
  loadFail: "加载失败：{msg}",
  renderFail: "页面渲染失败，请重试",
  noPreview: "上游未提供可预览的内容",
  loading: "加载中",
  slidesReader: "图文阅读",
  slideOf: "第 {cur} / {total} 页",
  nativeFrameTitle: "教材原生预览",
}

export type StrKey = keyof typeof zh

const en: Partial<Record<StrKey, string>> = {
  brand: "e-Textbook Library",
  platform: "National Smart Education Platform of China",
  stats: "{total} textbooks, {revised} of them 2022-revised editions",
  catalogUpdated: "Catalog updated {time}",
  searchPlaceholder: "Search titles or keywords, e.g. 九年级物理 or History",
  searchLabel: "Search textbooks",
  revisedOnly: "2022 revisions only",
  revisedOnlyAria: "Show only 2022-curriculum revised editions",
  countBooks: "{n} items",
  downloading: "{n} downloading",
  stageAll: "All",
  stagePrimary: "Primary",
  stageJunior: "Junior high",
  stageSenior: "Senior high",
  stageSpecial: "Special ed.",
  stageAria: "School stage",
  filterSubject: "Subject",
  filterGrade: "Grade",
  filterVolume: "Volume",
  filterVersion: "Edition",
  filterType: "Type",
  filterVersionAria: "Filter by edition; options follow previous filters",
  allSubjects: "All subjects",
  allGrades: "All grades",
  allVolumes: "All volumes",
  allVersions: "All editions",
  allTypes: "All types",
  typeStudent: "Textbooks",
  typeTeacher: "Teacher's books",
  typeResource: "Courseware & guides",
  typeThematic: "Thematic courses",
  reset: "Reset",
  loadErr: "Failed to load the catalog. Please refresh and try again.",
  noMatch: "No matching textbooks",
  noMatchHint: "Try different keywords or loosen the filters",
  resetFilters: "Reset filters",
  viewDetail: "View details of {title}",
  badgeRevised: "2022 rev.",
  read: "Read",
  download: "Download",
  loadMore: "Load more ({n} more)",
  footerNote:
    "Data & files from the National Smart Education Platform of China (basic.smartedu.cn). For personal study and lesson-prep use only. Please respect publishers' copyright.",
  langSwitch: "Switch to Chinese",
  detailTitle: "Details",
  detailDesc: "View details, cover and supplementary resources",
  fStage: "Stage",
  fGrade: "Grade",
  fSubject: "Subject",
  fVersion: "Edition",
  fVolume: "Volume",
  fSize: "File size",
  downloadPdf: "Download PDF",
  readOnline: "Read online",
  audios: "Audio ({n})",
  downloadAudio: "Download audio",
  detailFail: "Failed to load details. Please try again later.",
  noSourceFile: "No source file from upstream — read online instead",
  coverOf: "Cover of {title}",
  trayActive: "Downloading {n} file(s)",
  trayDone: "Downloads finished",
  clear: "Clear",
  expandTray: "Expand download list",
  collapseTray: "Collapse download list",
  cancelDownload: "Cancel download",
  removeRecord: "Remove record",
  progressAria: "Download progress {n}%",
  doneSize: "Completed {size}",
  dlFailed: "Download failed",
  cancelled: "Cancelled",
  previewTitle: "Textbook preview",
  backHome: "Back to library",
  openNew: "Open in new tab",
  prevPage: "Previous page",
  nextPage: "Next page",
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  pageInput: "Current page",
  flowReader: "Built-in reader",
  nativePreview: "Native preview",
  switchToFlow: "Switch to the built-in reader (progress & zoom)",
  switchToNative: "Switch to the browser's native viewer",
  rendering: "Rendering",
  loadingPct: "Loading {n}%",
  retry: "Retry",
  loadFail: "Failed to load: {msg}",
  renderFail: "Failed to render this page. Please retry.",
  noPreview: "No preview available from upstream",
  loading: "Loading",
  slidesReader: "Slide reader",
  slideOf: "Page {cur} / {total}",
  nativeFrameTitle: "Native textbook preview",
}

const DICT: Record<Lang, Partial<Record<StrKey, string>>> = { zh, en }

/** 文案取值：en 缺失回落 zh；支持 {name} 插值 */
export function tFor(lang: Lang): (key: StrKey, vars?: Record<string, string | number>) => string {
  return (key, vars) => {
    let s = DICT[lang][key] ?? zh[key] ?? String(key)
    if (vars) {
      for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v))
    }
    return s
  }
}

// ---- 数据标签（学段/年级/学科/资源类型）的英文显示 ----

const STAGE_EN: Record<string, string> = {
  小学: "Primary",
  初中: "Junior high",
  高中: "Senior high",
  特殊教育: "Special ed.",
}

const CN_DIGIT: Record<string, number> = {
  一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
}

/** 年级：一年级→Grade 1；一至二年级→Grades 1-2；其余原样 */
export function labelGrade(zh: string, lang: Lang): string {
  if (lang === "zh") return zh
  const range = zh.match(/^([一二三四五六七八九])至([一二三四五六七八九])年级$/)
  if (range && CN_DIGIT[range[1]] && CN_DIGIT[range[2]]) {
    return `Grades ${CN_DIGIT[range[1]]}-${CN_DIGIT[range[2]]}`
  }
  const single = zh.match(/^([一二三四五六七八九])年级$/)
  if (single && CN_DIGIT[single[1]]) return `Grade ${CN_DIGIT[single[1]]}`
  const senior: Record<string, string> = { 高一: "Senior 1", 高二: "Senior 2", 高三: "Senior 3" }
  return senior[zh] ?? zh
}

const SUBJECT_EN: Record<string, string> = {
  语文: "Chinese",
  数学: "Mathematics",
  英语: "English",
  物理: "Physics",
  化学: "Chemistry",
  历史: "History",
  地理: "Geography",
  生物: "Biology",
  科学: "Science",
  道德与法治: "Morality & Rule of Law",
  体育与健康: "Physical Education",
  音乐: "Music",
  美术: "Fine Arts",
  艺术: "Arts",
  "艺术·舞蹈/影视/戏剧": "Arts (Dance/Film/Drama)",
  信息科技: "Information Technology",
  劳动: "Labor",
  写字: "Handwriting",
  心理健康: "Mental Health",
  日语: "Japanese",
  俄语: "Russian",
  生活适应: "Life Adaptation",
}

export function labelSubject(zh: string, lang: Lang): string {
  return lang === "en" ? (SUBJECT_EN[zh] ?? zh) : zh
}

export function labelStage(zh: string, lang: Lang): string {
  return lang === "en" ? (STAGE_EN[zh] ?? zh) : zh
}

/** 学段 tab 值 → 文案键 */
export const STAGE_KEY: Record<string, StrKey> = {
  全部: "stageAll",
  小学: "stagePrimary",
  初中: "stageJunior",
  高中: "stageSenior",
  特殊教育: "stageSpecial",
}

/** 资源类型 → 文案键 */
export const TYPE_KEY: Record<string, StrKey> = {
  student: "typeStudent",
  teacher: "typeTeacher",
  resource: "typeResource",
  thematic: "typeThematic",
}

// ---- 英文搜索词映射（搜索 "History" 能命中 "历史"）----

/** 短语映射：先整短语替换，再分词 */
const PHRASES: [RegExp, string][] = [
  [/physical education/g, "体育与健康"],
  [/information technology/g, "信息科技"],
  [/moral(ity)? (and|&)? ?(rule of )?law/g, "道德与法治"],
  [/grade\s*(9|nine)/g, " 九年级 "],
  [/grade\s*(8|eight)/g, " 八年级 "],
  [/grade\s*(7|seven)/g, " 七年级 "],
  [/grade\s*(6|six)/g, " 六年级 "],
  [/grade\s*(5|five)/g, " 五年级 "],
  [/grade\s*(4|four)/g, " 四年级 "],
  [/grade\s*(3|three)/g, " 三年级 "],
  [/grade\s*(2|two)/g, " 二年级 "],
  [/grade\s*(1|one)\b/g, " 一年级 "],
]

/** 单词 → 中文候选（一个词可对应多个候选） */
const WORDS: Record<string, string[]> = {
  chinese: ["语文"],
  math: ["数学"],
  maths: ["数学"],
  mathematics: ["数学"],
  english: ["英语"],
  physics: ["物理"],
  chemistry: ["化学"],
  biology: ["生物"],
  history: ["历史"],
  geography: ["地理"],
  politics: ["道德与法治"],
  science: ["科学"],
  music: ["音乐"],
  art: ["美术", "艺术"],
  arts: ["美术", "艺术"],
  pe: ["体育与健康"],
  sports: ["体育与健康"],
  it: ["信息科技"],
  computer: ["信息科技"],
  japanese: ["日语"],
  russian: ["俄语"],
  labor: ["劳动"],
}

/**
 * 查询展开：英文短语/单词映射为中文候选。
 * 返回分词后的 token 列表；匹配时每个 token 视为命中，若原词或任一中文候选出现在字段里。
 */
export function expandQuery(q: string): string[] {
  let s = ` ${q.toLowerCase()} `
  for (const [re, zhTerm] of PHRASES) s = s.replace(re, ` ${zhTerm} `)
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((tok) => tok)
}

/** token 是否命中文本（原词或英文映射候选之一） */
export function tokenHits(token: string, hay: string): boolean {
  if (hay.includes(token)) return true
  const cands = WORDS[token]
  if (cands) return cands.some((c) => hay.includes(c))
  return false
}

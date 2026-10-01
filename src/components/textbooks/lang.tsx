"use client"

// 全站语言上下文：zh / en，选择持久化到 localStorage，并同步 <html lang>。
// RootLayout（服务端）以本组件包裹 children，首页与预览页共用。

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { tFor, type Lang, type StrKey } from "@/lib/i18n"

interface LangCtx {
  lang: Lang
  setLang: (l: Lang) => void
  t: (key: StrKey, vars?: Record<string, string | number>) => string
}

const Ctx = createContext<LangCtx>({ lang: "zh", setLang: () => {}, t: tFor("zh") })

const STORAGE_KEY = "tb-lang"

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  // 首帧固定 zh（SSR 一致），挂载后再读用户上次的选择，避免水合不匹配
  const [lang, setLangState] = useState<Lang>("zh")

  useEffect(() => {
    let saved: string | null = null
    try {
      saved = localStorage.getItem(STORAGE_KEY)
    } catch {
      // 隐私模式等场景下读取失败，保持默认
    }
    if (saved === "en" || saved === "zh") {
      // 挂载后同步外部存储（localStorage）中的语言偏好；SSR 首帧固定 zh，此处不会引发水合不匹配
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLangState(saved)
      document.documentElement.lang = saved === "en" ? "en" : "zh-CN"
    }
  }, [])

  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    try {
      localStorage.setItem(STORAGE_KEY, l)
    } catch {
      // 忽略
    }
    document.documentElement.lang = l === "en" ? "en" : "zh-CN"
  }, [])

  const t = useMemo(() => tFor(lang), [lang])

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useLang(): LangCtx {
  return useContext(Ctx)
}

/** 语言切换按钮：EN / 中 */
export function LangToggle() {
  const { lang, setLang } = useLang()
  return (
    <button
      onClick={() => setLang(lang === "zh" ? "en" : "zh")}
      className="inline-flex h-8 shrink-0 items-center rounded-md border px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      aria-label={lang === "zh" ? "Switch to English" : "切换到中文"}
    >
      {lang === "zh" ? "EN" : "中"}
    </button>
  )
}

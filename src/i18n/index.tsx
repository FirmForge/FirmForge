import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { de } from "./de";
import { en } from "./en";
import { es } from "./es";
import { fr } from "./fr";
import { it } from "./it";
import { ja } from "./ja";
import { ko } from "./ko";
import { ru } from "./ru";
import { zhHans, type Messages } from "./zh-Hans";
import { zhHant } from "./zh-Hant";

export type { Messages };
export type Lang = "zh-Hans" | "zh-Hant" | "en" | "ja" | "ko" | "de" | "fr" | "es" | "it" | "ru";
export type MessageKey = keyof Messages;
export type Vars = Record<string, string | number>;

export const LANGS: { code: Lang; native: string; english: string }[] = [
  { code: "zh-Hans", native: "简体中文", english: "Simplified Chinese" },
  { code: "zh-Hant", native: "繁體中文", english: "Traditional Chinese" },
  { code: "en", native: "English", english: "English" },
  { code: "ja", native: "日本語", english: "Japanese" },
  { code: "ko", native: "한국어", english: "Korean" },
  { code: "de", native: "Deutsch", english: "German" },
  { code: "fr", native: "Français", english: "French" },
  { code: "es", native: "Español", english: "Spanish" },
  { code: "it", native: "Italiano", english: "Italian" },
  { code: "ru", native: "Русский", english: "Russian" },
];

const DICT: Record<Lang, Messages> = {
  "zh-Hans": zhHans,
  "zh-Hant": zhHant,
  en,
  ja,
  ko,
  de,
  fr,
  es,
  it,
  ru,
};

const STORAGE_KEY = "wrt-ui.lang";
const FALLBACK: Lang = "zh-Hans";

/** 语言标签 → 受支持语言；zh 需要区分简繁，其余按主标签匹配。 */
function matchLang(tag: string): Lang | null {
  const lower = tag.toLowerCase();
  if (lower.startsWith("zh")) {
    return /hant|tw|hk|mo/.test(lower) ? "zh-Hant" : "zh-Hans";
  }
  const base = lower.split("-")[0] ?? lower;
  const found = LANGS.find((item) => item.code === base);
  return found ? found.code : null;
}

export function detectLang(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && stored in DICT) return stored as Lang;
  } catch {
    // 隐私模式下 localStorage 可能不可用，直接走系统语言。
  }
  const candidates = typeof navigator === "undefined" ? [] : (navigator.languages ?? [navigator.language]);
  for (const tag of candidates) {
    const matched = matchLang(tag);
    if (matched) return matched;
  }
  return FALLBACK;
}

function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  );
}

export function translate(lang: Lang, key: MessageKey, vars?: Vars): string {
  return interpolate(DICT[lang][key] ?? DICT[FALLBACK][key] ?? key, vars);
}

/**
 * 引擎名来自 Rust 后端（例如「内置 VM 引擎」），这里只翻译内置 VM 引擎，
 * Docker / WSL 是产品名，保持后端原文。
 */
export function engineLabel(name: string, t: (key: MessageKey) => string): string {
  return /vm/i.test(name) ? t("engine.vm") : name;
}

type ContextValue = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: MessageKey, vars?: Vars) => string;
};

const I18nContext = createContext<ContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => detectLang());

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // 存不下也不影响本次切换。
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const t = useCallback((key: MessageKey, vars?: Vars) => translate(lang, key, vars), [lang]);

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): ContextValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n 必须在 I18nProvider 内使用");
  return context;
}

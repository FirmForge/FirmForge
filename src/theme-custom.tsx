import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

/** 可自定义的外观：四支强调色 + 错误色、正文字体、附加 CSS。 */
export type CustomTheme = {
  primary: string;
  secondary: string;
  success: string;
  warning: string;
  error: string;
  font: "mono" | "sans" | "system";
  css: string;
};

export const DEFAULT_THEME: CustomTheme = {
  primary: "#ff006e",
  secondary: "#00d9ff",
  success: "#ccff00",
  warning: "#ff9500",
  error: "#ff006e",
  font: "mono",
  css: "",
};

const KEY = "wrt-ui.custom-theme";
const STYLE_ID = "wrt-ui-custom-css";
const FONTS: Record<CustomTheme["font"], string> = {
  mono: "var(--font-mono)",
  sans: "var(--font-sans)",
  system: "system-ui, -apple-system, 'Segoe UI', sans-serif",
};

const HEX = /^#[0-9a-fA-F]{6}$/;

export function normalizeTheme(input: Partial<CustomTheme> | null | undefined): CustomTheme {
  const next = { ...DEFAULT_THEME, ...(input ?? {}) };
  for (const key of ["primary", "secondary", "success", "warning", "error"] as const) {
    if (!HEX.test(next[key])) next[key] = DEFAULT_THEME[key];
  }
  if (!(next.font in FONTS)) next.font = "mono";
  return next;
}

function load(): CustomTheme {
  try {
    const raw = localStorage.getItem(KEY);
    return normalizeTheme(raw ? (JSON.parse(raw) as Partial<CustomTheme>) : null);
  } catch {
    return DEFAULT_THEME;
  }
}

export function applyTheme(theme: CustomTheme) {
  const root = document.documentElement;
  root.style.setProperty("--color-hot-pink", theme.primary);
  root.style.setProperty("--color-electric-cyan", theme.secondary);
  root.style.setProperty("--color-acid-lime", theme.success);
  root.style.setProperty("--color-tangerine", theme.warning);
  root.style.setProperty("--color-error", theme.error);
  root.style.setProperty("--font-body", FONTS[theme.font]);
  document.body.style.fontFamily = FONTS[theme.font];

  let tag = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!tag) {
    tag = document.createElement("style");
    tag.id = STYLE_ID;
    document.head.appendChild(tag);
  }
  tag.textContent = theme.css;
}

type ContextValue = {
  theme: CustomTheme;
  save: (next: CustomTheme) => void;
  reset: () => void;
};

const ThemeCustomContext = createContext<ContextValue | null>(null);

export function ThemeCustomProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<CustomTheme>(() => load());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const save = useCallback((next: CustomTheme) => {
    const clean = normalizeTheme(next);
    setTheme(clean);
    try {
      localStorage.setItem(KEY, JSON.stringify(clean));
    } catch {
      // 隐私模式写不进去也不影响本次生效
    }
  }, []);

  const reset = useCallback(() => save(DEFAULT_THEME), [save]);

  const value = useMemo(() => ({ theme, save, reset }), [theme, save, reset]);
  return <ThemeCustomContext.Provider value={value}>{children}</ThemeCustomContext.Provider>;
}

export function useThemeCustom(): ContextValue {
  const ctx = useContext(ThemeCustomContext);
  if (!ctx) throw new Error("useThemeCustom 必须在 ThemeCustomProvider 内使用");
  return ctx;
}

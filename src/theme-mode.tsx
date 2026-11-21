import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Theme } from "@mui/material/styles";
import { createBrutalTheme, type ThemeMode } from "./theme";
import { api, isDesktop } from "./api";
export type { ThemeMode };

/** 用户偏好：跟随系统时由系统明暗决定实际 mode。 */
export type ThemePref = ThemeMode | "system";

const STORAGE_KEY = "firmforge.theme";

function systemMode(): ThemeMode {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function resolvePref(pref: ThemePref): ThemeMode {
  return pref === "system" ? systemMode() : pref;
}

/** 设计规范以浅色为基准，首次启动默认浅色；用户选择后记住。 */
export function detectThemePref(): ThemePref {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
  } catch {
    // 隐私模式下 localStorage 可能不可用。
  }
  return "light";
}

export function detectThemeMode(): ThemeMode {
  return resolvePref(detectThemePref());
}

type ContextValue = {
  /** 实际生效的明暗。 */
  mode: ThemeMode;
  /** 用户选择（含“跟随系统”）。 */
  pref: ThemePref;
  setMode: (pref: ThemePref) => void;
  /** 从后端设置回填，不写回磁盘。 */
  hydrate: (pref: ThemePref) => void;
  toggle: () => void;
  theme: Theme;
};

const ThemeModeContext = createContext<ContextValue | null>(null);

export function ThemeModeProvider({ children }: { children: ReactNode }) {
  const [pref, setPref] = useState<ThemePref>(() => detectThemePref());
  const [mode, setResolved] = useState<ThemeMode>(() => resolvePref(pref));

  const hydrate = useCallback((next: ThemePref) => {
    setPref(next);
    setResolved(resolvePref(next));
    // 同步首帧缓存，避免下次启动先闪一帧旧主题
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // 忽略隐私模式下的写入失败
    }
  }, []);

  const setMode = useCallback((next: ThemePref) => {
    setPref(next);
    setResolved(resolvePref(next));
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // 存不下也不影响本次切换。
    }
    // settings.json 才是权威来源，localStorage 只负责首帧不出闪。
    if (isDesktop()) void api.savePrefs({ theme: next }).catch(() => {});
  }, []);

  const toggle = useCallback(() => setMode(resolvePref(pref) === "dark" ? "light" : "dark"), [pref, setMode]);

  // 跟随系统时监听系统主题变化。
  useEffect(() => {
    if (pref !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setResolved(mq.matches ? "dark" : "light");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [pref]);

  useEffect(() => {
    document.documentElement.dataset.theme = mode;
    // 原生窗口边框/滚动条跟随主题，否则暗色下外面还是一条亮边
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", mode === "dark" ? "#0b0b0b" : "#ffffff");
    if (isDesktop()) {
      void import("@tauri-apps/api/window")
        .then(({ getCurrentWindow }) => getCurrentWindow().setTheme(mode))
        .catch(() => {});
    }
  }, [mode]);

  const theme = useMemo(() => createBrutalTheme(mode), [mode]);
  const value = useMemo(
    () => ({ mode, pref, setMode, hydrate, toggle, theme }),
    [mode, pref, setMode, hydrate, toggle, theme],
  );

  return <ThemeModeContext.Provider value={value}>{children}</ThemeModeContext.Provider>;
}

export function useThemeMode(): ContextValue {
  const context = useContext(ThemeModeContext);
  if (!context) throw new Error("useThemeMode 必须在 ThemeModeProvider 内使用");
  return context;
}

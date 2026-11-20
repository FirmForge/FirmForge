import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Theme } from "@mui/material/styles";
import { createBrutalTheme, type ThemeMode } from "./theme";
export type { ThemeMode };

const STORAGE_KEY = "wrt-ui.theme";

/** 设计规范以浅色为基准，默认不跟随系统，用户切换后记住选择。 */
export function detectThemeMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // 隐私模式下 localStorage 可能不可用。
  }
  return "light";
}

type ContextValue = {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
  theme: Theme;
};

const ThemeModeContext = createContext<ContextValue | null>(null);

export function ThemeModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => detectThemeMode());

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // 存不下也不影响本次切换。
    }
  }, []);

  const toggle = useCallback(() => setMode(mode === "dark" ? "light" : "dark"), [mode, setMode]);

  useEffect(() => {
    document.documentElement.dataset.theme = mode;
  }, [mode]);

  const theme = useMemo(() => createBrutalTheme(mode), [mode]);
  const value = useMemo(() => ({ mode, setMode, toggle, theme }), [mode, setMode, toggle, theme]);

  return <ThemeModeContext.Provider value={value}>{children}</ThemeModeContext.Provider>;
}

export function useThemeMode(): ContextValue {
  const context = useContext(ThemeModeContext);
  if (!context) throw new Error("useThemeMode 必须在 ThemeModeProvider 内使用");
  return context;
}

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CssBaseline, ThemeProvider } from "@mui/material";
import App from "./App";
import { I18nProvider } from "./i18n";
import { detectThemeMode, ThemeModeProvider, useThemeMode } from "./theme-mode";
import "./styles/tokens.css";

// 首帧之前就把主题写到 <html>，避免刷新时闪一下亮色。
document.documentElement.dataset.theme = detectThemeMode();

const container = document.getElementById("root");
if (!container) {
  throw new Error("缺少根节点 #root");
}

function Root() {
  const { theme } = useThemeMode();
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  );
}

createRoot(container).render(
  <StrictMode>
    <I18nProvider>
      <ThemeModeProvider>
        <Root />
      </ThemeModeProvider>
    </I18nProvider>
  </StrictMode>,
);

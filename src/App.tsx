import { useCallback, useEffect, useState } from "react";
import { Box, MenuItem, Select, Stack, Typography } from "@mui/material";
import ConstructionIcon from "@mui/icons-material/Construction";
import DarkModeOutlined from "@mui/icons-material/DarkModeOutlined";
import LightModeOutlined from "@mui/icons-material/LightModeOutlined";
import HistoryIcon from "@mui/icons-material/History";
import SettingsIcon from "@mui/icons-material/Settings";
import logo from "./assets/logo.png";
import { api, isDesktop } from "./api";
import BuildPage from "./pages/BuildPage";
import HistoryPage from "./pages/HistoryPage";
import SettingsPage from "./pages/SettingsPage";
import { ErrorNotice, LoadingBlock, MonoLabel, Panel, Toast } from "./components/Common";
import { engineLabel, LANGS, useI18n, type Lang, type MessageKey } from "./i18n";
import {
  activeFill,
  activeText,
  border,
  ink,
  labelStyle,
  lime,
  onAccent,
  onPink,
  paper,
  pink,
  shadowSm,
  slab,
} from "./styles/tokens";
import { useThemeMode, type ThemeMode } from "./theme-mode";
import { useUpdateCheck } from "./update";
import type { Environment, Settings } from "./types";

type Page = "build" | "history" | "settings";

const THEME_CHOICES: { value: ThemeMode; icon: typeof LightModeOutlined; labelKey: MessageKey }[] = [
  { value: "light", icon: LightModeOutlined, labelKey: "theme.light" },
  { value: "dark", icon: DarkModeOutlined, labelKey: "theme.dark" },
];

const NAV: { key: Page; labelKey: MessageKey; descKey: MessageKey; icon: typeof ConstructionIcon }[] = [
  { key: "build", labelKey: "nav.build", descKey: "page.build.desc", icon: ConstructionIcon },
  { key: "history", labelKey: "nav.history", descKey: "page.history.desc", icon: HistoryIcon },
  { key: "settings", labelKey: "nav.settings", descKey: "page.settings.desc", icon: SettingsIcon },
];

export default function App() {
  const { t, lang, setLang, hydrateLang } = useI18n();
  const { mode, setMode, hydrate } = useThemeMode();
  const update = useUpdateCheck();
  const [page, setPage] = useState<Page>("build");
  const [visited, setVisited] = useState<Set<Page>>(() => new Set<Page>(["build"]));
  const [settings, setSettings] = useState<Settings | null>(null);
  const [env, setEnv] = useState<Environment | null>(null);
  const [notice, setNotice] = useState<{ text: string; tone: "success" | "error" | "info" } | null>(null);
  const [fatal, setFatal] = useState("");
  const [ready, setReady] = useState(false);

  const notify = useCallback(
    (text: string, tone: "success" | "error" | "info" = "info") => setNotice({ text, tone }),
    [],
  );
  const onError = useCallback((text: string) => setNotice({ text, tone: "error" }), []);
  const closeNotice = useCallback(() => setNotice(null), []);

  const go = useCallback((next: Page) => {
    setPage(next);
    setVisited((prev) => (prev.has(next) ? prev : new Set(prev).add(next)));
  }, []);

  const bootstrap = useCallback(async () => {
    if (!isDesktop()) {
      setFatal("desktop-required");
      setReady(true);
      return;
    }
    try {
      const loaded = await api.settings();
      setSettings(loaded);
      // settings.json 记录上次的主题与语言；localStorage 只用于首帧。
      if (loaded.theme === "light" || loaded.theme === "dark") hydrate(loaded.theme);
      if (loaded.language) hydrateLang(loaded.language as Lang);
      const environment = await api.environment();
      setEnv(environment);
    } catch (e) {
      setFatal(e instanceof Error ? e.message : String(e));
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const current = NAV.find((item) => item.key === page) ?? {
    key: page,
    labelKey: "nav.build" as MessageKey,
    descKey: "page.build.desc" as MessageKey,
    icon: ConstructionIcon,
  };
  const envTone = env ? (env.available ? lime : pink) : slab;
  const envName = env ? engineLabel(env.name, t) : "";
  const envText = env ? `${envName} · ${env.available ? t("env.ready") : t("env.down")}` : t("env.checking");

  return (
    <Box sx={{ display: "flex", height: "100vh", backgroundColor: paper, overflow: "hidden" }}>
      <Box
        component="aside"
        sx={{
          width: { xs: 76, md: 232 },
          flexShrink: 0,
          borderRight: border,
          display: "flex",
          flexDirection: "column",
          backgroundColor: paper,
        }}
      >
        <Stack
          direction="row"
          spacing={1.5}
          sx={{ alignItems: "center", px: { xs: 1.5, md: 2 }, py: 2, borderBottom: border, minHeight: 84 }}
        >
          <Box
            sx={{
              width: 40,
              height: 40,
              flexShrink: 0,
              border,
              boxShadow: shadowSm,
              backgroundColor: paper,
              display: "grid",
              placeItems: "center",
            }}
          >
            <Box component="img" src={logo} alt="WRT-UI" sx={{ width: 32, height: 32, display: "block" }} />
          </Box>
          <Box sx={{ minWidth: 0, display: { xs: "none", md: "block" } }}>
            <Typography
              component="p"
              sx={{ fontSize: 22, fontWeight: 900, lineHeight: 1, letterSpacing: "-0.02em" }}
            >
              WRT-UI
            </Typography>
            <Typography component="p" sx={{ ...labelStyle, letterSpacing: "0.12em", mt: 0.5 }}>
              {t("app.subtitle")}
            </Typography>
          </Box>
        </Stack>

        <Box
          component="nav"
          aria-label={t("aria.nav")}
          sx={{ p: { xs: 1, md: 1.5 }, display: "flex", flexDirection: "column", gap: 1 }}
        >
          {NAV.map((item, index) => {
            const Icon = item.icon;
            const active = page === item.key;
            return (
              <Box
                component="button"
                type="button"
                key={item.key}
                aria-current={active ? "page" : undefined}
                title={t(item.labelKey)}
                onClick={() => go(item.key)}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1.25,
                  justifyContent: { xs: "center", md: "flex-start" },
                  width: "100%",
                  px: { xs: 0, md: 1.5 },
                  py: 1.5,
                  border,
                  backgroundColor: active ? activeFill : paper,
                  color: active ? activeText : ink,
                  boxShadow: active ? "none" : shadowSm,
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "background-color var(--ease-out), box-shadow var(--ease-out)",
                  "&:hover": { backgroundColor: active ? activeFill : lime, color: active ? activeText : onAccent },
                }}
              >
                <Icon sx={{ fontSize: 18, flexShrink: 0 }} />
                <Typography
                  component="span"
                  sx={{
                    display: { xs: "none", md: "block" },
                    fontSize: 13,
                    fontWeight: active ? 700 : 400,
                    letterSpacing: "0.04em",
                    whiteSpace: "nowrap",
                  }}
                >
                  {t(item.labelKey)}
                </Typography>
                <Box
                  component="span"
                  sx={{
                    display: { xs: "none", md: "block" },
                    ml: "auto",
                    ...labelStyle,
                    letterSpacing: "0.04em",
                    color: active ? paper : ink,
                  }}
                >
                  {String(index + 1).padStart(2, "0")}
                </Box>
              </Box>
            );
          })}
        </Box>

        <Box sx={{ mt: "auto", p: { xs: 1, md: 1.5 }, borderTop: border }}>
          <Typography
            component="p"
            sx={{ ...labelStyle, letterSpacing: "0.12em", display: { xs: "none", md: "block" } }}
          >
            {t("notice.env")}
          </Typography>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", mt: { xs: 0, md: 1 }, minWidth: 0 }}>
            <Box
              sx={{
                width: 10,
                height: 10,
                flexShrink: 0,
                backgroundColor: envTone,
                border: `2px solid ${ink}`,
              }}
            />
            <Typography
              sx={{
                display: { xs: "none", md: "block" },
                fontSize: 12,
                fontWeight: 700,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {envName || t("env.checking")}
            </Typography>
          </Stack>
          <Box sx={{ mt: 1.25, display: { xs: "none", md: "block" } }}>
            <MonoLabel tone="paper">
              {settings ? (settings.ecosystem === "openwrt" ? "OpenWrt" : "ImmortalWrt") : "—"}
            </MonoLabel>
          </Box>
          <Box sx={{ mt: 2, pt: 2, borderTop: border, display: { xs: "none", md: "block" } }}>
            <Typography
              component="label"
              htmlFor="wrt-ui-language"
              sx={{ ...labelStyle, letterSpacing: "0.1em", fontSize: 11, display: "block", mb: 0.75 }}
            >
              {t("lang.label")}
            </Typography>
            <Select
              id="wrt-ui-language"
              value={lang}
              onChange={(e) => setLang(e.target.value as Lang)}
              size="small"
              fullWidth
              aria-label={t("lang.label")}
              sx={{ backgroundColor: paper }}
            >
              {LANGS.map((item) => (
                <MenuItem key={item.code} value={item.code} sx={{ fontSize: 13 }}>
                  {item.native}
                </MenuItem>
              ))}
            </Select>
          </Box>
        </Box>
      </Box>

      <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <Box
          component="header"
          sx={{
            flexShrink: 0,
            borderBottom: border,
            backgroundColor: paper,
            px: { xs: 2, md: 4 },
            py: 2.5,
            display: "flex",
            alignItems: "flex-end",
            flexWrap: "wrap",
            gap: 2,
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h2" component="h1">
              {t(current.labelKey)}
            </Typography>
            <Typography sx={{ fontSize: 12, mt: 1, letterSpacing: "0.02em" }}>{t(current.descKey)}</Typography>
          </Box>
          <Stack
            direction="row"
            spacing={1.5}
            sx={{ ml: "auto", alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}
          >
            {update.info?.available ? (
              <Box
                component="button"
                type="button"
                onClick={() => go("settings")}
                title={t("update.available", { version: update.info.latest })}
                sx={{
                  ...labelStyle,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 0.75,
                  backgroundColor: pink,
                  color: onPink,
                  px: 1,
                  py: "4px",
                  cursor: "pointer",
                  boxShadow: shadowSm,
                  transition: "background-color var(--ease-out)",
                  "&:hover": { backgroundColor: lime, color: onAccent },
                }}
              >
                {t("update.title")} {update.info.latest}
              </Box>
            ) : null}
            <Box
              role="group"
              aria-label={t("theme.label")}
              sx={{ display: "inline-flex", border, backgroundColor: paper, boxShadow: shadowSm }}
            >
              {THEME_CHOICES.map((choice, index) => {
                const Icon = choice.icon;
                const active = mode === choice.value;
                return (
                  <Box
                    component="button"
                    type="button"
                    key={choice.value}
                    aria-pressed={active}
                    title={t(choice.labelKey)}
                    onClick={() => setMode(choice.value)}
                    sx={{
                      display: "grid",
                      placeItems: "center",
                      width: 34,
                      height: 32,
                      border: 0,
                      borderLeft: index === 0 ? 0 : border,
                      backgroundColor: active ? activeFill : paper,
                      color: active ? activeText : ink,
                      cursor: "pointer",
                      transition: "background-color var(--ease-out)",
                      "&:hover": { backgroundColor: active ? activeFill : lime, color: active ? activeText : onAccent },
                    }}
                  >
                    <Icon sx={{ fontSize: 16 }} />
                  </Box>
                );
              })}
            </Box>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0 }}>
              <Box
                sx={{
                  width: 10,
                  height: 10,
                  flexShrink: 0,
                  border: `2px solid ${ink}`,
                  backgroundColor: envTone,
                }}
              />
              <Typography sx={{ fontSize: 12, fontWeight: 700 }}>{envText}</Typography>
            </Stack>
          </Stack>
        </Box>

        <Box
          component="main"
          sx={{ flex: 1, minHeight: 0, overflow: "auto", px: { xs: 2, md: 4 }, py: { xs: 2, md: 3 }, pb: 6 }}
        >
          <Box sx={{ maxWidth: "var(--page-max-width)", mx: "auto" }}>
            {fatal ? (
              <Panel elevation="lg" sx={{ borderLeft: `8px solid ${pink}`, maxWidth: 720 }}>
                <Typography variant="h3" component="h2" sx={{ mb: 1 }}>
                  {t("error.needDesktopTitle")}
                </Typography>
                <ErrorNotice message={fatal === "desktop-required" ? t("error.needDesktopBody") : fatal} />
                <Typography sx={{ fontSize: 13, mt: 2, lineHeight: 1.65 }}>
                  {t("error.needDesktopFoot")}
                </Typography>
              </Panel>
            ) : !ready || !settings ? (
              <Panel elevation="lg" sx={{ maxWidth: 720 }}>
                <LoadingBlock label={t("boot.loading")} />
              </Panel>
            ) : (
              <>
                {/* 三个页面保持挂载：切换标签不会中断正在进行的构建、订阅或已填写的表单。 */}
                <Box sx={{ display: page === "build" ? "block" : "none" }}>
                  <BuildPage settings={settings} env={env} onNotify={notify} />
                </Box>
                <Box sx={{ display: page === "history" ? "block" : "none" }}>
                  {visited.has("history") ? (
                    <HistoryPage active={page === "history"} onNotify={notify} onError={onError} />
                  ) : null}
                </Box>
                <Box sx={{ display: page === "settings" ? "block" : "none" }}>
                  {visited.has("settings") ? (
                    <SettingsPage
                      settings={settings}
                      env={env}
                      update={update}
                      onSettings={setSettings}
                      onNotify={notify}
                      onError={onError}
                    />
                  ) : null}
                </Box>
              </>
            )}
          </Box>
        </Box>
      </Box>

      <Toast notice={notice} onClose={closeNotice} />
    </Box>
  );
}

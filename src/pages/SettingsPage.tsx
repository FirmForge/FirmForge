import { useCallback, useEffect, useState } from "react";
import {
  Box,
  Button,
  FormControlLabel,
  IconButton,
  LinearProgress,
  MenuItem,
  Select,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/DeleteOutlined";
import FolderIcon from "@mui/icons-material/FolderOpenOutlined";
import PaletteIcon from "@mui/icons-material/PaletteOutlined";
import CloudIcon from "@mui/icons-material/CloudQueueOutlined";
import TuneIcon from "@mui/icons-material/TuneOutlined";
import UpdateIcon from "@mui/icons-material/SystemUpdateAltOutlined";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { relaunch } from "@tauri-apps/plugin-process";
import { api, autostart, isDesktop } from "../api";
import {
  ErrorNotice,
  FieldRow,
  MonoLabel,
  Notice,
  Panel,
  SectionTitle,
  Segmented,
} from "../components/Common";
import { formatTime } from "../format";
import { engineLabel, LANGS, useI18n, type MessageKey } from "../i18n";
import { border, ink, labelStyle, paper, pink, shadowSm } from "../styles/tokens";
import { useThemeMode } from "../theme-mode";
import type { UpdateState } from "../update";
import { formatNotes } from "../version";
import type { Environment, MirrorSource, Settings } from "../types";

type Props = {
  settings: Settings;
  env: Environment | null;
  update: UpdateState;
  onSettings: (settings: Settings) => void;
  onNotify: (message: string, tone?: "success" | "error" | "info") => void;
  onError: (message: string) => void;
};

type GroupKey = "appearance" | "source" | "system" | "update";

const GROUPS: { key: GroupKey; labelKey: MessageKey; icon: typeof PaletteIcon }[] = [
  { key: "appearance", labelKey: "settings.group.appearance", icon: PaletteIcon },
  { key: "source", labelKey: "settings.group.source", icon: CloudIcon },
  { key: "system", labelKey: "settings.group.system", icon: TuneIcon },
  { key: "update", labelKey: "settings.group.update", icon: UpdateIcon },
];

function PanelHead({ title, meta }: { title: string; meta?: string }) {
  return (
    <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", mb: 2, minWidth: 0 }}>
      <Typography component="h2" sx={{ fontSize: 15, fontWeight: 700, whiteSpace: "nowrap" }}>
        {title}
      </Typography>
      <Box sx={{ flex: 1, minWidth: 16, height: 2, backgroundColor: ink }} />
      {meta ? <Typography sx={{ fontSize: 11.5 }}>{meta}</Typography> : null}
    </Stack>
  );
}

export default function SettingsPage({ settings, env, update, onSettings, onNotify, onError }: Props) {
  const { t, lang, setLang } = useI18n();
  const theme = useThemeMode();
  const [group, setGroup] = useState<GroupKey>("appearance");
  const [mirrors, setMirrors] = useState<MirrorSource[]>(settings.mirrors);
  const [proxy, setProxy] = useState(settings.proxy);
  const [saving, setSaving] = useState(false);
  const [autostartOn, setAutostartOn] = useState(false);
  const [changingDir, setChangingDir] = useState(false);
  const [uwpList, setUwpList] = useState<string[]>([]);
  const [uwpInput, setUwpInput] = useState("");
  const [uwpBusy, setUwpBusy] = useState(false);

  useEffect(() => {
    void autostart
      .isEnabled()
      .then(setAutostartOn)
      .catch(() => undefined);
  }, []);

  const toggleAutostart = useCallback(
    async (next: boolean) => {
      try {
        await autostart.set(next);
        setAutostartOn(next);
        onNotify(next ? t("toast.autostartOn") : t("toast.autostartOff"), "success");
      } catch (e) {
        onError(e instanceof Error ? e.message : String(e));
      }
    },
    [onNotify, onError, t],
  );

  useEffect(() => {
    setMirrors(settings.mirrors);
    setProxy(settings.proxy);
  }, [settings]);

  // UWP 名单只在“系统”分组可见时读取，避免无谓的系统调用。
  useEffect(() => {
    if (group !== "system" || !isDesktop()) return;
    let alive = true;
    void api
      .uwpLoopbackList()
      .then((list) => {
        if (alive) setUwpList(Array.isArray(list) ? list : []);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [group]);

  const ecosystem = settings.ecosystem;

  const switchEcosystem = useCallback(
    async (next: Settings["ecosystem"]) => {
      if (next === ecosystem) return;
      setSaving(true);
      try {
        const updated = await api.switchEcosystem(next);
        onSettings(updated);
        onNotify(t("toast.ecosystem"), "success");
      } catch (e) {
        onError(e instanceof Error ? e.message : String(e));
      } finally {
        setSaving(false);
      }
    },
    [ecosystem, onSettings, onNotify, onError, t],
  );

  const saveAll = useCallback(async () => {
    setSaving(true);
    try {
      let updated = await api.saveMirrors(mirrors.map((m) => ({ name: m.name, url: m.url })));
      updated = await api.saveProxy(proxy);
      onSettings(updated);
      onNotify(t("toast.settingsSaved"), "success");
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [mirrors, proxy, onSettings, onNotify, onError, t]);

  const changeDataDir = useCallback(async () => {
    if (!isDesktop()) return;
    setChangingDir(true);
    try {
      const picked = await openDialog({ directory: true, multiple: false, title: t("settings.changeDir") });
      const path = typeof picked === "string" ? picked : Array.isArray(picked) ? picked[0] : null;
      if (!path) return;
      await api.setDataDir(path);
      onNotify(t("settings.dirChanged"), "success");
      await relaunch();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setChangingDir(false);
    }
  }, [onError, onNotify, t]);

  const openDataDir = useCallback(async () => {
    try {
      const path = await api.openDataDir();
      onNotify(t("toast.dataDir", { path }), "info");
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  }, [onNotify, onError, t]);

  const addUwp = useCallback(async () => {
    const name = uwpInput.trim();
    if (!name) return;
    setUwpBusy(true);
    try {
      await api.uwpLoopbackAdd(name);
      setUwpInput("");
      const next = await api.uwpLoopbackList();
      setUwpList(Array.isArray(next) ? next : []);
      onNotify(t("settings.uwpAdded"), "success");
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setUwpBusy(false);
    }
  }, [uwpInput, onNotify, onError, t]);

  return (
    <Stack spacing={3}>
      <SectionTitle
        kicker="SETTINGS"
        hint={t("settings.hint")}
        meta={saving ? <MonoLabel tone="cyan">{t("common.saving")}</MonoLabel> : undefined}
      />

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "220px minmax(0, 1fr)" },
          gap: 2.5,
          alignItems: "start",
        }}
      >
        <Box
          component="nav"
          aria-label={t("settings.title")}
          sx={{
            border,
            backgroundColor: paper,
            boxShadow: shadowSm,
            position: { md: "sticky" },
            top: 0,
          }}
        >
          {GROUPS.map((item, index) => {
            const Icon = item.icon;
            const active = group === item.key;
            return (
              <Box
                component="button"
                type="button"
                key={item.key}
                onClick={() => setGroup(item.key)}
                aria-current={active ? "true" : undefined}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1.25,
                  width: "100%",
                  px: 1.5,
                  py: 1.5,
                  border: 0,
                  borderBottom: index === GROUPS.length - 1 ? 0 : border,
                  backgroundColor: active ? ink : paper,
                  color: active ? paper : ink,
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "background-color var(--ease-out)",
                  "&:hover": { backgroundColor: active ? ink : "var(--color-acid-lime)", color: "#000" },
                }}
              >
                <Icon sx={{ fontSize: 17, flexShrink: 0 }} />
                <Typography sx={{ fontSize: 12.5, fontWeight: active ? 700 : 400, letterSpacing: "0.04em" }}>
                  {t(item.labelKey)}
                </Typography>
              </Box>
            );
          })}
        </Box>

        <Stack spacing={2.5} sx={{ minWidth: 0 }}>
          {group === "appearance" ? (
            <>
              <Panel>
                <PanelHead title={t("settings.theme")} />
                <Segmented
                  ariaLabel={t("settings.theme")}
                  value={theme.pref}
                  onChange={(value: "light" | "dark" | "system") => theme.setMode(value)}
                  options={[
                    { value: "light", label: t("settings.themeLight") },
                    { value: "dark", label: t("settings.themeDark") },
                    { value: "system", label: t("settings.themeSystem") },
                  ]}
                />
                <Typography sx={{ fontSize: 11.5, mt: 1.5, lineHeight: 1.7 }}>{t("settings.themeHint")}</Typography>
              </Panel>

              <Panel>
                <PanelHead title={t("lang.label")} />
                <FieldRow label={t("lang.label")}>
                  <Select
                    value={lang}
                    onChange={(e) => setLang(e.target.value as typeof lang)}
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
                </FieldRow>
              </Panel>
            </>
          ) : null}

          {group === "source" ? (
            <>
              <Panel>
                <PanelHead title={t("settings.ecosystem")} />
                <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ alignItems: { md: "center" } }}>
                  <Segmented
                    ariaLabel={t("settings.ecosystem")}
                    value={ecosystem}
                    disabled={saving}
                    onChange={(value: Settings["ecosystem"]) => void switchEcosystem(value)}
                    options={[
                      { value: "immortalwrt", label: "ImmortalWrt" },
                      { value: "openwrt", label: "OpenWrt" },
                    ]}
                  />
                  <Typography sx={{ fontSize: 11.5, ml: { md: "auto" } }}>{t("settings.ecosystemReset")}</Typography>
                </Stack>
                {env && !env.available ? (
                  <Box sx={{ mt: 2 }}>
                    <Notice tone="tangerine" label={t("notice.env")}>
                      {t("error.engine", { name: engineLabel(env.name, t), message: env.message })}
                    </Notice>
                  </Box>
                ) : null}
              </Panel>

              <Panel>
                <PanelHead title={t("settings.mirrors")} meta={t("settings.mirrorCount", { n: mirrors.length })} />
                <Stack spacing={2}>
                  {mirrors.map((mirror, index) => (
                    <Box key={index} sx={{ border, backgroundColor: paper, p: 1.5, minWidth: 0 }}>
                      <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", mb: 1.5 }}>
                        <MonoLabel tone="paper">
                          {t("settings.source", { n: String(index + 1).padStart(2, "0") })}
                        </MonoLabel>
                        <Box sx={{ flex: 1, minWidth: 16, height: 2, backgroundColor: ink }} />
                        <Tooltip title={t("settings.deleteSource", { n: index + 1 })}>
                          <span>
                            <IconButton
                              size="small"
                              aria-label={t("settings.deleteSource", { n: index + 1 })}
                              disabled={mirrors.length <= 1}
                              onClick={() => setMirrors(mirrors.filter((_, i) => i !== index))}
                              sx={{ "&:hover": { backgroundColor: pink, color: paper } }}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </Stack>
                      <Box
                        sx={{
                          display: "grid",
                          gridTemplateColumns: { xs: "1fr", md: "200px minmax(0, 1fr)" },
                          gap: 1.5,
                        }}
                      >
                        <FieldRow label={t("settings.name")}>
                          <TextField
                            value={mirror.name}
                            onChange={(e) => {
                              const next = [...mirrors];
                              next[index] = { ...(next[index] ?? { name: "", url: "" }), name: e.target.value };
                              setMirrors(next);
                            }}
                            fullWidth
                            slotProps={{ htmlInput: { "aria-label": `${t("settings.name")} ${index + 1}` } }}
                          />
                        </FieldRow>
                        <FieldRow label={t("settings.address")}>
                          <TextField
                            value={mirror.url}
                            onChange={(e) => {
                              const next = [...mirrors];
                              next[index] = { ...(next[index] ?? { name: "", url: "" }), url: e.target.value };
                              setMirrors(next);
                            }}
                            fullWidth
                            slotProps={{ htmlInput: { "aria-label": `${t("settings.address")} ${index + 1}` } }}
                          />
                        </FieldRow>
                      </Box>
                    </Box>
                  ))}
                </Stack>
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  spacing={1.5}
                  sx={{ alignItems: { sm: "center" }, mt: 2 }}
                >
                  <Button
                    size="small"
                    startIcon={<AddIcon />}
                    disabled={mirrors.length >= 32}
                    onClick={() => setMirrors([...mirrors, { name: "", url: "" }])}
                  >
                    {t("settings.addSource")}
                  </Button>
                  <Typography sx={{ fontSize: 11.5 }}>{t("settings.mirrorNote")}</Typography>
                </Stack>
              </Panel>

              <Panel>
                <PanelHead title={t("settings.proxy")} />
                <FieldRow label={t("settings.proxyLabel")} hint={t("settings.proxyHint")}>
                  <TextField
                    value={proxy}
                    onChange={(e) => setProxy(e.target.value)}
                    placeholder="socks5://127.0.0.1:1080"
                    fullWidth
                    slotProps={{ htmlInput: { "aria-label": t("settings.proxyLabel") } }}
                  />
                </FieldRow>
              </Panel>
            </>
          ) : null}

          {group === "system" ? (
            <>
              <Panel>
                <PanelHead title={t("settings.dataDir")} />
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  spacing={2}
                  sx={{ alignItems: { sm: "center" } }}
                >
                  <Typography sx={{ flex: 1, minWidth: 0, fontSize: 12.5, wordBreak: "break-all" }}>
                    {settings.data_dir}
                  </Typography>
                  <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
                    <Button size="small" startIcon={<FolderIcon />} onClick={() => void openDataDir()}>
                      {t("common.open")}
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={changingDir}
                      onClick={() => void changeDataDir()}
                    >
                      {changingDir ? t("settings.changingDir") : t("settings.changeDir")}
                    </Button>
                  </Stack>
                </Stack>
                <Typography sx={{ fontSize: 11.5, mt: 1.5 }}>{t("settings.dataDirNote")}</Typography>
              </Panel>

              <Panel>
                <PanelHead title={t("settings.startup")} />
                <FormControlLabel
                  control={<Switch checked={autostartOn} onChange={(e) => void toggleAutostart(e.target.checked)} />}
                  label={t("settings.autostart")}
                />
                <Typography sx={{ fontSize: 11.5, mt: 1.5, lineHeight: 1.7 }}>{t("settings.startupNote")}</Typography>
              </Panel>

              <Panel>
                <PanelHead title={t("settings.devtools")} />
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ alignItems: { sm: "center" } }}>
                  <Button size="small" disabled={!isDesktop()} onClick={() => void api.openDevtools()}>
                    {t("settings.openDevtools")}
                  </Button>
                  <Typography sx={{ fontSize: 11.5 }}>{t("settings.devtoolsHint")}</Typography>
                </Stack>
              </Panel>

              <Panel>
                <PanelHead title={t("settings.uwp")} meta={t("settings.uwpCount", { n: uwpList.length })} />
                <Typography sx={{ fontSize: 11.5, lineHeight: 1.7, mb: 2 }}>{t("settings.uwpHint")}</Typography>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                  <TextField
                    value={uwpInput}
                    onChange={(e) => setUwpInput(e.target.value)}
                    placeholder="Microsoft.WindowsStore_8wekyb3d8bbwe"
                    fullWidth
                    slotProps={{ htmlInput: { "aria-label": t("settings.uwp") } }}
                  />
                  <Button
                    size="small"
                    disabled={!isDesktop() || uwpBusy || !uwpInput.trim()}
                    onClick={() => void addUwp()}
                    sx={{ flexShrink: 0 }}
                  >
                    {t("settings.uwpAdd")}
                  </Button>
                </Stack>
                {uwpList.length ? (
                  <Box
                    component="pre"
                    sx={{
                      m: 0,
                      mt: 2,
                      p: 1.5,
                      border,
                      backgroundColor: paper,
                      fontSize: 11.5,
                      lineHeight: 1.7,
                      fontFamily: "var(--font-mono)",
                      maxHeight: 200,
                      overflow: "auto",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-all",
                    }}
                  >
                    {uwpList.join("\n")}
                  </Box>
                ) : null}
              </Panel>
            </>
          ) : null}

          {group === "update" ? (
            <>
              <Panel>
                <PanelHead title={t("update.title")} />
                <Stack spacing={2}>
                  <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={2}
                    sx={{ alignItems: { sm: "center" }, flexWrap: "wrap" }}
                  >
                    <Typography sx={{ fontSize: 13, fontWeight: 700 }}>
                      {t("update.current")} {update.current || update.info?.current || "—"}
                    </Typography>
                    <Button
                      size="small"
                      onClick={() => void update.check()}
                      disabled={update.loading}
                      aria-busy={update.loading}
                    >
                      {update.loading ? t("update.checking") : t("update.check")}
                    </Button>
                    <Typography sx={{ fontSize: 11.5, ml: { sm: "auto" } }}>
                      {update.checkedAt
                        ? t("update.checkedAt", { time: formatTime(new Date(update.checkedAt).toISOString()) })
                        : t("update.never")}
                    </Typography>
                  </Stack>

                  {update.error ? (
                    <ErrorNotice
                      message={/HTTP 404/.test(update.error) ? t("update.notPublished") : update.error}
                    />
                  ) : null}

                  {update.info ? (
                    <Box sx={{ border, backgroundColor: paper, p: 2, minWidth: 0 }}>
                      <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                        <MonoLabel tone={update.info.available ? "pink" : "lime"}>
                          {update.info.available
                            ? t("update.available", { version: update.info.latest })
                            : t("update.upToDate")}
                        </MonoLabel>
                      </Stack>
                      {update.info.notes ? (
                        <>
                          <Typography sx={{ ...labelStyle, letterSpacing: "0.08em", display: "block", mt: 2 }}>
                            {t("update.notes")}
                          </Typography>
                          <Box
                            component="pre"
                            sx={{
                              m: 0,
                              mt: 1,
                              p: 1.5,
                              border,
                              backgroundColor: paper,
                              fontSize: 12,
                              lineHeight: 1.6,
                              fontFamily: "var(--font-mono)",
                              maxHeight: 220,
                              overflow: "auto",
                              whiteSpace: "pre-wrap",
                              wordBreak: "break-word",
                            }}
                          >
                            {formatNotes(update.info.notes)}
                          </Box>
                        </>
                      ) : null}
                      {update.info.available ? (
                        <Stack spacing={1.5} sx={{ mt: 2 }}>
                          <Button
                            size="small"
                            onClick={() => void update.install()}
                            disabled={update.installing}
                            aria-busy={update.installing}
                          >
                            {update.installing
                              ? t("update.installing", { percent: update.progress ?? 0 })
                              : t("update.install")}
                          </Button>
                          {update.installing ? (
                            <LinearProgress
                              variant={update.progress === null ? "indeterminate" : "determinate"}
                              value={update.progress ?? 0}
                            />
                          ) : null}
                          <Typography sx={{ fontSize: 11.5 }}>{t("update.restartHint")}</Typography>
                        </Stack>
                      ) : null}
                    </Box>
                  ) : null}

                  <Typography sx={{ fontSize: 11.5, lineHeight: 1.7 }}>{t("update.hint")}</Typography>
                </Stack>
              </Panel>

              <Panel>
                <PanelHead title={t("settings.links")} />
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ flexWrap: "wrap" }}>
                  <Button size="small" onClick={() => void api.openUrl("https://github.com/MinimaxFlora/WRT-UI")}>
                    GitHub
                  </Button>
                  <Button
                    size="small"
                    onClick={() => void api.openUrl("https://github.com/MinimaxFlora/WRT-UI/blob/master/docs/manual.md")}
                  >
                    {t("link.wiki")}
                  </Button>
                  <Button size="small" onClick={() => void api.openUrl("https://t.me/MomoFlora")}>
                    Telegram
                  </Button>
                </Stack>
              </Panel>
            </>
          ) : null}
        </Stack>
      </Box>

      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        sx={{
          alignItems: { sm: "center" },
          borderTop: border,
          pt: 2.5,
          position: "sticky",
          bottom: 0,
          zIndex: 2,
          backgroundColor: "var(--color-paper)",
        }}
      >
        <Button variant="contained" onClick={() => void saveAll()} disabled={saving} aria-busy={saving}>
          {saving ? t("common.saving") : t("settings.save")}
        </Button>
        <Typography sx={{ ...labelStyle, letterSpacing: "0.04em", fontSize: 11 }}>
          {t("settings.saveNote")}
        </Typography>
      </Stack>
    </Stack>
  );
}

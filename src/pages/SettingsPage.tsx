import { useCallback, useEffect, useState } from "react";
import {
  Box,
  LinearProgress,
  Button,
  FormControlLabel,
  IconButton,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/DeleteOutlined";
import FolderIcon from "@mui/icons-material/FolderOpenOutlined";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { relaunch } from "@tauri-apps/plugin-process";
import { api, autostart, isDesktop } from "../api";
import { ThemeDialog } from "../components/ThemeDialog";
import { useThemeCustom } from "../theme-custom";
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
import { engineLabel, useI18n } from "../i18n";
import { border, ink, labelStyle, paper, pink, slab } from "../styles/tokens";
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

function SubHead({ index, title, meta }: { index: string; title: string; meta?: string }) {
  return (
    <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", mb: 2, minWidth: 0 }}>
      <MonoLabel>{index}</MonoLabel>
      <Typography component="h2" sx={{ fontSize: 15, fontWeight: 700, whiteSpace: "nowrap" }}>
        {title}
      </Typography>
      <Box sx={{ flex: 1, minWidth: 16, height: 2, backgroundColor: ink }} />
      {meta ? <Typography sx={{ fontSize: 11.5 }}>{meta}</Typography> : null}
    </Stack>
  );
}

export default function SettingsPage({ settings, env, update, onSettings, onNotify, onError }: Props) {
  const { t } = useI18n();
  const [mirrors, setMirrors] = useState<MirrorSource[]>(settings.mirrors);
  const [proxy, setProxy] = useState(settings.proxy);
  const [saving, setSaving] = useState(false);
  const [autostartOn, setAutostartOn] = useState(false);
  const [changingDir, setChangingDir] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [uwpList, setUwpList] = useState<string[]>([]);
  const [uwpInput, setUwpInput] = useState("");
  const [uwpBusy, setUwpBusy] = useState(false);
  const custom = useThemeCustom();

  useEffect(() => {
    void autostart
      .isEnabled()
      .then(setAutostartOn)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!isDesktop()) return;
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
    if (!isDesktop()) return;
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
  }, []);

  useEffect(() => {
    setMirrors(settings.mirrors);
    setProxy(settings.proxy);
  }, [settings]);

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

  return (
    <Stack spacing={4}>
      <SectionTitle
        kicker="SETUP"
        hint={t("settings.hint")}
        meta={saving ? <MonoLabel tone="cyan">{t("common.saving")}</MonoLabel> : undefined}
      />

      <Panel>
        <SubHead index="01" title={t("settings.ecosystem")} />
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
        <SubHead
          index="02"
          title={t("settings.mirrors")}
          meta={t("settings.mirrorCount", { n: mirrors.length })}
        />
        <Stack spacing={2}>
          {mirrors.map((mirror, index) => (
            <Box key={index} sx={{ border, backgroundColor: paper, p: 1.5, minWidth: 0 }}>
              <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", mb: 1.5 }}>
                <MonoLabel tone="paper">{t("settings.source", { n: String(index + 1).padStart(2, "0") })}</MonoLabel>
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
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ alignItems: { sm: "center" }, mt: 2 }}>
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
        <SubHead index="03" title={t("settings.proxy")} />
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

      <Panel>
        <SubHead index="04" title={t("settings.dataDir")} />
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ alignItems: { sm: "center" } }}>
          <Typography sx={{ flex: 1, minWidth: 0, fontSize: 12.5, wordBreak: "break-all" }}>
            {settings.data_dir}
          </Typography>
          <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
            <Button size="small" startIcon={<FolderIcon />} onClick={() => void openDataDir()}>
              {t("common.open")}
            </Button>
            <Button size="small" variant="outlined" disabled={changingDir} onClick={() => void changeDataDir()}>
              {changingDir ? t("settings.changingDir") : t("settings.changeDir")}
            </Button>
          </Stack>
        </Stack>
        <Typography sx={{ fontSize: 11.5, mt: 1.5 }}>{t("settings.dataDirNote")}</Typography>
      </Panel>

      <Panel>
        <SubHead index="05" title={t("settings.startup")} />
        <FormControlLabel
          control={<Switch checked={autostartOn} onChange={(e) => void toggleAutostart(e.target.checked)} />}
          label={t("settings.autostart")}
        />
        <Typography sx={{ fontSize: 11.5, mt: 1.5, lineHeight: 1.7 }}>{t("settings.startupNote")}</Typography>
      </Panel>

      <Panel>
        <SubHead index="06" title={t("update.title")} />
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
              message={
                /HTTP 404/.test(update.error) ? t("update.notPublished") : update.error
              }
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
                      backgroundColor: slab,
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
        <SubHead index="07" title={t("theme.title")} />
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ alignItems: { sm: "center" } }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            {[custom.theme.primary, custom.theme.secondary, custom.theme.success, custom.theme.warning, custom.theme.error].map(
              (color, index) => (
                <Box
                  key={index}
                  sx={{ width: 22, height: 22, border, backgroundColor: color }}
                  title={color}
                />
              ),
            )}
          </Stack>
          <Typography sx={{ fontSize: 11.5, flex: 1, minWidth: 0 }}>{t("theme.hint")}</Typography>
          <Button size="small" onClick={() => setThemeOpen(true)}>
            {t("theme.open")}
          </Button>
        </Stack>
      </Panel>

      <Panel>
        <SubHead index="08" title={t("settings.devtools")} />
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ alignItems: { sm: "center" } }}>
          <Button size="small" disabled={!isDesktop()} onClick={() => void api.openDevtools()}>
            {t("settings.openDevtools")}
          </Button>
          <Button size="small" variant="outlined" onClick={() => void openDataDir()}>
            {t("settings.openDataDir")}
          </Button>
          <Typography sx={{ fontSize: 11.5 }}>{t("settings.devtoolsHint")}</Typography>
        </Stack>
      </Panel>

      <Panel>
        <SubHead index="09" title={t("settings.uwp")} meta={t("settings.uwpCount", { n: uwpList.length })} />
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
              fontFamily: "var(--font-mono)",
              fontSize: 11.5,
              lineHeight: 1.7,
              maxHeight: 180,
              overflow: "auto",
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
            }}
          >
            {uwpList.join("\n")}
          </Box>
        ) : null}
      </Panel>

      <ThemeDialog open={themeOpen} onClose={() => setThemeOpen(false)} />

      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        sx={{
          alignItems: { sm: "center" },
          borderTop: border,
          pt: 2.5,
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

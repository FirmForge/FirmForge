import { useEffect, useRef } from "react";
import {
  Box,
  Button,
  Checkbox,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import type { ReactNode } from "react";
import DownloadIcon from "@mui/icons-material/FileDownloadOutlined";
import type {
  Artifact,
  Build,
  Device,
  Environment,
  Job,
  PackageItem,
  ProfileInfo,
} from "../types";
import {
  EmptyState,
  FieldRow,
  KeyValue,
  LoadingBlock,
  MonoLabel,
  Notice,
  Panel,
  SectionTitle,
  Segmented,
  Stat,
  type Tone,
} from "../components/Common";
import { formatBytes, formatTime, statusKey } from "../format";
import { THEMES, TIMEZONES } from "../defaults";
import { engineLabel, useI18n } from "../i18n";
import {
  border,
  consoleBg,
  consoleText,
  ink,
  labelStyle,
  lime,
  onAccent,
  onPink,
  paper,
  pink,
  shadowLg,
  shadowLift,
  shadowSm,
  slab,
} from "../styles/tokens";

export type Patch = (patch: Partial<Build>) => void;

const PAGE_SIZE = 20;
const TONE_BG: Record<Tone, string> = {
  ink,
  paper,
  pink,
  lime,
  cyan: "var(--color-electric-cyan)",
  tangerine: "var(--color-tangerine)",
  slab,
};

/** 面板内的分组小标题：等宽标签 + 硬横线。 */
function SubHead({ index, title, meta }: { index: string; title: string; meta?: ReactNode }) {
  return (
    <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", mb: 2, minWidth: 0 }}>
      <MonoLabel>{index}</MonoLabel>
      <Typography component="h3" sx={{ fontSize: 15, fontWeight: 700, whiteSpace: "nowrap" }}>
        {title}
      </Typography>
      <Box sx={{ flex: 1, minWidth: 16, height: 2, backgroundColor: ink }} />
      {meta ? <Typography sx={{ fontSize: 12 }}>{meta}</Typography> : null}
    </Stack>
  );
}

function Tag({
  children,
  tone,
  onClick,
  title,
  strike,
  pressed,
}: {
  children: ReactNode;
  tone: Tone;
  onClick?: () => void;
  title?: string;
  strike?: boolean;
  pressed?: boolean;
}) {
  return (
    <Box
      component={onClick ? "button" : "span"}
      type={onClick ? "button" : undefined}
      onClick={onClick}
      title={title}
      aria-pressed={pressed}
      sx={{
        ...labelStyle,
        letterSpacing: "0.04em",
        display: "inline-flex",
        alignItems: "center",
        gap: 0.5,
        border,
        backgroundColor: TONE_BG[tone],
        color: tone === "pink" ? onPink : tone === "ink" ? paper : onAccent,
        px: 1,
        py: "2px",
        maxWidth: "100%",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        cursor: onClick ? "pointer" : "default",
        textDecoration: strike ? "line-through" : "none",
        transition: "background-color var(--ease-out)",
        "&:hover": onClick ? { backgroundColor: strike ? lime : TONE_BG[tone] } : undefined,
      }}
    >
      {children}
    </Box>
  );
}

export function DeviceStep(props: {
  draft: Build;
  versions: string[];
  version: string;
  devices: Device[];
  page: number;
  query: string;
  loading: boolean;
  onVersion: (version: string) => void;
  onQuery: (query: string) => void;
  onPage: (page: number) => void;
  onChoose: (device: Device) => void;
}) {
  const { t } = useI18n();
  const total = Math.max(1, Math.ceil(props.devices.length / PAGE_SIZE));
  const slice = props.devices.slice((props.page - 1) * PAGE_SIZE, props.page * PAGE_SIZE);
  return (
    <Stack spacing={3}>
      <SectionTitle
        hint={t("device.hint")}
        meta={
          <MonoLabel tone="paper">
            {props.loading ? t("common.reading") : t("device.countLabel", { n: props.devices.length })}
          </MonoLabel>
        }
      >
        {t("device.title")}
      </SectionTitle>

      <Panel>
        <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ alignItems: "flex-start" }}>
          <FieldRow label={t("device.firmware")} sx={{ width: { xs: "100%", md: 220 }, flexShrink: 0 }}>
            <TextField
              select
              value={props.version}
              onChange={(e) => props.onVersion(e.target.value)}
              disabled={props.versions.length === 0}
              fullWidth
            >
              {props.versions.map((v) => (
                <MenuItem key={v} value={v}>
                  {v}
                </MenuItem>
              ))}
            </TextField>
          </FieldRow>
          <FieldRow label={t("device.search")} sx={{ width: { xs: "100%", md: 300 }, flexShrink: 0 }}>
            <TextField
              value={props.query}
              onChange={(e) => props.onQuery(e.target.value)}
              placeholder={t("device.searchPlaceholder")}
              fullWidth
              slotProps={{ htmlInput: { "aria-label": t("device.search") } }}
            />
          </FieldRow>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography component="span" sx={{ ...labelStyle, letterSpacing: "0.08em" }}>
              {t("device.current")}
            </Typography>
            <Stack
              direction="row"
              spacing={1}
              sx={{
                alignItems: "center",
                mt: 1,
                minWidth: 0,
                border,
                backgroundColor: slab,
                px: 1.5,
                py: "10px",
                minHeight: 42,
              }}
            >
              {props.draft.target ? (
                <>
                  <MonoLabel tone="lime">{t("device.selected")}</MonoLabel>
                  <Typography sx={{ fontSize: 12, wordBreak: "break-all" }}>
                    {props.draft.target} · {props.draft.profile}
                  </Typography>
                </>
              ) : (
                <Typography sx={{ fontSize: 12 }}>{t("device.none")}</Typography>
              )}
            </Stack>
          </Box>
        </Stack>
        {props.draft.mirror ? (
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", mt: 2, minWidth: 0 }}>
            <MonoLabel tone="paper">{t("device.mirror")}</MonoLabel>
            <Typography sx={{ fontSize: 11.5, wordBreak: "break-all" }}>{props.draft.mirror}</Typography>
          </Stack>
        ) : null}
      </Panel>

      {props.loading ? (
        <Panel>
          <LoadingBlock label={t("device.loading")} />
        </Panel>
      ) : slice.length === 0 ? (
        <EmptyState title={t("device.emptyTitle")} hint={t("device.emptyHint")} />
      ) : (
        <Box sx={{ border, backgroundColor: slab, p: 2, maxHeight: "min(60vh, 460px)", overflow: "auto" }}>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(272px, 1fr))",
              gap: 1.5,
            }}
          >
            {slice.map((device) => {
              const selected = props.draft.profile === device.id && props.draft.target === device.target;
              return (
                <Box
                  component="button"
                  type="button"
                  key={`${device.target}:${device.id}`}
                  onClick={() => props.onChoose(device)}
                  aria-pressed={selected}
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 1,
                    textAlign: "left",
                    p: 2,
                    minWidth: 0,
                    border,
                    backgroundColor: paper,
                    boxShadow: selected ? `8px 8px 0 0 var(--color-acid-lime)` : shadowSm,
                    cursor: "pointer",
                    transition: "transform var(--ease-out), box-shadow var(--ease-out)",
                    "&:hover": {
                      transform: "translate(-4px, -4px)",
                      boxShadow: selected ? `12px 12px 0 0 var(--color-acid-lime)` : shadowLift,
                    },
                    "&:active": { transform: "translate(4px, 4px)", boxShadow: "none" },
                  }}
                >
                  <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start", minWidth: 0 }}>
                    <Typography sx={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 700, lineHeight: 1.3 }}>
                      {device.title}
                    </Typography>
                    {selected ? <MonoLabel tone="lime">✓ {t("device.selected")}</MonoLabel> : null}
                  </Stack>
                  <Typography sx={{ fontSize: 11.5, lineHeight: 1.55, wordBreak: "break-all" }}>
                    {device.target}
                    <br />
                    {device.id}
                  </Typography>
                </Box>
              );
            })}
          </Box>
        </Box>
      )}

      {props.loading ? null : (
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", flexWrap: "wrap" }}>
          <Button size="small" disabled={props.page <= 1} onClick={() => props.onPage(props.page - 1)}>
            {t("common.back")}
          </Button>
          <Typography sx={{ fontSize: 12 }}>
            {t("device.pageInfo", {
              page: props.page,
              total,
              count: props.devices.length,
              size: PAGE_SIZE,
            })}
          </Typography>
          <Button size="small" disabled={props.page >= total} onClick={() => props.onPage(props.page + 1)}>
            {t("common.next")}
          </Button>
        </Stack>
      )}
    </Stack>
  );
}

export function PackagesStep(props: {
  draft: Build;
  patch: Patch;
  defaultPackages: string[];
  selected: Set<string>;
  available: Set<string>;
  items: PackageItem[];
  warnings: string[];
  search: string;
  category: string;
  theme: string;
  autoTranslations: string[];
  loading: boolean;
  onSearch: (value: string) => void;
  onCategory: (value: string) => void;
  onToggle: (name: string) => void;
  onToggleDefault: (name: string) => void;
}) {
  const { t } = useI18n();
  const filtered = props.items.filter((item) => {
    if (props.search && !item.name.toLowerCase().includes(props.search.toLowerCase())) return false;
    if (props.category === "all") return true;
    if (props.category === "luci") return /^luci-(app|proto|mod)-/.test(item.name);
    if (props.category === "themes") return item.name.startsWith("luci-theme-");
    if (props.category === "kmods") return item.name.startsWith("kmod-");
    if (props.category === "proxy") return item.category === "proxy" && item.name.startsWith("luci-app-");
    return true;
  });
  const shown = filtered.slice(0, 400);
  const removed = new Set(props.draft.remove);

  return (
    <Stack spacing={3}>
      <SectionTitle
        hint={t("packages.hint")}
        meta={
          <MonoLabel tone="paper">
            {t("packages.extra")} {t("packages.countLabel", { n: props.draft.packages.length })}
          </MonoLabel>
        }
      >
        {t("packages.title")}
      </SectionTitle>

      {props.warnings.length > 0 ? (
        <Notice tone="tangerine" label={t("packages.notice")}>
          {props.warnings.join("；")}
        </Notice>
      ) : null}

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 1fr) 360px" }, gap: 2 }}>
        <Panel>
          <SubHead
            index="01"
            title={t("packages.defaults")}
            meta={t("packages.countLabel", { n: props.defaultPackages.length })}
          />
          <Typography sx={{ fontSize: 12, mb: 1.5 }}>{t("packages.defaultsHint")}</Typography>
          <Box sx={{ maxHeight: 176, overflow: "auto", pr: 0.5 }}>
            <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1 }}>
              {props.defaultPackages.map((name) => {
                const isRemoved = removed.has(name);
                return (
                  <Tag
                    key={name}
                    tone={isRemoved ? "slab" : "paper"}
                    strike={isRemoved}
                    pressed={!isRemoved}
                    onClick={() => props.onToggleDefault(name)}
                    title={isRemoved ? t("packages.restoreDefault") : t("packages.toggleDefault")}
                  >
                    {name}
                  </Tag>
                );
              })}
            </Stack>
          </Box>
          {props.draft.remove.length > 0 ? (
            <Typography sx={{ fontSize: 11.5, mt: 1.5 }}>
              {t("packages.removed", { n: props.draft.remove.length })}
            </Typography>
          ) : null}
        </Panel>

        <Panel>
          <SubHead
            index="02"
            title={t("packages.extra")}
            meta={t("packages.countLabel", { n: props.draft.packages.length })}
          />
          <Typography sx={{ fontSize: 12, mb: 1.5 }}>{t("packages.extraHint")}</Typography>
          <Box sx={{ minHeight: 104, maxHeight: 176, overflow: "auto", pr: 0.5 }}>
            {props.draft.packages.length === 0 ? (
              <EmptyState title={t("packages.emptyTitle")} hint={t("packages.emptyHint")} />
            ) : (
              <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1 }}>
                {props.draft.packages.map((name) => (
                  <Tag key={name} tone="cyan" onClick={() => props.onToggle(name)} title={t("packages.removeExtra")}>
                    {name} ×
                  </Tag>
                ))}
              </Stack>
            )}
          </Box>
          <Typography sx={{ fontSize: 11.5, mt: 1.5 }}>
            {t("packages.autoZh", { n: props.autoTranslations.length })}
            {props.theme ? ` · ${t("packages.theme", { name: props.theme })}` : ""}
          </Typography>
        </Panel>
      </Box>

      <Panel sx={{ p: 0, boxShadow: shadowLg }}>
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={2}
          sx={{ alignItems: { md: "center" }, p: 2, borderBottom: border }}
        >
          <Segmented
            ariaLabel={t("packages.colName")}
            value={props.category}
            onChange={props.onCategory}
            options={[
              { value: "all", label: t("packages.all") },
              { value: "luci", label: "LuCI" },
              { value: "proxy", label: t("packages.proxy") },
              { value: "themes", label: t("packages.themes") },
              { value: "kmods", label: t("packages.kmods") },
            ]}
          />
          <TextField
            value={props.search}
            onChange={(e) => props.onSearch(e.target.value)}
            placeholder={t("packages.searchPlaceholder")}
            slotProps={{ htmlInput: { "aria-label": t("packages.searchPlaceholder") } }}
            sx={{ ml: { md: "auto" }, width: { xs: "100%", md: 320 } }}
          />
        </Stack>

        {props.loading ? (
          <Box sx={{ p: 2 }}>
            <LoadingBlock label={t("packages.loading")} />
          </Box>
        ) : (
          <>
            <TableContainer sx={{ maxHeight: "min(52vh, 420px)" }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox" />
                    <TableCell>{t("packages.colName")}</TableCell>
                    <TableCell>{t("common.version")}</TableCell>
                    <TableCell>{t("packages.colFeed")}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {shown.map((item) => {
                    const checked = props.selected.has(item.name);
                    return (
                      <TableRow
                        key={`${item.feed}:${item.name}`}
                        hover
                        onClick={() => props.onToggle(item.name)}
                        sx={{ cursor: "pointer", backgroundColor: checked ? slab : undefined }}
                      >
                        <TableCell
                          padding="checkbox"
                          sx={{ borderLeft: checked ? `8px solid ${ink}` : `4px solid transparent` }}
                        >
                          <Checkbox
                            checked={checked}
                            onChange={() => props.onToggle(item.name)}
                            onClick={(e) => e.stopPropagation()}
                            slotProps={{ input: { "aria-label": item.name } }}
                          />
                        </TableCell>
                        <TableCell sx={{ fontWeight: checked ? 700 : 400, wordBreak: "break-all" }}>
                          {item.name}
                        </TableCell>
                        <TableCell>{item.version}</TableCell>
                        <TableCell>{item.feed}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
            {shown.length === 0 ? (
              <Box sx={{ p: 2 }}>
                <EmptyState title={t("packages.noMatchTitle")} hint={t("packages.noMatchHint")} />
              </Box>
            ) : null}
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={1}
              sx={{ alignItems: { sm: "center" }, p: 2, borderTop: border }}
            >
              <Typography sx={{ fontSize: 12 }}>
                {t("packages.summary", {
                  selected: props.selected.size,
                  shown: shown.length,
                  total: filtered.length,
                })}
              </Typography>
              {filtered.length > shown.length ? (
                <Typography sx={{ fontSize: 12, ml: { sm: "auto" } }}>{t("packages.cap")}</Typography>
              ) : null}
            </Stack>
          </>
        )}
      </Panel>
    </Stack>
  );
}

export function ConfigStep(props: {
  draft: Build;
  patch: Patch;
  profile: ProfileInfo | null;
  wirelessSupported: boolean;
  pppSupported: boolean;
}) {
  const { t } = useI18n();
  return (
    <Stack spacing={3}>
      <SectionTitle hint={t("config.hint")}>{t("config.title")}</SectionTitle>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "1fr 1fr", lg: "repeat(3, minmax(0, 1fr))" },
          gap: 2,
          alignItems: "start",
        }}
      >
        <Panel>
          <SubHead index="01" title={t("config.identity")} />
          <Stack spacing={2}>
            <FieldRow label={t("config.hostname")}>
              <TextField
                value={props.draft.hostname}
                onChange={(e) => props.patch({ hostname: e.target.value })}
                placeholder="WRT-UI"
                fullWidth
                slotProps={{ htmlInput: { "aria-label": t("config.hostname") } }}
              />
            </FieldRow>
            <FieldRow label={t("config.address")} hint={t("config.addressHint")}>
              <TextField
                value={props.draft.address}
                onChange={(e) => props.patch({ address: e.target.value })}
                placeholder="192.168.2.1/24"
                fullWidth
                slotProps={{ htmlInput: { "aria-label": t("config.address") } }}
              />
            </FieldRow>
            <FieldRow label={t("config.rootPassword")} hint={t("config.rootPasswordHint")}>
              <TextField
                type="password"
                value={props.draft.root_password}
                onChange={(e) => props.patch({ root_password: e.target.value })}
                fullWidth
                slotProps={{ htmlInput: { "aria-label": t("config.rootPassword") } }}
              />
            </FieldRow>
          </Stack>
        </Panel>

        <Panel>
          <SubHead index="02" title={t("config.system")} />
          <Stack spacing={2}>
            <FieldRow label={t("config.timezone")}>
              <TextField
                select
                value={props.draft.timezone}
                onChange={(e) => props.patch({ timezone: e.target.value })}
                fullWidth
              >
                {TIMEZONES.map((zone) => (
                  <MenuItem key={zone.value} value={zone.value}>
                    {t(zone.key)}
                  </MenuItem>
                ))}
              </TextField>
            </FieldRow>
            <FieldRow label={t("config.theme")}>
              <TextField
                select
                value={props.draft.theme}
                onChange={(e) => props.patch({ theme: e.target.value })}
                fullWidth
              >
                {THEMES.map((theme) => (
                  <MenuItem key={theme.value} value={theme.value}>
                    {t(theme.key)}
                  </MenuItem>
                ))}
              </TextField>
            </FieldRow>
            <FieldRow
              label={t("config.rootfs")}
              hint={
                props.profile?.rootfs_supported ? t("config.rootfsHint") : t("config.rootfsUnsupported")
              }
            >
              <TextField
                type="number"
                value={props.draft.rootfs_size || ""}
                onChange={(e) => props.patch({ rootfs_size: Number(e.target.value) || 0 })}
                disabled={!props.profile?.rootfs_supported}
                fullWidth
                slotProps={{ htmlInput: { "aria-label": t("config.rootfs") } }}
              />
            </FieldRow>
          </Stack>
        </Panel>

        <Panel>
          <SubHead index="03" title={t("config.network")} />
          <Stack spacing={2}>
            {props.wirelessSupported ? (
              <>
                <FieldRow label={t("config.wifiName")}>
                  <TextField
                    value={props.draft.wifi_ssid}
                    onChange={(e) => props.patch({ wifi_ssid: e.target.value })}
                    placeholder="SSID"
                    fullWidth
                    slotProps={{ htmlInput: { "aria-label": t("config.wifiName") } }}
                  />
                </FieldRow>
                <FieldRow label={t("config.wifiPass")} hint={t("config.wifiPassHint")}>
                  <TextField
                    type="password"
                    value={props.draft.wifi_password}
                    onChange={(e) => props.patch({ wifi_password: e.target.value })}
                    fullWidth
                    slotProps={{ htmlInput: { "aria-label": t("config.wifiPass") } }}
                  />
                </FieldRow>
              </>
            ) : (
              <Notice tone="cyan" label={t("config.wifiSkipLabel")}>
                {t("config.wifiSkip")}
              </Notice>
            )}
            {props.pppSupported ? (
              <>
                <FieldRow label={t("config.pppoeUser")}>
                  <TextField
                    value={props.draft.ppp_username}
                    onChange={(e) => props.patch({ ppp_username: e.target.value })}
                    fullWidth
                    slotProps={{ htmlInput: { "aria-label": t("config.pppoeUser") } }}
                  />
                </FieldRow>
                <FieldRow label={t("config.pppoePass")}>
                  <TextField
                    type="password"
                    value={props.draft.ppp_password}
                    onChange={(e) => props.patch({ ppp_password: e.target.value })}
                    fullWidth
                    slotProps={{ htmlInput: { "aria-label": t("config.pppoePass") } }}
                  />
                </FieldRow>
              </>
            ) : null}
          </Stack>
        </Panel>

        <Panel sx={{ gridColumn: "1 / -1" }}>
          <SubHead index="04" title={t("config.advanced")} meta="/etc/uci-defaults/99-custom.sh" />
          <TextField
            value={props.draft.script}
            onChange={(e) => props.patch({ script: e.target.value })}
            multiline
            minRows={9}
            fullWidth
            placeholder={"#!/bin/sh\nopkg update"}
            slotProps={{ htmlInput: { spellCheck: false, "aria-label": t("config.advanced") } }}
          />
          <Typography sx={{ fontSize: 11.5, mt: 1.5 }}>{t("config.advancedNote")}</Typography>
        </Panel>
      </Box>
    </Stack>
  );
}

export function ReviewStep(props: {
  draft: Build;
  defaultPackages: string[];
  additionalCount: number;
  wirelessSupported: boolean;
  env: Environment | null;
}) {
  const { t } = useI18n();
  const rows: [string, string][] = [
    [t("common.version"), props.draft.version || "—"],
    [
      t("history.device"),
      t("review.deviceValue", {
        device: props.draft.device || props.draft.profile,
        target: props.draft.target,
      }),
    ],
    [t("review.mirror"), props.draft.mirror],
    [
      t("review.defaults"),
      props.draft.remove.length
        ? t("review.defaultsValue", {
            total: props.defaultPackages.length,
            removed: props.draft.remove.length,
          })
        : t("review.defaultsPlain", { total: props.defaultPackages.length }),
    ],
    [t("review.extra"), t("review.extraValue", { n: props.additionalCount })],
    [t("review.hostname"), props.draft.hostname || "—"],
    [t("review.address"), props.draft.address || "—"],
    [t("review.timezone"), props.draft.timezone],
    [
      t("review.password"),
      props.draft.root_password ? t("review.passwordSet") : t("review.keepDefault"),
    ],
    [
      t("review.wifi"),
      props.wirelessSupported
        ? props.draft.wifi_ssid
          ? props.draft.wifi_ssid
          : t("review.unchanged")
        : t("review.noWifi"),
    ],
    [t("review.pppoe"), props.draft.ppp_username ? props.draft.ppp_username : t("review.unchanged")],
    [t("review.script"), props.draft.script.trim() ? t("review.filled") : t("review.none")],
    [t("review.rootfs"), props.draft.rootfs_size ? `${props.draft.rootfs_size} MiB` : t("review.defaultSize")],
  ];

  return (
    <Stack spacing={3}>
      <SectionTitle hint={t("review.hint")}>{t("review.title")}</SectionTitle>

      {props.env && !props.env.available ? (
        <Notice tone="pink" label={t("review.engineDown")}>
          {t("error.engine", { name: engineLabel(props.env.name, t), message: props.env.message })}
        </Notice>
      ) : null}

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" }, gap: 2 }}>
        <Stat label={t("review.device")} value={props.draft.device || props.draft.profile || "—"} />
        <Stat label={t("common.version")} value={props.draft.version || "—"} />
        <Stat
          label={t("review.packages")}
          value={`${Math.max(0, props.defaultPackages.length - props.draft.remove.length) + props.additionalCount}`}
        />
      </Box>

      <Panel sx={{ p: 0, boxShadow: shadowLg }}>
        {rows.map(([label, value]) => (
          <KeyValue key={label} label={label} value={value || "—"} />
        ))}
      </Panel>
    </Stack>
  );
}

export function ResultStep(props: {
  job: Job;
  log: string;
  artifacts: Artifact[];
  busy: boolean;
  onCancel: () => void;
  onDownload: (name: string) => void;
  onCleanup: () => void;
  onNewBuild: () => void;
}) {
  const { t } = useI18n();
  const running = props.job.status === "running" || props.job.status === "queued";
  const logRef = useRef<HTMLPreElement | null>(null);
  const statusText = (() => {
    const key = statusKey(props.job.status);
    return key ? t(key) : props.job.status;
  })();

  useEffect(() => {
    const element = logRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
  }, [props.log]);

  return (
    <Stack spacing={3}>
      <Stack direction="row" spacing={2} sx={{ alignItems: "flex-start", flexWrap: "wrap" }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h2" component="h2">
            {statusText}
          </Typography>
          <Typography sx={{ fontSize: 11.5, mt: 1, wordBreak: "break-all" }}>
            {formatTime(props.job.created)} · {props.job.id}
          </Typography>
        </Box>
        <Box sx={{ ml: { sm: "auto" } }}>
          <MonoLabel tone="paper">{props.job.stage || t("result.preparing")}</MonoLabel>
        </Box>
      </Stack>

      {running ? (
        <Box aria-busy="true" sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <Typography sx={{ ...labelStyle, letterSpacing: "0.08em" }}>
            {t("result.running", { stage: props.job.stage || t("result.preparing") })}
          </Typography>
          <Box sx={{ border, height: 16, position: "relative", overflow: "hidden", backgroundColor: slab }}>
            <Box
              sx={{
                position: "absolute",
                inset: 0,
                width: "36%",
                backgroundColor: "var(--color-electric-cyan)",
                borderRight: border,
                animation: "wrt-progress 1.4s linear infinite",
                "@keyframes wrt-progress": {
                  "0%": { transform: "translateX(-100%)" },
                  "100%": { transform: "translateX(320%)" },
                },
              }}
            />
          </Box>
        </Box>
      ) : null}

      {props.job.error ? (
        <Notice tone="pink" label={t("result.error")}>
          {props.job.error}
        </Notice>
      ) : null}

      {props.job.status === "success" ? (
        <Panel sx={{ p: 0, boxShadow: shadowLg }}>
          <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", p: 2, borderBottom: border }}>
            <MonoLabel tone="lime">{t("result.artifacts")}</MonoLabel>
            <Typography sx={{ fontSize: 12 }}>{t("result.artifactsHint")}</Typography>
          </Stack>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t("common.file")}</TableCell>
                <TableCell>{t("common.size")}</TableCell>
                <TableCell align="right">{t("common.actions")}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {props.artifacts.map((item) => (
                <TableRow key={item.name} hover>
                  <TableCell sx={{ wordBreak: "break-all", fontWeight: 700 }}>{item.name}</TableCell>
                  <TableCell sx={{ whiteSpace: "nowrap" }}>{formatBytes(item.size)}</TableCell>
                  <TableCell align="right">
                    <Button
                      size="small"
                      startIcon={<DownloadIcon />}
                      disabled={props.busy}
                      onClick={() => props.onDownload(item.name)}
                    >
                      {t("result.download")}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {props.artifacts.length === 0 ? (
            <Box sx={{ p: 2 }}>
              <EmptyState title={t("result.noArtifactsTitle")} hint={t("result.noArtifactsHint")} />
            </Box>
          ) : null}
        </Panel>
      ) : null}

      <Box>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", mb: 1.5 }}>
          <MonoLabel>{t("result.log")}</MonoLabel>
          <Box sx={{ flex: 1, height: 2, backgroundColor: ink }} />
          <Typography sx={{ fontSize: 11.5 }}>{t("result.logRetention")}</Typography>
        </Stack>
        <Box
          component="pre"
          ref={logRef}
          tabIndex={0}
          aria-label={t("aria.log")}
          sx={{
            m: 0,
            p: 2,
            border,
            backgroundColor: consoleBg,
            color: consoleText,
            boxShadow: shadowLg,
            maxHeight: 340,
            overflow: "auto",
            fontSize: 12,
            lineHeight: 1.6,
            fontFamily: "var(--font-mono)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
          }}
        >
          {props.log || t("result.logEmpty")}
        </Box>
      </Box>

      <Stack direction="row" spacing={1.5} sx={{ flexWrap: "wrap", borderTop: border, pt: 2.5 }}>
        {running ? (
          <Button onClick={props.onCancel} disabled={props.busy}>
            {t("result.cancel")}
          </Button>
        ) : (
          <Button onClick={props.onCleanup} disabled={props.busy}>
            {t("result.cleanup")}
          </Button>
        )}
        <Button variant="contained" onClick={props.onNewBuild} disabled={props.busy || running}>
          {t("result.newBuild")}
        </Button>
        <Typography sx={{ fontSize: 11.5, alignSelf: "center", ml: { sm: "auto" }, wordBreak: "break-all" }}>
          {props.job.image
            ? t("result.mirror", { name: props.job.image })
            : t("result.job", { id: props.job.id })}
        </Typography>
      </Stack>
    </Stack>
  );
}

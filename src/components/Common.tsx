import { Box, Button, LinearProgress, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { useEffect } from "react";
import type { SxProps, Theme } from "@mui/material/styles";
import { useI18n } from "../i18n";
import { statusAccent, statusKey, statusLabel } from "../format";
import {
  activeFill,
  activeText,
  border,
  cyan,
  ink,
  labelStyle,
  lime,
  mergeSx,
  onAccent,
  onPink,
  paper,
  pink,
  sans,
  shadowLg,
  shadowSm,
  slab,
  tangerine,
} from "../styles/tokens";

export type Tone = "ink" | "paper" | "pink" | "lime" | "cyan" | "tangerine" | "slab";

const TONE_BG: Record<Tone, string> = {
  ink,
  paper,
  pink,
  lime,
  cyan,
  tangerine,
  slab,
};

/** 等宽全大写标签：分类、状态与编号统一用这一种。 */
export function MonoLabel({
  children,
  tone = "ink",
  sx,
}: {
  children: ReactNode;
  tone?: Tone;
  sx?: SxProps<Theme>;
}) {
  return (
    <Box
      component="span"
      sx={mergeSx(
        {
          ...labelStyle,
          display: "inline-flex",
          alignItems: "center",
          gap: 0.5,
          px: 1,
          py: "2px",
          border: tone === "paper" || tone === "slab" ? `2px solid ${ink}` : "0",
          backgroundColor: TONE_BG[tone],
          color: tone === "pink" ? onPink : tone === "ink" ? paper : onAccent,
          whiteSpace: "nowrap",
        },
        sx,
      )}
    >
      {children}
    </Box>
  );
}

/** 实体面板：2px 墨黑外框 + 无模糊硬阴影。 */
export function Panel({
  children,
  elevation = "sm",
  tone = "paper",
  sx,
}: {
  children: ReactNode;
  elevation?: "sm" | "lg";
  tone?: "paper" | "slab";
  sx?: SxProps<Theme>;
}) {
  return (
    <Box
      sx={mergeSx(
        {
          border,
          backgroundColor: tone === "slab" ? slab : paper,
          boxShadow: elevation === "lg" ? shadowLg : shadowSm,
          p: 2.5,
          minWidth: 0,
        },
        sx,
      )}
    >
      {children}
    </Box>
  );
}

export function SectionTitle({
  kicker,
  children,
  hint,
  meta,
}: {
  kicker?: string;
  children?: ReactNode;
  hint?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <Stack spacing={1.25} sx={{ mb: 2.5 }}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", minWidth: 0 }}>
        {kicker ? <MonoLabel>{kicker}</MonoLabel> : null}
        <Box sx={{ flex: 1, minWidth: 24, height: 2, backgroundColor: ink }} />
        {meta}
      </Stack>
      {children ? (
        <Typography variant="h3" component="h2">
          {children}
        </Typography>
      ) : null}
      {hint ? (
        <Typography sx={{ fontSize: 13, lineHeight: 1.65, maxWidth: 760 }}>{hint}</Typography>
      ) : null}
    </Stack>
  );
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <Box
      sx={{
        border,
        backgroundColor: slab,
        boxShadow: shadowSm,
        p: 2.5,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: 1,
      }}
    >
      <MonoLabel tone="paper">{t("common.empty")}</MonoLabel>
      <Typography variant="h5">{title}</Typography>
      {hint ? <Typography sx={{ fontSize: 13, lineHeight: 1.65 }}>{hint}</Typography> : null}
      {action ? <Box sx={{ mt: 1 }}>{action}</Box> : null}
    </Box>
  );
}

export function ErrorNotice({
  message,
  onRetry,
  onDismiss,
}: {
  message: string;
  onRetry?: () => void;
  onDismiss?: () => void;
}) {
  const { t } = useI18n();
  if (!message) return null;
  return (
    <Box
      role="alert"
      sx={{
        border,
        borderLeft: `8px solid ${pink}`,
        backgroundColor: paper,
        boxShadow: shadowSm,
        display: "flex",
        alignItems: "flex-start",
        flexWrap: "wrap",
        gap: 1.5,
        p: 2,
      }}
    >
      <MonoLabel tone="pink">{t("error.label")}</MonoLabel>
      <Typography sx={{ flex: 1, minWidth: 200, fontSize: 13, lineHeight: 1.65, wordBreak: "break-word" }}>
        {message}
      </Typography>
      {onRetry ? (
        <Button size="small" onClick={onRetry}>
          {t("common.retry")}
        </Button>
      ) : null}
      {onDismiss ? (
        <Button size="small" onClick={onDismiss}>
          {t("common.close")}
        </Button>
      ) : null}
    </Box>
  );
}

/** 提示块：色块承担语义，正文保持墨黑。 */
export function Notice({
  tone = "tangerine",
  label,
  children,
}: {
  tone?: Tone;
  label: string;
  children: ReactNode;
}) {
  return (
    <Box
      sx={{
        border,
        backgroundColor: TONE_BG[tone],
        color: tone === "paper" || tone === "slab" ? ink : onAccent,
        boxShadow: shadowSm,
        p: 2,
        display: "flex",
        alignItems: "flex-start",
        gap: 1.5,
      }}
    >
      <MonoLabel tone="ink">{label}</MonoLabel>
      <Typography sx={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: 1.65 }}>{children}</Typography>
    </Box>
  );
}

export function FieldRow({
  label,
  hint,
  children,
  sx,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  sx?: SxProps<Theme>;
}) {
  return (
    <Stack spacing={1} sx={mergeSx({ minWidth: 0 }, sx)}>
      <Typography component="span" sx={{ ...labelStyle, letterSpacing: "0.08em" }}>
        {label}
      </Typography>
      {children}
      {hint ? <Typography sx={{ fontSize: 12, lineHeight: 1.6 }}>{hint}</Typography> : null}
    </Stack>
  );
}

/** 分段控制：与按钮同源的实体块，选中态反色。 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  disabled,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  ariaLabel?: string;
  disabled?: boolean;
}) {
  return (
    <Box
      role="group"
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      sx={{
        display: "inline-flex",
        flexWrap: "wrap",
        border,
        backgroundColor: paper,
        boxShadow: shadowSm,
        alignSelf: "flex-start",
      }}
    >
      {options.map((option, index) => {
        const active = option.value === value;
        return (
          <Box
            component="button"
            type="button"
            key={option.value}
            aria-pressed={active}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            sx={{
              ...labelStyle,
              border: 0,
              borderLeft: index === 0 ? 0 : `2px solid ${ink}`,
              backgroundColor: active ? activeFill : paper,
              color: active ? activeText : ink,
              px: 2,
              py: 1,
              cursor: disabled ? "not-allowed" : "pointer",
              opacity: 1,
              transition: "background-color var(--ease-out)",
              "&:hover": {
                backgroundColor: disabled || active ? (active ? activeFill : paper) : lime,
                color: disabled || active ? (active ? activeText : ink) : onAccent,
              },
            }}
          >
            {option.label}
          </Box>
        );
      })}
    </Box>
  );
}

/** 步骤轨：四块独立实体，当前步反色、已完成填酸柠绿。 */
export function StepRail({ steps, active }: { steps: string[]; active: number }) {
  return (
    <Box
      component="ol"
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", md: `repeat(${steps.length}, minmax(0, 1fr))` },
        gap: 1,
        m: 0,
        p: 0,
        listStyle: "none",
      }}
    >
      {steps.map((label, index) => {
        const state = index < active ? "done" : index === active ? "active" : "todo";
        return (
          <Box
            component="li"
            key={label}
            aria-current={state === "active" ? "step" : undefined}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              minWidth: 0,
              px: 1.5,
              py: 1,
              border,
              backgroundColor: state === "active" ? activeFill : state === "done" ? slab : paper,
              color: state === "active" ? activeText : ink,
              boxShadow: state === "active" ? shadowSm : "none",
            }}
          >
            <Box
              component="span"
              sx={{
                ...labelStyle,
                letterSpacing: "0.06em",
                border: `2px solid ${state === "active" ? activeText : ink}`,
                backgroundColor: state === "done" ? lime : state === "active" ? activeFill : paper,
                color: state === "active" ? activeText : ink,
                px: "5px",
                py: "1px",
              }}
            >
              {state === "done" ? "✓" : String(index + 1).padStart(2, "0")}
            </Box>
            <Typography
              component="span"
              sx={{
                fontSize: 13,
                fontWeight: state === "todo" ? 400 : 700,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {label}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}

export function StatusTag({ status, stage }: { status: string; stage?: string }) {
  const { t } = useI18n();
  const key = statusKey(status);
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
      <MonoLabel tone={statusAccent(status)}>{key ? t(key) : statusLabel(status)}</MonoLabel>
      {stage ? <MonoLabel tone="paper">{stage}</MonoLabel> : null}
    </Stack>
  );
}

export function Stat({ label, value, tone = "paper" }: { label: string; value: ReactNode; tone?: Tone }) {
  return (
    <Box
      sx={{
        border,
        backgroundColor: TONE_BG[tone],
        color: tone === "paper" || tone === "slab" ? ink : onAccent,
        boxShadow: shadowSm,
        p: 2,
        minWidth: 0,
      }}
    >
      <Typography component="span" sx={{ ...labelStyle, letterSpacing: "0.08em" }}>
        {label}
      </Typography>
      <Typography
        sx={{
          fontFamily: sans,
          fontSize: 24,
          fontWeight: 900,
          letterSpacing: "-0.01em",
          lineHeight: 1.15,
          mt: 1,
          wordBreak: "break-word",
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}

export function KeyValue({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", sm: "176px minmax(0, 1fr)" },
        borderBottom: `2px solid ${ink}`,
        "&:last-of-type": { borderBottom: 0 },
      }}
    >
      <Box
        sx={{
          ...labelStyle,
          letterSpacing: "0.08em",
          px: 2,
          py: 1.25,
          backgroundColor: slab,
          borderRight: { sm: `2px solid ${ink}` },
        }}
      >
        {label}
      </Box>
      <Box sx={{ px: 2, py: 1.25, fontSize: 13, lineHeight: 1.6, wordBreak: "break-all", minWidth: 0 }}>
        {value}
      </Box>
    </Box>
  );
}

export function LoadingBlock({ label }: { label?: string }) {
  const { t } = useI18n();
  return (
    <Box aria-busy="true" sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <Typography component="span" sx={{ ...labelStyle, letterSpacing: "0.08em" }}>
        {label ?? t("common.reading")}…
      </Typography>
      <LinearProgress />
    </Box>
  );
}

/** 结果提示：底部实体吐司，颜色只表示语气。 */
export function Toast({
  notice,
  onClose,
}: {
  notice: { text: string; tone: "success" | "error" | "info" } | null;
  onClose: () => void;
}) {
  const { t } = useI18n();
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(onClose, notice.tone === "error" ? 6000 : 3200);
    return () => window.clearTimeout(timer);
  }, [notice, onClose]);

  if (!notice) return null;
  const tone: Tone = notice.tone === "success" ? "lime" : notice.tone === "error" ? "pink" : "cyan";
  return (
    <Box
      role="status"
      aria-live="polite"
      sx={{
        position: "fixed",
        right: 24,
        bottom: 24,
        zIndex: 1400,
        maxWidth: "min(520px, calc(100vw - 48px))",
        display: "flex",
        alignItems: "flex-start",
        gap: 1.5,
        border,
        backgroundColor: paper,
        boxShadow: shadowLg,
        p: 2,
      }}
    >
      <Box sx={{ width: 12, alignSelf: "stretch", backgroundColor: TONE_BG[tone], border: `2px solid ${ink}` }} />
      <Typography sx={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: 1.6, wordBreak: "break-word" }}>
        {notice.text}
      </Typography>
      <Button
        size="small"
        onClick={onClose}
        aria-label={t("aria.closeToast")}
        sx={{ padding: "4px 10px", fontSize: 11 }}
      >
        {t("common.close")}
      </Button>
    </Box>
  );
}

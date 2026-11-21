import { useEffect, useState } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { Segmented } from "./Common";
import { ScriptEditor } from "./ScriptEditor";
import { useI18n, type MessageKey } from "../i18n";
import { border, ink, labelStyle, paper, shadowSm } from "../styles/tokens";
import { DEFAULT_THEME, type CustomTheme, useThemeCustom } from "../theme-custom";

const COLOR_ROWS: { key: keyof Pick<CustomTheme, "primary" | "secondary" | "success" | "warning" | "error">; label: MessageKey }[] = [
  { key: "primary", label: "theme.color.primary" },
  { key: "secondary", label: "theme.color.secondary" },
  { key: "success", label: "theme.color.success" },
  { key: "warning", label: "theme.color.warning" },
  { key: "error", label: "theme.color.error" },
];

const HEX_ONLY = /^#[0-9a-fA-F]{0,6}$/;

export function ThemeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const { theme, save, reset } = useThemeCustom();
  const [draft, setDraft] = useState<CustomTheme>(theme);
  const [cssOpen, setCssOpen] = useState(false);

  useEffect(() => {
    if (open) setDraft(theme);
  }, [open, theme]);

  const setColor = (key: keyof CustomTheme, value: string) => {
    if (!HEX_ONLY.test(value)) return;
    setDraft({ ...draft, [key]: value });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      slotProps={{ paper: { sx: { border, borderRadius: 0, boxShadow: "10px 10px 0 0 var(--color-ink)", backgroundColor: paper } } }}
    >
      <DialogTitle sx={{ p: 2.5, pb: 0 }}>
        <Typography component="h2" sx={{ fontSize: 18, fontWeight: 900, letterSpacing: "-0.01em" }}>
          {t("theme.title")}
        </Typography>
        <Typography sx={{ fontSize: 11.5, mt: 1, lineHeight: 1.7 }}>{t("theme.hint")}</Typography>
      </DialogTitle>

      <DialogContent sx={{ p: 2.5 }}>
        <Stack spacing={1.25}>
          {COLOR_ROWS.map((row) => (
            <Stack key={row.key} direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
              <Typography sx={{ ...labelStyle, width: 92, flexShrink: 0 }}>{t(row.label)}</Typography>
              <Box
                component="input"
                type="color"
                aria-label={t(row.label)}
                value={(draft[row.key] as string) || "#000000"}
                onChange={(e) => setColor(row.key, e.target.value)}
                sx={{
                  width: 40,
                  height: 30,
                  p: 0,
                  border,
                  backgroundColor: paper,
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              />
              <TextField
                value={draft[row.key] as string}
                onChange={(e) => setColor(row.key, e.target.value.trim())}
                size="small"
                fullWidth
                slotProps={{ htmlInput: { spellCheck: false, "aria-label": `${t(row.label)} hex` } }}
                sx={{ "& input": { fontFamily: "var(--font-mono)", fontSize: 13 } }}
              />
            </Stack>
          ))}

          <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", pt: 1 }}>
            <Typography sx={{ ...labelStyle, width: 92, flexShrink: 0 }}>{t("theme.font")}</Typography>
            <Segmented
              ariaLabel={t("theme.font")}
              value={draft.font}
              onChange={(value: CustomTheme["font"]) => setDraft({ ...draft, font: value })}
              options={[
                { value: "mono", label: t("theme.fontMono") },
                { value: "sans", label: t("theme.fontSans") },
                { value: "system", label: t("theme.fontSystem") },
              ]}
            />
          </Stack>

          <Box sx={{ pt: 1 }}>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", mb: 1 }}>
              <Typography sx={labelStyle}>{t("theme.css")}</Typography>
              <Button size="small" sx={{ ml: "auto" }} onClick={() => setCssOpen(true)}>
                {t("theme.editCss")}
              </Button>
            </Stack>
            <Box
              component="pre"
              sx={{
                m: 0,
                p: 1.5,
                border,
                backgroundColor: "var(--color-slab)",
                fontFamily: "var(--font-mono)",
                fontSize: 11.5,
                lineHeight: 1.7,
                maxHeight: 120,
                overflow: "auto",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
                minHeight: 48,
              }}
            >
              {draft.css.trim() || t("theme.cssEmpty")}
            </Box>
          </Box>
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 2.5, pb: 2.5, pt: 0, gap: 1 }}>
        <Button
          size="small"
          onClick={() => {
            reset();
            onClose();
          }}
        >
          {t("theme.reset")}
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button size="small" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button
          size="small"
          variant="contained"
          onClick={() => {
            save(draft);
            onClose();
          }}
        >
          {t("common.save")}
        </Button>
      </DialogActions>

      <Dialog
        open={cssOpen}
        onClose={() => setCssOpen(false)}
        fullWidth
        maxWidth="md"
        slotProps={{ paper: { sx: { border, borderRadius: 0, boxShadow: "10px 10px 0 0 var(--color-ink)", backgroundColor: paper } } }}
      >
        <DialogTitle sx={{ p: 2.5, pb: 1 }}>
          <Typography component="h2" sx={{ fontSize: 15, fontWeight: 700 }}>
            {t("theme.editCss")}
          </Typography>
        </DialogTitle>
        <DialogContent sx={{ p: 2.5, pt: 0 }}>
          <Box sx={{ boxShadow: shadowSm }}>
            <ScriptEditor
              value={draft.css}
              onChange={(next) => setDraft({ ...draft, css: next })}
              path="custom.css"
              height={320}
              plain
              ariaLabel={t("theme.css")}
            />
          </Box>
          <Typography sx={{ fontSize: 11, mt: 1 }}>{t("theme.cssHint")}</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 2.5, pb: 2.5 }}>
          <Button size="small" onClick={() => setCssOpen(false)}>
            {t("common.close")}
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}

export const THEME_DEFAULTS = DEFAULT_THEME;
export const themeInk = ink;

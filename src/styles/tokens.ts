import type { SxProps, Theme } from "@mui/material/styles";

/** CSS 变量形式的令牌，唯一的取值来源是 styles/tokens.css。 */
export const ink = "var(--color-ink)";
export const paper = "var(--color-paper)";
export const pink = "var(--color-hot-pink)";
export const lime = "var(--color-acid-lime)";
export const cyan = "var(--color-electric-cyan)";
export const tangerine = "var(--color-tangerine)";
export const slab = "var(--surface-slab)";

/** 强调色底上的文字：固定深色，不随明暗模式变化。 */
export const onAccent = "var(--color-on-accent)";
export const onPink = "var(--color-on-pink)";

/** 大块选中填充与表头底色。 */
export const activeFill = "var(--color-active-fill)";
export const activeText = "var(--color-active-text)";
export const headBg = "var(--color-head-bg)";
export const headText = "var(--color-head-text)";

/** 构建日志控制台：两种模式下都保持黑底浅字。 */
export const consoleBg = "var(--surface-console)";
export const consoleText = "var(--text-console)";

/** palette 需要可解析的颜色值，CSS 变量在那里不可用。 */
export const HEX = {
  ink: "#000000",
  paper: "#ffffff",
  pink: "#ff006e",
  lime: "#ccff00",
  cyan: "#00d9ff",
  tangerine: "#ff9500",
  slab: "#f4f4f4",
} as const;

/** 暗色只反转结构色，强调色与色相不变。 */
export const HEX_DARK = {
  ink: "#f2f2f2",
  paper: "#0b0b0b",
  pink: "#ff006e",
  lime: "#ccff00",
  cyan: "#00d9ff",
  tangerine: "#ff9500",
  slab: "#171717",
} as const;

export const sans = "var(--font-sans)";
export const mono = "var(--font-mono)";

export const shadowSm = "var(--shadow-sm)";
export const shadowLg = "var(--shadow-lg)";
export const shadowLift = "var(--shadow-lift)";
export const shadowLiftPink = "var(--shadow-lift-pink)";

export const easeOut = "var(--ease-out)";
export const border = `2px solid ${ink}`;

/** 全大写等宽标签：这套界面的第二识别点。 */
export const labelStyle = {
  fontFamily: mono,
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  lineHeight: 1.4,
} as const;

/** 标题固定 900 字重，力量来自字重与紧缩字距。 */
export const headingStyle = {
  fontFamily: sans,
  fontWeight: 900,
  letterSpacing: "-0.02em",
  lineHeight: 1.05,
} as const;

export function mergeSx(base: SxProps<Theme>, extra?: SxProps<Theme>): SxProps<Theme> {
  if (!extra) return base;
  return [base, extra] as SxProps<Theme>;
}

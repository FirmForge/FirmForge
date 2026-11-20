import { createTheme } from "@mui/material/styles";
import {
  activeFill,
  activeText,
  cyan,
  easeOut,
  headBg,
  headText,
  HEX,
  HEX_DARK,
  ink,
  labelStyle,
  lime,
  mono,
  onAccent,
  paper,
  pink,
  sans,
  shadowLg,
  shadowLift,
  shadowSm,
  slab,
} from "./styles/tokens";

const press = { transform: "translate(6px, 6px)", boxShadow: "none" } as const;
const lift = { transform: "translate(-4px, -4px)", boxShadow: shadowLift } as const;

export type ThemeMode = "light" | "dark";

/** 新野兽派：2px 墨黑外框、无模糊硬阴影、零圆角，颜色只有黑白加四支强调色。 */
export function createBrutalTheme(mode: ThemeMode) {
  const C = mode === "dark" ? HEX_DARK : HEX;
  return createTheme({
  palette: {
    mode: "light",
    primary: { main: C.ink, contrastText: C.paper },
    secondary: { main: C.pink, contrastText: C.ink },
    success: { main: C.lime, contrastText: C.ink },
    warning: { main: C.tangerine, contrastText: C.ink },
    error: { main: C.pink, contrastText: C.paper },
    info: { main: C.cyan, contrastText: C.ink },
    background: { default: C.paper, paper: C.paper },
    divider: C.ink,
    text: { primary: C.ink, secondary: C.ink, disabled: C.ink },
    action: { hover: C.slab, selected: C.lime, disabled: C.ink },
  },

  shape: { borderRadius: 0 },
  typography: {
    fontFamily: mono,
    fontSize: 14,
    htmlFontSize: 16,
    fontWeightRegular: 400,
    fontWeightBold: 700,
    allVariants: { letterSpacing: "-0.01em" },
    h1: { fontFamily: sans, fontSize: 48, fontWeight: 900, lineHeight: 0.95, letterSpacing: "-0.02em" },
    h2: { fontFamily: sans, fontSize: 32, fontWeight: 900, lineHeight: 1.05, letterSpacing: "-0.02em" },
    h3: { fontFamily: sans, fontSize: 24, fontWeight: 900, lineHeight: 1.1, letterSpacing: "-0.01em" },
    h4: { fontFamily: sans, fontSize: 20, fontWeight: 900, lineHeight: 1.15, letterSpacing: "-0.01em" },
    h5: { fontFamily: sans, fontSize: 18, fontWeight: 700, lineHeight: 1.2, letterSpacing: "-0.01em" },
    h6: { fontFamily: sans, fontSize: 16, fontWeight: 700, lineHeight: 1.2 },
    body1: { fontFamily: mono, fontSize: 14, lineHeight: 1.6 },
    body2: { fontFamily: mono, fontSize: 14, lineHeight: 1.6 },
    caption: { fontFamily: mono, fontSize: 12, lineHeight: 1.5, letterSpacing: "0.02em" },
    button: { ...labelStyle },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { backgroundColor: paper, color: ink },
      },
    },
    MuiButtonBase: {
      defaultProps: { disableRipple: true },
      styleOverrides: { root: { borderRadius: 0 } },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          ...labelStyle,
          minWidth: 0,
          minHeight: 0,
          padding: "12px 24px",
          border: `2px solid ${ink}`,
          borderRadius: 0,
          backgroundColor: paper,
          color: ink,
          boxShadow: shadowSm,
          transition: `box-shadow ${easeOut}, transform ${easeOut}, background-color ${easeOut}`,
          "&:hover": { backgroundColor: lime, color: onAccent, ...lift },
          "&:active": press,
          "&.Mui-focusVisible": { outline: `3px solid ${pink}`, outlineOffset: 2 },
          "&.Mui-disabled": {
            backgroundColor: slab,
            color: ink,
            border: `2px solid ${ink}`,
            boxShadow: "none",
            transform: "none",
            opacity: 1,
          },
        },
        contained: {
          backgroundColor: activeFill,
          color: activeText,
          "&:hover": { backgroundColor: lime, color: onAccent, ...lift },
        },
        outlined: { backgroundColor: paper, color: ink },
        text: { backgroundColor: paper, color: ink },
        sizeSmall: { padding: "8px 16px", fontSize: 12 },
        sizeLarge: { padding: "16px 32px", fontSize: 14 },
        startIcon: { marginLeft: 0, marginRight: 8, "& > *:nth-of-type(1)": { fontSize: 18 } },
        endIcon: { marginRight: 0, marginLeft: 8, "& > *:nth-of-type(1)": { fontSize: 18 } },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: 0,
          border: `2px solid ${ink}`,
          backgroundColor: paper,
          color: ink,
          boxShadow: shadowSm,
          padding: 8,
          transition: `box-shadow ${easeOut}, transform ${easeOut}, background-color ${easeOut}`,
          "&:hover": { backgroundColor: lime, color: onAccent, ...lift },
          "&:active": press,
          "&.Mui-disabled": { backgroundColor: slab, color: ink, boxShadow: "none", opacity: 1 },
        },
        sizeSmall: { padding: 4 },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: "none", borderRadius: 0, color: ink },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: { border: `2px solid ${ink}`, borderRadius: 0, boxShadow: shadowLg },
      },
    },
    MuiDivider: {
      styleOverrides: { root: { borderColor: ink, borderBottomWidth: 2, borderRightWidth: 2 } },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 0,
          backgroundColor: paper,
          fontFamily: mono,
          fontSize: 14,
          "& .MuiOutlinedInput-notchedOutline": { borderColor: ink, borderWidth: 2 },
          "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: ink, borderWidth: 2 },
          "&.Mui-focused": { boxShadow: shadowSm },
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: ink, borderWidth: 2 },
          "&.Mui-disabled": { backgroundColor: slab },
          "&.Mui-disabled .MuiOutlinedInput-notchedOutline": { borderColor: ink },
          "& textarea.MuiOutlinedInput-input": { padding: "12px", height: "auto", lineHeight: 1.6 },
        },
        input: { padding: "8px 12px" },
      },
    },
    MuiInputBase: {
      styleOverrides: { root: { borderRadius: 0, fontFamily: mono, fontSize: 14 } },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          ...labelStyle,
          letterSpacing: "0.08em",
          color: ink,
          "&.Mui-focused": { color: ink },
          "&.MuiInputLabel-shrink": { backgroundColor: paper, padding: "0 6px" },
        },
      },
    },
    MuiFormHelperText: {
      styleOverrides: {
        root: {
          fontFamily: mono,
          fontSize: 12,
          lineHeight: 1.5,
          color: ink,
          marginLeft: 0,
          marginTop: 6,
        },
      },
    },
    MuiFormControlLabel: {
      styleOverrides: { label: { fontFamily: mono, fontSize: 14 } },
    },
    MuiSelect: {
      defaultProps: { size: "small" },
      styleOverrides: { icon: { color: ink, right: 10 } },
    },
    MuiTextField: { defaultProps: { size: "small", margin: "none" } },
    MuiMenu: {
      styleOverrides: {
        paper: { border: `2px solid ${ink}`, borderRadius: 0, boxShadow: shadowLg, marginTop: 6 },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          fontFamily: mono,
          fontSize: 14,
          borderRadius: 0,
          borderBottom: `1px solid ${slab}`,
          "&:hover": { backgroundColor: lime, color: onAccent },
          "&.Mui-selected": { backgroundColor: lime, color: onAccent, fontWeight: 700 },
          "&.Mui-selected:hover": { backgroundColor: lime, color: onAccent },
        },
      },
    },
    MuiList: { styleOverrides: { root: { padding: 0, borderRadius: 0 } } },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 0,
          borderBottom: `2px solid ${ink}`,
          "&:hover": { backgroundColor: lime, color: onAccent },
          "&.Mui-selected": { backgroundColor: lime, color: onAccent },
          "&.Mui-selected:hover": { backgroundColor: lime, color: onAccent },
        },
      },
    },
    MuiListItemText: {
      styleOverrides: { primary: { fontFamily: mono }, secondary: { fontFamily: mono } },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          fontFamily: mono,
          fontSize: 13,
          color: ink,
          borderBottom: `2px solid ${ink}`,
          padding: "12px 16px",
          "&.MuiTableCell-sizeSmall": { padding: "8px 12px" },
        },
        head: {
          ...labelStyle,
          backgroundColor: headBg,
          color: headText,
          borderBottom: `2px solid ${ink}`,
          whiteSpace: "nowrap",
        },
        paddingCheckbox: { width: 52, paddingLeft: 12, paddingRight: 0 },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          "&.MuiTableRow-hover:hover": { backgroundColor: slab },
          "&:last-of-type td": { borderBottom: "none" },
        },
      },
    },
    MuiTableContainer: { styleOverrides: { root: { borderRadius: 0 } } },
    MuiCheckbox: {
      styleOverrides: {
        root: {
          padding: 0,
          width: 22,
          height: 22,
          borderRadius: 0,
          border: `2px solid ${ink}`,
          backgroundColor: paper,
          color: "transparent",
          display: "grid",
          placeItems: "center",
          transition: `background-color ${easeOut}`,
          "& .MuiSvgIcon-root": { display: "none" },
          "&:hover": { backgroundColor: slab },
          "&.Mui-checked": { backgroundColor: ink },
          "&.Mui-checked::after": {
            content: '"✓"',
            color: paper,
            fontSize: 13,
            fontWeight: 700,
            lineHeight: 1,
          },
          "&.Mui-checked:hover": { backgroundColor: ink },
          "&.Mui-disabled": { backgroundColor: slab, borderColor: ink },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          ...labelStyle,
          height: 26,
          borderRadius: 0,
          border: `2px solid ${ink}`,
          backgroundColor: paper,
          color: ink,
          "& .MuiChip-label": { padding: "0 8px" },
          "& .MuiChip-deleteIcon": { color: ink, margin: "0 4px 0 -4px", borderRadius: 0 },
          "& .MuiChip-deleteIcon:hover": { color: pink },
        },
        filled: { backgroundColor: ink, color: paper, border: `2px solid ${ink}` },
        outlined: { backgroundColor: paper, border: `2px solid ${ink}` },
        sizeSmall: { height: 22, fontSize: 11 },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: { height: 10, borderRadius: 0, border: `2px solid ${ink}`, backgroundColor: slab },
        bar: { backgroundColor: cyan },
        bar2: { backgroundColor: cyan },
      },
    },
    MuiSwitch: {
      styleOverrides: {
        root: {
          width: 48,
          height: 26,
          padding: 0,
          overflow: "visible",
          "& .MuiSwitch-switchBase": {
            padding: 2,
            "&.Mui-checked": {
              transform: "translateX(22px)",
              "& + .MuiSwitch-track": { backgroundColor: lime, opacity: 1 },
            },
          },
          "& .MuiSwitch-thumb": {
            width: 18,
            height: 18,
            borderRadius: 0,
            backgroundColor: ink,
            boxShadow: "none",
          },
          "& .MuiSwitch-track": {
            borderRadius: 0,
            border: `2px solid ${ink}`,
            backgroundColor: paper,
            opacity: 1,
          },
        },
      },
    },
    MuiTooltip: {
      defaultProps: { arrow: false, enterDelay: 400 },
      styleOverrides: {
        tooltip: {
          ...labelStyle,
          backgroundColor: ink,
          color: paper,
          borderRadius: 0,
          border: `2px solid ${ink}`,
          padding: "6px 10px",
          maxWidth: 320,
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        root: { minHeight: 0, border: `2px solid ${ink}`, backgroundColor: paper },
        indicator: { height: 4, backgroundColor: pink },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          ...labelStyle,
          minHeight: 0,
          minWidth: 0,
          padding: "8px 16px",
          borderRight: `2px solid ${ink}`,
          "&:last-of-type": { borderRight: 0 },
          "&.Mui-selected": { backgroundColor: activeFill, color: activeText },
        },
      },
    },
    MuiAvatar: { styleOverrides: { root: { borderRadius: 0 } } },
  },
});
}

export const theme = createBrutalTheme("light");

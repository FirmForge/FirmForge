import { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { EditorView } from "@codemirror/view";
import { StreamLanguage } from "@codemirror/language";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { Box, Typography } from "@mui/material";
import { useThemeMode } from "../theme-mode";
import { border, ink, labelStyle, mono, paper, shadowSm, slab } from "../styles/tokens";

/**
 * 高级脚本编辑器：等宽 + 行号 + shell 高亮，风格与设计系统一致（2px 外框、直角、无圆角）。
 * 不依赖 CDN，完全离线可用；变更即时回调，由调用方负责保存进构建参数。
 */
export function ScriptEditor({
  value,
  onChange,
  path,
  height = 320,
  plain = false,
  ariaLabel,
}: {
  value: string;
  onChange: (next: string) => void;
  path?: string;
  height?: number;
  plain?: boolean;
  ariaLabel: string;
}) {
  const { mode } = useThemeMode();

  const theme = useMemo(() => {
    const bg = mode === "dark" ? "#0b0b0b" : "#ffffff";
    const fg = mode === "dark" ? "#f2f2f2" : "#000000";
    return EditorView.theme(
      {
        "&": {
          backgroundColor: bg,
          color: fg,
          fontSize: "13px",
          fontFamily: mono,
          height: `${height}px`,
        },
        ".cm-content": { padding: "12px 0", caretColor: fg },
        ".cm-gutters": {
          backgroundColor: slab,
          color: mode === "dark" ? "#a8a8a8" : "#5a5a5a",
          borderRight: `2px solid ${mode === "dark" ? "#f2f2f2" : "#000000"}`,
          fontFamily: mono,
        },
        ".cm-activeLine": { backgroundColor: mode === "dark" ? "#171717" : "#f4f4f4" },
        ".cm-activeLineGutter": { backgroundColor: mode === "dark" ? "#171717" : "#f4f4f4" },
        ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
          backgroundColor: "#ff006e55",
        },
        ".cm-scroller": { overflow: "auto", fontFamily: mono },
        ".cm-cursor": { borderLeftColor: "#ff006e", borderLeftWidth: "2px" },
        "&.cm-focused": { outline: "none" },
      },
      { dark: mode === "dark" },
    );
  }, [height, mode]);

  const lines = value ? value.split("\n").length : 0;

  return (
    <Box>
      {path ? (
        <Box
          sx={{
            border,
            borderBottom: 0,
            backgroundColor: slab,
            px: 1.5,
            py: 0.75,
            display: "flex",
            alignItems: "center",
            gap: 1,
          }}
        >
          <Typography sx={{ ...labelStyle, letterSpacing: "0.08em" }}>{path}</Typography>
          <Typography sx={{ ...labelStyle, letterSpacing: "0.04em", ml: "auto", fontSize: 11 }}>
            {lines} LINES
          </Typography>
        </Box>
      ) : null}
      <Box
        sx={{
          border,
          backgroundColor: paper,
          boxShadow: shadowSm,
          "& .cm-editor": { height: `${height}px` },
          "& .cm-editor.cm-focused": { outline: "none" },
          "& .cm-scroller": { fontFamily: mono },
          "& .cm-content": { color: ink },
        }}
      >
        <CodeMirror
          value={value}
          height={`${height}px`}
          theme={theme}
          extensions={plain ? [] : [StreamLanguage.define(shell)]}
          basicSetup={{
            lineNumbers: true,
            highlightActiveLine: true,
            highlightActiveLineGutter: true,
            foldGutter: false,
            dropCursor: false,
            allowMultipleSelections: false,
            indentOnInput: true,
            bracketMatching: true,
            closeBrackets: false,
            autocompletion: false,
            rectangularSelection: false,
            crosshairCursor: false,
            highlightSelectionMatches: false,
            searchKeymap: true,
          }}
          placeholder={"#!/bin/sh\n# 例如：uci set system.@system[0].timezone=CST-8"}
          onChange={onChange}
          aria-label={ariaLabel}
        />
      </Box>
    </Box>
  );
}

#!/usr/bin/env bash
# 桌面应用冒烟检查：用隔离的数据目录启动 exe，确认 Rust 初始化真实写盘。
# 用法: scripts/smoke.sh <exe 路径>
set -uo pipefail

EXE="${1:-src-tauri/target/release/firmforge.exe}"
if [[ ! -f "$EXE" ]]; then
  echo "FAIL: 找不到可执行文件 $EXE"
  exit 1
fi

WORK="$(mktemp -d)"
# Windows 程序不认 MSYS 的 /tmp 路径，必须转成原生路径。
export FIRMFORGE_DATA_DIR="$(cygpath -w "$WORK/data")"
echo "数据目录: $FIRMFORGE_DATA_DIR"

"$EXE" &
PID=$!
sleep 6

STATUS=0
if kill -0 "$PID" 2>/dev/null; then
  echo "PASS: 进程存活（窗口已创建或正在初始化）"
else
  echo "FAIL: 进程已退出"
  STATUS=1
fi

if [[ -f "$FIRMFORGE_DATA_DIR/settings.json" ]]; then
  echo "PASS: settings.json 已生成"
  head -c 400 "$FIRMFORGE_DATA_DIR/settings.json"; echo
else
  echo "FAIL: settings.json 未生成"
  STATUS=1
fi

if [[ -f "$FIRMFORGE_DATA_DIR/jobs.json" ]]; then
  echo "PASS: jobs.json 已生成"
else
  echo "FAIL: jobs.json 未生成"
  STATUS=1
fi

kill "$PID" 2>/dev/null || true
wait "$PID" 2>/dev/null || true
rm -rf "$WORK"
exit "$STATUS"

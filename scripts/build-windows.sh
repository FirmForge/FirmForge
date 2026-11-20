#!/usr/bin/env bash
# Windows 构建入口。
# 背景：mingw 的 ld 与 windres 无法处理含中文的路径，而源码按用户习惯放在
# D:\项目文件\WRT-UI。因此先镜像到纯 ASCII 目录 D:\wrtui-build 再编译；
# 源码真源仍是 D:\项目文件\WRT-UI，本脚本不修改它。
set -euo pipefail

SRC="${WRT_UI_SRC:-D:/项目文件/WRT-UI}"
BUILD="${WRT_UI_BUILD:-D:/wrtui-build}"
export PATH="/c/msys64/mingw64/bin:$PATH"
export CC_x86_64_pc_windows_gnu=x86_64-w64-mingw32-gcc
export AR_x86_64_pc_windows_gnu=x86_64-w64-mingw32-ar

echo "== 同步源码 $SRC -> $BUILD"
# robocopy 的 0/1 都是成功（1 表示有文件被复制）。
set +e
robocopy "$SRC" "$BUILD" /MIR \
  /XD node_modules target dist .git \
  /XF "*.log" \
  /NFL /NDL /NJH /NJS /R:1 /W:1 >/dev/null
RC=$?
set -e
if [[ $RC -ge 8 ]]; then
  echo "FAIL: robocopy 返回 $RC"
  exit 1
fi

if [[ ! -d "$BUILD/node_modules" ]]; then
  echo "== 建立 node_modules 联接"
  cmd /c mklink /J "$(cygpath -w "$BUILD/node_modules")" "$(cygpath -w "$SRC/node_modules")" >/dev/null
fi

echo "== 前端构建"
( cd "$BUILD" && npm run build )

echo "== Rust release 构建"
( cd "$BUILD/src-tauri" && cargo build --release )

echo "== 打包 NSIS 安装器"
( cd "$BUILD" && npx tauri build --bundles nsis )

echo "== 产物"
ls -lh "$BUILD/../wrtui-target/release/wrt-ui.exe" 2>/dev/null || true
find "$BUILD/../wrtui-target/release/bundle/nsis" -name "*.exe" -maxdepth 1 2>/dev/null || true

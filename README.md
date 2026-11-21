# WRT-UI

OpenWrt / ImmortalWrt 固件可视化构建器，Windows 桌面应用（Rust + Tauri 3）。

选择设备与软件包、配置系统选项，通过 ImageBuilder 生成固件，并在本地管理构建历史与产物。

## 使用

完整手册见 [docs/manual.md](docs/manual.md)（应用内页头 `?` 按钮直达）。

1. 从 Releases 下载 `WRT-UI_<版本>_x64-setup.exe` 并安装（当前用户安装，不需要管理员）。
2. 首次启动后到「设置」确认固件生态与软件源（默认 ImmortalWrt + 国内镜像）。
3. 「固件构建」→ 选择设备 → 选择软件 → 配置固件 → 确认构建。
4. 构建完成后在结果页把产物保存到系统下载目录的 `WRT-UI` 文件夹。

应用只用**内置 VM 引擎**：安装包自带 Alpine 内核与 initramfs，构建时由应用启动一个 QEMU 虚拟机
在里面跑 ImageBuilder，**不需要 WSL、Docker 或任何用户侧 Linux 环境**，装完即可直接构建。
多引擎（Docker Engine / WSL Containers）路径已在 1.1.0 移除；若引擎资源缺失（「设置」页显示不可用），
重新安装即可恢复。

## 桌面集成（Windows）

- **托盘**：左键单击唤起主窗口；右键菜单 = 显示主窗口 / 打开数据目录 / 退出。
- **关闭行为**：点 × 只是收进托盘，真正退出走托盘菜单（不常驻后台做构建时不占 CPU）。
- **单实例**：重复双击 exe 会唤起已运行的窗口，不会开第二个副本。
- **窗口状态**：位置与大小自动记忆（自实现 `window.json`，恢复前校验尺寸与屏幕范围）。
- **开机自启**：默认关闭，在「设置 → 启动与窗口」里开启（写用户级 `Run` 注册表项，不需要管理员）。
- **构建通知**：构建结束（成功/失败）弹系统通知。
- **无控制台黑窗**：所有外部命令（`qemu` / `explorer`）都用 `CREATE_NO_WINDOW` 启动，exe 是 `Windows GUI` 子系统。

## 界面与设计规范

前端采用「新野兽派」设计语言：2px 纯黑外框、无模糊硬偏移阴影、零圆角、等宽正文、四支高饱和强调色。
所有颜色、字号、阴影、间距只从 `src/styles/tokens.css`（CSS 变量）与 `src/styles/tokens.ts` 取值，
MUI 组件的外观集中在 `src/theme.ts` 覆写；页面里不再写死颜色，也不要新增圆角、渐变或模糊阴影。

- **强调色职能固定**：荧光粉 = 选中/主强调与失败，酸柠绿 = hover 底与完成态，电青 = 数据与进行中，橘橙 = 警示。
- **交互是物理的**：hover 抬起（阴影变大、位移 -4px -4px），active 位移等于阴影偏移并把阴影归零。
- **无障碍**：键盘焦点统一 3px 荧光粉描边；`prefers-reduced-motion` 下关闭位移动画。

## 多语言

界面支持 10 种语言，可在侧栏底部「语言」切换，首次启动按系统语言自动选择，选择结果保存在本地：

简体中文、繁體中文、English、日本語、한국어、Deutsch、Français、Español、Italiano、Русский。

文案集中在 `src/i18n/<locale>.ts`，以 `zh-Hans.ts` 的键集为契约（缺键或多键都会编译失败）；
组件里只出现 `t("some.key", { 变量 })`，不要在 JSX 中写死自然语言文本。

## 明暗主题

页头右侧的太阳/月亮按钮切换亮色与暗色，选择随 `settings.json` 的 `theme` 字段保存，重启与升级后保持
（`localStorage` 只用于首帧防闪烁，不作为权威来源）。

暗色只反转结构色（`--color-ink` 变浅、`--color-paper` 变深），四支强调色不变；为免整屏白块刺眼，
大块选中填充（侧栏当前项、步骤条、主按钮）在暗色下改用酸柠绿，由 `--color-active-fill` 统一切换。

## 更新检测

与 clash-verge-rev 同一套机制：`tauri-plugin-updater` + 签名清单，应用内直接下载、校验、静默安装并重启。

- 清单由 CI 生成：`update.json`（直连 GitHub）与 `update-proxy.json`（ghproxy 加速），
  以滚动标签 `updater` 发布；`src-tauri/tauri.conf.json` 的 `plugins.updater.endpoints` 依次尝试两者。
- 安装包用 minisign 私钥签名（`TAURI_SIGNING_PRIVATE_KEY` 仓库 Secret），客户端用 `tauri.conf.json` 里的
  `pubkey` 校验；签名不匹配的包不会被安装。
- 前端逻辑在 `src/update.ts`：启动静默检查（1 小时缓存、24 小时重查），只比较数字版本段，
  远端版本比本地旧时不提示；“下载并安装”带进度，装完自动重启。
- 清单生成脚本：`scripts/make-update-json.mjs`（读取 `bundle/nsis/*.exe.sig` 与发布说明）。

## 数据位置

`%LOCALAPPDATA%\WRT-UI\`：`settings.json`、`jobs.json`、`jobs\<id>\build.log`、`jobs\<id>\output\`。
升级安装不会清空；可用环境变量 `WRT_UI_DATA_DIR` 指定其他目录。

设置页「数据目录」可一键更换：选目录后校验可写、把 `settings.json` 与 `jobs.json` 带过去，
再把路径写入 `<默认目录>/datadir.txt` 并自动重启；想回到默认目录，重选默认目录即可（指针文件会被删除）。

## 编辑器

「配置固件 → 高级脚本」内置 CodeMirror 编辑器（等宽、行号、shell 高亮、与设计系统一致的 2px 硬边框），
完全离线可用（不加载 CDN）。脚本写入 `/etc/uci-defaults/99-custom.sh`，首次开机执行。

## 固件产物

构建成功后结果页列出产物，可逐个「下载」（存到 `下载/WRT-UI/`）或点「打开产物目录」直接在资源管理器里定位
`jobs/<id>/output/`，不用再翻数据目录。

## 从源码构建

需要 Rust、Node 24+（Windows 默认走 GNU 工具链，见下）。常用命令都收在 `Makefile` 里：`make help` 列出全部目标，
`make check` 跑类型检查 + Rust 格式 + clippy + 测试，`make bundle` 产出 NSIS 安装包；
源码在中文路径下无法直接编译时用 `make mirror` 镜像到 ASCII 目录（`D:/wrtui-build`）再构建。

```bash
npm ci
npm run build                 # 前端 → dist/
npm i -D @tauri-apps/cli
npx tauri build               # 产出 target/release 与 bundle/nsis
```

Windows + GNU 工具链（本仓库默认）：

```bash
rustup target add x86_64-pc-windows-gnu
# 需要 x86_64-w64-mingw32-gcc / ar，例如 MSYS2: pacman -S mingw-w64-x86_64-gcc
export PATH="/c/msys64/mingw64/bin:$PATH"
```

**中文路径注意**：mingw 的 `ld` 与 `windres` 无法处理含中文的路径（本项目源码在 `D:\项目文件\WRT-UI`），
而 cargo 会把 junction 解析回真实路径，所以仅改 `target-dir` 不够，`src-tauri` 本身必须在 ASCII 真实目录。
仓库用 `scripts/build-windows.sh` 处理：镜像到 `D:\wrtui-build`（ASCII）后编译，源码真源不变。

```bash
bash scripts/build-windows.sh          # 同步 + 前端 + cargo build + NSIS 打包
```

**注意**：直接 `cargo build --release` 产出的 exe 是**开发配置**（会尝试连 `127.0.0.1:5273` 的 Vite 服务），
不能用于交付或验收。生产可执行文件与安装包必须用 `npx tauri build` 产出（它会设置 `TAURI_ENV_*` 并把 `dist` 内嵌）。

手工等价步骤：

```bash
robocopy "D:\项目文件\WRT-UI" D:\wrtui-build /MIR /XD node_modules target dist .git
cmd /c mklink /J D:\wrtui-build\node_modules "D:\项目文件\WRT-UI\node_modules"
cd /d/wrtui-build && npm run build && cd src-tauri && cargo build --release
```

`.cargo/config.toml` 已把 crates 源指向 rsproxy（只作用于本仓库）。

## 检查

业务核心（`wrt-ui-core`）不依赖 Tauri/WebView2，单测在这里运行：

```bash
npm run typecheck && npm test
cd src-tauri
cargo fmt --all -- --check
cargo clippy --all-targets -- -D warnings
cargo test -p wrt-ui-core
```

桌面外壳（`src-tauri`）的 `#[cfg(test)]` 只有一条纯逻辑断言，运行它需要 WebView2 运行时；
在 CI 的 `windows-latest` 上随 `cargo test` 一起执行。

## 图标

唯一视觉源是 `assets/wrt-ui-logo.png`；`python scripts/gen_icons.py` 生成 `src-tauri/icons` 下的 png 与 ico，不重新绘制。

## Tauri 版本

桌面外壳用 **Tauri 3**（当前官方只有 `3.0.0-alpha.6`，尚无稳定版）。迁移要点：
Tauri 3 把 webview 运行时从 `tauri` 的 feature 中移出，必须额外依赖 `tauri-runtime-wry` 并在
`tauri::Builder` 上显式 `.runtime(tauri_runtime_wry::Wry::default())`，漏掉这行 `cargo check`
仍然通过，但启动时会报 `RuntimeNotConfigured`。桌面端与插件均为同批 alpha（`3.0.0-alpha.3`）。

升级前夜的备份分支与回滚方式：`git checkout v1.1.2` 可回到 Tauri 2 的最后一个版本。

## 限制

- 安装包未做 Windows 代码签名（Authenticode），首次运行会提示未知发布者；
  更新包另用 minisign 签名，只用于 updater 校验完整性。
- 构建需要的软件源必须可访问：查询与下载都走「设置」里的代理。
- 更新清单依赖 GitHub Releases（国内可走 `update-proxy.json` 的 ghproxy 镜像）。

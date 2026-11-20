# WRT-UI

OpenWrt / ImmortalWrt 固件可视化构建器，Windows 桌面应用（Rust + Tauri 2）。

选择设备与软件包、配置系统选项，通过 ImageBuilder 生成固件，并在本地管理构建历史与产物。

## 使用

1. 从 Releases 下载 `WRT-UI_<版本>_x64-setup.exe` 并安装（当前用户安装，不需要管理员）。
2. 首次启动后到「设置」确认固件生态与软件源（默认 ImmortalWrt + 国内镜像）。
3. 「固件构建」→ 选择设备 → 选择软件 → 配置固件 → 确认构建。
4. 构建完成后在结果页把产物保存到系统下载目录的 `WRT-UI` 文件夹。

Windows 上默认使用**内置 VM 引擎**：安装包自带 Alpine 内核与 initramfs，构建时由应用启动一个
QEMU 虚拟机在里面跑 ImageBuilder，**不需要 WSL、Docker 或任何用户侧 Linux 环境**。
若引擎资源缺失（「设置」页显示「内置 VM 引擎 不可用」），重新安装即可恢复；
也支持退回 Docker Engine / WSL Containers 构建（装过 Docker Desktop 或 `wslc` 时可用）。

## 桌面集成（Windows）

- **托盘**：左键单击唤起主窗口；右键菜单 = 显示主窗口 / 打开数据目录 / 退出。
- **关闭行为**：点 × 只是收进托盘，真正退出走托盘菜单（不常驻后台做构建时不占 CPU）。
- **单实例**：重复双击 exe 会唤起已运行的窗口，不会开第二个副本。
- **窗口状态**：位置与大小自动记忆（自实现 `window.json`，恢复前校验尺寸与屏幕范围）。
- **开机自启**：默认关闭，在「设置 → 启动与窗口」里开启（写用户级 `Run` 注册表项，不需要管理员）。
- **构建通知**：构建结束（成功/失败）弹系统通知。
- **无控制台黑窗**：所有外部命令（`wslc` / `docker` / `qemu` / `explorer`）都用 `CREATE_NO_WINDOW` 启动，exe 是 `Windows GUI` 子系统。

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

页头右侧的太阳/月亮按钮切换亮色与暗色，选择写入 `localStorage["wrt-ui.theme"]`，刷新与升级后保持。

暗色只反转结构色（`--color-ink` 变浅、`--color-paper` 变深），四支强调色不变；为免整屏白块刺眼，
大块选中填充（侧栏当前项、步骤条、主按钮）在暗色下改用酸柠绿，由 `--color-active-fill` 统一切换。

## 更新检测

启动时静默检查一次 GitHub 最新发布（结果缓存 24 小时，手动检查不受限制），
版本比较在 `src-tauri/core/src/util.rs` 的 `version_greater`，来源固定为
`https://api.github.com/repos/MinimaxFlora/WRT-UI/releases/latest`。

- 有新版本时页头出现荧光粉徽标，点击进入设置页「07 更新」查看说明与发布页链接。
- 只报告版本与说明，**不下载、不安装**：安装包未签名，更新由用户手动下载覆盖。
- 草稿与预发布不提示；发布说明按纯文本显示（去掉 Markdown 标记），不渲染 HTML。
- 打开发布页的 IPC 只接受 `https://github.com/MinimaxFlora/WRT-UI/releases` 前缀。

## 数据位置

`%LOCALAPPDATA%\WRT-UI\`：`settings.json`、`jobs.json`、`jobs\<id>\build.log`、`jobs\<id>\output\`。
升级安装不会清空；可用环境变量 `WRT_UI_DATA_DIR` 指定其他目录。

## 从源码构建

需要 Rust、Node 24+（Windows 默认走 GNU 工具链，见下）。

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

## 限制

- 安装包未做代码签名，Windows 会提示未知发布者。
- 未实现自动更新。
- 构建镜像与软件源必须可访问：查询走「设置」里的代理，镜像拉取走系统 Docker/WSL 配置。

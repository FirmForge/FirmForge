# PROJECT_AUDIT

## 1. 审计对象与基准的实际情况

| 项 | 结论 |
| --- | --- |
| 名义目标仓库 | `https://github.com/MinimaxFlora/WRT-UI` |
| 仓库状态 | **空仓库**：`GET /branches` 返回 `[]`，`GET /commits` 返回 `409 Git Repository is empty`，`size: 0`，创建于 2026-11-17 |
| 本地原源码 | 无。`D:\项目文件` 下不存在 WRT-UI 目录；`D:\项目文件\wrt` 为空目录 |
| 可运行原版 | 不存在，无法截图、无法采集行为基线 |
| 实际参照基准 | `https://github.com/sky22333/wrtkit`（Go + React 的同类本地固件构建器，源码已逐文件审阅） |

因此本文的记录必须如实标注：**本次交付不是"原 WRT-UI 网页项目迁移"，而是"以 wrtkit 的业务逻辑为参照、在新仓库内建立的 WRT-UI 桌面应用"**。
前端页面、交互与视觉是在新工程内实现的，不存在"原前端保持不变"的对照物。
`docs/FEATURE_PARITY.md` 的对照列指向 wrtkit 的行为，而不是虚构的"原 WRT-UI"。

## 2. 参照项目（wrtkit）技术事实

- 形态：本地单二进制 Web 服务，默认 `127.0.0.1:8088`，React + MUI 前端内嵌进 Go 二进制。
- 后端：Go 1.26 + Gin；SQLite（modernc.org/sqlite）存任务与设置；`scs` 会话 + argon2id 管理员认证。
- 构建：调用 ImageBuilder 容器镜像（`immortalwrt/imagebuilder`、`openwrt/imagebuilder`），Windows 侧用 WSL Containers（`wslc.exe`），Linux 侧直连 Docker unix socket API。
- 上游数据：`.versions.json`、`.overview.json`、`targets/<target>/profiles.json`、`packages/<arch>/<feed>/index.json`、`kmods/<kernel>/index.json`、Docker Hub tag digest。
- 关键业务规则：镜像 digest 钉住 + `REVISION` 校验；构建期与运行期双重替换软件源并校验 URL 归属；`uci-defaults` 分 09/10/95/99 四段；opkg/apk 双时代兼容靠文件探测；25.12 起管理地址使用 CIDR。
- 依赖许可：仓库 `license: null`（未声明许可）。因此**不复制其源码**，只按行为等价重写：Rust 后端全部为原创实现，前端组件、文案与布局独立编写。

## 3. 本机构建环境实测

| 组件 | 实测结果 |
| --- | --- |
| OS | Windows 11 x64 |
| Rust | `rustc 1.99.1`，默认 toolchain `stable-x86_64-pc-windows-gnu`（仅 gnu target） |
| C 工具链 | 初始缺失。本次安装 MSYS2（清华镜像 `msys2-x86_64-20260927.exe`，静默装到 `C:\msys64`）并 `pacman -S mingw-w64-x86_64-gcc` |
| Node / npm | `node 26.12.1` / `npm 12.0.2`，registry 指向 `registry.npmmirror.com` |
| WebView2 | 已存在（`157.0.4341.46`） |
| crates 源 | `index.crates.io` 与 `rsproxy.cn` 均可达；本项目在 `.cargo/config.toml` 使用 rsproxy sparse 镜像 |
| GitHub 直连 | `github.com` / `codeload` / `raw.githubusercontent.com` 直连不稳定（连接重置），审计期通过浏览器抓取 raw 文件 |
| MSVC | 不存在，因此本项目固定使用 `x86_64-pc-windows-gnu` 目标，并在 `.cargo/config.toml` 指定 `x86_64-w64-mingw32-gcc/ar` |
| 中文路径 | **实测会失败**：`mingw ld` 找不到 target 内 `.def/.o`（`D:\项目文件\...`），`tauri-winres` 的 `windres` 报 `can't open icon file ...Invalid argument`。cargo 会把 junction 解析回真实中文路径，因此仅改 `target-dir` 不够：由 `scripts/build-windows.sh` 把源码镜像到 ASCII 目录 `D:\wrtui-build` 后编译（node_modules 用 junction 复用），源码真源不动 |
| NSIS 打包器 | GitHub Release 资产可用 curl 下载（网页打不开）。已预置 `%LOCALAPPDATA%\tauri\NSIS`（nsis-3.13 解压 + `Plugins/x86-unicode/additional/nsis_tauri_utils.dll`） |

## 4. 工程结构（实际）

```
WRT-UI/
├─ src/                     # React 19 + TS + MUI 9 前端（Vite 8）
│  ├─ App.tsx               # 左侧导航 + 顶部信息栏 + 页面切换
│  ├─ api.ts                # 唯一 IPC 适配层（invoke / event 封装）
│  ├─ types.ts              # 与 core::models 对齐的 DTO
│  ├─ packageSelection.ts   # 默认包合并、中文翻译、推荐包（纯逻辑，有测试）
│  ├─ format.ts             # 容量/时间/状态（纯逻辑，有测试）
│  ├─ pages/BuildPage.tsx   # 四步流程 + 结果页的数据流
│  ├─ pages/BuildSteps.tsx  # 四个步骤 + 结果视图的展示组件
│  ├─ pages/HistoryPage.tsx
│  └─ pages/SettingsPage.tsx
├─ src-tauri/
│  ├─ core/                 # wrt-ui-core：纯业务，无 Tauri 依赖，单测在此运行
│  │  └─ src/{models,error,net,upstream,scripts,store,util}.rs
│  ├─ src/lib.rs            # Tauri 2 初始化与命令注册
│  ├─ src/commands.rs       # 全部 IPC 命令 + 构建任务执行
│  ├─ src/state.rs          # 共享状态（设置、任务、活动构建、下载器）
│  ├─ src/runtime.rs        # WSL Containers / Docker 执行引擎
│  ├─ icons/                # 由唯一品牌源图生成的 png/ico
│  ├─ capabilities/default.json
│  └─ tauri.conf.json
├─ scripts/gen_icons.py     # 品牌图标生成（唯一视觉源）
├─ scripts/build-windows.sh # ASCII 镜像目录构建入口（中文路径规避）
├─ scripts/smoke.sh         # 桌面启动冒烟检查
├─ docs/                    # 本组文档
└─ .github/workflows/build.yml
```

## 5. 与"原项目"差异的明确声明

1. 没有原前端可保留，因此前端是新建实现，视觉语言按参照项目的"浅色专业工具"方向自行设计。
2. 没有原 API 契约，因此 IPC 契约按参照项目的业务能力重新定义（见 `ARCHITECTURE.md`）。
3. 认证、会话、HTTP 服务属于"网页形态"的产物，桌面版不需要：产物改为本地应用数据目录，调用改为进程内 IPC。这一处是**有意的能力变更**，不是缺失。

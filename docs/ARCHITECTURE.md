# ARCHITECTURE

## 1. 形态

FirmForge 是 **Tauri 3 桌面外壳 + 本地打包前端 + Rust 业务后端**。

```
┌─────────────────────────────────────────────┐
│ Tauri 窗口（WebView2）                       │
│  React 19 + MUI 9 + Vite 8（dist 内嵌进 exe）│
│        │ invoke(command, args)  ▲ event     │
└────────┼────────────────────────┼───────────┘
         ▼                        │
┌─────────────────────────────────┴───────────┐
│ Rust 后端（单进程，tokio 异步）              │
│ commands → 参数与权限边界                    │
│ state    → 设置 / 任务 / 活动构建 / Fetcher   │
│ upstream → 版本、设备、资料、索引、预检        │
│ scripts  → run.sh 与 uci-defaults           │
│ runtime  → wslc.exe 或 docker CLI           │
│ store    → 应用数据目录（jobs/settings/log） │
└─────────────────────────────────────────────┘
```

没有任何常驻 HTTP 服务，没有 Node 后端；生产构建的 `frontendDist` 是本地 `dist/`。

## 2. 模块边界

工程分为**两层**：`src-tauri/core`（`firmforge-core`，纯业务，不依赖 Tauri/WebView2）与 `src-tauri/src`（桌面外壳）。
单元测试跑在 core 里，因此可以在没有 WebView2 的环境（含 CI 容器）执行。

| 模块 | 归属 | 职责 | 明确不负责 |
| --- | --- | --- | --- |
| `commands.rs` | 外壳 | IPC 入参校验、状态推进、事件 emit、错误转字符串、系统通知 | 不实现 HTTP/脚本细节 |
| `state.rs` | 外壳 | 共享状态与并发约束（单任务、设置更新原子性、当前构建引擎） | 不做 IO 细节 |
| `runtime.rs` | 外壳 | 容器引擎（wslc/docker CLI，均以 `CREATE_NO_WINDOW` 启动）、文件层落盘、日志流 | 不校验业务规则 |
| `lib.rs` | 外壳 | Tauri 初始化：托盘、单实例、窗口状态、开机自启、关闭收托盘 | 不含业务逻辑 |
| `net.rs` | core | `Fetcher`（UA/超时/重定向白名单/体积上限）、软件源与代理校验、镜像前缀校验 | 不解析业务 JSON |
| `upstream.rs` | core | 上游 JSON 结构、版本/设备/索引/预检、tag 规则 | 不发事件、不落盘 |
| `scripts.rs` | core | 生成 `run.sh`、镜像/快捷/主题/自定义 uci-defaults | 不执行容器 |
| `store.rs` | core | 数据目录、原子写、日志增量读、构建校验、固件后缀 | 不碰网络 |
| `util.rs` | core | 任务 ID 与 ISO 时间戳 | 无状态 |
| 前端 `api.ts` | 前端 | 唯一 IPC 适配层；非 Tauri 环境直接报错而不是伪造数据 | 不拼命令行、不存密钥 |

## 3. IPC 契约

命令统一 `rename_all = "snake_case"`，返回 `Result<T, AppError>`；`AppError` 序列化为 `code\u0001message`，前端只展示 message。

| 命令 | 参数 | 返回 |
| --- | --- | --- |
| `environment` | — | `Environment{name,available,message}` |
| `list_versions` | `mirror` | `Versions{stable,versions[]}` |
| `list_devices` | `mirror, version` | `Device[]` |
| `get_profile` | `mirror, version, target, profile` | `ProfileInfo` |
| `list_packages` | `mirror, version, target, profile` | `PackagesResult{arch,items[],warnings[]}` |
| `get_settings` | — | `Settings` |
| `save_mirrors` | `mirrors[]` | `Settings` |
| `save_registry` | `registry` | `Settings` |
| `save_proxy` | `proxy` | `Settings` |
| `switch_ecosystem` | `ecosystem` | `Settings` |
| `create_job` | `build` | `Job` |
| `list_jobs` / `get_job` | — / `id` | `Job[]` / `Job` |
| `cancel_job` | `id` | `()` |
| `read_log` | `id, offset` | `{text, next}` |
| `list_artifacts` / `save_artifact` | `id` / `id, name` | `Artifact[]` / 目标路径 |
| `cleanup_preview` / `cleanup_job` | `id` | `CleanupInfo` / 释放字节数 |
| `open_data_dir` | — | 数据目录路径 |

事件：`job-update`（`{id,status,stage,error}`）、`job-log`（`{id,text}`，150ms 合批）。

## 4. 异步与资源模型

- 所有 IPC 命令是 `async`，网络与容器操作在 tokio 任务中执行，不阻塞 UI。
- 一次构建 = 一个 tokio 任务；`AbortHandle` 存在 `state.active`，取消即 abort，子进程因 `kill_on_drop(true)` 被终止。
- 容器日志通过 `mpsc` → 合并缓冲 → 每 150ms 落盘一次并 emit 一次，避免高频事件刷 UI。
- 退出时把 `queued/running` 记录改写为 `interrupted`（下次启动读到旧状态时纠正），避免"永远进行中"。
- 凭据（root/Wi-Fi/PPPoE 密码）只存在于内存的 `Build`，落库副本调用 `Build::persisted()` 清空。

## 5. 安全边界

1. `capabilities/default.json` 只授予 `core:default`；不使用 shell、fs、http 插件。
2. 前端不接触系统命令：只有 `runtime.rs` 以**参数数组**方式调用 `wslc` / `docker`，不经过 shell。
3. 软件源校验：必须 https、无凭据/查询/片段、路径仅 `[A-Za-z0-9._/-]`、禁 `..`、禁跳转 `immortalwrt.org`/`openwrt.ai`/`kyarucloud`（`downloads.immortalwrt.org` 例外）。
4. 版本/平台/profile/包名/主机名/CIDR/时区全部正则或白名单校验；单次响应体上限 24 MiB，索引文本 256 KiB。
5. 文件层只允许相对路径且落在 `wrtkit/` 下，拒绝 `..` 与绝对路径。
6. 产物保存只接受 basename + 固件后缀，写入系统下载目录。
7. 生产构建不暴露调试命令；错误消息统一中文、不含内部路径以外的敏感信息。

## 6. 数据目录

```
%LOCALAPPDATA%\FirmForge\
├─ settings.json          # 生态、软件源、镜像加速、代理
├─ jobs.json              # 任务记录（原子写，含中断纠正）
└─ jobs\<id>\
   ├─ build.log           # 构建日志（增量读取上限 256 KiB）
   └─ output\             # 固件产物
```

可用环境变量 `FIRMFORGE_DATA_DIR` 覆盖，用于自动化测试与便携部署。

## 7. 构建与发布

- 目标固定 `x86_64-pc-windows-gnu`（本机无 MSVC），链接器 `x86_64-w64-mingw32-gcc`。
- `.cargo/config.toml` 使用 rsproxy sparse 镜像（只作用于本仓库）。
- 图标唯一视觉源 `assets/firmforge-logo.png` → `scripts/gen_icons.py` 生成 png/ico，不重绘。
- NSIS 安装器，`installMode: currentUser`（不强制管理员），中文/英文安装语言。

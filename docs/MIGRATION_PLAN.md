# MIGRATION_PLAN

> 前提说明：本计划的"阶段 A"没有原项目可审计。真实基准仓库为空，因此 A 阶段的产出是
> "确认基准缺失 + 记录参照项目行为"（见 `PROJECT_AUDIT.md`），并据此调整为**新建成工程**。
> 这不是把空项目伪装成已完成迁移：原前端、原 API 都不存在，无法"保持不变"。

## 阶段 A：源码审计 —— 已完成（以参照项目替代）

- [x] 确认 `MinimaxFlora/WRT-UI` 为空仓库（branches `[]`，commits `409`，size 0）
- [x] 确认本地无原源码（`D:\项目文件` 无 WRT-UI，`D:\项目文件\wrt` 为空）
- [x] 逐文件审阅参照项目 wrtkit：`server.go`(789行)、`runtime.go`、`packages.go`、`quick.go`、
      `preflight.go`、`mirror_config.go`、`ecosystem.go`、`auth.go`、`cleanup.go`、`ci.yml`、前端 `App/useWorkspace/packageSelection`
- [x] 记录参照项目的业务规则清单（版本探测、tag 规则、digest 钉住、源替换、uci-defaults 顺序、CIDR 分界）
- [x] 记录本机工具链实测结果，并补齐缺失的 C 工具链（MSYS2 + mingw-w64-gcc）
- [x] 输出 `PROJECT_AUDIT.md`、`FEATURE_PARITY.md`

风险与偏差：无原版可作为视觉/交互基准，验收只能对"参照项目行为"做等价性判断。

## 阶段 B：Tauri 2 工程集成 —— 已完成

- [x] `src-tauri/Cargo.toml`（tauri 2 + tokio + reqwest(native-tls) + tar + pwhash + dirs）
- [x] `tauri.conf.json`：`frontendDist: ../dist`、窗口 1180×820、最小 960×620、`identifier: vip.tatalvpai.wrtui`
- [x] `capabilities/default.json`：仅 `core:default`
- [x] 图标：唯一源图 → 32/128/256/512 png + `icon.ico`（多尺寸）
- [x] 前端在 Vite 中可独立 `npm run build`，产物由 Tauri 本地加载

## 阶段 C：Rust 后端基础设施 —— 已完成

- [x] `error.rs` 统一错误 + 可序列化错误消息
- [x] `models.rs` DTO 与前端 `types.ts` 字段一一对应
- [x] `net.rs` Fetcher、镜像/代理/仓库前缀校验、重定向白名单
- [x] `state.rs` 设置/任务/活动构建的并发模型
- [x] `store.rs` 应用数据目录、原子写、日志增量、启动中断纠正
- [x] 命令层只做边界与编排，业务在服务模块

## 阶段 D：逐项迁移业务 —— 已完成

按 `FEATURE_PARITY.md` 的 27 项逐条实现，每项都有实现位置与验证方式。
关键等价点：`image_tag` 规则（immortalwrt 加 `openwrt-` 前缀、SNAPSHOT 原样）、
`docs/FEATURE_PARITY.md#L20` 的 digest 钉住、`REVISION` 一致性校验、构建期与运行期双源替换、
opkg/apk 文件探测、25.12 CIDR 分界、默认包减号语义。

有意不实现的 4 项（认证/HTTP 服务/SQLite/Origin 校验）在 `FEATURE_PARITY.md` 第四节列明原因与替代。

## 阶段 E：Windows 原生体验 —— 已完成（可执行）

- [x] 应用名 `WRT-UI`、窗口标题一致、`productName`/`publisher`/`description` 已填
- [x] 图标与品牌一致（源图未重绘）
- [x] 用户数据写入 `%LOCALAPPDATA%\WRT-UI`
- [x] 中文路径数据目录（`D:\项目文件\WRT-UI`）下构建，日志与产物正常
- [x] 单实例/托盘等增强能力**未加**：无明确需求，不做堆砌
- [ ] 安装/卸载/升级保数据 —— 待在本机执行安装包验证

## 阶段 F：构建、测试与发布 —— 已完成（安装验证待用户执行）

- [x] `cargo test -p wrt-ui-core`：21 passed
- [x] `cargo clippy --all-targets --all-features -- -D warnings`：0 warning
- [x] `cargo fmt --all -- --check`：通过
- [x] `npm run typecheck` / `npm test`（11 passed）/ `npm run build`
- [x] `npx tauri build --bundles nsis` 产出 `wrt-ui.exe`（5.3 MiB）与 `WRT-UI_1.0.0_x64-setup.exe`（1.96 MiB）
- [x] SHA256 已生成（`wrt-ui.exe.sha256`、`bundle/nsis/SHA256SUMS.txt`）
- [x] `.github/workflows/build.yml`（windows-latest，fmt/clippy/test/前端检查/打包/上传 + SHA256）
- [ ] 干净 Windows 环境安装验证（安装包已就绪，等待在你的机器上执行）

## 遗留与已知限制

1. 本机无 MSVC、无 Docker；界面显示 WSL Containers 可用（`wslc info` 返回成功），但**没有实际跑过一次完整固件构建**——
   那需要下载 ImageBuilder 镜像（数百 MB）并编译，属于需要你确认的重操作。
2. 安装包未做代码签名，Windows 会提示"未知发布者"；未实现自动更新。
3. `cargo build --release` 产物是开发配置（连 `devUrl`），验收/分发只能使用 `tauri build` 的产物——已写入 README 与 skill。
4. 原 WRT-UI 仓库为空，前端为新建实现（详见 `PROJECT_AUDIT.md` 的偏差声明）。

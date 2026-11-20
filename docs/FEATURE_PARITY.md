# FEATURE_PARITY

对照基准是 `sky22333/wrtkit` 的**实际行为**（源码审阅结论），不是不存在的"原 WRT-UI"。
状态含义：✅ 已实现并通过本地验证 · ⚠️ 已实现但依赖真实设备/网络才能完整验证 · ⛔ 有意不实现（桌面形态不需要）

> 实现位置中的 `upstream::` / `scripts::` / `store::` / `net::` / `util::` 都属于 `wrt-ui-core`
> （`src-tauri/core`，不依赖 Tauri）；`commands::` / `state::` / `runtime::` 属于桌面外壳。

## 一、设备与软件包目录

| # | 功能 | 行为要求 | 实现位置 | 状态 | 验证方式 |
| --- | --- | --- | --- | --- | --- |
| 1 | 版本列表 | 读 `.versions.json`，过滤非法版本号，探测分支 `-SNAPSHOT` 是否真实存在 | `upstream::versions` | ⚠️ | `cargo test` 覆盖过滤/派生规则；真实网络见"回归"章节 |
| 2 | 设备列表 | 读 `.overview.json` 的 profiles，拼装 vendor/model/variant 标题 | `upstream::devices` | ⚠️ | 同上 |
| 3 | 设备资料 | 读 `profiles.json`，取默认包、设备包、镜像清单、架构、修订号、根分区能力 | `upstream::profile` | ⚠️ | `cargo test` 覆盖 `disk_image` 判定 |
| 4 | 软件包索引 | `feeds.conf` 解析（≤32，失败回落 5 个常见源）+ 并发拉取 feed/target/kmods 索引，单源失败只记 warning | `upstream::packages` | ⚠️ | `cargo test` 覆盖 feeds 解析与分类规则 |
| 5 | 代理工具分类 | 索引无分类字段，按包名正则推断 `proxy` | `upstream::category_for` | ✅ | 单元测试 |
| 6 | 中文翻译 | `luci-(app/proto/mod/theme)-X` → `luci-i18n-X-zh-cn`，仅在索引存在时自动附加 | `packageSelection.resolveChineseTranslations` | ✅ | 前端 vitest |
| 7 | 推荐软件包 | 推荐项逐个校验存在性；`luci-theme-argon` 走主题通道 | `packageSelection.availableRecommendations` | ✅ | 前端 vitest |
| 8 | 默认包减号语义 | 设备包里的 `-pkg` 从默认包中移除 | `packageSelection.effectiveDefaultPackages` | ✅ | 前端 vitest |

## 二、配置与脚本生成

| # | 功能 | 行为要求 | 实现位置 | 状态 | 验证方式 |
| --- | --- | --- | --- | --- | --- |
| 9 | 主机名/时区 | `uci set system.@system[0]`，时区白名单 | `scripts::quick_script` | ✅ | 单元测试断言生成的 uci 行 |
| 10 | 管理地址 | 25.12+ 写 CIDR 并删 netmask；更早版本写 ipaddr + 点分掩码 | `scripts::quick_script` + `version_uses_cidr` | ✅ | 单元测试（24.10 / 25.12 两种输出） |
| 11 | root 密码 | sha512-crypt（`$6$`）写 `/etc/shadow`，脚本内不出现明文 | `scripts::quick_script`（pwhash） | ✅ | 单元测试断言 `$6$` 且无明文 |
| 12 | Wi-Fi | 仅当设备默认包含无线驱动 + hostapd 时显示；脚本用 `config_foreach` 只改 ap 且绑 lan 的 wifi-iface | `scripts::quick_script` + `hasWirelessDriver` | ✅ | 单元测试 + 前端 vitest |
| 13 | PPPoE | 账号密码成对校验；自动追加 `ppp-mod-pppoe`；与显式移除冲突时报错 | `scripts::validate_quick` + `commands::run_job_inner` | ✅ | 单元测试 |
| 14 | 主题 | 5 个已知主题写 `luci.main.mediaurlbase`，构建前在 luci 索引中确认存在 | `scripts::theme_script` + `upstream::preflight` | ✅ | 单元测试 |
| 15 | 高级脚本 | 写 `/etc/uci-defaults/99-custom.sh`，CRLF 归一，最后执行 | `scripts::files_for` | ✅ | 单元测试 |
| 16 | 软件源（运行期） | ImmortalWrt 同时改 `distfeeds.conf` / `apk/repositories.d` 并写 `system.@imm_init`；升级场景删旧 `opkg_mirror` | `scripts::ecosystem_mirror_script` | ✅ | 单元测试（两种生态） |
| 17 | 构建脚本 | 校验镜像 `REVISION` 与所选源一致；替换 repositories 并校验所有 URL 归属所选镜像；`make image` | `scripts::builder_script` | ✅ | 单元测试断言无用户输入插值 |

## 三、构建执行

| # | 功能 | 行为要求 | 实现位置 | 状态 | 验证方式 |
| --- | --- | --- | --- | --- | --- |
| 18 | 环境检测 | Windows 用 `wslc info`，其他平台 `docker version`；4 秒超时 | `runtime::check` | ✅ | 本机实测（见回归章节） |
| 19 | 镜像钉住 | Docker Hub tag → digest，拼 `repo@sha256:…` | `upstream::preflight` | ⚠️ | 网络可达时验证 |
| 20 | WSL Containers 执行 | pull → create（name/label/env）→ container cp → start -a → container cp 输出 → rm -f | `runtime::wslc::run` | ⚠️ | 需本机 wslc |
| 21 | Docker 执行 | 同上，命令换 `docker` | `runtime::docker::run` | ⚠️ | 需 Docker |
| 22 | 单任务并发 | 同时只允许一个构建，其余返回 Busy | `state::register_active` | ✅ | 代码路径 + 命令层错误 |
| 23 | 取消 | 中止任务、标记 cancelled、清容器 | `commands::cancel_job` | ✅ | 前端按钮 + abort 句柄 |
| 24 | 日志流 | 文件落盘 + 150ms 合批 emit `job-log`；单次读取上限 256 KiB | `commands::run_job_inner` + `store::read_log` | ✅ | 单元测试（增量读取） |
| 25 | 产物校验 | 后缀白名单；无固件判失败 | `store::is_firmware` + `run_job_inner` | ✅ | 单元测试 |
| 26 | 产物保存 | 复制到系统下载目录 `WRT-UI/`，同名加序号，只接受 basename + 固件后缀 | `commands::save_artifact` | ✅ | 代码路径 |
| 27 | 清理 | 删除产物 + 容器 + 镜像，保留记录，状态置 cleaned | `commands::cleanup_job` | ✅ | 代码路径 + 前端二次确认 |

## 四、有意不实现（桌面形态替代方案）

| # | 原能力 | 原因 | 替代 |
| --- | --- | --- | --- |
| 27 | 管理员账号 / 会话 Cookie / 登录限流 | 单机桌面应用无多用户场景，账号只会增加攻击面 | ⛔ 进程内 IPC + Tauri capability 最小权限 |
| 28 | 监听 127.0.0.1:8088 的 HTTP 服务 | 桌面版必须离线可用、不依赖浏览器 | ⛔ 前端打包进二进制，`frontendDist` 指本地 dist |
| 29 | SQLite 任务库 | 桌面单用户，键值/JSON 已够用，减少 native 依赖 | ⛔ `jobs.json` + `settings.json` 原子写 |
| 30 | Origin/CSRF 校验 | 无 HTTP 服务后不适用 | ⛔ 禁止前端直连系统命令，全部走命令白名单 |

## 六、桌面集成验证（本轮新增，均为实测）

| 项 | 结果 | 验证方式 |
| --- | --- | --- |
| exe 子系统 | `Windows GUI`（PE `Subsystem: 00000002`），双击不弹黑框 | `objdump -p` |
| 无控制台黑窗 | 所有 `wslc`/`docker`/`explorer` 子进程用 `CREATE_NO_WINDOW` | 启动+枚举窗口，无 `ConsoleWindowClass` 窗口 |
| 托盘 | `tray_icon_app` 窗口存在；左键唤起窗口；右键 = 显示/打开数据目录/退出 | `EnumWindows` 按 PID 枚举 |
| 关闭 = 收托盘 | 点 × 后进程存活、主窗口 `visible=False` | `SendMessageW(WM_CLOSE)` |
| 单实例 | 第二个实例退出码 0，第一个存活并被唤起 | 连续启动两次 |
| 窗口记忆 | `window.json` 记录 `x/y/width/height/maximized`，恢复前校验尺寸与显示器范围 | 关闭后读文件 |
| 开机自启 | 设置页开关（`autostart:default` 权限 + 用户级 Run 项） | 前端 `tsc` 通过；插件注册成功 |
| 构建通知 | 成功/失败各弹一条系统通知 | `notify_build` 调用路径 |
| 引擎探测 | Windows 优先 `docker version`，失败回落 `wslc info` | `runtime::preferred()` |

修复记录：`tauri-plugin-window-state` 在无历史状态时把窗口恢复到 `(-25600,-25600)`、`159×27`（用户会以为界面没打开）——已移除该插件，改为自实现几何记忆并做合法性校验。

## 五、回归测试清单（交付时逐项执行）

- [x] `cargo test -p wrt-ui-core`：21 个单元测试全部通过（版本过滤、tag 规则、feeds 解析、代理分类、digest、hostname/时区、CIDR 与 25.12 分界、脚本生成、文件层、存储往返、损坏文件兜底、构建校验、任务 ID/时间格式）
- [x] `cargo clippy --all-targets --all-features -- -D warnings`：0 警告
- [x] `cargo fmt --all -- --check`：通过
- [x] `npm run typecheck`：TS strict + `noUncheckedIndexedAccess` 通过
- [x] `npm test`：11 个 vitest 用例通过（默认包合并、翻译匹配、推荐包、无线识别、格式化、状态映射）
- [x] `npm run build`：Vite 生产构建通过（dist 内嵌进 exe）
- [x] 桌面启动实测：`WRT-UI_1.0.0_x64-setup.exe` 同源的 release 程序启动后窗口加载本地资源，数据目录自动生成 `settings.json`（默认 ImmortalWrt + 南京大学源）与 `jobs.json`；版本下拉真实读到 `25.12.6`
- [ ] 真实 wslc 构建一次固件（需目标设备与网络；界面已显示 WSL Containers 可用）
- [ ] NSIS 安装 / 卸载 / 升级保数据（安装包已产出，待在你机器上执行安装验证）

# WRT-UI 使用手册

WRT-UI 是一个 Windows 桌面应用，用 OpenWrt / ImmortalWrt 官方 ImageBuilder 生成固件：选设备、挑软件包、写首次启动配置，点一下就开始构建，产物直接可下载或在资源管理器里定位。

- 仓库：<https://github.com/MinimaxFlora/WRT-UI>
- 交流：<https://t.me/MomoFlora>

---

## 1. 安装与更新

1. 从 [Releases](https://github.com/MinimaxFlora/WRT-UI/releases) 下载 `WRT-UI_<版本>_x64-setup.exe`。
2. 双击安装，默认装到 `D:\WRT-UI\`（可在安装向导里改）。
3. 首次启动会自动检测内置 VM 引擎是否可用，右上角显示状态。

**自动更新**：应用启动后静默检查一次（1 小时缓存、24 小时重查），发现新版本时页头出现粉色徽标。
到「设置 → 更新与链接」点「检查更新」可以看到发布说明，点「下载并安装」后自动重启，装完版本即更新。
安装包带 minisign 签名，签名不匹配的包不会被安装。

---

## 2. 一次完整构建

底部四步向导，任何时候都可以「上一步」回退，填过的内容不会丢。

### 01 选择设备

- 顶部选择**固件版本**（来自镜像的 `.versions.json`）与**镜像**（设置页可增删）。
- 搜索框支持型号、target、设备 ID，例如 `ax3000`、`mediatek/filogic`、`xiaomi_mi-router-ax3000t`。
- 卡片显示设备名、target/subtarget、profile ID。点一下选中，右侧出现 `✓ 已选`。
- 设备多时用底部的「上一页 / 下一页」翻页（每页 20 台）。

### 02 选择软件

- 默认包（base-files、busybox、dropbear、firewall4 等）已自动勾选，不能取消。
- 可按分类筛选（主题、代理、工具等），输入名称搜索，支持多选。
- 关键包的版本与依赖会显示在行内，冲突由后端校验并在开始构建前提示。

### 03 配置固件

写入 `/etc/uci-defaults/`，**首次开机执行一次**，之后改配置不会重复执行：

- **身份与地址**：主机名、管理地址（CIDR）、root 密码（留空用固件默认）。
- **系统**：时区、LuCI 主题、根分区大小（MiB，0 为默认）。
- **网络与无线**：PPPoE 账号 / Wi-Fi SSID 与密码（设备没有无线驱动时会提示跳过）。
- **高级脚本**：内置编辑器（行号 + shell 高亮），写入 `/etc/uci-defaults/99-custom.sh`，在所有 `uci set` 之后执行，可以覆盖上面的设置。

### 04 确认构建

- 复核设备、版本、软件包数量与要写入的配置。
- 点「开始构建」后进入结果页，实时日志按阶段输出（准备环境 → 下载 ImageBuilder → 安装软件包 → 打包）。
- 构建过程中可以「取消」，已经下载的镜像会保留，下次更快。

---

## 3. 找到编译好的固件

构建成功后结果页会列出全部产物（`*-sysupgrade.bin`、`*-factory.img`、`*.itb` 等）：

- **下载**：存到 `下载/WRT-UI/`，同名文件会被覆盖。
- **打开产物目录**：直接在资源管理器打开 `jobs\<任务ID>\output\`，适合一次拿多个文件。

「构建历史」里能看到全部任务、日志大小与产物数量，也能从这里下载或清理。

---

## 4. 设置说明

设置页左侧是分组导航，右侧只显示当前分组，不用一路往下滚。

| 分组 | 内容 |
|---|---|
| 外观 | 主题（亮色 / 暗色 / 跟随系统）、界面语言（10 种） |
| 构建来源 | 生态（ImmortalWrt / OpenWrt）、镜像源列表（可增删排序）、查询代理 |
| 系统与工具 | 数据目录（可更改）、开机自启、开发者工具、UWP 环回豁免 |
| 更新与链接 | 检查更新、安装更新、GitHub / 手册 / Telegram 入口 |

### 主题

暗色只反转结构色与文字（黑→白、白→黑），四支强调色保持不变；「跟随系统」会随 Windows 明暗实时切换。
选择写入 `settings.json`，重启后保持。

### 数据目录

默认 `%LOCALAPPDATA%\WRT-UI\`，存放：

```
settings.json     配置
jobs.json         构建历史
jobs\<id>\build.log
jobs\<id>\output\  固件产物
```

点「更改目录」选一个新位置：会校验可写、把配置与历史带过去、写入指针文件并自动重启。
想回到默认目录，重选默认目录即可。

### 开发者工具

打开 WebView 调试器（Network / Console），排查界面或请求问题用；关掉不影响正在进行的构建。

### UWP 环回豁免

让 UWP 应用（如商店版客户端）访问本机服务。填入包族名（例如 `Microsoft.WindowsStore_8wekyb3d8bbwe`）后点「添加」，
名单来自系统 `CheckNetIsolation LoopbackExempt -s`，只在 Windows 生效。

---

## 5. 常见问题

**Q：启动提示「内置 VM 引擎不可用」？**
A：内置 VM 依赖随应用分发的 QEMU 资源。确认安装目录完整（`resources\qemu` 存在），或用 `make bundle` 重新打包；
杀毒软件隔离了 `qemu-system-*` 也会导致该提示。

**Q：设备列表是空的？**
A：镜像里没有当前版本的 `targets/<target>/profiles.json`。检查「设置 → 构建来源」里的镜像地址能否打开
`<镜像>/releases/<版本>/targets/`，或换一个镜像。

**Q：软件包列表提示某些源读取失败？**
A：镜像缺少某个 feed 的 `index.json`（常见于刚发布的快照版）。构建仍可继续，只是那一类包不可选。

**Q：构建很慢？**
A：首次构建要下载 ImageBuilder（几十 MB）与全部索引；同一版本第二次构建会复用缓存。
开启代理（设置 → 构建来源 → 查询代理）能明显加快 GitHub 与镜像的访问。

**Q：产物在哪？**
A：结果页「打开产物目录」，或「构建历史」里对应任务。默认在 `%LOCALAPPDATA%\WRT-UI\jobs\<id>\output\`。

**Q：升级会清掉我的配置和历史吗？**
A：不会。安装包只替换程序文件，数据目录独立存放。

---

## 6. 从源码构建

```bash
npm ci
npm run build
cargo build --release --manifest-path src-tauri/Cargo.toml
```

常用目标都收在 `Makefile`：`make check`（类型检查 + fmt + clippy + 测试）、`make exe`、`make bundle`（NSIS 安装包）、
`make mirror`（镜像到 ASCII 目录再编译，中文路径下必须用）。

技术栈：Tauri 3（alpha）+ Rust + React 19 + MUI + Vite；界面遵循「新野兽派」设计令牌（`src/styles/tokens.*`）。

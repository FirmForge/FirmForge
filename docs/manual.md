# FirmForge 使用手册

FirmForge 是一个 Windows 桌面应用，用 OpenWrt / ImmortalWrt 官方 ImageBuilder 生成固件：选设备、挑软件包、写首次启动配置，点一下就开始构建，产物直接可下载或在资源管理器里定位。

- 仓库：<https://github.com/FirmForge/FirmForge>
- 交流：<https://t.me/MomoFlora>

---

## 1. 安装与更新

1. 从 [Releases](https://github.com/FirmForge/FirmForge/releases) 下载 `FirmForge_<版本>_x64-setup.exe`。
2. 双击安装，默认装到当前用户的 `AppData\Local\FirmForge`（安装向导里可改）。
3. 首次启动会检测内置 VM 引擎；**首次构建会自动下载约 175 MiB 的虚拟机镜像**，之后走本地缓存。

**自动更新**：应用启动后静默检查一次（1 小时缓存、24 小时重查），发现新版本时页头出现粉色徽标。
到「设置 → 06 更新」点「检查更新」可以看到发布说明，点「下载并安装」后自动重启，装完版本即更新。
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

- **下载**：存到 `下载/FirmForge/`，同名文件会被覆盖。
- **打开产物目录**：直接在资源管理器打开 `jobs\<任务ID>\output\`，适合一次拿多个文件。

「构建历史」里能看到全部任务、日志大小与产物数量，也能从这里下载或清理。

---

## 4. 设置说明

设置页是一列纵向面板，编号 01 到 09：

- **01 固件生态**：ImmortalWrt / OpenWrt，切换会重置软件源。
- **02 软件源**：可增删的镜像列表（必须 HTTPS），同时用于构建与固件运行。
- **03 查询代理**：socks5 / http 代理，用于访问 GitHub 与镜像。
- **04 数据目录**：默认 `%LOCALAPPDATA%\FirmForge`，可一键更改（校验可写 → 迁移配置与历史 → 写指针文件 → 自动重启）。
- **05 启动与窗口**：开机自启、单实例、窗口位置记忆、关闭收进托盘。
- **06 更新**：当前版本、检查更新、发布说明、下载安装。
- **07 主题设置**：主要 / 次要 / 成功 / 警告 / 错误五色 + 十六进制输入、字体系列（等宽 / 无衬线 / 系统）、CSS 注入（「编辑 CSS」打开带行号的编辑器），保存立即生效并持久化。
- **08 开发者设置**：打开 WebView 调试器、打开数据目录。
- **09 UWP 设置**：读写系统的 UWP 环回豁免名单（`CheckNetIsolation LoopbackExempt`），填入包族名即可添加。

### 数据目录内容

默认目录 `%LOCALAPPDATA%\FirmForge\`：

```
settings.json     配置
jobs.json         构建历史
jobs\<id>\build.log
jobs\<id>\output\  固件产物
engine\vm\           下载的虚拟机镜像
```

点「更改目录」选新位置：校验可写、迁移配置与历史、写指针文件并自动重启；想回默认目录，重选默认目录即可。

---

## 5. 常见问题

**Q：提示「内置 VM 引擎不可用」？**
A：确认安装目录完整（`resources\qemu`、`resources\vm` 存在）；首次构建需要能访问 GitHub（下载虚拟机镜像）。

**Q：设备列表是空的？**
A：镜像里没有当前版本的 `targets/<target>/profiles.json`。检查「设置 → 02 软件源」里的镜像地址能否打开
`<镜像>/releases/<版本>/targets/`，或换一个镜像。

**Q：软件包列表提示某些源读取失败？**
A：镜像缺少某个 feed 的 `index.json`（常见于刚发布的快照版）。构建仍可继续，只是那一类包不可选。

**Q：构建卡在「解压 ImageBuilder」或报 `libfakeroot: connect`？**
A：虚拟机内存不足。应用按物理内存的 75% 分配（上限 12 GiB），宿主剩余内存太少时先关掉其他程序再试。

**Q：日志里出现 `Image file ... is too big`？**
A：所选设备 flash 装不下当前包集合，减少额外软件包，或换 flash 更大的设备。

**Q：构建很慢？**
A：首次构建要下载 ImageBuilder（几十 MB）与全部索引；同一版本第二次构建会复用缓存。
开启代理（设置 → 03 查询代理）能明显加快 GitHub 与镜像的访问。

**Q：产物在哪？**
A：结果页「打开产物目录」，或「构建历史」里对应任务。默认在 `%LOCALAPPDATA%\FirmForge\jobs\<id>\output\`。

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

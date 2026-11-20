use crate::error::{AppError, AppResult};
use crate::models::{Build, Ecosystem};
use crate::upstream::{valid_part, zone_value};

/// POSIX 单引号转义：' → '\''
pub fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

/// ImageBuilder 容器的入口脚本。真实构建参数全部来自环境变量，
/// 避免把用户输入拼进命令行。
pub fn builder_script(ecosystem: Ecosystem) -> String {
    let prefix = match ecosystem {
        Ecosystem::ImmortalWrt => "cd /home/build/immortalwrt\n".to_string(),
        Ecosystem::OpenWrt => {
            "cd /builder\nif [ ! -d scripts ]; then UPSTREAM_URL=\"$WRT_MIRROR\" bash ./setup.sh; fi\n"
                .to_string()
        }
    };
    format!("set -eu\n{prefix}{BODY}")
}

const BODY: &str = r#"
if ! grep -Fqx "REVISION:=$WRT_REVISION" include/version.mk; then
 echo "构建镜像与软件源的修订号不一致，请更换镜像或稍后重试"
 exit 1
fi
mkdir -p /tmp/wrtkit-work/output
cp -R /tmp/wrtkit/files /tmp/wrtkit-work/files
for f in repositories repositories.conf; do
 if [ -f "$f" ]; then
  sed -i "s|https://downloads.immortalwrt.org|$WRT_MIRROR|g;s|https://immortalwrt.kyarucloud.moe|$WRT_MIRROR|g;s|https://mirrors.vsean.net/openwrt|$WRT_MIRROR|g;s|https\?://downloads.openwrt.org|$WRT_MIRROR|g" "$f"
  for url in $(grep -Eo 'https?://[^[:space:]]+' "$f" || true); do
   case "$url" in "$WRT_MIRROR"/*) ;; *) echo "软件源地址不属于所选镜像: $url"; exit 1 ;; esac
  done
 fi
done
chmod 755 /tmp/wrtkit-work/files/etc/uci-defaults/*
if [ "$WRT_ROOTFS_SIZE" -gt 0 ]; then
 make image PROFILE="$WRT_PROFILE" PACKAGES="$WRT_PACKAGES" FILES=/tmp/wrtkit-work/files BIN_DIR=/tmp/wrtkit-work/output ROOTFS_PARTSIZE="$WRT_ROOTFS_SIZE"
else
 make image PROFILE="$WRT_PROFILE" PACKAGES="$WRT_PACKAGES" FILES=/tmp/wrtkit-work/files BIN_DIR=/tmp/wrtkit-work/output
fi
"#;

/// 运行时软件源脚本：同时覆盖 opkg 与 apk 的发行源，并让 ImmortalWrt 的
/// 持久化镜像设置在首次启动时与所选镜像一致。
pub fn ecosystem_mirror_script(ecosystem: Ecosystem, mirror: &str) -> String {
    match ecosystem {
        Ecosystem::OpenWrt => format!(
            r#"#!/bin/sh
set -eu
mirror={}
for file in /etc/opkg/distfeeds.conf /etc/apk/repositories.d/distfeeds.list; do
 if [ -f "$file" ]; then sed -i "s|https\?://downloads.openwrt.org|$mirror|g" "$file"; fi
done
exit 0
"#,
            shell_quote(mirror)
        ),
        Ecosystem::ImmortalWrt => format!(
            r#"#!/bin/sh
set -eu
mirror={}
uci -q get 'system.@imm_init[0]' >/dev/null || uci -q add system imm_init >/dev/null
if [ -f /etc/opkg/distfeeds.conf ]; then
 uci -q set "system.@imm_init[0].opkg_mirror=$mirror"
 sed -i -e "s|https://downloads.immortalwrt.org|$mirror|g" -e "s|https://mirrors.vsean.net/openwrt|$mirror|g" -e "s|https://immortalwrt.kyarucloud.moe|$mirror|g" /etc/opkg/distfeeds.conf
fi
if [ -f /etc/apk/repositories.d/distfeeds.list ]; then
 if [ ! -f /etc/opkg/distfeeds.conf ]; then uci -q delete "system.@imm_init[0].opkg_mirror" || true; fi
 uci -q set "system.@imm_init[0].apk_mirror=$mirror"
 sed -i -e "s|https://downloads.immortalwrt.org|$mirror|g" -e "s|https://mirrors.vsean.net/openwrt|$mirror|g" -e "s|https://immortalwrt.kyarucloud.moe|$mirror|g" /etc/apk/repositories.d/distfeeds.list
fi
uci -q commit system
exit 0
"#,
            shell_quote(mirror)
        ),
    }
}

/// 校验快捷配置：所有值会被写进 shell 脚本，先拒绝换行与空字符。
pub fn validate_quick(b: &Build) -> AppResult<()> {
    for (label, value) in [
        ("Wi-Fi 名称", &b.wifi_ssid),
        ("Wi-Fi 密码", &b.wifi_password),
        ("root 密码", &b.root_password),
        ("PPPoE 账号", &b.ppp_username),
        ("PPPoE 密码", &b.ppp_password),
    ] {
        if value.contains('\n') || value.contains('\r') || value.contains('\0') {
            return Err(AppError::Invalid(format!("{label}不能包含换行或空字符")));
        }
    }
    if b.wifi_ssid.len() > 32 {
        return Err(AppError::Invalid("Wi-Fi 名称不能超过 32 字节".into()));
    }
    if b.wifi_ssid.is_empty() != b.wifi_password.is_empty() {
        return Err(AppError::Invalid("请同时填写 Wi-Fi 名称和密码".into()));
    }
    if !b.wifi_password.is_empty() && !(8..=63).contains(&b.wifi_password.len()) {
        return Err(AppError::Invalid("Wi-Fi 密码必须为 8 到 63 字节".into()));
    }
    if b.ppp_username.is_empty() != b.ppp_password.is_empty() {
        return Err(AppError::Invalid("请同时填写 PPPoE 账号和密码".into()));
    }
    if b.root_password.len() > 128 || b.ppp_username.len() > 256 || b.ppp_password.len() > 256 {
        return Err(AppError::Invalid("密码或账号过长".into()));
    }
    if b.rootfs_size != 0 && !(64..=32768).contains(&b.rootfs_size) {
        return Err(AppError::Invalid(
            "根分区大小需在 64 到 32768 MiB 之间".into(),
        ));
    }
    for removed in &b.remove {
        if removed == &b.theme && !b.theme.is_empty() {
            return Err(AppError::Invalid("不能同时选择和移除同一个主题".into()));
        }
        if removed == "ppp-mod-pppoe" && !b.ppp_username.is_empty() {
            return Err(AppError::Invalid(
                "PPPoE 配置需要 ppp-mod-pppoe 软件包".into(),
            ));
        }
    }
    if !b.theme.is_empty()
        && (!b.theme.starts_with("luci-theme-") || !valid_part(&b.theme) || b.theme.len() > 128)
    {
        return Err(AppError::Invalid("不支持的主题".into()));
    }
    Ok(())
}

/// 快捷配置脚本（uci-defaults/10-wrtkit）。`version` 决定管理地址使用
/// CIDR（25.12 起）还是 ipaddr + netmask。
pub fn quick_script(b: &Build, version: &str) -> AppResult<String> {
    validate_quick(b)?;
    let mut s = String::from("#!/bin/sh\nset -e\n");
    if !b.hostname.is_empty() {
        s.push_str(&format!(
            "uci set system.@system[0].hostname={}\n",
            shell_quote(&b.hostname)
        ));
    }
    if !b.address.is_empty() {
        let (ip, mask) = parse_cidr(&b.address)
            .ok_or_else(|| AppError::Invalid("管理地址需使用 IPv4/CIDR 格式".into()))?;
        if version_uses_cidr(version) {
            s.push_str(&format!(
                "uci set network.lan.ipaddr={}\nuci -q delete network.lan.netmask || true\n",
                shell_quote(&b.address)
            ));
        } else {
            s.push_str(&format!(
                "uci set network.lan.ipaddr={}\nuci set network.lan.netmask={}\n",
                shell_quote(&ip),
                shell_quote(&mask)
            ));
        }
    }
    if !b.timezone.is_empty() {
        let tz = zone_value(&b.timezone).ok_or_else(|| AppError::Invalid("不支持此时区".into()))?;
        s.push_str(&format!(
            "uci set system.@system[0].zonename={}\nuci set system.@system[0].timezone={}\n",
            shell_quote(&b.timezone),
            shell_quote(tz)
        ));
    }
    if !b.root_password.is_empty() {
        let hash = pwhash::sha512_crypt::hash(&b.root_password)
            .map_err(|e| AppError::Message(format!("无法生成密码哈希: {e}")))?;
        s.push_str(&format!(
            "sed -i {} /etc/shadow\n",
            shell_quote(&format!("s|^root:[^:]*:|root:{hash}:|"))
        ));
    }
    if !b.ppp_username.is_empty() {
        s.push_str(&format!(
            "if [ \"$(uci -q get network.wan)\" = interface ]; then\n uci set network.wan.proto='pppoe'\n uci set network.wan.username={}\n uci set network.wan.password={}\nelse echo '未检测到 WAN 接口，跳过 PPPoE' >&2; fi\n",
            shell_quote(&b.ppp_username),
            shell_quote(&b.ppp_password)
        ));
    }
    if !b.wifi_ssid.is_empty() {
        s.push_str(&format!(
            r#"if [ -f /etc/config/wireless ]; then
 . /lib/functions.sh
 configure_ap() {{
  local section="$1" mode device network
  config_get mode "$section" mode
  [ "$mode" = ap ] || return 0
  config_get network "$section" network
  case " $network " in *" lan "*) ;; *) return 0 ;; esac
  config_get device "$section" device
  [ -n "$device" ] || return 0
  uci set "wireless.$device.disabled=0"
  uci set "wireless.$section.disabled=0"
  uci set "wireless.$section.encryption=psk2"
  uci set "wireless.$section.ssid="{}
  uci set "wireless.$section.key="{}
 }}
 config_load wireless
 config_foreach configure_ap wifi-iface
else echo '未检测到无线配置，跳过 Wi-Fi' >&2; fi
"#,
            shell_quote(&b.wifi_ssid),
            shell_quote(&b.wifi_password)
        ));
    }
    s.push_str("uci commit\nexit 0\n");
    Ok(s)
}

/// 主题脚本：主题自己注册 mediaurlbase，这里在最后覆盖为所选主题。
pub fn theme_script(theme: &str) -> String {
    let path = match theme {
        "luci-theme-argon" => "/luci-static/argon",
        "luci-theme-bootstrap" => "/luci-static/bootstrap",
        "luci-theme-material" => "/luci-static/material",
        "luci-theme-openwrt" => "/luci-static/openwrt.org",
        "luci-theme-openwrt-2020" => "/luci-static/openwrt2020",
        _ => return String::new(),
    };
    format!(
        r#"#!/bin/sh
set -e
dir={}
if [ -d "/www$dir" ] && uci -q get luci.main >/dev/null; then
 uci set "luci.main.mediaurlbase=$dir"
 uci commit luci
else echo '未找到主题目录，保留当前主题' >&2; fi
exit 0
"#,
        shell_quote(path)
    )
}

/// 解析 IPv4/CIDR，返回 (地址, 点分掩码)。
pub fn parse_cidr(value: &str) -> Option<(String, String)> {
    let (ip, prefix) = value.split_once('/')?;
    let octets: Vec<&str> = ip.split('.').collect();
    if octets.len() != 4 {
        return None;
    }
    for octet in &octets {
        octet.parse::<u16>().ok().filter(|n| *n <= 255)?;
    }
    let prefix: u32 = prefix.parse().ok().filter(|p| (1..=32).contains(p))?;
    let bits: u32 = if prefix == 32 {
        u32::MAX
    } else {
        u32::MAX << (32 - prefix)
    };
    let mask = format!(
        "{}.{}.{}.{}",
        ((bits >> 24) & 0xff) as u8,
        ((bits >> 16) & 0xff) as u8,
        ((bits >> 8) & 0xff) as u8,
        (bits & 0xff) as u8
    );
    Some((ip.to_string(), mask))
}

/// 25.12 起 netifd 使用 CIDR，此前的版本需要显式 netmask。
pub fn version_uses_cidr(version: &str) -> bool {
    let major: u32 = version
        .split('.')
        .next()
        .and_then(|v| v.parse().ok())
        .unwrap_or(0);
    // 分支快照形如 `25.12-SNAPSHOT`，月份段要取连字符前的数字。
    let month: u32 = version
        .split('.')
        .nth(1)
        .map(|v| v.split('-').next().unwrap_or(v))
        .and_then(|v| v.parse().ok())
        .unwrap_or(0);
    major > 25 || (major == 25 && month >= 12)
}

/// 交给容器 / FILES 目录的完整文件层。
pub fn files_for(b: &Build) -> AppResult<Vec<(String, String)>> {
    let ecosystem = b.ecosystem.unwrap_or_default();
    let mut files = vec![
        ("wrtkit/run.sh".to_string(), builder_script(ecosystem)),
        (
            "wrtkit/files/etc/uci-defaults/09-wrtkit-mirror".to_string(),
            ecosystem_mirror_script(ecosystem, &b.mirror),
        ),
        (
            "wrtkit/files/etc/uci-defaults/10-wrtkit".to_string(),
            quick_script(b, &b.version)?,
        ),
    ];
    let theme = theme_script(&b.theme);
    if !theme.is_empty() {
        files.push((
            "wrtkit/files/etc/uci-defaults/95-wrtkit-theme".to_string(),
            theme,
        ));
    }
    if !b.script.trim().is_empty() {
        files.push((
            "wrtkit/files/etc/uci-defaults/99-custom.sh".to_string(),
            b.script.replace("\r\n", "\n"),
        ));
    }
    Ok(files)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::Build;

    fn build() -> Build {
        Build {
            version: "24.10.5".into(),
            target: "mediatek/filogic".into(),
            profile: "glinet_ax3000".into(),
            mirror: "https://mirror.nju.edu.cn/immortalwrt".into(),
            hostname: "WRT-UI".into(),
            address: "192.168.2.1/24".into(),
            timezone: "Asia/Shanghai".into(),
            ..Build::default()
        }
    }

    #[test]
    fn cidr_parsing_rejects_garbage() {
        assert!(parse_cidr("192.168.1.1/24").is_some());
        assert!(parse_cidr("192.168.1.1").is_none());
        assert!(parse_cidr("192.168.1.300/24").is_none());
        assert!(parse_cidr("192.168.1.1/33").is_none());
        let (_, mask) = parse_cidr("10.0.0.1/8").unwrap();
        assert_eq!(mask, "255.0.0.0");
        let (_, mask) = parse_cidr("192.168.2.1/24").unwrap();
        assert_eq!(mask, "255.255.255.0");
        let (_, mask) = parse_cidr("192.168.2.1/32").unwrap();
        assert_eq!(mask, "255.255.255.255");
    }

    #[test]
    fn cidr_switch_happens_at_25_12() {
        assert!(!version_uses_cidr("24.10.5"));
        assert!(!version_uses_cidr("25.03.1"));
        assert!(version_uses_cidr("25.12.0"));
        assert!(version_uses_cidr("26.01.0"));
        assert!(version_uses_cidr("25.12-SNAPSHOT"));
    }

    #[test]
    fn quick_script_pppoe_requires_both_fields() {
        let mut b = build();
        b.ppp_username = "user".into();
        b.ppp_password = "".into();
        assert!(validate_quick(&b).is_err());
        b.ppp_password = "pass".into();
        assert!(validate_quick(&b).is_ok());
    }

    #[test]
    fn quick_script_writes_expected_uci_commands() {
        let mut b = build();
        b.root_password = "s3cret-pw".into();
        let script = quick_script(&b, &b.version).unwrap();
        assert!(script.contains("uci set system.@system[0].hostname='WRT-UI'"));
        assert!(script.contains("uci set network.lan.ipaddr='192.168.2.1'"));
        assert!(script.contains("uci set network.lan.netmask='255.255.255.0'"));
        assert!(script.contains("uci set system.@system[0].timezone='CST-8'"));
        assert!(
            script.contains("$6$"),
            "root 密码应写入 sha512-crypt 哈希: {script}"
        );
        assert!(!script.contains("s3cret-pw"), "脚本中不得出现明文密码");
        assert!(script.ends_with("exit 0\n"));
    }

    #[test]
    fn shell_quote_escapes_single_quotes() {
        assert_eq!(shell_quote("a'b"), "'a'\\''b'");
    }

    #[test]
    fn files_layer_contains_scripts_and_custom_hook() {
        let mut b = build();
        b.theme = "luci-theme-argon".into();
        b.script = "opkg update\r\n".into();
        let files = files_for(&b).unwrap();
        let names: Vec<&str> = files.iter().map(|(n, _)| n.as_str()).collect();
        assert!(names.contains(&"wrtkit/run.sh"));
        assert!(names.contains(&"wrtkit/files/etc/uci-defaults/09-wrtkit-mirror"));
        assert!(names.contains(&"wrtkit/files/etc/uci-defaults/10-wrtkit"));
        assert!(names.contains(&"wrtkit/files/etc/uci-defaults/95-wrtkit-theme"));
        assert!(names.contains(&"wrtkit/files/etc/uci-defaults/99-custom.sh"));
        let custom = files
            .iter()
            .find(|(n, _)| n.ends_with("99-custom.sh"))
            .unwrap();
        assert!(!custom.1.contains('\r'));
    }

    #[test]
    fn openwrt_mirror_script_only_touches_openwrt_urls() {
        let script =
            ecosystem_mirror_script(Ecosystem::OpenWrt, "https://mirror.nju.edu.cn/openwrt");
        assert!(script.contains("downloads.openwrt.org"));
        assert!(!script.contains("imm_init"));
    }
}

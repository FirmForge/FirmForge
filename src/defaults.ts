import type { MessageKey } from "./i18n";
import type { Build } from "./types";

export const initialBuild: Build = {
  version: "",
  target: "",
  profile: "",
  device: "",
  packages: [],
  remove: [],
  mirror: "",
  hostname: "FirmForge",
  address: "192.168.2.1/24",
  timezone: "Asia/Shanghai",
  script: "",
  theme: "",
  wifi_ssid: "",
  wifi_password: "",
  root_password: "",
  ppp_username: "",
  ppp_password: "",
  rootfs_size: 0,
};

/** 时区与主题只存值，显示名由当前语言决定。 */
export const TIMEZONES: { value: string; key: MessageKey }[] = [
  { value: "Asia/Shanghai", key: "tz.shanghai" },
  { value: "Asia/Hong_Kong", key: "tz.hongkong" },
  { value: "Asia/Tokyo", key: "tz.tokyo" },
  { value: "UTC", key: "tz.utc" },
];

export const THEMES: { value: string; key: MessageKey }[] = [
  { value: "", key: "theme.default" },
  { value: "luci-theme-argon", key: "theme.argon" },
  { value: "luci-theme-bootstrap", key: "theme.bootstrap" },
  { value: "luci-theme-material", key: "theme.material" },
  { value: "luci-theme-openwrt", key: "theme.openwrt" },
  { value: "luci-theme-openwrt-2020", key: "theme.openwrt2020" },
];


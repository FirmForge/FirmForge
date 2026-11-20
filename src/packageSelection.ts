export const CHINESE_BASE = "luci-i18n-base-zh-cn";

/**
 * profiles.json 不描述无线硬件。这里只认“设备默认包里明确出现无线驱动
 * 且带有 hostapd/wpad”——缺少证据不代表没有无线，UI 需据此决定是否隐藏 Wi-Fi 配置。
 */
export function hasWirelessDriver(packages: readonly string[]): boolean {
  const driver = packages.some((name) =>
    /^kmod-(?:mt7|ath(?:5k|9k|10k|11k|12k)|iwl|rt2|rtw|rtl8(?:xxxu|188|192|7)|brcm(?:fmac|mac)|b43|mwifiex|mwlwifi|wl18|zd1211)/.test(
      name,
    ),
  );
  const hostapd = packages.some((name) => /^(?:wpad|hostapd)(?:-|$)/.test(name));
  return driver && hostapd;
}

/** LuCI 插件的简体中文翻译命名约定；是否可用由索引决定。 */
export function translationCandidate(name: string): string | undefined {
  const match = /^luci-(?:app|proto|mod|theme)-(.+)$/.exec(name);
  return match ? `luci-i18n-${match[1]}-zh-cn` : undefined;
}

export function resolveChineseTranslations(
  selected: readonly string[],
  available: ReadonlySet<string>,
): { automatic: string[]; missing: string[] } {
  const automatic = new Set<string>();
  const missing = new Set<string>();
  for (const name of selected) {
    const candidate = translationCandidate(name);
    if (!candidate) continue;
    if (available.has(candidate)) automatic.add(candidate);
    else missing.add(name);
  }
  return { automatic: [...automatic].sort(), missing: [...missing].sort() };
}

/** 设备 profile 用前导减号表达“从默认包里删掉这个包”。 */
export function effectiveDefaultPackages(
  defaults: readonly string[],
  device: readonly string[],
): string[] {
  const entries = [...defaults, ...device];
  const removed = new Set(
    entries.filter((name) => name.startsWith("-")).map((name) => name.slice(1)),
  );
  return [
    ...new Set(
      entries.filter((name) => name.length > 0 && !name.startsWith("-") && !removed.has(name)),
    ),
  ].sort();
}

export const RECOMMENDED_PACKAGES = [
  "curl",
  "openssh-sftp-server",
  "luci-theme-argon",
  CHINESE_BASE,
  "luci-i18n-firewall-zh-cn",
  "luci-i18n-package-manager-zh-cn",
  "luci-i18n-homeproxy-zh-cn",
  "luci-i18n-ttyd-zh-cn",
  "luci-i18n-diskman-zh-cn",
  "luci-i18n-filemanager-zh-cn",
] as const;

/** 推荐项只有在所选镜像的索引里真实存在时才被选中。 */
export function availableRecommendations(available: ReadonlySet<string>): {
  packages: string[];
  theme: string;
  missing: string[];
} {
  const packages: string[] = [];
  const missing: string[] = [];
  let theme = "";
  for (const name of RECOMMENDED_PACKAGES) {
    if (!available.has(name)) {
      missing.push(name);
      continue;
    }
    if (name === "luci-theme-argon") {
      theme = name;
      continue;
    }
    const app = name.replace(/^luci-i18n-(.+)-zh-cn$/, "luci-app-$1");
    packages.push(available.has(app) ? app : name);
  }
  return { packages, theme, missing };
}

export function visibleInCategory(
  name: string,
  category: string,
  inferred: string,
): boolean {
  if (category === "all") return true;
  if (category === "luci") return /^luci-(?:app|proto|mod)-/.test(name);
  if (category === "proxy") return inferred === "proxy" && name.startsWith("luci-app-");
  if (category === "themes") return name.startsWith("luci-theme-");
  if (category === "kmods") return name.startsWith("kmod-");
  return true;
}

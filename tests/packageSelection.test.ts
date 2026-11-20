import { describe, expect, it } from "vitest";
import {
  availableRecommendations,
  effectiveDefaultPackages,
  hasWirelessDriver,
  resolveChineseTranslations,
  translationCandidate,
} from "../src/packageSelection";

describe("默认软件包合并", () => {
  it("应用设备资料里的减号移除语义", () => {
    const merged = effectiveDefaultPackages(
      ["base-files", "luci", "wpad-basic-mbedtls"],
      ["kmod-mt7915", "-wpad-basic-mbedtls"],
    );
    expect(merged).toEqual(["base-files", "kmod-mt7915", "luci"]);
  });

  it("去重并忽略空项", () => {
    expect(effectiveDefaultPackages(["a", "", "a"], [])).toEqual(["a"]);
  });
});

describe("简体中文翻译匹配", () => {
  it("只按命名约定生成候选", () => {
    expect(translationCandidate("luci-app-homeproxy")).toBe("luci-i18n-homeproxy-zh-cn");
    expect(translationCandidate("luci-theme-argon")).toBe("luci-i18n-argon-zh-cn");
    expect(translationCandidate("luci-i18n-base-zh-cn")).toBeUndefined();
    expect(translationCandidate("curl")).toBeUndefined();
  });

  it("只在索引里存在时自动附加", () => {
    const available = new Set(["luci-i18n-homeproxy-zh-cn"]);
    const result = resolveChineseTranslations(
      ["luci-app-homeproxy", "luci-app-ttyd"],
      available,
    );
    expect(result.automatic).toEqual(["luci-i18n-homeproxy-zh-cn"]);
    expect(result.missing).toEqual(["luci-app-ttyd"]);
  });
});

describe("推荐软件包", () => {
  it("缺失项不会进入选择结果", () => {
    const available = new Set(["curl", "luci-i18n-base-zh-cn", "luci-theme-argon"]);
    const result = availableRecommendations(available);
    expect(result.packages).toEqual(["curl", "luci-i18n-base-zh-cn"]);
    expect(result.theme).toBe("luci-theme-argon");
    expect(result.missing.length).toBeGreaterThan(0);
  });
});

describe("无线驱动识别", () => {
  it("要求驱动与 hostapd 同时出现", () => {
    expect(hasWirelessDriver(["kmod-mt7915", "wpad-basic-mbedtls"])).toBe(true);
    expect(hasWirelessDriver(["kmod-mt7915"])).toBe(false);
    expect(hasWirelessDriver(["wpad-basic-mbedtls"])).toBe(false);
    expect(hasWirelessDriver([])).toBe(false);
  });
});

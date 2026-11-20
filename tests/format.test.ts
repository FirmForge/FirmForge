import { describe, expect, it } from "vitest";
import { formatBytes, formatTime, shortId, statusLabel, statusTone } from "../src/format";
import { formatNotes } from "../src/update";

describe("容量格式化", () => {
  it("按二进制单位递进", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1023)).toBe("1023 B");
    expect(formatBytes(1024)).toBe("1.00 KiB");
    expect(formatBytes(1024 * 1024)).toBe("1.00 MiB");
    expect(formatBytes(1024 * 1024 * 1024)).toBe("1.00 GiB");
    expect(formatBytes(15 * 1024 * 1024)).toBe("15.0 MiB");
  });

  it("非法输入不抛出", () => {
    expect(formatBytes(Number.NaN)).toBe("—");
    expect(formatBytes(-1)).toBe("—");
  });
});

describe("时间与状态", () => {
    it("解析 ISO 时间", () => {
    const text = formatTime("2026-11-17T12:00:00Z");
    expect(text).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });

  it("未知时间原样返回", () => {
    expect(formatTime("not-a-date")).toBe("not-a-date");
  });

  it("状态标签与语义色", () => {
    expect(statusLabel("success")).toBe("构建成功");
    expect(statusLabel("weird")).toBe("weird");
    expect(statusTone("failed")).toBe("error");
    expect(statusTone("running")).toBe("info");
    expect(shortId("abcdef1234567890")).toBe("abcdef12");
  });
});

describe("更新说明去标记", () => {
  it("去掉标题与粗体，列表转项目符号", () => {
    const text = formatNotes("## 更新内容\n- **暗色**主题\n- `ipk` 修复\n\n\n末尾");
    expect(text).toBe("更新内容\n• 暗色主题\n• ipk 修复\n\n末尾");
  });

  it("空内容不抛出", () => {
    expect(formatNotes("")).toBe("");
  });
});

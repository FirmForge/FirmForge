/** 版本比较与发布说明处理：纯函数，方便单测，不依赖 Tauri 运行时。 */

function parts(version: string): number[] {
  return version
    .trim()
    .replace(/^v/i, "")
    .split(/[.+-]/)
    .slice(0, 3)
    .map((p) => Number.parseInt(p, 10) || 0);
}

/** 只比数字段：远端比本地旧时不要提示更新。 */
export function isNewer(remote: string, local: string): boolean {
  const a = parts(remote);
  const b = parts(local);
  for (let i = 0; i < 3; i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

/** 发布说明是 Markdown；只做轻量去标记，不渲染 HTML。 */
export function formatNotes(text: string): string {
  return text
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .split(/\n{3,}/)
    .join("\n\n")
    .trim();
}

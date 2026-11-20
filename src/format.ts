import type { MessageKey } from "./i18n";

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KiB", "MiB", "GiB", "TiB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unit]}`;
}

export function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

export const STATUS_LABEL: Record<string, string> = {
  queued: "排队中",
  running: "构建中",
  success: "构建成功",
  failed: "构建失败",
  cancelled: "已取消",
  interrupted: "已中断",
  cleaned: "已清理",
};

export function statusLabel(status: string): string {
  return STATUS_LABEL[status] ?? status;
}

export function statusTone(status: string): "success" | "error" | "warning" | "info" | "default" {
  switch (status) {
    case "success":
      return "success";
    case "failed":
      return "error";
    case "cancelled":
    case "interrupted":
      return "warning";
    case "running":
    case "queued":
      return "info";
    default:
      return "default";
  }
}

/** 设计系统的状态色：成功酸柠绿、失败荧光粉、取消/中断橘橙、进行中电青。 */
export function statusAccent(status: string): "lime" | "pink" | "tangerine" | "cyan" | "paper" {
  switch (status) {
    case "success":
      return "lime";
    case "failed":
      return "pink";
    case "cancelled":
    case "interrupted":
      return "tangerine";
    case "running":
    case "queued":
      return "cyan";
    default:
      return "paper";
  }
}


/** 状态 → 文案键；未知状态由调用方回退显示原始值。 */
export function statusKey(status: string): MessageKey | undefined {
  switch (status) {
    case "queued":
      return "status.queued";
    case "running":
      return "status.running";
    case "success":
      return "status.success";
    case "failed":
      return "status.failed";
    case "cancelled":
      return "status.cancelled";
    case "interrupted":
      return "status.interrupted";
    case "cleaned":
      return "status.cleaned";
    default:
      return undefined;
  }
}

export function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}

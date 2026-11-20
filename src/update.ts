import { useCallback, useEffect, useRef, useState } from "react";
import { api, isDesktop } from "./api";
import type { UpdateInfo } from "./types";

const CACHE_KEY = "wrt-ui.update";
/** 参考 clash-verge-rev：同一小时内不重复请求，跨天再查一次，避免打满 GitHub 限额。 */
const STALE_MS = 24 * 60 * 60 * 1000;

type Cache = { at: number; info: UpdateInfo };

function readCache(): Cache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Cache;
    if (!parsed || typeof parsed.at !== "number" || !parsed.info) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(info: UpdateInfo): number {
  const at = Date.now();
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at, info }));
  } catch {
    // 缓存失败不影响本次结果。
  }
  return at;
}

/** 发布说明是 Markdown；这里只做轻量去标记，避免引入渲染依赖与 XSS 面。 */
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

export type UpdateState = {
  info: UpdateInfo | null;
  current: string;
  checkedAt: number | null;
  loading: boolean;
  error: string;
  check: () => Promise<void>;
};

/**
 * 更新检测：启动时静默查一次（缓存 24h），设置页可手动强制检查。
 * 只报告版本与说明，不下载、不安装。
 */
export function useUpdateCheck(auto = true): UpdateState {
  const initial = useRef<Cache | null>(readCache());
  const [info, setInfo] = useState<UpdateInfo | null>(initial.current?.info ?? null);
  const [current, setCurrent] = useState(initial.current?.info.current ?? "");
  const [checkedAt, setCheckedAt] = useState<number | null>(initial.current?.at ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const running = useRef(false);

  const check = useCallback(async () => {
    if (!isDesktop() || running.current) return;
    running.current = true;
    setLoading(true);
    setError("");
    try {
      const result = await api.checkUpdate();
      setInfo(result);
      setCurrent(result.current);
      setCheckedAt(writeCache(result));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      running.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isDesktop()) return;
    void api
      .appVersion()
      .then(setCurrent)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!auto) return;
    const cached = initial.current;
    if (cached && Date.now() - cached.at < STALE_MS) return;
    void check();
  }, [auto, check]);

  return { info, current, checkedAt, loading, error, check };
}

import { useCallback, useEffect, useRef, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { isDesktop } from "./api";
export { formatNotes, isNewer } from "./version";
import { isNewer } from "./version";
import type { UpdateInfo } from "./types";

const CACHE_KEY = "wrt-ui.update";
/** 与 clash-verge-rev 一致：1 小时内不重复请求，跨天再查一次。 */
const STALE_MS = 60 * 60 * 1000;
const REFETCH_MS = 24 * 60 * 60 * 1000;

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

export type UpdateState = {
  info: UpdateInfo | null;
  current: string;
  checkedAt: number | null;
  loading: boolean;
  installing: boolean;
  progress: number | null;
  error: string;
  check: () => Promise<void>;
  install: () => Promise<void>;
};

/**
 * 更新检测走 tauri-plugin-updater：签名校验 + 静默安装 + 重启。
 * 端点来自 tauri.conf 里配置的 update.json / update-proxy.json。
 */
export function useUpdateCheck(auto = true): UpdateState {
  const initial = useRef<Cache | null>(readCache());
  const pending = useRef<Update | null>(null);
  const [info, setInfo] = useState<UpdateInfo | null>(initial.current?.info ?? null);
  const [current, setCurrent] = useState("");
  const [checkedAt, setCheckedAt] = useState<number | null>(initial.current?.at ?? null);
  const [loading, setLoading] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  const running = useRef(false);

  const releaseUrl = (version: string) =>
    `https://github.com/MinimaxFlora/WRT-UI/releases/tag/v${String(version).replace(/^v/i, "")}`;

  const checkNow = useCallback(async () => {
    if (!isDesktop() || running.current) return;
    running.current = true;
    setLoading(true);
    setError("");
    try {
      const local = await getVersion();
      setCurrent(local);
      const found = await check();
      if (pending.current) {
        await pending.current.close().catch(() => {});
        pending.current = null;
      }
      if (!found || !isNewer(found.version, local)) {
        await found?.close().catch(() => {});
        const result: UpdateInfo = {
          current: local,
          latest: local,
          available: false,
          notes: "",
          url: releaseUrl(local),
          published_at: "",
        };
        setInfo(result);
        setCheckedAt(writeCache(result));
        return;
      }
      pending.current = found;
      const result: UpdateInfo = {
        current: local,
        latest: String(found.version).replace(/^v/i, ""),
        available: true,
        notes: found.body ?? "",
        url: releaseUrl(found.version),
        published_at: found.date ?? "",
      };
      setInfo(result);
      setCheckedAt(writeCache(result));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      running.current = false;
      setLoading(false);
    }
  }, []);

  const install = useCallback(async () => {
    const found = pending.current;
    if (!found || installing) return;
    setInstalling(true);
    setError("");
    setProgress(0);
    try {
      let total = 0;
      let done = 0;
      await found.downloadAndInstall((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? 0;
        } else if (event.event === "Progress") {
          done += event.data.chunkLength;
          if (total > 0) setProgress(Math.min(99, Math.round((done / total) * 100)));
        } else if (event.event === "Finished") {
          setProgress(100);
        }
      });
      await relaunch();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setInstalling(false);
      setProgress(null);
    }
  }, [installing]);

  // 本地版本单独取：缓存里可能存着升级前的旧版本号
  useEffect(() => {
    if (!isDesktop()) return;
    void getVersion()
      .then(setCurrent)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!auto) return;
    const cached = initial.current;
    if (cached && Date.now() - cached.at < STALE_MS) {
      // 缓存没过期，但应用刚升级过（版本号变了）时必须立刻重查
      void getVersion()
        .then((local) => {
          if (cached.info.current !== local) void checkNow();
        })
        .catch(() => {});
      return;
    }
    void checkNow();
  }, [auto, checkNow]);

  useEffect(() => {
    if (!auto) return;
    const timer = window.setInterval(() => void checkNow(), REFETCH_MS);
    return () => window.clearInterval(timer);
  }, [auto, checkNow]);

  useEffect(() => {
    return () => {
      void pending.current?.close().catch(() => {});
    };
  }, []);

  return { info, current, checkedAt, loading, installing, progress, error, check: checkNow, install };
}

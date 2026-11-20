import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  disable as disableAutostart,
  enable as enableAutostart,
  isEnabled as isAutostartEnabled,
} from "@tauri-apps/plugin-autostart";
import type {
  Artifact,
  Build,
  CleanupInfo,
  Device,
  Job,
  JobEvent,
  LogEvent,
  PackagesResult,
  ProfileInfo,
  Settings,
  UpdateInfo,
  Versions,
} from "./types";

/** 桌面版才具备真实后端；浏览器里只允许浏览 UI，不允许伪造业务结果。 */
export function isDesktop(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function decodeError(raw: unknown): Error {
  if (typeof raw === "string") {
    const sep = raw.indexOf("\u0001");
    return new Error(sep >= 0 ? raw.slice(sep + 1) : raw);
  }
  if (raw instanceof Error) return raw;
  return new Error(String(raw));
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isDesktop()) {
    throw new Error("该操作需要 WRT-UI 桌面版运行时");
  }
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw decodeError(error);
  }
}

export const api = {
  environment: () =>
    call<{ name: string; available: boolean; message: string }>("environment"),

  versions: (mirror: string) => call<Versions>("list_versions", { mirror }),

  devices: (mirror: string, version: string) =>
    call<Device[]>("list_devices", { mirror, version }),

  profile: (mirror: string, version: string, target: string, profile: string) =>
    call<ProfileInfo>("get_profile", { mirror, version, target, profile }),

  packages: (mirror: string, version: string, target: string, profile: string) =>
    call<PackagesResult>("list_packages", { mirror, version, target, profile }),

  settings: () => call<Settings>("get_settings"),
  saveMirrors: (mirrors: { name: string; url: string }[]) =>
    call<Settings>("save_mirrors", { mirrors }),
  saveRegistry: (registry: string) => call<Settings>("save_registry", { registry }),
  saveProxy: (proxy: string) => call<Settings>("save_proxy", { proxy }),
  savePrefs: (prefs: { theme?: string; language?: string }) =>
    call<Settings>("save_prefs", prefs),
  switchEcosystem: (ecosystem: Settings["ecosystem"]) =>
    call<Settings>("switch_ecosystem", { ecosystem }),

  createJob: (build: Build) => call<Job>("create_job", { build }),
  jobs: (limit?: number) =>
    call<Job[]>("list_jobs").then((jobs) => (limit ? jobs.slice(0, limit) : jobs)),
  job: (id: string) => call<Job>("get_job", { id }),
  cancelJob: (id: string) => call<void>("cancel_job", { id }),
  readLog: (id: string, offset: number) =>
    call<{ text: string; next: number }>("read_log", { id, offset }),
  artifacts: (id: string) => call<Artifact[]>("list_artifacts", { id }),
  saveArtifact: (id: string, name: string) =>
    call<string>("save_artifact", { id, name }),
  cleanupPreview: (id: string) => call<CleanupInfo>("cleanup_preview", { id }),
  cleanup: (id: string) => call<number>("cleanup_job", { id }),
  openDataDir: () => call<string>("open_data_dir"),

  appVersion: () => call<string>("app_version"),
  checkUpdate: () => call<UpdateInfo>("check_update"),
  openReleasePage: (url: string) => call<void>("open_release_page", { url }),
};

export const events = {
  onJobUpdate: (handler: (event: JobEvent) => void): Promise<UnlistenFn> =>
    listen<JobEvent>("job-update", (e) => handler(e.payload)),
  onLog: (handler: (event: LogEvent) => void): Promise<UnlistenFn> =>
    listen<LogEvent>("job-log", (e) => handler(e.payload)),
};

/** 开机自启走 Tauri 插件（注册表 Run 项），不是自建脚本。 */
export const autostart = {
  isEnabled: async (): Promise<boolean> => {
    if (!isDesktop()) return false;
    try {
      return await isAutostartEnabled();
    } catch {
      return false;
    }
  },
  set: async (on: boolean): Promise<void> => {
    if (!isDesktop()) throw new Error("该操作需要 WRT-UI 桌面版运行时");
    if (on) await enableAutostart();
    else await disableAutostart();
  },
};

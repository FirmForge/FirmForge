export type Ecosystem = "immortalwrt" | "openwrt";

export type Device = { id: string; target: string; title: string };

export type ProfileInfo = {
  default_packages: string[];
  device_packages: string[];
  images: unknown[];
  arch: string;
  revision: string;
  rootfs_supported: boolean;
};

export type Build = {
  ecosystem?: Ecosystem;
  version: string;
  target: string;
  profile: string;
  device: string;
  packages: string[];
  remove: string[];
  mirror: string;
  registry?: string;
  hostname: string;
  address: string;
  timezone: string;
  script: string;
  theme: string;
  wifi_ssid: string;
  wifi_password: string;
  root_password: string;
  ppp_username: string;
  ppp_password: string;
  rootfs_size: number;
};

export type JobStatus =
  | "queued"
  | "running"
  | "success"
  | "failed"
  | "cancelled"
  | "interrupted"
  | "cleaned";

export type Job = {
  id: string;
  status: JobStatus;
  stage: string;
  error: string;
  created: string;
  request: Build;
  image: string;
};

export type Artifact = { name: string; size: number };

export type CleanupInfo = { id: string; path: string; bytes: number; image: string };

export type PackageItem = {
  name: string;
  version: string;
  feed: string;
  category: string;
};

export type PackagesResult = { arch: string; items: PackageItem[]; warnings: string[] };

export type MirrorSource = { name: string; url: string };

export type Settings = {
  ecosystem: Ecosystem;
  mirrors: MirrorSource[];
  registry: string;
  proxy: string;
  theme: string;
  language: string;
  data_dir: string;
};

export type Environment = { name: string; available: boolean; message: string };

export type Versions = { stable: string; versions: string[] };

export type JobEvent = { id: string; status: JobStatus; stage: string; error: string };

export type LogEvent = { id: string; text: string };

export type UpdateInfo = {
  current: string;
  latest: string;
  available: boolean;
  notes: string;
  url: string;
  published_at: string;
};

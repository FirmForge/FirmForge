#!/usr/bin/env node
/**
 * 生成 Tauri updater 的清单文件（参考 clash-verge-rev 的 update.json / update-proxy.json）：
 *   - update.json       直连 GitHub Releases 的下载地址
 *   - update-proxy.json  同一个清单，下载地址换成加速镜像，供国内网络使用
 *
 * 用法：node scripts/make-update-json.mjs <version> <owner/repo> [notesPath]
 * 例：  node scripts/make-update-json.mjs 1.0.1 MinimaxFlora/WRT-UI RELEASE_NOTES.md
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [, , rawVersion, repo, notesPath = "RELEASE_NOTES.md"] = process.argv;
if (!rawVersion || !repo) {
  console.error("用法: node scripts/make-update-json.mjs <version> <owner/repo> [notesPath]");
  process.exit(1);
}
const version = rawVersion.replace(/^v/i, "");
const nsisDir = process.env.BUNDLE_DIR ?? "src-tauri/target/release/bundle/nsis";

if (!existsSync(nsisDir)) {
  console.error(`找不到安装包目录 ${nsisDir}，请先执行 npx tauri build --bundles nsis`);
  process.exit(1);
}

const files = readdirSync(nsisDir);
const installers = files.filter((name) => name.endsWith(".exe") && name.includes("setup"));
// 同一个目录可能有多个历史版本，优先挑当前版本且带签名的那个
const installer =
  installers.find((name) => name.includes(`_${version}_`) && files.includes(`${name}.sig`)) ??
  installers.find((name) => files.includes(`${name}.sig`));
if (!installer) {
  console.error("找不到 NSIS 安装包（*-setup.exe）");
  process.exit(1);
}
const sigFile = `${installer}.sig`;
if (!files.includes(sigFile)) {
  console.error(`找不到签名文件 ${sigFile}：请确认已配置 TAURI_SIGNING_PRIVATE_KEY 与 createUpdaterArtifacts`);
  process.exit(1);
}

const signature = readFileSync(join(nsisDir, sigFile), "utf8").trim();
const directUrl = `https://github.com/${repo}/releases/download/v${version}/${encodeURIComponent(installer)}`;
const notes = existsSync(notesPath) ? readFileSync(notesPath, "utf8").trim() : "";

const manifest = (url) => ({
  version,
  notes,
  pub_date: new Date().toISOString(),
  platforms: {
    "windows-x86_64-nsis": { signature, url },
  },
});

writeFileSync("update.json", `${JSON.stringify(manifest(directUrl), null, 2)}\n`, "utf8");
writeFileSync(
  "update-proxy.json",
  `${JSON.stringify(manifest(`https://ghproxy.net/${directUrl}`), null, 2)}\n`,
  "utf8",
);

console.log(`update.json -> ${directUrl}`);
console.log(`update-proxy.json -> ghproxy 镜像`);
console.log(`signature: ${signature.slice(0, 24)}…`);

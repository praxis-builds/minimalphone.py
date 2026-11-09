// Copies the static app into dist/ for Cloudflare Pages, leaving out tests,
// docs and node_modules. Functions in functions/ are bundled by wrangler.
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";

const FILES = [
  "index.html", "style.css", "logic.js", "sync-core.js", "sync-client.js", "script.js",
  "service-worker.js", "manifest.webmanifest", "icon.svg", "icon-192.png", "icon-512.png", "apple-touch-icon.png",
];
rmSync("dist", { recursive: true, force: true });
mkdirSync("dist");
for (const file of FILES) cpSync(file, `dist/${file}`);
writeFileSync("dist/_headers", [
  "/*",
  "  X-Content-Type-Options: nosniff",
  "  Referrer-Policy: no-referrer",
  "  Permissions-Policy: camera=(), microphone=(), geolocation=()",
  "/service-worker.js",
  "  Cache-Control: no-cache",
  "",
].join("\n"));
console.log(`Built dist/ with ${FILES.length} files.`);

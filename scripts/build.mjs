// Copies the static app into dist/ for Cloudflare Pages, leaving out tests,
// docs and node_modules. Functions in functions/ are bundled by wrangler.
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";

const FILES = [
  "index.html", "style.css", "logic.js", "sync-core.js", "sync-client.js", "script.js",
  "service-worker.js", "manifest.webmanifest", "icon.svg", "icon-192.png", "icon-512.png", "apple-touch-icon.png",
  "fonts/fraunces-latin.woff2", "fonts/figtree-latin.woff2", "fonts/OFL-Fraunces.txt", "fonts/OFL-Figtree.txt",
];
rmSync("dist", { recursive: true, force: true });
mkdirSync("dist/fonts", { recursive: true });
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

// Creates the VAPID key pair for the evening reminder and stores it as
// Cloudflare secrets, for the Pages project (`minimal`) and the reminder Worker
// (`minimal-reminder`). The private key is generated here and piped straight
// into wrangler: it is never printed, written to a file or committed.
//
// Usage (from the repo, with CLOUDFLARE_ACCOUNT_ID set if your login sees
// several accounts):
//   node scripts/setup-push-keys.mjs [--subject https://your-address]
// Run it again to replace the keys; phones then need to turn notifications on again.
import { spawnSync } from "node:child_process";
import { webcrypto } from "node:crypto";

const args = process.argv.slice(2);
const subjectIndex = args.indexOf("--subject");
const subject = subjectIndex >= 0 ? args[subjectIndex + 1] : "https://minimal-apz.pages.dev";
if (!/^(https:\/\/|mailto:)/.test(subject || "")) {
  console.error("The subject must start with https:// or mailto:");
  process.exit(1);
}

const b64url = (bytes) => Buffer.from(bytes).toString("base64url");
const pair = await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const publicKey = b64url(new Uint8Array(await webcrypto.subtle.exportKey("raw", pair.publicKey)));
const privateKey = (await webcrypto.subtle.exportKey("jwk", pair.privateKey)).d;

const secrets = { VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: privateKey, VAPID_SUBJECT: subject };
// Each target: the wrangler arguments before and after the secret's name.
const targets = [
  ["Pages project minimal", ["pages", "secret", "put"], ["--project-name", "minimal"]],
  ["Worker minimal-reminder", ["secret", "put"], ["--config", "reminder/wrangler.toml"]],
];
for (const [label, before, after] of targets) {
  for (const [name, value] of Object.entries(secrets)) {
    const result = spawnSync("npx", ["wrangler", ...before, name, ...after], { input: value, stdio: ["pipe", "ignore", "inherit"] });
    if (result.status !== 0) {
      console.error(`Could not set ${name} on ${label}. Nothing was printed; fix the error above and run this again.`);
      process.exit(1);
    }
    console.log(`Set ${name} on ${label}.`);
  }
}
console.log("Done. Redeploy the Pages project so it picks up the new secrets: npm run deploy");

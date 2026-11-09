# Sync with Cloudflare

Minimal can keep its main copy in Cloudflare: the app on Cloudflare Pages, the sync API as a Pages Function, and the data in a D1 database. Each phone keeps a full local copy in IndexedDB, so the app works offline and syncs when it is back online.

This guide is for the person who deploys Minimal. It assumes Node.js 22 or newer and a Cloudflare account.

## How sync behaves

- **Every change is saved on the phone first.** It is queued and uploaded within a few seconds when the phone is online and signed in. Offline changes wait in the queue.
- **The latest edit wins, per item.** One priority, one Small Move on one day, a day's conclusion, or one setting is the unit. If two phones change different items on the same day, both changes are kept.
- **Conflicts are listed.** If two phones change the *same* item while apart, the later edit is kept and the pair appears under **Settings → Sync → Sync conflicts** until you dismiss it.
- **Phone clocks are corrected.** Each sync measures the gap between the phone's clock and the server's, so a phone with a wrong clock does not win every edit.
- **Retries are harmless.** Each queued change has an id derived from its content; the server applies each id once.

## One-time setup

Run these from the repository folder.

1. **Install the tools**

   ```bash
   npm ci
   ```

2. **Sign in to Cloudflare** (in your own terminal; it opens a browser):

   ```bash
   npx wrangler login
   ```

3. **Create the database** and copy the `database_id` it prints into `wrangler.toml` (replace the zeros):

   ```bash
   npx wrangler d1 create minimal
   ```

4. **Create the tables:**

   ```bash
   npm run db:migrate:remote
   ```

5. **Create the Pages project** (first deploy only):

   ```bash
   npx wrangler pages project create minimal --production-branch main
   ```

6. **Set the passcode** as a secret. Choose a long passphrase. Type it only into this prompt; never put it in a file, a commit or a chat:

   ```bash
   npx wrangler pages secret put APP_PASSCODE
   ```

7. **Deploy:**

   ```bash
   npm run deploy
   ```

   This builds `dist/` and runs `wrangler pages deploy`. Wrangler prints the address, for example `https://minimal.pages.dev`.

Check it: `https://<your address>/api/session` should answer `{"error":"sign in required"}` with status 401.

## Deploying an update

```bash
npm test
npm run deploy
```

If a release adds a file under `migrations/`, run `npm run db:migrate:remote` before `npm run deploy`.

## Moving your data from the GitHub Pages version

Browsers keep each website's storage separate, and on iPhone the installed Home Screen app has its own storage too. Your current data therefore stays with the GitHub Pages copy until you move it.

1. In the **old** app (GitHub Pages): **Settings → Portable backup → Export Backup**. Save the JSON file to Files.
2. Open the **new** address in Safari, tap **Share → Add to Home Screen**, and open Minimal from the new icon.
3. In the new app: **Settings → Portable backup → Import Backup**, choose the file, then **Restore**.
4. **Settings → Sync**: enter the passcode and tap **Sign in and sync**. Minimal saves another JSON backup of the phone, then uploads everything.
5. Check that History shows your days, then remove the old icon. Keep the JSON files until you are sure.

The first upload is safe to repeat: **Upload this phone again** sends the same records with the same ids, and the server ignores anything it already has.

## Restoring onto a new phone

1. Open the Cloudflare address in Safari and **Add to Home Screen**.
2. Open Minimal from the Home Screen icon, go to **Settings → Sync**, enter the passcode and tap **Sign in and sync**.
3. A new phone uploads nothing; it downloads every record. History, Patterns and Settings fill in within a few seconds.

If the old phone is lost, use **Sign out everywhere** from the new phone. That ends every session, including the lost phone's.

## Deleting the server copy

"Clear all data" in the app only clears the phone it runs on. To delete everything stored in Cloudflare:

```bash
npx wrangler d1 execute minimal --remote --command "DELETE FROM records; DELETE FROM conflicts; DELETE FROM applied_ops; DELETE FROM sessions; DELETE FROM devices; DELETE FROM push_subscriptions; DELETE FROM reminder_log;"
```

To remove the database itself: `npx wrangler d1 delete minimal`.

## Local development

```bash
echo 'APP_PASSCODE=pick-a-local-passcode' > .dev.vars
npm run db:migrate:local
npm run dev        # http://127.0.0.1:8788
```

`.dev.vars` is ignored by git. The tests (`npm test`) run the API inside the Workers runtime against a temporary local D1 database and never touch Cloudflare.

## What is stored

One table, `records`, holds everything that syncs. Each row is one piece of data, keyed by `(entity, key)`:

| entity | key | value |
| --- | --- | --- |
| `item` | `2026-11-14\|priority\|<id>` | text, status, position (also `planned` and `move`) |
| `day` | `2026-11-14` | logged time, Weekend flag, rollover choice |
| `note` | `2026-11-14` | the day's conclusion |
| `focus` | `<session id>` | one completed Focus session |
| `setting` | `profile`, `accent`, `moves`, `launchers`, `reminder`, `milestoneEnabled` | the setting |
| `registry` | `<item id>` | item identity used by Patterns |

Other tables: `sessions` (hashed tokens only), `login_lock`, `devices`, `applied_ops`, `conflicts`, and, for the evening reminder, `push_subscriptions` and `reminder_log`. See [PRIVACY.md](../PRIVACY.md) for what this means for privacy.

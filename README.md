# Minimal

Minimal is a private, low-stimulation daily operating system for an intentional iPhone.

It is an installable Progressive Web App (PWA) that keeps priorities, Small Moves, daily conclusions, history, launcher settings, and preferences on the device. Optional Sync keeps the main copy in your own Cloudflare account so a new phone can restore everything. Minimal has no analytics or advertising.

**Live app:** https://minimal-apz.pages.dev (Cloudflare Pages). The old GitHub Pages copy has been retired.

## What Minimal includes

- Log yesterday, plan today: a day is logged once it is over
- Saturday and Sunday logged together as one Weekend
- Weekly review: when you log the Weekend, Minimal shows last week's score (its 6 days) and asks "What worked?" and "One thing to change?"; past reviews are listed in History
- Dated daily priorities with up to 10 items
- Up to 10 configurable Small Moves
- Permanent priorities: a fixed list every new day starts with (Settings → Permanent priorities); retire one to stop it on new days while past days keep it
- Pending, completed, and skipped daily states, with an optional one-tap reason for a skip (tired, work, forgot, didn't matter); Patterns shows the most common reasons per item
- 80/20 daily scoring
- Plan Tomorrow and new-day rollover
- Read-only history with deliberate historical editing
- History date picker to fill in missed days, including days never opened
- Add, edit, remove, and mark Small Moves on a past date without changing daily settings
- Week, month and year statistics, streaks, strongest month, and monthly progress
- Yearly target (Settings → Yearly target, default 80%): History shows it next to the year's average and says whether you are on track
- Up to 30 configurable launcher entries
- Item-attached 25/50/custom focus timer with local session history
- Optional 5-minute break timer
- Profiles, clock preferences, and restrained accent choices
- JSON backup and restore
- Optional Sync through your own Cloudflare account (offline-first, latest edit wins per item, conflict list)
- Evening reminder as a phone notification if yesterday (or the Weekend) is not logged; at most one a day
- Installable iPhone Home Screen experience
- Offline access after the first successful load

## Logging days

A day can only be logged once it is over.

- **Minimal opens on the most recent finished day.** Usually that is yesterday. On Monday it is the Weekend. On Saturday and Sunday it is Friday.
- **Today is for planning.** You can add, edit and reorder priorities, use Plan Tomorrow and run the focus timer. Marking items done or skipped and writing the conclusion stay locked ("Log this tomorrow, once the day is done."). Use **Plan today** / **Log yesterday** at the top of the day to switch between them.
- **Earlier days can be filled in at any time.** History lists every past day since your first record, and **Fill in a missed day** opens any past date. Choose **Edit this day** to log it. A day with no record is shown as **Not logged**. A logged day at 0% is **Missed**. These are different: not-logged days are counted but are left out of averages.
- **Today and future days never count** toward any percentage or streak.

### The Weekend

Saturday and Sunday are one unit called **Weekend**. It is logged once, opens for logging on Monday, and counts as one day in every stat, so a normal week has 6 units: Monday to Friday plus the Weekend. A Weekend belongs to the month and year that contain its Saturday. Streaks run Friday → Weekend → Monday.

Weekend records are stored under Saturday's date. When this version first runs, older Saturday and Sunday records are merged:

- Before anything changes, a full copy of the stored data is saved in browser storage under `minimal.backup.pre-weekend`. If that copy cannot be saved, the merge is postponed.
- An item is done if it was done on either day. Plans, focus sessions and both conclusions are kept (as `Sat: …` / `Sun: …`).
- The merge is safe to run more than once. It also runs after you merge in a JSON backup, so older backups import cleanly.

## Evening reminder

If Sync is on, Minimal can send one short phone notification in the evening, Toronto time, after the check-in time set in Settings, when the latest day you can log (yesterday, or the Weekend on Monday) is not logged yet. It never sends more than one a day.

- Turn it on in **Settings → Check-in and milestone → Phone notification**, on each phone.
- **On iPhone this needs iOS 16.4 or later, and Minimal must be installed to the Home Screen** (Share → Add to Home Screen) and opened from there. Safari tabs cannot receive notifications.
- The check runs on Cloudflare every 15 minutes, so a day you logged while offline still counts as not logged until the phone syncs.
- Setup for the person who deploys Minimal is in [docs/SYNC.md](docs/SYNC.md#evening-reminder).

## Privacy model

Minimal is local-first:

- No registration or user account; Sync uses a single passcode that you set
- No analytics or advertising
- No automatic location collection
- No external runtime dependencies

Records are stored by the browser for this site's origin using browser storage such as IndexedDB. Closing the app does not normally erase them, but clearing browser data, using private browsing, deleting site data, browser storage eviction, or changing devices can cause loss.

With **Sync** on (Settings → Sync), a copy is also kept in a Cloudflare D1 database in your own Cloudflare account. It is protected by your passcode and HTTPS but is **not end-to-end encrypted**. Setup, deployment and restoring onto a new phone are in [docs/SYNC.md](docs/SYNC.md).

Read [PRIVACY.md](PRIVACY.md) before entering personal information.

## Install on iPhone

1. Open the [live Minimal site](https://minimal-apz.pages.dev) in Safari.
2. Tap **Share**.
3. Tap **Add to Home Screen**.
4. Confirm the name and tap **Add**.
5. Open Minimal once while connected so its application shell can be cached.

Minimal can then open in a standalone app window. Core local features should remain available offline after the first successful load. External launcher destinations may still require internet access or their corresponding installed apps. A running Focus timer is reconciled from its stored timestamp when Minimal reopens, but Minimal cannot notify about the timer while it is completely closed; the evening reminder is a separate push notification (see Settings → Check-in and milestone).

## Backup and restore

Use **Export data** in Settings to download a JSON backup. JSON preserves structured records such as dates, states, settings, history, active Focus timer state, and completed Focus sessions.

Backups are plain text and are **not encrypted**. Store them privately. Do not put passwords, banking credentials, authentication codes, recovery phrases, or other secrets in Minimal.

The localhost development version and the live Cloudflare version use different browser origins and therefore keep separate data. Export from one and import into the other if you intentionally want to transfer records.

## Run locally

Requirements:

- A modern browser
- Python 3, or another static HTTP server

From the repository directory:

```bash
python3 -m http.server 8000 --bind 127.0.0.1
```

Open:

```text
http://127.0.0.1:8000/
```

Stop the server with `Ctrl+C`.

Do not open `index.html` directly with a `file://` URL when testing service workers or browser storage behavior.

The static server above runs the app without Sync. To run it with the sync API and a local database, see [docs/SYNC.md](docs/SYNC.md#local-development) (`npm run dev`).

### Tests

The tests need Node.js 22 or newer. Install the dev tools once with `npm ci`, then:

```bash
npm test
```

That runs `tests/logic.test.js` and `tests/sync-core.test.mjs` (Node), `tests/history.cjs`, `tests/rollover.cjs`, `tests/service-worker.cjs` and `tests/permanent.cjs` (regression checks), and `tests/api/` (Vitest inside the Cloudflare Workers runtime against a temporary local D1 database). The API tests cover: calls without a valid session get 401, sign-in and lockout, offline edits syncing, latest-edit-wins with the conflict log, and the first upload running twice safely.

`tests/logic.test.js` covers the default day (with the clock mocked, including Mondays), today being locked, the Weekend merge, and the percentage maths with today excluded.

## Project structure

- `index.html` — application structure
- `style.css` — responsive visual system
- `script.js` — application state and behavior
- `logic.js` — pure date, Weekend, scoring and merge logic, shared with the tests
- `sync-core.js` — shared sync rules (records, latest-edit-wins, op ids)
- `sync-client.js` — the phone's sync engine (outbox, upload, merge)
- `api/app.js`, `functions/api/[[route]].js` — the sync API (Cloudflare Pages Function)
- `migrations/` — D1 database schema
- `scripts/build.mjs` — builds `dist/` for Cloudflare Pages
- `docs/SYNC.md` — Cloudflare setup, deploy and restore
- `api/reminder.js`, `reminder/` — the evening reminder rule and its scheduled Worker
- `scripts/setup-push-keys.mjs` — creates the push keys and stores them as Cloudflare secrets
- `tests/` — unit and regression tests (see [Tests](#tests))
- `fonts/` — Fraunces and Figtree (Latin subsets), self-hosted under the SIL Open Font License (`OFL-*.txt`)
- `manifest.webmanifest` — PWA metadata
- `service-worker.js` — offline application shell
- `icon.svg`, `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` — app icons

## Contributing

Contributions are welcome through pull requests. Please read [CONTRIBUTING.md](CONTRIBUTING.md).

A fork or pull request does not change the live application. Changes reach the live site only after a maintainer merges them into `main` and deploys with `npm run deploy`.

For security concerns, follow [SECURITY.md](SECURITY.md) instead of posting exploit details or private data in a public issue.

## Scope and limitations

Minimal is a personal productivity tool. It is not an operating-system replacement and cannot control the iPhone Home Screen, other applications, Screen Time, device policy, emergency services, medical decisions, financial services, or account security.

Minimal is not a replacement for emergency, medical, financial, legal, or security services.

## License

Minimal is available under the [MIT License](LICENSE).

Copyright © 2026 Praxis Builds.

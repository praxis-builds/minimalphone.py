# Minimal

Minimal is a private, low-stimulation daily operating system for an intentional iPhone.

It is an installable Progressive Web App (PWA) that keeps priorities, Small Moves, daily conclusions, history, launcher settings, and preferences on the device. Minimal has no account system, analytics, advertising, or cloud database.

**Live app:** https://praxis-builds.github.io/minimalphone.py/

## What Minimal includes

- Log yesterday, plan today: a day is logged once it is over
- Saturday and Sunday logged together as one Weekend
- Dated daily priorities with up to 10 items
- Up to 10 configurable Small Moves
- Pending, completed, and skipped daily states
- 80/20 daily scoring
- Plan Tomorrow and new-day rollover
- Read-only history with deliberate historical editing
- History date picker to fill in missed days, including days never opened
- Add, edit, remove, and mark Small Moves on a past date without changing daily settings
- Week, month and year statistics, streaks, strongest month, and monthly progress
- Up to 30 configurable launcher entries
- Item-attached 25/50/custom focus timer with local session history
- Optional 5-minute break timer
- Profiles, clock preferences, and restrained accent choices
- JSON backup and restore
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

## Privacy model

Minimal is local-first:

- No registration or user account
- No analytics or advertising
- No cloud synchronization
- No automatic location collection
- No server-side database
- No external runtime dependencies

Records are stored by the browser for this site's origin using browser storage such as IndexedDB. Closing the app does not normally erase them, but clearing browser data, using private browsing, deleting site data, browser storage eviction, or changing devices can cause loss.

Read [PRIVACY.md](PRIVACY.md) before entering personal information.

## Install on iPhone

1. Open the [live Minimal site](https://praxis-builds.github.io/minimalphone.py/) in Safari.
2. Tap **Share**.
3. Tap **Add to Home Screen**.
4. Confirm the name and tap **Add**.
5. Open Minimal once while connected so its application shell can be cached.

Minimal can then open in a standalone app window. Core local features should remain available offline after the first successful load. External launcher destinations may still require internet access or their corresponding installed apps. A running Focus timer is reconciled from its stored timestamp when Minimal reopens, but Minimal cannot notify while it is completely closed.

## Backup and restore

Use **Export data** in Settings to download a JSON backup. JSON preserves structured records such as dates, states, settings, history, active Focus timer state, and completed Focus sessions.

Backups are plain text and are **not encrypted**. Store them privately. Do not put passwords, banking credentials, authentication codes, recovery phrases, or other secrets in Minimal.

The localhost development version and the GitHub Pages version use different browser origins and therefore keep separate data. Export from one and import into the other if you intentionally want to transfer records.

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

### Tests

The tests need Node.js 20 or newer and have no dependencies:

```bash
node --test tests/logic.test.js
node tests/history.cjs
node tests/rollover.cjs
```

`tests/logic.test.js` covers the default day (with the clock mocked, including Mondays), today being locked, the Weekend merge, and the percentage maths with today excluded.

## Project structure

- `index.html` — application structure
- `style.css` — responsive visual system
- `script.js` — application state and behavior
- `logic.js` — pure date, Weekend, scoring and merge logic, shared with the tests
- `tests/` — unit and regression tests (see [Tests](#tests))
- `manifest.webmanifest` — PWA metadata
- `service-worker.js` — offline application shell
- `icon.svg`, `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` — app icons

## Contributing

Contributions are welcome through pull requests. Please read [CONTRIBUTING.md](CONTRIBUTING.md).

A fork or pull request does not change the live application. Changes reach the live GitHub Pages site only after a repository maintainer reviews and merges them into the publishing branch.

For security concerns, follow [SECURITY.md](SECURITY.md) instead of posting exploit details or private data in a public issue.

## Scope and limitations

Minimal is a personal productivity tool. It is not an operating-system replacement and cannot control the iPhone Home Screen, other applications, Screen Time, device policy, emergency services, medical decisions, financial services, or account security.

Minimal is not a replacement for emergency, medical, financial, legal, or security services.

## License

Minimal is available under the [MIT License](LICENSE).

Copyright © 2026 Praxis Builds.

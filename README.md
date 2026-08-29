# Minimal

Minimal is a private, low-stimulation daily operating system for an intentional iPhone.

It is an installable Progressive Web App (PWA) that keeps priorities, Small Moves, daily conclusions, history, launcher settings, and preferences on the device. Minimal has no account system, analytics, advertising, or cloud database.

**Live app:** https://sidhu-builds.github.io/minimalphone.py/

## What Minimal includes

- Dated daily priorities with up to 10 items
- Up to 10 configurable Small Moves
- Pending, completed, and skipped daily states
- 80/20 daily scoring
- Plan Tomorrow and new-day rollover
- Read-only history with deliberate historical editing
- Yearly statistics, streaks, strongest month, and monthly progress
- Up to 30 configurable launcher entries
- Focus timer
- Profiles, clock preferences, and restrained accent choices
- JSON backup and restore
- Installable iPhone Home Screen experience
- Offline access after the first successful load

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

1. Open the [live Minimal site](https://sidhu-builds.github.io/minimalphone.py/) in Safari.
2. Tap **Share**.
3. Tap **Add to Home Screen**.
4. Confirm the name and tap **Add**.
5. Open Minimal once while connected so its application shell can be cached.

Minimal can then open in a standalone app window. Core local features should remain available offline after the first successful load. External launcher destinations may still require internet access or their corresponding installed apps.

## Backup and restore

Use **Export data** in Settings to download a JSON backup. JSON preserves structured records such as dates, states, settings, and history.

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

## Project structure

- `index.html` — application structure
- `style.css` — responsive visual system
- `script.js` — application state and behavior
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

Copyright © 2026 Sidhu Builds.

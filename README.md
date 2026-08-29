# Minimal 1.0.0 — Daily Operating System

Minimal is a private, intentional launcher and daily execution system for iPhone and the web. It combines a safe essential-app launcher with dated priorities, configurable Small Moves, an 80/20 execution score, short daily conclusions, history, and a yearly overview.

## Main features

- Up to 30 configurable launcher entries with URL safety checks
- Daily priorities and Small Moves with pending, done, and skipped states
- Tomorrow planning and explicit unfinished-item rollover choices
- Priority, Small Moves, and overall execution scores
- Read-only historical snapshots and yearly statistics
- Optional foreground-only daily check-in and 80% milestone message
- JSON and human-readable backups
- Installable, offline-capable progressive web app

## Local-only storage

Minimal has no account, analytics, advertising, cloud database, or sync service. Structured data is stored in IndexedDB for the current browser origin; small interface preferences may use localStorage. `localhost` and the GitHub Pages site have separate storage. Browser-data deletion, storage eviction, or private-browsing closure can erase local records, so keep private JSON backups.

JSON exports are unencrypted plain text. Do not put passwords, financial credentials, authentication codes, or other secrets in Minimal.

## Install on an iPhone Home Screen

1. Open the hosted Minimal address in Safari.
2. Tap **Share**.
3. Choose **Add to Home Screen**, then **Add**.
4. Open Minimal once while online so the application shell can be cached.

## Offline limitations

After a successful initial load, the core interface and local records remain available offline. External launcher destinations require whatever connectivity and installed app support their destination needs. The daily check-in appears only when Minimal is opened or resumed; Minimal does not request notification permission and cannot notify while closed.

## Backup and restore

In **Settings → Portable backup**, use **Export all data (JSON)**. Store the file privately. Import validates supported Minimal backups, sanitizes their content, merges dated records, and skips duplicates unless an imported record is newer.

## Local development

From the repository directory:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Open <http://127.0.0.1:8000/>. Relative asset and service-worker paths also support deployment below `/minimalphone.py/` on GitHub Pages.

## Safety

Minimal is not a replacement for emergency, medical, financial, or security services. Verify external destinations before relying on them.


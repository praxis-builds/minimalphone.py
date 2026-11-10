# Privacy Policy

**Effective date:** November 9, 2026  
**Applies to:** Minimal 1.3.x

Minimal is designed as a local-first Progressive Web App. It works fully on the device. Optional **Sync** keeps a copy of the records in a Cloudflare database that belongs to whoever deployed that copy of Minimal and holds its passcode.

## Information Minimal does not collect

Minimal does not include:

- User accounts (Sync uses one passcode, set by the person who deploys it)
- Analytics
- Advertising
- Tracking pixels
- Automatic geolocation
- IP-based location lookup
- Telemetry
- Social profiles
- Third-party runtime scripts or software development kits

Minimal does not send a user's priorities, Small Moves, conclusions, Focus timer or session records, history, profile, manual location label, or settings to Praxis Builds.

## Optional Sync

Sync is off until someone signs in on the Settings screen with the passcode of their own deployment. Without Sync, nothing below applies.

When Sync is on:

- **What is sent:** profile fields, accent, reminder, Small Moves and launcher settings, daily priorities, planned items, Small Move states, conclusions, day flags, completed Focus sessions, and the item identities used by Patterns. The active Focus timer, export dates and migration flags stay on the device.
- **Where it is stored:** in the Cloudflare D1 database bound to that deployment, in the deployer's own Cloudflare account. Cloudflare processes it under the deployer's agreement with Cloudflare. Praxis Builds has no access to it.
- **Encryption:** traffic uses HTTPS and Cloudflare encrypts stored data at rest. Records are **not end-to-end encrypted**: the server can read them, because it has to merge edits from different phones and check whether a day was logged.
- **Sign-in:** the passcode is a Cloudflare secret and is never stored in the app or the repository. A sign-in creates a random session token, sent back as an HttpOnly, Secure, SameSite=Strict cookie that lasts 180 days and renews with use. The database stores only a SHA-256 hash of that token. After 10 wrong passcodes, sign-in is locked for 15 minutes. No IP addresses are stored.
- **Logs:** the API writes nothing about requests or entries to logs. Live log streaming for the project, if someone with access to the Cloudflare account turns it on, shows only request metadata such as paths and status codes, never request bodies. Cloudflare may still keep standard request metadata for its own operation.
- **Evening reminder (optional):** if you turn on phone notifications, the phone's push address and its encryption keys are stored in the database. A scheduled Worker checks every 15 minutes whether the latest day is logged and, at most once a day, sends an encrypted notice through the phone maker's push service (Apple for iPhone, Google or Mozilla for other browsers). The push service sees only that a notice was sent, not its text. Turning notifications off removes the push address.
- **Conflicts:** when two phones change the same item while apart, both values are kept in the database's conflict list until dismissed in Settings.
- **Deletion:** "Clear all data" removes the copy on the current phone and signs it out; it does not delete the server copy. To delete the server copy, follow the steps in [docs/SYNC.md](docs/SYNC.md).

## Information stored on the device

Minimal stores application records in browser-managed storage associated with the website's origin. Depending on the release and migration history, this may include IndexedDB, local storage, and Cache API data.

Locally stored records can include:

- Profile and display preferences
- Daily priorities and their states
- Small Moves configuration and daily states
- Daily conclusions
- Active Focus timer state and completed Focus-session history
- Planned future items
- History and calculated statistics
- Launcher labels and destinations
- Reminder preferences
- A manually entered location label
- Backup and migration metadata

A manually entered location label is only a label. Minimal does not verify it or request the device's physical location.

## Network activity

The browser requests the application's public HTML, CSS, JavaScript, manifest, service worker, and icon files from the site that hosts Minimal (Cloudflare Pages). With Sync on, the app also calls that site's `/api/` endpoints.

Minimal may display an online/offline hint using browser-provided connection state. This is only a local hint and does not perform location tracking.

When a user intentionally opens a launcher destination, the browser or operating system may open another website or application. That destination has its own privacy policy and data practices. Praxis Builds does not control those services.

## Offline use

After a successful initial load, Minimal's service worker may cache the application shell for offline use. Offline availability is controlled partly by the browser and operating system and is not guaranteed permanently.

A running Focus timer uses stored timestamps and is reconciled when Minimal returns to the foreground or reopens. Minimal does not request notification permission or use Web Push, so it cannot notify while it is completely closed.

## Data retention and deletion

Without Sync, Minimal has no server-side copy of local records and therefore cannot recover them. With Sync on, a new phone can sign in and download the server copy.

Browser-stored data may remain after closing Minimal. It may be deleted when:

- The user clears website or application data
- The user uses a private or incognito browsing session and ends it
- The browser or operating system evicts stored data
- The application is removed and its associated data is cleared
- The device or browser profile is reset, lost, or replaced
- Browser storage fails or becomes corrupted

Use Minimal's clear/reset controls to remove application records from the current browser origin.

## Backups

Minimal can export records as JSON.

JSON backups are:

- User-initiated
- Plain text
- Not encrypted by Minimal
- Readable by anyone who obtains the file

Store exports in a trusted location. Do not store passwords, payment-card details, bank credentials, authentication codes, private keys, recovery phrases, government identifiers, medical records, or other highly sensitive secrets in Minimal.

The local development address and the live Cloudflare address are different browser origins and keep separate records.

## Device access

Minimal does not provide separate encryption or authentication for its local records. A person who can access an unlocked device or browser profile may be able to view the application and its stored information.

Use the device's passcode, biometric lock, software updates, and account protections.

## Children

Minimal is a general productivity tool and is not intentionally designed to collect children's personal information. Praxis Builds does not receive a user's age or entered records, with or without Sync.

## Changes to this policy

Material privacy changes will be documented in the repository. A release that introduces accounts, analytics, cloud storage, or new data transmission must update this policy before deployment.

## Questions

Use the repository's public issue tracker only for general privacy questions. Do not include private records or exported Minimal data in a public issue.

For a potential security vulnerability, follow [SECURITY.md](SECURITY.md).

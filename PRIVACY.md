# Privacy Policy

**Effective date:** August 29, 2026  
**Applies to:** Minimal 1.0.x

Minimal is designed as a local-first, account-free Progressive Web App.

## Information Minimal does not collect

Minimal does not include:

- User accounts
- Analytics
- Advertising
- Tracking pixels
- A cloud database
- Cloud synchronization
- Automatic geolocation
- IP-based location lookup
- Telemetry
- Social profiles
- Third-party runtime scripts or software development kits

Minimal itself does not send a user's priorities, Small Moves, conclusions, history, profile, manual location label, or settings to Sidhu Builds.

## Information stored on the device

Minimal stores application records in browser-managed storage associated with the website's origin. Depending on the release and migration history, this may include IndexedDB, local storage, and Cache API data.

Locally stored records can include:

- Profile and display preferences
- Daily priorities and their states
- Small Moves configuration and daily states
- Daily conclusions
- Planned future items
- History and calculated statistics
- Launcher labels and destinations
- Reminder preferences
- A manually entered location label
- Backup and migration metadata

A manually entered location label is only a label. Minimal does not verify it or request the device's physical location.

## Network activity

When Minimal is loaded from GitHub Pages, the browser requests the application's public HTML, CSS, JavaScript, manifest, service worker, and icon files from GitHub Pages.

Minimal may display an online/offline hint using browser-provided connection state. This is only a local hint and does not perform location tracking.

When a user intentionally opens a launcher destination, the browser or operating system may open another website or application. That destination has its own privacy policy and data practices. Sidhu Builds does not control those services.

## Offline use

After a successful initial load, Minimal's service worker may cache the application shell for offline use. Offline availability is controlled partly by the browser and operating system and is not guaranteed permanently.

## Data retention and deletion

Minimal has no server-side copy of local records and therefore cannot recover them.

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

The local development address and the GitHub Pages address are different browser origins and keep separate records.

## Device access

Minimal does not provide separate encryption or authentication for its local records. A person who can access an unlocked device or browser profile may be able to view the application and its stored information.

Use the device's passcode, biometric lock, software updates, and account protections.

## Children

Minimal is a general productivity tool and is not intentionally designed to collect children's personal information. Because it has no account or cloud collection system, Sidhu Builds does not receive a user's age or locally entered records.

## Changes to this policy

Material privacy changes will be documented in the repository. A release that introduces accounts, analytics, cloud storage, or new data transmission must update this policy before deployment.

## Questions

Use the repository's public issue tracker only for general privacy questions. Do not include private records or exported Minimal data in a public issue.

For a potential security vulnerability, follow [SECURITY.md](SECURITY.md).

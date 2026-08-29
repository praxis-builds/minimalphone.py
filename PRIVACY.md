# Privacy

Minimal 1.0.0 is local-first software.

- No accounts
- No analytics
- No advertising
- No cloud database or cloud sync
- No location tracking, GPS access, IP-location lookup, or location transmission
- No data transmission by Minimal itself

Minimal stores its data locally under the current browser origin using IndexedDB and, for limited preferences or fallback storage, localStorage. Different origins—such as `127.0.0.1`, `localhost`, and the GitHub Pages site—have separate storage.

An optional location label is entered manually, stored locally, and never used to determine the device’s location.

External launcher links leave Minimal. The destination application or website has its own privacy practices and may transmit data independently of Minimal.

JSON exports are unencrypted plain text. Store them privately. Local browser data can be lost through browser-data deletion, application-data deletion, storage eviction, private-browsing closure, device loss, or browser failure. Maintaining backups is the user’s responsibility.

Anyone with access to an unlocked device or browser profile may be able to read information stored by Minimal.


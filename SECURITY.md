# Security Policy

## Supported versions

| Version | Supported |
|---|---|
| 1.0.x | Yes |
| Earlier beta versions | No |

Security fixes are applied to the latest supported release.

## Reporting a vulnerability

Please report suspected vulnerabilities privately through GitHub's **Report a vulnerability** feature in the repository's Security tab when it is available.

Do not place the following in a public issue, pull request, discussion, or screenshot:

- Exploit instructions for an unpatched vulnerability
- Personal information
- Minimal JSON backups
- Authentication tokens
- Passwords or recovery codes
- Private repository or device information

If private vulnerability reporting is temporarily unavailable, open a public issue containing only a short request for a private reporting channel. Do not disclose the vulnerability details in that issue.

Reports are most useful when they include:

- Affected version or commit
- A concise description of the impact
- Reproduction steps using non-sensitive test data
- Browser and operating-system versions
- A proposed mitigation, if known

Praxis Builds will acknowledge and investigate reports when practical. Please allow time for validation and a coordinated fix before public disclosure.

## Security model

Minimal is a static, local-first Progressive Web App:

- No account system
- No application backend
- No cloud database
- No analytics or advertising
- No automatic location collection
- Browser-origin local storage
- A same-origin Content Security Policy
- An offline service worker

This reduces the amount of remotely stored user data, but it does not eliminate risk.

## Important limitations

- Locally stored records are not separately encrypted by Minimal.
- Anyone with access to an unlocked device or browser profile may be able to read them.
- JSON exports are unencrypted plain text.
- Browser storage can be cleared, evicted, or corrupted.
- External launcher destinations operate under their own security and privacy rules.
- The online/offline indicator is a connection hint, not a security guarantee.
- Minimal must not be used to store passwords, private keys, recovery phrases, authentication codes, financial credentials, or other secrets.

## Repository and release security

The public repository contains source code, not users' locally stored Minimal records.

Forking the repository or opening a pull request does not modify the live application. A change reaches the live GitHub Pages version only after a maintainer reviews and merges it into the publishing branch.

Contributors must never commit:

- Real user backups
- `.env` files
- Access tokens
- API keys
- Passwords
- Private certificates or signing keys
- Personal datasets

Pull requests should be small enough to review, pass repository validation, preserve the Content Security Policy, and avoid unnecessary external dependencies.

## Dependency policy

Minimal intentionally avoids runtime package dependencies and third-party scripts. Any proposal to add a dependency must explain:

- Why it is necessary
- What data it can access
- Its maintenance and security history
- Whether the same result can be achieved with platform APIs
- How it affects offline use and Content Security Policy

## Security is a shared process

No software can promise absolute security. Keep the device and browser updated, use a strong device passcode, protect the GitHub maintainer account with a passkey or two-factor authentication, review changes before merging, and keep private backups secure.

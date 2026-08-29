# Contributing to Minimal

Thank you for helping improve Minimal.

Minimal's direction is intentionally narrow: private, local-first, calm, accessible, and useful without becoming another attention system.

## Before contributing

- Search existing issues and pull requests.
- Use a public issue for ordinary bugs and feature discussions.
- Use the private process in [SECURITY.md](SECURITY.md) for vulnerabilities.
- Never upload personal Minimal data or a real JSON backup.
- Keep proposals aligned with the project's minimal and local-first design.

## Development

Fork the repository, create a focused branch, and run the application through a local HTTP server:

```bash
python3 -m http.server 8000 --bind 127.0.0.1
```

Open `http://127.0.0.1:8000/`.

## Required checks

Before opening a pull request:

```bash
node --check script.js
node --check service-worker.js
node -e "JSON.parse(require('fs').readFileSync('manifest.webmanifest', 'utf8')); console.log('manifest valid')"
git diff --check
```

Also test:

- A brand-new empty profile
- Existing stored-data migration
- Daily states and scoring
- History isolation
- JSON export/import, including Focus timer and session records
- Focus start, pause, resume, reset, timestamp recovery, and one-active-timer behavior
- Explicit Mark done behavior and completed Focus-session history
- Offline reload after a successful online load
- Keyboard navigation
- Reduced motion
- Narrow iPhone-sized layouts
- GitHub Pages subdirectory paths
- Service-worker cache versioning after application-shell changes

## Pull-request expectations

A pull request should:

- Explain the user problem
- Keep changes focused
- Include manual test results
- Preserve local-only storage unless a clearly disclosed architectural change is being proposed
- Preserve or strengthen accessibility
- Avoid new external dependencies unless strongly justified
- Update README, Privacy, or Security documentation when behavior changes
- Avoid unrelated formatting or rewrites

A pull request does not automatically deploy. Only maintainers can merge changes into the publishing branch.

## Security and privacy boundaries

Do not commit:

- `.env` files
- Secrets or tokens
- Real user exports
- Authentication material
- Private keys
- Personal data
- Unlicensed assets

Treat imported JSON and all user-entered text as untrusted input. Do not render it as executable HTML, inject scripts, or create unsafe URL schemes.

## License

By contributing, you agree that your contribution will be licensed under the project's [MIT License](LICENSE).

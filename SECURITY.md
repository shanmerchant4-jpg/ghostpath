# Security Policy

## Reporting a vulnerability

Do not open a public GitHub issue for security vulnerabilities.

Report privately by emailing **security@ghostpath.dev**. Include a description of
the vulnerability, steps to reproduce, and your GhostPath + Node.js versions.

You will receive acknowledgment within 72 hours. Confirmed issues are fixed and
coordinated with you before public disclosure. Critical issues get a GitHub
Security Advisory; CVE assignment is pursued once the project reaches v1.0.

---

## What happens on your machine — full transparency

This section answers every question a developer should ask before trusting a CLI
tool with their `.env` files.

### What leaves your machine

| Data | Leaves the machine? | Notes |
|---|---|---|
| Plaintext `.env` content | **Never** | Encryption happens locally before any upload |
| Master password | **Never** | Exists in process memory only for the duration of `sync push/pull`, then released |
| Project names | **No** (as metadata) | Vault filenames are SHA-256 hashes of the project name — cloud storage listings do not reveal what projects you have |
| Encrypted `.env` blob | Yes, by design | Only when you run `sync push` to your configured provider |
| Process names, PIDs | **Never** | Resource monitor data stays local |
| Call graph / trace data | **Never** | Navigator tracing writes to `~/.ghostpath/traces/` only |

### What is written to disk

| File | Location | Contents | Persists? |
|---|---|---|---|
| Project registry | `~/.ghostpath/projects.json` | Project names, paths, domains, ports | Yes |
| Process state | `~/.ghostpath/state.json` | PIDs of running processes | Yes (cleared on stop) |
| Log files | `~/.ghostpath/logs/<project>.log` | stdout/stderr from your project commands | Yes |
| Zombie kill log | `~/.ghostpath/logs/zombie.log` | Timestamps + PIDs of killed idle processes | Yes |
| Trace data | `~/.ghostpath/traces/<project>.json` | Call graph — only written when `"trace": true` in Ghostfile | Yes |
| Vault config | `~/.ghostpath/vault-config.json` | Provider name only (e.g. "local", "gdrive"). No passwords, no tokens | Yes |

### Temporary files

GhostPath does not create any temporary files in `/tmp` or system temp directories.
There is no temp-file decryption path — the vault decrypts the ciphertext in memory
and writes directly to the target `.env` path. There is no intermediate plaintext
file on disk at any point during `sync pull`.

### How encryption works

- **Algorithm:** AES-256-GCM. Authenticated encryption — tampered ciphertext is
  rejected before any plaintext is produced.
- **Key derivation:** PBKDF2-HMAC-SHA256, 310,000 iterations, 256-bit random salt
  generated fresh on every `sync push`. Follows the OWASP 2023 minimum recommendation.
- **IV:** 96-bit random IV generated per push. Never reused.
- **Filename:** SHA-256 hash of project name. Your project names are not readable
  from cloud storage file listings.
- **Auth tag:** 128-bit GCM auth tag. Any modification to the ciphertext causes
  decryption to throw before producing output.
- **Cryptography library:** Node.js built-in `node:crypto`, backed by OpenSSL.
  Zero native addon supply chain risk. Zero third-party crypto dependencies.

### How passwords are derived

The master password is entered at the keyboard, converted to a Buffer via
`Buffer.from(password, 'utf-8')`, passed through PBKDF2, and then released to
the garbage collector. It is never logged, never written to disk, never sent
anywhere. The derived key exists in memory only for the encryption/decryption
operation.

---

## Fault isolation — what breaks when something breaks

GhostPath is designed so that each layer can fail independently without taking
down the others. Here is the actual behavior:

| Component fails | Effect on other components |
|---|---|
| **Vault** (`sync push/pull` error) | Zero effect on project boot. `ghostpath open` does not touch vault code. |
| **Dashboard** crashes or never started | Projects keep running. Dashboard is a separate Vite process on port 7072. The CLI does not depend on it. |
| **WebSocket server** (port 7071) fails to bind | Projects keep running. The WS server failure is logged but does not exit the CLI. |
| **Resource monitor** crashes | Projects keep running. The monitor is a `setInterval` loop — if it throws, the error is caught and logged. |
| **Navigator / tracing** fails | Projects keep running. Tracing is opt-in via `"trace": true` in Ghostfile. If the hook errors, the project process is unaffected. |
| **DevKit panel** (port 7070) fails to bind | Projects keep running. DevKit is an independent Express server started only when explicitly called. |
| **Zombie killer** errors | Projects keep running. Any error is logged; it does not kill or stop the managed processes. |
| **`/etc/hosts` write fails** | Project still starts. The local domain route is skipped, but all `start` commands and browser tabs proceed. |
| **One `start` command crashes** | Other `start` commands keep running. Each command is an independent `child_process`. |

### Known limitations (not yet fault-isolated)

- If `~/.ghostpath/state.json` becomes corrupted, `ghostpath stop` cannot find
  PIDs. Workaround: kill manually, then `rm ~/.ghostpath/state.json`.
- The resource monitor stores readings in memory only — a crash resets dashboard graphs.

---

## What has NOT been audited

- **No third-party security audit has been performed.**
- **Do not use GhostPath to protect secrets where exposure would cause serious
  harm** — production database credentials, payment keys, private keys for systems
  holding real value. Use a purpose-built secrets manager for those.
- **GhostPath vault is appropriate for developer `.env` files** synced between your own machines.

---

## Audit roadmap

| Milestone | Plan |
|---|---|
| **v0.2** | Community review period. `src/vault/encrypt.ts` and `src/vault/decrypt.ts` published with an explicit invitation for security researchers to review. Findings tracked as public GitHub Issues. |
| **v0.5** | Independent cryptographic review of the full vault. Scope: key derivation, cipher mode, IV handling, auth tag verification, provider isolation. |
| **v1.0** | Full security audit before public release. Scope: entire codebase. |

---

## Reproducible builds

Not yet implemented. Target: v1.0. Tracked in GitHub Issues.

---

## Dependency policy

Runtime cryptography uses **zero third-party dependencies** — only `node:crypto`.

All dependency additions require explicit PR justification. Pinned by version in
`package-lock.json`. Automated update PRs are reviewed, not auto-merged.

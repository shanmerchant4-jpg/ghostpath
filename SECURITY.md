# Security Policy

## Vault security model

The GhostPath vault (`ghostpath sync push / pull`) encrypts `.env` files before
they leave your machine. Here is exactly what happens cryptographically:

1. **Key derivation.** Your master password is never used directly as an
   encryption key. It is passed through PBKDF2 with a 256-bit random salt,
   SHA-256 as the PRF, and **310,000 iterations**, producing a 256-bit derived
   key. The iteration count follows the OWASP 2023 recommendation for
   PBKDF2-HMAC-SHA256.

2. **Encryption.** The derived key encrypts the plaintext using **AES-256-GCM**
   with a fresh 128-bit random IV generated for every push. GCM mode provides
   both confidentiality and authenticated integrity — any tampering with the
   ciphertext causes decryption to fail with an authentication error rather than
   silently producing wrong output.

3. **Authentication tag.** The 128-bit GCM auth tag is appended to the
   ciphertext before base64 encoding, so it travels with the payload and is
   verified automatically on pull.

4. **Storage format.** What is written to the vault provider is a JSON object
   with four fields: `ciphertext` (base64), `iv` (base64), `salt` (base64), and
   `version`. The salt and IV are different on every push, so two pushes of the
   same file produce completely different ciphertext.

All cryptography uses Node.js's built-in `crypto` module (OpenSSL-backed). There
are no third-party cryptographic dependencies.

---

## What is stored vs. what is never stored

| Item | Stored where | Notes |
|---|---|---|
| Encrypted ciphertext | Vault provider (Drive, Dropbox, local) | AES-256-GCM, authenticated |
| IV (per-push) | Alongside ciphertext in vault | New random IV each push |
| Salt (per-push) | Alongside ciphertext in vault | New random salt each push |
| Master password | **Never stored** | Used only in-memory during the command |
| Derived key | **Never stored** | Derived on demand, discarded after use |
| Plaintext `.env` | Local disk only | Never transmitted in plaintext |
| Project PIDs | `~/.ghostpath/state.json` | Process state only, no secrets |
| Project registry | `~/.ghostpath/projects.json` | Names and paths only, no secrets |

---

## Supported versions

| Version | Supported |
|---|---|
| 0.1.x | Yes |
| < 0.1 | No |

---

## Reporting a vulnerability

If you discover a security vulnerability in GhostPath, please **do not open a
public GitHub issue**. Report it privately by emailing:

**security@ghostpath.dev**

Include:
- A description of the vulnerability and its potential impact
- Steps to reproduce the issue
- The GhostPath version and Node.js version you are running

You will receive an acknowledgment within 48 hours. If the issue is confirmed,
we will work on a fix and coordinate disclosure with you before publishing a
security advisory.

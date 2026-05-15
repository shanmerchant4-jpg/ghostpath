# GhostPath Vault — Security Transparency Document

This document explains exactly what GhostPath does with your `.env` files.
Read it before trusting the vault feature with anything sensitive.

---

## 1. What happens, step by step, when you run `ghostpath sync push`

1. GhostPath reads your `Ghostfile.json` to learn the project name and the path to your `.env` file.
2. Your terminal prompts you for a master password. The input is masked. Nothing is stored yet.
3. GhostPath reads the `.env` file from disk into memory as a plain string.
4. Two random values are generated using Node's `crypto.randomBytes`:
   - A **32-byte salt** (256 bits) — unique to this push, used to derive the encryption key.
   - A **16-byte IV** (initialization vector, 128 bits) — unique to this push, used by the cipher.
5. Your password and the salt are fed into **PBKDF2** to produce a 32-byte encryption key. This takes a noticeable fraction of a second — intentionally. See section 4.
6. The `.env` string is encrypted using **AES-256-GCM** with the derived key and IV. The cipher also produces a **16-byte authentication tag**.
7. The auth tag is appended to the ciphertext. The result is base64-encoded.
8. A JSON payload is assembled: `{ ciphertext, iv, salt, version: 1 }`. All values are base64 strings. The payload contains no plaintext, no password, and no key.
9. The payload is handed to the configured provider:
   - **Local** — written to `~/.ghostpath/vault/<projectName>.vault`.
   - **Google Drive** — uploaded via the Drive API as `ghostpath-<projectName>.vault`.
   - **Dropbox** — uploaded via the Dropbox API to `/ghostpath/<projectName>.vault`.
10. The in-memory key, salt, IV, and plaintext string are released. Node's garbage collector reclaims them on its next cycle. (See limitations in section 13.)

The password, the derived key, and the plaintext `.env` are never written to disk at any point during this process.

---

## 2. What leaves your machine

If you use the **local provider**, nothing leaves your machine. The vault file is written to `~/.ghostpath/vault/` on the same disk.

If you use **Google Drive or Dropbox**, the following is uploaded over HTTPS:

```json
{
  "ciphertext": "<base64 string>",
  "iv": "<base64 string>",
  "salt": "<base64 string>",
  "version": 1
}
```

Every field is either a base64-encoded random byte sequence or a version integer. There is no plaintext, no password, and no key anywhere in this payload.

The upload filename also leaves your machine: `ghostpath-<projectName>.vault` (Drive) or `/ghostpath/<projectName>.vault` (Dropbox). See section 6 for what that reveals.

---

## 3. What never leaves your machine

- **Your master password.** It is used in memory to derive the key, then discarded.
- **The derived encryption key.** It is computed locally, used to encrypt, then discarded.
- **The plaintext `.env` file contents.** They are read into memory, encrypted, then discarded. They are never written to a temp file, logged, or transmitted.

---

## 4. How the password is turned into an encryption key

GhostPath uses **PBKDF2** (Password-Based Key Derivation Function 2) with these exact parameters, visible in `src/vault/encrypt.ts` and `src/vault/decrypt.ts`:

| Parameter | Value |
|-----------|-------|
| Hash function | SHA-256 |
| Iterations | 310,000 |
| Output length | 32 bytes (256 bits) |
| Salt length | 32 bytes (256 bits, random per push) |

**Why 310,000 iterations?** OWASP's 2023 recommendation for PBKDF2-SHA256 is a minimum of 310,000 iterations. The purpose of a high iteration count is to make brute-force attacks expensive. If an attacker steals your vault file and tries to guess your password, they must run PBKDF2 with 310,000 SHA-256 rounds for every guess. On modern hardware, that limits a dedicated attacker to roughly tens of thousands of guesses per second — down from billions. A strong, random password remains important; the iteration count buys time, not immunity.

The salt is different every time you push. That means two pushes with the same password produce different keys and different ciphertext, which prevents an attacker from detecting whether you re-used the same password across projects.

---

## 5. How encryption works

GhostPath uses **AES-256-GCM** — the same cipher used in TLS and recommended by NIST.

- **AES-256** is a symmetric block cipher with a 256-bit key. No known practical attack against it exists when used correctly.
- **GCM** (Galois/Counter Mode) is an authenticated mode. In addition to encrypting the data, it produces a **16-byte authentication tag** that covers both the ciphertext and the IV.

The auth tag is appended to the ciphertext before base64 encoding. On decryption, the tag is verified before any plaintext is produced. This matters in section 12.

The IV is random per push and stored alongside the ciphertext. Reusing the same IV with the same key in GCM would be catastrophic (it would allow ciphertext recovery), but because a new key is derived from a new salt every push, IV reuse across pushes is not a risk even if the same password is used.

---

## 6. Whether filenames are encrypted

**No.** The vault filename includes your project name in plaintext:

- Local: `~/.ghostpath/vault/<projectName>.vault`
- Google Drive: `ghostpath-<projectName>.vault`
- Dropbox: `/ghostpath/<projectName>.vault`

**What this reveals:** Anyone who can see your cloud storage file list (or your home directory) will know you have a project called `<projectName>` and that you use GhostPath. They cannot infer the contents of your `.env` from the filename.

**What this does not reveal:** Any key names, values, secrets, tokens, or URLs in your `.env` file. That content is fully encrypted.

If your project name is itself sensitive (e.g. it names a client or internal system), be aware of this. The contents are protected; the existence of the project is not.

---

## 7. Whether temp files are created during encryption

**No.** Encryption happens entirely in memory inside the `encrypt()` function in `src/vault/encrypt.ts`. The `.env` string is read from disk, processed, and the resulting JSON payload is handed directly to the provider's upload method. No intermediate file is written to `/tmp`, to your home directory, or anywhere else.

---

## 8. What metadata leaks

Be honest with yourself about these two things:

**File size.** The vault file is slightly larger than your `.env` file due to base64 encoding overhead (roughly 33% larger) plus a small fixed JSON structure. Someone who can measure the vault file size can estimate how many bytes your `.env` contains. They cannot see any of its contents.

**Last-modified timestamp.** The vault file's modification time on disk (or in cloud storage) reveals when you last ran `ghostpath sync push`. Anyone who can see your cloud storage metadata — including the cloud provider itself — can see this timestamp.

GhostPath does not attempt to conceal either of these. If that level of metadata protection matters to you, consider using the local provider and managing the file yourself.

---

## 9. What is stored on disk locally (local provider)

The local provider writes a single file:

```
~/.ghostpath/vault/<projectName>.vault
```

Its contents are the JSON payload described in section 2: ciphertext, IV, salt, and version number — all base64-encoded. There is no plaintext in this file. You can open it in a text editor and confirm this yourself.

The file is created or overwritten on every `sync push`. No backup copies or history files are kept.

---

## 10. How to verify this yourself

You do not need to trust this document. The encryption logic is in two short files:

**`src/vault/encrypt.ts`** (~40 lines)
- Look for `randomBytes(SALT_LEN)` and `randomBytes(IV_LEN)` — these are the random salt and IV.
- Look for the `pbkdf2(...)` call — this is the key derivation. Count the iteration argument: `310_000`.
- Look for `createCipheriv('aes-256-gcm', key, iv)` — this is the cipher setup.
- Look for `cipher.getAuthTag()` — this is where the GCM auth tag is captured.
- Confirm the returned object contains only `ciphertext`, `iv`, `salt`, `version`. No password, no key.

**`src/vault/decrypt.ts`** (~58 lines)
- Confirm it re-derives the key using the same PBKDF2 parameters.
- Look for `decipher.setAuthTag(authTag)` — this is where the auth tag is verified.
- Confirm the `try/catch` around `decipher.final()` — if the tag check fails, it throws and returns nothing.

**`src/vault/providers/local.ts`** (for local provider)
- Confirm `fs.writeFile(...)` writes only the JSON payload.
- Confirm there is no second write, no backup, no temp file.

---

## 11. Independent verification

GhostPath uses **zero third-party cryptography libraries**. Every function — PBKDF2, AES-256-GCM, `randomBytes` — comes from Node.js's built-in `node:crypto` module, which wraps OpenSSL.

The imports at the top of `encrypt.ts` are:
```ts
import { createCipheriv, pbkdf2, randomBytes } from 'node:crypto';
```

No `npm install` for cryptography, no vendored C code, no external trust dependency.

To audit the underlying primitives, read the Node.js documentation for:
- `crypto.pbkdf2`: https://nodejs.org/api/crypto.html#cryptopbkdf2password-salt-iterations-keylen-digest-callback
- `crypto.createCipheriv`: https://nodejs.org/api/crypto.html#cryptocreatecipherivalgorithm-key-iv-options
- `crypto.randomBytes`: https://nodejs.org/api/crypto.html#cryptorandombytessize-callback

Node's crypto module is itself audited as part of the V8/OpenSSL security process.

---

## 12. What happens if your password is wrong

When you run `ghostpath sync pull` with the wrong password:

1. PBKDF2 derives a key from the wrong password and the stored salt. This produces the wrong key.
2. AES-256-GCM attempts decryption with the wrong key.
3. The GCM authentication tag check fails. Node throws a native error.
4. GhostPath catches it and throws a `VAULT_DECRYPT_FAILED` error: *"Decryption failed — wrong password or corrupted vault file."*
5. **No data is written.** The `fs.writeFile` call that would overwrite your `.env` is never reached.

Your existing `.env` on disk is not touched. The same behaviour applies if the vault file has been corrupted or tampered with — the auth tag will not match, and decryption is aborted before producing any output.

---

## 13. Threat model — what GhostPath protects against and what it does not

### Protected against

**Cloud provider breach.** If Google Drive, Dropbox, or the server hosting your vault is compromised, the attacker obtains the encrypted JSON payload. Without your master password and 310,000 rounds of PBKDF2, decrypting it is computationally infeasible with a strong password.

**Accidental commit of the vault file.** If `<projectName>.vault` ends up in a public git repository, the contents are ciphertext. No secrets are exposed without the master password.

**Tampering.** If someone modifies the vault file in transit or on disk, GCM authentication will detect the tampering and refuse to decrypt.

### Not protected against

**Malware on your local machine.** If your machine is compromised, an attacker could intercept your password at the terminal prompt, or read the `.env` from memory or disk directly. GhostPath encrypts at rest and in transit, but it cannot protect against an attacker who already controls your machine.

**Someone who has your master password.** The security of the vault depends entirely on the strength and secrecy of your master password. GhostPath does not store, recover, or reset it. If your password is weak or shared, the encryption provides little protection.

**Memory forensics.** After encryption, the plaintext string and derived key remain in memory until Node's garbage collector reclaims them. GhostPath does not explicitly zero those buffers. A sophisticated attacker with access to process memory could recover them during the brief window after encryption and before GC. This is a known limitation of JavaScript runtimes and is common to most Node.js applications.

**The project name itself.** As described in section 6, the vault filename reveals your project name. If that name is sensitive, use the local provider and do not commit the file anywhere.

### Summary

The vault is appropriate for: protecting against cloud breaches, preventing accidental secret leaks in shared storage, and syncing `.env` files between machines you control.

The vault is not a substitute for: a proper secrets manager (Vault, AWS Secrets Manager, 1Password Secrets Automation) in a production or team environment.

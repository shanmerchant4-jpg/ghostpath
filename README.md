# GhostPath

One command boots your entire project context.

[![npm version](https://img.shields.io/npm/v/ghostpath.svg)](https://www.npmjs.com/package/ghostpath)
[![CI](https://github.com/shanmerchant4-jpg/ghostpath/actions/workflows/ci.yml/badge.svg)](https://github.com/shanmerchant4-jpg/ghostpath/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Node.js >=18](https://img.shields.io/badge/Node.js-%3E%3D18-brightgreen.svg)](https://nodejs.org/)

---

```bash
ghostpath add ./my-app
ghostpath open my-app
```

```
✓ my-app is running
  domain  my-app.local
  port    3000
  pids    45231, 45232
  cmds    2
  tabs    2 opening...
```

![GhostPath in action](./demo.gif)

---

## Why GhostPath

Context-switching between projects is expensive. Opening 6 terminal tabs, remembering which `npm run dev` goes where, hunting for your Notion board, waiting for your dev server to boot before your browser tab loads — it's death by a thousand cuts.

GhostPath is a `Ghostfile.json` at your project root that describes everything your project needs to start. One command reads it and does all of it.

---

## `.env` files — open source, transparent by default

Most developer tools that touch `.env` files are vague about what they do with your secrets. GhostPath is not.

**Here is exactly what happens:**

- Your `.env` file is **never read by GhostPath during normal operation.** `ghostpath open` loads it into your child process environment the same way `dotenv` does — it never touches the content.
- The **Vault feature** (`sync push/pull`) encrypts your `.env` with AES-256-GCM locally on your machine before anything leaves. The master password is never stored anywhere — it lives in process memory for the duration of the command, then it's gone.
- **Nothing leaves your machine** except the encrypted blob, and only when you explicitly run `sync push`. No telemetry. No analytics. No background syncing.
- Vault filenames in cloud storage are SHA-256 hashes of your project name — someone browsing your Google Drive cannot see which projects you have.

Full details: [SECURITY.md](./SECURITY.md)

---

## Install

```bash
npm install -g ghostpath
```

Requires Node.js 18 or later.

---

## Quick Start

```bash
# 1. Add a Ghostfile.json to your project root (see schema below)

# 2. Register the project
ghostpath add ./my-project

# 3. Boot everything — servers start, tabs open, local domain is live
ghostpath open my-project

# 4. See all registered and running projects
ghostpath list

# 5. Clean shutdown (5-second countdown, Ctrl+C to cancel)
ghostpath stop my-project
```

---

## The Ghostfile.json

Place this at your project root. Only `name` and `start` are required.

```jsonc
{
  "name": "portfolio",
  "domain": "portfolio.local",  // written to /etc/hosts with your confirmation
  "port": 3000,
  "start": [
    "npm run dev",              // each command spawns as an independent process
    "npm run api"
  ],
  "open": [
    "https://notion.so/your-board",
    "https://figma.com/file/your-design"
  ],
  "env": ".env.local",         // defaults to .env
  "trace": true,               // opt into Navigator runtime tracing (v0.3)
  "resources": {
    "maxMemoryMB": 2048,
    "idleKillMinutes": 30      // idle threshold for zombie detection
  }
}
```

> Note: `Ghostfile.json` is standard JSON. The `//` comments are for illustration — remove them in your actual file.

---

## What is GhostPath?

Three layers, each independent. **A failure in one does not affect the others.**

**The Ghost Layer** is the core. `ghostpath open` starts your services in the right order, opens your browser tabs after a 2-second boot delay (so servers are ready), routes `your-project.local` via `/etc/hosts` (with your explicit confirmation), and starts a resource monitor in the background. `ghostpath stop` tears it all down with a 5-second countdown. `ghostpath kill --zombie` removes processes that have been idle past your threshold before they eat your RAM.

**The DevKit Layer** is an offline utility panel at `http://localhost:7070`. Eight tools — JSON formatter, regex tester, JWT decoder, diff viewer, hash generator, Base64/URL encoder, timestamp converter, cron explainer — all built in. No CDN. No external requests. Run `ghostpath tools` to open it.

**The Navigator Layer** (v0.3) instruments your running project and builds a live call graph showing how your code actually executes at runtime. It hooks into Node.js via `--require`, wraps module exports transparently, and reports function-level timing back over IPC. `ghostpath trace my-app` shows the hottest paths updated live in the terminal.

---

## CLI Reference

| Command | Description |
|---|---|
| `ghostpath add <path>` | Register a project. Reads `Ghostfile.json`, saves to `~/.ghostpath/projects.json`. Prompts before overwriting. |
| `ghostpath open <project>` | Boot everything. Spawns all `start` commands, opens `open` URLs, starts local proxy, adds `/etc/hosts` entry (with confirmation), starts resource monitor and WS server. |
| `ghostpath stop <project>` | Graceful shutdown. 5-second countdown — Ctrl+C cancels. Removes proxy route and `/etc/hosts` entry. |
| `ghostpath list` | All registered projects with name, domain, port, and running status. |
| `ghostpath status` | Current CPU%, RAM used/total, GPU utilization as ASCII bars. |
| `ghostpath kill --zombie` | Find GhostPath-managed processes idle past the threshold and kill them. `--auto` skips the prompt (5-second countdown instead). |
| `ghostpath sync setup` | Configure your vault provider (Google Drive, Dropbox, or local). Interactive wizard. |
| `ghostpath sync push` | Encrypt `.env` and upload to your vault provider. Prompts for master password — never stored. |
| `ghostpath sync pull` | Download and decrypt vault `.env` to disk. Prompts for master password. |
| `ghostpath trace <project>` | Boot project with runtime tracing and show a live hot-path table. Ctrl+C stops cleanly. |
| `ghostpath dashboard` | Serve the built dashboard at `http://localhost:7072`. |
| `ghostpath tools` | Start DevKit panel at `http://localhost:7070`. |

---

## DevKit Tools

All eight tools run entirely offline at `http://localhost:7070`. No CDN. No external requests.

| Tool | What it does |
|---|---|
| **JSON** | Format, minify, validate. Generate TypeScript types and Zod schemas from any JSON. |
| **Regex** | Live match highlighting. Plain-English explanation of the pattern. |
| **Diff** | Paste two blocks, see a unified LCS diff. |
| **JWT** | Decode header, payload, signature. Visual expiry bar. |
| **Encoder** | Base64, URL encoding, HTML entities — encode and decode. |
| **Hash** | SHA-256, SHA-512, SHA-1, MD5. UUID v4 and v7. |
| **Timestamp** | Unix ↔ human-readable. Live current Unix time. |
| **Cron** | Plain-English cron translation. Next 8 scheduled runs. |

---

## Vault — encrypted `.env` sync

```bash
ghostpath sync setup          # pick your provider, one time
ghostpath sync push           # encrypts .env locally, uploads ciphertext
ghostpath sync pull           # downloads, decrypts in memory, writes .env
```

AES-256-GCM. PBKDF2-HMAC-SHA256 at 310,000 iterations. Random salt per push. Password never stored. Filename is a hash — cloud storage listings reveal nothing.

Cross-platform: works between Linux, macOS, and Windows. The encrypted blob is identical on all three. Anyone with the password and the file can decrypt on any platform.

Full security details, audit roadmap, and what-leaves-your-machine breakdown: [SECURITY.md](./SECURITY.md)

---

## Roadmap

| Version | Status | What ships |
|---|---|---|
| **v0.1** | **Current** | Ghost Layer, DevKit panel, dashboard shell, vault crypto primitives |
| **v0.2** | Planned | Full vault push/pull across devices via Google Drive, Dropbox, or local |
| **v0.3** | Planned | Navigator — runtime call graph tracing, hot-path detection, GPU monitoring |
| **v0.4** | Planned | LLM integration — boot local AI models (Ollama) alongside your project |
| **v0.5** | Planned | Branch diff — compare Navigator call graphs between git branches to catch regressions |

---

## License

MIT — see [LICENSE](./LICENSE)

Copyright 2025 Shan Merchant

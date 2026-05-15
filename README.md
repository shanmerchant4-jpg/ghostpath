# GhostPath

One command boots your entire project context.

[![npm version](https://img.shields.io/npm/v/ghostpath.svg)](https://www.npmjs.com/package/ghostpath)
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

Two commands. Your dev server is running, your browser tabs are open, your local
domain is live, and your resource monitor is watching the process — all from a
single `Ghostfile.json` at your project root.

---

## What is GhostPath?

GhostPath is a local developer OS built for people who context-switch between
multiple projects every day. It has three layers that work together.

**The Ghost Layer** is the core. You describe your project in a `Ghostfile.json`
— which commands to start, which URLs to open, which `.env` file to load, which
local domain to route. Then `ghostpath open` does all of it at once, in the right
order, every time. `ghostpath stop` tears it all down cleanly, with a 5-second
countdown so you never accidentally kill a running process. `ghostpath kill
--zombie` finds processes that have been idle past a threshold and removes them
before they eat your RAM.

**The Navigator Layer** (arriving in v0.3) instruments your running project and
builds a live call graph showing how your code actually executes at runtime —
not how you think it executes. It hooks into Node.js via the `--require` flag,
wraps module exports transparently, and reports function-level timing and call
frequency back to GhostPath over IPC. `ghostpath trace my-app` shows the hottest
paths in your code updated live in the terminal.

**The DevKit Layer** is an offline utility panel served at `http://localhost:7070`.
Eight tools — JSON formatter, regex tester, JWT decoder, diff viewer, hash
generator, Base64/URL encoder, timestamp converter, and cron explainer — all
built in, all offline, no CDN, no external requests. Run `ghostpath tools` to
open it, or access it from the dashboard sidebar.

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

# 2. Register the project with GhostPath
ghostpath add ./my-project

# 3. Boot the project — services start, browser tabs open, local domain is live
ghostpath open my-project

# 4. See everything that is registered and running
ghostpath list

# 5. Clean shutdown (5-second countdown, Ctrl+C to cancel)
ghostpath stop my-project
```

---

## The Ghostfile.json

Place this file at your project root. Every field except `name` and `start` is
optional.

```jsonc
{
  "name": "portfolio",           // unique identifier — used in all ghostpath commands
  "domain": "portfolio.local",  // written to /etc/hosts; routes to localhost:port
  "port": 3000,                 // the port your app runs on
  "start": [
    "npm run dev",              // each command is spawned as a separate child process
    "npm run api"
  ],
  "open": [
    "https://notion.so/your-board",    // opened in your default browser after boot
    "https://figma.com/file/your-design"
  ],
  "models": ["llama3:8b"],     // local AI models to boot with the project (v0.4)
  "env": ".env.local",         // .env file to load — defaults to .env
  "trace": true,               // opt into Navigator runtime tracing (v0.3)
  "resources": {
    "maxMemoryMB": 2048,       // memory ceiling — reserved for future enforcement
    "idleKillMinutes": 30      // idle threshold for zombie detection
  }
}
```

> Note: `Ghostfile.json` is standard JSON — the `//` comments above are for
> illustration only. Remove them in your actual file.

---

## CLI Reference

| Command | Description |
|---|---|
| `ghostpath add <path>` | Register a project directory. Reads `Ghostfile.json` and saves to `~/.ghostpath/projects.json`. Prompts before overwriting an existing entry. |
| `ghostpath open <project>` | Boot a project. Spawns all `start` commands, opens `open` URLs in the browser, starts the local proxy, adds the `/etc/hosts` entry (with confirmation), and starts the resource monitor and WebSocket server. |
| `ghostpath stop <project>` | Gracefully stop a project. Shows a 5-second countdown — press Ctrl+C to cancel. Removes the proxy route and `/etc/hosts` entry. |
| `ghostpath list` | Show all registered projects with name, domain, port, and running status. |
| `ghostpath status` | Print current CPU%, RAM used/total, and GPU utilization as ASCII bars. |
| `ghostpath kill --zombie` | Find GhostPath-managed processes that have been idle past the threshold and kill them. Add `--auto` to skip the confirmation prompt (shows a 5-second countdown instead). |
| `ghostpath sync push` | Encrypt the project `.env` file and upload it to the configured vault provider. Prompts for the master password — the password is never stored. |
| `ghostpath sync pull` | Download and decrypt the vault `.env` to disk. Prompts for the master password. |
| `ghostpath trace <project>` | Start the project with runtime tracing enabled and display a live hot-path table updated every 2 seconds. Ctrl+C stops the project cleanly. |
| `ghostpath dashboard` | Serve the built dashboard at `http://localhost:7072` and open it in the browser. Prints build instructions if the dashboard has not been compiled yet. |
| `ghostpath tools` | Start the DevKit panel at `http://localhost:7070` and open it in the browser. |

### ghostpath kill flags

| Flag | Description |
|---|---|
| `--zombie` | Required. Without this flag the command is a no-op. |
| `--auto` | Kill without an interactive prompt. Shows a 5-second countdown that logs to stdout so you can still cancel with Ctrl+C. |

---

## DevKit Tools

All eight tools run entirely offline at `http://localhost:7070`. No CDN, no
external requests.

| Tool | What it does |
|---|---|
| **JSON** | Format, minify, validate JSON. Generate TypeScript types and Zod schemas from any JSON structure. |
| **Regex** | Live match highlighting as you type. Plain-English explanation of the pattern. |
| **Diff** | Paste two text blocks and see a unified LCS diff with additions and removals highlighted. |
| **JWT** | Decode any JWT — header, payload, signature. Visual expiry bar showing time remaining. |
| **Encoder** | Encode and decode Base64, URL encoding, and HTML entities. |
| **Hash** | Generate SHA-256, SHA-512, SHA-1, MD5 hashes. Generate UUID v4 and v7. |
| **Timestamp** | Convert between Unix timestamps and human-readable dates. Live clock showing current Unix time. |
| **Cron** | Translate cron expressions to plain English and preview the next 8 scheduled runs. |

---

## Roadmap

| Version | Status | What ships |
|---|---|---|
| **v0.1** | Current | Ghost Layer — `open`, `stop`, `list`, `add`, local proxy, resource monitor, DevKit panel, dashboard shell |
| **v0.2** | Planned | Vault — AES-256-GCM encrypted `.env` sync via Google Drive, Dropbox, or local filesystem |
| **v0.3** | Planned | Navigator — runtime call graph tracing, hot-path detection, GPU monitoring |
| **v0.4** | Planned | LLM integration — boot local AI models (Ollama) alongside your project |
| **v0.5** | Planned | Branch diff — compare Navigator call graphs between git branches to catch regressions |

---

## License

MIT — see [LICENSE](./LICENSE)

Copyright 2025 Shan Merchant

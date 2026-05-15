# Contributing to GhostPath

Thank you for your interest in contributing. This document covers everything you
need to get a local environment running, write code that will pass review, and
submit a pull request.

---

## Setting up locally

```bash
git clone https://github.com/shanmerchant4/ghostpath.git
cd ghostpath
npm install
```

To run the CLI in watch mode so changes take effect immediately:

```bash
npm run dev
```

This uses `tsx watch` to recompile on every save. To make the `ghostpath`
command available globally from your local clone:

```bash
npm link
```

To start the dashboard dev server (Vite + HMR):

```bash
npm run dashboard
```

---

## Running tests

```bash
npm test           # watch mode
npx vitest run     # single pass (used in CI)
```

GhostPath uses [Vitest](https://vitest.dev/) — not Jest. Tests live in the
`test/` directory and mirror the `src/` structure. The target is 80% coverage
before the v1.0 release.

---

## Type checking and linting

```bash
npx tsc --noEmit   # type-check only, no output
npm run lint       # ESLint over src/
```

Both must pass cleanly before a PR can be merged.

---

## Branch naming

| Type | Pattern | Example |
|---|---|---|
| New feature | `feat/<short-name>` | `feat/gpu-monitor` |
| Bug fix | `fix/<short-name>` | `fix/proxy-port-conflict` |
| Maintenance | `chore/<short-name>` | `chore/update-deps` |
| Documentation | `docs/<short-name>` | `docs/ghostfile-schema` |

All branches target `main`.

---

## Pull request checklist

Before opening a PR, verify every item below:

- [ ] `npx tsc --noEmit` exits with no errors
- [ ] `npx vitest run` passes with no failures
- [ ] No `any` types introduced — use explicit types or generics
- [ ] All errors use the `GhostError` pattern (`throw new GhostError({ code, message, hint })`)
- [ ] Raw `Error` objects are never thrown from GhostPath code
- [ ] No unhandled promises — every `.then()` chain has a `.catch()`, every
      `async` call is awaited or explicitly `void`-marked
- [ ] New public functions in `src/ghost/` and `src/devkit/` have unit tests
- [ ] If you added a CLI command, the README CLI reference table is updated

---

## Module ownership

Understanding which layer owns which responsibility will help you find the right
file for any change.

**Ghost Layer (`src/ghost/`)** is the process orchestration core. `orchestrator.ts`
ties together project registration, Ghostfile parsing, and the boot sequence.
`process-manager.ts` owns child process spawning, PID tracking in
`~/.ghostpath/state.json`, and graceful shutdown. `proxy.ts` runs a single
shared HTTP server on port 80 that routes `.local` domains to localhost ports.
`hosts.ts` reads and writes `/etc/hosts` with explicit user confirmation on every
write. `resource-monitor.ts` polls CPU and RAM every 5 seconds using a ring
buffer of 60 readings, emitting events that the WebSocket server broadcasts to
the dashboard. `zombie-killer.ts` tracks last-I/O timestamps per PID and kills
processes that have been idle past the configured threshold.
`ws-server.ts` is the real-time bridge between the CLI process and the dashboard
— it broadcasts resource snapshots and handles `project:open` / `project:stop`
messages from dashboard clients.

**Navigator Layer (`src/navigator/`)** is the runtime intelligence layer.
`instrumenter.ts` generates a CJS hook file that wraps Node module exports using
`Proxy`, recording function-level call timing without modifying the target
codebase. `call-graph.ts` maintains an in-memory directed graph of call
relationships, with automatic pruning of nodes unseen for more than 60 seconds.
`hotpath.ts` sorts graph nodes by call frequency and average duration, and
provides the formatted table rendered by `ghostpath trace`. `query.ts` answers
point queries like "where does function X come from" against the live graph.

**DevKit Layer (`src/devkit/`)** owns the offline tooling server. `server.ts`
runs a lightweight Express instance on port 7070 serving the static tool panel.
The eight tool implementations live in `src/devkit/tools/` — one file per tool,
no external dependencies, no network requests.

**Dashboard (`src/dashboard/`)** is the Vite + React application. `App.tsx` is
the root component with sidebar navigation. Each panel — `ProjectPanel.tsx`,
`TracePanel.tsx`, `ResourcePanel.tsx`, `DevKitPanel.tsx` — corresponds to a
sidebar tab. `ws.ts` handles the WebSocket connection to the CLI on port 7071,
including automatic reconnection when the CLI process restarts.

**Vault (`src/vault/`)** owns all secret handling. `encrypt.ts` and `decrypt.ts`
implement AES-256-GCM with PBKDF2 key derivation using only Node's built-in
`crypto` module — no third-party crypto dependencies. The provider adapters in
`src/vault/providers/` implement a common `VaultProvider` interface with `upload`
and `download` methods for each storage backend (local filesystem, Google Drive,
Dropbox).

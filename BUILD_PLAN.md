# GhostPath — Build Plan

> Phases, tasks, agent assignments, and weekly targets.
> Built for a solo developer using Claude Code with sub-agents.

---

## Phase 0 — Scaffold (Day 1–2)

Goal: repo exists, CLI runs, nothing crashes.

### Tasks

- [ ] `npm init` + TypeScript config + ESLint + Prettier
- [ ] Install core deps: `commander`, `chalk`, `ora`, `inquirer`, `ws`, `http-proxy`
- [ ] Create `src/cli.ts` as entry point
- [ ] Wire up all 9 top-level commands as stubs (they log "coming soon" for now)
- [ ] Add `npm link` so `ghostpath` works in terminal
- [ ] Create folder structure exactly as in CLAUDE.md
- [ ] Initialize Vitest + write one passing test

**Agent:** `cli-developer`

**Done when:** `ghostpath --help` shows all 9 commands cleanly.

---

## Phase 1 — Ghost Layer Core (Week 1)

Goal: `ghostpath open` starts real processes and opens tabs.

### Tasks

#### 1A — Ghostfile Parser
- [ ] Write `Ghostfile.json` schema validator using Zod
- [ ] `ghostpath add <path>` scans directory, finds Ghostfile, registers it in `~/.ghostpath/projects.json`
- [ ] `ghostpath list` reads `projects.json` and renders a table

**Agent:** `backend-developer`

#### 1B — Process Manager
- [ ] `orchestrator.ts` reads Ghostfile, spawns each `start` command as a child_process
- [ ] Each process gets a PID tracked in `~/.ghostpath/state.json`
- [ ] `ghostpath stop <project>` reads PIDs from state, sends SIGTERM gracefully
- [ ] Stdout/stderr from each process streams to a log file at `~/.ghostpath/logs/<project>.log`

**Agent:** `node-specialist`

#### 1C — Browser Tab Opener
- [ ] Use `open` package to launch URLs from `Ghostfile.open[]` after services start
- [ ] 2-second delay before opening tabs (let servers boot)

**Agent:** `backend-developer`

#### 1D — Local Domain Proxy
- [ ] `proxy.ts` creates an http-proxy instance mapping `portfolio.local:80` → `localhost:3000`
- [ ] `hosts.ts` checks if entry exists in `/etc/hosts`, prompts user, writes if confirmed
- [ ] On `ghostpath stop`, removes the hosts entry

**Agent:** `network-engineer`

**Done when:** `ghostpath open portfolio` starts servers, opens Notion/Figma tabs, routes `portfolio.local` in browser.

---

## Phase 2 — Resource Monitor + Zombie Killer (Week 2)

Goal: GhostPath watches the machine and cleans up.

### Tasks

#### 2A — Resource Poller
- [ ] `resource-monitor.ts` polls `os.cpus()`, `process.memoryUsage()`, `os.freemem()` every 5 seconds
- [ ] Emits events via EventEmitter: `cpu-high`, `ram-high`, `process-idle`
- [ ] Stores last 60 readings in a ring buffer (for dashboard graphs)

**Agent:** `performance-engineer`

#### 2B — GPU Monitor
- [ ] Spawn `nvidia-smi --query-gpu=utilization.gpu,memory.used,memory.total --format=csv,noheader,nounits`
- [ ] Parse output, add to resource readings
- [ ] Graceful fallback if `nvidia-smi` not found (user doesn't have NVIDIA GPU)

**Agent:** `performance-engineer`

#### 2C — Zombie Killer
- [ ] `zombie-killer.ts` tracks last I/O timestamp per PID
- [ ] If a GhostPath-managed process has no stdin/stdout for `idleKillMinutes` (from Ghostfile), flag it
- [ ] `ghostpath kill --zombie` shows list of idle processes, prompts confirmation, kills them
- [ ] Auto-mode: if `"autoKill": true` in Ghostfile, kill without prompting (with a 5s warning log)

**Agent:** `devops-engineer`

**Done when:** `ghostpath status` shows CPU/RAM/GPU bars. Idle processes get killed automatically.

---

## Phase 3 — DevKit Panel (Week 2–3)

Goal: all 8 offline tools available at `http://localhost:7070` (or embedded in dashboard).

### Tasks

- [ ] `devkit/server.ts` — Express server on port 7070, serves the tools UI
- [ ] Port the 8 tools from `devkit-pro.html` into proper React components inside `src/dashboard/panels/DevKitPanel.tsx`
- [ ] WebSocket pipe: when Navigator captures an API response, it can push the JSON directly into the JSON tool
- [ ] `ghostpath tools` command opens the browser to port 7070

Tools to implement as standalone React components:
- [ ] `JsonTool.tsx` — format, minify, validate, TS types, Zod schema
- [ ] `RegexTool.tsx` — live highlighting, plain-English explanation
- [ ] `DiffTool.tsx` — LCS diff, unified view
- [ ] `JwtTool.tsx` — decode, expiry bar
- [ ] `EncoderTool.tsx` — Base64, URL, HTML
- [ ] `HashTool.tsx` — SHA-256/512/1, MD5, UUID v4/v7
- [ ] `TimestampTool.tsx` — Unix ↔ human, live clock
- [ ] `CronTool.tsx` — plain English, next 8 runs

**Agent:** `react-specialist` + `frontend-developer`

**Done when:** all 8 tools open in browser, work fully offline, keyboard shortcuts 1–8 work.

---

## Phase 4 — Dashboard UI (Week 3)

Goal: a beautiful real-time dashboard that replaces the need to run `ghostpath status` in terminal.

### Tasks

#### 4A — Shell + Layout
- [ ] Vite + React app in `src/dashboard/`
- [ ] Sidebar navigation: Projects / Trace / Resources / DevKit
- [ ] Dark theme (match DevKit Pro's color variables)
- [ ] WebSocket client connects to CLI's WS server on port 7071

**Agent:** `react-specialist`

#### 4B — Project Panel
- [ ] List of all registered projects
- [ ] Green/red status indicator (running / stopped)
- [ ] "Open" and "Stop" buttons that send commands via WebSocket
- [ ] Port + domain label per project

**Agent:** `react-specialist`

#### 4C — Resource Panel
- [ ] Live CPU bar (updates every 5s)
- [ ] Live RAM bar
- [ ] GPU bar (if available)
- [ ] Per-project memory usage breakdown
- [ ] GSAP animation: bars "breathe" with smooth transitions

**Agent:** `frontend-developer`

#### 4D — GSAP Animations
- [ ] Install GSAP free tier
- [ ] Animate: status indicator pulse (running projects glow)
- [ ] Animate: resource bars fill with easing
- [ ] Animate: panel transitions (slide + fade)
- [ ] Animate: "opening project" sequence (sequential steps animate in)

**Agent:** `frontend-developer`

**Done when:** `ghostpath dashboard` opens a beautiful live dashboard in browser.

---

## Phase 5 — Vault (.env Sync) (Week 4)

Goal: secure cross-device .env sharing without touching GitHub.

### Tasks

- [ ] `vault/encrypt.ts` — AES-256-GCM encryption, password-derived key via PBKDF2
- [ ] `vault/decrypt.ts` — inverse
- [ ] Provider adapters: Google Drive (gdrive), Dropbox, local filesystem
- [ ] `ghostpath sync push` — reads `.env`, encrypts, uploads to provider
- [ ] `ghostpath sync pull` — downloads, decrypts, writes `.env`
- [ ] First run: `ghostpath sync setup` asks for provider + master password (never stored)

**Agent:** `security-engineer`

**Done when:** `ghostpath sync push` from laptop 1 → `ghostpath sync pull` on laptop 2 produces identical `.env`.

---

## Phase 6 — Navigator Layer (Week 5)

Goal: GhostPath understands how your code runs, not just that it runs.

### Tasks

#### 6A — Node.js Instrumentation
- [ ] Use Node's `--require` hook to inject `navigator/hook.ts` at process start
- [ ] Hook wraps all function calls using `Proxy` and `AsyncLocalStorage`
- [ ] Each call records: function name, file, args shape, duration, caller
- [ ] Events sent to GhostPath via IPC (not HTTP — lower overhead)

**Agent:** `performance-monitor`

#### 6B — Call Graph Builder
- [ ] `call-graph.ts` receives call events and builds a directed graph (nodes = functions, edges = calls)
- [ ] Graph stored in memory, serialized to `~/.ghostpath/traces/<project>.json` periodically
- [ ] Prunes nodes not seen in last 60 seconds

**Agent:** `node-specialist`

#### 6C — Hotpath Detection
- [ ] `hotpath.ts` analyzes graph for nodes with highest call frequency
- [ ] Flags paths with average duration > 100ms as "slow"
- [ ] `ghostpath trace portfolio --hot` prints the top 10 hottest paths

**Agent:** `performance-engineer`

#### 6D — Dashboard Trace Panel
- [ ] `TracePanel.tsx` renders the call graph as an animated node graph
- [ ] Nodes are colored by call frequency (green → yellow → red)
- [ ] Click a node → see file path, average duration, call count
- [ ] GSAP animates edges flowing between nodes

**Agent:** `react-specialist`

**Done when:** `ghostpath open portfolio --trace` boots the project and the dashboard shows a live call graph.

---

## Phase 7 — Polish + Release (Week 6)

### Tasks

- [ ] Write README.md (badges, GIF demo, install instructions, quick start)
- [ ] Record terminal demo GIF using `vhs` or `terminalizer`
- [ ] Record 60-second screen capture of dashboard for social posts
- [ ] `npm publish` under package name `ghostpath`
- [ ] GitHub release with compiled binaries (pkg or nexe)
- [ ] Write `CONTRIBUTING.md`
- [ ] Write `SECURITY.md`
- [ ] Add GitHub Actions CI (test + build on every PR)
- [ ] Add issue templates (bug report, feature request)

**Agent:** `documentation-engineer` + `technical-writer` + `devops-engineer`

---

## Total Timeline

| Week | Milestone |
|---|---|
| Week 1 | `ghostpath open` works end-to-end |
| Week 2 | Resource monitor + zombie killer |
| Week 3 | DevKit panel + Dashboard shell |
| Week 4 | Vault (.env sync) |
| Week 5 | Navigator tracing |
| Week 6 | Polish + publish |

---

## How to Use Your 369 Agents Effectively

Run multiple agents in parallel for independent modules. Example workflow in Claude Code:

```
# Terminal 1 — Ghost Layer
Use agent: node-specialist
Task: Build src/ghost/orchestrator.ts and src/ghost/process-manager.ts

# Terminal 2 — DevKit UI
Use agent: react-specialist
Task: Build src/dashboard/panels/DevKitPanel.tsx with all 8 tool components

# Terminal 3 — Resource Monitor
Use agent: performance-engineer
Task: Build src/ghost/resource-monitor.ts and src/ghost/zombie-killer.ts

# Terminal 4 — Security
Use agent: security-engineer
Task: Build src/vault/encrypt.ts and src/vault/decrypt.ts
```

These four agents can run simultaneously — they touch different files and have no dependencies on each other.

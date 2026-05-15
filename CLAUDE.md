# GhostPath — CLAUDE.md (Project Intelligence File)

> This file is the single source of truth for Claude Code when working on GhostPath.
> Read this entire file before writing any code. Every architectural decision is documented here.

---
## Agent Routing

When given a task, first read this file, then automatically select and invoke 
the most relevant sub-agent from ~/.claude/agents/ based on the task type. 
Do not ask which agent to use — decide and invoke it. 
Use agents-orchestrator for multi-step tasks that span multiple modules.

## What Is GhostPath

GhostPath is a local developer operating system — a CLI + dashboard that unifies three things
no existing tool combines:

1. **Ghost Layer** — Environment orchestration. One command boots your entire project context:
   services, browser tabs, local AI models, and environment variables.

2. **Navigator Layer** — Runtime intelligence. GhostPath instruments your running project and
   builds a live call graph showing how your code actually behaves.

3. **DevKit Layer** — Offline utility panel. JSON tools, regex tester, JWT decoder, diff viewer,
   hash generator, timestamp converter, cron explainer — all embedded, all offline.

The user types `ghostpath open portfolio` and their entire world loads.

---

## Core Commands (CLI Contract — do not change these signatures)

```bash
ghostpath open <project>        # Boot a project by name
ghostpath stop <project>        # Gracefully shut down a project
ghostpath list                  # Show all registered projects + status
ghostpath add <path>            # Register a new project from a directory
ghostpath sync push             # Encrypt + upload .env to vault
ghostpath sync pull             # Download + decrypt .env from vault
ghostpath trace <project>       # Start runtime tracing for a project
ghostpath dashboard             # Open the web dashboard
ghostpath tools                 # Open DevKit panel standalone
ghostpath kill --zombie         # Auto-kill all zombie/idle processes
ghostpath status                # Show system resource overview
```

---

## Ghostfile.json Schema (per-project config)

Every project has a `Ghostfile.json` at its root. This is the contract:

```json
{
  "name": "portfolio",
  "domain": "portfolio.local",
  "port": 3000,
  "start": [
    "npm run dev",
    "npm run api"
  ],
  "open": [
    "https://notion.so/your-board",
    "https://figma.com/file/your-design"
  ],
  "models": ["llama3:8b"],
  "env": ".env.local",
  "trace": true,
  "resources": {
    "maxMemoryMB": 2048,
    "idleKillMinutes": 30
  }
}
```

---

## Architecture (three layers, one process)

```
ghostpath CLI (Node.js + Commander.js)
    │
    ├── Ghost Layer (src/ghost/)
    │   ├── orchestrator.ts      — starts/stops projects
    │   ├── proxy.ts             — local domain → port mapping (http-proxy)
    │   ├── hosts.ts             — writes/removes /etc/hosts entries
    │   ├── process-manager.ts   — spawns child processes, tracks PIDs
    │   ├── resource-monitor.ts  — CPU/RAM/GPU polling loop
    │   └── zombie-killer.ts     — detects idle processes, kills them
    │
    ├── Navigator Layer (src/navigator/)
    │   ├── instrumenter.ts      — injects tracing hooks into Node/Python
    │   ├── call-graph.ts        — builds + updates the call graph in memory
    │   ├── hotpath.ts           — detects high-frequency execution paths
    │   ├── branch-diff.ts       — compares call graphs between git branches
    │   └── query.ts             — answers "where does X come from?" queries
    │
    ├── DevKit Layer (src/devkit/)
    │   ├── server.ts            — local HTTP server for the tools panel
    │   └── tools/               — individual tool implementations
    │       ├── json.ts
    │       ├── regex.ts
    │       ├── jwt.ts
    │       ├── diff.ts
    │       ├── hash.ts
    │       ├── timestamp.ts
    │       └── cron.ts
    │
    ├── Dashboard (src/dashboard/)
    │   ├── App.tsx              — root React component
    │   ├── panels/
    │   │   ├── ProjectPanel.tsx
    │   │   ├── TracePanel.tsx
    │   │   ├── ResourcePanel.tsx
    │   │   └── DevKitPanel.tsx
    │   └── ws.ts                — WebSocket connection to CLI
    │
    └── Vault (src/vault/)
        ├── encrypt.ts           — AES-GCM encryption using crypto.subtle
        ├── decrypt.ts
        └── providers/           — Dropbox / Drive / OneDrive adapters
```

---

## Technology Stack

| Layer | Technology | Reason |
|---|---|---|
| CLI | Node.js + TypeScript | Cross-platform, fast startup |
| Commands | Commander.js | Clean, tested CLI framework |
| Output | Chalk + Ora | Color + spinner feedback |
| Proxy | http-proxy + node-http-server | Lightweight local domain routing |
| Process | child_process + pm2 (optional) | Reliable process lifecycle |
| Dashboard | Vite + React + TypeScript | Fast HMR dev experience |
| Animations | GSAP | Unique visual differentiation |
| Styling | Tailwind CSS | Utility-first, consistent |
| Real-time | WebSockets (ws package) | Live resource data to dashboard |
| Crypto | Node built-in crypto (AES-GCM) | No deps, secure |
| Tracing | Node --inspect + custom hooks | Non-invasive instrumentation |
| GPU data | nvidia-smi (spawn) | Direct query, cross-platform fallback |

---

## File Structure

```
ghostpath/
├── CLAUDE.md                  ← you are here
├── package.json
├── tsconfig.json
├── src/
│   ├── cli.ts                 ← entry point
│   ├── ghost/
│   ├── navigator/
│   ├── devkit/
│   ├── dashboard/
│   └── vault/
├── test/
│   ├── ghost.test.ts
│   ├── navigator.test.ts
│   └── devkit.test.ts
├── docs/
│   ├── ghostfile-schema.md
│   ├── cli-reference.md
│   └── architecture.md
└── examples/
    ├── nextjs-project/
    │   └── Ghostfile.json
    ├── fastapi-project/
    │   └── Ghostfile.json
    └── fullstack-project/
        └── Ghostfile.json
```

---

## Critical Rules (Claude Code must follow these at all times)

1. **Never modify /etc/hosts without explicit user confirmation.** Always prompt before writing.
2. **Never kill a process without a 5-second warning + user override option.**
3. **Never store plaintext secrets.** The vault encrypts before any write, always.
4. **The CLI must work with zero dashboard.** Dashboard is optional; CLI is the core.
5. **Every `ghostpath open` must complete within 3 seconds** before handing off to async tasks.
6. **All tracing is opt-in.** `"trace": true` in Ghostfile.json must be set explicitly.
7. **TypeScript strict mode is ON.** No `any`, no implicit returns, no unhandled promises.
8. **No external API calls at runtime** unless the user's Ghostfile explicitly configures one.
9. **All DevKit tools work 100% offline.** No CDN, no fetch, no external dependency.
10. **Dashboard WebSocket must reconnect automatically** if the CLI process restarts.

---

## Error Handling Convention

All errors must follow this pattern:

```typescript
import { GhostError } from './errors';

throw new GhostError({
  code: 'PROCESS_ALREADY_RUNNING',
  message: 'Project "portfolio" is already running on port 3000',
  hint: 'Run `ghostpath stop portfolio` first, or use --force flag',
});
```

The CLI catches `GhostError` and renders it with Chalk in a structured format. Never throw raw Error objects.

---

## Testing Requirements

- Unit tests for every function in `src/ghost/` and `src/devkit/`
- Integration test for the full `ghostpath open` → `ghostpath stop` lifecycle
- Use Vitest (not Jest) — faster, ESM-native
- Target: 80% coverage before v1.0 release

---

## MVP Scope (what ships in v0.1)

The MVP must include ALL of the following to be usable:

- `ghostpath add` — register a project
- `ghostpath open` — start processes, open browser tabs
- `ghostpath stop` — clean shutdown
- `ghostpath list` — show running projects
- Local domain proxy (e.g. `portfolio.local`)
- Basic resource monitor (CPU + RAM, no GPU yet)
- DevKit panel (all 8 tools, standalone browser UI)
- Dashboard with project list + resource bars

The MVP explicitly does NOT include:
- Vault / .env sync (v0.2)
- Navigator tracing (v0.3)
- GPU monitoring (v0.3)
- LLM model booting (v0.4)
- Branch diff comparison (v0.5)

---

## Development Setup

```bash
git clone https://github.com/shanmerchant4/ghostpath
cd ghostpath
npm install
npm run dev          # starts CLI in watch mode
npm run dashboard    # starts dashboard dev server
npm run test         # runs Vitest
npm run build        # compiles to dist/
npm link             # makes `ghostpath` available globally
```

---

## Current Status

- [ ] Project scaffold
- [ ] CLI entry point + Commander setup
- [ ] Ghost Layer: orchestrator
- [ ] Ghost Layer: proxy + hosts
- [ ] Ghost Layer: process manager
- [ ] Ghost Layer: resource monitor
- [ ] DevKit: all 8 tools
- [ ] Dashboard: basic shell
- [ ] Dashboard: WebSocket connection
- [ ] Integration tests
- [ ] README + docs
- [ ] npm publish

---

## Agent Assignments (for multi-agent builds)

When using sub-agents to parallelize work, assign as follows:

| Module | Agent to use |
|---|---|
| CLI structure | `cli-developer` |
| Ghost Layer | `node-specialist` + `backend-developer` |
| Proxy + hosts | `network-engineer` |
| Process manager | `devops-engineer` |
| Resource monitor | `performance-engineer` |
| Navigator tracing | `performance-monitor` + `debugging` |
| DevKit tools | `frontend-developer` |
| Dashboard UI | `react-specialist` + `ui-designer` |
| Dashboard animations | `frontend-developer` |
| Vault / crypto | `security-engineer` |
| Tests | `qa-expert` + `test-automator` |
| Docs | `documentation-engineer` + `technical-writer` |
| Architecture review | `architect-reviewer` |

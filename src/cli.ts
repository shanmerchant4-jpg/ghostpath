#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import open from 'open';
import express from 'express';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import {
  openProject,
  stopProject,
  listProjects,
  findProject,
  readGhostfile,
} from './ghost/orchestrator.js';
import { startProxy, stopProxy } from './ghost/proxy.js';
import { addHostEntry, removeHostEntry } from './ghost/hosts.js';
import { startMonitor, getHistory } from './ghost/resource-monitor.js';
import { startWsServer, stopWsServer } from './ghost/ws-server.js';
import { runZombieCheck, killZombies } from './ghost/zombie-killer.js';
import { GhostError } from './ghost/errors.js';
import { pushToVault, pullFromVault, getProvider } from './vault/index.js';
import { startDevKit } from './devkit/server.js';
import { getHookArgs } from './navigator/instrumenter.js';
import { createGraph } from './navigator/call-graph.js';
import { getHotPaths, formatHotPaths } from './navigator/hotpath.js';
import { getAllRunningProjects } from './ghost/process-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GHOST_DIR = path.join(os.homedir(), '.ghostpath');
const PROJECTS_PATH = path.join(GHOST_DIR, 'projects.json');
const CONFIG_PATH = path.join(GHOST_DIR, 'config.json');
const VAULT_CONFIG_PATH = path.join(GHOST_DIR, 'vault-config.json');

interface ProjectsRegistry {
  projects: Array<{ name: string; path: string }>;
}

interface GhostConfig {
  provider?: 'local' | 'drive' | 'dropbox';
}

interface VaultConfig {
  provider: 'local' | 'gdrive' | 'dropbox';
  gdrive?: { tokenPath: string };
  dropbox?: { accessToken: string };
}

// ── Error rendering ──────────────────────────────────────────────────────────

function renderError(err: unknown): void {
  if (err instanceof GhostError) {
    console.error(chalk.red.bold(`\n[${err.code}]`));
    console.error(chalk.white(err.message));
    console.error(chalk.yellow(`hint: ${err.hint}`));
  } else {
    console.error(chalk.red.bold('\n[UNKNOWN_ERROR]'));
    console.error(chalk.white(err instanceof Error ? err.message : String(err)));
  }
}

process.on('unhandledRejection', (reason: unknown) => {
  renderError(reason);
  process.exit(1);
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function asciiBar(percent: number, width = 40): string {
  const filled = Math.round((percent / 100) * width);
  return '[' + '█'.repeat(filled) + '░'.repeat(width - filled) + ']';
}

async function readConfig(): Promise<GhostConfig> {
  try {
    const raw = await fs.readFile(CONFIG_PATH, 'utf-8');
    return JSON.parse(raw) as GhostConfig;
  } catch {
    return {};
  }
}

async function readVaultConfig(): Promise<VaultConfig> {
  try {
    const raw = await fs.readFile(VAULT_CONFIG_PATH, 'utf-8');
    return JSON.parse(raw) as VaultConfig;
  } catch {
    // Fall back to legacy config.json provider field.
    const legacy = await readConfig();
    return { provider: legacy.provider === 'drive' ? 'gdrive' : (legacy.provider ?? 'local') };
  }
}

function vaultProviderName(config: VaultConfig): 'local' | 'drive' | 'dropbox' {
  if (config.provider === 'gdrive') return 'drive';
  return config.provider;
}

// ── CLI definition ───────────────────────────────────────────────────────────

const program = new Command();

program
  .name('ghostpath')
  .description('Local developer OS — one command boots your entire project')
  .version('0.1.0');

// ── ghostpath add <path> ─────────────────────────────────────────────────────

program
  .command('add <path>')
  .description('Register a project from a directory')
  .action(async (inputPath: string) => {
    try {
      const resolvedPath = path.resolve(inputPath);
      const ghostfile = await readGhostfile(resolvedPath);

      await fs.mkdir(GHOST_DIR, { recursive: true });

      let registry: ProjectsRegistry = { projects: [] };
      try {
        const raw = await fs.readFile(PROJECTS_PATH, 'utf-8');
        registry = JSON.parse(raw) as ProjectsRegistry;
      } catch {
        // fresh registry — start empty
      }

      const existingIdx = registry.projects.findIndex((p) => p.name === ghostfile.name);
      if (existingIdx !== -1) {
        // Bug fix: inquirer.prompt hangs in non-TTY mode (piped/background stdin).
        // Auto-decline the overwrite to preserve existing registration.
        let confirmed: boolean;
        if (!process.stdin.isTTY) {
          console.log(
            chalk.yellow(
              `Project "${ghostfile.name}" is already registered (non-interactive: skipping overwrite).`,
            ),
          );
          confirmed = false;
        } else {
          const answer = await inquirer.prompt<{ confirmed: boolean }>([
            {
              type: 'confirm',
              name: 'confirmed',
              message: `Project "${ghostfile.name}" is already registered. Overwrite?`,
              default: false,
            },
          ]);
          confirmed = answer.confirmed;
        }
        if (!confirmed) {
          console.log(chalk.yellow('Aborted.'));
          return;
        }
        registry.projects.splice(existingIdx, 1);
      }

      registry.projects.push({ name: ghostfile.name, path: resolvedPath });
      await fs.writeFile(PROJECTS_PATH, JSON.stringify(registry, null, 2), 'utf-8');

      console.log(chalk.green(`✓ Project "${ghostfile.name}" registered from ${resolvedPath}`));
    } catch (err) {
      renderError(err);
      process.exit(1);
    }
  });

// ── ghostpath open <project> ─────────────────────────────────────────────────

program
  .command('open <project>')
  .description('Boot a project by name')
  .action(async (project: string) => {
    const spinner = ora(`Booting ${chalk.cyan(project)}...`).start();

    try {
      // Read Ghostfile first to know domain/port/trace before spawning.
      const entry = await findProject(project);
      const ghostfile = await readGhostfile(entry.path);
      const { domain, port } = ghostfile;
      const tabCount = (ghostfile.open ?? []).length;

      // Hosts prompt must happen before processes start (CLAUDE.md rule #1).
      if (domain !== undefined) {
        spinner.stop();
        await addHostEntry(domain);
        spinner.start();
      }

      // Build hook args if the Ghostfile opts into tracing (CLAUDE.md rule #6).
      const hookArgs = ghostfile.trace === true ? getHookArgs(project) : [];

      // Spawn processes — this is the critical 3-second window (CLAUDE.md rule #5).
      const result = await openProject(project, { hookArgs });

      // In-process setup — fault-isolated: each layer runs independently.
      // If one fails it logs a warning but the project processes continue (CLAUDE.md rule #5).
      try {
        startMonitor();
      } catch (err) {
        // MONITOR_ALREADY_RUNNING is normal when a second project opens in the same process.
        console.warn(chalk.yellow(`  [warn] resource monitor: ${err instanceof Error ? err.message : String(err)}`));
      }

      try {
        startWsServer();
      } catch (err) {
        console.warn(chalk.yellow(`  [warn] WebSocket server: ${err instanceof Error ? err.message : String(err)}`));
      }

      if (domain !== undefined && port !== undefined) {
        try {
          await startProxy(domain, port);
        } catch (err) {
          console.warn(chalk.yellow(`  [warn] proxy ${domain}→${port}: ${err instanceof Error ? err.message : String(err)}`));
        }
      }

      spinner.succeed(chalk.green.bold(`${result.projectName} is running`));

      if (domain !== undefined) {
        console.log(`  ${chalk.dim('domain')}  ${chalk.cyan(domain)}`);
      }
      if (port !== undefined) {
        console.log(`  ${chalk.dim('port')}    ${chalk.cyan(String(port))}`);
      }
      console.log(`  ${chalk.dim('pids')}    ${chalk.cyan(result.pids.join(', '))}`);
      console.log(`  ${chalk.dim('cmds')}    ${chalk.cyan(String(result.commandCount))}`);
      if (tabCount > 0) {
        console.log(`  ${chalk.dim('tabs')}    ${chalk.cyan(String(tabCount))} opening...`);
      }
      if (ghostfile.trace === true) {
        console.log(`  ${chalk.dim('trace')}   ${chalk.magenta('enabled')}`);
      }

      // Bug fix: startMonitor() (setInterval) and startWsServer() (WS server) keep
      // this process alive indefinitely. `ghostpath open` must exit within 3 seconds
      // (CLAUDE.md rule #5) — child processes are detached+unref'd and continue running
      // independently. The dashboard command owns the long-lived monitor/WS lifecycle.
      process.exit(0);
    } catch (err) {
      spinner.fail('Failed to boot project');
      renderError(err);
      process.exit(1);
    }
  });

// ── ghostpath stop <project> ─────────────────────────────────────────────────

program
  .command('stop <project>')
  .description('Gracefully shut down a project')
  .action(async (project: string) => {
    try {
      // Read domain before stopping so we can clean up proxy and hosts.
      let domain: string | undefined;
      try {
        const entry = await findProject(project);
        const ghostfile = await readGhostfile(entry.path);
        domain = ghostfile.domain;
      } catch {
        // Non-fatal — stop will still terminate tracked PIDs.
      }

      // stopProject enforces the 5-second countdown (CLAUDE.md rule #2).
      await stopProject(project);

      if (domain !== undefined) {
        // Proxy may not be running in this process — catch PROXY_NOT_FOUND silently.
        await stopProxy(domain).catch(() => undefined);
        await removeHostEntry(domain);
      }

      const running = await getAllRunningProjects();
      if (running.length === 0) {
        stopWsServer();
      }

      console.log(chalk.green(`✓ Project "${project}" stopped`));
    } catch (err) {
      renderError(err);
      process.exit(1);
    }
  });

// ── ghostpath list ───────────────────────────────────────────────────────────

program
  .command('list')
  .description('List all registered projects and their status')
  .action(async () => {
    try {
      const projects = await listProjects();

      if (projects.length === 0) {
        console.log(chalk.dim('No projects registered. Run `ghostpath add <path>` to get started.'));
        return;
      }

      const W = { name: 20, domain: 26, port: 8 };
      const header =
        chalk.bold.white('Name'.padEnd(W.name)) +
        chalk.bold.white('Domain'.padEnd(W.domain)) +
        chalk.bold.white('Port'.padEnd(W.port)) +
        chalk.bold.white('Status');
      const divider = chalk.dim('─'.repeat(W.name + W.domain + W.port + 10));

      console.log(header);
      console.log(divider);

      for (const p of projects) {
        const status = p.running ? chalk.green('running') : chalk.red('stopped');
        console.log(
          p.name.slice(0, W.name - 1).padEnd(W.name) +
            chalk.dim((p.domain ?? '—').slice(0, W.domain - 1).padEnd(W.domain)) +
            chalk.dim((p.port !== undefined ? String(p.port) : '—').padEnd(W.port)) +
            status,
        );
      }
    } catch (err) {
      renderError(err);
      process.exit(1);
    }
  });

// ── ghostpath status ─────────────────────────────────────────────────────────

program
  .command('status')
  .description('Show system resource overview')
  .action(async () => {
    let cpuPercent: number;
    let ramUsedMB: number;
    let ramTotalMB: number;

    // Use in-process history when the monitor is already running (e.g. during open).
    const history = getHistory();
    const latest = history.at(-1);

    if (latest !== undefined) {
      cpuPercent = latest.cpuPercent;
      ramUsedMB = latest.ramUsedMB;
      ramTotalMB = latest.ramTotalMB;
    } else {
      // Fresh process — take a direct 1-second CPU delta sample.
      const spinner = ora('Sampling system resources...').start();

      const t0 = os.cpus().map((c) => ({
        idle: c.times.idle,
        total: c.times.user + c.times.nice + c.times.sys + c.times.idle + c.times.irq,
      }));

      await new Promise<void>((resolve) => setTimeout(resolve, 1000));

      const t1 = os.cpus().map((c) => ({
        idle: c.times.idle,
        total: c.times.user + c.times.nice + c.times.sys + c.times.idle + c.times.irq,
      }));

      let idleDelta = 0;
      let totalDelta = 0;
      for (let i = 0; i < t0.length; i++) {
        idleDelta += (t1[i]?.idle ?? 0) - (t0[i]?.idle ?? 0);
        totalDelta += (t1[i]?.total ?? 0) - (t0[i]?.total ?? 0);
      }

      cpuPercent = totalDelta === 0 ? 0 : Math.round((1 - idleDelta / totalDelta) * 1000) / 10;
      const totalMem = os.totalmem();
      ramUsedMB = Math.round((totalMem - os.freemem()) / 1024 / 1024);
      ramTotalMB = Math.round(totalMem / 1024 / 1024);

      spinner.stop();
    }

    const ramPercent = ramTotalMB === 0 ? 0 : (ramUsedMB / ramTotalMB) * 100;
    const cpuColor = cpuPercent > 85 ? chalk.red : cpuPercent > 60 ? chalk.yellow : chalk.green;
    const ramColor = ramPercent > 90 ? chalk.red : ramPercent > 70 ? chalk.yellow : chalk.green;

    console.log(chalk.bold.white('\nSystem Resources'));
    console.log(chalk.dim('─'.repeat(54)));
    console.log(`CPU  ${cpuColor(asciiBar(cpuPercent))} ${cpuColor(cpuPercent.toFixed(1) + '%')}`);
    console.log(
      `RAM  ${ramColor(asciiBar(ramPercent))} ${ramColor(`${ramUsedMB} MB / ${ramTotalMB} MB`)}`,
    );
    console.log();

    process.exit(0);
  });

// ── ghostpath kill --zombie ──────────────────────────────────────────────────

program
  .command('kill')
  .description('Kill idle GhostPath-managed processes')
  .option('--zombie', 'Target idle processes exceeding the idle threshold')
  .option('--auto', 'Kill without prompting (shows a 5-second countdown instead)')
  .action(async (opts: { zombie?: boolean; auto?: boolean }) => {
    if (!opts.zombie) {
      console.log(chalk.yellow('Usage: ghostpath kill --zombie [--auto]'));
      return;
    }

    try {
      const spinner = ora('Scanning for zombie processes...').start();
      const pids = await runZombieCheck(30);
      spinner.stop();

      if (pids.length === 0) {
        console.log(chalk.green('No zombie processes found.'));
        return;
      }

      await killZombies(pids, opts.auto ?? false);
      console.log(chalk.green(`✓ Killed ${pids.length} process(es): ${pids.join(', ')}`));
    } catch (err) {
      renderError(err);
      process.exit(1);
    }
  });

// ── ghostpath sync push / pull ───────────────────────────────────────────────

const sync = program.command('sync').description('Encrypt and sync .env via vault');

sync
  .command('push')
  .description('Encrypt and upload .env to vault')
  .action(async () => {
    try {
      const ghostfile = await readGhostfile(process.cwd());
      const envPath = path.join(process.cwd(), ghostfile.env ?? '.env');

      // Bug fix: inquirer.prompt hangs in non-TTY mode; password entry requires interactive terminal.
      if (!process.stdin.isTTY) {
        throw new GhostError({
          code: 'NON_INTERACTIVE',
          message: 'sync push requires an interactive terminal for password entry',
          hint: 'Run this command in an interactive terminal session',
        });
      }

      const { password } = await inquirer.prompt<{ password: string }>([
        {
          type: 'password',
          name: 'password',
          message: 'Master password:',
          mask: '*',
        },
      ]);

      const vaultConfig = await readVaultConfig();
      const provider = getProvider(vaultProviderName(vaultConfig));

      const spinner = ora('Encrypting and uploading...').start();
      await pushToVault(ghostfile.name, envPath, password, provider);
      spinner.succeed(`Vault pushed for "${ghostfile.name}"`);
    } catch (err) {
      renderError(err);
      process.exit(1);
    }
  });

sync
  .command('pull')
  .description('Download and decrypt .env from vault')
  .action(async () => {
    try {
      const ghostfile = await readGhostfile(process.cwd());
      const envPath = path.join(process.cwd(), ghostfile.env ?? '.env');

      // Bug fix: inquirer.prompt hangs in non-TTY mode; password entry requires interactive terminal.
      if (!process.stdin.isTTY) {
        throw new GhostError({
          code: 'NON_INTERACTIVE',
          message: 'sync pull requires an interactive terminal for password entry',
          hint: 'Run this command in an interactive terminal session',
        });
      }

      const { password } = await inquirer.prompt<{ password: string }>([
        {
          type: 'password',
          name: 'password',
          message: 'Master password:',
          mask: '*',
        },
      ]);

      const vaultConfig = await readVaultConfig();
      const provider = getProvider(vaultProviderName(vaultConfig));

      const spinner = ora('Downloading and decrypting...').start();
      await pullFromVault(ghostfile.name, envPath, password, provider);
      spinner.succeed(`Vault pulled for "${ghostfile.name}" → ${envPath}`);
    } catch (err) {
      renderError(err);
      process.exit(1);
    }
  });

sync
  .command('setup')
  .description('Configure vault provider for .env sync')
  .action(async () => {
    try {
      if (!process.stdin.isTTY) {
        throw new GhostError({
          code: 'NON_INTERACTIVE',
          message: 'sync setup requires an interactive terminal',
          hint: 'Run this command in an interactive terminal session',
        });
      }

      const { provider } = await inquirer.prompt<{ provider: VaultConfig['provider'] }>([
        {
          type: 'list',
          name: 'provider',
          message: 'Select vault provider:',
          choices: [
            { name: 'Local filesystem', value: 'local' },
            { name: 'Google Drive', value: 'gdrive' },
            { name: 'Dropbox', value: 'dropbox' },
          ],
        },
      ]);

      const config: VaultConfig = { provider };

      if (provider === 'gdrive') {
        const { tokenPath } = await inquirer.prompt<{ tokenPath: string }>([
          {
            type: 'input',
            name: 'tokenPath',
            message: 'Path to Google credentials JSON file:',
            default: path.join(GHOST_DIR, 'gdrive-credentials.json'),
          },
        ]);
        config.gdrive = { tokenPath };
      } else if (provider === 'dropbox') {
        const { accessToken } = await inquirer.prompt<{ accessToken: string }>([
          {
            type: 'password',
            name: 'accessToken',
            message: 'Dropbox access token:',
            mask: '*',
          },
        ]);
        config.dropbox = { accessToken };
      }

      await fs.mkdir(GHOST_DIR, { recursive: true });
      await fs.writeFile(VAULT_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');

      console.log(chalk.green(`✓ Vault configured: ${chalk.cyan(provider)}`));
      console.log(chalk.dim(`  Saved to ${VAULT_CONFIG_PATH}`));
      console.log(chalk.dim('\nNext step: Run ghostpath sync push from a project with a .env file'));
    } catch (err) {
      renderError(err);
      process.exit(1);
    }
  });

// ── ghostpath dashboard ──────────────────────────────────────────────────────

program
  .command('dashboard')
  .description('Open the web dashboard')
  .action(async () => {
    // Keep WS server alive so the dashboard can connect.
    startWsServer();

    // Look for the built Vite output. When running via `tsx src/cli.ts` (dev),
    // __dirname is .../src. When running from dist/, it is .../dist.
    const distCandidates = [
      path.join(__dirname, 'dashboard', 'dist'),
      path.join(__dirname, '..', 'src', 'dashboard', 'dist'),
    ];

    let distPath: string | null = null;
    for (const candidate of distCandidates) {
      try {
        await fs.access(candidate);
        distPath = candidate;
        break;
      } catch {
        // try next candidate
      }
    }

    if (distPath === null) {
      console.log(chalk.yellow('Dashboard has not been built yet.'));
      console.log(chalk.dim('  Run `npm run dashboard` to start the Vite dev server.'));
      console.log(chalk.dim('  Or run `npm run build` first, then `ghostpath dashboard`.'));
      return;
    }

    const DASHBOARD_PORT = 7072;
    const app = express();
    app.use(express.static(distPath));

    const server = createServer(app);

    server.on('error', (err: NodeJS.ErrnoException) => {
      renderError(
        new GhostError({
          code: 'DASHBOARD_START_FAILED',
          message: `Dashboard server failed on port ${DASHBOARD_PORT}: ${err.message}`,
          hint:
            err.code === 'EADDRINUSE'
              ? `Port ${DASHBOARD_PORT} is already in use. Stop the conflicting process.`
              : 'Check system logs for details.',
        }),
      );
      process.exit(1);
    });

    server.listen(DASHBOARD_PORT, () => {
      const url = `http://localhost:${DASHBOARD_PORT}`;
      console.log(chalk.green(`Dashboard running at ${chalk.cyan(url)}`));
      void open(url);
    });
  });

// ── ghostpath tools ──────────────────────────────────────────────────────────

program
  .command('tools')
  .description('Open DevKit panel standalone')
  .action(async () => {
    try {
      await startDevKit();
      const url = 'http://localhost:7070';
      console.log(chalk.green(`DevKit running at ${chalk.cyan(url)}`));
      await open(url);
    } catch (err) {
      renderError(err);
      process.exit(1);
    }
  });

// ── ghostpath trace <project> ────────────────────────────────────────────────

program
  .command('trace <project>')
  .description('Start runtime tracing for a project')
  .action(async (project: string) => {
    const hookArgs = getHookArgs(project);

    try {
      await openProject(project, { hookArgs });
    } catch (err) {
      if (err instanceof GhostError && err.code === 'PROJECT_ALREADY_RUNNING') {
        console.log(chalk.yellow(`"${project}" is already running — attaching tracer.\n`));
      } else {
        renderError(err);
        process.exit(1);
        return;
      }
    }

    // In-memory call graph — populated via IPC when child processes emit ghost:call events.
    const graph = createGraph();
    let active = true;

    console.log(chalk.magenta.bold(`\nGhostPath Tracer — ${project}`));
    console.log(chalk.dim('Press Ctrl+C to stop.\n'));

    const tick = setInterval(() => {
      // Clear screen and reprint — \x1B[2J clears, \x1B[H moves cursor home.
      process.stdout.write('\x1B[2J\x1B[H');
      console.log(chalk.magenta.bold(`GhostPath Tracer — ${project}`));
      console.log(
        chalk.dim(`Updated: ${new Date().toLocaleTimeString()}  |  Press Ctrl+C to stop\n`),
      );
      console.log(formatHotPaths(getHotPaths(graph, 10)));
    }, 2000);

    process.on('SIGINT', () => {
      if (!active) return;
      active = false;
      clearInterval(tick);
      console.log(chalk.dim('\nStopping trace...'));
      void stopProject(project, { skipCountdown: true })
        .catch(() => undefined)
        .finally(() => process.exit(0));
    });
  });

program.parse();

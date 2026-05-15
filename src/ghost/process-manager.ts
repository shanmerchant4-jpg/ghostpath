import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline';
import { GhostError } from './errors.js';

const GHOST_DIR = path.join(os.homedir(), '.ghostpath');
const STATE_PATH = path.join(GHOST_DIR, 'state.json');
const LOG_DIR = path.join(GHOST_DIR, 'logs');

export interface ProcessState {
  pids: number[];
  startedAt: string;
  cwd: string;
  commands: string[];
}

interface StateFile {
  projects: Record<string, ProcessState>;
}

async function ensureDirs(): Promise<void> {
  await fs.mkdir(GHOST_DIR, { recursive: true });
  await fs.mkdir(LOG_DIR, { recursive: true });
}

async function loadState(): Promise<StateFile> {
  await ensureDirs();
  try {
    const raw = await fs.readFile(STATE_PATH, 'utf-8');
    return JSON.parse(raw) as StateFile;
  } catch {
    return { projects: {} };
  }
}

async function saveState(state: StateFile): Promise<void> {
  await ensureDirs();
  await fs.writeFile(STATE_PATH, JSON.stringify(state, null, 2), 'utf-8');
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// Prints a 5-second countdown. Rejects with GhostError if the user presses Ctrl+C.
async function countdown(projectName: string, seconds: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let remaining = seconds;

    process.stdout.write(
      `\nStopping "${projectName}" in ${remaining}s. Press Ctrl+C to cancel.\n`,
    );

    const rl = readline.createInterface({ input: process.stdin });

    rl.on('SIGINT', () => {
      clearInterval(ticker);
      rl.close();
      reject(
        new GhostError({
          code: 'STOP_CANCELLED',
          message: `Stop cancelled for project "${projectName}"`,
          hint: 'Project is still running',
        }),
      );
    });

    const ticker = setInterval(() => {
      remaining--;
      if (remaining > 0) {
        process.stdout.write(`  ${remaining}...\n`);
      } else {
        clearInterval(ticker);
        rl.close();
        resolve();
      }
    }, 1000);
  });
}

export async function spawnCommands(
  projectName: string,
  commands: string[],
  cwd: string,
  envVars: Record<string, string> = {},
): Promise<number[]> {
  await ensureDirs();

  if (commands.length === 0) {
    throw new GhostError({
      code: 'NO_COMMANDS',
      message: `No commands provided for project "${projectName}"`,
      hint: 'Add commands to the "start" array in your Ghostfile.json',
    });
  }

  const pids: number[] = [];
  const timestamp = Date.now();

  for (const [i, command] of commands.entries()) {
    const logPath = path.join(LOG_DIR, `${projectName}-${i}-${timestamp}.log`);
    const logHandle = await fs.open(logPath, 'a');

    const child = spawn(command, {
      cwd,
      shell: true,
      detached: true,
      stdio: ['ignore', logHandle.fd, logHandle.fd],
      env: { ...process.env, ...envVars },
    });

    // Parent fd can be closed immediately; child has its own copy
    await logHandle.close();

    if (child.pid === undefined) {
      throw new GhostError({
        code: 'SPAWN_FAILED',
        message: `Failed to spawn command: "${command}"`,
        hint: 'Verify the command exists and the project path is correct',
      });
    }

    child.unref();
    pids.push(child.pid);
  }

  const state = await loadState();
  state.projects[projectName] = {
    pids,
    startedAt: new Date().toISOString(),
    cwd,
    commands,
  };
  await saveState(state);

  return pids;
}

export async function stopProject(
  projectName: string,
  options?: { skipCountdown?: boolean },
): Promise<void> {
  const state = await loadState();
  const entry = state.projects[projectName];

  if (!entry) {
    throw new GhostError({
      code: 'PROJECT_NOT_RUNNING',
      message: `Project "${projectName}" is not running`,
      hint: 'Run `ghostpath list` to see running projects',
    });
  }

  const alivePids = entry.pids.filter(isPidAlive);

  if (alivePids.length === 0) {
    delete state.projects[projectName];
    await saveState(state);
    return;
  }

  if (options?.skipCountdown !== true) {
    await countdown(projectName, 5);
  }

  for (const pid of alivePids) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // PID may have exited between the alive check and the signal
    }
  }

  // Wait up to 10s for graceful shutdown, then force SIGKILL
  await new Promise<void>((resolve) => {
    const deadline = Date.now() + 10_000;

    const check = setInterval(() => {
      const stillAlive = alivePids.filter(isPidAlive);

      if (stillAlive.length === 0 || Date.now() >= deadline) {
        clearInterval(check);

        for (const pid of stillAlive) {
          try {
            process.kill(pid, 'SIGKILL');
          } catch {
            // already dead
          }
        }

        resolve();
      }
    }, 500);
  });

  delete state.projects[projectName];
  await saveState(state);
}

export async function isProjectRunning(projectName: string): Promise<boolean> {
  const state = await loadState();
  const entry = state.projects[projectName];
  if (!entry) return false;
  return entry.pids.some(isPidAlive);
}

export async function getProjectState(projectName: string): Promise<ProcessState | null> {
  const state = await loadState();
  return state.projects[projectName] ?? null;
}

export async function getAllRunningProjects(): Promise<string[]> {
  const state = await loadState();
  const running: string[] = [];
  for (const [name, entry] of Object.entries(state.projects)) {
    if (entry.pids.some(isPidAlive)) {
      running.push(name);
    }
  }
  return running;
}

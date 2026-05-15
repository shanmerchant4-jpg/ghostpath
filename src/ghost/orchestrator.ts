import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import open from 'open';
import { GhostError } from './errors.js';
import {
  spawnCommands,
  stopProject as pmStopProject,
  isProjectRunning,
} from './process-manager.js';

const GHOST_DIR = path.join(os.homedir(), '.ghostpath');
const PROJECTS_PATH = path.join(GHOST_DIR, 'projects.json');

export interface ProjectEntry {
  name: string;
  path: string;
}

interface ProjectsRegistry {
  projects: ProjectEntry[];
}

export interface Ghostfile {
  name: string;
  start: string[];
  domain?: string;
  port?: number;
  open?: string[];
  models?: string[];
  env?: string;
  trace?: boolean;
  resources?: {
    maxMemoryMB?: number;
    idleKillMinutes?: number;
  };
}

export interface OpenResult {
  projectName: string;
  pids: number[];
  commandCount: number;
}

export interface OpenOptions {
  hookArgs?: string[];
}

async function loadProjectsRegistry(): Promise<ProjectsRegistry> {
  try {
    const raw = await fs.readFile(PROJECTS_PATH, 'utf-8');
    return JSON.parse(raw) as ProjectsRegistry;
  } catch {
    throw new GhostError({
      code: 'NO_PROJECTS_REGISTRY',
      message: 'No projects registry found at ~/.ghostpath/projects.json',
      hint: 'Run `ghostpath add <path>` to register a project first',
    });
  }
}

export async function findProject(name: string): Promise<ProjectEntry> {
  const registry = await loadProjectsRegistry();
  const entry = registry.projects.find((p) => p.name === name);
  if (!entry) {
    throw new GhostError({
      code: 'PROJECT_NOT_FOUND',
      message: `Project "${name}" not found`,
      hint: `Run \`ghostpath add <path>\` to register it, or check \`ghostpath list\``,
    });
  }
  return entry;
}

export async function readGhostfile(projectPath: string): Promise<Ghostfile> {
  const ghostfilePath = path.join(projectPath, 'Ghostfile.json');

  let raw: string;
  try {
    raw = await fs.readFile(ghostfilePath, 'utf-8');
  } catch {
    throw new GhostError({
      code: 'GHOSTFILE_NOT_FOUND',
      message: `No Ghostfile.json found in ${projectPath}`,
      hint: 'Create a Ghostfile.json at the project root. See docs/ghostfile-schema.md.',
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new GhostError({
      code: 'GHOSTFILE_INVALID_JSON',
      message: `Ghostfile.json at ${ghostfilePath} contains invalid JSON`,
      hint: 'Check the file for syntax errors',
    });
  }

  assertGhostfile(parsed, ghostfilePath);
  return parsed;
}

function assertGhostfile(value: unknown, filePath: string): asserts value is Ghostfile {
  if (typeof value !== 'object' || value === null) {
    throw new GhostError({
      code: 'INVALID_GHOSTFILE',
      message: `Ghostfile.json at ${filePath} must be a JSON object`,
      hint: 'See docs/ghostfile-schema.md for the correct format',
    });
  }

  const obj = value as Record<string, unknown>;

  if (typeof obj['name'] !== 'string' || obj['name'].trim() === '') {
    throw new GhostError({
      code: 'INVALID_GHOSTFILE',
      message: 'Ghostfile.json is missing a valid "name" field',
      hint: 'Add `"name": "your-project-name"` to your Ghostfile.json',
    });
  }

  if (!Array.isArray(obj['start'])) {
    throw new GhostError({
      code: 'INVALID_GHOSTFILE',
      message: 'Ghostfile.json is missing the "start" array',
      hint: 'Add `"start": ["npm run dev"]` to your Ghostfile.json',
    });
  }
}

// Parses a .env file into key/value pairs. Returns {} if the file doesn't exist.
async function parseEnvFile(
  projectPath: string,
  envFile: string,
): Promise<Record<string, string>> {
  const envPath = path.join(projectPath, envFile);
  let content: string;
  try {
    content = await fs.readFile(envPath, 'utf-8');
  } catch {
    return {};
  }

  const env: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const rawVal = trimmed.slice(eqIdx + 1).trim();
    env[key] = rawVal.replace(/^["']|["']$/g, '');
  }
  return env;
}

export async function openProject(name: string, options?: OpenOptions): Promise<OpenResult> {
  const entry = await findProject(name);

  if (await isProjectRunning(name)) {
    throw new GhostError({
      code: 'PROJECT_ALREADY_RUNNING',
      message: `Project "${name}" is already running`,
      hint: `Run \`ghostpath stop ${name}\` first`,
    });
  }

  const ghostfile = await readGhostfile(entry.path);

  if (ghostfile.start.length === 0) {
    throw new GhostError({
      code: 'NO_START_COMMANDS',
      message: `Project "${name}" has no start commands defined`,
      hint: 'Add commands to the "start" array in your Ghostfile.json',
    });
  }

  const envVars = await parseEnvFile(entry.path, ghostfile.env ?? '.env');

  // Inject tracing hook into child processes via NODE_OPTIONS
  const hookArgs = options?.hookArgs ?? [];
  if (hookArgs.length > 0) {
    const existing = Object.prototype.hasOwnProperty.call(envVars, 'NODE_OPTIONS')
      ? envVars['NODE_OPTIONS']
      : '';
    envVars['NODE_OPTIONS'] = `${existing ?? ''} ${hookArgs.join(' ')}`.trim();
  }

  const pids = await spawnCommands(name, ghostfile.start, entry.path, envVars);

  // Open browser tabs in the background — not part of the 3-second boot window
  for (const url of ghostfile.open ?? []) {
    void open(url);
  }

  return {
    projectName: name,
    pids,
    commandCount: ghostfile.start.length,
  };
}

export async function stopProject(
  name: string,
  options?: { skipCountdown?: boolean },
): Promise<void> {
  // Verify the project is registered before attempting stop
  await findProject(name);
  await pmStopProject(name, options);
}

export interface ProjectWithStatus extends ProjectEntry {
  domain?: string;
  port?: number;
  running: boolean;
}

export async function listProjects(): Promise<ProjectWithStatus[]> {
  let registry: { projects: ProjectEntry[] };
  try {
    const raw = await fs.readFile(PROJECTS_PATH, 'utf-8');
    registry = JSON.parse(raw) as { projects: ProjectEntry[] };
  } catch {
    return [];
  }

  const result: ProjectWithStatus[] = [];
  for (const entry of registry.projects) {
    const running = await isProjectRunning(entry.name);
    let domain: string | undefined;
    let port: number | undefined;
    try {
      const gf = await readGhostfile(entry.path);
      domain = gf.domain;
      port = gf.port;
    } catch {
      // ghostfile may not be readable; skip optional fields
    }
    result.push({ ...entry, running, domain, port });
  }
  return result;
}

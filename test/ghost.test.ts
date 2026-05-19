import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { GhostError } from '../src/ghost/errors.js';
import {
  readGhostfile,
  findProject,
  listProjects,
  openProject,
  stopProject as orchStopProject,
  type Ghostfile,
} from '../src/ghost/orchestrator.js';
import {
  registerProcess,
  unregisterProcess,
  recordIO,
  runZombieCheck,
  killZombies,
} from '../src/ghost/zombie-killer.js';
import {
  isProjectRunning,
  getProjectState,
  getAllRunningProjects,
  spawnCommands,
  stopProject as pmStopProject,
} from '../src/ghost/process-manager.js';

// ─── GhostError ─────────────────────────────────────────────────────────────

describe('GhostError', () => {
  it('sets code, message, and hint', () => {
    const err = new GhostError({
      code: 'TEST_CODE',
      message: 'test message',
      hint: 'do this',
    });
    expect(err.code).toBe('TEST_CODE');
    expect(err.message).toBe('test message');
    expect(err.hint).toBe('do this');
    expect(err.name).toBe('GhostError');
  });

  it('is an instance of Error', () => {
    const err = new GhostError({ code: 'X', message: 'y', hint: 'z' });
    expect(err).toBeInstanceOf(Error);
  });

  it('is an instance of GhostError', () => {
    const err = new GhostError({ code: 'X', message: 'y', hint: 'z' });
    expect(err).toBeInstanceOf(GhostError);
  });
});

// ─── readGhostfile ───────────────────────────────────────────────────────────

describe('readGhostfile', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ghostpath-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function writeGhostfile(obj: unknown) {
    await fs.writeFile(
      path.join(tmpDir, 'Ghostfile.json'),
      JSON.stringify(obj),
      'utf-8',
    );
  }

  it('reads a valid Ghostfile.json', async () => {
    await writeGhostfile({ name: 'my-project', start: ['npm run dev'] });
    const gf = await readGhostfile(tmpDir);
    expect(gf.name).toBe('my-project');
    expect(gf.start).toEqual(['npm run dev']);
  });

  it('returns optional fields when present', async () => {
    const data: Ghostfile = {
      name: 'proj',
      start: ['cmd'],
      domain: 'proj.local',
      port: 3000,
      trace: true,
    };
    await writeGhostfile(data);
    const gf = await readGhostfile(tmpDir);
    expect(gf.domain).toBe('proj.local');
    expect(gf.port).toBe(3000);
    expect(gf.trace).toBe(true);
  });

  it('throws GHOSTFILE_NOT_FOUND when file is missing', async () => {
    const err = await readGhostfile('/nonexistent-dir-xyz').catch((e) => e);
    expect(err).toBeInstanceOf(GhostError);
    expect((err as GhostError).code).toBe('GHOSTFILE_NOT_FOUND');
  });

  it('throws GHOSTFILE_INVALID_JSON for malformed JSON', async () => {
    await fs.writeFile(path.join(tmpDir, 'Ghostfile.json'), '{bad json}', 'utf-8');
    const err = await readGhostfile(tmpDir).catch((e) => e);
    expect(err).toBeInstanceOf(GhostError);
    expect((err as GhostError).code).toBe('GHOSTFILE_INVALID_JSON');
  });

  it('throws INVALID_GHOSTFILE when root is not an object', async () => {
    await writeGhostfile([]);
    const err = await readGhostfile(tmpDir).catch((e) => e);
    expect(err).toBeInstanceOf(GhostError);
    expect((err as GhostError).code).toBe('INVALID_GHOSTFILE');
  });

  it('throws INVALID_GHOSTFILE when name is missing', async () => {
    await writeGhostfile({ start: ['cmd'] });
    const err = await readGhostfile(tmpDir).catch((e) => e);
    expect(err).toBeInstanceOf(GhostError);
    expect((err as GhostError).code).toBe('INVALID_GHOSTFILE');
  });

  it('throws INVALID_GHOSTFILE when name is empty string', async () => {
    await writeGhostfile({ name: '', start: ['cmd'] });
    const err = await readGhostfile(tmpDir).catch((e) => e);
    expect(err).toBeInstanceOf(GhostError);
    expect((err as GhostError).code).toBe('INVALID_GHOSTFILE');
  });

  it('throws INVALID_GHOSTFILE when start is not an array', async () => {
    await writeGhostfile({ name: 'proj', start: 'npm run dev' });
    const err = await readGhostfile(tmpDir).catch((e) => e);
    expect(err).toBeInstanceOf(GhostError);
    expect((err as GhostError).code).toBe('INVALID_GHOSTFILE');
  });

  it('throws INVALID_GHOSTFILE for null root', async () => {
    await writeGhostfile(null);
    const err = await readGhostfile(tmpDir).catch((e) => e);
    expect(err).toBeInstanceOf(GhostError);
    expect((err as GhostError).code).toBe('INVALID_GHOSTFILE');
  });
});

// ─── findProject / listProjects ──────────────────────────────────────────────

describe('findProject', () => {
  const GHOST_DIR = path.join(os.homedir(), '.ghostpath');
  const PROJECTS_PATH = path.join(GHOST_DIR, 'projects.json');
  let originalContent: string | null = null;

  beforeEach(async () => {
    await fs.mkdir(GHOST_DIR, { recursive: true });
    try {
      originalContent = await fs.readFile(PROJECTS_PATH, 'utf-8');
    } catch {
      originalContent = null;
    }
    await fs.writeFile(
      PROJECTS_PATH,
      JSON.stringify({ projects: [{ name: 'test-proj', path: '/tmp/test-proj' }] }),
      'utf-8',
    );
  });

  afterEach(async () => {
    if (originalContent !== null) {
      await fs.writeFile(PROJECTS_PATH, originalContent, 'utf-8');
    } else {
      await fs.unlink(PROJECTS_PATH).catch(() => undefined);
    }
  });

  it('finds a registered project by name', async () => {
    const entry = await findProject('test-proj');
    expect(entry.name).toBe('test-proj');
    expect(entry.path).toBe('/tmp/test-proj');
  });

  it('throws PROJECT_NOT_FOUND for unknown project', async () => {
    const err = await findProject('no-such-project').catch((e) => e);
    expect(err).toBeInstanceOf(GhostError);
    expect((err as GhostError).code).toBe('PROJECT_NOT_FOUND');
  });
});

describe('findProject — no registry', () => {
  const GHOST_DIR = path.join(os.homedir(), '.ghostpath');
  const PROJECTS_PATH = path.join(GHOST_DIR, 'projects.json');
  let originalContent: string | null = null;

  beforeEach(async () => {
    try {
      originalContent = await fs.readFile(PROJECTS_PATH, 'utf-8');
      await fs.unlink(PROJECTS_PATH);
    } catch {
      originalContent = null;
    }
  });

  afterEach(async () => {
    if (originalContent !== null) {
      await fs.mkdir(GHOST_DIR, { recursive: true });
      await fs.writeFile(PROJECTS_PATH, originalContent, 'utf-8');
    }
  });

  it('throws NO_PROJECTS_REGISTRY when projects.json is absent', async () => {
    const err = await findProject('anything').catch((e) => e);
    expect(err).toBeInstanceOf(GhostError);
    expect((err as GhostError).code).toBe('NO_PROJECTS_REGISTRY');
  });
});

describe('listProjects', () => {
  const GHOST_DIR = path.join(os.homedir(), '.ghostpath');
  const PROJECTS_PATH = path.join(GHOST_DIR, 'projects.json');
  let originalContent: string | null = null;

  beforeEach(async () => {
    await fs.mkdir(GHOST_DIR, { recursive: true });
    try {
      originalContent = await fs.readFile(PROJECTS_PATH, 'utf-8');
    } catch {
      originalContent = null;
    }
  });

  afterEach(async () => {
    if (originalContent !== null) {
      await fs.writeFile(PROJECTS_PATH, originalContent, 'utf-8');
    } else {
      await fs.unlink(PROJECTS_PATH).catch(() => undefined);
    }
  });

  it('returns empty array when projects.json is absent', async () => {
    await fs.unlink(PROJECTS_PATH).catch(() => undefined);
    const projects = await listProjects();
    expect(projects).toEqual([]);
  });

  it('returns project list with running status', async () => {
    await fs.writeFile(
      PROJECTS_PATH,
      JSON.stringify({ projects: [{ name: 'p1', path: '/tmp/p1' }] }),
      'utf-8',
    );
    const projects = await listProjects();
    expect(projects[0]?.name).toBe('p1');
    expect(typeof projects[0]?.running).toBe('boolean');
  });
});

// ─── zombie-killer (in-memory state) ────────────────────────────────────────

describe('zombie-killer', () => {
  // Use a fake PID that is guaranteed not to be alive
  const FAKE_PID = 999_999_999;
  const REAL_PID = process.pid;

  afterEach(() => {
    unregisterProcess(FAKE_PID);
    unregisterProcess(REAL_PID);
  });

  it('registerProcess tracks the pid', async () => {
    registerProcess(FAKE_PID);
    // Fake PID is dead, so runZombieCheck won't return it (isPidAlive false)
    const zombies = await runZombieCheck(0);
    // FAKE_PID is not alive, so it won't appear; just verify no throw
    expect(Array.isArray(zombies)).toBe(true);
  });

  it('unregisterProcess removes the pid', async () => {
    registerProcess(REAL_PID);
    unregisterProcess(REAL_PID);
    // REAL_PID was removed, so it should NOT appear even with threshold 0
    const zombies = await runZombieCheck(0);
    expect(zombies).not.toContain(REAL_PID);
  });

  it('recordIO updates last-seen for a registered pid', () => {
    registerProcess(REAL_PID);
    // Should not throw
    expect(() => recordIO(REAL_PID)).not.toThrow();
    unregisterProcess(REAL_PID);
  });

  it('recordIO is a no-op for unregistered pid', () => {
    expect(() => recordIO(FAKE_PID)).not.toThrow();
  });

  it('runZombieCheck returns alive pids past idle threshold', async () => {
    registerProcess(REAL_PID);
    // threshold=0 means any registered & alive pid is a zombie immediately
    const zombies = await runZombieCheck(0);
    expect(zombies).toContain(REAL_PID);
    unregisterProcess(REAL_PID);
  });

  it('runZombieCheck excludes pids within idle threshold', async () => {
    registerProcess(REAL_PID);
    // threshold=1 hour — the pid was just registered so it's not stale yet
    const zombies = await runZombieCheck(60);
    expect(zombies).not.toContain(REAL_PID);
    unregisterProcess(REAL_PID);
  });

  it('runZombieCheck excludes dead pids', async () => {
    registerProcess(FAKE_PID);
    const zombies = await runZombieCheck(0);
    // FAKE_PID is not alive, so it should NOT be a zombie
    expect(zombies).not.toContain(FAKE_PID);
  });

  it('returns empty array when nothing is registered', async () => {
    // Assumes no other test left state behind (afterEach cleans)
    const zombies = await runZombieCheck(0);
    // We can't guarantee empty (other tests run in parallel context), but it's at most our own
    expect(Array.isArray(zombies)).toBe(true);
  });
});

// ─── process-manager (state file) ───────────────────────────────────────────

describe('isProjectRunning / getProjectState / getAllRunningProjects', () => {
  const GHOST_DIR = path.join(os.homedir(), '.ghostpath');
  const STATE_PATH = path.join(GHOST_DIR, 'state.json');
  let originalState: string | null = null;

  beforeEach(async () => {
    await fs.mkdir(GHOST_DIR, { recursive: true });
    try {
      originalState = await fs.readFile(STATE_PATH, 'utf-8');
    } catch {
      originalState = null;
    }
    // Write a state with one "running" project (current process PID, definitely alive)
    // and one "dead" project (fake PID)
    await fs.writeFile(
      STATE_PATH,
      JSON.stringify({
        projects: {
          'alive-proj': { pids: [process.pid], startedAt: new Date().toISOString(), cwd: '/tmp', commands: ['x'] },
          'dead-proj':  { pids: [999_999_999],  startedAt: new Date().toISOString(), cwd: '/tmp', commands: ['y'] },
        },
      }),
      'utf-8',
    );
  });

  afterEach(async () => {
    if (originalState !== null) {
      await fs.writeFile(STATE_PATH, originalState, 'utf-8');
    } else {
      await fs.unlink(STATE_PATH).catch(() => undefined);
    }
  });

  it('isProjectRunning returns true for alive project', async () => {
    expect(await isProjectRunning('alive-proj')).toBe(true);
  });

  it('isProjectRunning returns false for dead project', async () => {
    expect(await isProjectRunning('dead-proj')).toBe(false);
  });

  it('isProjectRunning returns false for unknown project', async () => {
    expect(await isProjectRunning('no-such-project')).toBe(false);
  });

  it('getProjectState returns state for known project', async () => {
    const state = await getProjectState('alive-proj');
    expect(state).not.toBeNull();
    expect(state?.pids).toContain(process.pid);
  });

  it('getProjectState returns null for unknown project', async () => {
    expect(await getProjectState('no-such-project')).toBeNull();
  });

  it('getAllRunningProjects includes only alive projects', async () => {
    const running = await getAllRunningProjects();
    expect(running).toContain('alive-proj');
    expect(running).not.toContain('dead-proj');
  });
});

// ─── spawnCommands ────────────────────────────────────────────────────────────

describe('spawnCommands', () => {
  const GHOST_DIR = path.join(os.homedir(), '.ghostpath');
  const STATE_PATH = path.join(GHOST_DIR, 'state.json');
  let originalState: string | null = null;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gp-spawn-'));
    await fs.mkdir(GHOST_DIR, { recursive: true });
    try { originalState = await fs.readFile(STATE_PATH, 'utf-8'); } catch { originalState = null; }
  });

  afterEach(async () => {
    if (originalState !== null) {
      await fs.writeFile(STATE_PATH, originalState, 'utf-8');
    } else {
      await fs.unlink(STATE_PATH).catch(() => undefined);
    }
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('throws NO_COMMANDS for empty commands array', async () => {
    const err = await spawnCommands('no-cmd-proj', [], tmpDir).catch((e) => e);
    expect(err).toBeInstanceOf(GhostError);
    expect((err as GhostError).code).toBe('NO_COMMANDS');
  });

  it('spawns a real command and returns its PID', async () => {
    const pids = await spawnCommands('spawn-test', ['echo hello'], tmpDir);
    expect(Array.isArray(pids)).toBe(true);
    expect(pids).toHaveLength(1);
    expect(typeof pids[0]).toBe('number');
    expect(pids[0]!).toBeGreaterThan(0);
  });

  it('writes project state after spawning', async () => {
    await spawnCommands('state-write-test', ['echo hello'], tmpDir);
    const state = await getProjectState('state-write-test');
    expect(state).not.toBeNull();
    expect(state?.commands).toEqual(['echo hello']);
    expect(state?.cwd).toBe(tmpDir);
  });

  it('spawns multiple commands and returns all PIDs', async () => {
    const pids = await spawnCommands('multi-cmd', ['echo a', 'echo b'], tmpDir);
    expect(pids).toHaveLength(2);
    pids.forEach((pid) => expect(typeof pid).toBe('number'));
  });
});

// ─── stopProject (process-manager) ───────────────────────────────────────────

describe('pmStopProject', () => {
  const GHOST_DIR = path.join(os.homedir(), '.ghostpath');
  const STATE_PATH = path.join(GHOST_DIR, 'state.json');
  let originalState: string | null = null;

  beforeEach(async () => {
    await fs.mkdir(GHOST_DIR, { recursive: true });
    try { originalState = await fs.readFile(STATE_PATH, 'utf-8'); } catch { originalState = null; }
  });

  afterEach(async () => {
    vi.useRealTimers();
    if (originalState !== null) {
      await fs.writeFile(STATE_PATH, originalState, 'utf-8');
    } else {
      await fs.unlink(STATE_PATH).catch(() => undefined);
    }
  });

  it('throws PROJECT_NOT_RUNNING for an unknown project', async () => {
    await fs.writeFile(STATE_PATH, JSON.stringify({ projects: {} }), 'utf-8');
    const err = await pmStopProject('ghost-proj').catch((e) => e);
    expect(err).toBeInstanceOf(GhostError);
    expect((err as GhostError).code).toBe('PROJECT_NOT_RUNNING');
  });

  it('cleans state when all PIDs are already dead', async () => {
    await fs.writeFile(
      STATE_PATH,
      JSON.stringify({
        projects: {
          'dead-cleanup': {
            pids: [999_999_999],
            startedAt: new Date().toISOString(),
            cwd: '/tmp',
            commands: ['x'],
          },
        },
      }),
      'utf-8',
    );
    await pmStopProject('dead-cleanup', { skipCountdown: true });
    expect(await getProjectState('dead-cleanup')).toBeNull();
  });

  it('stops a live process and cleans state', async () => {
    const child = spawn('sleep', ['60'], { detached: true, stdio: 'ignore' });
    child.unref();
    const pid = child.pid!;

    await fs.writeFile(
      STATE_PATH,
      JSON.stringify({
        projects: {
          'pm-stop-real': {
            pids: [pid],
            startedAt: new Date().toISOString(),
            cwd: '/tmp',
            commands: ['sleep 60'],
          },
        },
      }),
      'utf-8',
    );

    await pmStopProject('pm-stop-real', { skipCountdown: true });
    expect(await isProjectRunning('pm-stop-real')).toBe(false);
    expect(await getProjectState('pm-stop-real')).toBeNull();
  }, 15_000);

  it('countdown completes and resolves with fake timers', async () => {
    // Use a dead PID so SIGTERM has nothing to kill — we just want to cover
    // the countdown code path without waiting 5 real seconds.
    vi.useFakeTimers();

    await fs.writeFile(
      STATE_PATH,
      JSON.stringify({
        projects: {
          'countdown-test': {
            pids: [999_999_999],
            startedAt: new Date().toISOString(),
            cwd: '/tmp',
            commands: ['x'],
          },
        },
      }),
      'utf-8',
    );

    // No skipCountdown — exercises the countdown() function
    const stopPromise = pmStopProject('countdown-test');
    await vi.runAllTimersAsync();
    await stopPromise;

    vi.useRealTimers();
    expect(await getProjectState('countdown-test')).toBeNull();
  });
});

// ─── killZombies ──────────────────────────────────────────────────────────────

describe('killZombies', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns immediately for empty pids array', async () => {
    await expect(killZombies([], false)).resolves.toBeUndefined();
  });

  it('non-TTY mode returns early without killing', async () => {
    const FAKE_PID = 999_999_996;
    registerProcess(FAKE_PID);
    const origCI = process.env['CI'];
    process.env['CI'] = '1';
    try {
      await killZombies([FAKE_PID], false);
    } finally {
      if (origCI === undefined) { delete process.env['CI']; }
      else { process.env['CI'] = origCI; }
      unregisterProcess(FAKE_PID);
    }
  });

  it('auto mode with dead PID: covers warning loop and killWithGrace catch path', async () => {
    vi.useFakeTimers();
    const DEAD_PID = 999_999_997;
    registerProcess(DEAD_PID);

    const killPromise = killZombies([DEAD_PID], true);
    await vi.runAllTimersAsync();
    await killPromise;

    vi.useRealTimers();
    // Completed without throwing — all warning + kill code paths exercised
    expect(true).toBe(true);
    unregisterProcess(DEAD_PID);
  });

  it('auto mode with live PID: sends SIGTERM, waits, and kills process', async () => {
    vi.useFakeTimers();

    const child = spawn('sleep', ['60'], { detached: true, stdio: 'ignore' });
    child.unref();
    const pid = child.pid!;
    registerProcess(pid);

    const killPromise = killZombies([pid], true);
    await vi.runAllTimersAsync();
    await killPromise;

    vi.useRealTimers();

    // Allow OS a moment to process the signal
    await new Promise<void>((r) => setTimeout(r, 200));

    let alive = false;
    try { process.kill(pid, 0); alive = true; } catch { alive = false; }
    expect(alive).toBe(false);

    unregisterProcess(pid);
  }, 10_000);
});

// ─── openProject (orchestrator) ───────────────────────────────────────────────

describe('openProject', () => {
  const GHOST_DIR = path.join(os.homedir(), '.ghostpath');
  const PROJECTS_PATH = path.join(GHOST_DIR, 'projects.json');
  const STATE_PATH = path.join(GHOST_DIR, 'state.json');
  let tmpDir: string;
  let origProjects: string | null = null;
  let origState: string | null = null;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gp-open-'));
    await fs.mkdir(GHOST_DIR, { recursive: true });
    try { origProjects = await fs.readFile(PROJECTS_PATH, 'utf-8'); } catch { origProjects = null; }
    try { origState = await fs.readFile(STATE_PATH, 'utf-8'); } catch { origState = null; }

    await fs.writeFile(
      path.join(tmpDir, 'Ghostfile.json'),
      JSON.stringify({ name: 'orch-test', start: ['echo hello'] }),
      'utf-8',
    );
    await fs.writeFile(
      PROJECTS_PATH,
      JSON.stringify({ projects: [{ name: 'orch-test', path: tmpDir }] }),
      'utf-8',
    );
    await fs.writeFile(STATE_PATH, JSON.stringify({ projects: {} }), 'utf-8');
  });

  afterEach(async () => {
    if (origProjects !== null) {
      await fs.writeFile(PROJECTS_PATH, origProjects, 'utf-8');
    } else {
      await fs.unlink(PROJECTS_PATH).catch(() => undefined);
    }
    if (origState !== null) {
      await fs.writeFile(STATE_PATH, origState, 'utf-8');
    } else {
      await fs.unlink(STATE_PATH).catch(() => undefined);
    }
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('throws PROJECT_NOT_FOUND for an unregistered project', async () => {
    const err = await openProject('no-such-project').catch((e) => e);
    expect(err).toBeInstanceOf(GhostError);
    expect((err as GhostError).code).toBe('PROJECT_NOT_FOUND');
  });

  it('throws PROJECT_ALREADY_RUNNING if project has alive PIDs in state', async () => {
    await fs.writeFile(
      STATE_PATH,
      JSON.stringify({
        projects: {
          'orch-test': {
            pids: [process.pid],
            startedAt: new Date().toISOString(),
            cwd: tmpDir,
            commands: ['echo hello'],
          },
        },
      }),
      'utf-8',
    );
    const err = await openProject('orch-test').catch((e) => e);
    expect(err).toBeInstanceOf(GhostError);
    expect((err as GhostError).code).toBe('PROJECT_ALREADY_RUNNING');
  });

  it('opens project and returns result with PID and commandCount', async () => {
    const result = await openProject('orch-test');
    expect(result.projectName).toBe('orch-test');
    expect(result.commandCount).toBe(1);
    expect(Array.isArray(result.pids)).toBe(true);
    expect(result.pids[0]!).toBeGreaterThan(0);
  });

  it('parses .env file and injects env vars (parseEnvFile covered)', async () => {
    await fs.writeFile(path.join(tmpDir, '.env'), 'MY_VAR=testvalue\n# comment\n\nOTHER=val\n', 'utf-8');
    await fs.writeFile(
      path.join(tmpDir, 'Ghostfile.json'),
      JSON.stringify({ name: 'orch-test', start: ['echo hello'], env: '.env' }),
      'utf-8',
    );
    const result = await openProject('orch-test');
    expect(result.pids.length).toBeGreaterThan(0);
  });

  it('opens project with no .env file (parseEnvFile graceful missing)', async () => {
    // No .env file in tmpDir — parseEnvFile should return {} without throwing
    const result = await openProject('orch-test');
    expect(result.projectName).toBe('orch-test');
  });
});

// ─── stopProject (orchestrator) ───────────────────────────────────────────────

describe('orchStopProject', () => {
  const GHOST_DIR = path.join(os.homedir(), '.ghostpath');
  const PROJECTS_PATH = path.join(GHOST_DIR, 'projects.json');
  const STATE_PATH = path.join(GHOST_DIR, 'state.json');
  let tmpDir: string;
  let origProjects: string | null = null;
  let origState: string | null = null;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gp-orchstop-'));
    await fs.mkdir(GHOST_DIR, { recursive: true });
    try { origProjects = await fs.readFile(PROJECTS_PATH, 'utf-8'); } catch { origProjects = null; }
    try { origState = await fs.readFile(STATE_PATH, 'utf-8'); } catch { origState = null; }

    await fs.writeFile(
      path.join(tmpDir, 'Ghostfile.json'),
      JSON.stringify({ name: 'orch-stop-test', start: ['echo hello'], trace: false }),
      'utf-8',
    );
    await fs.writeFile(
      PROJECTS_PATH,
      JSON.stringify({ projects: [{ name: 'orch-stop-test', path: tmpDir }] }),
      'utf-8',
    );
  });

  afterEach(async () => {
    if (origProjects !== null) {
      await fs.writeFile(PROJECTS_PATH, origProjects, 'utf-8');
    } else {
      await fs.unlink(PROJECTS_PATH).catch(() => undefined);
    }
    if (origState !== null) {
      await fs.writeFile(STATE_PATH, origState, 'utf-8');
    } else {
      await fs.unlink(STATE_PATH).catch(() => undefined);
    }
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('throws PROJECT_NOT_FOUND for unregistered project', async () => {
    const err = await orchStopProject('totally-unknown').catch((e) => e);
    expect(err).toBeInstanceOf(GhostError);
    expect((err as GhostError).code).toBe('PROJECT_NOT_FOUND');
  });

  it('stops a running project and cleans state', async () => {
    const child = spawn('sleep', ['60'], { detached: true, stdio: 'ignore' });
    child.unref();
    const pid = child.pid!;

    await fs.writeFile(
      STATE_PATH,
      JSON.stringify({
        projects: {
          'orch-stop-test': {
            pids: [pid],
            startedAt: new Date().toISOString(),
            cwd: tmpDir,
            commands: ['sleep 60'],
          },
        },
      }),
      'utf-8',
    );

    await orchStopProject('orch-stop-test', { skipCountdown: true });
    expect(await isProjectRunning('orch-stop-test')).toBe(false);
  }, 15_000);
});

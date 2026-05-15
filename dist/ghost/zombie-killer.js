import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import inquirer from 'inquirer';
import { GhostError } from './errors.js';
const GHOST_DIR = path.join(os.homedir(), '.ghostpath');
const LOG_DIR = path.join(GHOST_DIR, 'logs');
const ZOMBIE_LOG = path.join(LOG_DIR, 'zombie.log');
const ioTimestamps = new Map();
function isPidAlive(pid) {
    try {
        process.kill(pid, 0);
        return true;
    }
    catch {
        return false;
    }
}
export function registerProcess(pid) {
    ioTimestamps.set(pid, Date.now());
}
export function unregisterProcess(pid) {
    ioTimestamps.delete(pid);
}
export function recordIO(pid) {
    if (ioTimestamps.has(pid)) {
        ioTimestamps.set(pid, Date.now());
    }
}
export async function runZombieCheck(idleThresholdMinutes) {
    const now = Date.now();
    const thresholdMs = idleThresholdMinutes * 60 * 1000;
    const zombies = [];
    for (const [pid, lastIO] of ioTimestamps) {
        if (now - lastIO >= thresholdMs && isPidAlive(pid)) {
            zombies.push(pid);
        }
    }
    return zombies;
}
async function appendZombieLog(pid) {
    try {
        await fs.mkdir(LOG_DIR, { recursive: true });
        await fs.appendFile(ZOMBIE_LOG, `[${new Date().toISOString()}] killed zombie PID ${pid}\n`, 'utf-8');
    }
    catch {
        throw new GhostError({
            code: 'ZOMBIE_LOG_WRITE_FAILED',
            message: `Failed to write zombie kill log for PID ${pid}`,
            hint: `Ensure ${LOG_DIR} is writable`,
        });
    }
}
async function killWithGrace(pid) {
    try {
        process.kill(pid, 'SIGTERM');
    }
    catch {
        return;
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
    if (isPidAlive(pid)) {
        try {
            process.kill(pid, 'SIGKILL');
        }
        catch {
            // exited between liveness check and SIGKILL
        }
    }
}
export async function killZombies(pids, autoMode) {
    if (pids.length === 0)
        return;
    if (autoMode) {
        for (let i = 5; i > 0; i--) {
            process.stdout.write(`WARNING: Killing ${pids.length} idle process(es) [PIDs: ${pids.join(', ')}] in ${i}s...\n`);
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }
    }
    else {
        process.stdout.write(`\nIdle processes detected: ${pids.join(', ')}\n`);
        const { confirmed } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'confirmed',
                message: `Kill ${pids.length} idle process(es)?`,
                default: false,
            },
        ]);
        if (!confirmed)
            return;
    }
    for (const pid of pids) {
        await killWithGrace(pid);
        await appendZombieLog(pid);
        unregisterProcess(pid);
    }
}

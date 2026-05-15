import fs from 'node:fs/promises';
import readline from 'node:readline';
import os from 'node:os';
import { GhostError } from './errors.js';
// Windows path: C:\Windows\System32\drivers\etc\hosts
const HOSTS_FILE = os.platform() === 'win32'
    ? 'C:\\Windows\\System32\\drivers\\etc\\hosts'
    : '/etc/hosts';
const GHOST_MARKER = '# ghostpath';
function entryLine(domain) {
    return `127.0.0.1   ${domain}   ${GHOST_MARKER}`;
}
async function readHostsFile() {
    try {
        return await fs.readFile(HOSTS_FILE, 'utf-8');
    }
    catch (err) {
        const code = err.code;
        throw new GhostError({
            code: 'HOSTS_READ_FAILED',
            message: `Could not read ${HOSTS_FILE}: ${err.message}`,
            hint: code === 'EACCES'
                ? 'Try running with elevated permissions (sudo on Linux/macOS)'
                : 'Check that the hosts file exists and is readable',
        });
    }
}
async function writeHostsFile(content) {
    try {
        await fs.writeFile(HOSTS_FILE, content, 'utf-8');
    }
    catch (err) {
        const code = err.code;
        throw new GhostError({
            code: 'HOSTS_WRITE_FAILED',
            message: `Could not write to ${HOSTS_FILE}: ${err.message}`,
            hint: code === 'EACCES'
                ? 'Try running with elevated permissions (sudo on Linux/macOS)'
                : 'Check that the hosts file is writable',
        });
    }
}
function confirmWithUser(message) {
    return new Promise((resolve) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl.question(`${message} [y/N] `, (answer) => {
            rl.close();
            resolve(answer.trim().toLowerCase() === 'y');
        });
    });
}
export async function hasHostEntry(domain) {
    const content = await readHostsFile();
    return content.split('\n').some((line) => {
        const trimmed = line.trim();
        return !trimmed.startsWith('#') && trimmed.includes(domain);
    });
}
export async function addHostEntry(domain) {
    if (await hasHostEntry(domain)) {
        return;
    }
    const confirmed = await confirmWithUser(`GhostPath needs to add "${domain}" to ${HOSTS_FILE}. Allow?`);
    if (!confirmed) {
        return;
    }
    const content = await readHostsFile();
    const updated = content.endsWith('\n')
        ? `${content}${entryLine(domain)}\n`
        : `${content}\n${entryLine(domain)}\n`;
    await writeHostsFile(updated);
}
export async function removeHostEntry(domain) {
    const content = await readHostsFile();
    const lines = content.split('\n');
    const filtered = lines.filter((line) => {
        const trimmed = line.trim();
        // Remove lines that contain the domain and our marker (written by GhostPath)
        return !(trimmed.includes(domain) && trimmed.includes(GHOST_MARKER));
    });
    if (filtered.length === lines.length) {
        // Nothing was removed — entry was already absent, not an error
        return;
    }
    await writeHostsFile(filtered.join('\n'));
}

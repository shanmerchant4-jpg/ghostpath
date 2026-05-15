import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { GhostError } from '../../ghost/errors.js';
const VAULT_DIR = path.join(os.homedir(), '.ghostpath', 'vault');
export class LocalProvider {
    vaultPath(projectName) {
        return path.join(VAULT_DIR, `${projectName}.vault`);
    }
    async ensureDir() {
        await fs.mkdir(VAULT_DIR, { recursive: true });
    }
    async upload(projectName, payload) {
        await this.ensureDir();
        await fs.writeFile(this.vaultPath(projectName), JSON.stringify(payload, null, 2), 'utf-8');
    }
    async download(projectName) {
        let raw;
        try {
            raw = await fs.readFile(this.vaultPath(projectName), 'utf-8');
        }
        catch {
            throw new GhostError({
                code: 'VAULT_FILE_NOT_FOUND',
                message: `No vault found for project "${projectName}"`,
                hint: `Run \`ghostpath sync push ${projectName}\` first`,
            });
        }
        try {
            return JSON.parse(raw);
        }
        catch {
            throw new GhostError({
                code: 'VAULT_CORRUPTED',
                message: `Vault file for "${projectName}" contains invalid JSON`,
                hint: 'The vault file may be corrupted — re-push from a working machine',
            });
        }
    }
    async exists(projectName) {
        try {
            await fs.access(this.vaultPath(projectName));
            return true;
        }
        catch {
            return false;
        }
    }
}

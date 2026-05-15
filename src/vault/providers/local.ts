import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { GhostError } from '../../ghost/errors.js';
import type { EncryptedPayload, VaultProvider } from '../types.js';

const VAULT_DIR = path.join(os.homedir(), '.ghostpath', 'vault');

export class LocalProvider implements VaultProvider {
  private vaultPath(projectName: string): string {
    return path.join(VAULT_DIR, `${projectName}.vault`);
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(VAULT_DIR, { recursive: true });
  }

  async upload(projectName: string, payload: EncryptedPayload): Promise<void> {
    await this.ensureDir();
    await fs.writeFile(
      this.vaultPath(projectName),
      JSON.stringify(payload, null, 2),
      'utf-8',
    );
  }

  async download(projectName: string): Promise<EncryptedPayload> {
    let raw: string;
    try {
      raw = await fs.readFile(this.vaultPath(projectName), 'utf-8');
    } catch {
      throw new GhostError({
        code: 'VAULT_FILE_NOT_FOUND',
        message: `No vault found for project "${projectName}"`,
        hint: `Run \`ghostpath sync push ${projectName}\` first`,
      });
    }

    try {
      return JSON.parse(raw) as EncryptedPayload;
    } catch {
      throw new GhostError({
        code: 'VAULT_CORRUPTED',
        message: `Vault file for "${projectName}" contains invalid JSON`,
        hint: 'The vault file may be corrupted — re-push from a working machine',
      });
    }
  }

  async exists(projectName: string): Promise<boolean> {
    try {
      await fs.access(this.vaultPath(projectName));
      return true;
    } catch {
      return false;
    }
  }
}

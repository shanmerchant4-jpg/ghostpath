import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { GhostError } from '../../ghost/errors.js';
import type { EncryptedPayload, VaultProvider } from '../types.js';

const TOKEN_PATH = path.join(os.homedir(), '.ghostpath', 'vault', '.dropbox-token');
const CONTENT_URL = 'https://content.dropboxapi.com/2/files';
const API_URL = 'https://api.dropboxapi.com/2/files';

export class DropboxProvider implements VaultProvider {
  private async readToken(): Promise<string> {
    try {
      const raw = await fs.readFile(TOKEN_PATH, 'utf-8');
      return raw.trim();
    } catch {
      throw new GhostError({
        code: 'VAULT_NO_AUTH',
        message: 'Dropbox not configured',
        hint: 'Run `ghostpath sync setup` to connect your Dropbox account',
      });
    }
  }

  private remotePath(projectName: string): string {
    return `/ghostpath/${projectName}.vault`;
  }

  async upload(projectName: string, payload: EncryptedPayload): Promise<void> {
    const token = await this.readToken();

    const res = await fetch(`${CONTENT_URL}/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/octet-stream',
        'Dropbox-API-Arg': JSON.stringify({
          path: this.remotePath(projectName),
          mode: 'overwrite',
          autorename: false,
          mute: true,
        }),
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new GhostError({
        code: 'VAULT_DROPBOX_ERROR',
        message: `Failed to upload vault to Dropbox: ${res.status} ${res.statusText}`,
        hint: 'Check that your Dropbox token is valid and has write access',
      });
    }
  }

  async download(projectName: string): Promise<EncryptedPayload> {
    const token = await this.readToken();

    const res = await fetch(`${CONTENT_URL}/download`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Dropbox-API-Arg': JSON.stringify({ path: this.remotePath(projectName) }),
      },
    });

    if (!res.ok) {
      if (res.status === 409) {
        throw new GhostError({
          code: 'VAULT_FILE_NOT_FOUND',
          message: `No vault found for project "${projectName}" on Dropbox`,
          hint: `Run \`ghostpath sync push ${projectName}\` first`,
        });
      }
      throw new GhostError({
        code: 'VAULT_DROPBOX_ERROR',
        message: `Failed to download vault from Dropbox: ${res.status} ${res.statusText}`,
        hint: 'Check that your Dropbox token is valid and has read access',
      });
    }

    return (await res.json()) as EncryptedPayload;
  }

  async exists(projectName: string): Promise<boolean> {
    const token = await this.readToken();

    const res = await fetch(`${API_URL}/get_metadata`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ path: this.remotePath(projectName) }),
    });

    // Dropbox returns 409 with path/not_found when the file does not exist
    if (res.status === 409) return false;

    if (!res.ok) {
      throw new GhostError({
        code: 'VAULT_DROPBOX_ERROR',
        message: `Dropbox API error checking file existence: ${res.status} ${res.statusText}`,
        hint: 'Check that your Dropbox token is valid',
      });
    }

    return true;
  }
}

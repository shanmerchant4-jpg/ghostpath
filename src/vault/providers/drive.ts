import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { GhostError } from '../../ghost/errors.js';
import type { EncryptedPayload, VaultProvider } from '../types.js';

const TOKEN_PATH = path.join(os.homedir(), '.ghostpath', 'vault', '.drive-token');
const FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';

interface DriveFileList {
  files?: Array<{ id: string }>;
}

export class DriveProvider implements VaultProvider {
  private async readToken(): Promise<string> {
    try {
      const raw = await fs.readFile(TOKEN_PATH, 'utf-8');
      return raw.trim();
    } catch {
      throw new GhostError({
        code: 'VAULT_NO_AUTH',
        message: 'Google Drive not configured',
        hint: 'Run `ghostpath sync setup` to connect your Drive account',
      });
    }
  }

  private fileName(projectName: string): string {
    return `ghostpath-${projectName}.vault`;
  }

  private async findFileId(token: string, projectName: string): Promise<string | null> {
    const name = this.fileName(projectName);
    // Escape single quotes in the file name for the query string
    const safeName = name.replace(/'/g, "\\'");
    const q = encodeURIComponent(`name='${safeName}' and trashed=false`);
    const url = `${FILES_URL}?q=${q}&fields=files(id)&spaces=drive`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      throw new GhostError({
        code: 'VAULT_DRIVE_ERROR',
        message: `Google Drive API error while searching files: ${res.status} ${res.statusText}`,
        hint: 'Check your internet connection and that your Drive token has not expired',
      });
    }

    const data = (await res.json()) as DriveFileList;
    return data.files?.[0]?.id ?? null;
  }

  async upload(projectName: string, payload: EncryptedPayload): Promise<void> {
    const token = await this.readToken();
    const existingId = await this.findFileId(token, projectName);
    const body = JSON.stringify(payload);

    if (existingId !== null) {
      // Update existing file content via media upload
      const res = await fetch(`${UPLOAD_URL}/${existingId}?uploadType=media`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body,
      });
      if (!res.ok) {
        throw new GhostError({
          code: 'VAULT_DRIVE_ERROR',
          message: `Failed to update vault on Google Drive: ${res.status} ${res.statusText}`,
          hint: 'Check that your Drive token is valid and has write access',
        });
      }
    } else {
      // Create new file via multipart upload (metadata + content in one request)
      const boundary = `ghostpath-${Date.now().toString(36)}`;
      const meta = JSON.stringify({
        name: this.fileName(projectName),
        mimeType: 'application/json',
      });
      const multipart = [
        `--${boundary}`,
        'Content-Type: application/json; charset=UTF-8',
        '',
        meta,
        `--${boundary}`,
        'Content-Type: application/json',
        '',
        body,
        `--${boundary}--`,
      ].join('\r\n');

      const res = await fetch(`${UPLOAD_URL}?uploadType=multipart`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: multipart,
      });
      if (!res.ok) {
        throw new GhostError({
          code: 'VAULT_DRIVE_ERROR',
          message: `Failed to create vault on Google Drive: ${res.status} ${res.statusText}`,
          hint: 'Check that your Drive token is valid and has write access',
        });
      }
    }
  }

  async download(projectName: string): Promise<EncryptedPayload> {
    const token = await this.readToken();
    const fileId = await this.findFileId(token, projectName);

    if (fileId === null) {
      throw new GhostError({
        code: 'VAULT_FILE_NOT_FOUND',
        message: `No vault found for project "${projectName}" on Google Drive`,
        hint: `Run \`ghostpath sync push ${projectName}\` first`,
      });
    }

    const res = await fetch(`${FILES_URL}/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      throw new GhostError({
        code: 'VAULT_DRIVE_ERROR',
        message: `Failed to download vault from Google Drive: ${res.status} ${res.statusText}`,
        hint: 'Check that your Drive token is valid and has read access',
      });
    }

    return (await res.json()) as EncryptedPayload;
  }

  async exists(projectName: string): Promise<boolean> {
    const token = await this.readToken();
    const fileId = await this.findFileId(token, projectName);
    return fileId !== null;
  }
}

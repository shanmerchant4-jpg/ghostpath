import fs from 'node:fs/promises';
import chalk from 'chalk';
import { GhostError } from '../ghost/errors.js';
import { encrypt } from './encrypt.js';
import { decrypt } from './decrypt.js';
import { LocalProvider } from './providers/local.js';
import { DriveProvider } from './providers/drive.js';
import { DropboxProvider } from './providers/dropbox.js';
export { encrypt } from './encrypt.js';
export { decrypt } from './decrypt.js';
export async function pushToVault(projectName, envPath, password, provider) {
    let plaintext;
    try {
        plaintext = await fs.readFile(envPath, 'utf-8');
    }
    catch {
        throw new GhostError({
            code: 'VAULT_ENV_NOT_FOUND',
            message: `Cannot read env file at: ${envPath}`,
            hint: 'Verify the path is correct and the file exists',
        });
    }
    const payload = await encrypt(plaintext, password);
    await provider.upload(projectName, payload);
    console.log(chalk.green(`✓ Vault pushed for project "${projectName}"`));
}
export async function pullFromVault(projectName, envPath, password, provider) {
    const payload = await provider.download(projectName);
    const plaintext = await decrypt(payload, password);
    try {
        await fs.writeFile(envPath, plaintext, 'utf-8');
    }
    catch {
        throw new GhostError({
            code: 'VAULT_WRITE_FAILED',
            message: `Failed to write env file at: ${envPath}`,
            hint: 'Check that the directory exists and you have write permissions',
        });
    }
    console.log(chalk.green(`✓ Vault pulled for project "${projectName}" → ${envPath}`));
}
export function getProvider(name) {
    switch (name) {
        case 'local': return new LocalProvider();
        case 'drive': return new DriveProvider();
        case 'dropbox': return new DropboxProvider();
    }
}

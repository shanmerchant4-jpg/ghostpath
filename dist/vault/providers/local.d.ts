import type { EncryptedPayload, VaultProvider } from '../types.js';
export declare class LocalProvider implements VaultProvider {
    private vaultPath;
    private ensureDir;
    upload(projectName: string, payload: EncryptedPayload): Promise<void>;
    download(projectName: string): Promise<EncryptedPayload>;
    exists(projectName: string): Promise<boolean>;
}

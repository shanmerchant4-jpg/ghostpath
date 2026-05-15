import type { EncryptedPayload, VaultProvider } from '../types.js';
export declare class DropboxProvider implements VaultProvider {
    private readToken;
    private remotePath;
    upload(projectName: string, payload: EncryptedPayload): Promise<void>;
    download(projectName: string): Promise<EncryptedPayload>;
    exists(projectName: string): Promise<boolean>;
}

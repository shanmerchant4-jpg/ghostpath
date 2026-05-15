import type { EncryptedPayload, VaultProvider } from '../types.js';
export declare class DriveProvider implements VaultProvider {
    private readToken;
    private fileName;
    private findFileId;
    upload(projectName: string, payload: EncryptedPayload): Promise<void>;
    download(projectName: string): Promise<EncryptedPayload>;
    exists(projectName: string): Promise<boolean>;
}

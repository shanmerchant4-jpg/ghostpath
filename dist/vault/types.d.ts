export interface EncryptedPayload {
    ciphertext: string;
    iv: string;
    salt: string;
    version: number;
}
export interface VaultProvider {
    upload(projectName: string, payload: EncryptedPayload): Promise<void>;
    download(projectName: string): Promise<EncryptedPayload>;
    exists(projectName: string): Promise<boolean>;
}

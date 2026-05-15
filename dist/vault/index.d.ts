import type { VaultProvider } from './types.js';
export type { EncryptedPayload, VaultProvider } from './types.js';
export { encrypt } from './encrypt.js';
export { decrypt } from './decrypt.js';
export declare function pushToVault(projectName: string, envPath: string, password: string, provider: VaultProvider): Promise<void>;
export declare function pullFromVault(projectName: string, envPath: string, password: string, provider: VaultProvider): Promise<void>;
export declare function getProvider(name: 'local' | 'drive' | 'dropbox'): VaultProvider;

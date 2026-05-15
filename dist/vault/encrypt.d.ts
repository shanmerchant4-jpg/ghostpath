import type { EncryptedPayload } from './types.js';
export declare function encrypt(plaintext: string, password: string): Promise<EncryptedPayload>;

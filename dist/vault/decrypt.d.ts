import type { EncryptedPayload } from './types.js';
export declare function decrypt(payload: EncryptedPayload, password: string): Promise<string>;

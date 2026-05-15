import { createCipheriv, pbkdf2, randomBytes } from 'node:crypto';
import type { EncryptedPayload } from './types.js';

const PBKDF2_ITERATIONS = 310_000;
const KEY_LEN = 32;       // 256 bits
const IV_LEN = 16;        // 128 bits
const SALT_LEN = 32;      // 256 bits
const ALGO = 'aes-256-gcm' as const;
const DIGEST = 'sha256' as const;
const VERSION = 1 as const;

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    pbkdf2(password, salt, PBKDF2_ITERATIONS, KEY_LEN, DIGEST, (err, key) => {
      if (err !== null) reject(err);
      else resolve(key);
    });
  });
}

export async function encrypt(plaintext: string, password: string): Promise<EncryptedPayload> {
  const salt = randomBytes(SALT_LEN);
  const iv = randomBytes(IV_LEN);
  const key = await deriveKey(password, salt);

  const cipher = createCipheriv(ALGO, key, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Auth tag is appended to the ciphertext so decrypt can extract it deterministically.
  const ciphertextWithTag = Buffer.concat([encrypted, authTag]);

  return {
    ciphertext: ciphertextWithTag.toString('base64'),
    iv: iv.toString('base64'),
    salt: salt.toString('base64'),
    version: VERSION,
  };
}

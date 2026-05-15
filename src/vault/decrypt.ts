import { createDecipheriv, pbkdf2 } from 'node:crypto';
import { GhostError } from '../ghost/errors.js';
import type { EncryptedPayload } from './types.js';

const PBKDF2_ITERATIONS = 310_000;
const KEY_LEN = 32;
const AUTH_TAG_LEN = 16;
const ALGO = 'aes-256-gcm' as const;
const DIGEST = 'sha256' as const;

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    pbkdf2(password, salt, PBKDF2_ITERATIONS, KEY_LEN, DIGEST, (err, key) => {
      if (err !== null) reject(err);
      else resolve(key);
    });
  });
}

const DECRYPT_FAILED: GhostError = new GhostError({
  code: 'VAULT_DECRYPT_FAILED',
  message: 'Decryption failed — wrong password or corrupted vault file',
  hint: 'Check your master password and try again',
});

export async function decrypt(payload: EncryptedPayload, password: string): Promise<string> {
  if (payload.version !== 1) {
    throw new GhostError({
      code: 'VAULT_UNKNOWN_VERSION',
      message: `Unknown vault version: ${payload.version}`,
      hint: 'This vault was created by a newer version of GhostPath — please upgrade',
    });
  }

  const salt = Buffer.from(payload.salt, 'base64');
  const iv = Buffer.from(payload.iv, 'base64');
  const ciphertextBuf = Buffer.from(payload.ciphertext, 'base64');

  if (ciphertextBuf.length <= AUTH_TAG_LEN) {
    throw DECRYPT_FAILED;
  }

  // Ciphertext layout: [encrypted_data][16-byte auth tag]
  const encryptedData = ciphertextBuf.subarray(0, ciphertextBuf.length - AUTH_TAG_LEN);
  const authTag = ciphertextBuf.subarray(ciphertextBuf.length - AUTH_TAG_LEN);

  const key = await deriveKey(password, salt);

  try {
    const decipher = createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(encryptedData), decipher.final()]);
    return plaintext.toString('utf8');
  } catch {
    // GCM auth tag mismatch — wrong password or tampered ciphertext
    throw DECRYPT_FAILED;
  }
}

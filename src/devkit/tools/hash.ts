import { createHash, randomUUID, randomBytes } from 'node:crypto';
import { GhostError } from '../../ghost/errors.js';

export function hashText(
  input: string,
  algorithm: 'sha256' | 'sha512' | 'sha1' | 'md5',
): string {
  try {
    return createHash(algorithm).update(input, 'utf-8').digest('hex');
  } catch (e) {
    throw new GhostError({
      code: 'HASH_ERROR',
      message: `Failed to hash input with ${algorithm}: ${e instanceof Error ? e.message : String(e)}`,
      hint: 'Ensure the algorithm name is one of: sha256, sha512, sha1, md5',
    });
  }
}

export function generateUuid(version: 'v4' | 'v7'): string {
  if (version === 'v4') {
    return randomUUID();
  }

  // UUID v7 per RFC 9562:
  // Bits 0–47:  Unix timestamp in milliseconds
  // Bits 48–51: version = 7
  // Bits 52–63: rand_a (12 random bits)
  // Bits 64–65: variant = 0b10
  // Bits 66–127: rand_b (62 random bits)
  const now = BigInt(Date.now());
  const rand = randomBytes(10);
  const buf = Buffer.alloc(16);

  // Bytes 0–5: 48-bit timestamp
  buf.writeUInt32BE(Number((now >> 16n) & 0xFFFF_FFFFn), 0);
  buf.writeUInt16BE(Number(now & 0xFFFFn), 4);

  // Byte 6: version nibble (0x7) + high 4 bits of rand_a
  buf[6] = 0x70 | (rand[0]! & 0x0F);
  // Byte 7: low 8 bits of rand_a
  buf[7] = rand[1]!;

  // Byte 8: variant bits (0b10) + 6 random bits
  buf[8] = 0x80 | (rand[2]! & 0x3F);
  // Bytes 9–15: remaining 56 random bits (7 bytes)
  for (let i = 0; i < 7; i++) {
    buf[9 + i] = rand[3 + i]!;
  }

  const hex = buf.toString('hex');
  return (
    `${hex.slice(0, 8)}-${hex.slice(8, 12)}-` +
    `${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  );
}

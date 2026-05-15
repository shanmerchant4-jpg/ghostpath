function decodeBase64Url(segment: string): unknown {
  // Convert base64url → base64
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  // Pad to a multiple of 4
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const decoded = Buffer.from(padded, 'base64').toString('utf-8');
  return JSON.parse(decoded) as unknown;
}

export function decodeJwt(token: string): {
  header: object;
  payload: object;
  isExpired: boolean;
  expiresAt?: Date;
  error?: string;
} {
  const trimmed = token.trim();
  const parts = trimmed.split('.');

  if (parts.length !== 3) {
    return {
      header: {},
      payload: {},
      isExpired: false,
      error: `Invalid JWT: expected 3 dot-separated segments, got ${parts.length}`,
    };
  }

  let header: object;
  let payload: Record<string, unknown>;

  try {
    header = decodeBase64Url(parts[0]!) as object;
  } catch (e) {
    return {
      header: {},
      payload: {},
      isExpired: false,
      error: `Failed to decode header: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  try {
    payload = decodeBase64Url(parts[1]!) as Record<string, unknown>;
  } catch (e) {
    return {
      header,
      payload: {},
      isExpired: false,
      error: `Failed to decode payload: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  let expiresAt: Date | undefined;
  let isExpired = false;

  const exp = payload['exp'];
  if (typeof exp === 'number') {
    expiresAt = new Date(exp * 1000);
    isExpired = expiresAt < new Date();
  }

  return { header, payload, isExpired, expiresAt };
}

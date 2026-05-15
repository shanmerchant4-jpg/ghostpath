import { GhostError } from '../../ghost/errors.js';

export function unixToHuman(unix: number): string {
  return new Date(unix * 1000).toISOString();
}

export function humanToUnix(input: string): number {
  const d = new Date(input);
  if (isNaN(d.getTime())) {
    throw new GhostError({
      code: 'INVALID_DATE_STRING',
      message: `Cannot parse date: "${input}"`,
      hint: 'Use ISO 8601 format (e.g. "2024-01-15T09:00:00Z") or a common date string',
    });
  }
  return Math.floor(d.getTime() / 1000);
}

export function nowUnix(): number {
  return Math.floor(Date.now() / 1000);
}

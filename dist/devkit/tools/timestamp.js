import { GhostError } from '../../ghost/errors.js';
export function unixToHuman(unix) {
    return new Date(unix * 1000).toISOString();
}
export function humanToUnix(input) {
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
export function nowUnix() {
    return Math.floor(Date.now() / 1000);
}

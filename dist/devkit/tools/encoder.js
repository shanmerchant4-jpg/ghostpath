import { GhostError } from '../../ghost/errors.js';
export function encodeBase64(input) {
    return Buffer.from(input, 'utf-8').toString('base64');
}
export function decodeBase64(input) {
    // Buffer.from silently ignores invalid characters; we still return the decoded bytes as UTF-8
    return Buffer.from(input, 'base64').toString('utf-8');
}
export function encodeUrl(input) {
    return encodeURIComponent(input);
}
export function decodeUrl(input) {
    try {
        return decodeURIComponent(input);
    }
    catch (e) {
        throw new GhostError({
            code: 'INVALID_URL_ENCODING',
            message: `Cannot URL-decode the provided string: ${e instanceof Error ? e.message : String(e)}`,
            hint: 'Ensure the input contains valid percent-encoded sequences',
        });
    }
}
const HTML_ENCODE_MAP = [
    ['&', '&amp;'],
    ['<', '&lt;'],
    ['>', '&gt;'],
    ['"', '&quot;'],
    ["'", '&#39;'],
];
const HTML_DECODE_MAP = [
    [/&amp;/g, '&'],
    [/&lt;/g, '<'],
    [/&gt;/g, '>'],
    [/&quot;/g, '"'],
    [/&#39;/g, "'"],
    [/&apos;/g, "'"],
];
export function encodeHtml(input) {
    let result = input;
    for (const [from, to] of HTML_ENCODE_MAP) {
        result = result.split(from).join(to);
    }
    return result;
}
export function decodeHtml(input) {
    let result = input;
    for (const [pattern, replacement] of HTML_DECODE_MAP) {
        result = result.replace(pattern, replacement);
    }
    return result;
}

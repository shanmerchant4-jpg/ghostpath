import { describe, it, expect } from 'vitest';

import { formatJson, minifyJson, validateJson, jsonToTsTypes, jsonToZodSchema } from '../src/devkit/tools/json.js';
import { testRegex, explainRegex } from '../src/devkit/tools/regex.js';
import { decodeJwt } from '../src/devkit/tools/jwt.js';
import { hashText, generateUuid } from '../src/devkit/tools/hash.js';
import { diffText } from '../src/devkit/tools/diff.js';
import { unixToHuman, humanToUnix, nowUnix } from '../src/devkit/tools/timestamp.js';
import { nextRuns, explainCron } from '../src/devkit/tools/cron.js';
import {
  encodeBase64,
  decodeBase64,
  encodeUrl,
  decodeUrl,
  encodeHtml,
  decodeHtml,
} from '../src/devkit/tools/encoder.js';
import { GhostError } from '../src/ghost/errors.js';

// ─── json ───────────────────────────────────────────────────────────────────

describe('formatJson', () => {
  it('pretty-prints valid JSON', () => {
    const result = formatJson('{"a":1}');
    expect(result).toBe('{\n  "a": 1\n}');
  });

  it('throws GhostError on invalid JSON', () => {
    let err: unknown;
    try { formatJson('bad'); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(GhostError);
    expect((err as GhostError).code).toBe('INVALID_JSON');
  });

  it('handles arrays', () => {
    const result = formatJson('[1,2,3]');
    expect(JSON.parse(result)).toEqual([1, 2, 3]);
  });
});

describe('minifyJson', () => {
  it('compresses valid JSON', () => {
    expect(minifyJson('{ "a": 1 }')).toBe('{"a":1}');
  });

  it('throws GhostError on invalid JSON', () => {
    expect(() => minifyJson('{bad')).toThrow(GhostError);
  });
});

describe('validateJson', () => {
  it('returns valid:true for valid JSON', () => {
    expect(validateJson('{"x":1}')).toEqual({ valid: true });
  });

  it('returns valid:false with error message for invalid JSON', () => {
    const result = validateJson('not json');
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('accepts null', () => {
    expect(validateJson('null')).toEqual({ valid: true });
  });
});

describe('jsonToTsTypes', () => {
  it('converts an object', () => {
    const result = jsonToTsTypes('{"name":"alice","age":30}');
    expect(result).toContain('interface Root');
    expect(result).toContain('name: string');
    expect(result).toContain('age: number');
  });

  it('handles null values', () => {
    const result = jsonToTsTypes('{"x":null}');
    expect(result).toContain('null');
  });

  it('handles boolean values', () => {
    const result = jsonToTsTypes('{"ok":true}');
    expect(result).toContain('boolean');
  });

  it('handles arrays', () => {
    const result = jsonToTsTypes('{"items":[1,2,3]}');
    expect(result).toContain('number[]');
  });

  it('handles empty arrays', () => {
    const result = jsonToTsTypes('{"items":[]}');
    expect(result).toContain('unknown[]');
  });

  it('throws GhostError on invalid JSON', () => {
    expect(() => jsonToTsTypes('bad')).toThrow(GhostError);
  });
});

describe('jsonToZodSchema', () => {
  it('converts object to zod schema', () => {
    const result = jsonToZodSchema('{"name":"alice"}');
    expect(result).toContain('z.object');
    expect(result).toContain('z.string()');
  });

  it('converts number', () => {
    expect(jsonToZodSchema('42')).toContain('z.number()');
  });

  it('converts boolean', () => {
    expect(jsonToZodSchema('true')).toContain('z.boolean()');
  });

  it('converts null', () => {
    expect(jsonToZodSchema('null')).toContain('z.null()');
  });

  it('converts array', () => {
    expect(jsonToZodSchema('[1]')).toContain('z.array');
  });

  it('converts empty array', () => {
    expect(jsonToZodSchema('[]')).toContain('z.array(z.unknown())');
  });

  it('throws GhostError on invalid JSON', () => {
    expect(() => jsonToZodSchema('bad')).toThrow(GhostError);
  });
});

// ─── regex ──────────────────────────────────────────────────────────────────

describe('testRegex', () => {
  it('finds all matches', () => {
    const result = testRegex('\\d+', '', 'abc 123 def 456');
    expect(result.isValid).toBe(true);
    expect(result.matches.length).toBe(2);
  });

  it('returns isValid:false for invalid pattern', () => {
    const result = testRegex('[invalid', '', 'test');
    expect(result.isValid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('adds g flag automatically', () => {
    const result = testRegex('a', 'i', 'aAbB');
    expect(result.isValid).toBe(true);
    expect(result.matches.length).toBe(2);
  });

  it('handles zero-length match guard', () => {
    const result = testRegex('a*', '', 'bb');
    expect(result.isValid).toBe(true);
  });

  it('returns empty matches for no match', () => {
    const result = testRegex('xyz', '', 'abc');
    expect(result.matches.length).toBe(0);
  });
});

describe('explainRegex', () => {
  it('explains empty pattern', () => {
    expect(explainRegex('')).toBe('(empty pattern — matches everything)');
  });

  it('explains literal characters', () => {
    expect(explainRegex('abc')).toContain('"a"');
  });

  it('explains \\d digit shorthand', () => {
    expect(explainRegex('\\d')).toContain('digit');
  });

  it('explains \\w word shorthand', () => {
    expect(explainRegex('\\w')).toContain('word character');
  });

  it('explains \\s whitespace shorthand', () => {
    expect(explainRegex('\\s')).toContain('whitespace');
  });

  it('explains ^ anchor', () => {
    expect(explainRegex('^')).toContain('start of string');
  });

  it('explains $ anchor', () => {
    expect(explainRegex('$')).toContain('end of string');
  });

  it('explains . dot', () => {
    expect(explainRegex('.')).toContain('any character');
  });

  it('explains * quantifier', () => {
    expect(explainRegex('a*')).toContain('zero or more');
  });

  it('explains + quantifier', () => {
    expect(explainRegex('a+')).toContain('one or more');
  });

  it('explains ? quantifier', () => {
    expect(explainRegex('a?')).toContain('optionally');
  });

  it('explains lazy quantifier', () => {
    expect(explainRegex('a*?')).toContain('lazy');
  });

  it('explains {n} quantifier', () => {
    expect(explainRegex('a{3}')).toContain('exactly 3');
  });

  it('explains {n,m} quantifier', () => {
    expect(explainRegex('a{2,5}')).toContain('between 2 and 5');
  });

  it('explains {n,} quantifier', () => {
    expect(explainRegex('a{2,}')).toContain('at least 2');
  });

  it('explains character class', () => {
    expect(explainRegex('[abc]')).toContain('abc');
  });

  it('explains negated character class', () => {
    expect(explainRegex('[^abc]')).toContain('except');
  });

  it('explains alternation', () => {
    expect(explainRegex('a|b')).toContain('OR');
  });

  it('explains capturing group', () => {
    expect(explainRegex('(abc)')).toContain('capturing group');
  });

  it('explains non-capturing group', () => {
    expect(explainRegex('(?:abc)')).toContain('non-capturing group');
  });

  it('explains lookahead', () => {
    expect(explainRegex('(?=abc)')).toContain('lookahead');
  });

  it('explains negative lookahead', () => {
    expect(explainRegex('(?!abc)')).toContain('negative lookahead');
  });

  it('explains word boundary \\b', () => {
    expect(explainRegex('\\b')).toContain('word boundary');
  });

  it('explains back-reference', () => {
    expect(explainRegex('\\1')).toContain('back-reference');
  });

  it('explains escape sequences', () => {
    expect(explainRegex('\\n')).toContain('newline');
    expect(explainRegex('\\t')).toContain('tab');
  });
});

// ─── jwt ────────────────────────────────────────────────────────────────────

// A real JWT (no exp) — header.payload.signature
const VALID_JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' +
  '.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ' +
  '.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

// An expired JWT (exp in the past)
const EXPIRED_JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' +
  '.eyJzdWIiOiIxIiwiZXhwIjoxfQ' +
  '.signature';

describe('decodeJwt', () => {
  it('decodes a valid JWT', () => {
    const result = decodeJwt(VALID_JWT);
    expect(result.error).toBeUndefined();
    expect((result.payload as Record<string, unknown>)['name']).toBe('John Doe');
  });

  it('returns header alg', () => {
    const result = decodeJwt(VALID_JWT);
    expect((result.header as Record<string, unknown>)['alg']).toBe('HS256');
  });

  it('detects expired JWT', () => {
    const result = decodeJwt(EXPIRED_JWT);
    expect(result.isExpired).toBe(true);
    expect(result.expiresAt).toBeDefined();
  });

  it('reports error for wrong number of segments', () => {
    const result = decodeJwt('a.b');
    expect(result.error).toContain('3 dot-separated segments');
  });

  it('reports error for corrupt header', () => {
    const result = decodeJwt('!!!.payload.sig');
    expect(result.error).toBeDefined();
  });

  it('reports error for corrupt payload', () => {
    // Valid base64url header but corrupt payload
    const result = decodeJwt('eyJhbGciOiJIUzI1NiJ9.!!!.sig');
    expect(result.error).toBeDefined();
  });

  it('trims whitespace from token', () => {
    const result = decodeJwt('  ' + VALID_JWT + '  ');
    expect(result.error).toBeUndefined();
  });
});

// ─── hash ───────────────────────────────────────────────────────────────────

describe('hashText', () => {
  it('produces sha256 hash', () => {
    const h = hashText('hello', 'sha256');
    expect(h).toHaveLength(64);
    expect(h).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  });

  it('produces sha512 hash', () => {
    const h = hashText('hello', 'sha512');
    expect(h).toHaveLength(128);
  });

  it('produces sha1 hash', () => {
    const h = hashText('hello', 'sha1');
    expect(h).toHaveLength(40);
  });

  it('produces md5 hash', () => {
    const h = hashText('hello', 'md5');
    expect(h).toHaveLength(32);
  });

  it('is deterministic', () => {
    expect(hashText('test', 'sha256')).toBe(hashText('test', 'sha256'));
  });

  it('differs for different inputs', () => {
    expect(hashText('a', 'sha256')).not.toBe(hashText('b', 'sha256'));
  });
});

describe('generateUuid', () => {
  it('generates v4 UUID', () => {
    const id = generateUuid('v4');
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('generates v7 UUID', () => {
    const id = generateUuid('v7');
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('generates unique v4 UUIDs', () => {
    expect(generateUuid('v4')).not.toBe(generateUuid('v4'));
  });

  it('generates unique v7 UUIDs', () => {
    expect(generateUuid('v7')).not.toBe(generateUuid('v7'));
  });

  it('v7 UUID encodes current timestamp in first 48 bits', () => {
    const before = Date.now();
    const id = generateUuid('v7');
    const after = Date.now();
    // Reconstruct the ms timestamp from the first 12 hex chars (48 bits)
    const tsPart = id.replace(/-/g, '').slice(0, 12);
    const ts = parseInt(tsPart, 16);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});

// ─── diff ───────────────────────────────────────────────────────────────────

describe('diffText', () => {
  it('marks identical text as unchanged', () => {
    const result = diffText('hello\nworld', 'hello\nworld');
    expect(result.every((l) => l.type === 'unchanged')).toBe(true);
  });

  it('marks added lines', () => {
    const result = diffText('', 'new line');
    expect(result.some((l) => l.type === 'added' && l.content === 'new line')).toBe(true);
  });

  it('marks removed lines', () => {
    const result = diffText('old line', '');
    expect(result.some((l) => l.type === 'removed' && l.content === 'old line')).toBe(true);
  });

  it('returns empty array for two empty strings', () => {
    expect(diffText('', '')).toHaveLength(0);
  });

  it('handles mixed changes', () => {
    const result = diffText('a\nb\nc', 'a\nX\nc');
    const types = result.map((l) => l.type);
    expect(types).toContain('removed');
    expect(types).toContain('added');
    expect(types).toContain('unchanged');
  });

  it('produces correct order', () => {
    const result = diffText('a\nb', 'a\nc');
    expect(result[0]!.content).toBe('a');
    expect(result[0]!.type).toBe('unchanged');
  });
});

// ─── timestamp ──────────────────────────────────────────────────────────────

describe('unixToHuman', () => {
  it('converts unix 0 to epoch', () => {
    expect(unixToHuman(0)).toBe('1970-01-01T00:00:00.000Z');
  });

  it('converts a known timestamp', () => {
    expect(unixToHuman(1_700_000_000)).toBe('2023-11-14T22:13:20.000Z');
  });
});

describe('humanToUnix', () => {
  it('converts ISO string to unix', () => {
    expect(humanToUnix('1970-01-01T00:00:00Z')).toBe(0);
  });

  it('round-trips with unixToHuman', () => {
    const ts = 1_700_000_000;
    expect(humanToUnix(unixToHuman(ts))).toBe(ts);
  });

  it('throws GhostError for invalid date', () => {
    expect(() => humanToUnix('not-a-date')).toThrow(GhostError);
  });
});

describe('nowUnix', () => {
  it('returns a number close to the current time', () => {
    const before = Math.floor(Date.now() / 1000) - 1;
    const ts = nowUnix();
    const after = Math.floor(Date.now() / 1000) + 1;
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});

// ─── cron ───────────────────────────────────────────────────────────────────

describe('explainCron', () => {
  it('explains every minute', () => {
    expect(explainCron('* * * * *')).toBe('Every minute');
  });

  it('explains daily at midnight', () => {
    expect(explainCron('0 0 * * *')).toContain('midnight');
  });

  it('explains daily at noon', () => {
    expect(explainCron('0 12 * * *')).toContain('noon');
  });

  it('explains every hour', () => {
    expect(explainCron('0 * * * *')).toContain('hour');
  });

  it('explains every N minutes', () => {
    expect(explainCron('*/15 * * * *')).toContain('15 minutes');
  });

  it('explains every N hours', () => {
    expect(explainCron('0 */6 * * *')).toContain('6 hours');
  });

  it('explains weekday restriction', () => {
    expect(explainCron('0 9 * * 1-5')).toContain('Monday through Friday');
  });

  it('explains Sunday', () => {
    expect(explainCron('0 0 * * 0')).toContain('Sunday');
  });

  it('explains Saturday', () => {
    expect(explainCron('0 0 * * 6')).toContain('Saturday');
  });

  it('explains day-of-month', () => {
    expect(explainCron('0 9 15 * *')).toContain('15');
  });

  it('explains month restriction', () => {
    expect(explainCron('0 0 1 1 *')).toContain('January');
  });

  it('explains step in day-of-month', () => {
    expect(explainCron('0 0 */3 * *')).toContain('3 days');
  });

  it('explains step in month', () => {
    expect(explainCron('0 0 1 */2 *')).toContain('2 months');
  });

  it('explains hour range', () => {
    expect(explainCron('0 9-17 * * *')).toContain('9 AM');
  });

  it('explains PM hours', () => {
    expect(explainCron('0 15 * * *')).toContain('PM');
  });

  it('explains AM hours', () => {
    expect(explainCron('0 9 * * *')).toContain('AM');
  });

  it('throws GhostError for wrong field count', () => {
    expect(() => explainCron('* * * *')).toThrow(GhostError);
  });

  it('explains named weekday', () => {
    expect(explainCron('0 9 * * mon')).toContain('Monday');
  });

  it('explains named month', () => {
    expect(explainCron('0 0 1 dec *')).toContain('December');
  });
});

describe('nextRuns', () => {
  it('returns the requested number of runs', () => {
    const runs = nextRuns('* * * * *', 5);
    expect(runs).toHaveLength(5);
  });

  it('returns Date objects', () => {
    const [first] = nextRuns('* * * * *', 1);
    expect(first).toBeInstanceOf(Date);
  });

  it('returns runs in ascending order', () => {
    const runs = nextRuns('* * * * *', 3);
    for (let i = 1; i < runs.length; i++) {
      expect(runs[i]!.getTime()).toBeGreaterThan(runs[i - 1]!.getTime());
    }
  });

  it('throws GhostError for invalid expression', () => {
    expect(() => nextRuns('bad expression', 1)).toThrow(GhostError);
  });

  it('handles hourly expression', () => {
    const runs = nextRuns('0 * * * *', 3);
    expect(runs).toHaveLength(3);
    for (const run of runs) {
      expect(run.getMinutes()).toBe(0);
    }
  });

  it('handles leap year Feb 29 (may return empty within 4 years)', () => {
    // Feb 29 happens every 4 years — just verify it doesn't throw
    expect(() => nextRuns('0 0 29 2 *', 1)).not.toThrow();
  });

  it('Sunday treated as 0 and 7 equivalently', () => {
    const r0 = nextRuns('0 0 * * 0', 2);
    const r7 = nextRuns('0 0 * * 7', 2);
    expect(r0[0]?.getDay()).toBe(0);
    expect(r7[0]?.getDay()).toBe(0);
  });
});

// ─── encoder ────────────────────────────────────────────────────────────────

describe('encodeBase64 / decodeBase64', () => {
  it('round-trips ASCII', () => {
    const original = 'Hello, World!';
    expect(decodeBase64(encodeBase64(original))).toBe(original);
  });

  it('encodes correctly', () => {
    expect(encodeBase64('Man')).toBe('TWFu');
  });

  it('handles empty string', () => {
    expect(encodeBase64('')).toBe('');
    expect(decodeBase64('')).toBe('');
  });
});

describe('encodeUrl / decodeUrl', () => {
  it('encodes special characters', () => {
    expect(encodeUrl('hello world')).toBe('hello%20world');
  });

  it('round-trips a URL component', () => {
    const original = 'foo=bar&baz=qux';
    expect(decodeUrl(encodeUrl(original))).toBe(original);
  });

  it('throws GhostError for malformed encoding', () => {
    expect(() => decodeUrl('%GG')).toThrow(GhostError);
  });
});

describe('encodeHtml / decodeHtml', () => {
  it('encodes HTML entities', () => {
    expect(encodeHtml('<script>')).toBe('&lt;script&gt;');
    expect(encodeHtml('"hello"')).toBe('&quot;hello&quot;');
    expect(encodeHtml("it's")).toBe('it&#39;s');
    expect(encodeHtml('a&b')).toBe('a&amp;b');
  });

  it('decodes HTML entities', () => {
    expect(decodeHtml('&lt;div&gt;')).toBe('<div>');
    expect(decodeHtml('&amp;')).toBe('&');
    expect(decodeHtml('&quot;')).toBe('"');
    expect(decodeHtml('&#39;')).toBe("'");
    expect(decodeHtml('&apos;')).toBe("'");
  });

  it('round-trips HTML encoding', () => {
    const original = '<p class="test">it\'s a & sign</p>';
    expect(decodeHtml(encodeHtml(original))).toBe(original);
  });
});

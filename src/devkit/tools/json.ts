import { GhostError } from '../../ghost/errors.js';

export function formatJson(input: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input) as unknown;
  } catch (e) {
    throw new GhostError({
      code: 'INVALID_JSON',
      message: 'Cannot format invalid JSON',
      hint: e instanceof Error ? e.message : 'Check JSON syntax',
    });
  }
  return JSON.stringify(parsed, null, 2);
}

export function minifyJson(input: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input) as unknown;
  } catch (e) {
    throw new GhostError({
      code: 'INVALID_JSON',
      message: 'Cannot minify invalid JSON',
      hint: e instanceof Error ? e.message : 'Check JSON syntax',
    });
  }
  return JSON.stringify(parsed);
}

export function validateJson(input: string): { valid: boolean; error?: string } {
  try {
    JSON.parse(input);
    return { valid: true };
  } catch (e) {
    return { valid: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function valueToTsType(value: unknown, depth: number): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'string':  return 'string';
    case 'number':  return 'number';
    case 'boolean': return 'boolean';
    case 'undefined': return 'undefined';
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return 'unknown[]';
    const elementType = valueToTsType(value[0], depth);
    return `${elementType}[]`;
  }

  if (typeof value === 'object') {
    const pad = '  '.repeat(depth + 1);
    const closePad = '  '.repeat(depth);
    const fields = Object.entries(value as Record<string, unknown>)
      .map(([key, val]) => `${pad}${key}: ${valueToTsType(val, depth + 1)};`)
      .join('\n');
    return `{\n${fields}\n${closePad}}`;
  }

  return 'unknown';
}

export function jsonToTsTypes(input: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input) as unknown;
  } catch (e) {
    throw new GhostError({
      code: 'INVALID_JSON',
      message: 'Cannot convert invalid JSON to TypeScript types',
      hint: e instanceof Error ? e.message : 'Check JSON syntax',
    });
  }
  return `interface Root ${valueToTsType(parsed, 0)}`;
}

function valueToZodType(value: unknown, depth: number): string {
  if (value === null) return 'z.null()';
  switch (typeof value) {
    case 'string':  return 'z.string()';
    case 'number':  return 'z.number()';
    case 'boolean': return 'z.boolean()';
    case 'undefined': return 'z.undefined()';
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return 'z.array(z.unknown())';
    return `z.array(${valueToZodType(value[0], depth)})`;
  }

  if (typeof value === 'object') {
    const pad = '  '.repeat(depth + 1);
    const closePad = '  '.repeat(depth);
    const fields = Object.entries(value as Record<string, unknown>)
      .map(([key, val]) => `${pad}${key}: ${valueToZodType(val, depth + 1)},`)
      .join('\n');
    return `z.object({\n${fields}\n${closePad}})`;
  }

  return 'z.unknown()';
}

export function jsonToZodSchema(input: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input) as unknown;
  } catch (e) {
    throw new GhostError({
      code: 'INVALID_JSON',
      message: 'Cannot convert invalid JSON to Zod schema',
      hint: e instanceof Error ? e.message : 'Check JSON syntax',
    });
  }
  return `const schema = ${valueToZodType(parsed, 0)};`;
}

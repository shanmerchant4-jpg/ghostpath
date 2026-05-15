export function testRegex(
  pattern: string,
  flags: string,
  input: string,
): { matches: RegExpMatchArray[]; isValid: boolean; error?: string } {
  let re: RegExp;
  try {
    // Always include 'g' so we can iterate all matches
    const effectiveFlags = flags.includes('g') ? flags : flags + 'g';
    re = new RegExp(pattern, effectiveFlags);
  } catch (e) {
    return {
      matches: [],
      isValid: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  const matches: RegExpMatchArray[] = [];
  let match: RegExpExecArray | null;
  // Guard against infinite loops from zero-length matches (e.g. /a*/)
  let lastIndex = -1;
  while ((match = re.exec(input)) !== null) {
    matches.push(match);
    if (re.lastIndex === lastIndex) {
      re.lastIndex++;
    }
    lastIndex = re.lastIndex;
  }

  return { matches, isValid: true };
}

type AtomResult = { desc: string; length: number };

function parseAtom(pattern: string, pos: number): AtomResult | null {
  const ch = pattern[pos];
  if (ch === undefined || ch === ')' || ch === '|') return null;

  if (ch === '\\') {
    const next = pattern[pos + 1];
    if (next === undefined) return { desc: 'a literal backslash', length: 1 };
    let desc: string;
    switch (next) {
      case 'd': desc = 'a digit (0–9)'; break;
      case 'D': desc = 'a non-digit'; break;
      case 'w': desc = 'a word character (a–z, A–Z, 0–9, _)'; break;
      case 'W': desc = 'a non-word character'; break;
      case 's': desc = 'a whitespace character'; break;
      case 'S': desc = 'a non-whitespace character'; break;
      case 'b': desc = 'a word boundary'; break;
      case 'B': desc = 'a non-word boundary'; break;
      case 'n': desc = 'a newline'; break;
      case 't': desc = 'a tab'; break;
      case 'r': desc = 'a carriage return'; break;
      case '0': desc = 'a null character'; break;
      default:
        if (/[1-9]/.test(next)) {
          desc = `back-reference to group ${next}`;
        } else {
          desc = `a literal "${next}"`;
        }
    }
    return { desc, length: 2 };
  }

  if (ch === '^') return { desc: 'start of string', length: 1 };
  if (ch === '$') return { desc: 'end of string', length: 1 };
  if (ch === '.') return { desc: 'any character except newline', length: 1 };

  if (ch === '[') {
    const negated = pattern[pos + 1] === '^';
    const contentStart = pos + (negated ? 2 : 1);
    let end = contentStart;
    // Scan for the closing ] handling escaped ]
    while (end < pattern.length) {
      if (pattern[end] === ']' && end !== contentStart) break;
      if (pattern[end] === '\\') end++; // skip escaped char
      end++;
    }
    const classContent = pattern.slice(contentStart, end);
    const desc = negated
      ? `any character except [${classContent}]`
      : `one character of [${classContent}]`;
    return { desc, length: end - pos + 1 };
  }

  if (ch === '(') {
    let groupDesc = 'capturing group';
    let scanFrom = pos + 1;
    if (pattern[pos + 1] === '?') {
      switch (pattern[pos + 2]) {
        case ':': groupDesc = 'non-capturing group'; scanFrom = pos + 3; break;
        case '=': groupDesc = 'positive lookahead'; scanFrom = pos + 3; break;
        case '!': groupDesc = 'negative lookahead'; scanFrom = pos + 3; break;
        case '<':
          if (pattern[pos + 3] === '=') { groupDesc = 'positive lookbehind'; scanFrom = pos + 4; }
          else if (pattern[pos + 3] === '!') { groupDesc = 'negative lookbehind'; scanFrom = pos + 4; }
          else { groupDesc = 'named capturing group'; scanFrom = pos + 4; }
          break;
      }
    }
    let depth = 1;
    let scanPos = scanFrom;
    while (scanPos < pattern.length && depth > 0) {
      if (pattern[scanPos] === '\\') { scanPos += 2; continue; }
      if (pattern[scanPos] === '(') depth++;
      else if (pattern[scanPos] === ')') depth--;
      scanPos++;
    }
    return { desc: `a ${groupDesc}`, length: scanPos - pos };
  }

  // Literal character — escape for readability
  const special = '.^$*+?{}[]\\|()/';
  if (special.includes(ch)) return { desc: `"${ch}"`, length: 1 };
  return { desc: `the character "${ch}"`, length: 1 };
}

function readQuantifier(
  pattern: string,
  pos: number,
): { prefix: string; length: number } | null {
  const ch = pattern[pos];
  if (ch === undefined) return null;

  const isLazy = pattern[pos + 1] === '?';
  const lazySuffix = isLazy ? ' (lazy)' : '';

  if (ch === '*') return { prefix: 'zero or more' + lazySuffix, length: isLazy ? 2 : 1 };
  if (ch === '+') return { prefix: 'one or more' + lazySuffix, length: isLazy ? 2 : 1 };
  if (ch === '?') return { prefix: 'optionally' + lazySuffix, length: isLazy ? 2 : 1 };

  if (ch === '{') {
    const closeBrace = pattern.indexOf('}', pos + 1);
    if (closeBrace === -1) return null;
    const content = pattern.slice(pos + 1, closeBrace);
    const commaIdx = content.indexOf(',');
    let prefix: string;
    if (commaIdx === -1) {
      prefix = content === '1' ? 'exactly 1' : `exactly ${content}`;
    } else {
      const n = content.slice(0, commaIdx).trim();
      const m = content.slice(commaIdx + 1).trim();
      prefix = m === '' ? `at least ${n}` : `between ${n} and ${m}`;
    }
    const baseLen = closeBrace - pos + 1;
    const isLazy2 = pattern[closeBrace + 1] === '?';
    return {
      prefix: prefix + (isLazy2 ? ' (lazy)' : ''),
      length: isLazy2 ? baseLen + 1 : baseLen,
    };
  }

  return null;
}

export function explainRegex(pattern: string): string {
  if (pattern.length === 0) return '(empty pattern — matches everything)';

  const parts: string[] = [];
  let pos = 0;

  while (pos < pattern.length) {
    // Handle alternation at the top level
    if (pattern[pos] === '|') {
      parts.push('OR');
      pos++;
      continue;
    }

    const atomResult = parseAtom(pattern, pos);
    if (!atomResult) break;

    pos += atomResult.length;
    const quantifier = readQuantifier(pattern, pos);

    if (quantifier) {
      parts.push(`${quantifier.prefix} ${atomResult.desc}`);
      pos += quantifier.length;
    } else {
      parts.push(atomResult.desc);
    }
  }

  return parts.join(', ');
}

import { useEffect, useState } from 'react';
import { formatJson, minifyJson, validateJson, jsonToTsTypes, jsonToZodSchema } from '../../devkit/tools/json';
import { testRegex, explainRegex } from '../../devkit/tools/regex';
import { diffText, type DiffLine } from '../../devkit/tools/diff';
import { explainCron, nextRuns } from '../../devkit/tools/cron';
import { unixToHuman, humanToUnix, nowUnix } from '../../devkit/tools/timestamp';
import { GhostError } from '../../ghost/errors';

// ---------------------------------------------------------------------------
// Browser-native implementations for Node.js-only tools
// ---------------------------------------------------------------------------

async function hashTextBrowser(
  input: string,
  algorithm: 'sha256' | 'sha512' | 'sha1' | 'md5',
): Promise<string> {
  if (algorithm === 'md5') {
    return 'MD5 is not available in browser (Web Crypto does not support it)';
  }
  const algoMap: Record<string, string> = { sha256: 'SHA-256', sha512: 'SHA-512', sha1: 'SHA-1' };
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest(algoMap[algorithm]!, data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function generateUuidBrowser(version: 'v4' | 'v7'): string {
  if (version === 'v4') {
    return crypto.randomUUID();
  }
  // UUID v7 — 48-bit ms timestamp + version + random
  const now = BigInt(Date.now());
  const rand = crypto.getRandomValues(new Uint8Array(10));
  const buf = new Uint8Array(16);
  const view = new DataView(buf.buffer);
  view.setUint32(0, Number((now >> 16n) & 0xffff_ffffn));
  view.setUint16(4, Number(now & 0xffffn));
  buf[6] = 0x70 | (rand[0]! & 0x0f);
  buf[7] = rand[1]!;
  buf[8] = 0x80 | (rand[2]! & 0x3f);
  for (let i = 0; i < 7; i++) buf[9 + i] = rand[3 + i]!;
  const hex = Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function encodeBase64Browser(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
  return btoa(binary);
}

function decodeBase64Browser(input: string): string {
  const binary = atob(input);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function encodeUrlBrowser(input: string): string {
  return encodeURIComponent(input);
}

function decodeUrlBrowser(input: string): string {
  return decodeURIComponent(input);
}

const HTML_ENCODE: readonly [string, string][] = [
  ['&', '&amp;'], ['<', '&lt;'], ['>', '&gt;'], ['"', '&quot;'], ["'", '&#39;'],
];
const HTML_DECODE: readonly [RegExp, string][] = [
  [/&amp;/g, '&'], [/&lt;/g, '<'], [/&gt;/g, '>'], [/&quot;/g, '"'],
  [/&#39;/g, "'"], [/&apos;/g, "'"],
];

function encodeHtmlBrowser(input: string): string {
  let out = input;
  for (const [from, to] of HTML_ENCODE) out = out.split(from).join(to);
  return out;
}

function decodeHtmlBrowser(input: string): string {
  let out = input;
  for (const [re, to] of HTML_DECODE) out = out.replace(re, to);
  return out;
}

function decodeJwtBrowser(token: string): {
  header: object;
  payload: object;
  isExpired: boolean;
  expiresAt?: Date;
  error?: string;
} {
  const parts = token.trim().split('.');
  if (parts.length !== 3) {
    return {
      header: {}, payload: {}, isExpired: false,
      error: `Invalid JWT: expected 3 segments, got ${parts.length}`,
    };
  }

  const decode = (seg: string): unknown => {
    const base64 = seg.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    return JSON.parse(atob(padded)) as unknown;
  };

  let header: object;
  let payload: Record<string, unknown>;

  try {
    header = decode(parts[0]!) as object;
  } catch (e) {
    return { header: {}, payload: {}, isExpired: false, error: `Header decode failed: ${String(e)}` };
  }
  try {
    payload = decode(parts[1]!) as Record<string, unknown>;
  } catch (e) {
    return { header, payload: {}, isExpired: false, error: `Payload decode failed: ${String(e)}` };
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

// ---------------------------------------------------------------------------
// Shared UI primitives
// ---------------------------------------------------------------------------

const SURFACE2 = '#111111';
const BORDER = '1px solid #2a2a2a';

function ToolShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3" style={{ maxWidth: 800 }}>
      {children}
    </div>
  );
}

function Textarea({
  value,
  onChange,
  placeholder,
  rows = 6,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full rounded p-3 outline-none"
      style={{
        background: SURFACE2,
        color: '#e5e5e5',
        border: BORDER,
        fontSize: 13,
        fontFamily: 'inherit',
      }}
    />
  );
}

function Output({ value, style }: { value: string; style?: React.CSSProperties }) {
  return (
    <pre
      className="rounded p-3 overflow-auto"
      style={{
        background: SURFACE2,
        border: BORDER,
        fontSize: 13,
        minHeight: 80,
        maxHeight: 360,
        color: '#a78bfa',
        ...style,
      }}
    >
      {value}
    </pre>
  );
}

function RunButton({ onClick, label = 'Run' }: { onClick: () => void; label?: string }) {
  return (
    <button
      onClick={onClick}
      className="px-4 py-1.5 rounded text-xs font-medium transition-colors"
      style={{ background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer', alignSelf: 'flex-start' }}
    >
      {label}
    </button>
  );
}

function Select<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: readonly T[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className="rounded px-2 py-1 text-xs"
      style={{ background: '#1f2937', color: '#e5e5e5', border: BORDER, cursor: 'pointer' }}
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

// ---------------------------------------------------------------------------
// Tool: JSON
// ---------------------------------------------------------------------------

type JsonMode = 'format' | 'minify' | 'validate' | 'ts-types' | 'zod-schema';
const JSON_MODES: readonly JsonMode[] = ['format', 'minify', 'validate', 'ts-types', 'zod-schema'];

function JsonTool() {
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<JsonMode>('format');
  const [output, setOutput] = useState('');

  const run = () => {
    try {
      let result: string;
      switch (mode) {
        case 'format':      result = formatJson(input); break;
        case 'minify':      result = minifyJson(input); break;
        case 'validate': {
          const r = validateJson(input);
          result = r.valid ? '✓ Valid JSON' : `✗ Invalid: ${r.error ?? ''}`;
          break;
        }
        case 'ts-types':    result = jsonToTsTypes(input); break;
        case 'zod-schema':  result = jsonToZodSchema(input); break;
      }
      setOutput(result);
    } catch (e) {
      setOutput(e instanceof GhostError ? `Error: ${e.message}\nHint: ${e.hint}` : String(e));
    }
  };

  return (
    <ToolShell>
      <div className="flex gap-2 items-center flex-wrap">
        <Select value={mode} onChange={setMode} options={JSON_MODES} />
        <RunButton onClick={run} />
      </div>
      <Textarea value={input} onChange={setInput} placeholder='{"key": "value"}' />
      <Output value={output} />
    </ToolShell>
  );
}

// ---------------------------------------------------------------------------
// Tool: Regex
// ---------------------------------------------------------------------------

function RegexTool() {
  const [pattern, setPattern] = useState('');
  const [flags, setFlags] = useState('gi');
  const [testInput, setTestInput] = useState('');
  const [output, setOutput] = useState('');

  const run = () => {
    const explanation = pattern ? explainRegex(pattern) : '(no pattern)';
    const { matches, isValid, error } = testRegex(pattern, flags, testInput);
    const lines: string[] = [`Pattern: /${pattern}/${flags}`, `Meaning: ${explanation}`, ''];
    if (!isValid) {
      lines.push(`Error: ${error ?? 'invalid regex'}`);
    } else {
      lines.push(`Matches: ${matches.length}`);
      matches.slice(0, 20).forEach((m, i) => {
        lines.push(`  [${i}] "${m[0] ?? ''}" at index ${m.index ?? 0}`);
        if (m.length > 1) {
          for (let g = 1; g < m.length; g++) {
            lines.push(`      group ${g}: "${m[g] ?? ''}"`);
          }
        }
      });
      if (matches.length > 20) lines.push(`  … and ${matches.length - 20} more`);
    }
    setOutput(lines.join('\n'));
  };

  return (
    <ToolShell>
      <div className="flex gap-2 items-center flex-wrap">
        <input
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          placeholder="regex pattern"
          className="flex-1 rounded px-3 py-1.5 text-sm outline-none"
          style={{ background: SURFACE2, color: '#e5e5e5', border: BORDER, fontFamily: 'inherit', minWidth: 200 }}
        />
        <input
          value={flags}
          onChange={(e) => setFlags(e.target.value)}
          placeholder="flags"
          className="rounded px-3 py-1.5 text-sm outline-none"
          style={{ background: SURFACE2, color: '#e5e5e5', border: BORDER, fontFamily: 'inherit', width: 80 }}
        />
        <RunButton onClick={run} />
      </div>
      <Textarea value={testInput} onChange={setTestInput} placeholder="Test string…" rows={4} />
      <Output value={output} />
    </ToolShell>
  );
}

// ---------------------------------------------------------------------------
// Tool: JWT
// ---------------------------------------------------------------------------

function JwtTool() {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');

  const run = () => {
    const result = decodeJwtBrowser(input);
    if (result.error) {
      setOutput(`Error: ${result.error}`);
      return;
    }
    const lines: string[] = [
      '── Header ──',
      JSON.stringify(result.header, null, 2),
      '',
      '── Payload ──',
      JSON.stringify(result.payload, null, 2),
      '',
    ];
    if (result.expiresAt !== undefined) {
      lines.push(`Expires: ${result.expiresAt.toISOString()}`);
      lines.push(result.isExpired ? '⚠  EXPIRED' : '✓ Valid (not expired)');
    } else {
      lines.push('No expiry (no "exp" claim)');
    }
    setOutput(lines.join('\n'));
  };

  return (
    <ToolShell>
      <RunButton onClick={run} />
      <Textarea value={input} onChange={setInput} placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…" rows={4} />
      <Output value={output} />
    </ToolShell>
  );
}

// ---------------------------------------------------------------------------
// Tool: Diff
// ---------------------------------------------------------------------------

function DiffTool() {
  const [inputA, setInputA] = useState('');
  const [inputB, setInputB] = useState('');
  const [lines, setLines] = useState<DiffLine[]>([]);

  const run = () => {
    setLines(diffText(inputA, inputB));
  };

  const lineColor = (type: DiffLine['type']) =>
    type === 'added' ? '#4ade80' : type === 'removed' ? '#f87171' : '#9ca3af';
  const linePrefix = (type: DiffLine['type']) =>
    type === 'added' ? '+ ' : type === 'removed' ? '- ' : '  ';

  return (
    <ToolShell>
      <div className="grid grid-cols-2 gap-2">
        <Textarea value={inputA} onChange={setInputA} placeholder="Text A…" />
        <Textarea value={inputB} onChange={setInputB} placeholder="Text B…" />
      </div>
      <RunButton onClick={run} label="Diff" />
      {lines.length > 0 && (
        <div
          className="rounded p-3 overflow-auto"
          style={{ background: SURFACE2, border: BORDER, fontSize: 13, maxHeight: 360 }}
        >
          {lines.map((line, i) => (
            <div key={i} style={{ color: lineColor(line.type), fontFamily: 'inherit' }}>
              {linePrefix(line.type)}
              {line.content}
            </div>
          ))}
        </div>
      )}
    </ToolShell>
  );
}

// ---------------------------------------------------------------------------
// Tool: Hash
// ---------------------------------------------------------------------------

type HashAlgo = 'sha256' | 'sha512' | 'sha1' | 'md5';
const HASH_ALGOS: readonly HashAlgo[] = ['sha256', 'sha512', 'sha1', 'md5'];
type UuidVersion = 'v4' | 'v7';

function HashTool() {
  const [input, setInput] = useState('');
  const [algo, setAlgo] = useState<HashAlgo>('sha256');
  const [output, setOutput] = useState('');

  const runHash = () => {
    void hashTextBrowser(input, algo).then(setOutput);
  };

  const runUuid = (version: UuidVersion) => {
    setOutput(generateUuidBrowser(version));
  };

  return (
    <ToolShell>
      <div className="flex gap-2 items-center flex-wrap">
        <Select value={algo} onChange={setAlgo} options={HASH_ALGOS} />
        <RunButton onClick={runHash} label="Hash" />
        <span style={{ color: '#6b7280', fontSize: 12 }}>or generate UUID:</span>
        <button
          onClick={() => runUuid('v4')}
          className="px-3 py-1 rounded text-xs"
          style={{ background: '#1f2937', color: '#e5e5e5', border: BORDER, cursor: 'pointer' }}
        >
          UUID v4
        </button>
        <button
          onClick={() => runUuid('v7')}
          className="px-3 py-1 rounded text-xs"
          style={{ background: '#1f2937', color: '#e5e5e5', border: BORDER, cursor: 'pointer' }}
        >
          UUID v7
        </button>
      </div>
      <Textarea value={input} onChange={setInput} placeholder="Text to hash…" rows={4} />
      <Output value={output} />
    </ToolShell>
  );
}

// ---------------------------------------------------------------------------
// Tool: Timestamp
// ---------------------------------------------------------------------------

function TimestampTool() {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [now, setNow] = useState(nowUnix());

  useEffect(() => {
    const id = setInterval(() => setNow(nowUnix()), 1000);
    return () => clearInterval(id);
  }, []);

  const runUnixToHuman = () => {
    try {
      const n = parseInt(input.trim(), 10);
      if (isNaN(n)) { setOutput('Error: not a valid Unix timestamp'); return; }
      setOutput(unixToHuman(n));
    } catch (e) {
      setOutput(e instanceof GhostError ? `Error: ${e.message}` : String(e));
    }
  };

  const runHumanToUnix = () => {
    try {
      setOutput(String(humanToUnix(input.trim())));
    } catch (e) {
      setOutput(e instanceof GhostError ? `Error: ${e.message}` : String(e));
    }
  };

  return (
    <ToolShell>
      <div style={{ fontSize: 12, color: '#6b7280' }}>
        Now: <span style={{ color: '#a78bfa' }}>{now}</span>
        {' '}({unixToHuman(now)})
      </div>
      <Textarea value={input} onChange={setInput} placeholder="Unix timestamp or ISO date string…" rows={2} />
      <div className="flex gap-2 flex-wrap">
        <RunButton onClick={runUnixToHuman} label="Unix → ISO" />
        <RunButton onClick={runHumanToUnix} label="ISO → Unix" />
      </div>
      <Output value={output} />
    </ToolShell>
  );
}

// ---------------------------------------------------------------------------
// Tool: Cron
// ---------------------------------------------------------------------------

function CronTool() {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');

  const run = () => {
    try {
      const explanation = explainCron(input.trim());
      const runs = nextRuns(input.trim(), 8);
      const lines = [
        `Meaning: ${explanation}`,
        '',
        'Next 8 runs:',
        ...runs.map((d, i) => `  ${i + 1}. ${d.toISOString()}`),
      ];
      setOutput(lines.join('\n'));
    } catch (e) {
      setOutput(e instanceof GhostError ? `Error: ${e.message}\nHint: ${e.hint}` : String(e));
    }
  };

  return (
    <ToolShell>
      <Textarea value={input} onChange={setInput} placeholder="* * * * *" rows={2} />
      <RunButton onClick={run} label="Explain" />
      <Output value={output} />
    </ToolShell>
  );
}

// ---------------------------------------------------------------------------
// Tool: Encoder
// ---------------------------------------------------------------------------

type EncoderType = 'Base64' | 'URL' | 'HTML';
type EncoderMode = 'encode' | 'decode';
const ENCODER_TYPES: readonly EncoderType[] = ['Base64', 'URL', 'HTML'];

function EncoderTool() {
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<EncoderMode>('encode');
  const [type, setType] = useState<EncoderType>('Base64');
  const [output, setOutput] = useState('');

  const run = () => {
    try {
      let result: string;
      if (mode === 'encode') {
        switch (type) {
          case 'Base64': result = encodeBase64Browser(input); break;
          case 'URL':    result = encodeUrlBrowser(input); break;
          case 'HTML':   result = encodeHtmlBrowser(input); break;
        }
      } else {
        switch (type) {
          case 'Base64': result = decodeBase64Browser(input); break;
          case 'URL':    result = decodeUrlBrowser(input); break;
          case 'HTML':   result = decodeHtmlBrowser(input); break;
        }
      }
      setOutput(result);
    } catch (e) {
      setOutput(`Error: ${String(e)}`);
    }
  };

  return (
    <ToolShell>
      <div className="flex gap-2 items-center flex-wrap">
        <Select value={type} onChange={setType} options={ENCODER_TYPES} />
        <Select<EncoderMode> value={mode} onChange={setMode} options={['encode', 'decode']} />
        <RunButton onClick={run} />
      </div>
      <Textarea value={input} onChange={setInput} placeholder="Input…" />
      <Output value={output} />
    </ToolShell>
  );
}

// ---------------------------------------------------------------------------
// Root DevKitPanel
// ---------------------------------------------------------------------------

const TOOLS = ['JSON', 'Regex', 'JWT', 'Diff', 'Hash', 'Timestamp', 'Cron', 'Encoder'] as const;
type ToolName = (typeof TOOLS)[number];

export default function DevKitPanel() {
  const [active, setActive] = useState<ToolName>('JSON');

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'TEXTAREA') return;
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const idx = parseInt(e.key, 10) - 1;
      if (idx >= 0 && idx < TOOLS.length) {
        setActive(TOOLS[idx]!);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div>
      <div className="flex gap-1 mb-5 flex-wrap">
        {TOOLS.map((tool, i) => (
          <button
            key={tool}
            onClick={() => setActive(tool)}
            className="px-3 py-1.5 rounded text-xs transition-colors"
            style={{
              background: active === tool ? 'var(--accent)' : '#1f2937',
              color: active === tool ? '#fff' : '#9ca3af',
              border: active === tool ? 'none' : BORDER,
              cursor: 'pointer',
            }}
          >
            <span style={{ opacity: 0.5 }}>{i + 1} </span>
            {tool}
          </button>
        ))}
      </div>

      {active === 'JSON'      && <JsonTool />}
      {active === 'Regex'     && <RegexTool />}
      {active === 'JWT'       && <JwtTool />}
      {active === 'Diff'      && <DiffTool />}
      {active === 'Hash'      && <HashTool />}
      {active === 'Timestamp' && <TimestampTool />}
      {active === 'Cron'      && <CronTool />}
      {active === 'Encoder'   && <EncoderTool />}
    </div>
  );
}

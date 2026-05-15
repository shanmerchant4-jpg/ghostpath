import { describe, it, expect, beforeEach } from 'vitest';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

import {
  createGraph,
  recordCall,
  pruneStale,
  serializeGraph,
  deserializeGraph,
  type CallEvent,
} from '../src/navigator/call-graph.js';
import { getHotPaths, getSlowPaths, formatHotPaths } from '../src/navigator/hotpath.js';
import { findCallers, findCallees, traceOrigin } from '../src/navigator/query.js';
import { createHook, getHookArgs } from '../src/navigator/instrumenter.js';

// ──────────────────────────────────────────────
// call-graph
// ──────────────────────────────────────────────

describe('createGraph', () => {
  it('creates empty graph', () => {
    const g = createGraph();
    expect(g.nodes.size).toBe(0);
    expect(g.edges.size).toBe(0);
  });
});

describe('recordCall', () => {
  it('creates a node on first call', () => {
    const g = createGraph();
    const event: CallEvent = { fnName: 'doWork', file: '/app/worker.ts', durationMs: 10, callerFile: '/app/main.ts' };
    recordCall(g, event);
    const node = g.nodes.get('/app/worker.ts::doWork');
    expect(node).toBeDefined();
    expect(node?.callCount).toBe(1);
    expect(node?.avgDurationMs).toBe(10);
  });

  it('accumulates stats on repeated calls', () => {
    const g = createGraph();
    const event: CallEvent = { fnName: 'doWork', file: '/app/worker.ts', durationMs: 10, callerFile: '/app/main.ts' };
    recordCall(g, event);
    recordCall(g, { ...event, durationMs: 20 });
    const node = g.nodes.get('/app/worker.ts::doWork');
    expect(node?.callCount).toBe(2);
    expect(node?.totalDurationMs).toBe(30);
    expect(node?.avgDurationMs).toBe(15);
  });

  it('creates an edge from callerFile to callee node', () => {
    const g = createGraph();
    recordCall(g, { fnName: 'fn', file: '/app/a.ts', durationMs: 5, callerFile: '/app/b.ts' });
    const edge = g.edges.get('/app/b.ts=>/app/a.ts::fn');
    expect(edge).toBeDefined();
    expect(edge?.from).toBe('/app/b.ts');
    expect(edge?.to).toBe('/app/a.ts::fn');
    expect(edge?.count).toBe(1);
  });

  it('increments edge count on repeated calls', () => {
    const g = createGraph();
    const event: CallEvent = { fnName: 'fn', file: '/app/a.ts', durationMs: 1, callerFile: '/app/b.ts' };
    recordCall(g, event);
    recordCall(g, event);
    expect(g.edges.get('/app/b.ts=>/app/a.ts::fn')?.count).toBe(2);
  });
});

describe('pruneStale', () => {
  it('removes nodes older than maxAgeMs', () => {
    const g = createGraph();
    recordCall(g, { fnName: 'old', file: '/app/a.ts', durationMs: 1, callerFile: 'unknown' });
    const node = g.nodes.get('/app/a.ts::old')!;
    node.lastSeenAt = Date.now() - 10_000;
    pruneStale(g, 5_000);
    expect(g.nodes.has('/app/a.ts::old')).toBe(false);
  });

  it('removes edges pointing to pruned nodes', () => {
    const g = createGraph();
    recordCall(g, { fnName: 'old', file: '/app/a.ts', durationMs: 1, callerFile: '/app/b.ts' });
    g.nodes.get('/app/a.ts::old')!.lastSeenAt = Date.now() - 10_000;
    pruneStale(g, 5_000);
    expect(g.edges.size).toBe(0);
  });

  it('keeps fresh nodes', () => {
    const g = createGraph();
    recordCall(g, { fnName: 'fresh', file: '/app/a.ts', durationMs: 1, callerFile: 'unknown' });
    pruneStale(g, 60_000);
    expect(g.nodes.has('/app/a.ts::fresh')).toBe(true);
  });
});

describe('serializeGraph / deserializeGraph', () => {
  it('round-trips a graph', () => {
    const g = createGraph();
    recordCall(g, { fnName: 'fn', file: '/app/a.ts', durationMs: 7, callerFile: '/app/b.ts' });
    const json = serializeGraph(g);
    const restored = deserializeGraph(json);
    expect(restored.nodes.size).toBe(1);
    expect(restored.edges.size).toBe(1);
    expect(restored.nodes.get('/app/a.ts::fn')?.avgDurationMs).toBe(7);
  });

  it('throws GhostError on invalid JSON', () => {
    expect(() => deserializeGraph('not json')).toThrow();
  });
});

// ──────────────────────────────────────────────
// hotpath
// ──────────────────────────────────────────────

describe('getHotPaths', () => {
  it('returns top N nodes by call count', () => {
    const g = createGraph();
    for (let i = 0; i < 5; i++) {
      recordCall(g, { fnName: `fn${i}`, file: '/app/a.ts', durationMs: 1, callerFile: 'x' });
    }
    // fn0 gets extra calls
    recordCall(g, { fnName: 'fn0', file: '/app/a.ts', durationMs: 1, callerFile: 'x' });
    recordCall(g, { fnName: 'fn0', file: '/app/a.ts', durationMs: 1, callerFile: 'x' });
    const hot = getHotPaths(g, 1);
    expect(hot.length).toBe(1);
    expect(hot[0]!.fnName).toBe('fn0');
  });
});

describe('getSlowPaths', () => {
  it('returns nodes above threshold sorted slowest first', () => {
    const g = createGraph();
    recordCall(g, { fnName: 'fast', file: '/app/a.ts', durationMs: 5, callerFile: 'x' });
    recordCall(g, { fnName: 'slow', file: '/app/a.ts', durationMs: 200, callerFile: 'x' });
    recordCall(g, { fnName: 'slower', file: '/app/a.ts', durationMs: 500, callerFile: 'x' });
    const slow = getSlowPaths(g, 100);
    expect(slow.map((n) => n.fnName)).toEqual(['slower', 'slow']);
  });
});

describe('formatHotPaths', () => {
  it('returns no-data message for empty list', () => {
    expect(formatHotPaths([])).toContain('No hot paths');
  });

  it('renders a table row for each node', () => {
    const g = createGraph();
    recordCall(g, { fnName: 'doThing', file: '/app/worker.ts', durationMs: 12, callerFile: 'x' });
    const output = formatHotPaths(getHotPaths(g, 10));
    expect(output).toContain('doThing');
    expect(output).toContain('worker.ts');
  });
});

// ──────────────────────────────────────────────
// query
// ──────────────────────────────────────────────

describe('findCallers', () => {
  it('returns nodes whose file called the named function', () => {
    const g = createGraph();
    recordCall(g, { fnName: 'serve', file: '/app/server.ts', durationMs: 1, callerFile: '/app/main.ts' });
    recordCall(g, { fnName: 'boot', file: '/app/main.ts', durationMs: 1, callerFile: '/app/index.ts' });
    const callers = findCallers(g, 'serve');
    expect(callers.some((n) => n.file === '/app/main.ts')).toBe(true);
  });

  it('returns empty array when no callers exist', () => {
    const g = createGraph();
    recordCall(g, { fnName: 'lone', file: '/app/a.ts', durationMs: 1, callerFile: 'unknown' });
    expect(findCallers(g, 'lone')).toHaveLength(0);
  });
});

describe('findCallees', () => {
  it('returns nodes called from the given nodeId file', () => {
    const g = createGraph();
    recordCall(g, { fnName: 'helper', file: '/app/util.ts', durationMs: 1, callerFile: '/app/main.ts' });
    recordCall(g, { fnName: 'run', file: '/app/main.ts', durationMs: 1, callerFile: '/app/index.ts' });
    const runId = '/app/main.ts::run';
    const callees = findCallees(g, runId);
    expect(callees.some((n) => n.fnName === 'helper')).toBe(true);
  });

  it('returns empty array for unknown nodeId', () => {
    const g = createGraph();
    expect(findCallees(g, 'no::such')).toHaveLength(0);
  });
});

describe('traceOrigin', () => {
  it('walks caller chain up to maxDepth', () => {
    const g = createGraph();
    // index → main → server
    recordCall(g, { fnName: 'serve', file: '/app/server.ts', durationMs: 1, callerFile: '/app/main.ts' });
    recordCall(g, { fnName: 'init', file: '/app/main.ts', durationMs: 1, callerFile: '/app/index.ts' });
    recordCall(g, { fnName: 'start', file: '/app/index.ts', durationMs: 1, callerFile: 'unknown' });

    const chain = traceOrigin(g, '/app/server.ts::serve', 3);
    const files = chain.map((n) => n.file);
    expect(files).toContain('/app/main.ts');
    expect(files).toContain('/app/index.ts');
  });

  it('respects maxDepth', () => {
    const g = createGraph();
    recordCall(g, { fnName: 'serve', file: '/app/server.ts', durationMs: 1, callerFile: '/app/main.ts' });
    recordCall(g, { fnName: 'init', file: '/app/main.ts', durationMs: 1, callerFile: '/app/index.ts' });
    const chain = traceOrigin(g, '/app/server.ts::serve', 1);
    expect(chain.some((n) => n.file === '/app/main.ts')).toBe(true);
    expect(chain.some((n) => n.file === '/app/index.ts')).toBe(false);
  });

  it('handles cycles without looping', () => {
    const g = createGraph();
    // A calls B, B calls A
    recordCall(g, { fnName: 'fnA', file: '/app/a.ts', durationMs: 1, callerFile: '/app/b.ts' });
    recordCall(g, { fnName: 'fnB', file: '/app/b.ts', durationMs: 1, callerFile: '/app/a.ts' });
    expect(() => traceOrigin(g, '/app/a.ts::fnA', 10)).not.toThrow();
  });
});

// ──────────────────────────────────────────────
// instrumenter
// ──────────────────────────────────────────────

describe('createHook', () => {
  it('writes a .cjs file to the temp directory and returns its path', () => {
    const hookPath = createHook('test-proj');
    expect(hookPath).toContain(os.tmpdir());
    expect(hookPath.endsWith('.cjs')).toBe(true);
    expect(fs.existsSync(hookPath)).toBe(true);
    fs.unlinkSync(hookPath);
  });

  it('generated file contains ghost:call and Module._load', () => {
    const hookPath = createHook('test-proj');
    const content = fs.readFileSync(hookPath, 'utf8');
    expect(content).toContain('ghost:call');
    expect(content).toContain('Module._load');
    fs.unlinkSync(hookPath);
  });

  it('uses a sanitized project name in the filename', () => {
    const hookPath = createHook('my project / test!');
    expect(path.basename(hookPath)).toMatch(/^ghostpath-.*\.cjs$/);
    fs.unlinkSync(hookPath);
  });
});

describe('getHookArgs', () => {
  it('returns ["--require", "<path>"]', () => {
    const args = getHookArgs('test-proj');
    expect(args[0]).toBe('--require');
    expect(args[1]).toContain('ghostpath-test-proj-hook.cjs');
    fs.unlinkSync(args[1]!);
  });
});

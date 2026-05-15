import { GhostError } from '../ghost/errors.js';

export interface CallNode {
  id: string;
  fnName: string;
  file: string;
  callCount: number;
  totalDurationMs: number;
  avgDurationMs: number;
  lastSeenAt: number;
}

export interface CallEdge {
  from: string;
  to: string;
  count: number;
}

export interface CallGraph {
  nodes: Map<string, CallNode>;
  edges: Map<string, CallEdge>;
}

export interface CallEvent {
  fnName: string;
  file: string;
  durationMs: number;
  callerFile: string;
}

export function createGraph(): CallGraph {
  return {
    nodes: new Map(),
    edges: new Map(),
  };
}

export function recordCall(graph: CallGraph, event: CallEvent): void {
  const { fnName, file, durationMs, callerFile } = event;
  const nodeId = `${file}::${fnName}`;
  const now = Date.now();

  const existing = graph.nodes.get(nodeId);
  if (existing) {
    existing.callCount += 1;
    existing.totalDurationMs += durationMs;
    existing.avgDurationMs = existing.totalDurationMs / existing.callCount;
    existing.lastSeenAt = now;
  } else {
    graph.nodes.set(nodeId, {
      id: nodeId,
      fnName,
      file,
      callCount: 1,
      totalDurationMs: durationMs,
      avgDurationMs: durationMs,
      lastSeenAt: now,
    });
  }

  const edgeKey = `${callerFile}=>${nodeId}`;
  const existingEdge = graph.edges.get(edgeKey);
  if (existingEdge) {
    existingEdge.count += 1;
  } else {
    graph.edges.set(edgeKey, { from: callerFile, to: nodeId, count: 1 });
  }
}

export function pruneStale(graph: CallGraph, maxAgeMs: number): void {
  const cutoff = Date.now() - maxAgeMs;
  const pruned = new Set<string>();

  for (const [id, node] of graph.nodes) {
    if (node.lastSeenAt < cutoff) {
      graph.nodes.delete(id);
      pruned.add(id);
    }
  }

  for (const [key, edge] of graph.edges) {
    if (pruned.has(edge.to)) {
      graph.edges.delete(key);
    }
  }
}

interface SerializedGraph {
  nodes: [string, CallNode][];
  edges: [string, CallEdge][];
}

export function serializeGraph(graph: CallGraph): string {
  const data: SerializedGraph = {
    nodes: Array.from(graph.nodes.entries()),
    edges: Array.from(graph.edges.entries()),
  };
  return JSON.stringify(data);
}

export function deserializeGraph(json: string): CallGraph {
  try {
    const data = JSON.parse(json) as SerializedGraph;
    return {
      nodes: new Map(data.nodes),
      edges: new Map(data.edges),
    };
  } catch {
    throw new GhostError({
      code: 'GRAPH_DESERIALIZE_FAILED',
      message: 'Failed to deserialize call graph from JSON',
      hint: 'The trace file may be corrupted. Delete ~/.ghostpath/traces/ to reset.',
    });
  }
}

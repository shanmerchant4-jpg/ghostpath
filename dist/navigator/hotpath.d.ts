import type { CallGraph, CallNode } from './call-graph.js';
export declare function getHotPaths(graph: CallGraph, topN: number): CallNode[];
export declare function getSlowPaths(graph: CallGraph, thresholdMs: number): CallNode[];
export declare function formatHotPaths(nodes: CallNode[]): string;

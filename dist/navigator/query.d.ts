import type { CallGraph, CallNode } from './call-graph.js';
export declare function findCallers(graph: CallGraph, fnName: string): CallNode[];
export declare function findCallees(graph: CallGraph, nodeId: string): CallNode[];
export declare function traceOrigin(graph: CallGraph, nodeId: string, maxDepth: number): CallNode[];

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
export declare function createGraph(): CallGraph;
export declare function recordCall(graph: CallGraph, event: CallEvent): void;
export declare function pruneStale(graph: CallGraph, maxAgeMs: number): void;
export declare function serializeGraph(graph: CallGraph): string;
export declare function deserializeGraph(json: string): CallGraph;

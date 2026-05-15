export function findCallers(graph, fnName) {
    // Collect all node IDs whose function name matches
    const calleeIds = new Set();
    for (const [id, node] of graph.nodes) {
        if (node.fnName === fnName)
            calleeIds.add(id);
    }
    // Collect caller file paths from edges that point to those callees
    const callerFiles = new Set();
    for (const edge of graph.edges.values()) {
        if (calleeIds.has(edge.to))
            callerFiles.add(edge.from);
    }
    // Return nodes whose file appears as a caller file
    const result = [];
    const seen = new Set();
    for (const node of graph.nodes.values()) {
        if (callerFiles.has(node.file) && !seen.has(node.id)) {
            seen.add(node.id);
            result.push(node);
        }
    }
    return result;
}
export function findCallees(graph, nodeId) {
    const node = graph.nodes.get(nodeId);
    if (!node)
        return [];
    // Find all edges originating from this node's file
    const calleeIds = new Set();
    for (const edge of graph.edges.values()) {
        if (edge.from === node.file)
            calleeIds.add(edge.to);
    }
    const result = [];
    for (const id of calleeIds) {
        const callee = graph.nodes.get(id);
        if (callee)
            result.push(callee);
    }
    return result;
}
export function traceOrigin(graph, nodeId, maxDepth) {
    const result = [];
    // Include the starting node in visited to prevent cycles from looping back to it
    const visited = new Set([nodeId]);
    let currentLevel = new Set([nodeId]);
    for (let depth = 0; depth < maxDepth; depth++) {
        const nextLevel = new Set();
        for (const id of currentLevel) {
            for (const edge of graph.edges.values()) {
                if (edge.to !== id)
                    continue;
                for (const [nid, n] of graph.nodes) {
                    if (n.file === edge.from && !visited.has(nid)) {
                        visited.add(nid);
                        result.push(n);
                        nextLevel.add(nid);
                    }
                }
            }
        }
        if (nextLevel.size === 0)
            break;
        currentLevel = nextLevel;
    }
    return result;
}

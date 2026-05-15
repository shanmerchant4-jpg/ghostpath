import path from 'node:path';
import chalk from 'chalk';
export function getHotPaths(graph, topN) {
    return [...graph.nodes.values()]
        .sort((a, b) => b.callCount - a.callCount)
        .slice(0, topN);
}
export function getSlowPaths(graph, thresholdMs) {
    return [...graph.nodes.values()]
        .filter((n) => n.avgDurationMs > thresholdMs)
        .sort((a, b) => b.avgDurationMs - a.avgDurationMs);
}
const COL = { rank: 4, fn: 24, file: 28, calls: 8, avg: 10 };
const TOTAL_WIDTH = COL.rank + COL.fn + COL.file + COL.calls + COL.avg;
export function formatHotPaths(nodes) {
    if (nodes.length === 0) {
        return chalk.dim('No hot paths recorded yet.');
    }
    const header = chalk.bold.white('#'.padEnd(COL.rank)) +
        chalk.bold.white('Function'.padEnd(COL.fn)) +
        chalk.bold.white('File'.padEnd(COL.file)) +
        chalk.bold.white('Calls'.padStart(COL.calls)) +
        chalk.bold.white('Avg ms'.padStart(COL.avg));
    const divider = chalk.dim('─'.repeat(TOTAL_WIDTH));
    const rows = nodes.map((node, i) => {
        const rank = chalk.dim(String(i + 1).padEnd(COL.rank));
        const fn = chalk.cyan(node.fnName.slice(0, COL.fn - 1).padEnd(COL.fn));
        const file = chalk.yellow(path.basename(node.file).slice(0, COL.file - 1).padEnd(COL.file));
        const calls = chalk.green(String(node.callCount).padStart(COL.calls));
        const avg = chalk.magenta(node.avgDurationMs.toFixed(2).padStart(COL.avg));
        return rank + fn + file + calls + avg;
    });
    return [header, divider, ...rows].join('\n');
}

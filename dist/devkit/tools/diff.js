function buildLcsMatrix(a, b) {
    const m = a.length;
    const n = b.length;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (a[i - 1] === b[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            }
            else {
                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
    }
    return dp;
}
export function diffText(a, b) {
    const linesA = a.length === 0 ? [] : a.split('\n');
    const linesB = b.length === 0 ? [] : b.split('\n');
    if (linesA.length === 0 && linesB.length === 0)
        return [];
    const dp = buildLcsMatrix(linesA, linesB);
    const ops = [];
    let i = linesA.length;
    let j = linesB.length;
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && linesA[i - 1] === linesB[j - 1]) {
            ops.push({ type: 'unchanged', content: linesA[i - 1] });
            i--;
            j--;
        }
        else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
            // Prefer consuming from b (added) on ties so that removed lines appear
            // before added lines after the array is reversed.
            ops.push({ type: 'added', content: linesB[j - 1] });
            j--;
        }
        else {
            ops.push({ type: 'removed', content: linesA[i - 1] });
            i--;
        }
    }
    return ops.reverse();
}

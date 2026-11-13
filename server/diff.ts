import type {
  AuditFinding,
  DiffHunk,
  DiffLine,
  MetricDelta,
  ArtifactRecord,
  VersionDiffResult,
} from '../src/types/artifact.ts';

interface RawDiffOp {
  type: 'context' | 'add' | 'remove';
  baseLine: number | null;
  targetLine: number | null;
  content: string;
}

function computeLineDiffOps(baseText: string, targetText: string): RawDiffOp[] {
  const a = baseText.replace(/\r\n/g, '\n').split('\n');
  const b = targetText.replace(/\r\n/g, '\n').split('\n');
  const n = a.length;
  const m = b.length;

  // Trim common prefix and suffix for fast, low-memory LCS
  let start = 0;
  while (start < n && start < m && a[start] === b[start]) {
    start++;
  }
  let endA = n - 1;
  let endB = m - 1;
  while (endA >= start && endB >= start && a[endA] === b[endB]) {
    endA--;
    endB--;
  }

  const ops: RawDiffOp[] = [];
  for (let i = 0; i < start; i++) {
    ops.push({ type: 'context', baseLine: i + 1, targetLine: i + 1, content: a[i] });
  }

  const midA = a.slice(start, endA + 1);
  const midB = b.slice(start, endB + 1);
  const lenA = midA.length;
  const lenB = midB.length;

  // Guard for very huge files (>4000 differing lines) with linear fallback
  if (lenA * lenB > 4_000_000) {
    midA.forEach((line, i) =>
      ops.push({ type: 'remove', baseLine: start + i + 1, targetLine: null, content: line }),
    );
    midB.forEach((line, j) =>
      ops.push({ type: 'add', baseLine: null, targetLine: start + j + 1, content: line }),
    );
  } else {
    const dp: Int32Array[] = Array.from({ length: lenA + 1 }, () => new Int32Array(lenB + 1));
    for (let i = lenA - 1; i >= 0; i--) {
      for (let j = lenB - 1; j >= 0; j--) {
        if (midA[i] === midB[j]) {
          dp[i][j] = dp[i + 1][j + 1] + 1;
        } else {
          dp[i][j] = dp[i + 1][j] >= dp[i][j + 1] ? dp[i + 1][j] : dp[i][j + 1];
        }
      }
    }

    let i = 0;
    let j = 0;
    while (i < lenA && j < lenB) {
      if (midA[i] === midB[j]) {
        ops.push({
          type: 'context',
          baseLine: start + i + 1,
          targetLine: start + j + 1,
          content: midA[i],
        });
        i++;
        j++;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) {
        ops.push({
          type: 'remove',
          baseLine: start + i + 1,
          targetLine: null,
          content: midA[i],
        });
        i++;
      } else {
        ops.push({
          type: 'add',
          baseLine: null,
          targetLine: start + j + 1,
          content: midB[j],
        });
        j++;
      }
    }
    while (i < lenA) {
      ops.push({ type: 'remove', baseLine: start + i + 1, targetLine: null, content: midA[i] });
      i++;
    }
    while (j < lenB) {
      ops.push({ type: 'add', baseLine: null, targetLine: start + j + 1, content: midB[j] });
      j++;
    }
  }

  const tailOffset = endA + 1;
  const tailTargetOffset = endB + 1;
  for (let k = 0; k < n - tailOffset; k++) {
    ops.push({
      type: 'context',
      baseLine: tailOffset + k + 1,
      targetLine: tailTargetOffset + k + 1,
      content: a[tailOffset + k],
    });
  }

  return ops;
}

function buildHunks(ops: RawDiffOp[], contextLines = 3): {
  hunks: DiffHunk[];
  addedLineCount: number;
  removedLineCount: number;
} {
  let addedLineCount = 0;
  let removedLineCount = 0;
  const changedIndices: number[] = [];

  ops.forEach((op, idx) => {
    if (op.type === 'add') {
      addedLineCount++;
      changedIndices.push(idx);
    } else if (op.type === 'remove') {
      removedLineCount++;
      changedIndices.push(idx);
    }
  });

  if (changedIndices.length === 0) {
    return { hunks: [], addedLineCount: 0, removedLineCount: 0 };
  }

  const ranges: Array<{ start: number; end: number }> = [];
  for (const idx of changedIndices) {
    const rStart = Math.max(0, idx - contextLines);
    const rEnd = Math.min(ops.length - 1, idx + contextLines);
    const prev = ranges[ranges.length - 1];
    if (prev && rStart <= prev.end + 1) {
      prev.end = Math.max(prev.end, rEnd);
    } else {
      ranges.push({ start: rStart, end: rEnd });
    }
  }

  const hunks: DiffHunk[] = ranges.map((range) => {
    const slice: DiffLine[] = ops.slice(range.start, range.end + 1);
    const firstBase = slice.find((l) => l.baseLine !== null)?.baseLine ?? 1;
    const firstTarget = slice.find((l) => l.targetLine !== null)?.targetLine ?? 1;
    const baseCount = slice.filter((l) => l.type !== 'add').length;
    const targetCount = slice.filter((l) => l.type !== 'remove').length;
    return {
      header: `@@ -${firstBase},${baseCount} +${firstTarget},${targetCount} @@`,
      lines: slice,
    };
  });

  return { hunks, addedLineCount, removedLineCount };
}

export function compareArtifactVersions(
  baseArtifact: ArtifactRecord,
  baseRaw: string,
  targetArtifact: ArtifactRecord,
  targetRaw: string,
): VersionDiffResult {
  const bMet = baseArtifact.technicalReport.metrics;
  const tMet = targetArtifact.technicalReport.metrics;

  const bWarnCount = baseArtifact.technicalReport.findings.filter(
    (f) => f.severity === 'warning' || f.severity === 'critical',
  ).length;
  const tWarnCount = targetArtifact.technicalReport.findings.filter(
    (f) => f.severity === 'warning' || f.severity === 'critical',
  ).length;

  const metricDeltas: MetricDelta[] = [
    {
      label: '總程式碼行數',
      baseValue: bMet.lineCount,
      targetValue: tMet.lineCount,
      delta: tMet.lineCount - bMet.lineCount,
      unit: '行',
    },
    {
      label: 'JavaScript 行數',
      baseValue: bMet.jsLines,
      targetValue: tMet.jsLines,
      delta: tMet.jsLines - bMet.jsLines,
      unit: '行',
    },
    {
      label: '檔案容量',
      baseValue: Number((bMet.fileSizeBytes / 1024).toFixed(1)),
      targetValue: Number((tMet.fileSizeBytes / 1024).toFixed(1)),
      delta: Number(((tMet.fileSizeBytes - bMet.fileSizeBytes) / 1024).toFixed(1)),
      unit: 'KB',
    },
    {
      label: '偵測函式數',
      baseValue: bMet.functionCount,
      targetValue: tMet.functionCount,
      delta: tMet.functionCount - bMet.functionCount,
      unit: '個',
    },
    {
      label: '警示與風險數',
      baseValue: bWarnCount,
      targetValue: tWarnCount,
      delta: tWarnCount - bWarnCount,
      unit: '項',
    },
  ];

  const baseWarnMap = new Map<string, AuditFinding>();
  baseArtifact.technicalReport.findings
    .filter((f) => f.severity === 'warning' || f.severity === 'critical' || f.severity === 'info')
    .forEach((f) => baseWarnMap.set(f.id, f));

  const targetWarnMap = new Map<string, AuditFinding>();
  targetArtifact.technicalReport.findings
    .filter((f) => f.severity === 'warning' || f.severity === 'critical' || f.severity === 'info')
    .forEach((f) => targetWarnMap.set(f.id, f));

  const resolvedFindings: AuditFinding[] = [];
  for (const [id, finding] of baseWarnMap.entries()) {
    if (!targetWarnMap.has(id)) {
      resolvedFindings.push(finding);
    }
  }

  const newFindings: AuditFinding[] = [];
  const persistingWarnings: AuditFinding[] = [];
  for (const [id, finding] of targetWarnMap.entries()) {
    if (!baseWarnMap.has(id)) {
      newFindings.push(finding);
    } else {
      persistingWarnings.push(finding);
    }
  }

  const ops = computeLineDiffOps(baseRaw, targetRaw);
  const { hunks, addedLineCount, removedLineCount } = buildHunks(ops, 3);

  return {
    baseArtifact,
    targetArtifact,
    metricDeltas,
    resolvedFindings,
    newFindings,
    persistingWarnings,
    hunks,
    addedLineCount,
    removedLineCount,
  };
}

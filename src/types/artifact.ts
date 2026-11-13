export type FindingSeverity = 'critical' | 'warning' | 'info' | 'pass';

export interface AuditFinding {
  id: string;
  severity: FindingSeverity;
  category: string;
  title: string;
  lineRef?: string;
  evidence: string;
  recommendation: string;
}

export interface PaletteEntry {
  hex: string;
  group: string;
  role: string;
}

export interface SpriteRowSpec {
  key: string;
  title: string;
  description: string;
  frameCount: number;
}

export interface PipelineStep {
  stepNumber: string;
  name: string;
  mechanism: string;
  complexityNote: string;
}

export interface ArtifactMetrics {
  fileSizeBytes: number;
  lineCount: number;
  htmlLines: number;
  cssLines: number;
  jsLines: number;
  cssVarCount: number;
  functionCount: number;
  canvasCount: number;
  paletteColorCount: number;
  claimedPaletteCount: number | null;
  totalSpriteFrames: number;
  spriteRowsCount: number;
  cellResolution: string | null;
  externalDependencyCount: number;
}

export interface TechnicalReport {
  detectedTitle: string;
  category: string;
  engineType: string;
  summary: string;
  externalDependencies: string[];
  cssVariables: Array<{ name: string; value: string }>;
  detectedFunctions: string[];
  canvasElements: Array<{ id: string; width: number | null; height: number | null }>;
  pipelineSteps: PipelineStep[];
  extractedPalette: PaletteEntry[];
  spriteSpec: SpriteRowSpec[];
  metrics: ArtifactMetrics;
  findings: AuditFinding[];
}

export interface CuratorialNote {
  id: string;
  author: string;
  content: string;
  createdAt: string;
}

export interface ArtifactRecord {
  id: string;
  accessionId: string;
  versionTag?: string;
  parentAccessionId?: string;
  title: string;
  originFileName: string;
  sourcePath: string;
  previewUrl: string;
  archivedAt: string;
  lastInspectedAt: string;
  locked: boolean;
  technicalReport: TechnicalReport;
  curatorialNotes: CuratorialNote[];
}

export interface ArtifactWithSource extends ArtifactRecord {
  rawHtml: string;
}

export interface DiffLine {
  type: 'context' | 'add' | 'remove';
  baseLine: number | null;
  targetLine: number | null;
  content: string;
}

export interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

export interface MetricDelta {
  label: string;
  baseValue: number;
  targetValue: number;
  delta: number;
  unit: string;
}

export interface VersionDiffResult {
  baseArtifact: ArtifactRecord;
  targetArtifact: ArtifactRecord;
  metricDeltas: MetricDelta[];
  resolvedFindings: AuditFinding[];
  newFindings: AuditFinding[];
  persistingWarnings: AuditFinding[];
  hunks: DiffHunk[];
  addedLineCount: number;
  removedLineCount: number;
}

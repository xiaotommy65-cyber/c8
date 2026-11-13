import type { ArtifactRecord } from '../types/artifact';

export function buildMarkdownDossier(artifact: ArtifactRecord): string {
  const { technicalReport: rep } = artifact;
  const lines: string[] = [];

  lines.push(`# ${artifact.title}`);
  lines.push('');
  lines.push(`- **典藏編號**：${artifact.accessionId}`);
  lines.push(`- **原始檔名**：${artifact.originFileName}`);
  lines.push(`- **文物分類**：${rep.category}`);
  lines.push(`- **引擎架構**：${rep.engineType}`);
  lines.push(`- **歸檔時間**：${new Date(artifact.archivedAt).toLocaleString('zh-TW')}`);
  lines.push(`- **最後檢測**：${new Date(artifact.lastInspectedAt).toLocaleString('zh-TW')}`);
  lines.push('');
  lines.push('## 一、技術總評');
  lines.push('');
  lines.push(rep.summary);
  lines.push('');
  lines.push('## 二、量化規格指標');
  lines.push('');
  lines.push(`- 總程式碼行數：${rep.metrics.lineCount} 行（HTML ${rep.metrics.htmlLines} / CSS ${rep.metrics.cssLines} / JS ${rep.metrics.jsLines}）`);
  lines.push(`- 檔案大小：${(rep.metrics.fileSizeBytes / 1024).toFixed(2)} KB (${rep.metrics.fileSizeBytes} bytes)`);
  lines.push(`- 畫布元件數：${rep.metrics.canvasCount} 個${rep.metrics.cellResolution ? `（單格解析度 ${rep.metrics.cellResolution}）` : ''}`);
  lines.push(`- 萃取色盤數：${rep.metrics.paletteColorCount} 色${rep.metrics.claimedPaletteCount ? `（文案宣稱 ${rep.metrics.claimedPaletteCount} 色）` : ''}`);
  if (rep.metrics.totalSpriteFrames > 0) {
    lines.push(`- 精靈圖規格：${rep.metrics.spriteRowsCount} 列共 ${rep.metrics.totalSpriteFrames} 幀`);
  }
  lines.push(`- 偵測函式數：${rep.metrics.functionCount} 個`);
  lines.push('');
  lines.push('## 三、渲染管線步驟');
  lines.push('');
  rep.pipelineSteps.forEach((step) => {
    lines.push(`### ${step.stepNumber}. ${step.name}`);
    lines.push(`- 運作機制：${step.mechanism}`);
    lines.push(`- 運算特徵：${step.complexityNote}`);
    lines.push('');
  });

  lines.push('## 四、程式碼稽核與檢測發現');
  lines.push('');
  const sevMap: Record<string, string> = {
    critical: '嚴重',
    warning: '警示',
    info: '優化建議',
    pass: '驗證通過',
  };
  rep.findings.forEach((f, idx) => {
    lines.push(`### ${idx + 1}. [${sevMap[f.severity] ?? f.severity}] ${f.title}`);
    lines.push(`- 類別：${f.category}${f.lineRef ? `（位置：${f.lineRef}）` : ''}`);
    lines.push(`- 實證說明：${f.evidence}`);
    lines.push(`- 處置建議：${f.recommendation}`);
    lines.push('');
  });

  if (rep.spriteSpec.length > 0) {
    lines.push('## 五、精靈圖動作序列規格');
    lines.push('');
    rep.spriteSpec.forEach((row) => {
      lines.push(`- **${row.title}**（${row.frameCount} 幀）：${row.description}`);
    });
    lines.push('');
  }

  if (artifact.curatorialNotes.length > 0) {
    lines.push('## 六、策展鑑定附註');
    lines.push('');
    artifact.curatorialNotes.forEach((note) => {
      lines.push(`- **${note.author}**（${new Date(note.createdAt).toLocaleString('zh-TW')}）：${note.content}`);
    });
    lines.push('');
  }

  return lines.join('\n');
}

export function triggerFileDownload(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

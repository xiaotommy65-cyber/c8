import { useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  Info,
  CheckCircle2,
  RefreshCw,
  Download,
  Trash2,
  Copy,
  Check,
  Code2,
  Play,
  MessageSquarePlus,
  Camera,
} from 'lucide-react';
import type { ArtifactWithSource, AuditFinding, FindingSeverity } from '../types/artifact';
import { buildMarkdownDossier, triggerFileDownload } from '../utils/exportReport';

export type DossierTab = 'overview' | 'audit' | 'palette' | 'sandbox';

interface ArtifactDossierProps {
  artifact: ArtifactWithSource;
  activeTab: DossierTab;
  onTabChange: (tab: DossierTab) => void;
  onReinspect: (id: string) => Promise<void>;
  onOpenSnapshotModal: () => void;
  onAddNote: (id: string, author: string, content: string) => Promise<void>;
  onDeleteNote: (id: string, noteId: string) => Promise<void>;
  onDeleteArtifact: (id: string) => Promise<void>;
  reinspecting: boolean;
}

const SEVERITY_META: Record<
  FindingSeverity,
  { label: string; colorClass: string; Icon: typeof AlertTriangle }
> = {
  critical: { label: '嚴重風險', colorClass: 'text-[#F87171]', Icon: AlertOctagon },
  warning: { label: '技術警示', colorClass: 'text-[#F59E0B]', Icon: AlertTriangle },
  info: { label: '優化建議', colorClass: 'text-[#60A5FA]', Icon: Info },
  pass: { label: '驗證通過', colorClass: 'text-[#34D399]', Icon: CheckCircle2 },
};

export function ArtifactDossier({
  artifact,
  activeTab,
  onTabChange,
  onReinspect,
  onOpenSnapshotModal,
  onAddNote,
  onDeleteNote,
  onDeleteArtifact,
  reinspecting,
}: ArtifactDossierProps) {
  const [severityFilter, setSeverityFilter] = useState<'all' | FindingSeverity>('all');
  const [copiedHex, setCopiedHex] = useState<string | null>(null);
  const [showSourceBesideSandbox, setShowSourceBesideSandbox] = useState(false);
  const [noteAuthor, setNoteAuthor] = useState('技術鑑定員');
  const [noteContent, setNoteContent] = useState('');
  const [submittingNote, setSubmittingNote] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const rep = artifact.technicalReport;
  const { metrics } = rep;

  const warningAndCriticalCount = rep.findings.filter(
    (f) => f.severity === 'warning' || f.severity === 'critical',
  ).length;
  const passCount = rep.findings.filter((f) => f.severity === 'pass').length;

  const filteredFindings: AuditFinding[] =
    severityFilter === 'all'
      ? rep.findings
      : rep.findings.filter((f) => f.severity === severityFilter);

  const handleCopyHex = async (hex: string) => {
    try {
      await navigator.clipboard.writeText(hex);
      setCopiedHex(hex);
      setTimeout(() => setCopiedHex((curr) => (curr === hex ? null : curr)), 1400);
    } catch {
      // Clipboard API unavailable in restricted frame; fallback ignored cleanly
    }
  };

  const handleNoteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteContent.trim()) return;
    setSubmittingNote(true);
    try {
      await onAddNote(artifact.id, noteAuthor.trim() || '研究員', noteContent.trim());
      setNoteContent('');
    } finally {
      setSubmittingNote(false);
    }
  };

  const handleExportMd = () => {
    const md = buildMarkdownDossier(artifact);
    triggerFileDownload(`${artifact.accessionId}_technical_report.md`, md, 'text/markdown;charset=utf-8');
  };

  const handleExportJson = () => {
    const json = JSON.stringify(artifact, null, 2);
    triggerFileDownload(`${artifact.accessionId}_archive_record.json`, json, 'application/json;charset=utf-8');
  };

  const rawLines = artifact.rawHtml ? artifact.rawHtml.split('\n') : [];

  return (
    <div className="flex-1 min-w-0 bg-[#0D0D11]">
      {/* Specimen Plaque Header */}
      <div className="px-6 lg:px-10 pt-8 pb-7 border-b border-[#2A2C38] bg-[#111218]">
        <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-[#D4AF37] tracking-wider mb-3">
          <span className="tabular-nums">{artifact.accessionId}</span>
          {artifact.versionTag && (
            <>
              <span aria-hidden="true" className="text-[#5A5751]">/</span>
              <span className="text-[#F3EFE6]">{artifact.versionTag}</span>
            </>
          )}
          {artifact.parentAccessionId && (
            <>
              <span aria-hidden="true" className="text-[#5A5751]">/</span>
              <span className="text-[#9E998E]">衍生自 {artifact.parentAccessionId}</span>
            </>
          )}
          <span aria-hidden="true" className="text-[#5A5751]">/</span>
          <span className="text-[#9E998E]">{rep.category}</span>
          {metrics.cellResolution && (
            <>
              <span aria-hidden="true" className="text-[#5A5751]">/</span>
              <span className="text-[#9E998E] tabular-nums">{metrics.cellResolution}</span>
            </>
          )}
        </div>

        <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-6">
          <div className="space-y-2.5 max-w-3xl">
            <h1 className="font-serif text-2xl sm:text-3xl lg:text-4xl font-medium text-[#F3EFE6] leading-tight">
              {artifact.title}
            </h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#9E998E] font-mono tabular-nums">
              <span>原檔：{artifact.originFileName}</span>
              <span aria-hidden="true">·</span>
              <span>歸檔：{new Date(artifact.archivedAt).toLocaleString('zh-TW')}</span>
              <span aria-hidden="true">·</span>
              <span>最後檢測：{new Date(artifact.lastInspectedAt).toLocaleString('zh-TW')}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onOpenSnapshotModal}
              className="px-3.5 py-2 text-xs font-medium text-[#F3EFE6] bg-[#1B1D26] hover:bg-[#242733] border border-[#2A2C38] cursor-pointer inline-flex items-center gap-2 whitespace-nowrap transition-colors"
            >
              <Camera className="w-3.5 h-3.5 text-[#D4AF37]" />
              擷取前台快照
            </button>

            <button
              type="button"
              onClick={() => onReinspect(artifact.id)}
              disabled={reinspecting}
              className="px-3.5 py-2 text-xs font-medium text-[#F3EFE6] bg-[#1B1D26] hover:bg-[#242733] border border-[#2A2C38] cursor-pointer inline-flex items-center gap-2 whitespace-nowrap transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-[#D4AF37] ${reinspecting ? 'animate-spin' : ''}`} />
              {reinspecting ? '檢測中...' : '重新執行檢測'}
            </button>

            <button
              type="button"
              onClick={handleExportMd}
              className="px-3.5 py-2 text-xs font-medium text-[#F3EFE6] bg-[#1B1D26] hover:bg-[#242733] border border-[#2A2C38] cursor-pointer inline-flex items-center gap-2 whitespace-nowrap transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-[#9E998E]" />
              匯出 Markdown
            </button>

            <button
              type="button"
              onClick={handleExportJson}
              className="px-3.5 py-2 text-xs font-medium text-[#F3EFE6] bg-[#1B1D26] hover:bg-[#242733] border border-[#2A2C38] cursor-pointer inline-flex items-center gap-2 whitespace-nowrap transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-[#9E998E]" />
              匯出 JSON
            </button>

            {!artifact.locked && !confirmDelete && (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="px-3 py-2 text-xs text-[#F87171] hover:bg-[#F87171]/10 border border-[#2A2C38] cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                移除
              </button>
            )}

            {!artifact.locked && confirmDelete && (
              <div className="inline-flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setConfirmDelete(false);
                    onDeleteArtifact(artifact.id);
                  }}
                  className="px-3 py-2 text-xs font-medium text-[#0D0D11] bg-[#F87171] cursor-pointer whitespace-nowrap"
                >
                  確認刪除
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="px-3 py-2 text-xs text-[#9E998E] border border-[#2A2C38] cursor-pointer whitespace-nowrap"
                >
                  取消
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 4-Column Quantitative Metrics Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 border-b border-[#2A2C38] bg-[#15161D] divide-y lg:divide-y-0 lg:divide-x divide-[#2A2C38]">
        <div className="px-6 py-4">
          <div className="text-xs text-[#9E998E] mb-1">總程式碼規模</div>
          <div className="font-mono text-2xl font-medium text-[#F3EFE6] tabular-nums">
            {metrics.lineCount} <span className="text-xs text-[#9E998E]">行</span>
          </div>
          <div className="font-mono text-xs text-[#78746C] tabular-nums mt-1">
            HTML {metrics.htmlLines} · CSS {metrics.cssLines} · JS {metrics.jsLines}
          </div>
        </div>

        <div className="px-6 py-4">
          <div className="text-xs text-[#9E998E] mb-1">檔案容量與資源</div>
          <div className="font-mono text-2xl font-medium text-[#F3EFE6] tabular-nums">
            {(metrics.fileSizeBytes / 1024).toFixed(1)} <span className="text-xs text-[#9E998E]">KB</span>
          </div>
          <div className="font-mono text-xs text-[#78746C] tabular-nums mt-1">
            {metrics.functionCount} 個函式 · {metrics.canvasCount} 個畫布
          </div>
        </div>

        <div className="px-6 py-4">
          <div className="text-xs text-[#9E998E] mb-1">實測萃取色盤</div>
          <div className="font-mono text-2xl font-medium text-[#D4AF37] tabular-nums">
            {metrics.paletteColorCount} <span className="text-xs text-[#9E998E]">色</span>
          </div>
          <div className="font-mono text-xs text-[#78746C] tabular-nums mt-1">
            {metrics.claimedPaletteCount
              ? `文件宣稱 ${metrics.claimedPaletteCount} 色 · ${metrics.totalSpriteFrames} 幀精靈圖`
              : `${metrics.cssVarCount} 個 CSS 設計變數`}
          </div>
        </div>

        <div className="px-6 py-4">
          <div className="text-xs text-[#9E998E] mb-1">靜態稽核結果</div>
          <div className="font-mono text-2xl font-medium text-[#F3EFE6] tabular-nums">
            {rep.findings.length} <span className="text-xs text-[#9E998E]">項</span>
          </div>
          <div className="font-mono text-xs tabular-nums mt-1 flex items-center gap-2">
            <span className={warningAndCriticalCount > 0 ? 'text-[#F59E0B]' : 'text-[#34D399]'}>
              {warningAndCriticalCount} 項待修警示
            </span>
            <span className="text-[#5A5751]">·</span>
            <span className="text-[#34D399]">{passCount} 項通過</span>
          </div>
        </div>
      </div>

      {/* Inline Workspace Sub-Navigation */}
      <div className="px-6 lg:px-10 border-b border-[#2A2C38] bg-[#121319] flex items-center justify-between gap-4 overflow-x-auto">
        <div className="flex items-center gap-6" role="tablist" aria-label="技術分析檢視分頁">
          {(
            [
              ['overview', '01. 技術總覽與管線'],
              ['audit', `02. 程式碼稽核 (${rep.findings.length})`],
              ['palette', '03. 色盤與精靈規格'],
              ['sandbox', '04. 即時互動展台'],
            ] as Array<[DossierTab, string]>
          ).map(([tabKey, label]) => {
            const isActive = activeTab === tabKey;
            return (
              <button
                key={tabKey}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => onTabChange(tabKey)}
                className={`py-3.5 text-sm whitespace-nowrap shrink-0 border-b-2 transition-colors cursor-pointer ${
                  isActive
                    ? 'border-[#D4AF37] text-[#F3EFE6] font-medium'
                    : 'border-transparent text-[#9E998E] hover:text-[#F3EFE6]'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content Viewport */}
      <div className="px-6 lg:px-10 py-8 space-y-10">
        {activeTab === 'overview' && (
          <>
            <section className="space-y-4">
              <h2 className="font-serif text-xl text-[#F3EFE6]">01. 技術鑑定總評與渲染管線</h2>
              <p className="text-[15px] text-[#D6D2C9] leading-relaxed max-w-prose">
                {rep.summary}
              </p>

              <div className="pt-4 border-t border-[#2A2C38] divide-y divide-[#2A2C38]">
                {rep.pipelineSteps.map((step) => (
                  <div
                    key={step.stepNumber}
                    className="py-4 grid grid-cols-1 md:grid-cols-[72px_240px_1fr] gap-3 md:gap-6 items-baseline"
                  >
                    <div className="font-mono text-sm text-[#D4AF37] tabular-nums">
                      STEP {step.stepNumber}
                    </div>
                    <div className="font-medium text-sm text-[#F3EFE6]">{step.name}</div>
                    <div className="space-y-1">
                      <p className="text-sm text-[#C8C3B8] leading-relaxed">{step.mechanism}</p>
                      <p className="font-mono text-xs text-[#78746C]">{step.complexityNote}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="space-y-4 pt-6 border-t border-[#2A2C38]">
              <h2 className="font-serif text-xl text-[#F3EFE6]">02. 典藏元件與相依資源盤點</h2>
              <dl className="divide-y divide-[#2A2C38] border-t border-b border-[#2A2C38]">
                <div className="py-3.5 grid grid-cols-1 md:grid-cols-[200px_1fr] gap-2">
                  <dt className="text-xs uppercase tracking-wider text-[#9E998E]">渲染引擎類型</dt>
                  <dd className="font-mono text-sm text-[#F3EFE6]">{rep.engineType}</dd>
                </div>
                <div className="py-3.5 grid grid-cols-1 md:grid-cols-[200px_1fr] gap-2">
                  <dt className="text-xs uppercase tracking-wider text-[#9E998E]">畫布元件</dt>
                  <dd className="font-mono text-sm text-[#D6D2C9] tabular-nums">
                    {rep.canvasElements.length > 0
                      ? rep.canvasElements
                          .map(
                            (c) =>
                              `#${c.id} (${c.width ?? '?'}×${c.height ?? '?'})`,
                          )
                          .join(' · ')
                      : '未偵測到 <canvas> 元素'}
                  </dd>
                </div>
                <div className="py-3.5 grid grid-cols-1 md:grid-cols-[200px_1fr] gap-2">
                  <dt className="text-xs uppercase tracking-wider text-[#9E998E]">外部網路依賴</dt>
                  <dd className="font-mono text-xs text-[#9E998E] space-y-1">
                    {rep.externalDependencies.length > 0 ? (
                      rep.externalDependencies.map((url) => (
                        <div key={url} className="truncate">{url}</div>
                      ))
                    ) : (
                      <span>無外部腳本或字體連線（完全離線獨立）</span>
                    )}
                  </dd>
                </div>
                <div className="py-3.5 grid grid-cols-1 md:grid-cols-[200px_1fr] gap-2">
                  <dt className="text-xs uppercase tracking-wider text-[#9E998E]">核心函式清單</dt>
                  <dd className="font-mono text-xs text-[#C8C3B8] leading-relaxed">
                    {rep.detectedFunctions.length > 0
                      ? rep.detectedFunctions.join('  ·  ')
                      : '未偵測到具名頂層函式'}
                  </dd>
                </div>
              </dl>
            </section>
          </>
        )}

        {activeTab === 'audit' && (
          <section className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h2 className="font-serif text-xl text-[#F3EFE6]">02. 程式碼檢測與缺陷鑑定清單</h2>

              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="篩選稽核嚴重程度">
                {(
                  [
                    ['all', `全部 (${rep.findings.length})`],
                    ['critical', `嚴重 (${rep.findings.filter((f) => f.severity === 'critical').length})`],
                    ['warning', `警示 (${rep.findings.filter((f) => f.severity === 'warning').length})`],
                    ['info', `建議 (${rep.findings.filter((f) => f.severity === 'info').length})`],
                    ['pass', `通過 (${rep.findings.filter((f) => f.severity === 'pass').length})`],
                  ] as Array<['all' | FindingSeverity, string]>
                ).map(([key, text]) => {
                  const active = severityFilter === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSeverityFilter(key)}
                      className={`px-3 py-1.5 text-xs font-mono tabular-nums cursor-pointer border transition-colors whitespace-nowrap ${
                        active
                          ? 'bg-[#D4AF37]/15 border-[#D4AF37] text-[#F3EFE6]'
                          : 'bg-[#15161D] border-[#2A2C38] text-[#9E998E] hover:text-[#F3EFE6]'
                      }`}
                    >
                      {text}
                    </button>
                  );
                })}
              </div>
            </div>

            {filteredFindings.length === 0 ? (
              <div className="py-12 text-center border border-[#2A2C38] text-sm text-[#78746C]">
                此嚴重程度分類下無檢測項目。
              </div>
            ) : (
              <div className="border-t border-b border-[#2A2C38] divide-y divide-[#2A2C38]">
                {filteredFindings.map((finding) => {
                  const meta = SEVERITY_META[finding.severity];
                  const SevIcon = meta.Icon;
                  return (
                    <article key={finding.id} className="py-5 space-y-3">
                      <div className="flex flex-wrap items-center gap-3 text-xs">
                        <span className={`inline-flex items-center gap-1.5 font-medium ${meta.colorClass}`}>
                          <SevIcon className="w-4 h-4" aria-hidden="true" />
                          {meta.label}
                        </span>
                        <span aria-hidden="true" className="text-[#5A5751]">·</span>
                        <span className="text-[#9E998E]">{finding.category}</span>
                        {finding.lineRef && (
                          <>
                            <span aria-hidden="true" className="text-[#5A5751]">·</span>
                            <span className="font-mono text-[#D4AF37] tabular-nums">
                              源碼位置 {finding.lineRef}
                            </span>
                          </>
                        )}
                      </div>

                      <h3 className="text-base font-medium text-[#F3EFE6]">{finding.title}</h3>

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-1">
                        <div>
                          <div className="text-xs text-[#78746C] mb-1">檢測實證</div>
                          <p className="text-sm text-[#C8C3B8] leading-relaxed">{finding.evidence}</p>
                        </div>
                        <div>
                          <div className="text-xs text-[#78746C] mb-1">技術處置建議</div>
                          <p className="text-sm text-[#D6D2C9] leading-relaxed">{finding.recommendation}</p>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {activeTab === 'palette' && (
          <div className="space-y-10">
            <section className="space-y-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-serif text-xl text-[#F3EFE6]">
                  03. 萃取色盤矩陣（實測 {rep.extractedPalette.length} 色）
                </h2>
                <span className="text-xs text-[#9E998E]">點擊任意色票可複製 Hex 色碼</span>
              </div>

              {rep.extractedPalette.length === 0 ? (
                <div className="py-8 text-sm text-[#78746C] border border-[#2A2C38] text-center">
                  未從此文物萃取到明確十六進位色碼。
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-3">
                  {rep.extractedPalette.map((swatch, idx) => {
                    const isCopied = copiedHex === swatch.hex;
                    return (
                      <button
                        key={`${swatch.hex}-${idx}`}
                        type="button"
                        onClick={() => handleCopyHex(swatch.hex)}
                        className="text-left border border-[#2A2C38] hover:border-[#D4AF37] bg-[#15161D] p-2.5 cursor-pointer transition-colors group"
                      >
                        <div
                          className="w-full h-10 border border-black/40 mb-2"
                          style={{ backgroundColor: swatch.hex }}
                        />
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-mono text-xs text-[#F3EFE6] uppercase">
                            {swatch.hex}
                          </span>
                          {isCopied ? (
                            <Check className="w-3.5 h-3.5 text-[#34D399]" />
                          ) : (
                            <Copy className="w-3 h-3 text-[#67635C] group-hover:text-[#D4AF37]" />
                          )}
                        </div>
                        <div className="text-[11px] text-[#9E998E] truncate mt-0.5">
                          #{idx} · {swatch.group}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            {rep.spriteSpec.length > 0 && (
              <section className="space-y-4 pt-6 border-t border-[#2A2C38]">
                <h2 className="font-serif text-xl text-[#F3EFE6]">
                  精靈圖動作序列規格（共 {metrics.spriteRowsCount} 列 {metrics.totalSpriteFrames} 幀）
                </h2>
                <div className="border-t border-b border-[#2A2C38] divide-y divide-[#2A2C38]">
                  {rep.spriteSpec.map((row, idx) => (
                    <div
                      key={row.key}
                      className="py-3.5 grid grid-cols-1 md:grid-cols-[80px_220px_1fr_90px] gap-2 items-center"
                    >
                      <span className="font-mono text-xs text-[#9E998E] tabular-nums">ROW {idx + 1}</span>
                      <span className="font-mono text-sm text-[#D4AF37]">{row.title}</span>
                      <span className="text-sm text-[#D6D2C9]">{row.description}</span>
                      <span className="font-mono text-sm text-[#F3EFE6] md:text-right tabular-nums">
                        {row.frameCount} 幀
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {rep.cssVariables.length > 0 && (
              <section className="space-y-4 pt-6 border-t border-[#2A2C38]">
                <h2 className="font-serif text-xl text-[#F3EFE6]">
                  CSS 設計變數表（{rep.cssVariables.length} 項）
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 border-t border-[#2A2C38]">
                  {rep.cssVariables.map((v) => (
                    <div
                      key={v.name}
                      className="py-2.5 px-3 border-b border-[#2A2C38] flex items-center justify-between gap-4 font-mono text-xs"
                    >
                      <span className="text-[#D4AF37]">{v.name}</span>
                      <span className="text-[#C8C3B8] truncate">{v.value}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {activeTab === 'sandbox' && (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Play className="w-4 h-4 text-[#D4AF37]" aria-hidden="true" />
                <h2 className="font-serif text-xl text-[#F3EFE6]">04. 即時互動文物展台</h2>
              </div>

              <button
                type="button"
                onClick={() => setShowSourceBesideSandbox((v) => !v)}
                className={`px-3.5 py-1.5 text-xs font-medium border cursor-pointer inline-flex items-center gap-2 transition-colors ${
                  showSourceBesideSandbox
                    ? 'bg-[#D4AF37]/15 border-[#D4AF37] text-[#F3EFE6]'
                    : 'bg-[#15161D] border-[#2A2C38] text-[#9E998E] hover:text-[#F3EFE6]'
                }`}
              >
                <Code2 className="w-3.5 h-3.5" />
                {showSourceBesideSandbox ? '隱藏原始碼對照' : '開啟原始碼對照'}
              </button>
            </div>

            <div
              className={`grid gap-6 ${
                showSourceBesideSandbox ? 'grid-cols-1 2xl:grid-cols-2' : 'grid-cols-1'
              }`}
            >
              <div className="border border-[#2A2C38] bg-[#09090C]">
                <div className="px-4 py-2 border-b border-[#2A2C38] bg-[#15161D] flex items-center justify-between text-xs font-mono text-[#9E998E]">
                  <span className="truncate">{artifact.previewUrl}</span>
                  <span>沙盒執行環境</span>
                </div>
                <iframe
                  title={`即時預覽：${artifact.title}`}
                  src={artifact.previewUrl}
                  sandbox="allow-scripts allow-downloads allow-same-origin"
                  className="w-full h-[760px] bg-[#0d0c12]"
                />
              </div>

              {showSourceBesideSandbox && (
                <div className="border border-[#2A2C38] bg-[#0B0C10] flex flex-col h-[801px]">
                  <div className="px-4 py-2 border-b border-[#2A2C38] bg-[#15161D] flex items-center justify-between text-xs font-mono text-[#9E998E]">
                    <span>{artifact.originFileName}</span>
                    <span className="tabular-nums">{rawLines.length} 行</span>
                  </div>
                  <div className="flex-1 overflow-auto p-4 font-mono text-xs leading-relaxed">
                    {rawLines.map((lineText, idx) => (
                      <div key={idx} className="flex gap-4 hover:bg-white/5 px-1">
                        <span className="w-10 shrink-0 text-right text-[#5A5751] select-none tabular-nums">
                          {idx + 1}
                        </span>
                        <span className="text-[#D6D2C9] whitespace-pre">{lineText}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Curatorial Notes Section (Always Accessible at Base of Dossier) */}
        <section className="pt-8 border-t border-[#2A2C38] space-y-5">
          <div className="flex items-baseline justify-between">
            <h2 className="font-serif text-xl text-[#F3EFE6]">05. 策展鑑定附註與歷史存檔紀錄</h2>
            <span className="font-mono text-xs text-[#9E998E] tabular-nums">
              {artifact.curatorialNotes.length} 則紀錄
            </span>
          </div>

          <form onSubmit={handleNoteSubmit} className="grid grid-cols-1 md:grid-cols-[180px_1fr_auto] gap-3">
            <input
              type="text"
              value={noteAuthor}
              onChange={(e) => setNoteAuthor(e.target.value)}
              placeholder="鑑定人姓名"
              aria-label="鑑定人姓名"
              className="bg-[#15161D] border border-[#2A2C38] px-3 py-2 text-sm text-[#F3EFE6] focus:outline-none focus:border-[#D4AF37]"
            />
            <input
              type="text"
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              placeholder="新增觀察結論、修復追蹤或歷史背景附註..."
              aria-label="新增策展附註內容"
              className="bg-[#15161D] border border-[#2A2C38] px-3 py-2 text-sm text-[#F3EFE6] placeholder-[#67635C] focus:outline-none focus:border-[#D4AF37]"
            />
            <button
              type="submit"
              disabled={submittingNote || !noteContent.trim()}
              className="px-4 py-2 text-sm font-medium text-[#0D0D11] bg-[#D4AF37] hover:bg-[#E2BF4E] disabled:opacity-40 cursor-pointer inline-flex items-center justify-center gap-2 whitespace-nowrap transition-colors"
            >
              <MessageSquarePlus className="w-4 h-4" />
              {submittingNote ? '寫入中...' : '存檔附註'}
            </button>
          </form>

          {artifact.curatorialNotes.length > 0 && (
            <div className="divide-y divide-[#2A2C38] border-t border-[#2A2C38]">
              {artifact.curatorialNotes.map((note) => (
                <div key={note.id} className="py-4 flex items-start justify-between gap-4">
                  <div className="space-y-1 max-w-prose">
                    <div className="flex items-center gap-2 text-xs text-[#9E998E] font-mono tabular-nums">
                      <span className="text-[#D4AF37] font-sans font-medium">{note.author}</span>
                      <span aria-hidden="true">·</span>
                      <span>{new Date(note.createdAt).toLocaleString('zh-TW')}</span>
                    </div>
                    <p className="text-sm text-[#D6D2C9] leading-relaxed">{note.content}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onDeleteNote(artifact.id, note.id)}
                    aria-label="刪除此則附註"
                    className="p-1.5 text-[#78746C] hover:text-[#F87171] cursor-pointer transition-colors shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

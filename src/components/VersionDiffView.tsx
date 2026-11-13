import { useEffect, useState } from 'react';
import { ArrowLeftRight, CheckCircle2, AlertTriangle, Play } from 'lucide-react';
import type { ArtifactRecord, VersionDiffResult } from '../types/artifact';

interface VersionDiffViewProps {
  artifacts: ArtifactRecord[];
  initialBaseId?: string;
  initialTargetId?: string;
}

export function VersionDiffView({
  artifacts,
  initialBaseId,
  initialTargetId,
}: VersionDiffViewProps) {
  const defaultBase =
    initialBaseId ||
    artifacts.find((a) => a.accessionId === 'ACC-2026-001')?.id ||
    artifacts[artifacts.length - 1]?.id ||
    '';
  const defaultTarget =
    initialTargetId ||
    artifacts.find((a) => a.accessionId === 'ACC-2026-002')?.id ||
    artifacts[0]?.id ||
    '';

  const [baseId, setBaseId] = useState(defaultBase);
  const [targetId, setTargetId] = useState(defaultTarget);
  const [diff, setDiff] = useState<VersionDiffResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showLiveComparison, setShowLiveComparison] = useState(false);

  useEffect(() => {
    if (!baseId && defaultBase) setBaseId(defaultBase);
    if (!targetId && defaultTarget) setTargetId(defaultTarget);
  }, [defaultBase, defaultTarget, baseId, targetId]);

  useEffect(() => {
    if (!baseId || !targetId) return;
    let cancelled = false;
    setLoading(true);
    setErrorMsg(null);

    fetch(
      `/api/artifacts/diff?base=${encodeURIComponent(baseId)}&target=${encodeURIComponent(targetId)}`,
    )
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '計算版本差異失敗');
        return data.diff as VersionDiffResult;
      })
      .then((result) => {
        if (!cancelled) setDiff(result);
      })
      .catch((err) => {
        if (!cancelled) {
          setErrorMsg(err instanceof Error ? err.message : '無法取得版本比對資料');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [baseId, targetId]);

  const handleSwap = () => {
    setBaseId(targetId);
    setTargetId(baseId);
  };

  if (artifacts.length < 2) {
    return (
      <div className="p-10 text-center border border-[#2A2C38] bg-[#15161D] space-y-2">
        <p className="font-serif text-lg text-[#F3EFE6]">需要至少兩筆典藏版本才能執行技術差異對比</p>
        <p className="text-sm text-[#9E998E]">
          請先透過「擷取現行前台快照」或「新增文物檢測」建立第二個版本存檔。
        </p>
      </div>
    );
  }

  return (
    <div className="px-6 lg:px-10 py-8 space-y-8 bg-[#0D0D11] flex-1">
      {/* Version Selector Bar */}
      <div className="border border-[#2A2C38] bg-[#15161D] p-5 space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="font-serif text-2xl text-[#F3EFE6]">跨版本技術指標與程式碼差異對比</h1>
          {diff && (
            <div className="font-mono text-xs tabular-nums flex items-center gap-3">
              <span className="text-[#34D399]">+{diff.addedLineCount} 新增行</span>
              <span className="text-[#F87171]">-{diff.removedLineCount} 移除行</span>
              <span className="text-[#9E998E]">{diff.hunks.length} 處變更區塊</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3 items-end">
          <div>
            <label className="block text-xs text-[#9E998E] mb-1.5" htmlFor="diff-base-select">
              基準版本（Base）
            </label>
            <select
              id="diff-base-select"
              value={baseId}
              onChange={(e) => setBaseId(e.target.value)}
              className="w-full bg-[#0D0D11] border border-[#2A2C38] px-3 py-2 text-sm text-[#F3EFE6] font-mono focus:outline-none focus:border-[#D4AF37]"
            >
              {artifacts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.accessionId} {a.versionTag ? `(${a.versionTag})` : ''} — {a.title}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={handleSwap}
            title="互換基準與目標版本"
            aria-label="互換基準與目標版本"
            className="px-3 py-2 border border-[#2A2C38] bg-[#1B1D26] hover:border-[#D4AF37] text-[#D4AF37] cursor-pointer inline-flex items-center justify-center transition-colors"
          >
            <ArrowLeftRight className="w-4 h-4" />
          </button>

          <div>
            <label className="block text-xs text-[#9E998E] mb-1.5" htmlFor="diff-target-select">
              目標版本（Target）
            </label>
            <select
              id="diff-target-select"
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              className="w-full bg-[#0D0D11] border border-[#2A2C38] px-3 py-2 text-sm text-[#F3EFE6] font-mono focus:outline-none focus:border-[#D4AF37]"
            >
              {artifacts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.accessionId} {a.versionTag ? `(${a.versionTag})` : ''} — {a.title}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 border border-[#EF4444]/40 bg-[#EF4444]/10 text-sm text-[#FCA5A5] flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {loading && (
        <div className="space-y-4">
          <div className="h-24 bg-[#15161D] border border-[#2A2C38]" />
          <div className="h-64 bg-[#15161D] border border-[#2A2C38]" />
        </div>
      )}

      {!loading && diff && (
        <>
          {/* Metric Deltas Grid */}
          <section className="grid grid-cols-2 lg:grid-cols-5 border border-[#2A2C38] bg-[#15161D] divide-y lg:divide-y-0 lg:divide-x divide-[#2A2C38]">
            {diff.metricDeltas.map((m) => {
              const isWarningMetric = m.label.includes('警示');
              const deltaColor =
                m.delta === 0
                  ? 'text-[#9E998E]'
                  : isWarningMetric
                    ? m.delta < 0
                      ? 'text-[#34D399]'
                      : 'text-[#F87171]'
                    : m.delta > 0
                      ? 'text-[#D4AF37]'
                      : 'text-[#60A5FA]';
              const sign = m.delta > 0 ? '+' : '';
              return (
                <div key={m.label} className="p-4">
                  <div className="text-xs text-[#9E998E] mb-1">{m.label}</div>
                  <div className="font-mono text-lg text-[#F3EFE6] tabular-nums">
                    {m.baseValue} → {m.targetValue}{' '}
                    <span className="text-xs text-[#78746C]">{m.unit}</span>
                  </div>
                  <div className={`font-mono text-xs tabular-nums mt-1 ${deltaColor}`}>
                    變化：{sign}
                    {m.delta} {m.unit}
                  </div>
                </div>
              );
            })}
          </section>

          {/* Resolved / New Findings Summary */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="border border-[#2A2C38] bg-[#121319] p-5 space-y-3">
              <div className="flex items-center justify-between border-b border-[#2A2C38] pb-2.5">
                <h2 className="text-sm font-medium text-[#34D399] inline-flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  目標版本已解決之技術問題
                </h2>
                <span className="font-mono text-xs text-[#9E998E] tabular-nums">
                  {diff.resolvedFindings.length} 項
                </span>
              </div>
              {diff.resolvedFindings.length === 0 ? (
                <p className="text-sm text-[#78746C] py-2">兩個版本之間沒有消除的稽核項目。</p>
              ) : (
                <ul className="divide-y divide-[#2A2C38]">
                  {diff.resolvedFindings.map((f) => (
                    <li key={f.id} className="py-2.5 space-y-0.5">
                      <div className="text-sm text-[#F3EFE6]">{f.title}</div>
                      <div className="font-mono text-xs text-[#78746C]">
                        原基準問題：{f.category} {f.lineRef ? `(${f.lineRef})` : ''}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="border border-[#2A2C38] bg-[#121319] p-5 space-y-3">
              <div className="flex items-center justify-between border-b border-[#2A2C38] pb-2.5">
                <h2 className="text-sm font-medium text-[#F59E0B] inline-flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  新出現或仍存在的警示項目
                </h2>
                <span className="font-mono text-xs text-[#9E998E] tabular-nums">
                  {diff.newFindings.length + diff.persistingWarnings.length} 項
                </span>
              </div>
              {diff.newFindings.length === 0 && diff.persistingWarnings.length === 0 ? (
                <p className="text-sm text-[#34D399] py-2">
                  目標版本已無任何遺留技術警示或嚴重風險。
                </p>
              ) : (
                <ul className="divide-y divide-[#2A2C38]">
                  {diff.newFindings.map((f) => (
                    <li key={`new-${f.id}`} className="py-2.5 space-y-0.5">
                      <div className="text-sm text-[#F87171]">[新增] {f.title}</div>
                      <div className="font-mono text-xs text-[#9E998E]">{f.category}</div>
                    </li>
                  ))}
                  {diff.persistingWarnings.map((f) => (
                    <li key={`keep-${f.id}`} className="py-2.5 space-y-0.5">
                      <div className="text-sm text-[#D6D2C9]">[持續] {f.title}</div>
                      <div className="font-mono text-xs text-[#78746C]">{f.category}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* Optional Side-by-Side Live Preview Toggle */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-xl text-[#F3EFE6]">逐行程式碼技術差異（Unified Diff）</h2>
              <button
                type="button"
                onClick={() => setShowLiveComparison((v) => !v)}
                className={`px-3.5 py-1.5 text-xs border cursor-pointer inline-flex items-center gap-2 transition-colors ${
                  showLiveComparison
                    ? 'bg-[#D4AF37]/15 border-[#D4AF37] text-[#F3EFE6]'
                    : 'bg-[#15161D] border-[#2A2C38] text-[#9E998E] hover:text-[#F3EFE6]'
                }`}
              >
                <Play className="w-3.5 h-3.5" />
                {showLiveComparison ? '隱藏雙版本即時對照展台' : '開啟雙版本即時對照展台'}
              </button>
            </div>

            {showLiveComparison && (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <div className="border border-[#2A2C38] bg-[#09090C]">
                  <div className="px-3 py-2 border-b border-[#2A2C38] bg-[#15161D] text-xs font-mono text-[#9E998E] flex justify-between">
                    <span>基準：{diff.baseArtifact.accessionId} ({diff.baseArtifact.versionTag || 'base'})</span>
                    <span>{diff.baseArtifact.originFileName}</span>
                  </div>
                  <iframe
                    title="基準版本預覽"
                    src={diff.baseArtifact.previewUrl}
                    sandbox="allow-scripts allow-same-origin"
                    className="w-full h-[540px] bg-[#0d0c12]"
                  />
                </div>
                <div className="border border-[#2A2C38] bg-[#09090C]">
                  <div className="px-3 py-2 border-b border-[#2A2C38] bg-[#15161D] text-xs font-mono text-[#D4AF37] flex justify-between">
                    <span>目標：{diff.targetArtifact.accessionId} ({diff.targetArtifact.versionTag || 'target'})</span>
                    <span>{diff.targetArtifact.originFileName}</span>
                  </div>
                  <iframe
                    title="目標版本預覽"
                    src={diff.targetArtifact.previewUrl}
                    sandbox="allow-scripts allow-same-origin"
                    className="w-full h-[540px] bg-[#0d0c12]"
                  />
                </div>
              </div>
            )}

            {diff.hunks.length === 0 ? (
              <div className="p-8 border border-[#2A2C38] bg-[#15161D] text-center text-sm text-[#9E998E]">
                所選兩個版本的原始碼內容完全一致，無逐行差異。
              </div>
            ) : (
              <div className="space-y-4">
                {diff.hunks.map((hunk, idx) => (
                  <div key={idx} className="border border-[#2A2C38] bg-[#0B0C10] overflow-x-auto">
                    <div className="px-4 py-2 border-b border-[#2A2C38] bg-[#15161D] font-mono text-xs text-[#D4AF37]">
                      {hunk.header}
                    </div>
                    <div className="font-mono text-xs leading-5">
                      {hunk.lines.map((line, lIdx) => {
                        const rowBg =
                          line.type === 'add'
                            ? 'bg-[#34D399]/10 text-[#A7F3D0]'
                            : line.type === 'remove'
                              ? 'bg-[#EF4444]/10 text-[#FECACA]'
                              : 'text-[#9E998E]';
                        const marker =
                          line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' ';
                        return (
                          <div key={lIdx} className={`flex ${rowBg}`}>
                            <span className="w-11 shrink-0 text-right pr-2 text-[#5A5751] select-none tabular-nums border-r border-[#2A2C38]/60">
                              {line.baseLine ?? ''}
                            </span>
                            <span className="w-11 shrink-0 text-right pr-2 text-[#5A5751] select-none tabular-nums border-r border-[#2A2C38]/60">
                              {line.targetLine ?? ''}
                            </span>
                            <span className="w-6 shrink-0 text-center select-none">{marker}</span>
                            <span className="pr-4 whitespace-pre">{line.content}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

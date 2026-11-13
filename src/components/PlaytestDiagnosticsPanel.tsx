import { useState } from 'react';
import {
  Activity,
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  Check,
  Copy,
  Play,
  Terminal,
} from 'lucide-react';
import type { BidirectionalBenchmarkResult } from '../engine/bidirectionalBenchmark';
import type { PlaytestReport, PlaytestScenarioId } from '../engine/playtestDiagnostics';
import type { VirtualProjectFile } from '../engine/types';

interface PlaytestDiagnosticsPanelProps {
  report: PlaytestReport | null;
  running: boolean;
  scenario: PlaytestScenarioId;
  ticks: number;
  onChangeScenario: (next: PlaytestScenarioId) => void;
  onChangeTicks: (next: number) => void;
  onRunPlaytest: () => void;
  onPushWorkspace: () => void;
  onPullWorkspace: () => void;
  busSyncing: boolean;
  lastBusSyncLabel: string | null;
  benchmarkResult: BidirectionalBenchmarkResult | null;
  benchmarkRunning: boolean;
  onRunBidirectionalBenchmark: () => void;
  onApplyFilesToWorkbench: (files: VirtualProjectFile[], label: string) => void;
  autoSseSync: boolean;
  sseConnected: boolean;
  onToggleAutoSse: () => void;
}

const SCENARIO_OPTIONS: Array<{ id: PlaytestScenarioId; label: string; desc: string }> = [
  { id: 'combat-sweep', label: 'combat-sweep (戰鬥與 Hitbox 接觸)', desc: '自動趨近目標揮砍，檢定攻擊碰撞與連擊狀態' },
  { id: 'campaign-clear', label: 'campaign-clear (多關卡全破與 Boss 壓測)', desc: '自動取得鑰匙進傳送門、越刺清怪並討伐雙階段魔王達成 VICTORY' },
  { id: 'reachability-jump', label: 'reachability-jump (跳躍與地形可達)', desc: '左右來回衝刺與跳躍，檢定地形卡牆與接地' },
  { id: 'idle-liveness', label: 'idle-liveness (待機與協程活性)', desc: '不輸入按鍵靜置，檢定重力落地與協程觸發' },
];

type SubMode = 'bidirectional' | 'single';
type RadarView = 'blind' | 'repaired';

export function PlaytestDiagnosticsPanel({
  report,
  running,
  scenario,
  ticks,
  onChangeScenario,
  onChangeTicks,
  onRunPlaytest,
  onPushWorkspace,
  onPullWorkspace,
  busSyncing,
  lastBusSyncLabel,
  benchmarkResult,
  benchmarkRunning,
  onRunBidirectionalBenchmark,
  onApplyFilesToWorkbench,
  autoSseSync,
  sseConnected,
  onToggleAutoSse,
}: PlaytestDiagnosticsPanelProps) {
  const [subMode, setSubMode] = useState<SubMode>('bidirectional');
  const [radarView, setRadarView] = useState<RadarView>('blind');
  const [copiedKey, setCopiedKey] = useState<'mcp' | 'cli' | null>(null);

  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const mcpUrl = `${origin}/mcp`;

  const mcpSnippet = JSON.stringify(
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'simulate_project',
        arguments: { scenario, ticks },
      },
    },
    null,
    2,
  );

  const cliSnippet = `npm run sim -- --scenario=${scenario} --ticks=${ticks}`;

  const copyText = (key: 'mcp' | 'cli', text: string) => {
    void navigator.clipboard?.writeText(text).catch(() => {});
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1600);
  };

  return (
    <div className="flex-1 flex flex-col bg-[#0D1017] overflow-hidden min-h-0">
      {/* Sub-mode Segmented Switch */}
      <div className="px-4 py-2 border-b border-[#232A3B] bg-[#0F131D] flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-1 bg-[#090C12] p-0.5 rounded border border-[#232A3B]">
          <button
            type="button"
            onClick={() => setSubMode('bidirectional')}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
              subMode === 'bidirectional' ? 'bg-[#1E293B] text-white' : 'text-[#94A3B8] hover:text-white'
            }`}
          >
            雙向實測與盲寫對照
          </button>
          <button
            type="button"
            onClick={() => setSubMode('single')}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
              subMode === 'single' ? 'bg-[#1E293B] text-white' : 'text-[#94A3B8] hover:text-white'
            }`}
          >
            單次試跑與 MCP 匯流排
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleAutoSse}
            className={`px-2.5 py-1 text-[11px] font-mono rounded border transition-colors cursor-pointer whitespace-nowrap ${
              autoSseSync
                ? sseConnected
                  ? 'bg-[#0F1F18] border-[#16A34A] text-[#4ADE80]'
                  : 'bg-[#131C2E] border-[#283B5C] text-[#38BDF8]'
                : 'bg-[#090C12] border-[#232A3B] text-[#94A3B8]'
            }`}
          >
            {autoSseSync
              ? sseConnected
                ? 'SSE 自動同步：已連線'
                : 'SSE 自動同步：連線中'
              : 'SSE 自動同步：已暫停'}
          </button>
          {benchmarkResult && subMode === 'bidirectional' && (
            <span className="font-mono tabular-nums text-[11px] text-[#94A3B8] whitespace-nowrap">
              {benchmarkResult.totalDurationMs} ms
            </span>
          )}
        </div>
      </div>

      {/* Mode 1: Interactive Bidirectional Dogfooding Suite */}
      {subMode === 'bidirectional' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="border border-[#232A3B] bg-[#131822] rounded-md p-3.5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-white">
                <ArrowLeftRight className="w-4 h-4 text-[#4ADE80]" />
                雙向閉環實測（視覺改碼 + MCP JSON-RPC 推碼試跑）
              </div>
              <button
                type="button"
                disabled={benchmarkRunning}
                onClick={onRunBidirectionalBenchmark}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[#16A34A] hover:bg-[#15803D] disabled:opacity-50 text-white rounded transition-colors cursor-pointer whitespace-nowrap"
              >
                <Play className="w-3.5 h-3.5" />
                {benchmarkRunning ? '執行雙向實測中...' : '執行雙向實測與對照驗證'}
              </button>
            </div>
            <p className="text-xs text-[#94A3B8] leading-relaxed">
              以真實無頭引擎與伺服器 <code className="font-mono text-[#E2E8F0]">/mcp</code> 端點進行兩階段對照：先以盲寫座標導致「出生卡進苔蘚牆 / 目標錯置高台」進行基準試跑，再依序實測方向 A（視覺檢視器回寫 .ts）與方向 B（AI 透過 MCP 診斷雷達並就地修補同步畫布）。
            </p>
            {benchmarkResult && (
              <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-[#1E2536]">
                <button
                  type="button"
                  onClick={() =>
                    onApplyFilesToWorkbench(benchmarkResult.buggyBlindFiles, '盲寫缺陷考題（卡牆實例）')
                  }
                  className="px-2.5 py-1 text-xs font-medium bg-[#1E293B] hover:bg-[#293548] text-[#FBBF24] rounded transition-colors cursor-pointer whitespace-nowrap"
                >
                  載入盲寫缺陷版至畫布
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onApplyFilesToWorkbench(benchmarkResult.repairedFiles, '雙向閉環修復版')
                  }
                  className="px-2.5 py-1 text-xs font-medium bg-[#131C2E] hover:bg-[#1C2A44] text-[#4ADE80] border border-[#283B5C] rounded transition-colors cursor-pointer whitespace-nowrap"
                >
                  載入閉環修復版至畫布
                </button>
              </div>
            )}
          </div>

          {!benchmarkResult ? (
            <div className="border border-[#232A3B] bg-[#131822] rounded-md p-5 text-xs text-[#94A3B8] leading-relaxed">
              點擊上方「執行雙向實測與對照驗證」即可真實執行整個雙向迴圈，並在完成後將閉環修復版直接熱載入右側即時渲染畫布。
            </div>
          ) : (
            <>
              {/* Blind Write vs Closed-Loop Comparison Table */}
              <div className="border border-[#232A3B] bg-[#131822] rounded-md overflow-hidden">
                <div className="px-3.5 py-2 border-b border-[#232A3B] bg-[#10141D] flex items-center justify-between text-xs">
                  <span className="font-medium text-white">精準度實測對照表：純盲寫 vs. 閉環試跑</span>
                  <span className="font-mono text-[11px] text-[#94A3B8]">真實同構引擎實測輸出</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-[#232A3B] bg-[#0B0E14] text-[11px] font-mono text-[#94A3B8]">
                        <th className="py-2 px-3 font-medium">評估項目</th>
                        <th className="py-2 px-3 font-medium">純盲寫基準 (無試跑)</th>
                        <th className="py-2 px-3 font-medium">閉環自測 ＋ 雙向回寫</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1E2536]">
                      {benchmarkResult.comparisonRows.map((row) => (
                        <tr key={row.metric}>
                          <td className="py-2 px-3 text-[#CBD5E1] font-medium whitespace-nowrap">
                            {row.metric}
                          </td>
                          <td
                            className={`py-2 px-3 font-mono tabular-nums ${
                              row.blindStatus === 'pass'
                                ? 'text-[#4ADE80]'
                                : row.blindStatus === 'warn'
                                  ? 'text-[#FBBF24]'
                                  : 'text-[#F87171]'
                            }`}
                          >
                            {row.blindWriteValue}
                          </td>
                          <td
                            className={`py-2 px-3 font-mono tabular-nums ${
                              row.closedStatus === 'pass' ? 'text-[#4ADE80]' : 'text-[#FBBF24]'
                            }`}
                          >
                            {row.closedLoopValue}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Direction A: Visual Inspector -> Source Writeback */}
              <div className="border border-[#232A3B] bg-[#131822] rounded-md overflow-hidden">
                <div className="px-3.5 py-2 border-b border-[#232A3B] bg-[#10141D] flex items-center justify-between text-xs">
                  <span className="font-medium text-white">方向 A：視覺節點調整 → TypeScript 原始碼就地回寫</span>
                  <span className="font-mono tabular-nums text-[11px] text-[#4ADE80]">
                    {benchmarkResult.directionAReport.checks.filter((c) => c.status === 'pass').length}/
                    {benchmarkResult.directionAReport.checks.length} PASS
                  </span>
                </div>
                <div className="divide-y divide-[#1E2536] font-mono text-[11px]">
                  {benchmarkResult.directionADiffs.map((d, idx) => (
                    <div key={`${d.nodeId}-${d.prop}-${idx}`} className="px-3.5 py-2 space-y-1">
                      <div className="flex items-center justify-between text-[#CBD5E1]">
                        <span>
                          {d.nodeId}.{d.prop} = {String(d.value)}
                        </span>
                        <span className="text-[#38BDF8] tabular-nums">
                          {d.filePath}:{d.lineNumber}
                        </span>
                      </div>
                      <div className="text-[#94A3B8] line-through truncate">- {d.beforeLine}</div>
                      <div className="text-[#4ADE80] truncate">+ {d.afterLine}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Direction B: MCP JSON-RPC Closed Loop */}
              <div className="border border-[#232A3B] bg-[#131822] rounded-md overflow-hidden">
                <div className="px-3.5 py-2 border-b border-[#232A3B] bg-[#10141D] flex items-center justify-between text-xs">
                  <span className="font-medium text-white">方向 B：AI / MCP 空間病因診斷 ＋ 鑿牆與 Hitbox 回寫</span>
                  <span className="font-mono tabular-nums text-[11px] text-[#38BDF8]">
                    {benchmarkResult.mcpTrace.length} 次實機 RPC 呼叫
                  </span>
                </div>
                <div className="divide-y divide-[#1E2536] text-xs">
                  {benchmarkResult.mcpTrace.map((t, i) => (
                    <div key={i} className="px-3.5 py-2 flex items-start justify-between gap-3">
                      <div className="space-y-0.5 min-w-0">
                        <div className="font-medium text-[#E2E8F0]">
                          {t.step} <span className="font-mono text-[11px] text-[#64748B]">({t.tool})</span>
                        </div>
                        <div className="font-mono text-[11px] text-[#94A3B8] break-all">{t.summary}</div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 font-mono tabular-nums text-[11px]">
                        <span className="text-[#94A3B8]">{t.latencyMs}ms</span>
                        <span
                          className={
                            t.status === 'ok'
                              ? 'text-[#4ADE80]'
                              : t.status === 'warn'
                                ? 'text-[#FBBF24]'
                                : 'text-[#F87171]'
                          }
                        >
                          {t.status.toUpperCase()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                {benchmarkResult.directionBDiffs.length > 0 && (
                  <div className="border-t border-[#232A3B] bg-[#0B0E14] divide-y divide-[#1E2536] font-mono text-[11px]">
                    {benchmarkResult.directionBDiffs.map((d, idx) => (
                      <div key={`bdiff-${idx}`} className="px-3.5 py-2 space-y-0.5">
                        <div className="flex items-center justify-between text-[#CBD5E1]">
                          <span>MCP → {d.nodeId}.{d.prop}</span>
                          <span className="text-[#38BDF8] tabular-nums">
                            {d.filePath}:{d.lineNumber}
                          </span>
                        </div>
                        <div className="text-[#94A3B8] line-through truncate">- {d.beforeLine}</div>
                        <div className="text-[#4ADE80] truncate">+ {d.afterLine}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Before vs After ASCII Radar */}
              <div className="border border-[#232A3B] bg-[#131822] rounded-md overflow-hidden">
                <div className="px-3.5 py-2 border-b border-[#232A3B] bg-[#10141D] flex items-center justify-between gap-2 text-[11px] font-mono">
                  <span className="text-[#CBD5E1]">空間故障雷達對比 (@ 玩家 · D 木樁 · E 敵人)</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setRadarView('blind')}
                      className={`px-2 py-0.5 rounded cursor-pointer ${
                        radarView === 'blind' ? 'bg-[#1E293B] text-[#FBBF24]' : 'text-[#94A3B8]'
                      }`}
                    >
                      盲寫故障 (卡牆)
                    </button>
                    <button
                      type="button"
                      onClick={() => setRadarView('repaired')}
                      className={`px-2 py-0.5 rounded cursor-pointer ${
                        radarView === 'repaired' ? 'bg-[#1E293B] text-[#4ADE80]' : 'text-[#94A3B8]'
                      }`}
                    >
                      閉環修復後
                    </button>
                  </div>
                </div>
                <pre className="p-3 bg-[#090C12] font-mono text-[10px] leading-[1.15] text-[#94A3B8] overflow-x-auto select-all">
                  {radarView === 'blind'
                    ? benchmarkResult.blindReport.asciiRadar
                    : benchmarkResult.directionBPostReport.asciiRadar}
                </pre>
              </div>
            </>
          )}
        </div>
      )}

      {/* Mode 2: Single Playtest Runner & External CLI / MCP Bridge */}
      {subMode === 'single' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Control Header */}
          <div className="border border-[#232A3B] bg-[#131822] rounded-md p-3.5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-white">
                <Activity className="w-4 h-4 text-[#4ADE80]" />
                AI 無頭自動試跑與碰撞診斷 (Headless Runtime)
              </div>
              <button
                type="button"
                disabled={running}
                onClick={onRunPlaytest}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[#16A34A] hover:bg-[#15803D] disabled:opacity-50 text-white rounded transition-colors cursor-pointer whitespace-nowrap"
              >
                <Play className="w-3.5 h-3.5" />
                {running ? '試跑模擬中...' : '執行自動試跑'}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
              <div className="sm:col-span-2 space-y-1">
                <label className="block text-[11px] font-mono text-[#94A3B8]">試跑驗證劇本</label>
                <select
                  value={scenario}
                  onChange={(e) => {
                    const next = e.target.value as PlaytestScenarioId;
                    onChangeScenario(next);
                    if (next === 'campaign-clear' && ticks < 1200) {
                      onChangeTicks(1800);
                    }
                  }}
                  className="w-full px-2.5 py-1.5 bg-[#0B0E14] border border-[#232A3B] rounded text-xs font-mono text-[#E2E8F0] focus:outline-none focus:border-[#4ADE80]"
                >
                  {SCENARIO_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] font-mono text-[#94A3B8]">模擬步數 (60Hz Ticks)</label>
                <select
                  value={ticks}
                  onChange={(e) => onChangeTicks(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 bg-[#0B0E14] border border-[#232A3B] rounded text-xs font-mono tabular-nums text-[#E2E8F0] focus:outline-none focus:border-[#4ADE80]"
                >
                  <option value={180}>180 ticks (3.0s)</option>
                  <option value={240}>240 ticks (4.0s)</option>
                  <option value={360}>360 ticks (6.0s)</option>
                  <option value={1800}>1800 ticks (30.0s)</option>
                  <option value={2400}>2400 ticks (40.0s)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Diagnostic Report Output */}
          {!report ? (
            <div className="border border-[#232A3B] bg-[#131822] rounded-md p-5 text-xs text-[#94A3B8] leading-relaxed">
              點擊「執行自動試跑」即可在同構無頭沙盒中以固定步長 60Hz 推進當前多檔 TypeScript 專案，驗證地形接地、Hitbox 碰撞傷害、協程活性、CRC32 確定性並輸出 ASCII 關卡空間雷達圖。
            </div>
          ) : (
            <>
              <div className="border border-[#232A3B] bg-[#131822] rounded-md overflow-hidden">
                <div className="px-3.5 py-2 border-b border-[#232A3B] bg-[#10141D] flex items-center justify-between text-xs">
                  <span className="font-medium text-white">自動化健檢結果</span>
                  <span className="font-mono tabular-nums text-[11px] text-[#94A3B8]">
                    編譯 {report.compileMs}ms · 模擬 {report.simMs}ms · CRC32 {report.crc32}
                  </span>
                </div>
                <div className="divide-y divide-[#1E2536]">
                  {report.checks.map((chk) => (
                    <div key={chk.id} className="px-3.5 py-2 flex items-start justify-between gap-3 text-xs">
                      <div className="space-y-0.5 min-w-0">
                        <div className="font-medium text-[#E2E8F0]">{chk.label}</div>
                        <div className="font-mono text-[11px] text-[#94A3B8] break-all">{chk.detail}</div>
                      </div>
                      <span
                        className={`font-mono text-[11px] font-semibold uppercase tracking-wider shrink-0 ${
                          chk.status === 'pass'
                            ? 'text-[#4ADE80]'
                            : chk.status === 'warn'
                              ? 'text-[#FBBF24]'
                              : 'text-[#F87171]'
                        }`}
                      >
                        {chk.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 border border-[#232A3B] bg-[#131822] rounded-md divide-y sm:divide-y-0 sm:divide-x divide-[#232A3B] text-xs">
                <div className="p-2.5">
                  <div className="text-[11px] text-[#94A3B8]">命中次數 / 總傷</div>
                  <div className="font-mono tabular-nums text-sm font-semibold text-white mt-0.5">
                    {report.metrics.hitsLanded} / {report.metrics.totalDamageDealt}
                  </div>
                </div>
                <div className="p-2.5">
                  <div className="text-[11px] text-[#94A3B8]">最高連擊 / 承傷</div>
                  <div className="font-mono tabular-nums text-sm font-semibold text-white mt-0.5">
                    {report.metrics.maxCombo} / {report.metrics.playerDamageTaken}
                  </div>
                </div>
                <div className="p-2.5">
                  <div className="text-[11px] text-[#94A3B8]">玩家終點座標</div>
                  <div className="font-mono tabular-nums text-sm font-semibold text-[#38BDF8] mt-0.5">
                    ({report.metrics.playerFinalX}, {report.metrics.playerFinalY})
                  </div>
                </div>
                <div className="p-2.5">
                  <div className="text-[11px] text-[#94A3B8]">協程 / 實體數</div>
                  <div className="font-mono tabular-nums text-sm font-semibold text-[#4ADE80] mt-0.5">
                    {report.metrics.activeCoroutines} / {report.metrics.entityCount}
                  </div>
                </div>
              </div>

              {report.spatialHints && report.spatialHints.length > 0 && (
                <div className="border border-[#232A3B] bg-[#131822] rounded-md overflow-hidden">
                  <div className="px-3.5 py-2 border-b border-[#232A3B] bg-[#10141D] text-[11px] font-mono text-[#FBBF24]">
                    空間病因與可執行修復提示 ({report.spatialHints.length})
                  </div>
                  <div className="p-3 bg-[#090C12] font-mono text-[11px] text-[#FDE68A] space-y-1.5">
                    {report.spatialHints.map((hint, idx) => (
                      <div key={idx}>{hint}</div>
                    ))}
                  </div>
                </div>
              )}

              {report.metrics.stagesVisited && report.metrics.stagesVisited.length > 0 && (
                <div className="px-3.5 py-2 border border-[#232A3B] bg-[#131822] rounded-md flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
                  <span className="text-[#CBD5E1]">
                    關卡歷程：{report.metrics.stagesVisited.join(' → ')}
                  </span>
                  <span
                    className={
                      report.metrics.finalGamePhase === 'victory'
                        ? 'text-[#4ADE80] font-semibold'
                        : report.metrics.finalGamePhase === 'gameover'
                          ? 'text-[#F87171] font-semibold'
                          : 'text-[#38BDF8]'
                    }
                  >
                    {report.metrics.finalGamePhase?.toUpperCase() ?? 'PLAYING'} · Boss Phase{' '}
                    {report.metrics.bossPhaseReached ?? 1}
                  </span>
                </div>
              )}

              {report.asciiRadar && (
                <div className="border border-[#232A3B] bg-[#131822] rounded-md overflow-hidden">
                  <div className="px-3.5 py-2 border-b border-[#232A3B] bg-[#10141D] flex items-center justify-between text-[11px] font-mono">
                    <span className="text-[#CBD5E1]">ASCII 關卡空間雷達 (@ 玩家 · E 敵人 · B 魔王 · K 鑰匙 · O 門 · T 火把)</span>
                    <span className="text-[#64748B]">{report.ticksSimulated} ticks</span>
                  </div>
                  <pre className="p-3 bg-[#090C12] font-mono text-[10px] leading-[1.15] text-[#94A3B8] overflow-x-auto select-all">
                    {report.asciiRadar}
                  </pre>
                </div>
              )}

              {report.timelineEvents.length > 0 && (
                <div className="border border-[#232A3B] bg-[#131822] rounded-md overflow-hidden">
                  <div className="px-3.5 py-2 border-b border-[#232A3B] bg-[#10141D] text-[11px] font-mono text-[#CBD5E1]">
                    時間軸戰鬥與碰撞事件紀錄 ({report.timelineEvents.length})
                  </div>
                  <div className="p-2.5 bg-[#090C12] font-mono text-[11px] text-[#4ADE80] space-y-1 max-h-36 overflow-y-auto">
                    {report.timelineEvents.map((ev, idx) => (
                      <div key={idx}>{ev}</div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* External AI CLI / MCP Workspace Sync Bridge */}
          <div className="border border-[#232A3B] bg-[#131822] rounded-md p-3.5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-white">
                <Terminal className="w-4 h-4 text-[#38BDF8]" />
                外部 AI CLI / MCP JSON-RPC 工作區匯流排
              </div>
              {lastBusSyncLabel && (
                <span className="font-mono text-[11px] text-[#38BDF8]">{lastBusSyncLabel}</span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={busSyncing}
                onClick={onPushWorkspace}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#1E293B] hover:bg-[#293548] disabled:opacity-50 text-white rounded transition-colors cursor-pointer"
              >
                <ArrowUpFromLine className="w-3.5 h-3.5 text-[#4ADE80]" />
                推送目前專案至 Bus
              </button>
              <button
                type="button"
                disabled={busSyncing}
                onClick={onPullWorkspace}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#131C2E] hover:bg-[#1C2A44] disabled:opacity-50 text-[#38BDF8] border border-[#283B5C] rounded transition-colors cursor-pointer"
              >
                <ArrowDownToLine className="w-3.5 h-3.5" />
                從外部 AI 同步工作區
              </button>
            </div>

            <div className="space-y-2 text-[11px] font-mono">
              <div className="flex items-center justify-between text-[#94A3B8]">
                <span>MCP JSON-RPC 2.0 端點：{mcpUrl}</span>
                <button
                  type="button"
                  onClick={() => copyText('mcp', `curl -X POST ${mcpUrl} -H "Content-Type: application/json" -d '${mcpSnippet.replace(/\n/g, ' ')}'`)}
                  className="inline-flex items-center gap-1 text-[#CBD5E1] hover:text-white cursor-pointer"
                >
                  {copiedKey === 'mcp' ? <Check className="w-3 h-3 text-[#4ADE80]" /> : <Copy className="w-3 h-3" />}
                  {copiedKey === 'mcp' ? '已複製 curl' : '複製 curl'}
                </button>
              </div>
              <pre className="p-2.5 bg-[#090C12] border border-[#1E2536] rounded text-[#94A3B8] overflow-x-auto">
                {mcpSnippet}
              </pre>

              <div className="flex items-center justify-between text-[#94A3B8] pt-1">
                <span>本地端無頭模擬 CLI 指令：</span>
                <button
                  type="button"
                  onClick={() => copyText('cli', cliSnippet)}
                  className="inline-flex items-center gap-1 text-[#CBD5E1] hover:text-white cursor-pointer"
                >
                  {copiedKey === 'cli' ? <Check className="w-3 h-3 text-[#4ADE80]" /> : <Copy className="w-3 h-3" />}
                  {copiedKey === 'cli' ? '已複製' : '複製指令'}
                </button>
              </div>
              <pre className="p-2 bg-[#090C12] border border-[#1E2536] rounded text-[#4ADE80] overflow-x-auto">
                {cliSnippet}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

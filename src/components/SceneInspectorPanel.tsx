import { useState } from 'react';
import { Check, Copy, FileCode2, GitBranch, PlusCircle } from 'lucide-react';
import { TILE_KIND_TO_GLYPH, type SourcePatchResult } from '../engine/sourcePatcher';
import type { EngineSceneNode, EngineSceneTreeSnapshot, TileKind } from '../engine/types';

interface SceneInspectorPanelProps {
  sceneTree: EngineSceneTreeSnapshot | null;
  selectedNodeId: string;
  onSelectNode: (nodeId: string) => void;
  onPatchProp: (nodeId: string, prop: string, value: string | number | boolean) => void;
  getCodeSnippet: (nodeId: string) => string;
  onAppendCodeSnippet: (snippet: string) => void;
  lastPatchResult?: SourcePatchResult | null;
  tileGrid?: TileKind[][];
  onPaintTileCell?: (row: number, col: number, glyph: string) => void;
}

function findNodeById(node: EngineSceneNode | undefined, id: string): EngineSceneNode | null {
  if (!node) return null;
  if (node.id === id) return node;
  if (node.children) {
    for (const child of node.children) {
      const hit = findNodeById(child, id);
      if (hit) return hit;
    }
  }
  return null;
}

const SLIDER_CONFIG: Record<string, { min: number; max: number; step: number }> = {
  ambientDarkness: { min: 0, max: 0.92, step: 0.02 },
  radius: { min: 16, max: 220, step: 2 },
  intensity: { min: 0, max: 1.5, step: 0.05 },
  flicker: { min: 0, max: 0.6, step: 0.02 },
  moveSpeed: { min: 0, max: 8, step: 0.1 },
  speed: { min: 0, max: 1, step: 0.02 },
  heightRatio: { min: 0.2, max: 1, step: 0.02 },
  patrolRange: { min: 0, max: 240, step: 4 },
  hitX: { min: 0, max: 64, step: 1 },
  hitY: { min: 0, max: 64, step: 1 },
  hitW: { min: 8, max: 64, step: 1 },
  hitH: { min: 8, max: 64, step: 1 },
};

const BRUSH_OPTIONS: Array<{ glyph: string; label: string; color: string }> = [
  { glyph: '.', label: '. 空', color: 'text-[#64748B]' },
  { glyph: '#', label: '# 石牆', color: 'text-[#CBD5E1]' },
  { glyph: '=', label: '= 青苔', color: 'text-[#4ADE80]' },
  { glyph: '-', label: '- 平台', color: 'text-[#38BDF8]' },
  { glyph: 'T', label: 'T 火把', color: 'text-[#FBBF24]' },
  { glyph: '^', label: '^ 尖刺', color: 'text-[#F87171]' },
];

const READONLY_PROPS = new Set([
  'tick',
  'score',
  'combo',
  'crc32',
  'kind',
  'cols',
  'rows',
  'tileSize',
  'torches',
  'fps',
  'loop',
  'frames',
  'activeHitFrames',
  'type',
  'attachTo',
  'aiState',
  'targetStage',
  'unlock',
  'unlocked',
  'collected',
  'value',
  'stageId',
  'gamePhase',
  'keys',
]);

export function SceneInspectorPanel({
  sceneTree,
  selectedNodeId,
  onSelectNode,
  onPatchProp,
  getCodeSnippet,
  onAppendCodeSnippet,
  lastPatchResult,
  tileGrid,
  onPaintTileCell,
}: SceneInspectorPanelProps) {
  const [copied, setCopied] = useState(false);
  const [activeBrush, setActiveBrush] = useState<string>('.');

  if (!sceneTree) {
    return (
      <div className="flex-1 p-6 bg-[#0D1017] text-xs text-[#94A3B8]">
        尚未建立運行中的場景節點樹，請先編譯腳本。
      </div>
    );
  }

  const selectedNode = findNodeById(sceneTree.root, selectedNodeId) ?? sceneTree.root;
  const snippet = getCodeSnippet(selectedNode.id);

  const handleCopySnippet = () => {
    if (!snippet) return;
    void navigator.clipboard?.writeText(snippet).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="flex-1 flex flex-col sm:flex-row bg-[#0D1017] overflow-hidden min-h-0">
      {/* Left: Godot-style Scene Tree */}
      <div className="sm:w-5/12 border-b sm:border-b-0 sm:border-r border-[#232A3B] flex flex-col overflow-hidden">
        <div className="px-3.5 py-2 border-b border-[#232A3B] bg-[#0B0E14] flex items-center justify-between text-[11px] font-mono text-[#94A3B8]">
          <span className="inline-flex items-center gap-1.5 text-[#CBD5E1]">
            <GitBranch className="w-3.5 h-3.5 text-[#4ADE80]" />
            場景節點樹 (Scene Tree)
          </span>
          <span className="tabular-nums">{sceneTree.nodeCount} nodes</span>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-0.5 text-xs font-mono">
          {/* Root Node */}
          <button
            type="button"
            onClick={() => onSelectNode(sceneTree.root.id)}
            className={`w-full text-left px-2.5 py-1.5 rounded flex items-center justify-between gap-2 transition-colors cursor-pointer ${
              selectedNode.id === sceneTree.root.id
                ? 'bg-[#1E293B] text-white'
                : 'text-[#CBD5E1] hover:bg-[#131822]'
            }`}
          >
            <span className="truncate font-semibold">{sceneTree.root.label}</span>
            <span className="text-[10px] text-[#64748B] shrink-0">{sceneTree.root.typeTag}</span>
          </button>

          {/* Child Nodes */}
          <div className="pl-3 border-l border-[#1E2536] ml-2.5 space-y-0.5">
            {(sceneTree.root.children ?? []).map((node) => {
              const active = selectedNode.id === node.id;
              return (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => onSelectNode(node.id)}
                  className={`w-full text-left px-2.5 py-1.5 rounded flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                    active ? 'bg-[#1E293B] text-white' : 'text-[#94A3B8] hover:bg-[#131822] hover:text-[#E2E8F0]'
                  }`}
                >
                  <span className="truncate">{node.label}</span>
                  <span className="text-[10px] text-[#64748B] shrink-0">{node.typeTag}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Right: Live Inspector */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-4 py-2 border-b border-[#232A3B] bg-[#0B0E14] flex items-center justify-between text-[11px] font-mono">
          <span className="text-white font-semibold truncate">{selectedNode.label}</span>
          <span className="text-[#38BDF8] shrink-0">{selectedNode.typeTag}</span>
        </div>

        {/* Bidirectional Visual-to-Code Writeback Banner */}
        {lastPatchResult && (
          <div
            className={`px-4 py-2 border-b border-[#232A3B] text-[11px] font-mono space-y-1 ${
              lastPatchResult.patched ? 'bg-[#0F1F18]' : 'bg-[#171A24]'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-[#CBD5E1]">
                <FileCode2
                  className={`w-3.5 h-3.5 shrink-0 ${
                    lastPatchResult.patched ? 'text-[#4ADE80]' : 'text-[#FBBF24]'
                  }`}
                />
                {lastPatchResult.patched
                  ? `雙向代碼回寫成功 · ${lastPatchResult.filePath}:${lastPatchResult.lineNumber}`
                  : '僅套用至執行期記憶體（未命中現有靜態宣告）'}
              </span>
              <span
                className={`text-[10px] uppercase tracking-wider shrink-0 ${
                  lastPatchResult.patched ? 'text-[#4ADE80]' : 'text-[#FBBF24]'
                }`}
              >
                {lastPatchResult.patched ? 'SYNCED TO .TS' : 'RUNTIME ONLY'}
              </span>
            </div>
            {lastPatchResult.patched && lastPatchResult.afterLine && (
              <div className="bg-[#0B0E14] border border-[#1E293B] rounded px-2 py-1 space-y-0.5 overflow-x-auto">
                {lastPatchResult.beforeLine && lastPatchResult.beforeLine !== lastPatchResult.afterLine && (
                  <div className="text-[#94A3B8] line-through truncate">- {lastPatchResult.beforeLine}</div>
                )}
                <div className="text-[#4ADE80] truncate">+ {lastPatchResult.afterLine}</div>
              </div>
            )}
            {!lastPatchResult.patched && lastPatchResult.reason && (
              <div className="text-[#94A3B8] truncate">{lastPatchResult.reason}</div>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {Object.entries(selectedNode.props).map(([propKey, propVal]) => {
            const isReadonly = READONLY_PROPS.has(propKey);
            const isColor =
              typeof propVal === 'string' &&
              (propKey.toLowerCase().includes('color') || propVal.startsWith('#'));

            if (isReadonly) {
              return (
                <div
                  key={propKey}
                  className="flex items-center justify-between gap-3 text-xs py-1 border-b border-[#1A202E]"
                >
                  <span className="font-mono text-[#94A3B8]">{propKey}</span>
                  <span className="font-mono tabular-nums text-[#E2E8F0]">{String(propVal)}</span>
                </div>
              );
            }

            if (typeof propVal === 'boolean') {
              return (
                <div
                  key={propKey}
                  className="flex items-center justify-between gap-3 text-xs py-1 border-b border-[#1A202E]"
                >
                  <span className="font-mono text-[#CBD5E1]">{propKey}</span>
                  <button
                    type="button"
                    onClick={() => onPatchProp(selectedNode.id, propKey, !propVal)}
                    className={`px-2.5 py-1 font-mono text-[11px] rounded cursor-pointer ${
                      propVal ? 'bg-[#16A34A] text-white' : 'bg-[#1E293B] text-[#94A3B8]'
                    }`}
                  >
                    {propVal ? 'ENABLED' : 'DISABLED'}
                  </button>
                </div>
              );
            }

            if (isColor && typeof propVal === 'string' && /^#[0-9a-fA-F]{6}$/.test(propVal)) {
              return (
                <div
                  key={propKey}
                  className="flex items-center justify-between gap-3 text-xs py-1 border-b border-[#1A202E]"
                >
                  <span className="font-mono text-[#CBD5E1]">{propKey}</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={propVal}
                      onChange={(e) => onPatchProp(selectedNode.id, propKey, e.target.value)}
                      className="w-7 h-6 bg-transparent border border-[#2D374E] rounded cursor-pointer"
                    />
                    <span className="font-mono text-[#94A3B8]">{propVal}</span>
                  </div>
                </div>
              );
            }

            if (propKey === 'state' && selectedNode.kind === 'entity') {
              return (
                <div key={propKey} className="space-y-1.5 py-1 border-b border-[#1A202E]">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono text-[#CBD5E1]">state (即時觸發動作)</span>
                    <span className="font-mono text-[#4ADE80]">{String(propVal)}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {['idle', 'run', 'slash', 'hurt'].map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => onPatchProp(selectedNode.id, 'state', st)}
                        className={`px-2 py-1 text-[11px] font-mono rounded cursor-pointer ${
                          propVal === st ? 'bg-[#16A34A] text-white' : 'bg-[#1E293B] text-[#CBD5E1]'
                        }`}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>
              );
            }

            if (propKey === 'facing' && selectedNode.kind === 'entity') {
              return (
                <div
                  key={propKey}
                  className="flex items-center justify-between gap-3 text-xs py-1 border-b border-[#1A202E]"
                >
                  <span className="font-mono text-[#CBD5E1]">facing</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onPatchProp(selectedNode.id, 'facing', -1)}
                      className={`px-2.5 py-1 text-[11px] font-mono rounded cursor-pointer ${
                        Number(propVal) < 0 ? 'bg-[#1E293B] text-white border border-[#3B4761]' : 'text-[#94A3B8]'
                      }`}
                    >
                      -1 (左)
                    </button>
                    <button
                      type="button"
                      onClick={() => onPatchProp(selectedNode.id, 'facing', 1)}
                      className={`px-2.5 py-1 text-[11px] font-mono rounded cursor-pointer ${
                        Number(propVal) > 0 ? 'bg-[#1E293B] text-white border border-[#3B4761]' : 'text-[#94A3B8]'
                      }`}
                    >
                      +1 (右)
                    </button>
                  </div>
                </div>
              );
            }

            if (typeof propVal === 'number') {
              const slider = SLIDER_CONFIG[propKey];
              return (
                <div key={propKey} className="space-y-1 py-1 border-b border-[#1A202E]">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-mono text-[#CBD5E1]">{propKey}</span>
                    <input
                      type="number"
                      step={slider?.step ?? 1}
                      value={propVal}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        if (!Number.isNaN(v)) onPatchProp(selectedNode.id, propKey, v);
                      }}
                      className="w-24 px-2 py-0.5 text-right font-mono tabular-nums text-xs bg-[#131822] border border-[#232A3B] rounded text-white focus:outline-none focus:border-[#4ADE80]"
                    />
                  </div>
                  {slider && (
                    <input
                      type="range"
                      min={slider.min}
                      max={slider.max}
                      step={slider.step}
                      value={propVal}
                      onChange={(e) => onPatchProp(selectedNode.id, propKey, Number(e.target.value))}
                      className="w-full accent-[#16A34A] cursor-pointer"
                    />
                  )}
                </div>
              );
            }

            return (
              <div
                key={propKey}
                className="flex items-center justify-between gap-3 text-xs py-1 border-b border-[#1A202E]"
              >
                <span className="font-mono text-[#94A3B8]">{propKey}</span>
                <span className="font-mono text-[#E2E8F0]">{String(propVal)}</span>
              </div>
            );
          })}

          {/* Interactive ASCII Tilemap Cell Painter when TileMapLayer is selected */}
          {selectedNode.kind === 'tilemap' && tileGrid && tileGrid.length > 0 && onPaintTileCell && (
            <div className="pt-2 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
                <span className="text-[#CBD5E1]">點擊方格即時鑿開 / 放置磚塊（雙向回寫 MAP_LAYOUT）</span>
                <div className="flex flex-wrap gap-1">
                  {BRUSH_OPTIONS.map((b) => (
                    <button
                      key={b.glyph}
                      type="button"
                      onClick={() => setActiveBrush(b.glyph)}
                      className={`px-1.5 py-0.5 rounded border text-[10px] cursor-pointer ${
                        activeBrush === b.glyph
                          ? 'bg-[#1E293B] border-[#4ADE80] text-white'
                          : 'bg-[#0B0E14] border-[#232A3B] text-[#94A3B8]'
                      }`}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="bg-[#090C12] border border-[#232A3B] rounded p-2 overflow-x-auto">
                <div className="inline-block space-y-0.5 font-mono text-[10px] leading-none">
                  {tileGrid.map((rowArr, rIdx) => (
                    <div key={rIdx} className="flex items-center gap-0.5">
                      <span className="w-5 text-[9px] text-[#475569] tabular-nums shrink-0">{rIdx}</span>
                      {rowArr.map((cellKind, cIdx) => {
                        const g = TILE_KIND_TO_GLYPH[cellKind] ?? '.';
                        const cls =
                          g === '#'
                            ? 'bg-[#334155] text-[#F1F5F9]'
                            : g === '='
                              ? 'bg-[#14532D] text-[#4ADE80]'
                              : g === '-'
                                ? 'bg-[#0C4A6E] text-[#38BDF8]'
                                : g === 'T'
                                  ? 'bg-[#78350F] text-[#FBBF24]'
                                  : g === '^'
                                    ? 'bg-[#7F1D1D] text-[#F87171]'
                                    : 'bg-[#0F141F] text-[#334155] hover:bg-[#1E293B]';
                        return (
                          <button
                            key={cIdx}
                            type="button"
                            title={`row=${rIdx}, col=${cIdx} (${g})`}
                            onClick={() => onPaintTileCell(rIdx, cIdx, activeBrush)}
                            className={`w-3.5 h-3.5 flex items-center justify-center rounded-[2px] cursor-pointer transition-colors ${cls}`}
                          >
                            {g}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Code Sync Footer */}
        {snippet && (
          <div className="border-t border-[#232A3B] bg-[#0B0E14] p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-mono text-[#94A3B8]">純程式 SDK 同步片段</span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleCopySnippet}
                  className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-mono bg-[#1E293B] hover:bg-[#293548] text-white rounded cursor-pointer"
                >
                  {copied ? <Check className="w-3 h-3 text-[#4ADE80]" /> : <Copy className="w-3 h-3" />}
                  {copied ? '已複製' : '複製'}
                </button>
                <button
                  type="button"
                  onClick={() => onAppendCodeSnippet(snippet)}
                  className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-mono bg-[#16A34A] hover:bg-[#15803D] text-white rounded cursor-pointer"
                >
                  <PlusCircle className="w-3 h-3" />
                  附加至腳本
                </button>
              </div>
            </div>
            <pre className="text-[11px] font-mono text-[#4ADE80] bg-[#131822] border border-[#232A3B] rounded p-2 overflow-x-auto whitespace-pre-wrap">
              {snippet}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

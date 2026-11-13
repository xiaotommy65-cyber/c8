import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Play,
  Pause,
  StepForward,
  RotateCcw,
  Download,
  Code2,
  BookOpen,
  Layers,
  Sun,
  Grid,
  Volume2,
  VolumeX,
  AlertCircle,
  CheckCircle2,
  GitBranch,
  RefreshCw,
  Activity,
  Maximize2,
} from 'lucide-react';
import { ChronoForgeEngine, VIEW_H, VIEW_W, type EngineInputState } from '../engine/ChronoForgeEngine';
import {
  runBidirectionalDogfoodSuite,
  type BidirectionalBenchmarkResult,
} from '../engine/bidirectionalBenchmark';
import { compileAndExecuteProject } from '../engine/moduleCompiler';
import { runHeadlessPlaytest, type PlaytestReport, type PlaytestScenarioId } from '../engine/playtestDiagnostics';
import { ENGINE_PRESETS, SDK_REFERENCE_DOCS } from '../engine/presets';
import {
  GLYPH_TO_TILE_KIND,
  patchProjectSourceFromInspector,
  patchTilemapInSource,
  type SourcePatchResult,
} from '../engine/sourcePatcher';
import { detectExternalJsonKind } from '../engine/externalImporters';
import { loadCrossZoneHandoff, saveCrossZoneHandoff } from '../engine/workspaceHandoff';
import { ZZFX_PRESETS, zzfxBridge } from '../engine/zzfxAudio';
import { CodeMirrorEditor } from './CodeMirrorEditor';
import { PlaytestDiagnosticsPanel } from './PlaytestDiagnosticsPanel';
import { SceneInspectorPanel } from './SceneInspectorPanel';
import { VirtualFileExplorer } from './VirtualFileExplorer';
import type {
  AsepriteJson,
  EnginePreset,
  EngineSceneTreeSnapshot,
  EngineSnapshotStats,
  ExternalImportedAssets,
  LDtkJson,
  StudioBundleInput,
  TiledJson,
  VirtualProjectFile,
  ZzfxPresetName,
} from '../engine/types';

type LeftTab = 'editor' | 'scene' | 'diagnostics' | 'compiled' | 'docs';

function presetToFiles(preset: EnginePreset): { entry: string; files: VirtualProjectFile[] } {
  if (preset.files && preset.files.length > 0) {
    return {
      entry: preset.entryFile ?? preset.files[0].path,
      files: preset.files.map((f) => ({ ...f })),
    };
  }
  return {
    entry: 'main.ts',
    files: [{ path: 'main.ts', kind: 'entry', code: preset.code, summary: '主腳本' }],
  };
}

export function EngineWorkbench() {
  const initialFiles = presetToFiles(ENGINE_PRESETS[0]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>(ENGINE_PRESETS[0].id);
  const [projectFiles, setProjectFiles] = useState<VirtualProjectFile[]>(initialFiles.files);
  const [entryFile, setEntryFile] = useState<string>(initialFiles.entry);
  const [activeFilePath, setActiveFilePath] = useState<string>(initialFiles.entry);
  const [leftTab, setLeftTab] = useState<LeftTab>('editor');
  const [compileError, setCompileError] = useState<string | null>(null);
  const [errorFile, setErrorFile] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [importedBundle, setImportedBundle] = useState<StudioBundleInput | null>(null);
  const [importedAssets, setImportedAssets] = useState<ExternalImportedAssets | null>(null);
  const [importedLabel, setImportedLabel] = useState<string | null>(null);
  const [sceneTree, setSceneTree] = useState<EngineSceneTreeSnapshot | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string>('root:scene');
  const [lastPatchResult, setLastPatchResult] = useState<SourcePatchResult | null>(null);
  const [playtestReport, setPlaytestReport] = useState<PlaytestReport | null>(null);
  const [playtestRunning, setPlaytestRunning] = useState(false);
  const [playtestScenario, setPlaytestScenario] = useState<PlaytestScenarioId>('combat-sweep');
  const [playtestTicks, setPlaytestTicks] = useState<number>(240);
  const [busSyncing, setBusSyncing] = useState(false);
  const [lastBusSyncLabel, setLastBusSyncLabel] = useState<string | null>(null);
  const [benchmarkResult, setBenchmarkResult] = useState<BidirectionalBenchmarkResult | null>(null);
  const [benchmarkRunning, setBenchmarkRunning] = useState(false);
  const [autoSseSync, setAutoSseSync] = useState(true);
  const [sseConnected, setSseConnected] = useState(false);

  const [isPaused, setIsPaused] = useState(false);
  const [showDebug, setShowDebug] = useState(true);
  const [enableLighting, setEnableLighting] = useState(true);
  const [audioMuted, setAudioMuted] = useState(false);
  const [stats, setStats] = useState<EngineSnapshotStats>({
    tick: 0,
    fps: 60,
    entityCount: 0,
    lightCount: 0,
    particleCount: 0,
    compiledActionCount: 0,
    compiledFrameCount: 0,
    crc32: 0,
    paused: false,
    compileMs: 0,
    playerHp: 100,
    playerMaxHp: 100,
    playerState: 'idle',
    score: 0,
    combo: 0,
    audioMuted: false,
    gamePhase: 'playing',
    stageId: 'stage_1',
    stageTitle: 'STAGE 1',
    keysCollected: [],
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<ChronoForgeEngine | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const projectFilesRef = useRef<VirtualProjectFile[]>(projectFiles);
  const benchmarkRunningRef = useRef(benchmarkRunning);
  const showDebugRef = useRef(showDebug);
  const enableLightingRef = useRef(enableLighting);
  const isPausedRef = useRef(isPaused);

  const inputRef = useRef<EngineInputState>({
    left: false,
    right: false,
    jump: false,
    slash: false,
    dash: false,
    restart: false,
  });

  projectFilesRef.current = projectFiles;
  benchmarkRunningRef.current = benchmarkRunning;
  showDebugRef.current = showDebug;
  enableLightingRef.current = enableLighting;
  isPausedRef.current = isPaused;

  const compileProject = useCallback(
    async (
      filesToCompile: VirtualProjectFile[],
      targetEntry: string,
      bundleOverride?: StudioBundleInput | null,
      assetsOverride?: ExternalImportedAssets | null,
    ) => {
      const nextEngine = new ChronoForgeEngine();
      const activeBundle = bundleOverride !== undefined ? bundleOverride : importedBundle;
      const activeAssets = assetsOverride !== undefined ? assetsOverride : importedAssets;
      nextEngine.audio.setMuted(audioMuted);

      const res = await compileAndExecuteProject(
        filesToCompile,
        targetEntry,
        nextEngine,
        activeBundle,
        activeAssets,
      );

      if (res.success) {
        engineRef.current = nextEngine;
        setCompileError(null);
        setErrorFile(null);
        setStatusNotice(`已編譯 ${res.compiledFilesCount} 個模組並熱重載（${res.compileMs} ms）`);
        setStats(nextEngine.getStats());
        setSceneTree(nextEngine.getSceneTree());
      } else {
        setCompileError(res.error ?? '未知編譯錯誤');
        setErrorFile(res.errorFile ?? null);
      }
    },
    [audioMuted, importedAssets, importedBundle],
  );

  const fetchBusStudioBundle = useCallback(async (): Promise<StudioBundleInput | null> => {
    try {
      const res = await fetch('/api/project-bus/studio-bundle');
      const data = await res.json();
      if (data?.bundle) return data.bundle as StudioBundleInput;
    } catch {
      // fallback below
    }
    try {
      const raw = localStorage.getItem('chronoforge_studio_bus');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.bundle) return parsed.bundle as StudioBundleInput;
      }
    } catch {
      // ignore
    }
    return null;
  }, []);

  // Initial boot compilation (supports ?bus=studio, ?preset=<id>, and ?handoff=1 from /play)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const busMode = params.get('bus');
    const presetParam = params.get('preset');
    const handoffParam = params.get('handoff');

    if (busMode === 'studio') {
      void fetchBusStudioBundle().then((bundle) => {
        const bridge = ENGINE_PRESETS.find((p) => p.id === 'studio-bridge') ?? ENGINE_PRESETS[0];
        const packed = presetToFiles(bridge);
        setSelectedPresetId(bridge.id);
        setProjectFiles(packed.files);
        setEntryFile(packed.entry);
        setActiveFilePath(packed.entry);
        if (bundle) {
          setImportedBundle(bundle);
          setImportedLabel(`Bus(${bundle.appearance?.theme ?? 'Studio'})`);
          void compileProject(packed.files, packed.entry, bundle, null);
        } else {
          void compileProject(packed.files, packed.entry, null, null);
        }
      });
      return;
    }

    if (handoffParam === '1') {
      const handoff = loadCrossZoneHandoff();
      if (handoff) {
        setSelectedPresetId(handoff.presetId);
        setProjectFiles(handoff.files);
        setEntryFile(handoff.entryFile);
        setActiveFilePath(handoff.entryFile);
        void compileProject(handoff.files, handoff.entryFile, null, null);
        return;
      }
    }

    if (presetParam) {
      const found = ENGINE_PRESETS.find((p) => p.id === presetParam);
      if (found) {
        const packed = presetToFiles(found);
        setSelectedPresetId(found.id);
        setProjectFiles(packed.files);
        setEntryFile(packed.entry);
        setActiveFilePath(packed.entry);
        void compileProject(packed.files, packed.entry, null, null);
        return;
      }
    }

    void compileProject(initialFiles.files, initialFiles.entry, null, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Real-time Server-Sent Events (SSE) subscription: auto-hot-reload when external AI CLI / MCP updates the workspace
  useEffect(() => {
    if (!autoSseSync) {
      setSseConnected(false);
      return;
    }
    const es = new EventSource('/api/project-bus/stream');
    es.addEventListener('connected', () => {
      setSseConnected(true);
    });
    es.addEventListener('workspace_update', (ev) => {
      if (benchmarkRunningRef.current) return;
      try {
        const snapshot = JSON.parse((ev as MessageEvent).data) as {
          presetId?: string;
          entryFile?: string;
          files?: VirtualProjectFile[];
          source?: string;
        };
        if (snapshot.source !== 'mcp' && snapshot.source !== 'cli') return;
        if (!Array.isArray(snapshot.files) || snapshot.files.length === 0) return;

        const nextFiles = snapshot.files;
        const nextEntry = typeof snapshot.entryFile === 'string' ? snapshot.entryFile : nextFiles[0].path;
        projectFilesRef.current = nextFiles;
        setProjectFiles(nextFiles);
        setEntryFile(nextEntry);
        setActiveFilePath((curr) => (nextFiles.some((f) => f.path === curr) ? curr : nextEntry));
        setLastPatchResult(null);
        setLastBusSyncLabel(`SSE 即時同步 (${snapshot.source})`);
        void compileProject(nextFiles, nextEntry).then(() => {
          setStatusNotice(`SSE 自動熱重載：已即時套用外部 ${snapshot.source} 變更`);
        });
      } catch {
        // ignore malformed SSE event
      }
    });
    es.onerror = () => {
      setSseConnected(false);
    };
    return () => {
      es.close();
      setSseConnected(false);
    };
  }, [autoSseSync, compileProject]);

  // Fixed 60Hz deterministic game loop
  useEffect(() => {
    let raf = 0;
    let lastTs = performance.now();
    let accMs = 0;
    const FIXED_DT = 1000 / 60;
    let uiSyncTick = 0;

    const frame = (ts: number) => {
      const dt = Math.max(0, Math.min(100, ts - lastTs));
      lastTs = ts;

      const eng = engineRef.current;
      const cvs = canvasRef.current;
      if (eng && cvs) {
        if (!isPausedRef.current) {
          accMs += dt;
          let steps = 0;
          while (accMs >= FIXED_DT && steps < 4) {
            eng.stepTick(inputRef.current);
            accMs -= FIXED_DT;
            steps++;
          }
          if (steps >= 4) accMs = 0;
        }

        const ctx = cvs.getContext('2d');
        if (ctx) {
          eng.render(ctx, {
            showDebug: showDebugRef.current,
            enableLighting: enableLightingRef.current,
          });
        }

        uiSyncTick++;
        if (uiSyncTick % 4 === 0) {
          setStats(eng.getStats());
          setSceneTree(eng.getSceneTree());
        }
      }

      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Keyboard listener (ignored when editing inside CodeMirror or inputs)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      const isEditing =
        el?.tagName === 'TEXTAREA' ||
        el?.tagName === 'INPUT' ||
        el?.isContentEditable ||
        Boolean(el?.closest('.cm-editor'));
      if (isEditing) {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
          e.preventDefault();
          void compileProject(projectFiles, entryFile);
        }
        return;
      }

      if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') inputRef.current.left = true;
      if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') inputRef.current.right = true;
      if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp' || e.key === ' ') {
        if (e.key === ' ') e.preventDefault();
        inputRef.current.jump = true;
      }
      if (e.key === 'j' || e.key === 'J') inputRef.current.slash = true;
      if (e.key === 'Shift') inputRef.current.dash = true;
      if (e.key === 'r' || e.key === 'R') inputRef.current.restart = true;
      zzfxBridge.unlock();
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') inputRef.current.left = false;
      if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') inputRef.current.right = false;
      if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp' || e.key === ' ') inputRef.current.jump = false;
      if (e.key === 'j' || e.key === 'J') inputRef.current.slash = false;
      if (e.key === 'Shift') inputRef.current.dash = false;
      if (e.key === 'r' || e.key === 'R') inputRef.current.restart = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [projectFiles, entryFile, compileProject]);

  const handleSelectPreset = (presetId: string) => {
    zzfxBridge.unlock();
    const found = ENGINE_PRESETS.find((p) => p.id === presetId);
    if (!found) return;
    const packed = presetToFiles(found);
    setSelectedPresetId(found.id);
    setProjectFiles(packed.files);
    setEntryFile(packed.entry);
    setActiveFilePath(packed.entry);
    setLastPatchResult(null);
    setPlaytestReport(null);
    void compileProject(packed.files, packed.entry);
  };

  const handleSyncFromStudioBus = async () => {
    zzfxBridge.unlock();
    const bundle = await fetchBusStudioBundle();
    if (!bundle) {
      setCompileError('跨區匯流排尚無來自精靈製作區 (/studio) 的資產快照');
      return;
    }
    setImportedBundle(bundle);
    setImportedLabel(`Bus(${bundle.appearance?.theme ?? 'Studio'})`);
    const bridge = ENGINE_PRESETS.find((p) => p.id === 'studio-bridge');
    if (bridge) {
      const packed = presetToFiles(bridge);
      setSelectedPresetId(bridge.id);
      setProjectFiles(packed.files);
      setEntryFile(packed.entry);
      setActiveFilePath(packed.entry);
      setLastPatchResult(null);
      await compileProject(packed.files, packed.entry, bundle, importedAssets);
    } else {
      await compileProject(projectFiles, entryFile, bundle, importedAssets);
    }
    setStatusNotice('已從精靈區匯流排同步最新精靈圖集與碰撞框');
  };

  const handlePatchSceneNode = (nodeId: string, prop: string, val: string | number | boolean) => {
    const eng = engineRef.current;
    if (!eng) return;
    if (eng.patchNodeProperty(nodeId, prop, val)) {
      setSceneTree(eng.getSceneTree());
      setStats(eng.getStats());

      const patchRes = patchProjectSourceFromInspector(projectFilesRef.current, nodeId, prop, val);
      setLastPatchResult(patchRes);
      if (patchRes.patched) {
        projectFilesRef.current = patchRes.updatedFiles;
        setProjectFiles(patchRes.updatedFiles);
        setStatusNotice(`已雙向回寫 ${patchRes.filePath}:${patchRes.lineNumber}`);
      }
    }
  };

  const handleRunPlaytest = async () => {
    setPlaytestRunning(true);
    try {
      const report = await runHeadlessPlaytest(projectFiles, entryFile, {
        scenario: playtestScenario,
        ticks: playtestTicks,
        importedBundle,
        importedAssets,
      });
      setPlaytestReport(report);
      setStatusNotice(
        report.success
          ? `無頭自動試跑通過 (${report.ticksSimulated} ticks · ${report.simMs}ms)`
          : '自動試跑偵測到異常或編譯錯誤，請檢視診斷報告',
      );
    } finally {
      setPlaytestRunning(false);
    }
  };

  const handlePushWorkspaceBus = async () => {
    setBusSyncing(true);
    try {
      const res = await fetch('/api/project-bus/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          presetId: selectedPresetId,
          entryFile,
          files: projectFiles,
          source: 'web',
        }),
      });
      const data = await res.json();
      if (res.ok && data?.ok) {
        setLastBusSyncLabel(`已推送 (${projectFiles.length} 檔)`);
        setStatusNotice('已將目前多檔專案推送至 MCP / CLI 共用匯流排');
      } else {
        setCompileError(data?.error ?? '推送至共用工作區匯流排失敗');
      }
    } catch {
      setCompileError('無法連線至後端工作區匯流排 (/api/project-bus/workspace)');
    } finally {
      setBusSyncing(false);
    }
  };

  const handlePullWorkspaceBus = async () => {
    setBusSyncing(true);
    try {
      const res = await fetch('/api/project-bus/workspace');
      const data = await res.json();
      if (res.ok && Array.isArray(data?.files) && data.files.length > 0) {
        const nextFiles = data.files as VirtualProjectFile[];
        const nextEntry = typeof data.entryFile === 'string' ? data.entryFile : nextFiles[0].path;
        setSelectedPresetId(typeof data.presetId === 'string' ? data.presetId : selectedPresetId);
        setProjectFiles(nextFiles);
        setEntryFile(nextEntry);
        setActiveFilePath(nextEntry);
        setLastPatchResult(null);
        setLastBusSyncLabel(`已同步 (${data.source ?? 'bus'})`);
        await compileProject(nextFiles, nextEntry);
      } else {
        setCompileError('共用工作區匯流排回傳內容無效');
      }
    } catch {
      setCompileError('無法從共用工作區匯流排讀取專案');
    } finally {
      setBusSyncing(false);
    }
  };

  const handleApplyFilesToWorkbench = async (files: VirtualProjectFile[], label: string) => {
    const cloned = files.map((f) => ({ ...f }));
    const nextEntry = cloned.find((f) => f.kind === 'entry')?.path ?? cloned[0]?.path ?? 'main.ts';
    projectFilesRef.current = cloned;
    setProjectFiles(cloned);
    setEntryFile(nextEntry);
    setActiveFilePath(nextEntry);
    setLastPatchResult(null);
    await compileProject(cloned, nextEntry);
    setStatusNotice(`已套用「${label}」至編輯器與即時畫布`);
  };

  const handleRunBidirectionalBenchmark = async () => {
    benchmarkRunningRef.current = true;
    setBenchmarkRunning(true);
    try {
      const result = await runBidirectionalDogfoodSuite({ mcpEndpoint: '/mcp' });
      setBenchmarkResult(result);
      setPlaytestReport(result.directionBPostReport);
      setLastBusSyncLabel(`MCP 閉環 (${result.repairedFiles.length} 檔)`);
      await handleApplyFilesToWorkbench(result.repairedFiles, '雙向閉環修復版');
      setStatusNotice(
        `雙向實測完成 (${result.totalDurationMs}ms)：盲寫 ${result.blindReport.metrics.hitsLanded} 次命中 → 閉環 ${result.directionBPostReport.metrics.hitsLanded} 次命中`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setCompileError(`雙向實測執行失敗：${msg}`);
    } finally {
      benchmarkRunningRef.current = false;
      setBenchmarkRunning(false);
    }
  };

  const handlePaintTileCell = (row: number, col: number, glyph: string) => {
    const eng = engineRef.current;
    if (!eng) return;
    const kind = GLYPH_TO_TILE_KIND[glyph] ?? 'empty';
    if (eng.setTileAtCell(row, col, kind)) {
      setSceneTree(eng.getSceneTree());
      setStats(eng.getStats());
      const patchRes = patchTilemapInSource(projectFilesRef.current, [{ row, col, glyph }]);
      setLastPatchResult(patchRes);
      if (patchRes.patched) {
        projectFilesRef.current = patchRes.updatedFiles;
        setProjectFiles(patchRes.updatedFiles);
        setStatusNotice(`已雙向回寫地形 (${row},${col}) → '${glyph}' (${patchRes.filePath}:${patchRes.lineNumber})`);
      }
    }
  };

  const handleStepFrame = () => {
    setIsPaused(true);
    const eng = engineRef.current;
    const cvs = canvasRef.current;
    if (!eng || !cvs) return;
    eng.stepTick(inputRef.current);
    const ctx = cvs.getContext('2d');
    if (ctx) {
      eng.render(ctx, { showDebug, enableLighting });
    }
    setStats(eng.getStats());
    setSceneTree(eng.getSceneTree());
  };

  const handleToggleAudio = () => {
    const nextMuted = !audioMuted;
    setAudioMuted(nextMuted);
    zzfxBridge.setMuted(nextMuted);
    if (!nextMuted) {
      zzfxBridge.unlock();
      zzfxBridge.playPreset('coin');
    }
  };

  const handleImportExternalAssets = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;

    const readAsText = (f: File) =>
      new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('讀取文字檔失敗'));
        reader.readAsText(f);
      });

    const readAsDataUrl = (f: File) =>
      new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('讀取圖片檔失敗'));
        reader.readAsDataURL(f);
      });

    try {
      let nextBundle = importedBundle;
      const nextAssets: ExternalImportedAssets = { ...(importedAssets ?? {}) };
      const labels: string[] = [];
      let routeToPresetId: string | null = null;

      for (const file of files) {
        if (file.type.startsWith('image/') || file.name.toLowerCase().endsWith('.png')) {
          nextAssets.asepriteImageUrl = await readAsDataUrl(file);
          labels.push(`PNG(${file.name})`);
          routeToPresetId = routeToPresetId ?? 'ldtk-aseprite-pipeline';
          continue;
        }

        const rawText = await readAsText(file);
        const parsed = JSON.parse(rawText) as unknown;
        const kind = detectExternalJsonKind(parsed);

        if (kind === 'studio') {
          nextBundle = parsed as StudioBundleInput;
          nextAssets.studioBundle = nextBundle;
          nextAssets.detectedKind = 'studio';
          labels.push(`Studio(${nextBundle.appearance?.theme ?? file.name})`);
          routeToPresetId = 'studio-bridge';
        } else if (kind === 'aseprite') {
          nextAssets.asepriteJson = parsed as AsepriteJson;
          nextAssets.detectedKind = 'aseprite';
          labels.push(`Aseprite(${file.name})`);
          routeToPresetId = 'ldtk-aseprite-pipeline';
        } else if (kind === 'ldtk') {
          nextAssets.ldtkJson = parsed as LDtkJson;
          nextAssets.tiledJson = null;
          nextAssets.detectedKind = 'ldtk';
          labels.push(`LDtk(${file.name})`);
          routeToPresetId = 'ldtk-aseprite-pipeline';
        } else if (kind === 'tiled') {
          nextAssets.tiledJson = parsed as TiledJson;
          nextAssets.ldtkJson = null;
          nextAssets.detectedKind = 'tiled';
          labels.push(`Tiled(${file.name})`);
          routeToPresetId = 'ldtk-aseprite-pipeline';
        } else {
          setCompileError(`無法辨識外部 JSON 格式 (${file.name})，請匯入 Studio / Aseprite / LDtk / Tiled (.tmj) 格式`);
          return;
        }
      }

      setImportedBundle(nextBundle);
      setImportedAssets(nextAssets);
      setImportedLabel(labels.join(' + '));

      const targetPreset = ENGINE_PRESETS.find((p) => p.id === routeToPresetId);
      if (targetPreset) {
        const packed = presetToFiles(targetPreset);
        setSelectedPresetId(targetPreset.id);
        setProjectFiles(packed.files);
        setEntryFile(packed.entry);
        setActiveFilePath(packed.entry);
        await compileProject(packed.files, packed.entry, nextBundle, nextAssets);
      } else {
        await compileProject(projectFiles, entryFile, nextBundle, nextAssets);
      }
    } catch {
      setCompileError('解析外部資產失敗，請確認 JSON / PNG 檔案完整有效');
    }
  };

  const handleExportStandalone = () => {
    const eng = engineRef.current;
    if (!eng) return;
    const presetTitle = ENGINE_PRESETS.find((p) => p.id === selectedPresetId)?.title ?? 'ChronoForge Game';
    const html = eng.exportStandaloneGameHtml(presetTitle);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `chronopixel_${selectedPresetId}.html`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
    setStatusNotice('已編譯並下載獨立可玩 HTML5 遊戲檔案');
  };

  const handleUpdateActiveFileCode = (nextCode: string) => {
    setProjectFiles((prev) =>
      prev.map((f) => (f.path === activeFilePath ? { ...f, code: nextCode } : f)),
    );
  };

  const handleAddModuleFile = (path: string) => {
    const newFile: VirtualProjectFile = {
      path,
      kind: 'module',
      summary: '自訂虛擬模組',
      code: `// ${path}：使用 Fluent DSL 與協程編寫模組邏輯\nexport function setupCustomModule(): void {\n  // vfx.burst(200, 120, { count: 12, color: '#38bdf8' });\n}\n`,
    };
    setProjectFiles((prev) => [...prev, newFile]);
    setActiveFilePath(path);
    setLeftTab('editor');
  };

  const handleDeleteModuleFile = (path: string) => {
    setProjectFiles((prev) => {
      const next = prev.filter((f) => f.path !== path);
      if (activeFilePath === path && next.length > 0) {
        setActiveFilePath(entryFile);
      }
      return next;
    });
  };

  const handleExportProjectBundle = () => {
    const payload = {
      presetId: selectedPresetId,
      entryFile,
      files: projectFiles,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `chronoforge_${selectedPresetId}_project.json`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
    setStatusNotice('已匯出多檔虛擬專案包 (.json)');
  };

  const activeFile = projectFiles.find((f) => f.path === activeFilePath) ?? projectFiles[0];
  const activeCode = activeFile?.code ?? '';
  const lineCount = activeCode.split('\n').length;
  const compiledActionList = engineRef.current
    ? engineRef.current.actions.list().map((name) => ({
        name,
        spec: engineRef.current!.actions.get(name)!,
      }))
    : [];

  return (
    <div className="min-h-screen bg-[#0B0E14] text-[#E2E8F0] font-sans flex flex-col">
      {/* 3-Zone Top Navigation Bar */}
      <header className="h-14 border-b border-[#232A3B] bg-[#111520] px-6 flex items-center justify-between gap-8 shrink-0">
        <a
          href="/"
          className="text-base font-semibold tracking-tight text-white whitespace-nowrap shrink-0"
        >
          ChronoForge
        </a>

        <nav className="flex items-center gap-6 text-sm text-[#94A3B8] overflow-x-auto">
          <a href="/" className="hover:text-white transition-colors whitespace-nowrap shrink-0">
            總部大廳
          </a>
          <a href="/studio" className="hover:text-white transition-colors whitespace-nowrap shrink-0">
            精靈與幀製作區
          </a>
          <a
            href="/engine"
            className="text-white border-b border-[#16A34A] pb-0.5 whitespace-nowrap shrink-0"
          >
            純程式引擎區
          </a>
          <a
            href="/play"
            onClick={(e) => {
              e.preventDefault();
              saveCrossZoneHandoff({
                presetId: selectedPresetId,
                entryFile,
                files: projectFilesRef.current,
              });
              window.location.href = '/play?handoff=1';
            }}
            className="hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            遊戲遊玩區
          </a>
          <a href="/archive" className="hover:text-white transition-colors whitespace-nowrap shrink-0">
            文物歷史庫
          </a>
        </nav>

        <button
          type="button"
          onClick={() => {
            zzfxBridge.unlock();
            void compileProject(projectFiles, entryFile);
          }}
          className="px-4 py-2 text-xs font-semibold bg-[#16A34A] hover:bg-[#15803D] text-white rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          編譯並熱重載
        </button>
      </header>

      {/* Preset Selector & Asset Status Toolbar */}
      <div className="border-b border-[#232A3B] bg-[#0F131D] px-6 py-2.5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2 overflow-x-auto">
          {ENGINE_PRESETS.map((preset) => {
            const active = preset.id === selectedPresetId;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleSelectPreset(preset.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'bg-[#1E293B] text-white border border-[#3B4761]'
                    : 'text-[#94A3B8] hover:text-white border border-transparent'
                }`}
              >
                {preset.title}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3 text-xs text-[#94A3B8]">
          {importedLabel && (
            <span className="font-mono text-[#38BDF8] whitespace-nowrap">
              資產: {importedLabel}
            </span>
          )}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#182030] hover:bg-[#222C42] text-[#E2E8F0] border border-[#2D374E] rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            匯入外部資產
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".json,.tmj,.ldtk,.png,application/json,image/png"
            onChange={handleImportExternalAssets}
            className="hidden"
          />
          <button
            type="button"
            onClick={handleSyncFromStudioBus}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#131C2E] hover:bg-[#1C2A44] text-[#38BDF8] border border-[#283B5C] rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            從工作室同步
          </button>
          <button
            type="button"
            onClick={handleExportStandalone}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#182030] hover:bg-[#222C42] text-[#E2E8F0] border border-[#2D374E] rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            匯出獨立可玩遊戲
          </button>
        </div>
      </div>

      {/* Main Split IDE + Live Game Canvas */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left Column: Pure-Code Editor, Godot Scene Tree & Inspector, Compiled Frames, SDK Docs */}
        <section className="lg:col-span-6 flex flex-col border border-[#232A3B] bg-[#131822] rounded-lg overflow-hidden min-h-[600px]">
          <div className="h-11 px-4 border-b border-[#232A3B] bg-[#10141D] flex items-center justify-between gap-2 overflow-x-auto">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setLeftTab('editor')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  leftTab === 'editor' ? 'bg-[#1E293B] text-white' : 'text-[#94A3B8] hover:text-white'
                }`}
              >
                <Code2 className="w-3.5 h-3.5" />
                純程式腳本
              </button>
              <button
                type="button"
                onClick={() => setLeftTab('scene')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  leftTab === 'scene' ? 'bg-[#1E293B] text-white' : 'text-[#94A3B8] hover:text-white'
                }`}
              >
                <GitBranch className="w-3.5 h-3.5 text-[#4ADE80]" />
                節點樹 ({sceneTree?.nodeCount ?? 0})
              </button>
              <button
                type="button"
                onClick={() => setLeftTab('diagnostics')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  leftTab === 'diagnostics' ? 'bg-[#1E293B] text-white' : 'text-[#94A3B8] hover:text-white'
                }`}
              >
                <Activity className="w-3.5 h-3.5 text-[#38BDF8]" />
                試跑診斷
              </button>
              <button
                type="button"
                onClick={() => setLeftTab('compiled')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  leftTab === 'compiled' ? 'bg-[#1E293B] text-white' : 'text-[#94A3B8] hover:text-white'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                動作幀 ({stats.compiledFrameCount})
              </button>
              <button
                type="button"
                onClick={() => setLeftTab('docs')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  leftTab === 'docs' ? 'bg-[#1E293B] text-white' : 'text-[#94A3B8] hover:text-white'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                SDK 文件
              </button>
            </div>
            <span className="text-[11px] font-mono text-[#64748B] whitespace-nowrap shrink-0">
              Ctrl/Cmd + Enter 編譯
            </span>
          </div>

          {leftTab === 'editor' && (
            <div className="flex-1 flex bg-[#0D1017] overflow-hidden min-h-0">
              <VirtualFileExplorer
                files={projectFiles}
                activePath={activeFile?.path ?? entryFile}
                errorFile={errorFile}
                onSelectFile={setActiveFilePath}
                onAddFile={handleAddModuleFile}
                onDeleteFile={handleDeleteModuleFile}
                onExportProjectJson={handleExportProjectBundle}
              />
              <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
                <div className="h-9 px-3 border-b border-[#1E2536] bg-[#0F141F] flex items-center justify-between text-[11px] font-mono">
                  <span className="text-[#CBD5E1] truncate">
                    {activeFile?.path}
                    {activeFile?.summary ? ` · ${activeFile.summary}` : ''}
                  </span>
                  <span className="text-[#64748B] shrink-0">TypeScript · Sucrase</span>
                </div>
                <CodeMirrorEditor
                  value={activeCode}
                  activePath={activeFile?.path ?? entryFile}
                  projectFiles={projectFiles}
                  onChange={handleUpdateActiveFileCode}
                  onCompileShortcut={() => {
                    zzfxBridge.unlock();
                    void compileProject(projectFiles, entryFile);
                  }}
                />
              </div>
            </div>
          )}

          {leftTab === 'scene' && (
            <SceneInspectorPanel
              sceneTree={sceneTree}
              selectedNodeId={selectedNodeId}
              onSelectNode={setSelectedNodeId}
              onPatchProp={handlePatchSceneNode}
              getCodeSnippet={(id) => engineRef.current?.generateNodeCodeSnippet(id) ?? ''}
              onAppendCodeSnippet={(snippet) => {
                setProjectFiles((prev) =>
                  prev.map((f) =>
                    f.path === (activeFile?.path ?? entryFile)
                      ? { ...f, code: `${f.code.trimEnd()}\n\n${snippet}\n` }
                      : f,
                  ),
                );
                setLeftTab('editor');
                setStatusNotice(`已將節點流暢 DSL 片段加入 ${activeFile?.path ?? entryFile}`);
              }}
              lastPatchResult={lastPatchResult}
              tileGrid={engineRef.current?.getTileGrid()}
              onPaintTileCell={handlePaintTileCell}
            />
          )}

          {leftTab === 'diagnostics' && (
            <PlaytestDiagnosticsPanel
              report={playtestReport}
              running={playtestRunning}
              scenario={playtestScenario}
              ticks={playtestTicks}
              onChangeScenario={setPlaytestScenario}
              onChangeTicks={setPlaytestTicks}
              onRunPlaytest={() => void handleRunPlaytest()}
              onPushWorkspace={() => void handlePushWorkspaceBus()}
              onPullWorkspace={() => void handlePullWorkspaceBus()}
              busSyncing={busSyncing}
              lastBusSyncLabel={lastBusSyncLabel}
              benchmarkResult={benchmarkResult}
              benchmarkRunning={benchmarkRunning}
              onRunBidirectionalBenchmark={() => void handleRunBidirectionalBenchmark()}
              onApplyFilesToWorkbench={(files, label) => void handleApplyFilesToWorkbench(files, label)}
              autoSseSync={autoSseSync}
              sseConnected={sseConnected}
              onToggleAutoSse={() => setAutoSseSync((prev) => !prev)}
            />
          )}

          {leftTab === 'compiled' && (
            <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-[#0D1017]">
              {compiledActionList.map(({ name, spec }) => (
                <div key={name} className="border border-[#232A3B] bg-[#131822] rounded-md p-3">
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="font-mono font-semibold text-white">{name}</span>
                    <span className="font-mono tabular-nums text-[#94A3B8]">
                      {spec.frames.length} 幀 · {spec.fps} FPS · {spec.loop ? '循環' : '單次'}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {spec.frames.map((frameCanvas, idx) => (
                      <div
                        key={idx}
                        className="w-16 h-16 bg-[#0B0E14] border border-[#232A3B] rounded flex items-center justify-center relative"
                      >
                        <img
                          src={frameCanvas.toDataURL('image/png')}
                          alt={`${name} frame ${idx + 1}`}
                          className="w-14 h-14 [image-rendering:pixelated]"
                        />
                        {spec.boxes[idx]?.hit.active && (
                          <span className="absolute bottom-0.5 right-1 font-mono text-[9px] text-[#F87171]">
                            HIT
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {leftTab === 'docs' && (
            <div className="flex-1 p-5 overflow-y-auto space-y-4 bg-[#0D1017]">
              <p className="text-xs text-[#94A3B8] leading-relaxed">
                AI Agent 可直接於腳本中呼叫 <code className="font-mono text-[#E2E8F0]">engine</code> 物件模組編譯動作、ZzFX 8-bit 音效、Aseprite/LDtk/Tiled 標準資產、光照與像素特效。
              </p>

              <div className="border border-[#232A3B] bg-[#131822] rounded-md p-3.5 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono font-semibold text-[#FBBF24]">
                    ZzFX 8-Bit 合成器即時試聽
                  </span>
                  <span className="text-[#94A3B8]">點擊參數試聽復古波形</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(ZZFX_PRESETS) as ZzfxPresetName[]).map((presetKey) => (
                    <button
                      key={presetKey}
                      type="button"
                      onClick={() => {
                        if (audioMuted) {
                          setAudioMuted(false);
                          zzfxBridge.setMuted(false);
                        }
                        zzfxBridge.unlock();
                        zzfxBridge.playPreset(presetKey);
                      }}
                      className="px-2.5 py-1 text-xs font-mono bg-[#1E293B] hover:bg-[#293548] text-[#E2E8F0] rounded transition-colors cursor-pointer whitespace-nowrap"
                    >
                      ▶ {presetKey}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                {SDK_REFERENCE_DOCS.map((doc) => (
                  <div key={doc.namespace} className="border border-[#232A3B] bg-[#131822] rounded-md p-3.5">
                    <div className="font-mono text-xs font-semibold text-[#4ADE80] mb-1">
                      {doc.namespace}
                    </div>
                    <div className="text-xs text-[#CBD5E1] leading-relaxed">{doc.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Compile Status / Error Footer */}
          <div className="px-4 py-2.5 border-t border-[#232A3B] bg-[#10141D] text-xs flex items-center justify-between gap-3">
            {compileError ? (
              <div className="flex items-center gap-2 text-[#F87171] font-mono truncate">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span className="truncate">編譯錯誤: {compileError}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-[#4ADE80]">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{statusNotice ?? '引擎編譯就緒'}</span>
              </div>
            )}
            <span className="font-mono tabular-nums text-[#64748B] shrink-0">
              {projectFiles.length} 檔 · {lineCount} 行
            </span>
          </div>
        </section>

        {/* Right Column: Live Game Viewport, Controls & Engine Inspector */}
        <section className="lg:col-span-6 flex flex-col gap-4">
          <div className="border border-[#232A3B] bg-[#131822] rounded-lg overflow-hidden flex flex-col">
            <div className="h-11 px-4 border-b border-[#232A3B] bg-[#10141D] flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-white whitespace-nowrap">
                即時渲染視口 · 480×270
              </span>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setIsPaused((p) => !p)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs bg-[#1E293B] hover:bg-[#293548] text-white rounded transition-colors whitespace-nowrap cursor-pointer"
                >
                  {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                  {isPaused ? '繼續' : '暫停'}
                </button>
                <button
                  type="button"
                  onClick={handleStepFrame}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs bg-[#1E293B] hover:bg-[#293548] text-white rounded transition-colors whitespace-nowrap cursor-pointer"
                >
                  <StepForward className="w-3.5 h-3.5" />
                  +1F
                </button>
                <button
                  type="button"
                  onClick={() => setShowDebug((d) => !d)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded transition-colors whitespace-nowrap cursor-pointer ${
                    showDebug ? 'bg-[#16A34A] text-white' : 'bg-[#1E293B] text-[#94A3B8]'
                  }`}
                >
                  <Grid className="w-3.5 h-3.5" />
                  碰撞線框
                </button>
                <button
                  type="button"
                  onClick={() => setEnableLighting((l) => !l)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded transition-colors whitespace-nowrap cursor-pointer ${
                    enableLighting ? 'bg-[#D97706] text-white' : 'bg-[#1E293B] text-[#94A3B8]'
                  }`}
                >
                  <Sun className="w-3.5 h-3.5" />
                  動態光照
                </button>
                <button
                  type="button"
                  onClick={handleToggleAudio}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded transition-colors whitespace-nowrap cursor-pointer ${
                    !audioMuted ? 'bg-[#0284C7] text-white' : 'bg-[#1E293B] text-[#94A3B8]'
                  }`}
                >
                  {audioMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                  {audioMuted ? '已靜音' : '音效開'}
                </button>
                <button
                  type="button"
                  onClick={() => void compileProject(projectFiles, entryFile)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs bg-[#1E293B] hover:bg-[#293548] text-white rounded transition-colors whitespace-nowrap cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  重置
                </button>
                <button
                  type="button"
                  onClick={() => {
                    saveCrossZoneHandoff({
                      presetId: selectedPresetId,
                      entryFile,
                      files: projectFilesRef.current,
                    });
                    window.location.href = '/play?handoff=1';
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-[#16A34A] hover:bg-[#15803D] text-white rounded transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                  大螢幕遊玩
                </button>
              </div>
            </div>

            <div
              tabIndex={0}
              onMouseDown={() => zzfxBridge.unlock()}
              className="bg-[#07090F] relative focus:outline-none focus:ring-1 focus:ring-[#22C55E]"
            >
              <canvas
                ref={canvasRef}
                width={VIEW_W}
                height={VIEW_H}
                className="w-full h-auto aspect-video block [image-rendering:pixelated]"
              />
            </div>

            {/* Interactive Controls Bar */}
            <div className="px-4 py-3 border-t border-[#232A3B] bg-[#10141D] flex flex-wrap items-center justify-between gap-3">
              <div
                onMouseDown={() => zzfxBridge.unlock()}
                className="flex flex-wrap items-center gap-2"
              >
                <button
                  type="button"
                  onMouseDown={() => { inputRef.current.left = true; }}
                  onMouseUp={() => { inputRef.current.left = false; }}
                  onMouseLeave={() => { inputRef.current.left = false; }}
                  className="px-3 py-1.5 text-xs font-medium bg-[#1E293B] hover:bg-[#293548] text-white rounded cursor-pointer whitespace-nowrap"
                >
                  左移 (A)
                </button>
                <button
                  type="button"
                  onMouseDown={() => { inputRef.current.right = true; }}
                  onMouseUp={() => { inputRef.current.right = false; }}
                  onMouseLeave={() => { inputRef.current.right = false; }}
                  className="px-3 py-1.5 text-xs font-medium bg-[#1E293B] hover:bg-[#293548] text-white rounded cursor-pointer whitespace-nowrap"
                >
                  右移 (D)
                </button>
                <button
                  type="button"
                  onMouseDown={() => { inputRef.current.jump = true; }}
                  onMouseUp={() => { inputRef.current.jump = false; }}
                  onMouseLeave={() => { inputRef.current.jump = false; }}
                  className="px-3 py-1.5 text-xs font-medium bg-[#1E293B] hover:bg-[#293548] text-white rounded cursor-pointer whitespace-nowrap"
                >
                  跳躍 (W/Space)
                </button>
                <button
                  type="button"
                  onMouseDown={() => { inputRef.current.slash = true; }}
                  onMouseUp={() => { inputRef.current.slash = false; }}
                  onMouseLeave={() => { inputRef.current.slash = false; }}
                  className="px-3 py-1.5 text-xs font-medium bg-[#B91C1C] hover:bg-[#991B1B] text-white rounded cursor-pointer whitespace-nowrap"
                >
                  揮砍 (J)
                </button>
                <button
                  type="button"
                  onMouseDown={() => { inputRef.current.dash = true; }}
                  onMouseUp={() => { inputRef.current.dash = false; }}
                  onMouseLeave={() => { inputRef.current.dash = false; }}
                  className="px-3 py-1.5 text-xs font-medium bg-[#0284C7] hover:bg-[#0369A1] text-white rounded cursor-pointer whitespace-nowrap"
                >
                  衝刺殘影 (Shift)
                </button>
              </div>

              <div className="flex items-center gap-2">
                {stats.gamePhase !== 'playing' && (
                  <button
                    type="button"
                    onClick={() => {
                      engineRef.current?.game.restart();
                      if (engineRef.current) setStats(engineRef.current.getStats());
                    }}
                    className="px-2.5 py-1 text-xs font-semibold bg-[#16A34A] hover:bg-[#15803D] text-white rounded cursor-pointer whitespace-nowrap"
                  >
                    重開試煉 (R)
                  </button>
                )}
                <span className="text-xs font-mono tabular-nums text-[#94A3B8]">
                  {stats.stageId.toUpperCase()} · HP {stats.playerHp}/{stats.playerMaxHp} ·{' '}
                  {stats.gamePhase !== 'playing'
                    ? stats.gamePhase.toUpperCase()
                    : stats.playerState.toUpperCase()}
                </span>
              </div>
            </div>
          </div>

          {/* Runtime Metrics Grid (Clean Flat Table) */}
          <div className="border border-[#232A3B] bg-[#131822] rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 border-b border-[#232A3B] bg-[#10141D] flex items-center justify-between">
              <span className="text-xs font-medium text-white">確定性執行期遙測</span>
              <span className="font-mono text-xs text-[#94A3B8]">
                CRC32: 0x{stats.crc32.toString(16).toUpperCase().padStart(8, '0')}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-[#232A3B] text-xs">
              <div className="p-3.5">
                <div className="text-[#94A3B8] mb-1">固定步長 Tick</div>
                <div className="font-mono tabular-nums text-base font-semibold text-white">
                  {stats.tick}
                </div>
              </div>
              <div className="p-3.5">
                <div className="text-[#94A3B8] mb-1">實體 / 光源數</div>
                <div className="font-mono tabular-nums text-base font-semibold text-white">
                  {stats.entityCount} / {stats.lightCount}
                </div>
              </div>
              <div className="p-3.5">
                <div className="text-[#94A3B8] mb-1">活躍粒子</div>
                <div className="font-mono tabular-nums text-base font-semibold text-white">
                  {stats.particleCount}
                </div>
              </div>
              <div className="p-3.5">
                <div className="text-[#94A3B8] mb-1">編譯動作 / 耗時</div>
                <div className="font-mono tabular-nums text-base font-semibold text-[#4ADE80]">
                  {stats.compiledActionCount} · {stats.compileMs}ms
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

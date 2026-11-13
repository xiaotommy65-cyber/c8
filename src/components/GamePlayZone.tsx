import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  AlertCircle,
  Code2,
  Disc3,
  Gamepad2,
  Maximize2,
  Minimize2,
  Orbit,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { ChronoForgeEngine, VIEW_H, VIEW_W, type EngineInputState } from '../engine/ChronoForgeEngine';
import { compileAndExecuteProject } from '../engine/moduleCompiler';
import { ENGINE_PRESETS } from '../engine/presets';
import { loadCrossZoneHandoff, saveCrossZoneHandoff } from '../engine/workspaceHandoff';
import { zzfxBridge } from '../engine/zzfxAudio';
import type {
  EnginePreset,
  EngineSnapshotStats,
  StudioBundleInput,
  VirtualProjectFile,
} from '../engine/types';
import {
  CartridgeSwapOverlay,
  TopCartridgeSlot,
  resolveCartridgeMeta,
  type CartridgeMeta,
} from './CartridgeBay';
import { OfflineIndicator, PWAInstallButton } from './PWAControls';
import {
  ThreeHandheldStage,
  type RayActionName,
  type ThreeHandheldSkinColors,
} from './ThreeHandheldStage';

type ArcadeSkinId = 'mint' | 'peach' | 'berry' | 'sky';
type CameraPhase = 'boot' | 'play' | 'tray-open' | 'inserting';

interface ArcadeSkin {
  id: ArcadeSkinId;
  name: string;
  swatchHex: string;
  outerHex: string;
  outerRimHex: string;
  innerDeckHex: string;
  bumperHex: string;
  outerShellStyle: string;
  innerDeckStyle: string;
  bumperStyle: string;
  dpadColor: string;
  dpadBorder: string;
  btnAColor: string;
  btnARim: string;
  btnBColor: string;
  btnBRim: string;
  btnXColor: string;
  btnXRim: string;
}

const ARCADE_SKINS: ArcadeSkin[] = [
  {
    id: 'mint',
    name: '奶油薄荷',
    swatchHex: '#8CE0B8',
    outerHex: '#94E2BE',
    outerRimHex: '#66BA94',
    innerDeckHex: '#FFFBF0',
    bumperHex: '#68C299',
    outerShellStyle: 'bg-[#94E2BE] border-[#66BA94] shadow-[0_14px_0_#53A37E,0_26px_60px_rgba(0,0,0,0.65)]',
    innerDeckStyle: 'bg-[#FFFBF0] border-[#E7DEC8] text-[#1E2430]',
    bumperStyle: 'bg-[#68C299] border-[#4B9B76] text-[#0E3122]',
    dpadColor: '#2D3445',
    dpadBorder: '#1A1F2B',
    btnAColor: '#10B981',
    btnARim: '#047857',
    btnBColor: '#FB7185',
    btnBRim: '#BE123C',
    btnXColor: '#38BDF8',
    btnXRim: '#0369A1',
  },
  {
    id: 'peach',
    name: '蜜桃蘇打',
    swatchHex: '#FBB5A2',
    outerHex: '#FFC0AF',
    outerRimHex: '#DF8B76',
    innerDeckHex: '#FFF8F5',
    bumperHex: '#EA9984',
    outerShellStyle: 'bg-[#FFC0AF] border-[#DF8B76] shadow-[0_14px_0_#C87460,0_26px_60px_rgba(0,0,0,0.65)]',
    innerDeckStyle: 'bg-[#FFF8F5] border-[#F0DDD5] text-[#2B2026]',
    bumperStyle: 'bg-[#EA9984] border-[#C5715C] text-[#411811]',
    dpadColor: '#372D34',
    dpadBorder: '#20191E',
    btnAColor: '#F59E0B',
    btnARim: '#B45309',
    btnBColor: '#F43F5E',
    btnBRim: '#9F1239',
    btnXColor: '#0EA5E9',
    btnXRim: '#0369A1',
  },
  {
    id: 'berry',
    name: '復古紫莓',
    swatchHex: '#BFAEF7',
    outerHex: '#C4B5FD',
    outerRimHex: '#8B78DA',
    innerDeckHex: '#F8F6FF',
    bumperHex: '#9E8CE8',
    outerShellStyle: 'bg-[#C4B5FD] border-[#8B78DA] shadow-[0_14px_0_#725EC2,0_26px_60px_rgba(0,0,0,0.65)]',
    innerDeckStyle: 'bg-[#F8F6FF] border-[#E1DAF7] text-[#221E38]',
    bumperStyle: 'bg-[#9E8CE8] border-[#6E5AC4] text-[#1E1444]',
    dpadColor: '#2A2642',
    dpadBorder: '#181529',
    btnAColor: '#14B8A6',
    btnARim: '#0F766E',
    btnBColor: '#EC4899',
    btnBRim: '#9D174D',
    btnXColor: '#6366F1',
    btnXRim: '#4338CA',
  },
  {
    id: 'sky',
    name: '海鹽天空',
    swatchHex: '#93D2FC',
    outerHex: '#99D5FD',
    outerRimHex: '#5FA8DC',
    innerDeckHex: '#F6FAFF',
    bumperHex: '#6BB8EC',
    outerShellStyle: 'bg-[#99D5FD] border-[#5FA8DC] shadow-[0_14px_0_#4992C6,0_26px_60px_rgba(0,0,0,0.65)]',
    innerDeckStyle: 'bg-[#F6FAFF] border-[#D7E6F5] text-[#1A293A]',
    bumperStyle: 'bg-[#6BB8EC] border-[#428BC0] text-[#0D2A42]',
    dpadColor: '#243144',
    dpadBorder: '#141D29',
    btnAColor: '#22C55E',
    btnARim: '#15803D',
    btnBColor: '#F97316',
    btnBRim: '#C2410C',
    btnXColor: '#8B5CF6',
    btnXRim: '#6D28D9',
  },
];

const SKIN_STORAGE_KEY = 'chronoforge_arcade_skin_v1';

interface PressedPadState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  jumpA: boolean;
  slashB: boolean;
  dashX: boolean;
}

const EMPTY_PAD: PressedPadState = {
  up: false,
  down: false,
  left: false,
  right: false,
  jumpA: false,
  slashB: false,
  dashX: false,
};

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

export function GamePlayZone() {
  const defaultPacked = presetToFiles(ENGINE_PRESETS[0]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>(ENGINE_PRESETS[0].id);
  const [projectFiles, setProjectFiles] = useState<VirtualProjectFile[]>(defaultPacked.files);
  const [entryFile, setEntryFile] = useState<string>(defaultPacked.entry);
  const [compileError, setCompileError] = useState<string | null>(null);
  const [noticeText, setNoticeText] = useState<string | null>(null);
  const [importedBundle, setImportedBundle] = useState<StudioBundleInput | null>(null);

  const [customMcpProject, setCustomMcpProject] = useState<{
    entryFile: string;
    files: VirtualProjectFile[];
  } | null>(null);

  const [skinId, setSkinId] = useState<ArcadeSkinId>(() => {
    if (typeof window === 'undefined') return 'mint';
    try {
      const saved = window.localStorage.getItem(SKIN_STORAGE_KEY) as ArcadeSkinId | null;
      return ARCADE_SKINS.some((s) => s.id === saved) ? (saved as ArcadeSkinId) : 'mint';
    } catch {
      return 'mint';
    }
  });

  const [isPaused, setIsPaused] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [audioMuted, setAudioMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pressedUi, setPressedUi] = useState<PressedPadState>(EMPTY_PAD);

  // Camera Choreography & Hardware Showcase States
  const [cameraPhase, setCameraPhase] = useState<CameraPhase>('boot');
  const [insertingMeta, setInsertingMeta] = useState<CartridgeMeta | null>(null);
  const [isBootFlashing, setIsBootFlashing] = useState(true);
  const [bootFlashTick, setBootFlashTick] = useState(1);
  const [parallaxEnabled, setParallaxEnabled] = useState(true);
  const [deskTilt, setDeskTilt] = useState<{ rx: number; ry: number }>({ rx: 0, ry: 0 });
  const [bypassPortraitPrompt, setBypassPortraitPrompt] = useState(false);
  const [renderBackend, setRenderBackend] = useState<'initializing' | 'WebGPU' | 'WebGL2' | 'Fallback'>('initializing');
  const [showTouchPad, setShowTouchPad] = useState<boolean>(() =>
    typeof window !== 'undefined'
      ? (window.matchMedia?.('(pointer: coarse)').matches ?? false)
      : false,
  );

  // Persistent offscreen 480x270 game surface shared with ThreeHandheldStage CanvasTexture
  const [offscreenGameCanvas] = useState<HTMLCanvasElement>(() => {
    const c = document.createElement('canvas');
    c.width = VIEW_W;
    c.height = VIEW_H;
    return c;
  });

  const [viewportInfo, setViewportInfo] = useState<{
    width: number;
    height: number;
    isTouch: boolean;
  }>(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1440,
    height: typeof window !== 'undefined' ? window.innerHeight : 900,
    isTouch:
      typeof window !== 'undefined'
        ? window.matchMedia?.('(pointer: coarse)').matches ?? false
        : false,
  }));

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

  const stageRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<ChronoForgeEngine | null>(null);
  const projectFilesRef = useRef<VirtualProjectFile[]>(projectFiles);
  const entryFileRef = useRef<string>(entryFile);
  const selectedPresetIdRef = useRef<string>(selectedPresetId);
  const isPausedRef = useRef<boolean>(isPaused);
  const showDebugRef = useRef<boolean>(showDebug);
  const cameraPhaseRef = useRef<CameraPhase>(cameraPhase);

  // Separate physical keyboard & multi-touch pointer map so thumbs never cancel each other
  const keyPadRef = useRef<PressedPadState>({ ...EMPTY_PAD });
  const virtualPadRef = useRef<PressedPadState>({ ...EMPTY_PAD });
  const activePointersRef = useRef<Map<number, keyof PressedPadState>>(new Map());
  const restartQueuedRef = useRef<boolean>(false);

  projectFilesRef.current = projectFiles;
  entryFileRef.current = entryFile;
  selectedPresetIdRef.current = selectedPresetId;
  isPausedRef.current = isPaused;
  showDebugRef.current = showDebug;
  cameraPhaseRef.current = cameraPhase;

  const skin = ARCADE_SKINS.find((s) => s.id === skinId) ?? ARCADE_SKINS[0];
  const threeSkin = useMemo<ThreeHandheldSkinColors>(
    () => ({
      outerShell: skin.outerHex,
      outerRim: skin.outerRimHex,
      innerDeck: skin.innerDeckHex,
      bumper: skin.bumperHex,
      dpad: skin.dpadColor,
      btnA: skin.btnAColor,
      btnB: skin.btnBColor,
      btnX: skin.btnXColor,
    }),
    [skin],
  );
  const activeCartMeta = resolveCartridgeMeta(selectedPresetId, ENGINE_PRESETS);

  const isMobilePortrait =
    viewportInfo.width < 768 && viewportInfo.height > viewportInfo.width;
  const isMobileLandscape =
    viewportInfo.width > viewportInfo.height &&
    (viewportInfo.height <= 560 || (viewportInfo.isTouch && viewportInfo.width < 1024));

  const triggerLcdBootFlash = useCallback(() => {
    setBootFlashTick((t) => t + 1);
    setIsBootFlashing(true);
    window.setTimeout(() => {
      setIsBootFlashing(false);
    }, 360);
  }, []);

  // Boot entrance settle animation
  useEffect(() => {
    const bootTimer = window.setTimeout(() => {
      setCameraPhase((prev) => (prev === 'boot' ? 'play' : prev));
      setIsBootFlashing(false);
    }, 620);
    return () => window.clearTimeout(bootTimer);
  }, []);

  // Track responsive viewport & orientation changes
  useEffect(() => {
    const updateViewport = () => {
      setViewportInfo({
        width: window.innerWidth,
        height: window.innerHeight,
        isTouch: window.matchMedia?.('(pointer: coarse)').matches ?? false,
      });
    };
    window.addEventListener('resize', updateViewport);
    window.addEventListener('orientationchange', updateViewport);
    return () => {
      window.removeEventListener('resize', updateViewport);
      window.removeEventListener('orientationchange', updateViewport);
    };
  }, []);

  const syncCombinedPadState = useCallback(() => {
    const k = keyPadRef.current;
    const v = virtualPadRef.current;
    setPressedUi({
      up: k.up || v.up,
      down: k.down || v.down,
      left: k.left || v.left,
      right: k.right || v.right,
      jumpA: k.jumpA || v.jumpA,
      slashB: k.slashB || v.slashB,
      dashX: k.dashX || v.dashX,
    });
  }, []);

  const recomputeVirtualFromPointers = useCallback(() => {
    const next: PressedPadState = { ...EMPTY_PAD };
    for (const actionKey of activePointersRef.current.values()) {
      next[actionKey] = true;
    }
    virtualPadRef.current = next;
    syncCombinedPadState();
  }, [syncCombinedPadState]);

  const bindPointerDown = useCallback(
    (actionKey: keyof PressedPadState) => (e: React.PointerEvent<HTMLElement>) => {
      e.preventDefault();
      zzfxBridge.unlock();
      try {
        e.currentTarget.setPointerCapture?.(e.pointerId);
      } catch {
        // ignore pointer capture failures in synthetic environments
      }
      activePointersRef.current.set(e.pointerId, actionKey);
      recomputeVirtualFromPointers();
    },
    [recomputeVirtualFromPointers],
  );

  const bindPointerRelease = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (activePointersRef.current.delete(e.pointerId)) {
        recomputeVirtualFromPointers();
      }
    },
    [recomputeVirtualFromPointers],
  );

  const clearVirtualInputs = useCallback(() => {
    activePointersRef.current.clear();
    virtualPadRef.current = { ...EMPTY_PAD };
    syncCombinedPadState();
  }, [syncCombinedPadState]);

  const compileAndBoot = useCallback(
    async (
      filesToCompile: VirtualProjectFile[],
      targetEntry: string,
      bundleOverride?: StudioBundleInput | null,
      notice?: string,
    ) => {
      const nextEngine = new ChronoForgeEngine();
      const activeBundle = bundleOverride !== undefined ? bundleOverride : importedBundle;
      nextEngine.audio.setMuted(audioMuted);

      const res = await compileAndExecuteProject(
        filesToCompile,
        targetEntry,
        nextEngine,
        activeBundle,
        null,
      );

      if (res.success) {
        engineRef.current = nextEngine;
        setCompileError(null);
        setIsPaused(false);
        setStats(nextEngine.getStats());
        if (notice) setNoticeText(notice);
      } else {
        setCompileError(res.error ?? '遊戲編譯錯誤');
      }
    },
    [audioMuted, importedBundle],
  );

  // Initial resolution: ?bus -> ?preset -> ?handoff=1 -> active MCP/CLI bus -> local handoff -> default preset
  useEffect(() => {
    let active = true;
    const boot = async () => {
      const params = new URLSearchParams(window.location.search);
      const presetParam = params.get('preset');
      const handoffParam = params.get('handoff');
      const busMode = params.get('bus');

      if (busMode === 'studio') {
        try {
          const res = await fetch('/api/project-bus/studio-bundle');
          const data = await res.json();
          const bridge = ENGINE_PRESETS.find((p) => p.id === 'studio-bridge') ?? ENGINE_PRESETS[0];
          const packed = presetToFiles(bridge);
          if (!active) return;
          setSelectedPresetId(bridge.id);
          setProjectFiles(packed.files);
          setEntryFile(packed.entry);
          if (data?.bundle) {
            setImportedBundle(data.bundle as StudioBundleInput);
            await compileAndBoot(packed.files, packed.entry, data.bundle as StudioBundleInput);
          } else {
            await compileAndBoot(packed.files, packed.entry, null);
          }
          return;
        } catch {
          // fallback below
        }
      }

      if (presetParam) {
        const found = ENGINE_PRESETS.find((p) => p.id === presetParam);
        if (found && active) {
          const packed = presetToFiles(found);
          setSelectedPresetId(found.id);
          setProjectFiles(packed.files);
          setEntryFile(packed.entry);
          await compileAndBoot(packed.files, packed.entry, null, found.title);
          return;
        }
      }

      if (handoffParam === '1') {
        const handoff = loadCrossZoneHandoff();
        if (handoff && active) {
          setSelectedPresetId(handoff.presetId);
          setProjectFiles(handoff.files);
          setEntryFile(handoff.entryFile);
          if (!ENGINE_PRESETS.some((p) => p.id === handoff.presetId)) {
            setCustomMcpProject({ entryFile: handoff.entryFile, files: handoff.files });
          }
          await compileAndBoot(handoff.files, handoff.entryFile, null, '已同步引擎區最新編譯');
          return;
        }
      }

      try {
        const busRes = await fetch('/api/project-bus/workspace');
        const busData = await busRes.json();
        if (
          active &&
          busRes.ok &&
          Array.isArray(busData?.files) &&
          busData.files.length > 0 &&
          (busData.source === 'mcp' || busData.source === 'cli')
        ) {
          const nextEntry =
            typeof busData.entryFile === 'string' ? busData.entryFile : busData.files[0].path;
          const nextFiles = busData.files as VirtualProjectFile[];
          setSelectedPresetId(
            typeof busData.presetId === 'string' ? busData.presetId : 'mcp-agent-project',
          );
          setProjectFiles(nextFiles);
          setEntryFile(nextEntry);
          setCustomMcpProject({ entryFile: nextEntry, files: nextFiles });
          await compileAndBoot(nextFiles, nextEntry, null, `已載入外部 ${busData.source} 工作區`);
          return;
        }
      } catch {
        // fallback below
      }

      const handoff = loadCrossZoneHandoff();
      if (handoff && active) {
        setSelectedPresetId(handoff.presetId);
        setProjectFiles(handoff.files);
        setEntryFile(handoff.entryFile);
        await compileAndBoot(handoff.files, handoff.entryFile, null);
        return;
      }

      if (active) {
        await compileAndBoot(defaultPacked.files, defaultPacked.entry, null);
      }
    };

    void boot();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Real-time SSE auto-hot-reload when external AI CLI or /mcp edits the workspace
  useEffect(() => {
    const es = new EventSource('/api/project-bus/stream');
    es.addEventListener('workspace_update', (ev) => {
      try {
        const snapshot = JSON.parse((ev as MessageEvent).data) as {
          presetId?: string;
          entryFile?: string;
          files?: VirtualProjectFile[];
          source?: string;
        };
        if (snapshot.source !== 'mcp' && snapshot.source !== 'cli') return;
        if (!Array.isArray(snapshot.files) || snapshot.files.length === 0) return;

        const nextEntry =
          typeof snapshot.entryFile === 'string' ? snapshot.entryFile : snapshot.files[0].path;
        const nextPresetId = snapshot.presetId ?? 'mcp-agent-project';
        setSelectedPresetId(nextPresetId);
        setProjectFiles(snapshot.files);
        setEntryFile(nextEntry);
        setCustomMcpProject({ entryFile: nextEntry, files: snapshot.files });
        saveCrossZoneHandoff({
          presetId: nextPresetId,
          entryFile: nextEntry,
          files: snapshot.files,
        });
        triggerLcdBootFlash();
        void compileAndBoot(
          snapshot.files,
          nextEntry,
          undefined,
          `已熱重載 ${snapshot.source} 變更`,
        );
      } catch {
        // ignore malformed SSE payload
      }
    });
    return () => {
      es.close();
    };
  }, [compileAndBoot, triggerLcdBootFlash]);

  // Fixed 60Hz deterministic game loop feeding offscreen CanvasTexture + optional 2D/Fullscreen canvas
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
      if (eng) {
        const k = keyPadRef.current;
        const v = virtualPadRef.current;
        const input: EngineInputState = {
          left: k.left || v.left,
          right: k.right || v.right,
          jump: k.up || k.jumpA || v.up || v.jumpA,
          slash: k.slashB || v.slashB,
          dash: k.dashX || v.dashX,
          restart: restartQueuedRef.current,
        };

        const modalPaused =
          cameraPhaseRef.current === 'tray-open' || cameraPhaseRef.current === 'inserting';

        if (!isPausedRef.current && !modalPaused) {
          accMs += dt;
          let steps = 0;
          while (accMs >= FIXED_DT && steps < 4) {
            eng.stepTick(input);
            accMs -= FIXED_DT;
            steps++;
          }
          if (steps >= 4) accMs = 0;
        }

        // Always render into the persistent 480x270 offscreen surface for ThreeHandheldStage CanvasTexture
        const offCtx = offscreenGameCanvas.getContext('2d');
        if (offCtx) {
          eng.render(offCtx, {
            showDebug: showDebugRef.current,
            enableLighting: true,
          });
        }

        // Mirror to 2D DOM canvas when Fullscreen or Fallback is mounted
        const cvs = canvasRef.current;
        if (cvs) {
          const domCtx = cvs.getContext('2d');
          if (domCtx) {
            domCtx.imageSmoothingEnabled = false;
            domCtx.drawImage(offscreenGameCanvas, 0, 0);
          }
        }

        uiSyncTick++;
        if (uiSyncTick % 4 === 0) {
          setStats(eng.getStats());
        }
      }

      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [offscreenGameCanvas]);

  // Fullscreen & anti-stuck pointer release listeners
  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    const releasePointerId = (e: PointerEvent) => {
      if (activePointersRef.current.delete(e.pointerId)) {
        recomputeVirtualFromPointers();
      }
    };
    const clearAllPads = () => {
      keyPadRef.current = { ...EMPTY_PAD };
      activePointersRef.current.clear();
      virtualPadRef.current = { ...EMPTY_PAD };
      restartQueuedRef.current = false;
      setPressedUi({ ...EMPTY_PAD });
    };

    document.addEventListener('fullscreenchange', onFullscreenChange);
    window.addEventListener('pointerup', releasePointerId);
    window.addEventListener('pointercancel', releasePointerId);
    window.addEventListener('blur', clearAllPads);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      window.removeEventListener('pointerup', releasePointerId);
      window.removeEventListener('pointercancel', releasePointerId);
      window.removeEventListener('blur', clearAllPads);
    };
  }, [recomputeVirtualFromPointers]);

  // Global keyboard controls synced visually to console pad + ESC closes cartridge tray
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && cameraPhaseRef.current === 'tray-open') {
        e.preventDefault();
        setCameraPhase('play');
        return;
      }

      const el = document.activeElement as HTMLElement | null;
      if (el?.tagName === 'SELECT') return;

      let changed = false;
      if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') {
        if (!keyPadRef.current.left) changed = true;
        keyPadRef.current.left = true;
      }
      if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') {
        if (!keyPadRef.current.right) changed = true;
        keyPadRef.current.right = true;
      }
      if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') {
        if (!keyPadRef.current.up) changed = true;
        keyPadRef.current.up = true;
      }
      if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') {
        if (!keyPadRef.current.down) changed = true;
        keyPadRef.current.down = true;
      }
      if (e.key === ' ') {
        e.preventDefault();
        if (!keyPadRef.current.jumpA) changed = true;
        keyPadRef.current.jumpA = true;
      }
      if (e.key === 'j' || e.key === 'J') {
        if (!keyPadRef.current.slashB) changed = true;
        keyPadRef.current.slashB = true;
      }
      if (e.key === 'Shift') {
        if (!keyPadRef.current.dashX) changed = true;
        keyPadRef.current.dashX = true;
      }
      if (e.key === 'r' || e.key === 'R') {
        restartQueuedRef.current = true;
      }
      if (e.key === 'F1') {
        e.preventDefault();
        setShowDebug((prev) => !prev);
      }

      if (changed) syncCombinedPadState();
      zzfxBridge.unlock();
    };

    const onKeyUp = (e: KeyboardEvent) => {
      let changed = false;
      if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') {
        if (keyPadRef.current.left) changed = true;
        keyPadRef.current.left = false;
      }
      if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') {
        if (keyPadRef.current.right) changed = true;
        keyPadRef.current.right = false;
      }
      if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') {
        if (keyPadRef.current.up) changed = true;
        keyPadRef.current.up = false;
      }
      if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') {
        if (keyPadRef.current.down) changed = true;
        keyPadRef.current.down = false;
      }
      if (e.key === ' ') {
        if (keyPadRef.current.jumpA) changed = true;
        keyPadRef.current.jumpA = false;
      }
      if (e.key === 'j' || e.key === 'J') {
        if (keyPadRef.current.slashB) changed = true;
        keyPadRef.current.slashB = false;
      }
      if (e.key === 'Shift') {
        if (keyPadRef.current.dashX) changed = true;
        keyPadRef.current.dashX = false;
      }
      if (e.key === 'r' || e.key === 'R') {
        restartQueuedRef.current = false;
      }

      if (changed) syncCombinedPadState();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [syncCombinedPadState]);

  const handleSelectSkin = (nextSkin: ArcadeSkinId) => {
    setSkinId(nextSkin);
    zzfxBridge.unlock();
    zzfxBridge.playRaw([0.45, 0.01, 680, 0.005, 0.015, 0.05, 1, 1.2, 6, 0, 120, 0.02, 0, 0, 0, 0, 0, 0.8, 0.01, 0], 'skin');
    try {
      window.localStorage.setItem(SKIN_STORAGE_KEY, nextSkin);
    } catch {
      // ignore storage errors
    }
  };

  const handleReturnToEngine = () => {
    saveCrossZoneHandoff({
      presetId: selectedPresetIdRef.current,
      entryFile: entryFileRef.current,
      files: projectFilesRef.current,
    });
    window.location.href = '/engine?handoff=1';
  };

  const handleOpenCartridgeTray = () => {
    if (cameraPhase === 'inserting') return;
    zzfxBridge.unlock();
    clearVirtualInputs();
    setDeskTilt({ rx: 0, ry: 0 });
    if (cameraPhase === 'tray-open') {
      setCameraPhase('play');
      return;
    }
    // Mechanical spring eject click
    zzfxBridge.playRaw([0.65, 0.02, 460, 0.005, 0.02, 0.07, 1, 1.3, 18, 0, 140, 0.02, 0, 0, 0, 0, 0, 0.7, 0.01, 0], 'eject');
    setCameraPhase('tray-open');
  };

  const handleInsertCartridge = (targetId: string) => {
    if (cameraPhase === 'inserting') return;
    zzfxBridge.unlock();

    const isCustomMcp = targetId === '__custom_mcp__' && customMcpProject;
    const foundPreset = !isCustomMcp ? ENGINE_PRESETS.find((p) => p.id === targetId) : null;
    if (!isCustomMcp && !foundPreset) return;

    const nextMeta = isCustomMcp
      ? resolveCartridgeMeta('mcp-agent-project', ENGINE_PRESETS)
      : resolveCartridgeMeta(foundPreset!.id, ENGINE_PRESETS);

    setInsertingMeta(nextMeta);
    setCameraPhase('inserting');
    // Mechanical snap-latch click sound
    zzfxBridge.playRaw([0.85, 0.02, 185, 0.003, 0.015, 0.05, 2, 1.8, -14, 0, -40, 0.01, 0, 0.5, 0, 0.1, 0, 0.85, 0.01, 0], 'insert');

    window.setTimeout(() => {
      if (isCustomMcp && customMcpProject) {
        setSelectedPresetId('mcp-agent-project');
        setProjectFiles(customMcpProject.files);
        setEntryFile(customMcpProject.entryFile);
        saveCrossZoneHandoff({
          presetId: 'mcp-agent-project',
          entryFile: customMcpProject.entryFile,
          files: customMcpProject.files,
        });
        void compileAndBoot(customMcpProject.files, customMcpProject.entryFile, null, '已插回外部 AI 卡匣');
      } else if (foundPreset) {
        const packed = presetToFiles(foundPreset);
        setSelectedPresetId(foundPreset.id);
        setProjectFiles(packed.files);
        setEntryFile(packed.entry);
        saveCrossZoneHandoff({
          presetId: foundPreset.id,
          entryFile: packed.entry,
          files: packed.files,
        });
        const nextUrl = new URL(window.location.href);
        nextUrl.searchParams.set('preset', foundPreset.id);
        nextUrl.searchParams.delete('handoff');
        window.history.replaceState({}, '', nextUrl.toString());
        void compileAndBoot(packed.files, packed.entry, null, foundPreset.title);
      }

      zzfxBridge.playPreset('coin');
      triggerLcdBootFlash();
      setInsertingMeta(null);
      setCameraPhase('play');
    }, 430);
  };

  const handleRestartGame = () => {
    zzfxBridge.unlock();
    const eng = engineRef.current;
    if (eng && eng.stages.list().length > 0) {
      eng.game.restart();
      setStats(eng.getStats());
      setIsPaused(false);
    } else {
      void compileAndBoot(projectFilesRef.current, entryFileRef.current);
    }
  };

  const handleToggleAudio = () => {
    const nextMuted = !audioMuted;
    setAudioMuted(nextMuted);
    zzfxBridge.setMuted(nextMuted);
    if (engineRef.current) {
      engineRef.current.audio.setMuted(nextMuted);
    }
    if (!nextMuted) {
      zzfxBridge.unlock();
      zzfxBridge.playPreset('coin');
    }
  };

  const handleToggleFullscreen = () => {
    const el = stageRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      void el.requestFullscreen().catch(() => {});
    } else {
      void document.exitFullscreen().catch(() => {});
    }
  };

  const handleStageMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    if (!parallaxEnabled || cameraPhase !== 'play' || isMobileLandscape) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width - 0.5;
    const ny = (e.clientY - rect.top) / rect.height - 0.5;
    setDeskTilt({
      rx: Number((-ny * 5.5).toFixed(2)),
      ry: Number((nx * 6.5).toFixed(2)),
    });
  };

  const handleStageMouseLeave = () => {
    if (deskTilt.rx !== 0 || deskTilt.ry !== 0) {
      setDeskTilt({ rx: 0, ry: 0 });
    }
  };

  const handleOpenCartridgeTrayRef = useRef(handleOpenCartridgeTray);
  handleOpenCartridgeTrayRef.current = handleOpenCartridgeTray;

  const handleRayAction = useCallback(
    (action: RayActionName, active: boolean, pointerId: number) => {
      if (action === 'cartridge') {
        if (active) {
          handleOpenCartridgeTrayRef.current();
        }
        return;
      }
      if (active) {
        zzfxBridge.unlock();
        activePointersRef.current.set(pointerId, action);
      } else {
        activePointersRef.current.delete(pointerId);
      }
      recomputeVirtualFromPointers();
    },
    [recomputeVirtualFromPointers],
  );

  // Compute target CSS 3D Camera Rig transform (used only in 2D Fallback mode)
  const cameraAnimate = (() => {
    if (cameraPhase === 'boot') {
      return { opacity: 1, scale: 1, y: 0, rotateX: 0, rotateY: 0 };
    }
    if (cameraPhase === 'tray-open') {
      return isMobileLandscape
        ? { opacity: 1, scale: 1.04, y: 48, rotateX: 6, rotateY: 0 }
        : { opacity: 1, scale: 1.22, y: 122, rotateX: 11, rotateY: 0 };
    }
    if (cameraPhase === 'inserting') {
      return isMobileLandscape
        ? { opacity: 1, scale: 1.02, y: 24, rotateX: 3, rotateY: 0 }
        : { opacity: 1, scale: 1.12, y: 58, rotateX: 5, rotateY: 0 };
    }
    return {
      opacity: 1,
      scale: 1,
      y: 0,
      rotateX: parallaxEnabled ? deskTilt.rx : 0,
      rotateY: parallaxEnabled ? deskTilt.ry : 0,
    };
  })();

  const ledColorClass = compileError
    ? 'bg-[#EF4444]'
    : isPaused || cameraPhase === 'tray-open' || cameraPhase === 'inserting'
      ? 'bg-[#F59E0B]'
      : 'bg-[#10B981]';

  const ledState: 'playing' | 'paused' | 'error' = compileError
    ? 'error'
    : isPaused
      ? 'paused'
      : 'playing';

  const usingThreeStage = !isFullscreen && renderBackend !== 'Fallback';

  return (
    <div className="min-h-dvh h-dvh bg-[#0C0A14] text-[#E2E8F0] font-sans flex flex-col overflow-hidden select-none">
      {/* Desktop / Tablet Strict 3-Zone Top Bar (Hidden in Mobile Landscape for True Handheld Ergonomics) */}
      {!isMobileLandscape && (
        <header className="h-14 border-b border-[#232A3B] bg-[#111520] px-6 flex items-center justify-between gap-8 shrink-0">
          <a
            href="/"
            className="text-base font-semibold tracking-tight text-white whitespace-nowrap shrink-0"
          >
            ChronoForge
          </a>

          <nav className="flex items-center gap-6 text-sm text-[#94A3B8] overflow-x-auto" aria-label="層級工作區導覽">
            <a href="/" className="hover:text-white transition-colors whitespace-nowrap shrink-0">
              總部大廳
            </a>
            <a href="/studio" className="hover:text-white transition-colors whitespace-nowrap shrink-0">
              精靈與幀製作區
            </a>
            <a href="/engine" className="hover:text-white transition-colors whitespace-nowrap shrink-0">
              純程式引擎區
            </a>
            <a
              href="/play"
              className="text-white border-b border-[#16A34A] pb-0.5 whitespace-nowrap shrink-0"
            >
              遊戲遊玩區
            </a>
            <a href="/archive" className="hover:text-white transition-colors whitespace-nowrap shrink-0">
              文物歷史庫
            </a>
          </nav>

          <button
            type="button"
            onClick={handleReturnToEngine}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-[#16A34A] hover:bg-[#15803D] text-white rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Code2 className="w-3.5 h-3.5" aria-hidden="true" />
            返回引擎編輯
          </button>
        </header>
      )}

      {/* Portrait Orientation Guidance Overlay (With Instant Bypass — solid bg, no backdrop-blur) */}
      {isMobilePortrait && !bypassPortraitPrompt && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="portrait-rotate-title"
          className="fixed inset-0 z-50 bg-[#0B0914]/96 flex flex-col items-center justify-center p-6 text-center gap-5"
        >
          <motion.div
            animate={{ rotate: [0, 0, -90, -90, 0] }}
            transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
            className="w-16 h-24 rounded-2xl border-2 border-[#8CE0B8] bg-[#161922] flex flex-col items-center justify-between p-2 shadow-xl"
            aria-hidden="true"
          >
            <span className="w-6 h-1 rounded-full bg-white/30" />
            <RotateCw className="w-6 h-6 text-[#8CE0B8]" />
            <span className="w-2.5 h-2.5 rounded-full bg-white/25" />
          </motion.div>

          <div className="space-y-1.5 max-w-xs">
            <h2 id="portrait-rotate-title" className="text-lg font-bold text-white">
              請將手機橫置以啟動雙手掌機模式
            </h2>
            <p className="text-xs text-[#94A3B8] leading-relaxed">
              橫版握持可解鎖全螢幕 WebGPU 3D 掌機舞台、左右觸控按鍵與卡匣抽換鏡頭特寫。
            </p>
          </div>

          <div className="flex flex-col items-center gap-3 w-full max-w-xs">
            <PWAInstallButton className="w-full justify-center py-2.5" />
            <button
              type="button"
              onClick={() => setBypassPortraitPrompt(true)}
              className="w-full py-2.5 px-4 rounded-xl border border-[#2C3347] bg-[#161B28] hover:bg-[#1F2638] text-xs font-medium text-[#E2E8F0] transition-colors cursor-pointer"
            >
              仍以直向遊玩
            </button>
          </div>
        </div>
      )}

      {/* Main Warm Arcade Desk Stage: Three.js WebGPURenderer 3D Stage (or 2D Fallback / Fullscreen) */}
      <main
        ref={stageRef}
        onMouseMove={handleStageMouseMove}
        onMouseLeave={handleStageMouseLeave}
        style={{ perspective: '1400px' }}
        className={`flex-1 min-h-0 flex items-center justify-center relative overflow-hidden ${
          usingThreeStage
            ? ''
            : isMobileLandscape
              ? 'p-1 pl-[max(6px,env(safe-area-inset-left))] pr-[max(6px,env(safe-area-inset-right))] pt-[max(4px,env(safe-area-inset-top))] pb-[max(4px,env(safe-area-inset-bottom))]'
              : 'p-3 sm:p-5 lg:p-6'
        }`}
      >
        {/* Spotlight Click-away Scrim during Cartridge Swap Close-up (No backdrop-blur over WebGPU) */}
        {(cameraPhase === 'tray-open' || cameraPhase === 'inserting') && (
          <div
            onClick={() => {
              if (cameraPhase === 'tray-open') setCameraPhase('play');
            }}
            className="fixed inset-0 z-30 bg-black/30 transition-opacity"
            aria-hidden="true"
          />
        )}

        {isFullscreen ? (
          <div className="w-full h-full bg-[#07090F] flex flex-col items-center justify-center relative">
            <canvas
              ref={canvasRef}
              width={VIEW_W}
              height={VIEW_H}
              tabIndex={0}
              onMouseDown={() => zzfxBridge.unlock()}
              className="w-full h-full max-h-screen max-w-[calc(100vh*16/9)] aspect-video block [image-rendering:pixelated] focus:outline-none"
            />
            <button
              type="button"
              onClick={handleToggleFullscreen}
              className="fixed bottom-4 right-4 px-3 py-1.5 text-xs font-medium bg-[#131822]/95 border border-[#232A3B] text-white rounded-md cursor-pointer inline-flex items-center gap-1.5"
            >
              <Minimize2 className="w-3.5 h-3.5" />
              退出全螢幕
            </button>
          </div>
        ) : usingThreeStage ? (
          <div
            className="relative w-full h-full"
            onMouseDown={() => zzfxBridge.unlock()}
          >
            <ThreeHandheldStage
              gameCanvas={offscreenGameCanvas}
              skin={threeSkin}
              cameraPhase={cameraPhase}
              pressedUi={pressedUi}
              activeCartMeta={activeCartMeta}
              insertingMeta={insertingMeta}
              ledState={ledState}
              bootFlashTick={bootFlashTick}
              parallaxEnabled={parallaxEnabled && !isMobileLandscape}
              tiltTarget={deskTilt}
              onRayAction={handleRayAction}
              onBackendReady={setRenderBackend}
            />

            {/* Unobtrusive Top Corner Hardware Bar (Solid dark surface, zero backdrop-blur, <=12% height) */}
            <div className="pointer-events-none absolute top-2.5 left-3 right-3 z-20 flex flex-wrap items-center justify-between gap-2 pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
              {/* Top-Left Console Readout & Cartridge Selector */}
              <div className="pointer-events-auto flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[#111520]/94 border border-[#272E42] shadow-lg max-w-full">
                <span className={`w-2 h-2 rounded-full shrink-0 ${ledColorClass}`} aria-hidden="true" />
                <span className="font-mono text-[11px] font-bold tracking-wider text-white whitespace-nowrap">
                  CHRONO·POCKET
                </span>
                <span className="font-mono text-[10px] text-[#34D399] whitespace-nowrap">
                  {renderBackend === 'initializing' ? '3D' : renderBackend}
                </span>

                <button
                  type="button"
                  onClick={handleOpenCartridgeTray}
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#1B2233] hover:bg-[#252E44] border border-white/10 rounded text-[11px] font-semibold text-[#E2E8F0] transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Disc3 className="w-3 h-3 text-[#34D399]" aria-hidden="true" />
                  <span className="max-w-[130px] sm:max-w-[180px] truncate">
                    {activeCartMeta.shortTitle}
                  </span>
                </button>

                <span className="hidden md:inline font-mono tabular-nums text-[11px] text-[#94A3B8] whitespace-nowrap">
                  {stats.stageId.toUpperCase()} · HP {stats.playerHp}/{stats.playerMaxHp}
                </span>

                {noticeText && !isMobileLandscape && (
                  <span className="hidden xl:inline text-[11px] text-[#94A3B8] truncate max-w-[200px]">
                    · {noticeText}
                  </span>
                )}
              </div>

              {/* Top-Right Swatches & Quick Controls */}
              <div className="pointer-events-auto flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#111520]/94 border border-[#272E42] shadow-lg">
                {isMobileLandscape && (
                  <button
                    type="button"
                    onClick={handleReturnToEngine}
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold bg-[#16A34A] text-white rounded whitespace-nowrap cursor-pointer"
                  >
                    <Code2 className="w-3 h-3" aria-hidden="true" />
                    引擎
                  </button>
                )}

                <div className="flex items-center gap-1 px-1" role="group" aria-label="切換機殼配色">
                  {ARCADE_SKINS.map((item) => {
                    const active = item.id === skin.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        title={item.name}
                        aria-label={`機殼塗裝：${item.name}`}
                        aria-pressed={active}
                        onClick={() => handleSelectSkin(item.id)}
                        style={{ backgroundColor: item.swatchHex }}
                        className={`w-4 h-4 rounded-full border-2 transition-transform cursor-pointer ${
                          active ? 'border-white scale-110' : 'border-black/40 hover:scale-105'
                        }`}
                      />
                    );
                  })}
                </div>

                {!isMobileLandscape && (
                  <button
                    type="button"
                    onClick={() => setParallaxEnabled((p) => !p)}
                    aria-pressed={parallaxEnabled}
                    className={`hidden lg:inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
                      parallaxEnabled
                        ? 'bg-[#10B981] text-[#052E16] border-[#10B981]'
                        : 'bg-[#1B2233] text-[#CBD5E1] border-white/10 hover:bg-[#252E44]'
                    }`}
                  >
                    <Orbit className="w-3 h-3" aria-hidden="true" />
                    3D 視差
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setShowTouchPad((v) => !v)}
                  aria-pressed={showTouchPad}
                  title="切換螢幕邊緣觸控虛擬按鍵"
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    showTouchPad
                      ? 'bg-[#252E44] text-white border-[#34D399]/60'
                      : 'bg-[#1B2233] text-[#CBD5E1] border-white/10 hover:bg-[#252E44]'
                  }`}
                >
                  <Gamepad2 className="w-3 h-3" aria-hidden="true" />
                  <span className="hidden sm:inline">觸控</span>
                </button>

                <PWAInstallButton compact={isMobileLandscape} />

                <button
                  type="button"
                  onClick={() => setIsPaused((p) => !p)}
                  aria-label={isPaused ? '繼續遊戲' : '暫停遊戲'}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#1B2233] hover:bg-[#252E44] border border-white/10 text-[11px] text-[#E2E8F0] transition-colors whitespace-nowrap cursor-pointer"
                >
                  {isPaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
                  <span className="hidden sm:inline">{isPaused ? '繼續' : '暫停'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleRestartGame}
                  aria-label="重新開始關卡"
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#1B2233] hover:bg-[#252E44] border border-white/10 text-[11px] text-[#E2E8F0] transition-colors whitespace-nowrap cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span className="hidden sm:inline">重開</span>
                </button>

                <button
                  type="button"
                  onClick={handleToggleAudio}
                  aria-label={audioMuted ? '開啟音效' : '靜音'}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#1B2233] hover:bg-[#252E44] border border-white/10 text-[11px] text-[#E2E8F0] transition-colors whitespace-nowrap cursor-pointer"
                >
                  {audioMuted ? (
                    <VolumeX className="w-3 h-3 text-[#94A3B8]" />
                  ) : (
                    <Volume2 className="w-3 h-3 text-[#4ADE80]" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleToggleFullscreen}
                  aria-label="全螢幕切換"
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#1B2233] hover:bg-[#252E44] border border-white/10 text-[11px] text-[#E2E8F0] transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Maximize2 className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Ergonomic Touch Flank Overlay (Only left/right bottom thumb clusters; central 3D viewport stays 100% open) */}
            {showTouchPad && cameraPhase === 'play' && (
              <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex items-end justify-between px-4 sm:px-6 pb-[env(safe-area-inset-bottom)] pl-[max(16px,env(safe-area-inset-left))] pr-[max(16px,env(safe-area-inset-right))]">
                {/* Left Thumb Cluster: Cross D-Pad */}
                <div
                  className="pointer-events-auto grid grid-cols-3 grid-rows-3 w-[132px] h-[132px] select-none touch-none opacity-92"
                  role="group"
                  aria-label="虛擬十字方向鍵"
                >
                  <div />
                  <button
                    type="button"
                    aria-label="向上跳躍 (W)"
                    onPointerDown={bindPointerDown('up')}
                    onPointerUp={bindPointerRelease}
                    onPointerCancel={bindPointerRelease}
                    style={{ backgroundColor: skin.dpadColor, borderColor: skin.dpadBorder }}
                    className={`min-w-[44px] min-h-[44px] rounded-t-lg border-x-2 border-t-2 flex items-center justify-center text-white text-xs font-bold touch-none cursor-pointer ${
                      pressedUi.up ? 'translate-y-[2px] brightness-125' : ''
                    }`}
                  >
                    ▲
                  </button>
                  <div />
                  <button
                    type="button"
                    aria-label="向左移動 (A)"
                    onPointerDown={bindPointerDown('left')}
                    onPointerUp={bindPointerRelease}
                    onPointerCancel={bindPointerRelease}
                    style={{ backgroundColor: skin.dpadColor, borderColor: skin.dpadBorder }}
                    className={`min-w-[44px] min-h-[44px] rounded-l-lg border-y-2 border-l-2 flex items-center justify-center text-white text-xs font-bold touch-none cursor-pointer ${
                      pressedUi.left ? 'translate-y-[2px] brightness-125' : ''
                    }`}
                  >
                    ◀
                  </button>
                  <div
                    style={{ backgroundColor: skin.dpadColor }}
                    className="flex items-center justify-center"
                  >
                    <span className="w-4 h-4 rounded-full bg-black/35" />
                  </div>
                  <button
                    type="button"
                    aria-label="向右移動 (D)"
                    onPointerDown={bindPointerDown('right')}
                    onPointerUp={bindPointerRelease}
                    onPointerCancel={bindPointerRelease}
                    style={{ backgroundColor: skin.dpadColor, borderColor: skin.dpadBorder }}
                    className={`min-w-[44px] min-h-[44px] rounded-r-lg border-y-2 border-r-2 flex items-center justify-center text-white text-xs font-bold touch-none cursor-pointer ${
                      pressedUi.right ? 'translate-y-[2px] brightness-125' : ''
                    }`}
                  >
                    ▶
                  </button>
                  <div />
                  <button
                    type="button"
                    aria-label="向下 (S)"
                    onPointerDown={bindPointerDown('down')}
                    onPointerUp={bindPointerRelease}
                    onPointerCancel={bindPointerRelease}
                    style={{ backgroundColor: skin.dpadColor, borderColor: skin.dpadBorder }}
                    className={`min-w-[44px] min-h-[44px] rounded-b-lg border-x-2 border-b-2 flex items-center justify-center text-white text-xs font-bold touch-none cursor-pointer ${
                      pressedUi.down ? 'translate-y-[2px] brightness-125' : ''
                    }`}
                  >
                    ▼
                  </button>
                  <div />
                </div>

                {/* Right Thumb Cluster: Candy X / B / A Round Action Buttons */}
                <div
                  className="pointer-events-auto flex flex-col items-end gap-2 select-none touch-none opacity-94"
                  role="group"
                  aria-label="虛擬街機動作圓鈕"
                >
                  <button
                    type="button"
                    aria-label="衝刺殘影 (Shift)"
                    onPointerDown={bindPointerDown('dashX')}
                    onPointerUp={bindPointerRelease}
                    onPointerCancel={bindPointerRelease}
                    style={{
                      backgroundColor: skin.btnXColor,
                      boxShadow: `0 4px 0 ${skin.btnXRim}`,
                    }}
                    className={`w-12 h-12 rounded-full border-2 border-black/25 text-white font-mono text-sm font-bold flex items-center justify-center touch-none cursor-pointer ${
                      pressedUi.dashX ? 'translate-y-[3px]' : ''
                    }`}
                  >
                    X
                  </button>
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      aria-label="揮砍攻擊 (J)"
                      onPointerDown={bindPointerDown('slashB')}
                      onPointerUp={bindPointerRelease}
                      onPointerCancel={bindPointerRelease}
                      style={{
                        backgroundColor: skin.btnBColor,
                        boxShadow: `0 4px 0 ${skin.btnBRim}`,
                      }}
                      className={`mt-2 w-13 h-13 rounded-full border-2 border-black/25 text-white font-mono text-base font-bold flex items-center justify-center touch-none cursor-pointer ${
                        pressedUi.slashB ? 'translate-y-[3px]' : ''
                      }`}
                    >
                      B
                    </button>
                    <button
                      type="button"
                      aria-label="跳躍 (W/Space)"
                      onPointerDown={bindPointerDown('jumpA')}
                      onPointerUp={bindPointerRelease}
                      onPointerCancel={bindPointerRelease}
                      style={{
                        backgroundColor: skin.btnAColor,
                        boxShadow: `0 4px 0 ${skin.btnARim}`,
                      }}
                      className={`w-13 h-13 rounded-full border-2 border-black/25 text-white font-mono text-base font-bold flex items-center justify-center touch-none cursor-pointer ${
                        pressedUi.jumpA ? 'translate-y-[3px]' : ''
                      }`}
                    >
                      A
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Quiet Bottom Legend (Desktop Only) */}
            {!isMobileLandscape && cameraPhase === 'play' && (
              <div className="pointer-events-none absolute bottom-2.5 inset-x-0 z-10 flex items-center justify-center px-4">
                <span className="font-mono text-[11px] text-[#94A3B8]/85 bg-[#0C0A14]/85 px-3 py-1 rounded border border-white/10">
                  點按 3D 掌機按鍵／頂部卡匣插槽 或 WASD + Space + J + Shift 操作 · F1 除錯線框
                </span>
              </div>
            )}

            {/* Compile Error Overlay */}
            {compileError && (
              <div className="absolute inset-0 z-30 bg-[#090C12]/94 flex flex-col items-center justify-center p-6 text-center gap-3">
                <div className="inline-flex items-center gap-2 text-sm font-medium text-[#F87171]">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>遊戲腳本編譯失敗：{compileError}</span>
                </div>
                <button
                  type="button"
                  onClick={handleReturnToEngine}
                  className="px-4 py-2 text-xs font-semibold bg-[#16A34A] hover:bg-[#15803D] text-white rounded-md cursor-pointer whitespace-nowrap"
                >
                  返回引擎編輯修復
                </button>
              </div>
            )}
          </div>
        ) : (
          /* 2D CSS Handheld Fallback (only when WebGPU & WebGL2 are unavailable) */
          <motion.div
            initial={{ opacity: 0, scale: 0.92, rotateX: 14, rotateY: -6 }}
            animate={cameraAnimate}
            transition={{ type: 'spring', stiffness: 210, damping: 24, mass: 0.9 }}
            style={{ transformStyle: 'preserve-3d' }}
            className={`w-full flex flex-col items-center ${
              isMobileLandscape ? 'h-full justify-center max-w-none' : 'max-w-[1260px]'
            } ${cameraPhase === 'tray-open' || cameraPhase === 'inserting' ? 'z-30' : 'z-10'}`}
          >
            {/* Top Hardware Spine: Left/Right Tactile Shoulder Bumpers + Protruding Cartridge Bay */}
            <div className="w-full flex items-end justify-between px-8 sm:px-14">
              <button
                type="button"
                onClick={handleOpenCartridgeTray}
                title="L 肩鍵 · 開啟卡匣插槽特寫"
                className={`px-4 py-1 rounded-t-xl border-x-2 border-t-2 text-[10px] font-mono font-bold tracking-widest cursor-pointer transition-transform active:translate-y-0.5 ${skin.bumperStyle}`}
              >
                L · 換卡
              </button>

              <TopCartridgeSlot
                activeMeta={activeCartMeta}
                isOpen={cameraPhase === 'tray-open'}
                isInserting={cameraPhase === 'inserting'}
                onToggleOpen={handleOpenCartridgeTray}
              />

              <button
                type="button"
                onPointerDown={bindPointerDown('dashX')}
                onPointerUp={bindPointerRelease}
                onPointerCancel={bindPointerRelease}
                title="R 肩鍵 · 衝刺閃避"
                className={`px-4 py-1 rounded-t-xl border-x-2 border-t-2 text-[10px] font-mono font-bold tracking-widest cursor-pointer touch-none transition-transform active:translate-y-0.5 ${skin.bumperStyle}`}
              >
                R · 衝刺
              </button>
            </div>

            {/* Outer Dual-Tone Handheld / Tabletop Arcade Shell */}
            <section
              aria-label="ChronoPocket 雙色復古掌機"
              className={`w-full border-2 transition-colors duration-200 ${skin.outerShellStyle} ${
                isMobileLandscape
                  ? 'h-[calc(100%-24px)] rounded-[24px] p-1.5 sm:p-2'
                  : 'rounded-[32px] p-3 sm:p-4'
              }`}
            >
              {/* Inner Cream Deck Container */}
              <div
                className={`h-full border flex flex-col transition-colors duration-200 ${skin.innerDeckStyle} ${
                  isMobileLandscape
                    ? 'rounded-[18px] p-2 gap-1.5 justify-between'
                    : 'rounded-[24px] p-3 sm:p-4 gap-2.5'
                }`}
              >
                {/* Console Top Deck Utility Bar */}
                <div className="flex items-center justify-between gap-2 px-1 shrink-0">
                  <div className="flex items-center gap-2 min-w-0">
                    {/* Hardware Power LED */}
                    <span
                      className={`w-2.5 h-2.5 rounded-full shrink-0 shadow-inner ${ledColorClass}`}
                      aria-hidden="true"
                    />
                    <span className="font-mono text-[11px] sm:text-xs font-bold tracking-wider uppercase opacity-85 whitespace-nowrap">
                      CHRONO·POCKET
                    </span>

                    <button
                      type="button"
                      onClick={handleOpenCartridgeTray}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-black/[0.08] hover:bg-black/[0.15] border border-black/15 rounded-lg text-[11px] font-semibold transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <Disc3 className="w-3.5 h-3.5" aria-hidden="true" />
                      <span className="max-w-[140px] sm:max-w-[200px] truncate">
                        {activeCartMeta.shortTitle}
                      </span>
                    </button>

                    {noticeText && !isMobileLandscape && (
                      <span className="hidden xl:inline text-xs opacity-70 truncate max-w-[240px]">
                        · {noticeText}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                    {/* Mobile Landscape Compact Engine Return */}
                    {isMobileLandscape && (
                      <button
                        type="button"
                        onClick={handleReturnToEngine}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold bg-[#16A34A] text-white rounded-lg whitespace-nowrap cursor-pointer"
                      >
                        <Code2 className="w-3 h-3" aria-hidden="true" />
                        引擎
                      </button>
                    )}

                    {/* Shell Colorway Dots */}
                    <div className="flex items-center gap-1.5" role="group" aria-label="切換機殼配色">
                      {!isMobileLandscape && (
                        <span className="hidden sm:inline text-[11px] font-medium opacity-70 mr-0.5 whitespace-nowrap">
                          塗裝
                        </span>
                      )}
                      {ARCADE_SKINS.map((item) => {
                        const active = item.id === skin.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            title={item.name}
                            aria-label={`機殼塗裝：${item.name}`}
                            aria-pressed={active}
                            onClick={() => handleSelectSkin(item.id)}
                            style={{ backgroundColor: item.swatchHex }}
                            className={`w-4 h-4 sm:w-5 sm:h-5 rounded-full border-2 transition-transform cursor-pointer ${
                              active
                                ? 'border-[#1E2430] scale-110 shadow-sm'
                                : 'border-black/25 hover:scale-105'
                            }`}
                          />
                        );
                      })}
                    </div>

                    {/* Desktop 3D Parallax Showcase Toggle */}
                    {!isMobileLandscape && (
                      <button
                        type="button"
                        onClick={() => setParallaxEnabled((p) => !p)}
                        aria-pressed={parallaxEnabled}
                        className={`hidden lg:inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
                          parallaxEnabled
                            ? 'bg-[#1E2430] text-white border-[#1E2430]'
                            : 'bg-black/[0.06] border-black/15 hover:bg-black/[0.12]'
                        }`}
                      >
                        <Orbit className="w-3 h-3" aria-hidden="true" />
                        3D 視差
                      </button>
                    )}

                    <PWAInstallButton compact={isMobileLandscape} />

                    {/* Unboxed Tabular Status Readout */}
                    <div className="hidden md:block font-mono tabular-nums text-xs font-semibold opacity-85 whitespace-nowrap">
                      {stats.stageId.toUpperCase()} · HP {stats.playerHp}/{stats.playerMaxHp}
                      {stats.gamePhase !== 'playing' ? ` · ${stats.gamePhase.toUpperCase()}` : ''}
                    </div>
                  </div>
                </div>

                {/* Console Body: [Left D-Pad Wing] + [Center Glowing Bezel Screen] + [Right Candy Action Wing] */}
                <div
                  className={`flex-1 min-h-0 grid items-center ${
                    isMobileLandscape
                      ? 'grid-cols-[148px_minmax(0,1fr)_154px] gap-2'
                      : 'grid-cols-1 lg:grid-cols-[172px_minmax(0,1fr)_172px] gap-3 sm:gap-4'
                  }`}
                >
                  {/* Left Wing: Sculpted 3x3 Cross D-Pad + Start/Select Keys */}
                  <div
                    className={`${
                      isMobileLandscape
                        ? 'flex flex-col items-center justify-center gap-2'
                        : 'order-2 lg:order-1 flex flex-row lg:flex-col items-center justify-around lg:justify-center gap-3 sm:gap-4 py-1 lg:py-2'
                    }`}
                  >
                    <div
                      className={`relative rounded-full bg-black/[0.06] border border-black/10 flex items-center justify-center shadow-inner select-none touch-none ${
                        isMobileLandscape ? 'w-[126px] h-[126px]' : 'w-[138px] h-[138px]'
                      }`}
                      role="group"
                      aria-label="街機十字方向鍵"
                    >
                      <div
                        className={`grid grid-cols-3 grid-rows-3 ${
                          isMobileLandscape ? 'w-[114px] h-[114px]' : 'w-[124px] h-[124px]'
                        }`}
                      >
                        <div />
                        <button
                          type="button"
                          aria-label="向上跳躍 (W)"
                          onPointerDown={bindPointerDown('up')}
                          onPointerUp={bindPointerRelease}
                          onPointerCancel={bindPointerRelease}
                          style={{
                            backgroundColor: skin.dpadColor,
                            borderColor: skin.dpadBorder,
                          }}
                          className={`min-h-[38px] rounded-t-lg border-x-2 border-t-2 flex items-center justify-center text-white/85 text-xs font-bold cursor-pointer touch-none select-none transition-transform duration-75 ${
                            pressedUi.up
                              ? 'translate-y-[2px] brightness-125 shadow-none'
                              : 'shadow-[inset_0_2px_0_rgba(255,255,255,0.16)]'
                          }`}
                        >
                          ▲
                        </button>
                        <div />

                        <button
                          type="button"
                          aria-label="向左移動 (A)"
                          onPointerDown={bindPointerDown('left')}
                          onPointerUp={bindPointerRelease}
                          onPointerCancel={bindPointerRelease}
                          style={{
                            backgroundColor: skin.dpadColor,
                            borderColor: skin.dpadBorder,
                          }}
                          className={`min-w-[38px] rounded-l-lg border-y-2 border-l-2 flex items-center justify-center text-white/85 text-xs font-bold cursor-pointer touch-none select-none transition-transform duration-75 ${
                            pressedUi.left
                              ? 'translate-y-[2px] brightness-125 shadow-none'
                              : 'shadow-[0_3px_0_rgba(0,0,0,0.35),inset_0_2px_0_rgba(255,255,255,0.16)]'
                          }`}
                        >
                          ◀
                        </button>

                        <div
                          style={{ backgroundColor: skin.dpadColor }}
                          className="flex items-center justify-center"
                        >
                          <div className="w-6 h-6 rounded-full bg-black/30 shadow-inner" />
                        </div>

                        <button
                          type="button"
                          aria-label="向右移動 (D)"
                          onPointerDown={bindPointerDown('right')}
                          onPointerUp={bindPointerRelease}
                          onPointerCancel={bindPointerRelease}
                          style={{
                            backgroundColor: skin.dpadColor,
                            borderColor: skin.dpadBorder,
                          }}
                          className={`min-w-[38px] rounded-r-lg border-y-2 border-r-2 flex items-center justify-center text-white/85 text-xs font-bold cursor-pointer touch-none select-none transition-transform duration-75 ${
                            pressedUi.right
                              ? 'translate-y-[2px] brightness-125 shadow-none'
                              : 'shadow-[0_3px_0_rgba(0,0,0,0.35),inset_0_2px_0_rgba(255,255,255,0.16)]'
                          }`}
                        >
                          ▶
                        </button>

                        <div />
                        <button
                          type="button"
                          aria-label="向下 (S)"
                          onPointerDown={bindPointerDown('down')}
                          onPointerUp={bindPointerRelease}
                          onPointerCancel={bindPointerRelease}
                          style={{
                            backgroundColor: skin.dpadColor,
                            borderColor: skin.dpadBorder,
                          }}
                          className={`min-h-[38px] rounded-b-lg border-x-2 border-b-2 flex items-center justify-center text-white/75 text-xs font-bold cursor-pointer touch-none select-none transition-transform duration-75 ${
                            pressedUi.down
                              ? 'translate-y-[2px] brightness-125 shadow-none'
                              : 'shadow-[0_4px_0_rgba(0,0,0,0.38)]'
                          }`}
                        >
                          ▼
                        </button>
                        <div />
                      </div>
                    </div>

                    {/* System Utility Keys: Pause & Restart */}
                    <div
                      className={`flex items-center gap-1.5 ${
                        isMobileLandscape
                          ? 'flex-row justify-center w-full'
                          : 'flex-col sm:flex-row lg:flex-col w-full max-w-[144px]'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setIsPaused((p) => !p)}
                        className="flex-1 w-full min-h-[36px] inline-flex items-center justify-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold bg-black/[0.08] hover:bg-black/[0.14] border border-black/15 rounded-xl transition-colors whitespace-nowrap cursor-pointer"
                      >
                        {isPaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
                        {isPaused ? '繼續' : '暫停'}
                      </button>
                      <button
                        type="button"
                        onClick={handleRestartGame}
                        className="flex-1 w-full min-h-[36px] inline-flex items-center justify-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold bg-black/[0.08] hover:bg-black/[0.14] border border-black/15 rounded-xl transition-colors whitespace-nowrap cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" />
                        重開
                      </button>
                    </div>
                  </div>

                  {/* Center Bezel: Charcoal Frame + Crisp 16:9 Pixel Display + LCD Boot Flash */}
                  <div
                    className={`min-w-0 flex flex-col items-center justify-center ${
                      isMobileLandscape ? 'h-full' : 'order-1 lg:order-2'
                    }`}
                  >
                    <div
                      className={`w-full bg-[#161922] border-4 border-[#272C3B] shadow-[inset_0_2px_10px_rgba(0,0,0,0.85)] relative flex flex-col justify-center ${
                        isMobileLandscape
                          ? 'h-full rounded-[14px] p-1.5'
                          : 'rounded-[18px] p-2.5 sm:p-3'
                      }`}
                    >
                      <div
                        onMouseDown={() => zzfxBridge.unlock()}
                        className="relative w-full flex-1 min-h-0 flex items-center justify-center rounded-lg overflow-hidden bg-[#07090F]"
                      >
                        <canvas
                          ref={canvasRef}
                          width={VIEW_W}
                          height={VIEW_H}
                          tabIndex={0}
                          className={`aspect-video block [image-rendering:pixelated] focus:outline-none ${
                            isMobileLandscape
                              ? 'h-full w-auto max-w-full max-h-full'
                              : 'w-full h-auto max-h-[calc(100dvh-268px)] max-w-[calc((100dvh-268px)*16/9)]'
                          }`}
                        />

                        {/* Subtle Glass Specular Reflection */}
                        <div
                          className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.06] via-transparent to-transparent"
                          aria-hidden="true"
                        />

                        {/* Retro LCD Power-On / Cartridge Boot Scanline Flash */}
                        {isBootFlashing && (
                          <motion.div
                            initial={{ opacity: 0.9, scaleY: 0.08 }}
                            animate={{ opacity: 0, scaleY: 1 }}
                            transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
                            className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#A7F3D0]/60 via-white/80 to-[#34D399]/60"
                            aria-hidden="true"
                          />
                        )}

                        {compileError && (
                          <div className="absolute inset-0 bg-[#090C12]/92 flex flex-col items-center justify-center p-4 text-center gap-3">
                            <div className="inline-flex items-center gap-2 text-xs sm:text-sm font-medium text-[#F87171]">
                              <AlertCircle className="w-4 h-4 shrink-0" />
                              <span>遊戲腳本編譯失敗：{compileError}</span>
                            </div>
                            <button
                              type="button"
                              onClick={handleReturnToEngine}
                              className="px-4 py-2 text-xs font-semibold bg-[#16A34A] hover:bg-[#15803D] text-white rounded-md cursor-pointer whitespace-nowrap"
                            >
                              返回引擎編輯修復
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Screen Bottom Silk-Screen Label + Utility Controls */}
                      <div className="mt-1.5 px-1 flex items-center justify-between gap-2 text-[11px] text-[#94A3B8] shrink-0">
                        <span className="font-mono tracking-wider text-[#CBD5E1] whitespace-nowrap truncate">
                          {isMobileLandscape
                            ? `${stats.stageId.toUpperCase()} · HP ${stats.playerHp}/${stats.playerMaxHp}`
                            : 'PIXEL 480×270 · 60HZ'}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={handleToggleAudio}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#1E2330] hover:bg-[#2A3142] text-[#E2E8F0] transition-colors whitespace-nowrap cursor-pointer"
                          >
                            {audioMuted ? (
                              <VolumeX className="w-3 h-3 text-[#94A3B8]" />
                            ) : (
                              <Volume2 className="w-3 h-3 text-[#4ADE80]" />
                            )}
                            {audioMuted ? '靜音' : '音效'}
                          </button>
                          <button
                            type="button"
                            onClick={handleToggleFullscreen}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#1E2330] hover:bg-[#2A3142] text-[#E2E8F0] transition-colors whitespace-nowrap cursor-pointer"
                          >
                            <Maximize2 className="w-3 h-3" />
                            全螢幕
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right Wing: Candy Round Arcade Action Buttons + Speaker Slits */}
                  <div
                    className={`${
                      isMobileLandscape
                        ? 'flex flex-col items-center justify-center gap-2'
                        : 'order-3 flex flex-row lg:flex-col items-center justify-around lg:justify-center gap-3 sm:gap-4 py-1 lg:py-2'
                    }`}
                  >
                    <div
                      className={`flex flex-col items-center select-none touch-none ${
                        isMobileLandscape ? 'gap-1.5' : 'gap-2.5'
                      }`}
                      role="group"
                      aria-label="街機動作圓鈕"
                    >
                      {/* X / Dash Button */}
                      <div className="flex flex-col items-center gap-0.5">
                        <button
                          type="button"
                          aria-label="衝刺殘影 (Shift)"
                          onPointerDown={bindPointerDown('dashX')}
                          onPointerUp={bindPointerRelease}
                          onPointerCancel={bindPointerRelease}
                          style={{
                            backgroundColor: skin.btnXColor,
                            boxShadow: pressedUi.dashX
                              ? `0 1px 0 ${skin.btnXRim}, inset 0 2px 3px rgba(255,255,255,0.45)`
                              : `0 5px 0 ${skin.btnXRim}, inset 0 2px 3px rgba(255,255,255,0.45)`,
                          }}
                          className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full border-2 border-black/20 text-white font-mono text-sm font-bold flex items-center justify-center cursor-pointer touch-none select-none transition-transform duration-75 ${
                            pressedUi.dashX ? 'translate-y-[4px]' : ''
                          }`}
                        >
                          X
                        </button>
                        <span className="text-[10px] font-semibold opacity-80 whitespace-nowrap">
                          衝刺
                        </span>
                      </div>

                      {/* B (Slash) + A (Jump) Diagonal Pair */}
                      <div className="flex items-start gap-3 sm:gap-4">
                        <div className="flex flex-col items-center gap-0.5 mt-2.5">
                          <button
                            type="button"
                            aria-label="揮砍攻擊 (J)"
                            onPointerDown={bindPointerDown('slashB')}
                            onPointerUp={bindPointerRelease}
                            onPointerCancel={bindPointerRelease}
                            style={{
                              backgroundColor: skin.btnBColor,
                              boxShadow: pressedUi.slashB
                                ? `0 1px 0 ${skin.btnBRim}, inset 0 2px 3px rgba(255,255,255,0.45)`
                                : `0 5px 0 ${skin.btnBRim}, inset 0 2px 3px rgba(255,255,255,0.45)`,
                            }}
                            className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full border-2 border-black/20 text-white font-mono text-base font-bold flex items-center justify-center cursor-pointer touch-none select-none transition-transform duration-75 ${
                              pressedUi.slashB ? 'translate-y-[4px]' : ''
                            }`}
                          >
                            B
                          </button>
                          <span className="text-[10px] font-semibold opacity-80 whitespace-nowrap">
                            揮砍
                          </span>
                        </div>

                        <div className="flex flex-col items-center gap-0.5">
                          <button
                            type="button"
                            aria-label="跳躍 (W/Space)"
                            onPointerDown={bindPointerDown('jumpA')}
                            onPointerUp={bindPointerRelease}
                            onPointerCancel={bindPointerRelease}
                            style={{
                              backgroundColor: skin.btnAColor,
                              boxShadow: pressedUi.jumpA
                                ? `0 1px 0 ${skin.btnARim}, inset 0 2px 3px rgba(255,255,255,0.45)`
                                : `0 5px 0 ${skin.btnARim}, inset 0 2px 3px rgba(255,255,255,0.45)`,
                            }}
                            className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full border-2 border-black/20 text-white font-mono text-base font-bold flex items-center justify-center cursor-pointer touch-none select-none transition-transform duration-75 ${
                              pressedUi.jumpA ? 'translate-y-[4px]' : ''
                            }`}
                          >
                            A
                          </button>
                          <span className="text-[10px] font-semibold opacity-80 whitespace-nowrap">
                            跳躍
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Decorative Retro Console Speaker Grille Slits */}
                    {!isMobileLandscape && (
                      <div className="hidden lg:flex items-center gap-1.5 opacity-25 pt-1" aria-hidden="true">
                        <span className="w-1.5 h-6 rounded-full bg-black -rotate-12" />
                        <span className="w-1.5 h-6 rounded-full bg-black -rotate-12" />
                        <span className="w-1.5 h-6 rounded-full bg-black -rotate-12" />
                        <span className="w-1.5 h-6 rounded-full bg-black -rotate-12" />
                      </div>
                    )}
                  </div>
                </div>

                {/* Quiet Console Footer Instruction Row (Hidden in compact Mobile Landscape) */}
                {!isMobileLandscape && (
                  <div className="flex flex-wrap items-center justify-between gap-2 px-1 pt-0.5 text-[11px] opacity-75 shrink-0">
                    <span>
                      支援多點觸控十字鍵／街機鈕與鍵盤同步操作（點擊頂部卡匣插槽可觸發特寫換卡）
                    </span>
                    <span className="font-mono whitespace-nowrap">F1 除錯線框切換</span>
                  </div>
                )}
              </div>
            </section>
          </motion.div>
        )}
      </main>

      {/* Close-up Cartridge Eject / Insert Tray Overlay */}
      {(cameraPhase === 'tray-open' || cameraPhase === 'inserting') && (
        <CartridgeSwapOverlay
          phase={cameraPhase === 'inserting' ? 'inserting' : 'tray-open'}
          activeCartId={selectedPresetId}
          insertingMeta={insertingMeta}
          presets={ENGINE_PRESETS}
          hasCustomMcpCart={Boolean(customMcpProject)}
          hideTopPreview={usingThreeStage}
          onSelectCartridge={handleInsertCartridge}
          onClose={() => setCameraPhase('play')}
        />
      )}

      <OfflineIndicator />
    </div>
  );
}

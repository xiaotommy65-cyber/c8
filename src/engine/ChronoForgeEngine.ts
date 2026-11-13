import { CoroutineScheduler } from './coroutines';
import {
  parseAsepriteToActions,
  parseLDtkLevel,
  parseTiledMap,
  type AsepriteImportOptions,
} from './externalImporters';
import { createFluentDsl } from './fluentDsl';
import {
  computeEngineCRC32,
  getEntityWorldBox,
  getTileAt as queryTileAt,
  isSolidAtPixel as querySolidAtPixel,
  moveEntityWithTilemap,
  VIEW_H,
  VIEW_W,
} from './physicsStepper';
import {
  CELL_SIZE,
  compileActionFromSpec,
  drawAutoTile,
  resolveTheme,
} from './pixelRasterizer';
import { renderEngineScene } from './sceneRenderer';
import {
  buildSceneTreeSnapshot,
  exportStandaloneHtmlBuild,
  generateFluentNodeCodeSnippet,
  type SceneTreeContext,
} from './sceneTreeService';
import { SignalBus } from './signals';
import {
  BUILTIN_THEMES,
  type ActionCompileSpec,
  type AfterimageOpts,
  type AsepriteJson,
  type CompiledAction,
  type EnemyAiProfile,
  type EngineSceneTreeSnapshot,
  type EngineSignalMap,
  type EngineSnapshotStats,
  type EntitySpec,
  type FrameBoxSpec,
  type GamePhase,
  type HairStyle,
  type LDtkJson,
  type PaletteTheme,
  type ParallaxLayerSpec,
  type PickupNode,
  type PickupSpec,
  type PointLightSpec,
  type PortalNode,
  type PortalSpec,
  type RuntimeEntity,
  type SlashArcOpts,
  type StageSpec,
  type StudioBundleInput,
  type TiledJson,
  type TileKind,
  type VFXBurstOpts,
  type WeaponType,
  type ZzfxPresetName,
} from './types';
import { VfxSystem } from './vfxSystem';
import { ZZFX_PRESETS, zzfxBridge, type ZzfxParams } from './zzfxAudio';

export { VIEW_W, VIEW_H };

export interface EngineInputState {
  left: boolean;
  right: boolean;
  jump: boolean;
  slash: boolean;
  dash: boolean;
  restart?: boolean;
  customAction?: string | null;
}

const DEFAULT_HERO_ACTIONS: Record<string, Omit<ActionCompileSpec, 'theme' | 'weapon' | 'hair'>> = {
  idle: {
    fps: 7,
    loop: true,
    keyframes: [
      { ty: 0, cloakWave: 0, legL: { kx: -2, ky: 8, fx: -2.5, fy: 15 }, legR: { kx: 2.5, ky: 8, fx: 3, fy: 15 }, frontArm: { ex: -2, ey: 5, hx: 0, hy: 10 }, backArm: { ex: 3, ey: 5, hx: 5, hy: 9, swordAngle: -35 } },
      { ty: 1.0, cloakWave: 0.8, legL: { kx: -2, ky: 7.2, fx: -2.5, fy: 14 }, legR: { kx: 2.5, ky: 7.2, fx: 3, fy: 14 }, frontArm: { ex: -1.5, ey: 5, hx: 1, hy: 9.5 }, backArm: { ex: 3, ey: 5, hx: 5, hy: 9 } },
      { ty: 0, cloakWave: 0, cloakOpen: true, legL: { kx: -2, ky: 8, fx: -2.5, fy: 15 }, legR: { kx: 2.5, ky: 8, fx: 3, fy: 15 }, frontArm: { ex: 0, ey: 5, hx: 4, hy: 5, swordAngle: -42 }, backArm: { ex: 4, ey: 5, hx: 6, hy: 9 }, face: 'fierce' },
    ],
  },
  run: {
    fps: 12,
    loop: true,
    keyframes: [
      { lean: 3.5, ty: -1, cloakOpen: true, cloakLift: 8, cloakWave: -2, legL: { kx: 6, ky: 5, fx: 9, fy: 13, footAng: -15 }, legR: { kx: -5, ky: 6, fx: -10, fy: 11, footAng: 35 }, frontArm: { ex: -4, ey: 4, hx: -1, hy: 8 }, backArm: { ex: 5, ey: 3, hx: 9, hy: 6 }, face: 'fierce' },
      { lean: 4.0, ty: -2, cloakOpen: true, cloakLift: 11, cloakWave: -4, legL: { kx: 4, ky: 6, fx: 6, fy: 14 }, legR: { kx: -3, ky: 5, fx: -7, fy: 9, footAng: 45 }, frontArm: { ex: -2, ey: 4, hx: 2, hy: 8 }, backArm: { ex: 4, ey: 3, hx: 7, hy: 6 }, face: 'fierce' },
      { lean: 3.5, ty: 0.5, cloakOpen: true, cloakLift: 9, cloakWave: 1, legL: { kx: -3, ky: 7, fx: -6, fy: 13.8 }, legR: { kx: 5, ky: 5, fx: 7, fy: 12, footAng: -15 }, frontArm: { ex: 4, ey: 3, hx: 8, hy: 4 }, backArm: { ex: -3, ey: 4, hx: -5, hy: 8 }, face: 'fierce' },
      { lean: 3.5, ty: -1, cloakOpen: true, cloakLift: 10, cloakWave: -1, legL: { kx: -6, ky: 6, fx: -11, fy: 11, footAng: 40 }, legR: { kx: 7, ky: 5, fx: 10, fy: 13, footAng: -15 }, frontArm: { ex: 5, ey: 2, hx: 9, hy: 3 }, backArm: { ex: -5, ey: 4, hx: -7, hy: 7 }, face: 'fierce' },
    ],
  },
  jump: {
    fps: 8,
    loop: false,
    keyframes: [
      { lean: 2, ty: -3, cloakOpen: true, cloakLift: 12, cloakWave: 3, legL: { kx: 5, ky: 4, fx: 7, fy: 10 }, legR: { kx: -4, ky: 6, fx: -7, fy: 12 }, frontArm: { ex: 2, ey: 2, hx: 6, hy: 1, swordAngle: -65 }, backArm: { ex: -4, ey: 2, hx: -7, hy: 5 }, face: 'fierce' },
    ],
  },
  slash: {
    fps: 15,
    loop: false,
    activeFrames: [2, 3],
    defaultHitbox: { x: 40, y: 18, w: 30, h: 34 },
    keyframes: [
      { lean: -1.5, cloakOpen: true, cloakLift: 6, legL: { kx: -4, ky: 8, fx: -6, fy: 15 }, legR: { kx: 5, ky: 7, fx: 8, fy: 15 }, frontArm: { ex: 4, ey: 0, hx: 9, hy: -2, swordAngle: -85 }, backArm: { ex: -3, ey: 4, hx: -6, hy: 7 }, face: 'fierce' },
      { lean: 3.5, tx: 2, ty: 0.5, cloakOpen: true, cloakLift: 10, legL: { kx: -5, ky: 7, fx: -9, fy: 14 }, legR: { kx: 6, ky: 6, fx: 9, fy: 14 }, frontArm: { ex: 4, ey: 2, hx: 9, hy: 2, swordAngle: -35 }, backArm: { ex: -4, ey: 3, hx: -7, hy: 6 }, face: 'fierce' },
      { lean: 5.0, tx: 3, ty: 0.5, cloakOpen: true, cloakLift: 13, cloakWave: -4, legL: { kx: -6, ky: 7, fx: -10, fy: 14.5 }, legR: { kx: 7, ky: 6, fx: 10, fy: 14.5 }, frontArm: { ex: 5, ey: 2, hx: 11, hy: 3, swordAngle: -18, slashFX: true }, backArm: { ex: -5, ey: 3, hx: -8, hy: 5 }, face: 'fierce' },
      { lean: 4.0, tx: 2, ty: 1, cloakOpen: true, cloakLift: 11, cloakWave: -2, legL: { kx: -6, ky: 7, fx: -10, fy: 14 }, legR: { kx: 7, ky: 6, fx: 10, fy: 14 }, frontArm: { ex: 4, ey: 4, hx: 9, hy: 6, swordAngle: 15, slashFX: true }, backArm: { ex: -4, ey: 3, hx: -7, hy: 6 }, face: 'fierce' },
      { lean: 2.0, tx: 1, cloakOpen: true, cloakLift: 7, legL: { kx: -4, ky: 8, fx: -7, fy: 15 }, legR: { kx: 5, ky: 7, fx: 8, fy: 15 }, frontArm: { ex: 3, ey: 4, hx: 8, hy: 5, swordAngle: -40 }, backArm: { ex: -2, ey: 4, hx: -4, hy: 8 }, face: 'fierce' },
    ],
  },
  hurt: {
    fps: 10,
    loop: false,
    keyframes: [
      { lean: -3, rot: -18, tx: -2, ty: 1, cloakOpen: true, cloakLift: 5, legL: { kx: -3, ky: 8, fx: -4, fy: 15 }, legR: { kx: 4, ky: 7, fx: 7, fy: 14 }, frontArm: { ex: -6, ey: -2, hx: -9, hy: -7 }, backArm: { ex: 5, ey: 3, hx: 8, hy: 7 }, face: 'hurt' },
      { rot: 78, tx: -4, ty: 15, cloakOpen: true, cloakLift: 2, legL: { kx: -3, ky: 6, fx: -6, fy: 13 }, legR: { kx: 2, ky: 5, fx: -2, fy: 12 }, frontArm: { ex: 2, ey: 4, hx: 4, hy: 8 }, face: 'hurt' },
      { rot: 88, tx: -3, ty: 17, cloakOpen: true, cloakLift: 0, legL: { kx: -1, ky: 7, fx: -3, fy: 14 }, legR: { kx: 1, ky: 7, fx: 0, fy: 14 }, frontArm: { ex: 1, ey: 5, hx: 2, hy: 9 }, face: 'ko' },
    ],
  },
};

export class ChronoForgeEngine {
  public tick = 0;
  public paused = false;
  public prngState = 0xcafe2026;
  public hitstopTicks = 0;
  public score = 0;
  public combo = 0;
  public comboTimer = 0;
  public compileMs = 0;
  public crc32 = 0;

  public readonly signals = new SignalBus<EngineSignalMap>();
  public readonly flow: CoroutineScheduler;
  private readonly vfxSystem: VfxSystem;
  public readonly dsl: ReturnType<typeof createFluentDsl>;

  private compiledActions = new Map<string, CompiledAction>();
  private entityList: RuntimeEntity[] = [];
  private parallaxLayers: ParallaxLayerSpec[] = [];
  private tileSize = 16;
  private tileGrid: TileKind[][] = [];
  private tileRows = 0;
  private tileCols = 0;
  private tileMapCanvas: HTMLCanvasElement | null = null;
  private torchPositions: Array<{ x: number; y: number }> = [];

  private ambientDarkness = 0.25;
  private skyTopColor = '#0c0b16';
  private skyBottomColor = '#1c182e';
  private pointLights: PointLightSpec[] = [];
  private lightCanvas: HTMLCanvasElement;
  private lightCtx: CanvasRenderingContext2D;

  private camX = 0;
  private camY = 0;
  private camFollowId: string | null = null;
  private camLerp = 0.14;
  private camTrauma = 0;

  private activeTheme: PaletteTheme | keyof typeof BUILTIN_THEMES = 'emerald';
  private activeWeapon: WeaponType = 'broadsword';
  private activeHair: HairStyle = 'ranger';
  private autoCombatAudio = true;

  private updateCallbacks: Array<(dtTick: number, engine: ChronoForgeEngine) => void> = [];
  private hitCallbacks: Array<(attacker: RuntimeEntity, target: RuntimeEntity, dmg: number) => void> = [];

  private prevJump = false;
  private prevSlash = false;
  private prevDash = false;
  private prevRestart = false;

  private gamePhase: GamePhase = 'playing';
  private outcomeLoopEnabled = false;
  private endBannerTitle = '';
  private endBannerSubtitle = '';
  private currentStageId = 'stage_1';
  private currentStageTitle = 'STAGE 1';
  private stageBannerTicks = 0;
  private stageRegistry = new Map<string, StageSpec>();
  private entryStageId: string | null = null;
  private entrySpawnX: number | undefined = undefined;
  private entrySpawnY: number | undefined = undefined;
  private portals: PortalNode[] = [];
  private pickups: PickupNode[] = [];
  private inventoryKeys = new Set<string>();
  private defeatedCount = 0;
  private playTimeTicks = 0;
  private lastLockedHintTick = -999;

  constructor() {
    this.lightCanvas = document.createElement('canvas');
    this.lightCanvas.width = VIEW_W;
    this.lightCanvas.height = VIEW_H;
    this.lightCtx = this.lightCanvas.getContext('2d')!;

    this.vfxSystem = new VfxSystem(() => this.rand());
    this.flow = new CoroutineScheduler((err, label) => {
      this.vfxSystem.popup(48, 28, `ERR[${label}]: ${err.message.slice(0, 28)}`, '#f87171');
    });

    this.compileDefaultHero();
    this.dsl = createFluentDsl(this);
  }

  private rand(): number {
    let x = this.prngState >>> 0;
    if (x === 0) x = 0xcafe2026;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.prngState = x >>> 0;
    return this.prngState / 4294967296;
  }

  public compileDefaultHero(opts?: {
    theme?: PaletteTheme | keyof typeof BUILTIN_THEMES;
    weapon?: WeaponType;
    hair?: HairStyle;
  }) {
    if (opts?.theme) this.activeTheme = opts.theme;
    if (opts?.weapon) this.activeWeapon = opts.weapon;
    if (opts?.hair) this.activeHair = opts.hair;

    for (const [name, spec] of Object.entries(DEFAULT_HERO_ACTIONS)) {
      this.actions.compile(name, {
        ...spec,
        theme: this.activeTheme,
        weapon: this.activeWeapon,
        hair: this.activeHair,
      });
    }
  }

  // ---- Pure-Code SDK Namespaces ----

  public readonly actions = {
    compile: (name: string, spec: ActionCompileSpec): CompiledAction => {
      const compiled = compileActionFromSpec(name, {
        theme: spec.theme ?? this.activeTheme,
        weapon: spec.weapon ?? this.activeWeapon,
        hair: spec.hair ?? this.activeHair,
        ...spec,
      });
      this.compiledActions.set(name, compiled);
      return compiled;
    },

    get: (name: string) => this.compiledActions.get(name),
    list: () => [...this.compiledActions.keys()],

    importBundle: async (bundle: StudioBundleInput) => {
      if (bundle.appearance?.weapon) this.activeWeapon = bundle.appearance.weapon;
      if (bundle.appearance?.hairStyle) this.activeHair = bundle.appearance.hairStyle;

      if (bundle.atlasDataUrl) {
        await new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => {
            const animKeys = ['idle', 'run', 'slash', 'hurt'];
            animKeys.forEach((key, rowIdx) => {
              const animSpec = bundle.animations?.[key];
              const frameCount = animSpec?.frames?.length ?? Math.max(1, Math.floor(img.width / CELL_SIZE));
              const frames: HTMLCanvasElement[] = [];
              const boxes: FrameBoxSpec[] = [];
              for (let c = 0; c < frameCount; c++) {
                const cvs = document.createElement('canvas');
                cvs.width = CELL_SIZE;
                cvs.height = CELL_SIZE;
                const ctx = cvs.getContext('2d')!;
                ctx.drawImage(img, c * CELL_SIZE, rowIdx * CELL_SIZE, CELL_SIZE, CELL_SIZE, 0, 0, CELL_SIZE, CELL_SIZE);
                frames.push(cvs);
                const fSpec = animSpec?.frames?.[c];
                const b = fSpec?.boxes ?? (fSpec?.hurt && fSpec?.hit ? { hurt: fSpec.hurt, hit: fSpec.hit } : null);
                boxes.push(
                  b ?? {
                    hurt: { x: 25, y: 14, w: 22, h: 48 },
                    hit: { x: 40, y: 20, w: 28, h: 32, active: key === 'slash' && (c === 3 || c === 4) },
                  },
                );
              }
              this.compiledActions.set(key, {
                name: key,
                fps: key === 'slash' ? 14 : 9,
                loop: key !== 'slash' && key !== 'hurt',
                frames,
                boxes,
              });
            });
            resolve();
          };
          img.onerror = () => resolve();
          img.src = bundle.atlasDataUrl!;
        });
      } else if (bundle.animations) {
        for (const [key, animSpec] of Object.entries(bundle.animations)) {
          if (!animSpec.frames?.length) continue;
          const keyframes = animSpec.frames.map((f) => ({
            ...(f.pose ?? {}),
            hurtbox: f.boxes?.hurt ?? f.hurt,
            hitbox: f.boxes?.hit ?? f.hit,
          }));
          this.actions.compile(key, {
            keyframes,
            fps: key === 'slash' ? 14 : 9,
            loop: key !== 'slash' && key !== 'hurt',
          });
        }
      }
    },
  };

  public readonly audio = {
    zzfx: (...params: ZzfxParams) => zzfxBridge.playRaw(params),
    playPreset: (name: ZzfxPresetName) => zzfxBridge.playPreset(name),
    presets: ZZFX_PRESETS,
    setMuted: (muted: boolean) => zzfxBridge.setMuted(muted),
    isMuted: () => zzfxBridge.isMuted(),
    setVolume: (vol: number) => zzfxBridge.setVolume(vol),
    setAutoCombatAudio: (enabled: boolean) => {
      this.autoCombatAudio = enabled;
    },
    unlock: () => zzfxBridge.unlock(),
  };

  public readonly assets = {
    loadAseprite: async (
      asepriteJson: AsepriteJson,
      imageSource?: string | HTMLImageElement | HTMLCanvasElement | null,
      options?: AsepriteImportOptions,
    ): Promise<{ actionsLoaded: string[]; frameCount: number }> => {
      let resolvedImg: HTMLImageElement | HTMLCanvasElement | null = null;
      if (imageSource instanceof HTMLImageElement || imageSource instanceof HTMLCanvasElement) {
        resolvedImg = imageSource;
      } else if (typeof imageSource === 'string' && imageSource.trim()) {
        resolvedImg = await new Promise<HTMLImageElement | null>((resolve) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => resolve(img);
          img.onerror = () => resolve(null);
          img.src = imageSource;
        });
      }

      const compiled = parseAsepriteToActions(asepriteJson, resolvedImg, options);
      let frameCount = 0;
      for (const act of compiled) {
        this.compiledActions.set(act.name, act);
        frameCount += act.frames.length;
      }
      return { actionsLoaded: compiled.map((a) => a.name), frameCount };
    },
    get: (name: string) => this.compiledActions.get(name),
    list: () => [...this.compiledActions.keys()],
  };

  private bakeTileGrid(grid: TileKind[][], tileSize: number) {
    this.tileSize = tileSize;
    this.tileRows = grid.length;
    this.tileCols = grid.reduce((m, row) => Math.max(m, row.length), 0);
    this.tileGrid = grid;
    this.torchPositions = [];
    // Clear prior auto-baked torch lights before rebuilding tilemap torches
    this.pointLights = this.pointLights.filter((l) => !(l.id ?? '').startsWith('torch_'));

    for (let r = 0; r < this.tileRows; r++) {
      for (let c = 0; c < this.tileCols; c++) {
        if (grid[r][c] === 'torch') {
          this.torchPositions.push({
            x: c * tileSize + Math.floor(tileSize / 2),
            y: r * tileSize + Math.floor(tileSize / 2),
          });
          this.lights.addPointLight({
            id: `torch_${r}_${c}`,
            x: c * tileSize + Math.floor(tileSize / 2),
            y: r * tileSize + 4,
            radius: 86,
            color: '#ff9d3b',
            intensity: 0.92,
            flicker: 0.16,
          });
        }
      }
    }

    const mapCvs = document.createElement('canvas');
    mapCvs.width = Math.max(VIEW_W, this.tileCols * tileSize);
    mapCvs.height = Math.max(VIEW_H, this.tileRows * tileSize);
    const mCtx = mapCvs.getContext('2d')!;
    const isSolidType = (k: TileKind) => k === 'stone' || k === 'moss' || k === 'brick';

    for (let r = 0; r < this.tileRows; r++) {
      for (let c = 0; c < this.tileCols; c++) {
        const kind = this.tileGrid[r]?.[c] ?? 'empty';
        if (kind === 'empty' || kind === 'torch') continue;
        const topOpen = r === 0 || !isSolidType(this.tileGrid[r - 1]?.[c] ?? 'empty');
        const bottomOpen = r === this.tileRows - 1 || !isSolidType(this.tileGrid[r + 1]?.[c] ?? 'empty');
        const leftOpen = c === 0 || !isSolidType(this.tileGrid[r]?.[c - 1] ?? 'empty');
        const rightOpen = c === this.tileCols - 1 || !isSolidType(this.tileGrid[r]?.[c + 1] ?? 'empty');
        drawAutoTile(mCtx, kind, c * tileSize, r * tileSize, tileSize, topOpen, bottomOpen, leftOpen, rightOpen);
      }
    }
    this.tileMapCanvas = mapCvs;
  }

  private spawnExternalWorldEntity(
    identifier: string,
    x: number,
    y: number,
    fields: Record<string, unknown> = {},
  ) {
    const idLower = identifier.toLowerCase();
    if (idLower.includes('player') || idLower.includes('hero') || idLower.includes('spawn')) {
      const existing = this.entities.get('player');
      if (existing) {
        existing.x = x;
        existing.y = y;
      } else {
        this.entities.spawn({ id: 'player', kind: 'player', x, y, hp: Number(fields.hp ?? 100) });
      }
    } else if (idLower.includes('dummy') || idLower.includes('target')) {
      this.entities.spawn({ id: `dummy_${this.entityList.length + 1}`, kind: 'dummy', x, y, hp: Number(fields.hp ?? 300) });
    } else if (idLower.includes('enemy') || idLower.includes('slime') || idLower.includes('mob') || idLower.includes('goblin')) {
      this.entities.spawn({
        id: `enemy_${this.entityList.length + 1}`,
        kind: 'enemy',
        x,
        y,
        hp: Number(fields.hp ?? 90),
        patrolRange: Number(fields.patrolRange ?? 56),
      });
    } else if (idLower.includes('light') || idLower.includes('torch') || idLower.includes('lamp')) {
      this.lights.addPointLight({
        x,
        y,
        radius: Number(fields.radius ?? 90),
        color: typeof fields.color === 'string' ? fields.color : '#ff9d3b',
        intensity: Number(fields.intensity ?? 0.92),
        flicker: Number(fields.flicker ?? 0.14),
      });
    }
  }

  public readonly scene = {
    clearWorld: (opts: { keepPlayer?: boolean; clearCoroutines?: boolean } = {}) => {
      const keepPlayer = opts.keepPlayer === true;
      const existingPlayer = keepPlayer ? this.entityList.find((e) => e.kind === 'player') : undefined;
      this.entityList = existingPlayer ? [existingPlayer] : [];
      this.pointLights = existingPlayer
        ? this.pointLights.filter((l) => l.attachTo === existingPlayer.id)
        : [];
      this.parallaxLayers = [];
      this.torchPositions = [];
      this.portals = [];
      this.pickups = [];
      this.tileGrid = [];
      this.tileRows = 0;
      this.tileCols = 0;
      this.tileMapCanvas = null;
      this.vfxSystem.clear();
      if (opts.clearCoroutines !== false) {
        this.flow.clear();
      }
    },
    setSky: (topColor: string, bottomColor: string) => {
      this.skyTopColor = topColor;
      this.skyBottomColor = bottomColor;
    },
    setAmbientLight: (darknessAlpha: number) => {
      this.ambientDarkness = Math.max(0, Math.min(0.92, darknessAlpha));
    },
    addParallaxLayer: (spec: ParallaxLayerSpec) => {
      this.parallaxLayers.push(spec);
    },
    compileTilemap: (asciiRows: string[], legend: Record<string, TileKind>, tileSize = 16) => {
      const rows = asciiRows.length;
      const cols = Math.max(...asciiRows.map((r) => r.length), 0);
      const grid: TileKind[][] = [];
      for (let r = 0; r < rows; r++) {
        const row: TileKind[] = [];
        const str = asciiRows[r];
        for (let c = 0; c < cols; c++) {
          row.push(legend[str[c] ?? '.'] ?? 'empty');
        }
        grid.push(row);
      }
      this.bakeTileGrid(grid, tileSize);
    },
    loadLDtk: (
      ldtkJson: LDtkJson,
      options: {
        levelIndex?: number;
        levelId?: string;
        intGridMapping?: Record<number, TileKind>;
        spawnEntities?: boolean;
        onEntity?: (ent: { identifier: string; x: number; y: number; fields: Record<string, unknown> }) => void;
      } = {},
    ) => {
      const parsed = parseLDtkLevel(ldtkJson, options);
      this.bakeTileGrid(parsed.grid, parsed.tileSize);
      if (options.spawnEntities !== false) {
        for (const ent of parsed.entities) {
          this.spawnExternalWorldEntity(ent.identifier, ent.x, ent.y, ent.fields);
          options.onEntity?.(ent);
        }
      }
      return parsed;
    },
    loadTiled: (
      tiledJson: TiledJson,
      options: {
        gidLegend?: Record<number, TileKind>;
        spawnObjects?: boolean;
        onObject?: (obj: { name: string; type: string; x: number; y: number; properties: Record<string, unknown> }) => void;
      } = {},
    ) => {
      const parsed = parseTiledMap(tiledJson, options);
      this.bakeTileGrid(parsed.grid, parsed.tileSize);
      if (options.spawnObjects !== false) {
        for (const obj of parsed.objects) {
          this.spawnExternalWorldEntity(obj.type || obj.name, obj.x, obj.y, obj.properties);
          options.onObject?.(obj);
        }
      }
      return parsed;
    },
  };

  public readonly stages = {
    define: (id: string, title: string, setup: () => void, subtitle?: string) => {
      this.stageRegistry.set(id, { id, title, subtitle, setup });
      if (!this.entryStageId) this.entryStageId = id;
    },
    enter: (
      id: string,
      opts: { keepPlayerHp?: boolean; spawnX?: number; spawnY?: number } = {},
    ) => {
      const spec = this.stageRegistry.get(id);
      if (!spec) return false;
      if (id === this.entryStageId) {
        if (typeof opts.spawnX === 'number') this.entrySpawnX = opts.spawnX;
        if (typeof opts.spawnY === 'number') this.entrySpawnY = opts.spawnY;
      }
      this.scene.clearWorld({ keepPlayer: true, clearCoroutines: true });
      this.currentStageId = id;
      this.currentStageTitle = spec.title;
      this.stageBannerTicks = 135;
      spec.setup();

      const player = this.entityList.find((e) => e.kind === 'player');
      if (player) {
        if (opts.keepPlayerHp === false) {
          player.hp = player.maxHp;
          player.defeated = false;
          player.invulnTicks = 0;
          player.flashTicks = 0;
        }
        if (typeof opts.spawnX === 'number') player.x = opts.spawnX;
        if (typeof opts.spawnY === 'number') player.y = opts.spawnY;
        player.vx = 0;
        player.vy = 0;
        player.dashTicks = 0;
        player.state = 'idle';
        player.frameIdx = 0;
        player.animTick = 0;
        this.camX = Math.max(0, player.x - VIEW_W / 2);
      }

      this.signals.emit('stage:enter', { stageId: id, stageTitle: spec.title });
      return true;
    },
    current: () => ({ id: this.currentStageId, title: this.currentStageTitle }),
    list: () => [...this.stageRegistry.keys()],
  };

  public readonly worldPortals = {
    add: (spec: PortalSpec): PortalNode => {
      const id = spec.id ?? `portal_${this.portals.length + 1}`;
      const node: PortalNode = {
        id,
        x: spec.x,
        y: spec.y,
        w: spec.w ?? 26,
        h: spec.h ?? 40,
        targetStage: spec.targetStage,
        spawnX: spec.spawnX ?? 64,
        spawnY: spec.spawnY ?? 192,
        unlock: spec.unlock ?? 'always',
        requiredKey: spec.requiredKey,
        color: spec.color ?? '#34d399',
        label: spec.label,
      };
      const idx = this.portals.findIndex((p) => p.id === id);
      if (idx >= 0) this.portals[idx] = node;
      else this.portals.push(node);
      return node;
    },
    list: () => this.portals,
    clear: () => {
      this.portals = [];
    },
    isUnlocked: (portal: PortalNode): boolean => {
      if (portal.unlock === 'always') return true;
      if (portal.unlock === 'require_key') {
        return portal.requiredKey
          ? this.inventoryKeys.has(portal.requiredKey)
          : this.inventoryKeys.size > 0;
      }
      if (portal.unlock === 'all_enemies') {
        return !this.entityList.some((e) => e.kind === 'enemy' && !e.defeated);
      }
      return true;
    },
  };

  public readonly worldPickups = {
    add: (spec: PickupSpec): PickupNode => {
      const id = spec.id ?? `pickup_${this.pickups.length + 1}`;
      const node: PickupNode = {
        id,
        kind: spec.kind,
        x: spec.x,
        y: spec.y,
        keyName: spec.keyName ?? (spec.kind === 'key' ? id : undefined),
        value: spec.value ?? (spec.kind === 'heal' ? 40 : spec.kind === 'relic' ? 250 : 100),
        color:
          spec.color ??
          (spec.kind === 'key' ? '#fbbf24' : spec.kind === 'heal' ? '#4ade80' : '#38bdf8'),
        collected: false,
        label: spec.label,
      };
      const idx = this.pickups.findIndex((p) => p.id === id);
      if (idx >= 0) this.pickups[idx] = node;
      else this.pickups.push(node);
      return node;
    },
    list: () => this.pickups,
    clear: () => {
      this.pickups = [];
    },
  };

  public readonly game = (() => {
    const engine = this;
    return {
      get phase(): GamePhase {
        return engine.gamePhase;
      },
      enableOutcomeLoop: (enabled = true) => {
        engine.outcomeLoopEnabled = enabled;
      },
      hasKey: (keyName: string) => engine.inventoryKeys.has(keyName),
    victory: (title = 'VICTORY', subtitle = '所有挑戰與魔王已突破 · 按 R 重新開始') => {
      if (this.gamePhase === 'victory') return;
      this.gamePhase = 'victory';
      this.endBannerTitle = title;
      this.endBannerSubtitle = subtitle;
      if (this.autoCombatAudio) {
        this.audio.playPreset('powerup');
        this.audio.playPreset('coin');
      }
      const p = this.entityList.find((e) => e.kind === 'player');
      if (p) {
        this.vfx.burst(p.x, p.y - 28, {
          count: 28,
          color: '#4ade80',
          colorB: '#ffe36e',
          speed: 4.2,
          bounce: true,
          life: 44,
        });
      }
      this.signals.emit('game:phase', { phase: 'victory', title, subtitle });
    },
    gameover: (title = 'GAME OVER', subtitle = '勇者生命歸零 · 按 R 立即重新挑戰') => {
      if (this.gamePhase === 'gameover') return;
      this.gamePhase = 'gameover';
      this.endBannerTitle = title;
      this.endBannerSubtitle = subtitle;
      if (this.autoCombatAudio) {
        this.audio.playPreset('explosion');
      }
      this.signals.emit('game:phase', { phase: 'gameover', title, subtitle });
    },
    restart: () => {
      this.gamePhase = 'playing';
      this.endBannerTitle = '';
      this.endBannerSubtitle = '';
      this.score = 0;
      this.combo = 0;
      this.comboTimer = 0;
      this.defeatedCount = 0;
      this.playTimeTicks = 0;
      this.hitstopTicks = 0;
      this.inventoryKeys.clear();
      this.lastLockedHintTick = -999;

      if (this.entryStageId && this.stageRegistry.has(this.entryStageId)) {
        this.stages.enter(this.entryStageId, {
          keepPlayerHp: false,
          spawnX: this.entrySpawnX,
          spawnY: this.entrySpawnY,
        });
      } else {
        for (const ent of this.entityList) {
          ent.hp = ent.maxHp;
          ent.defeated = false;
          ent.invulnTicks = 0;
          ent.vx = 0;
          ent.vy = 0;
          ent.x = ent.patrolOriginX;
          ent.state = 'idle';
          ent.bossPhase = 1;
        }
        for (const pk of this.pickups) {
          pk.collected = false;
        }
      }
      engine.signals.emit('game:phase', { phase: 'playing', title: engine.currentStageTitle });
    },
  };
  })();

  public readonly lights = {
    addPointLight: (spec: PointLightSpec): string => {
      const id = spec.id ?? `light_${this.pointLights.length + 1}`;
      const idx = this.pointLights.findIndex((l) => l.id === id);
      const item: PointLightSpec = { intensity: 0.9, flicker: 0.05, ...spec, id };
      if (idx >= 0) this.pointLights[idx] = item;
      else this.pointLights.push(item);
      return id;
    },
    updateLight: (id: string, patch: Partial<PointLightSpec>) => {
      const l = this.pointLights.find((item) => item.id === id);
      if (l) Object.assign(l, patch);
    },
    list: () => this.pointLights,
  };

  public readonly entities = {
    spawn: (spec: EntitySpec): RuntimeEntity => {
      const id = spec.id ?? `${spec.kind}_${this.entityList.length + 1}`;
      const aiProfile: EnemyAiProfile =
        spec.aiProfile ?? (spec.isBoss ? 'boss_warden' : 'wander');
      const ent: RuntimeEntity = {
        id,
        kind: spec.kind,
        x: spec.x,
        y: spec.y,
        vx: 0,
        vy: 0,
        facing: spec.facing ?? (spec.kind === 'player' ? 1 : -1),
        grounded: false,
        coyoteTicks: 0,
        hp: spec.hp ?? (spec.kind === 'dummy' ? 300 : spec.kind === 'enemy' ? 90 : 100),
        maxHp: spec.maxHp ?? spec.hp ?? (spec.kind === 'dummy' ? 300 : spec.kind === 'enemy' ? 90 : 100),
        state: 'idle',
        frameIdx: 0,
        animTick: 0,
        invulnTicks: 0,
        flashTicks: 0,
        dashTicks: 0,
        attackDidHit: false,
        patrolOriginX: spec.x,
        patrolRange: spec.patrolRange ?? 56,
        moveSpeed: spec.speed ?? (spec.kind === 'player' ? 2.6 : 0.95),
        tintTheme: typeof spec.theme === 'string' ? spec.theme : undefined,
        aiProfile,
        aiState: 'patrol',
        aiTimer: 0,
        aiCooldown: 0,
        aiTargetDir: spec.facing ?? -1,
        aiAttackIdx: 0,
        aggroRange: spec.aggroRange ?? (spec.isBoss ? 360 : 140),
        attackRange: spec.attackRange ?? (spec.isBoss ? 128 : aiProfile === 'charger' ? 110 : 42),
        respawn: spec.respawn ?? true,
        defeated: false,
        isBoss: Boolean(spec.isBoss || aiProfile === 'boss_warden'),
        bossPhase: 1,
        label: spec.label,
        contactDamage: spec.contactDamage ?? (spec.isBoss ? 18 : 15),
        scale: spec.scale ?? (spec.isBoss ? 1.45 : 1),
      };
      this.entityList.push(ent);
      this.signals.emit('entity:spawn', { entity: ent });
      return ent;
    },
    get: (id: string) => this.entityList.find((e) => e.id === id),
    list: () => this.entityList,
  };

  public readonly vfx = {
    burst: (x: number, y: number, opts: VFXBurstOpts = {}) => this.vfxSystem.burst(x, y, opts),
    slashArc: (x: number, y: number, facing: 1 | -1, opts: SlashArcOpts = {}) =>
      this.vfxSystem.slashArc(x, y, facing, opts),
    afterimage: (entityId: string, opts: AfterimageOpts = {}) => {
      const ent = this.entities.get(entityId);
      if (!ent) return;
      const act = this.compiledActions.get(ent.state) ?? this.compiledActions.get('idle');
      if (!act || !act.frames.length) return;
      this.vfxSystem.addAfterimage(ent.x, ent.y, ent.facing, act.frames[ent.frameIdx % act.frames.length], opts);
    },
    popup: (x: number, y: number, text: string, color = '#ffe36e') =>
      this.vfxSystem.popup(x, y, text, color),
  };

  public readonly camera = {
    follow: (entityId: string, lerp = 0.14) => {
      this.camFollowId = entityId;
      this.camLerp = lerp;
    },
    addTrauma: (amount: number) => {
      this.camTrauma = Math.min(1, this.camTrauma + amount);
    },
  };

  public setTheme(themeKey: PaletteTheme | keyof typeof BUILTIN_THEMES, weapon?: WeaponType, hair?: HairStyle) {
    this.compileDefaultHero({ theme: themeKey, weapon, hair });
  }

  public triggerHitstop(ticks: number) {
    this.hitstopTicks = Math.max(this.hitstopTicks, ticks);
  }

  public onUpdate(cb: (tick: number, engine: ChronoForgeEngine) => void) {
    this.updateCallbacks.push(cb);
  }

  public onHit(cb: (attacker: RuntimeEntity, target: RuntimeEntity, dmg: number) => void) {
    this.hitCallbacks.push(cb);
  }

  public triggerAction(entityId: string, actionName: string) {
    const ent = this.entities.get(entityId);
    if (!ent || !this.compiledActions.has(actionName)) return;
    ent.state = actionName;
    ent.frameIdx = 0;
    ent.animTick = 0;
    ent.attackDidHit = false;
    this.signals.emit('action:trigger', { entity: ent, action: actionName });
  }

  private stepEnemyAi(ent: RuntimeEntity, player: RuntimeEntity | undefined) {
    if (ent.invulnTicks > 0) ent.invulnTicks--;
    if (ent.flashTicks > 0) ent.flashTicks--;
    if (ent.aiCooldown > 0) ent.aiCooldown--;

    if (ent.state === 'hurt') {
      ent.vx *= 0.82;
      return;
    }

    if (ent.aiProfile === 'wander' || !player) {
      ent.vx = ent.facing * ent.moveSpeed;
      if (ent.x > ent.patrolOriginX + ent.patrolRange) ent.facing = -1;
      if (ent.x < ent.patrolOriginX - ent.patrolRange) ent.facing = 1;
      if (ent.state !== 'run') ent.state = 'run';
      return;
    }

    // Boss Phase 2 enrage transition at <= 50% HP
    if (ent.isBoss && ent.bossPhase === 1 && ent.hp <= ent.maxHp * 0.5) {
      ent.bossPhase = 2;
      ent.moveSpeed = Number((ent.moveSpeed * 1.28).toFixed(2));
      this.camera.addTrauma(0.65);
      if (this.autoCombatAudio) this.audio.playPreset('powerup');
      this.vfx.popup(ent.x - 30, ent.y - 84, 'PHASE 2: ENRAGED!', '#f97316');
      this.vfx.burst(ent.x, ent.y - 36, {
        count: 24,
        color: '#f97316',
        colorB: '#ef4444',
        speed: 4.0,
        bounce: true,
        life: 36,
      });
      this.signals.emit('boss:phase', { boss: ent, phase: 2 });
    }

    const dx = player.x - ent.x;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(player.y - ent.y);
    const dirToPlayer: 1 | -1 = dx >= 0 ? 1 : -1;

    if (ent.aiState === 'patrol') {
      ent.vx = ent.facing * ent.moveSpeed * 0.85;
      if (ent.x > ent.patrolOriginX + ent.patrolRange) ent.facing = -1;
      if (ent.x < ent.patrolOriginX - ent.patrolRange) ent.facing = 1;
      if (ent.state !== 'run') ent.state = 'run';
      if (absDx <= ent.aggroRange && absDy <= 96) {
        ent.aiState = 'chase';
      }
      return;
    }

    if (ent.aiState === 'chase') {
      ent.facing = dirToPlayer;
      const chaseMul = ent.isBoss ? (ent.bossPhase === 2 ? 1.3 : 1.05) : 1.15;
      ent.vx = absDx > 24 ? dirToPlayer * ent.moveSpeed * chaseMul : 0;
      if (ent.state !== (Math.abs(ent.vx) > 0.2 ? 'run' : 'idle')) {
        ent.state = Math.abs(ent.vx) > 0.2 ? 'run' : 'idle';
      }

      if (absDx <= ent.attackRange && absDy <= 72 && ent.aiCooldown === 0) {
        ent.aiState = 'telegraph';
        ent.aiTargetDir = dirToPlayer;
        ent.aiTimer = ent.isBoss ? (ent.bossPhase === 2 ? 18 : 26) : ent.aiProfile === 'charger' ? 24 : 18;
        ent.vx = 0;
        ent.state = 'idle';
      } else if (!ent.isBoss && absDx > ent.aggroRange * 1.45) {
        ent.aiState = 'patrol';
      }
      return;
    }

    if (ent.aiState === 'telegraph') {
      ent.facing = ent.aiTargetDir;
      ent.vx = 0;
      ent.state = 'idle';
      ent.aiTimer--;
      if (ent.aiTimer <= 0) {
        ent.aiAttackIdx++;
        if (ent.isBoss && (absDx < 64 || ent.aiAttackIdx % 2 === 0)) {
          ent.aiState = 'slam';
          ent.aiTimer = 0;
          ent.vy = ent.bossPhase === 2 ? -5.8 : -5.2;
          ent.vx = ent.aiTargetDir * 2.2;
          ent.grounded = false;
          ent.state = 'jump';
        } else {
          ent.aiState = 'lunge';
          ent.aiTimer = ent.isBoss ? 18 : ent.aiProfile === 'charger' ? 18 : 12;
          ent.state = 'slash';
          ent.frameIdx = 0;
          ent.animTick = 0;
          if (this.autoCombatAudio) this.audio.playPreset('dash');
        }
      }
      return;
    }

    if (ent.aiState === 'lunge') {
      ent.facing = ent.aiTargetDir;
      const lungeSpeed = ent.isBoss
        ? ent.bossPhase === 2
          ? 5.2
          : 4.1
        : ent.aiProfile === 'charger'
          ? 4.4
          : 3.1;
      ent.vx = ent.aiTargetDir * lungeSpeed;
      if (ent.aiTimer % 3 === 0) {
        this.vfx.afterimage(ent.id, {
          color: ent.isBoss ? '#ef4444' : '#f97316',
          life: 10,
          alpha: 0.45,
        });
      }
      ent.aiTimer--;
      if (ent.aiTimer <= 0) {
        ent.aiState = 'recover';
        ent.aiTimer = ent.isBoss ? (ent.bossPhase === 2 ? 18 : 28) : 22;
        ent.aiCooldown = ent.isBoss ? (ent.bossPhase === 2 ? 22 : 34) : 42;
      }
      return;
    }

    if (ent.aiState === 'slam') {
      ent.aiTimer++;
      ent.facing = ent.aiTargetDir;
      if (ent.grounded && ent.aiTimer > 6) {
        // Shockwave on landing!
        this.camera.addTrauma(0.5);
        if (this.autoCombatAudio) this.audio.playPreset('explosion');
        this.vfx.burst(ent.x, ent.y - 4, {
          count: 18,
          color: '#f97316',
          colorB: '#ffe36e',
          speed: 3.5,
          angleDeg: -90,
          spread: 150,
          bounce: true,
        });
        if (
          player.invulnTicks === 0 &&
          player.state !== 'hurt' &&
          Math.abs(player.x - ent.x) <= 56 &&
          Math.abs(player.y - ent.y) <= 24
        ) {
          this.damagePlayer(player, ent.contactDamage, ent.x, `${ent.id}:slam`);
        }
        ent.aiState = 'recover';
        ent.aiTimer = ent.bossPhase === 2 ? 20 : 30;
        ent.aiCooldown = ent.bossPhase === 2 ? 24 : 38;
        ent.vx = 0;
      }
      return;
    }

    // recover
    ent.vx *= 0.8;
    ent.state = 'idle';
    ent.aiTimer--;
    if (ent.aiTimer <= 0) {
      ent.aiState = 'chase';
    }
  }

  private damagePlayer(
    player: RuntimeEntity,
    dmg: number,
    sourceX: number,
    sourceId: string,
  ) {
    player.invulnTicks = 48;
    player.flashTicks = 8;
    player.hp = Math.max(0, player.hp - dmg);
    player.vx = (player.x < sourceX ? -1 : 1) * 3.2;
    player.vy = -3.4;
    this.combo = 0;
    this.triggerAction(player.id, 'hurt');
    this.triggerHitstop(3);
    this.camera.addTrauma(0.5);
    if (this.autoCombatAudio) this.audio.playPreset('hurt');
    this.vfx.burst(player.x, player.y - 22, { count: 10, color: '#f87171', colorB: '#ffe36e' });
    this.vfx.popup(player.x - 8, player.y - 44, `-${dmg}`, '#f87171');
    this.signals.emit('entity:hurt', { entity: player, damage: dmg, source: sourceId });

    if (player.hp === 0) {
      if (!player.respawn || this.outcomeLoopEnabled || this.stageRegistry.size > 0) {
        this.game.gameover('GAME OVER', '勇者生命歸零 · 按 R 鍵重新挑戰');
      } else {
        player.hp = player.maxHp;
      }
    }
  }

  public stepTick(input: EngineInputState) {
    this.tick++;

    const wantsRestart = Boolean(input.restart);
    if (wantsRestart && !this.prevRestart && this.gamePhase !== 'playing') {
      this.prevRestart = wantsRestart;
      this.game.restart();
      return;
    }
    this.prevRestart = wantsRestart;

    const tileCtx = {
      tileSize: this.tileSize,
      tileRows: this.tileRows,
      tileCols: this.tileCols,
      tileGrid: this.tileGrid,
    };

    if (this.gamePhase !== 'playing') {
      this.camTrauma = Math.max(0, this.camTrauma - 0.025);
      this.vfxSystem.step(this.tileRows > 0, (px, py) => querySolidAtPixel(tileCtx, px, py));
      this.crc32 = computeEngineCRC32(
        this.tick,
        this.prngState,
        this.entityList,
        this.vfxSystem.particles.length,
        this.score,
      );
      return;
    }

    if (this.hitstopTicks > 0) {
      this.hitstopTicks--;
      this.camTrauma = Math.max(0, this.camTrauma - 0.03);
      return;
    }

    this.playTimeTicks++;
    if (this.stageBannerTicks > 0) this.stageBannerTicks--;

    if (this.comboTimer > 0) {
      this.comboTimer--;
      if (this.comboTimer === 0) this.combo = 0;
    }

    this.camTrauma = Math.max(0, this.camTrauma - 0.025);

    const player = this.entityList.find((e) => e.kind === 'player');
    if (player) {
      if (player.invulnTicks > 0) player.invulnTicks--;
      if (player.flashTicks > 0) player.flashTicks--;

      const isAttacking =
        player.state !== 'idle' &&
        player.state !== 'run' &&
        player.state !== 'jump' &&
        player.state !== 'hurt';

      if (input.dash && !this.prevDash && player.dashTicks === 0 && player.state !== 'hurt') {
        player.dashTicks = 9;
        if (this.autoCombatAudio) this.audio.playPreset('dash');
        this.vfx.burst(player.x, player.y - 16, {
          count: 8,
          color: '#38bdf8',
          colorB: '#ffffff',
          speed: 2.0,
          gravity: 0.02,
          angleDeg: player.facing === 1 ? 180 : 0,
          spread: 60,
        });
      }

      if (player.dashTicks > 0) {
        player.vx = player.facing * 5.8;
        player.dashTicks--;
        if (player.dashTicks % 2 === 0) {
          this.vfx.afterimage(player.id, { color: '#38bdf8', life: 12, alpha: 0.55 });
        }
      } else if (player.state !== 'hurt') {
        if (!isAttacking) {
          let vx = 0;
          if (input.left) {
            vx -= player.moveSpeed;
            player.facing = -1;
          }
          if (input.right) {
            vx += player.moveSpeed;
            player.facing = 1;
          }
          player.vx = vx;
        } else {
          player.vx *= 0.82;
        }

        if (input.jump && !this.prevJump && player.coyoteTicks > 0) {
          player.vy = -6.4;
          player.grounded = false;
          player.coyoteTicks = 0;
          if (this.autoCombatAudio) this.audio.playPreset('jump');
          this.vfx.burst(player.x, player.y - 2, {
            count: 6,
            color: '#968fb3',
            colorB: '#f5f2eb',
            speed: 1.4,
            angleDeg: -90,
            spread: 110,
            life: 12,
          });
        }

        if (input.customAction && this.compiledActions.has(input.customAction) && !isAttacking) {
          this.triggerAction(player.id, input.customAction);
          if (this.autoCombatAudio) this.audio.playPreset('slash');
        } else if (input.slash && !this.prevSlash && !isAttacking) {
          this.triggerAction(player.id, 'slash');
          if (this.autoCombatAudio) this.audio.playPreset('slash');
          const t = resolveTheme(this.activeTheme);
          this.vfx.slashArc(player.x + player.facing * 18, player.y - 28, player.facing, {
            color: t.cloak[4],
            coreColor: '#ffffff',
          });
        }
      }

      this.prevJump = input.jump;
      this.prevSlash = input.slash;
      this.prevDash = input.dash;

      const stillAttacking =
        player.state !== 'idle' &&
        player.state !== 'run' &&
        player.state !== 'jump' &&
        player.state !== 'hurt';
      if (!stillAttacking && player.state !== 'hurt') {
        const nextLocState = !player.grounded ? 'jump' : Math.abs(player.vx) > 0.2 ? 'run' : 'idle';
        if (nextLocState !== player.state && this.compiledActions.has(nextLocState)) {
          player.state = nextLocState;
          player.frameIdx = 0;
          player.animTick = 0;
        }
      }
    }

    for (const ent of this.entityList) {
      if (ent.defeated) continue;
      if (ent.kind === 'enemy') {
        this.stepEnemyAi(ent, player);
      } else if (ent.kind === 'dummy') {
        if (ent.flashTicks > 0) ent.flashTicks--;
        ent.vx *= 0.78;
      }

      moveEntityWithTilemap(ent, tileCtx);

      if (ent.kind === 'player' && ent.invulnTicks === 0 && this.tileRows > 0) {
        const tc = Math.floor(ent.x / this.tileSize);
        const tr = Math.floor((ent.y - 4) / this.tileSize);
        if (queryTileAt(tileCtx, tc, tr) === 'spike') {
          this.damagePlayer(ent, 15, ent.x, 'spike');
          if (this.gamePhase !== 'playing') return;
        }
      }

      const act = this.compiledActions.get(ent.state) ?? this.compiledActions.get('idle');
      if (act && act.frames.length > 0) {
        const ticksPerFrame = Math.max(2, Math.round(60 / Math.max(2, act.fps)));
        ent.animTick++;
        if (ent.animTick >= ticksPerFrame) {
          ent.animTick = 0;
          ent.frameIdx++;
          if (ent.frameIdx >= act.frames.length) {
            if (act.loop) {
              ent.frameIdx = 0;
            } else {
              ent.state = 'idle';
              ent.frameIdx = 0;
              ent.attackDidHit = false;
            }
          }
        }
        ent.frameIdx %= act.frames.length;
      }
    }

    if (player && this.gamePhase === 'playing') {
      const pHit = getEntityWorldBox(player, this.compiledActions, 'hit');
      const pHurt = getEntityWorldBox(player, this.compiledActions, 'hurt');
      for (const target of [...this.entityList]) {
        if (target.id === player.id || target.defeated) continue;
        const tHurt = getEntityWorldBox(target, this.compiledActions, 'hurt');

        if (
          pHit.active &&
          !player.attackDidHit &&
          pHit.x < tHurt.x + tHurt.w &&
          pHit.x + pHit.w > tHurt.x &&
          pHit.y < tHurt.y + tHurt.h &&
          pHit.y + pHit.h > tHurt.y
        ) {
          player.attackDidHit = true;
          const dmg = this.activeWeapon === 'greatsword' ? 48 : this.activeWeapon === 'spear' ? 38 : 32;
          target.hp = Math.max(0, target.hp - dmg);
          target.flashTicks = 6;
          if (!target.isBoss) {
            target.vx = player.facing * 3.8;
          }
          this.combo++;
          this.comboTimer = 150;
          this.score += dmg * this.combo;
          this.triggerHitstop(4);
          this.camera.addTrauma(0.38);
          if (this.autoCombatAudio) this.audio.playPreset('hit');

          const hx = Math.round((pHit.x + pHit.w / 2 + tHurt.x + tHurt.w / 2) / 2);
          const hy = Math.round(tHurt.y + 18);
          this.vfx.burst(hx, hy, {
            count: 14,
            color: '#ffe36e',
            colorB: '#ffffff',
            speed: 3.4,
            bounce: true,
          });
          this.vfx.popup(tHurt.x + 4, tHurt.y - 6, `-${dmg}`, '#ffe36e');

          for (const cb of this.hitCallbacks) cb(player, target, dmg);
          this.signals.emit('combat:hit', { attacker: player, target, damage: dmg });
          this.signals.emit('entity:hurt', { entity: target, damage: dmg, source: player.id });

          if (target.hp === 0) {
            if (!target.respawn) {
              target.defeated = true;
              this.defeatedCount++;
              this.score += target.isBoss ? 1000 : 200;
              this.entityList = this.entityList.filter((e) => e.id !== target.id);
              if (this.autoCombatAudio) this.audio.playPreset('explosion');
              this.vfx.burst(target.x, target.y - 24, {
                count: target.isBoss ? 32 : 18,
                color: '#ffe36e',
                colorB: '#f97316',
                speed: 4.0,
                bounce: true,
                life: 34,
              });
              this.vfx.popup(tHurt.x, tHurt.y - 20, target.isBoss ? 'BOSS DEFEATED!' : 'DEFEATED!', '#4ade80');
              this.signals.emit('entity:defeated', { entity: target, killer: player });
            } else {
              target.hp = target.maxHp;
              this.vfx.popup(tHurt.x, tHurt.y - 20, 'RESPAWN!', '#4ade80');
            }
          }
        }

        if (
          !target.defeated &&
          target.kind === 'enemy' &&
          target.flashTicks === 0 &&
          player.invulnTicks === 0 &&
          player.state !== 'hurt' &&
          this.gamePhase === 'playing' &&
          pHurt.x < tHurt.x + tHurt.w &&
          pHurt.x + pHurt.w > tHurt.x &&
          pHurt.y < tHurt.y + tHurt.h &&
          pHurt.y + pHurt.h > tHurt.y
        ) {
          const contactDmg = target.aiState === 'lunge' ? target.contactDamage + 6 : target.contactDamage;
          this.damagePlayer(player, contactDmg, target.x, target.id);
          if (this.gamePhase !== 'playing') return;
        }
      }

      // Check Collectible Pickups
      for (const pk of this.pickups) {
        if (pk.collected) continue;
        if (Math.abs(player.x - pk.x) <= 20 && Math.abs((player.y - 18) - pk.y) <= 24) {
          pk.collected = true;
          if (pk.kind === 'key') {
            this.inventoryKeys.add(pk.keyName ?? pk.id);
            this.score += pk.value;
            if (this.autoCombatAudio) this.audio.playPreset('coin');
            this.vfx.popup(pk.x - 16, pk.y - 16, '+KEY', '#fbbf24');
          } else if (pk.kind === 'heal') {
            player.hp = Math.min(player.maxHp, player.hp + pk.value);
            if (this.autoCombatAudio) this.audio.playPreset('powerup');
            this.vfx.popup(pk.x - 16, pk.y - 16, `+${pk.value} HP`, '#4ade80');
          } else {
            this.score += pk.value;
            if (this.autoCombatAudio) this.audio.playPreset('coin');
            this.vfx.popup(pk.x - 16, pk.y - 16, `+${pk.value}`, '#38bdf8');
          }
          this.vfx.burst(pk.x, pk.y, { count: 12, color: pk.color, colorB: '#ffffff', speed: 2.4 });
          this.signals.emit('pickup:collect', { pickup: pk, player });
        }
      }

      // Check Stage Portals
      for (const portal of [...this.portals]) {
        if (
          Math.abs(player.x - portal.x) <= portal.w * 0.65 &&
          Math.abs((player.y - 16) - (portal.y - portal.h * 0.5)) <= portal.h * 0.75
        ) {
          if (this.worldPortals.isUnlocked(portal)) {
            const fromStage = this.currentStageId;
            if (this.autoCombatAudio) this.audio.playPreset('powerup');
            this.signals.emit('portal:enter', {
              portal,
              fromStage,
              toStage: portal.targetStage,
            });
            this.stages.enter(portal.targetStage, {
              keepPlayerHp: true,
              spawnX: portal.spawnX,
              spawnY: portal.spawnY,
            });
            break;
          } else if (this.tick - this.lastLockedHintTick > 45) {
            this.lastLockedHintTick = this.tick;
            const hint = portal.unlock === 'require_key' ? 'NEED KEY' : 'DEFEAT GUARDS';
            this.vfx.popup(portal.x - 24, portal.y - portal.h - 16, hint, '#fbbf24');
          }
        }
      }
    }

    this.vfxSystem.step(this.tileRows > 0, (px, py) => querySolidAtPixel(tileCtx, px, py));

    // Deterministic Coroutine Scheduler & Signal Ticks
    this.flow.stepTick();
    this.signals.emit('tick', { tick: this.tick });
    for (const cb of this.updateCallbacks) {
      cb(this.tick, this);
    }

    const worldW = Math.max(VIEW_W, this.tileCols * this.tileSize);
    const worldH = Math.max(VIEW_H, this.tileRows * this.tileSize);
    if (this.camFollowId) {
      const target = this.entities.get(this.camFollowId);
      if (target) {
        const desiredX = Math.max(0, Math.min(worldW - VIEW_W, target.x - VIEW_W / 2));
        const desiredY = Math.max(0, Math.min(worldH - VIEW_H, target.y - VIEW_H * 0.62));
        this.camX += (desiredX - this.camX) * this.camLerp;
        this.camY += (desiredY - this.camY) * this.camLerp;
      }
    }

    this.crc32 = computeEngineCRC32(
      this.tick,
      this.prngState,
      this.entityList,
      this.vfxSystem.particles.length,
      this.score,
    );
  }

  public render(ctx: CanvasRenderingContext2D, opts: { showDebug?: boolean; enableLighting?: boolean } = {}) {
    renderEngineScene(
      ctx,
      {
        tick: this.tick,
        camX: this.camX,
        camY: this.camY,
        camTrauma: this.camTrauma,
        nextRand: () => this.rand(),
        skyTopColor: this.skyTopColor,
        skyBottomColor: this.skyBottomColor,
        ambientDarkness: this.ambientDarkness,
        parallaxLayers: this.parallaxLayers,
        tileMapCanvas: this.tileMapCanvas,
        tileSize: this.tileSize,
        tileRows: this.tileRows,
        tileCols: this.tileCols,
        torchPositions: this.torchPositions,
        entityList: this.entityList,
        compiledActions: this.compiledActions,
        pointLights: this.pointLights,
        lightCanvas: this.lightCanvas,
        lightCtx: this.lightCtx,
        vfxSystem: this.vfxSystem,
        portals: this.portals,
        isPortalUnlocked: (p) => this.worldPortals.isUnlocked(p),
        pickups: this.pickups,
        gamePhase: this.gamePhase,
        stageId: this.currentStageId,
        stageTitle: this.currentStageTitle,
        stageBannerTicks: this.stageBannerTicks,
        endBannerTitle: this.endBannerTitle,
        endBannerSubtitle: this.endBannerSubtitle,
        keysCollected: [...this.inventoryKeys],
        score: this.score,
        defeatedCount: this.defeatedCount,
        playTimeTicks: this.playTimeTicks,
      },
      opts,
    );
  }

  public getStats(): EngineSnapshotStats {
    const player = this.entityList.find((e) => e.kind === 'player');
    const boss = this.entityList.find((e) => e.isBoss && !e.defeated);
    let frameCount = 0;
    for (const act of this.compiledActions.values()) {
      frameCount += act.frames.length;
    }
    return {
      tick: this.tick,
      fps: 60,
      entityCount: this.entityList.length,
      lightCount: this.pointLights.length,
      particleCount: this.vfxSystem.particles.length,
      compiledActionCount: this.compiledActions.size,
      compiledFrameCount: frameCount,
      crc32: this.crc32,
      paused: this.paused,
      compileMs: this.compileMs,
      playerHp: player?.hp ?? 0,
      playerMaxHp: player?.maxHp ?? 100,
      playerState: player?.state ?? 'idle',
      score: this.score,
      combo: this.combo,
      audioMuted: zzfxBridge.isMuted(),
      gamePhase: this.gamePhase,
      stageId: this.currentStageId,
      stageTitle: this.currentStageTitle,
      keysCollected: [...this.inventoryKeys],
      bossHp: boss?.hp,
      bossMaxHp: boss?.maxHp,
      bossName: boss?.label,
      bossPhase: boss?.bossPhase,
    };
  }

  private getSceneTreeContext(): SceneTreeContext {
    return {
      tick: this.tick,
      score: this.score,
      combo: this.combo,
      crc32: this.crc32,
      ambientDarkness: this.ambientDarkness,
      skyTopColor: this.skyTopColor,
      skyBottomColor: this.skyBottomColor,
      autoCombatAudio: this.autoCombatAudio,
      tileCols: this.tileCols,
      tileRows: this.tileRows,
      tileSize: this.tileSize,
      tileGrid: this.tileGrid,
      tileMapCanvas: this.tileMapCanvas,
      torchPositions: this.torchPositions,
      pointLights: this.pointLights,
      entityList: this.entityList,
      parallaxLayers: this.parallaxLayers,
      compiledActions: this.compiledActions,
      portals: this.portals,
      pickups: this.pickups,
      isPortalUnlocked: (p) => this.worldPortals.isUnlocked(p),
      gamePhase: this.gamePhase,
      stageId: this.currentStageId,
      stageTitle: this.currentStageTitle,
      keysCollected: [...this.inventoryKeys],
    };
  }

  public getSceneTree(): EngineSceneTreeSnapshot {
    return buildSceneTreeSnapshot(this.getSceneTreeContext());
  }

  public patchNodeProperty(nodeId: string, prop: string, value: string | number | boolean): boolean {
    if (nodeId === 'env:world') {
      if (prop === 'ambientDarkness') {
        this.ambientDarkness = Math.max(0, Math.min(0.92, Number(value)));
        return true;
      }
      if (prop === 'skyTopColor' && typeof value === 'string') {
        this.skyTopColor = value;
        return true;
      }
      if (prop === 'skyBottomColor' && typeof value === 'string') {
        this.skyBottomColor = value;
        return true;
      }
      if (prop === 'autoCombatAudio') {
        this.autoCombatAudio = Boolean(value);
        return true;
      }
    }

    if (nodeId.startsWith('light:')) {
      const id = nodeId.slice('light:'.length);
      const light = this.pointLights.find((l, i) => (l.id ?? String(i)) === id);
      if (!light) return false;
      if (prop === 'x') light.x = Number(value);
      else if (prop === 'y') light.y = Number(value);
      else if (prop === 'radius') light.radius = Math.max(12, Math.min(260, Number(value)));
      else if (prop === 'intensity') light.intensity = Math.max(0, Math.min(1.5, Number(value)));
      else if (prop === 'flicker') light.flicker = Math.max(0, Math.min(0.8, Number(value)));
      else if (prop === 'color' && typeof value === 'string') light.color = value;
      else return false;
      return true;
    }

    if (nodeId.startsWith('entity:')) {
      const id = nodeId.slice('entity:'.length);
      const ent = this.entities.get(id);
      if (!ent) return false;
      if (prop === 'x') ent.x = Number(value);
      else if (prop === 'y') ent.y = Number(value);
      else if (prop === 'hp') ent.hp = Math.max(1, Math.min(ent.maxHp, Number(value)));
      else if (prop === 'maxHp') {
        ent.maxHp = Math.max(10, Number(value));
        ent.hp = Math.min(ent.hp, ent.maxHp);
      } else if (prop === 'moveSpeed') ent.moveSpeed = Math.max(0, Math.min(10, Number(value)));
      else if (prop === 'facing') ent.facing = Number(value) >= 0 ? 1 : -1;
      else if (prop === 'patrolRange') ent.patrolRange = Math.max(0, Number(value));
      else if (prop === 'state' && typeof value === 'string') this.triggerAction(ent.id, value);
      else return false;
      return true;
    }

    if (nodeId.startsWith('parallax:')) {
      const idx = Number(nodeId.slice('parallax:'.length));
      const layer = this.parallaxLayers[idx];
      if (!layer) return false;
      if (prop === 'speed') layer.speed = Number(value);
      else if (prop === 'color' && typeof value === 'string') layer.color = value;
      else if (prop === 'heightRatio') layer.heightRatio = Math.max(0.2, Math.min(1, Number(value)));
      else return false;
      return true;
    }

    if (nodeId.startsWith('action:')) {
      const name = nodeId.slice('action:'.length);
      const act = this.compiledActions.get(name);
      if (!act || !['hitX', 'hitY', 'hitW', 'hitH'].includes(prop)) return false;
      const numVal = Math.round(Number(value));
      if (Number.isNaN(numVal)) return false;
      const key = prop === 'hitX' ? 'x' : prop === 'hitY' ? 'y' : prop === 'hitW' ? 'w' : 'h';
      const clamped = key === 'w' || key === 'h' ? Math.max(4, Math.min(72, numVal)) : Math.max(0, Math.min(72, numVal));
      for (const box of act.boxes) {
        box.hit[key] = clamped;
      }
      return true;
    }

    return false;
  }

  public getTileGrid(): TileKind[][] {
    return this.tileGrid;
  }

  public setTileAtCell(row: number, col: number, kind: TileKind): boolean {
    if (row < 0 || row >= this.tileRows || col < 0 || col >= this.tileCols) return false;
    this.tileGrid[row][col] = kind;
    this.bakeTileGrid(this.tileGrid, this.tileSize);
    return true;
  }

  public generateNodeCodeSnippet(nodeId: string): string {
    return generateFluentNodeCodeSnippet(this.getSceneTreeContext(), nodeId);
  }

  public exportStandaloneGameHtml(title: string): string {
    return exportStandaloneHtmlBuild(this.getSceneTreeContext(), title);
  }
}

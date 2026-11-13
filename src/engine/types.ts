export type EasingName = 'linear' | 'easeInOut' | 'easeOutBack' | 'easeIn';

export type WeaponType = 'broadsword' | 'greatsword' | 'spear' | 'daggers';

export type HairStyle = 'ranger' | 'short' | 'hooded';

export type TileKind = 'empty' | 'stone' | 'moss' | 'brick' | 'platform' | 'spike' | 'torch';

export type ZzfxPresetName =
  | 'slash'
  | 'hit'
  | 'jump'
  | 'dash'
  | 'hurt'
  | 'coin'
  | 'powerup'
  | 'explosion';

export interface PaletteTheme {
  name: string;
  hair: [string, string, string, string, string];
  cloak: [string, string, string, string, string];
  leather: [string, string, string, string, string];
  metal: [string, string, string, string];
  brass: [string, string, string];
  blade: [string, string, string];
}

export interface LimbPose {
  kx: number;
  ky: number;
  fx: number;
  fy: number;
  footAng?: number;
}

export interface ArmPose {
  ex: number;
  ey: number;
  hx: number;
  hy: number;
  swordAngle?: number;
  slashFX?: boolean;
}

export interface SkeletonPose {
  lean?: number;
  tx?: number;
  ty?: number;
  rot?: number;
  headX?: number;
  headY?: number;
  headRot?: number;
  cloakWave?: number;
  cloakLift?: number;
  cloakOpen?: boolean;
  legL?: LimbPose;
  legR?: LimbPose;
  frontArm?: ArmPose;
  backArm?: ArmPose;
  droppedSword?: boolean;
  face?: 'normal' | 'fierce' | 'hurt' | 'ko';
}

export interface BoxRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface HitBoxRect extends BoxRect {
  active: boolean;
}

export interface FrameBoxSpec {
  hurt: BoxRect;
  hit: HitBoxRect;
}

export interface KeyframeNode extends SkeletonPose {
  hurtbox?: BoxRect;
  hitbox?: Partial<HitBoxRect>;
}

export interface ActionCompileSpec {
  keyframes: KeyframeNode[];
  autoTweens?: number;
  easing?: EasingName;
  fps?: number;
  loop?: boolean;
  theme?: keyof typeof BUILTIN_THEMES | PaletteTheme;
  weapon?: WeaponType;
  hair?: HairStyle;
  ditherPct?: number;
  rimLight?: boolean;
  outlineMode?: '4way' | '8way' | 'none';
  activeFrames?: number[];
  defaultHitbox?: BoxRect;
}

export interface CompiledAction {
  name: string;
  fps: number;
  loop: boolean;
  frames: HTMLCanvasElement[];
  boxes: FrameBoxSpec[];
}

export interface ParallaxLayerSpec {
  type: 'stars' | 'mountains' | 'forest' | 'ruins';
  speed: number;
  color: string;
  accentColor?: string;
  heightRatio?: number;
}

export interface PointLightSpec {
  id?: string;
  x: number;
  y: number;
  radius: number;
  color: string;
  intensity?: number;
  flicker?: number;
  attachTo?: string;
  offsetX?: number;
  offsetY?: number;
}

export type GamePhase = 'playing' | 'victory' | 'gameover';

export type EnemyAiProfile = 'wander' | 'sentinel' | 'charger' | 'boss_warden';

export type EnemyAiState = 'patrol' | 'chase' | 'telegraph' | 'lunge' | 'slam' | 'recover';

export type PortalUnlockMode = 'always' | 'all_enemies' | 'require_key';

export interface PortalSpec {
  id?: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
  targetStage: string;
  spawnX?: number;
  spawnY?: number;
  unlock?: PortalUnlockMode;
  requiredKey?: string;
  color?: string;
  label?: string;
}

export interface PortalNode {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  targetStage: string;
  spawnX: number;
  spawnY: number;
  unlock: PortalUnlockMode;
  requiredKey?: string;
  color: string;
  label?: string;
}

export type PickupKind = 'key' | 'heal' | 'relic';

export interface PickupSpec {
  id?: string;
  kind: PickupKind;
  x: number;
  y: number;
  keyName?: string;
  value?: number;
  color?: string;
  label?: string;
}

export interface PickupNode {
  id: string;
  kind: PickupKind;
  x: number;
  y: number;
  keyName?: string;
  value: number;
  color: string;
  collected: boolean;
  label?: string;
}

export interface StageSpec {
  id: string;
  title: string;
  subtitle?: string;
  setup: () => void;
}

export interface EntitySpec {
  id?: string;
  kind: 'player' | 'enemy' | 'dummy';
  x: number;
  y: number;
  hp?: number;
  maxHp?: number;
  facing?: 1 | -1;
  patrolRange?: number;
  speed?: number;
  theme?: keyof typeof BUILTIN_THEMES | PaletteTheme;
  weapon?: WeaponType;
  hair?: HairStyle;
  aiProfile?: EnemyAiProfile;
  aggroRange?: number;
  attackRange?: number;
  respawn?: boolean;
  isBoss?: boolean;
  label?: string;
  contactDamage?: number;
  scale?: number;
}

export interface RuntimeEntity {
  id: string;
  kind: 'player' | 'enemy' | 'dummy';
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  grounded: boolean;
  coyoteTicks: number;
  hp: number;
  maxHp: number;
  state: string;
  frameIdx: number;
  animTick: number;
  invulnTicks: number;
  flashTicks: number;
  dashTicks: number;
  attackDidHit: boolean;
  patrolOriginX: number;
  patrolRange: number;
  moveSpeed: number;
  tintTheme?: string;
  aiProfile: EnemyAiProfile;
  aiState: EnemyAiState;
  aiTimer: number;
  aiCooldown: number;
  aiTargetDir: 1 | -1;
  aiAttackIdx: number;
  aggroRange: number;
  attackRange: number;
  respawn: boolean;
  defeated: boolean;
  isBoss: boolean;
  bossPhase: 1 | 2;
  label?: string;
  contactDamage: number;
  scale: number;
}

export interface VFXBurstOpts {
  count?: number;
  color?: string;
  colorB?: string;
  speed?: number;
  gravity?: number;
  bounce?: boolean;
  life?: number;
  size?: number;
  spread?: number;
  angleDeg?: number;
}

export interface SlashArcOpts {
  color?: string;
  coreColor?: string;
  radius?: number;
  life?: number;
}

export interface AfterimageOpts {
  color?: string;
  life?: number;
  alpha?: number;
}

export interface StudioBundleInput {
  appearance?: {
    theme?: string;
    weapon?: WeaponType;
    hairStyle?: HairStyle;
    palette?: string[];
  };
  animations?: Record<
    string,
    {
      frames?: Array<{
        pose?: SkeletonPose;
        boxes?: FrameBoxSpec;
        hurt?: BoxRect;
        hit?: HitBoxRect;
      }>;
    }
  >;
  atlasDataUrl?: string;
}

// ---- External Industry Standard Formats (Aseprite, LDtk, Tiled) ----

export interface AsepriteRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface AsepriteFrameEntry {
  filename?: string;
  frame: AsepriteRect;
  rotated?: boolean;
  trimmed?: boolean;
  spriteSourceSize?: AsepriteRect;
  sourceSize?: { w: number; h: number };
  duration?: number;
}

export interface AsepriteFrameTag {
  name: string;
  from: number;
  to: number;
  direction?: 'forward' | 'reverse' | 'pingpong' | 'pingpong_reverse';
  color?: string;
}

export interface AsepriteSliceKey {
  frame: number;
  bounds: AsepriteRect;
  pivot?: { x: number; y: number };
}

export interface AsepriteSlice {
  name: string;
  color?: string;
  keys?: AsepriteSliceKey[];
}

export interface AsepriteJson {
  frames: AsepriteFrameEntry[] | Record<string, AsepriteFrameEntry>;
  meta?: {
    app?: string;
    version?: string;
    image?: string;
    size?: { w: number; h: number };
    frameTags?: AsepriteFrameTag[];
    slices?: AsepriteSlice[];
  };
}

export interface LDtkEntityInstance {
  __identifier: string;
  __grid?: [number, number];
  px: [number, number];
  width?: number;
  height?: number;
  fieldInstances?: Array<{
    __identifier: string;
    __value: unknown;
  }>;
}

export interface LDtkTileInstance {
  px: [number, number];
  src?: [number, number];
  t?: number;
}

export interface LDtkLayerInstance {
  __identifier: string;
  __type: string;
  __cWid: number;
  __cHei: number;
  __gridSize: number;
  intGridCsv?: number[];
  autoLayerTiles?: LDtkTileInstance[];
  gridTiles?: LDtkTileInstance[];
  entityInstances?: LDtkEntityInstance[];
}

export interface LDtkLevel {
  identifier: string;
  pxWid: number;
  pxHei: number;
  bgColor?: string;
  layerInstances?: LDtkLayerInstance[];
}

export interface LDtkJson {
  __header__?: { fileType?: string; app?: string };
  levels: LDtkLevel[];
}

export interface TiledObject {
  id?: number;
  name?: string;
  type?: string;
  class?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  properties?: Array<{ name: string; type?: string; value: unknown }>;
}

export interface TiledLayer {
  name: string;
  type: 'tilelayer' | 'objectgroup' | 'imagelayer' | 'group' | string;
  width?: number;
  height?: number;
  data?: number[];
  objects?: TiledObject[];
  visible?: boolean;
}

export interface TiledJson {
  type?: 'map';
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  orientation?: string;
  layers: TiledLayer[];
}

export interface ExternalImportedAssets {
  studioBundle?: StudioBundleInput | null;
  asepriteJson?: AsepriteJson | null;
  asepriteImageUrl?: string | null;
  ldtkJson?: LDtkJson | null;
  tiledJson?: TiledJson | null;
  label?: string;
  detectedKind?: 'studio' | 'aseprite' | 'ldtk' | 'tiled';
}

export interface EngineSnapshotStats {
  tick: number;
  fps: number;
  entityCount: number;
  lightCount: number;
  particleCount: number;
  compiledActionCount: number;
  compiledFrameCount: number;
  crc32: number;
  paused: boolean;
  compileMs: number;
  playerHp: number;
  playerMaxHp: number;
  playerState: string;
  score: number;
  combo: number;
  audioMuted: boolean;
  gamePhase: GamePhase;
  stageId: string;
  stageTitle: string;
  keysCollected: string[];
  bossHp?: number;
  bossMaxHp?: number;
  bossName?: string;
  bossPhase?: 1 | 2;
}

export type EngineSceneNodeKind =
  | 'root'
  | 'environment'
  | 'parallax'
  | 'tilemap'
  | 'light'
  | 'entity'
  | 'action'
  | 'portal'
  | 'pickup'
  | 'stage';

export interface EngineSceneNode {
  id: string;
  label: string;
  kind: EngineSceneNodeKind;
  typeTag: string;
  props: Record<string, string | number | boolean>;
  children?: EngineSceneNode[];
}

export interface EngineSceneTreeSnapshot {
  root: EngineSceneNode;
  nodeCount: number;
}

export interface VirtualProjectFile {
  path: string;
  kind: 'entry' | 'module';
  code: string;
  summary?: string;
}

export interface CoroutineYield {
  kind: 'ticks';
  ticks: number;
}

export interface EngineSignalMap {
  tick: { tick: number };
  'combat:hit': { attacker: RuntimeEntity; target: RuntimeEntity; damage: number };
  'entity:spawn': { entity: RuntimeEntity };
  'entity:hurt': { entity: RuntimeEntity; damage: number; source: string };
  'entity:defeated': { entity: RuntimeEntity; killer?: RuntimeEntity };
  'action:trigger': { entity: RuntimeEntity; action: string };
  'scene:ready': { tileCols: number; tileRows: number };
  'portal:enter': { portal: PortalNode; fromStage: string; toStage: string };
  'pickup:collect': { pickup: PickupNode; player: RuntimeEntity };
  'stage:enter': { stageId: string; stageTitle: string };
  'boss:phase': { boss: RuntimeEntity; phase: 1 | 2 };
  'game:phase': { phase: GamePhase; title: string; subtitle?: string };
  [customEvent: string]: unknown;
}

export interface EnginePreset {
  id: string;
  title: string;
  summary: string;
  code: string;
  entryFile?: string;
  files?: VirtualProjectFile[];
}

export const BUILTIN_THEMES: Record<'emerald' | 'crimson' | 'shadow' | 'azure', PaletteTheme> = {
  emerald: {
    name: '翠風遊俠',
    hair: ['#2e180d', '#4a2816', '#6e3d22', '#945530', '#b86f42'],
    cloak: ['#093016', '#125226', '#1e7d39', '#32ab4f', '#66d978'],
    leather: ['#29170e', '#472a1a', '#694028', '#8c583a', '#b07450'],
    metal: ['#1f222e', '#32384a', '#4b536b', '#6c7694'],
    brass: ['#805510', '#cca029', '#ffe36e'],
    blade: ['#8fa3bf', '#c4d7ed', '#fff6a3'],
  },
  crimson: {
    name: '赤焰聖騎',
    hair: ['#4a3c31', '#6e5c4c', '#99826d', '#c4ab93', '#ebd6bf'],
    cloak: ['#3d0810', '#690d1b', '#9c192b', '#d12c40', '#ff6978'],
    leather: ['#241512', '#3d221c', '#5c342b', '#7d4a3d', '#a36555'],
    metal: ['#232630', '#3d4454', '#636e87', '#94a2bd'],
    brass: ['#85530d', '#d4901c', '#ffda59'],
    blade: ['#a8b6cc', '#dde8f5', '#ff9b54'],
  },
  shadow: {
    name: '深淵暗影',
    hair: ['#1f2233', '#363b54', '#555d80', '#7e89b3', '#b5c1eb'],
    cloak: ['#180b29', '#2c1547', '#462270', '#6936a3', '#9d66e3'],
    leather: ['#14121c', '#252133', '#39334d', '#51496b', '#6e648f'],
    metal: ['#161821', '#262b38', '#3c4457', '#58647d'],
    brass: ['#2a5c6b', '#3b94ab', '#67e8f9'],
    blade: ['#7e8aa6', '#b8c7e0', '#67e8f9'],
  },
  azure: {
    name: '蒼藍秘銀',
    hair: ['#2b140d', '#472216', '#6b3624', '#944f36', '#bd6d4f'],
    cloak: ['#09203d', '#0f396b', '#1859a3', '#2980db', '#63b5ff'],
    leather: ['#1f1a18', '#382f2b', '#574942', '#78655c', '#9e867a'],
    metal: ['#222936', '#3a465c', '#5b6d8c', '#879ec2'],
    brass: ['#6b6120', '#b5a438', '#f5e46c'],
    blade: ['#9bb8d9', '#d1e6ff', '#a5f3fc'],
  },
};

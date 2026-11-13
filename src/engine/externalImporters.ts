import { CELL_SIZE } from './pixelRasterizer';
import type {
  AsepriteFrameEntry,
  AsepriteJson,
  CompiledAction,
  FrameBoxSpec,
  LDtkEntityInstance,
  LDtkJson,
  TiledJson,
  TiledObject,
  TileKind,
} from './types';

export type DetectedJsonKind = 'studio' | 'aseprite' | 'ldtk' | 'tiled' | 'unknown';

export function detectExternalJsonKind(raw: unknown): DetectedJsonKind {
  if (!raw || typeof raw !== 'object') return 'unknown';
  const obj = raw as Record<string, unknown>;
  if (Array.isArray(obj.levels)) return 'ldtk';
  if (Array.isArray(obj.layers) && typeof obj.tilewidth === 'number') return 'tiled';
  if (obj.frames && (Array.isArray(obj.frames) || typeof obj.frames === 'object')) {
    const meta = obj.meta as Record<string, unknown> | undefined;
    if (meta && (Array.isArray(meta.frameTags) || meta.app || meta.size)) {
      return 'aseprite';
    }
    if (Array.isArray(obj.frames) && obj.frames[0] && (obj.frames[0] as Record<string, unknown>).frame) {
      return 'aseprite';
    }
  }
  if (obj.animations || obj.appearance || obj.atlasDataUrl) return 'studio';
  return 'unknown';
}

export interface AsepriteImportOptions {
  defaultFps?: number;
  tagRenameMap?: Record<string, string>;
  attackTags?: string[];
}

export function parseAsepriteToActions(
  json: AsepriteJson,
  atlasImage: HTMLImageElement | HTMLCanvasElement | null,
  options: AsepriteImportOptions = {},
): CompiledAction[] {
  const frameList: AsepriteFrameEntry[] = Array.isArray(json.frames)
    ? json.frames
    : Object.entries(json.frames ?? {}).map(([filename, entry]) => ({
        filename,
        ...entry,
      }));

  if (frameList.length === 0) return [];

  const tags =
    json.meta?.frameTags && json.meta.frameTags.length > 0
      ? json.meta.frameTags
      : [{ name: 'idle', from: 0, to: frameList.length - 1, direction: 'forward' as const }];

  const slices = json.meta?.slices ?? [];
  const attackTagSet = new Set(
    (options.attackTags ?? ['slash', 'attack', 'swing', 'combo', 'hit']).map((s) =>
      s.toLowerCase(),
    ),
  );

  const findSliceBox = (sliceName: string, globalFrameIdx: number) => {
    const slice = slices.find((s) => s.name.toLowerCase() === sliceName.toLowerCase());
    if (!slice?.keys?.length) return null;
    let matched = slice.keys[0];
    for (const k of slice.keys) {
      if (k.frame <= globalFrameIdx) matched = k;
    }
    return matched?.bounds ?? null;
  };

  const results: CompiledAction[] = [];

  for (const tag of tags) {
    const actionName = options.tagRenameMap?.[tag.name] ?? tag.name;
    const from = Math.max(0, Math.min(frameList.length - 1, tag.from));
    const to = Math.max(from, Math.min(frameList.length - 1, tag.to));

    const indices: number[] = [];
    if (tag.direction === 'reverse') {
      for (let i = to; i >= from; i--) indices.push(i);
    } else if (tag.direction === 'pingpong' || tag.direction === 'pingpong_reverse') {
      for (let i = from; i <= to; i++) indices.push(i);
      for (let i = to - 1; i > from; i--) indices.push(i);
      if (tag.direction === 'pingpong_reverse') indices.reverse();
    } else {
      for (let i = from; i <= to; i++) indices.push(i);
    }

    const frames: HTMLCanvasElement[] = [];
    const boxes: FrameBoxSpec[] = [];
    let totalDurationMs = 0;

    indices.forEach((globalIdx, localIdx) => {
      const entry = frameList[globalIdx];
      totalDurationMs += entry.duration ?? 100;

      const cvs = document.createElement('canvas');
      cvs.width = CELL_SIZE;
      cvs.height = CELL_SIZE;
      const ctx = cvs.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;

      if (atlasImage && entry.frame) {
        const fw = Math.max(1, entry.frame.w);
        const fh = Math.max(1, entry.frame.h);
        const scale = Math.min(1, (CELL_SIZE - 8) / Math.max(fw, fh));
        const dw = Math.max(1, Math.round(fw * scale));
        const dh = Math.max(1, Math.round(fh * scale));
        const dx = Math.round((CELL_SIZE - dw) / 2);
        const dy = CELL_SIZE - 8 - dh;
        ctx.drawImage(atlasImage, entry.frame.x, entry.frame.y, fw, fh, dx, dy, dw, dh);
      } else {
        // Synthesize crisp inspection placeholder when Aseprite JSON is imported standalone without PNG
        const isAtk = attackTagSet.has(actionName.toLowerCase());
        const paletteColor = tag.color || (isAtk ? '#f97316' : '#32ab4f');
        const bob = localIdx % 2 === 0 ? 0 : 1;
        ctx.fillStyle = '#120d17';
        ctx.fillRect(26, 20 + bob, 20, 42 - bob);
        ctx.fillStyle = paletteColor;
        ctx.fillRect(28, 22 + bob, 16, 38 - bob);
        ctx.fillStyle = '#f5f2eb';
        ctx.fillRect(31, 26 + bob, 10, 8);
        ctx.fillStyle = '#09080f';
        ctx.fillRect(37, 29 + bob, 2, 2);
        if (isAtk && localIdx >= Math.floor(indices.length / 2)) {
          ctx.fillStyle = '#fff6a3';
          ctx.fillRect(44, 28, 20, 5);
          ctx.fillStyle = '#c4d7ed';
          ctx.fillRect(44, 33, 18, 3);
        }
      }

      frames.push(cvs);

      const hurtSlice = findSliceBox('hurt', globalIdx) ?? findSliceBox('hurtbox', globalIdx);
      const hitSlice = findSliceBox('hit', globalIdx) ?? findSliceBox('hitbox', globalIdx);
      const isAtk = attackTagSet.has(actionName.toLowerCase());
      const activeByDefault = isAtk && localIdx >= Math.max(1, Math.floor(indices.length / 2));

      boxes.push({
        hurt: hurtSlice
          ? {
              x: Math.round((CELL_SIZE - hurtSlice.w) / 2),
              y: CELL_SIZE - 8 - hurtSlice.h,
              w: hurtSlice.w,
              h: hurtSlice.h,
            }
          : { x: 25, y: 14, w: 22, h: 48 },
        hit: hitSlice
          ? {
              x: Math.round(CELL_SIZE / 2 + hitSlice.x * 0.4),
              y: Math.max(8, CELL_SIZE - 8 - hitSlice.h),
              w: hitSlice.w,
              h: hitSlice.h,
              active: isAtk ? activeByDefault || hitSlice.w > 0 : true,
            }
          : { x: 40, y: 20, w: 28, h: 32, active: activeByDefault },
      });
    });

    const avgMs = totalDurationMs / Math.max(1, indices.length);
    const fps = options.defaultFps ?? Math.max(2, Math.min(24, Math.round(1000 / Math.max(30, avgMs))));
    const lower = actionName.toLowerCase();
    const loop = lower === 'idle' || lower === 'run' || lower === 'walk';

    results.push({
      name: actionName,
      fps,
      loop,
      frames,
      boxes,
    });
  }

  return results;
}

export interface ParsedLDtkWorld {
  levelId: string;
  tileSize: number;
  cols: number;
  rows: number;
  grid: TileKind[][];
  entities: Array<{
    identifier: string;
    x: number;
    y: number;
    width: number;
    height: number;
    fields: Record<string, unknown>;
  }>;
}

const DEFAULT_INTGRID_MAP: Record<number, TileKind> = {
  0: 'empty',
  1: 'stone',
  2: 'moss',
  3: 'brick',
  4: 'platform',
  5: 'spike',
  6: 'torch',
};

export function parseLDtkLevel(
  ldtk: LDtkJson,
  options: {
    levelIndex?: number;
    levelId?: string;
    intGridMapping?: Record<number, TileKind>;
  } = {},
): ParsedLDtkWorld {
  const levels = ldtk.levels ?? [];
  const level =
    (options.levelId ? levels.find((l) => l.identifier === options.levelId) : undefined) ??
    levels[options.levelIndex ?? 0];

  if (!level || !level.layerInstances?.length) {
    return {
      levelId: 'empty',
      tileSize: 16,
      cols: 30,
      rows: 17,
      grid: Array.from({ length: 17 }, () => Array(30).fill('empty')),
      entities: [],
    };
  }

  const layers = level.layerInstances;
  const intLayer = layers.find((l) => Array.isArray(l.intGridCsv) && l.intGridCsv.length > 0);
  const tileLayer =
    intLayer ??
    layers.find(
      (l) =>
        (Array.isArray(l.autoLayerTiles) && l.autoLayerTiles.length > 0) ||
        (Array.isArray(l.gridTiles) && l.gridTiles.length > 0),
    ) ??
    layers[0];

  const tileSize = tileLayer.__gridSize || 16;
  const cols = tileLayer.__cWid || Math.max(1, Math.ceil(level.pxWid / tileSize));
  const rows = tileLayer.__cHei || Math.max(1, Math.ceil(level.pxHei / tileSize));
  const mapping = { ...DEFAULT_INTGRID_MAP, ...(options.intGridMapping ?? {}) };

  const grid: TileKind[][] = Array.from({ length: rows }, () => Array(cols).fill('empty'));

  if (intLayer?.intGridCsv) {
    for (let i = 0; i < intLayer.intGridCsv.length; i++) {
      const r = Math.floor(i / cols);
      const c = i % cols;
      if (r < rows && c < cols) {
        grid[r][c] = mapping[intLayer.intGridCsv[i]] ?? (intLayer.intGridCsv[i] > 0 ? 'stone' : 'empty');
      }
    }
  } else {
    const tiles = tileLayer.autoLayerTiles ?? tileLayer.gridTiles ?? [];
    for (const t of tiles) {
      const c = Math.floor(t.px[0] / tileSize);
      const r = Math.floor(t.px[1] / tileSize);
      if (r >= 0 && r < rows && c >= 0 && c < cols) {
        grid[r][c] = 'stone';
      }
    }
  }

  const entities: ParsedLDtkWorld['entities'] = [];
  for (const layer of layers) {
    if (!layer.entityInstances?.length) continue;
    for (const ent of layer.entityInstances as LDtkEntityInstance[]) {
      const fields: Record<string, unknown> = {};
      for (const f of ent.fieldInstances ?? []) {
        fields[f.__identifier] = f.__value;
      }
      entities.push({
        identifier: ent.__identifier,
        x: ent.px[0],
        y: ent.px[1],
        width: ent.width ?? tileSize,
        height: ent.height ?? tileSize,
        fields,
      });
    }
  }

  return {
    levelId: level.identifier,
    tileSize,
    cols,
    rows,
    grid,
    entities,
  };
}

export interface ParsedTiledWorld {
  tileSize: number;
  cols: number;
  rows: number;
  grid: TileKind[][];
  objects: Array<{
    name: string;
    type: string;
    x: number;
    y: number;
    width: number;
    height: number;
    properties: Record<string, unknown>;
  }>;
}

const DEFAULT_TILED_GID_MAP: Record<number, TileKind> = {
  0: 'empty',
  1: 'stone',
  2: 'moss',
  3: 'brick',
  4: 'platform',
  5: 'spike',
  6: 'torch',
};

export function parseTiledMap(
  tiled: TiledJson,
  options: { gidLegend?: Record<number, TileKind> } = {},
): ParsedTiledWorld {
  const tileSize = tiled.tilewidth || 16;
  const cols = tiled.width || 30;
  const rows = tiled.height || 17;
  const gidMap = { ...DEFAULT_TILED_GID_MAP, ...(options.gidLegend ?? {}) };

  const grid: TileKind[][] = Array.from({ length: rows }, () => Array(cols).fill('empty'));
  const objects: ParsedTiledWorld['objects'] = [];

  for (const layer of tiled.layers ?? []) {
    if (layer.visible === false) continue;
    if (layer.type === 'tilelayer' && Array.isArray(layer.data)) {
      const lCols = layer.width ?? cols;
      for (let i = 0; i < layer.data.length; i++) {
        const rawGid = layer.data[i] & 0x0fffffff;
        if (rawGid === 0) continue;
        const r = Math.floor(i / lCols);
        const c = i % lCols;
        if (r < rows && c < cols) {
          grid[r][c] = gidMap[rawGid] ?? 'stone';
        }
      }
    } else if (layer.type === 'objectgroup' && Array.isArray(layer.objects)) {
      for (const obj of layer.objects as TiledObject[]) {
        const props: Record<string, unknown> = {};
        for (const p of obj.properties ?? []) {
          props[p.name] = p.value;
        }
        objects.push({
          name: obj.name ?? '',
          type: obj.type ?? obj.class ?? obj.name ?? '',
          x: obj.x,
          y: obj.y,
          width: obj.width ?? tileSize,
          height: obj.height ?? tileSize,
          properties: props,
        });
      }
    }
  }

  return {
    tileSize,
    cols,
    rows,
    grid,
    objects,
  };
}

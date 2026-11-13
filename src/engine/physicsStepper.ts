import { CELL_SIZE } from './pixelRasterizer';
import type { CompiledAction, RuntimeEntity, TileKind } from './types';

export const VIEW_W = 480;
export const VIEW_H = 270;

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[n] = c >>> 0;
}

export interface TilemapQueryContext {
  tileSize: number;
  tileRows: number;
  tileCols: number;
  tileGrid: TileKind[][];
}

export function getTileAt(ctx: TilemapQueryContext, c: number, r: number): TileKind {
  if (r < 0 || r >= ctx.tileRows || c < 0 || c >= ctx.tileCols) return 'empty';
  return ctx.tileGrid[r]?.[c] ?? 'empty';
}

export function isSolidAtPixel(ctx: TilemapQueryContext, px: number, py: number): boolean {
  const c = Math.floor(px / ctx.tileSize);
  const r = Math.floor(py / ctx.tileSize);
  const t = getTileAt(ctx, c, r);
  return t === 'stone' || t === 'moss' || t === 'brick';
}

export function isPlatformAtPixel(ctx: TilemapQueryContext, px: number, py: number): boolean {
  const c = Math.floor(px / ctx.tileSize);
  const r = Math.floor(py / ctx.tileSize);
  return getTileAt(ctx, c, r) === 'platform';
}

export function moveEntityWithTilemap(ent: RuntimeEntity, ctx: TilemapQueryContext): void {
  const halfW = 9;
  const bodyH = 40;
  const worldW = Math.max(VIEW_W, ctx.tileCols * ctx.tileSize);
  const worldH = Math.max(VIEW_H, ctx.tileRows * ctx.tileSize);

  ent.x += ent.vx;
  if (ent.x < halfW + 4) ent.x = halfW + 4;
  if (ent.x > worldW - halfW - 4) ent.x = worldW - halfW - 4;

  if (ctx.tileRows > 0 && ent.vx !== 0) {
    const sideX = ent.vx > 0 ? ent.x + halfW : ent.x - halfW;
    for (let sy = ent.y - bodyH + 4; sy <= ent.y - 3; sy += 10) {
      if (isSolidAtPixel(ctx, sideX, sy)) {
        const col = Math.floor(sideX / ctx.tileSize);
        ent.x = ent.vx > 0 ? col * ctx.tileSize - halfW - 0.1 : (col + 1) * ctx.tileSize + halfW + 0.1;
        ent.vx = 0;
        if (ent.kind === 'enemy') ent.facing = ent.facing === 1 ? -1 : 1;
        break;
      }
    }
  }

  const prevY = ent.y;
  ent.vy = Math.min(8.5, ent.vy + 0.34);
  ent.y += ent.vy;
  ent.grounded = false;

  if (ctx.tileRows > 0) {
    if (ent.vy >= 0) {
      const leftFoot = ent.x - halfW + 2;
      const rightFoot = ent.x + halfW - 2;
      for (const fx of [leftFoot, ent.x, rightFoot]) {
        const solidHit = isSolidAtPixel(ctx, fx, ent.y);
        const platRow = Math.floor(ent.y / ctx.tileSize);
        const platTop = platRow * ctx.tileSize;
        const platHit = isPlatformAtPixel(ctx, fx, ent.y) && prevY <= platTop + 4 && ent.vy >= 0;
        if (solidHit || platHit) {
          ent.y = Math.floor(ent.y / ctx.tileSize) * ctx.tileSize;
          ent.vy = 0;
          ent.grounded = true;
          ent.coyoteTicks = 6;
          break;
        }
      }
    } else {
      for (const hx of [ent.x - halfW + 2, ent.x + halfW - 2]) {
        if (isSolidAtPixel(ctx, hx, ent.y - bodyH)) {
          const row = Math.floor((ent.y - bodyH) / ctx.tileSize);
          ent.y = (row + 1) * ctx.tileSize + bodyH + 0.1;
          ent.vy = 0;
          break;
        }
      }
    }
  } else {
    const floorY = VIEW_H - 28;
    if (ent.y >= floorY) {
      ent.y = floorY;
      ent.vy = 0;
      ent.grounded = true;
      ent.coyoteTicks = 6;
    }
  }

  if (ent.y > worldH - 8) {
    ent.y = worldH - 16;
    ent.vy = 0;
    ent.grounded = true;
  }

  if (!ent.grounded && ent.coyoteTicks > 0) ent.coyoteTicks--;
}

export function getEntityWorldBox(
  ent: RuntimeEntity,
  compiledActions: Map<string, CompiledAction>,
  kind: 'hurt' | 'hit',
): { x: number; y: number; w: number; h: number; active: boolean } {
  const act = compiledActions.get(ent.state) ?? compiledActions.get('idle');
  const boxes = act?.boxes[ent.frameIdx % (act.boxes.length || 1)] ?? {
    hurt: { x: 25, y: 14, w: 22, h: 48 },
    hit: { x: 40, y: 20, w: 28, h: 32, active: false },
  };
  const rect = kind === 'hurt' ? boxes.hurt : boxes.hit;
  const scale = ent.scale || 1;
  const spriteLeft = ent.x - 36 * scale;
  const spriteTop = ent.y - 64 * scale;
  const bx = ent.facing === 1 ? rect.x * scale : (CELL_SIZE - rect.x - rect.w) * scale;
  return {
    x: Math.round(spriteLeft + bx),
    y: Math.round(spriteTop + rect.y * scale),
    w: Math.round(rect.w * scale),
    h: Math.round(rect.h * scale),
    active: kind === 'hurt' ? true : boxes.hit.active,
  };
}

export function computeEngineCRC32(
  tick: number,
  prngState: number,
  entityList: RuntimeEntity[],
  particleCount: number,
  score: number,
): number {
  const p = entityList.find((e) => e.kind === 'player');
  const ints = [
    tick,
    prngState >>> 0,
    p ? Math.round(p.x * 100) : 0,
    p ? Math.round(p.y * 100) : 0,
    p ? p.hp : 0,
    entityList.length,
    particleCount,
    score,
  ];
  let crc = 0xffffffff;
  for (let i = 0; i < ints.length; i++) {
    const v = ints[i] | 0;
    crc = CRC_TABLE[(crc ^ (v & 0xff)) & 0xff] ^ (crc >>> 8);
    crc = CRC_TABLE[(crc ^ ((v >> 8) & 0xff)) & 0xff] ^ (crc >>> 8);
    crc = CRC_TABLE[(crc ^ ((v >> 16) & 0xff)) & 0xff] ^ (crc >>> 8);
    crc = CRC_TABLE[(crc ^ ((v >> 24) & 0xff)) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

import {
  BUILTIN_THEMES,
  type ActionCompileSpec,
  type ArmPose,
  type BoxRect,
  type CompiledAction,
  type EasingName,
  type FrameBoxSpec,
  type HairStyle,
  type KeyframeNode,
  type LimbPose,
  type PaletteTheme,
  type SkeletonPose,
  type TileKind,
  type WeaponType,
} from './types';

export const CELL_SIZE = 72;

const BAYER_4X4 = [
  0 / 16 - 0.5, 8 / 16 - 0.5, 2 / 16 - 0.5, 10 / 16 - 0.5,
  12 / 16 - 0.5, 4 / 16 - 0.5, 14 / 16 - 0.5, 6 / 16 - 0.5,
  3 / 16 - 0.5, 11 / 16 - 0.5, 1 / 16 - 0.5, 9 / 16 - 0.5,
  15 / 16 - 0.5, 7 / 16 - 0.5, 13 / 16 - 0.5, 5 / 16 - 0.5,
];

const RIM_STEP_UP = new Uint8Array([
  0,
  2, 3, 4, 5, 5,
  7, 8, 9, 9,
  10, 11,
  13, 14, 15, 16, 16,
  18, 19, 20, 21, 21,
  23, 24, 25, 25,
  27, 28, 28,
  30, 31, 31,
]);

// Pooled offscreen buffers to prevent GC allocation churn during compilation
let pooledOffCanvas: HTMLCanvasElement | null = null;
let pooledOffCtx: CanvasRenderingContext2D | null = null;
let pooledOutCanvas: HTMLCanvasElement | null = null;
let pooledOutCtx: CanvasRenderingContext2D | null = null;
const pooledMask = new Uint8Array(CELL_SIZE * CELL_SIZE);
const pooledIdxMap = new Uint8Array(CELL_SIZE * CELL_SIZE);

function ensureBuffers() {
  if (!pooledOffCanvas) {
    pooledOffCanvas = document.createElement('canvas');
    pooledOffCanvas.width = CELL_SIZE;
    pooledOffCanvas.height = CELL_SIZE;
    pooledOffCtx = pooledOffCanvas.getContext('2d', { willReadFrequently: true });
  }
  if (!pooledOutCanvas) {
    pooledOutCanvas = document.createElement('canvas');
    pooledOutCanvas.width = CELL_SIZE;
    pooledOutCanvas.height = CELL_SIZE;
    pooledOutCtx = pooledOutCanvas.getContext('2d');
  }
  return { offCtx: pooledOffCtx!, outCanvas: pooledOutCanvas!, outCtx: pooledOutCtx! };
}

export function resolveTheme(theme?: keyof typeof BUILTIN_THEMES | PaletteTheme): PaletteTheme {
  if (!theme) return BUILTIN_THEMES.emerald;
  if (typeof theme === 'string') {
    return BUILTIN_THEMES[theme] ?? BUILTIN_THEMES.emerald;
  }
  return theme;
}

function buildPaletteRgb(t: PaletteTheme): Array<[number, number, number]> {
  const hexes = [
    '#120d17',
    ...t.hair,
    '#9e5e40', '#cf8460', '#f0a884', '#ffd1b3',
    '#ffffff', '#211c2e',
    ...t.cloak,
    ...t.leather,
    ...t.metal,
    ...t.brass,
    ...t.blade,
  ];
  return hexes.map((hex) => {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  });
}

function nearestPaletteIndex(r: number, g: number, b: number, pal: Array<[number, number, number]>): number {
  let bestDist = 1e9;
  let bestIdx = 1;
  for (let i = 1; i < pal.length; i++) {
    const p = pal[i];
    const dr = (r - p[0]) * 0.3;
    const dg = (g - p[1]) * 0.59;
    const db = (b - p[2]) * 0.11;
    const d = dr * dr + dg * dg + db * db;
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return bestIdx;
}

export function applyEasing(t: number, easing: EasingName = 'linear'): number {
  const x = Math.max(0, Math.min(1, t));
  if (easing === 'easeIn') return x * x;
  if (easing === 'easeInOut') return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
  if (easing === 'easeOutBack') {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
  }
  return x;
}

function lerpNum(a: number | undefined, b: number | undefined, t: number): number {
  const v1 = a ?? 0;
  const v2 = b ?? 0;
  return Number((v1 + (v2 - v1) * t).toFixed(2));
}

function lerpLimb(a: LimbPose | undefined, b: LimbPose | undefined, t: number): LimbPose | undefined {
  if (!a && !b) return undefined;
  const l1 = a ?? b!;
  const l2 = b ?? a!;
  const res: LimbPose = {
    kx: lerpNum(l1.kx, l2.kx, t),
    ky: lerpNum(l1.ky, l2.ky, t),
    fx: lerpNum(l1.fx, l2.fx, t),
    fy: lerpNum(l1.fy, l2.fy, t),
  };
  if (l1.footAng !== undefined || l2.footAng !== undefined) {
    res.footAng = lerpNum(l1.footAng ?? 0, l2.footAng ?? 0, t);
  }
  return res;
}

function lerpArm(a: ArmPose | undefined, b: ArmPose | undefined, t: number): ArmPose | undefined {
  if (!a && !b) return undefined;
  const r1 = a ?? b!;
  const r2 = b ?? a!;
  const res: ArmPose = {
    ex: lerpNum(r1.ex, r2.ex, t),
    ey: lerpNum(r1.ey, r2.ey, t),
    hx: lerpNum(r1.hx, r2.hx, t),
    hy: lerpNum(r1.hy, r2.hy, t),
  };
  if (r1.swordAngle !== undefined && r2.swordAngle !== undefined) {
    res.swordAngle = Math.round(lerpNum(r1.swordAngle, r2.swordAngle, t));
  } else if (r1.swordAngle !== undefined) {
    res.swordAngle = r1.swordAngle;
  } else if (r2.swordAngle !== undefined) {
    res.swordAngle = r2.swordAngle;
  }
  if (r1.slashFX || r2.slashFX) {
    res.slashFX = t >= 0.5 ? Boolean(r2.slashFX) : Boolean(r1.slashFX);
  }
  return res;
}

export function interpolateKeyframe(p1: KeyframeNode, p2: KeyframeNode, rawT: number, easing: EasingName): KeyframeNode {
  const t = applyEasing(rawT, easing);
  return {
    lean: lerpNum(p1.lean, p2.lean, t),
    tx: lerpNum(p1.tx, p2.tx, t),
    ty: lerpNum(p1.ty, p2.ty, t),
    rot: Math.round(lerpNum(p1.rot, p2.rot, t)),
    headX: lerpNum(p1.headX, p2.headX, t),
    headY: lerpNum(p1.headY, p2.headY, t),
    headRot: Math.round(lerpNum(p1.headRot, p2.headRot, t)),
    cloakWave: lerpNum(p1.cloakWave, p2.cloakWave, t),
    cloakLift: lerpNum(p1.cloakLift, p2.cloakLift, t),
    cloakOpen: p1.cloakOpen ?? p2.cloakOpen,
    legL: lerpLimb(p1.legL, p2.legL, t),
    legR: lerpLimb(p1.legR, p2.legR, t),
    frontArm: lerpArm(p1.frontArm, p2.frontArm, t),
    backArm: lerpArm(p1.backArm, p2.backArm, t),
    face: t >= 0.5 ? (p2.face ?? p1.face) : (p1.face ?? p2.face),
  };
}

function drawLimb(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  r1: number,
  r2: number,
  colDark: string,
  colMid: string,
  colLight: string,
) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x1 + nx * r1, y1 + ny * r1);
  ctx.lineTo(x2 + nx * r2, y2 + ny * r2);
  ctx.arc(x2, y2, r2, Math.atan2(ny, nx), Math.atan2(-ny, -nx));
  ctx.lineTo(x1 - nx * r1, y1 - ny * r1);
  ctx.arc(x1, y1, r1, Math.atan2(-ny, -nx), Math.atan2(ny, nx));
  ctx.closePath();

  const grad = ctx.createLinearGradient(x1 - nx * r1, y1 - ny * r1, x1 + nx * r1, y1 + ny * r1);
  grad.addColorStop(0, colLight);
  grad.addColorStop(0.55, colMid);
  grad.addColorStop(1, colDark);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = '#120d17';
  ctx.lineWidth = 0.85;
  ctx.stroke();
  ctx.restore();
}

function drawWeapon(
  ctx: CanvasRenderingContext2D,
  hx: number,
  hy: number,
  angleDeg: number,
  withSlashFX: boolean | undefined,
  t: PaletteTheme,
  weaponType: WeaponType,
  isOffhand?: boolean,
) {
  const wType: WeaponType = isOffhand ? 'daggers' : weaponType;
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate((angleDeg * Math.PI) / 180);

  if (wType === 'spear') {
    ctx.fillStyle = t.leather[2];
    ctx.fillRect(-11, -1.2, 26, 2.4);
    ctx.strokeStyle = '#120d17';
    ctx.lineWidth = 0.8;
    ctx.strokeRect(-11, -1.2, 26, 2.4);
    ctx.fillStyle = t.brass[2];
    ctx.fillRect(13.5, -2.2, 2.5, 4.4);
    ctx.beginPath();
    ctx.moveTo(16, -3.2);
    ctx.lineTo(27, 0);
    ctx.lineTo(16, 3.2);
    ctx.closePath();
    const spearGrad = ctx.createLinearGradient(16, -3.2, 16, 3.2);
    spearGrad.addColorStop(0, '#ffffff');
    spearGrad.addColorStop(0.5, t.blade[1]);
    spearGrad.addColorStop(1, t.metal[3]);
    ctx.fillStyle = spearGrad;
    ctx.fill();
    ctx.stroke();
  } else if (wType === 'greatsword') {
    ctx.fillStyle = t.leather[1];
    ctx.fillRect(-7, -1.6, 6.5, 3.2);
    ctx.fillStyle = t.brass[2];
    ctx.beginPath();
    ctx.arc(-8, 0, 2.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(1, -3.6);
    ctx.lineTo(22, -2.8);
    ctx.lineTo(27.5, 0);
    ctx.lineTo(22, 2.8);
    ctx.lineTo(1, 3.6);
    ctx.closePath();
    const gsGrad = ctx.createLinearGradient(0, -3.6, 0, 3.6);
    gsGrad.addColorStop(0, '#ffffff');
    gsGrad.addColorStop(0.45, t.blade[1]);
    gsGrad.addColorStop(1, t.metal[3]);
    ctx.fillStyle = gsGrad;
    ctx.fill();
    ctx.strokeStyle = '#120d17';
    ctx.lineWidth = 0.9;
    ctx.stroke();

    ctx.fillStyle = t.brass[2];
    ctx.beginPath();
    ctx.roundRect(-1.2, -6.8, 3.2, 13.6, 1);
    ctx.fill();
    ctx.stroke();
  } else if (wType === 'daggers') {
    ctx.fillStyle = t.leather[1];
    ctx.fillRect(-4, -1.1, 4, 2.2);
    ctx.beginPath();
    ctx.moveTo(1, -1.8);
    ctx.lineTo(11, -1.2);
    ctx.lineTo(14.5, 0);
    ctx.lineTo(11, 1.2);
    ctx.lineTo(1, 1.8);
    ctx.closePath();
    ctx.fillStyle = t.blade[1];
    ctx.fill();
    ctx.strokeStyle = '#120d17';
    ctx.lineWidth = 0.85;
    ctx.stroke();
    ctx.fillStyle = t.brass[2];
    ctx.fillRect(-0.5, -3.6, 2.0, 7.2);
  } else {
    ctx.fillStyle = t.leather[1];
    ctx.fillRect(-5, -1.3, 4.5, 2.6);
    ctx.fillStyle = t.brass[2];
    ctx.beginPath();
    ctx.arc(-5.8, 0, 2.0, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(1, -2.3);
    ctx.lineTo(18, -1.6);
    ctx.lineTo(22.5, 0);
    ctx.lineTo(18, 1.6);
    ctx.lineTo(1, 2.3);
    ctx.closePath();
    const bladeGrad = ctx.createLinearGradient(0, -2.3, 0, 2.3);
    bladeGrad.addColorStop(0, '#ffffff');
    bladeGrad.addColorStop(0.45, t.blade[1]);
    bladeGrad.addColorStop(1, t.metal[3]);
    ctx.fillStyle = bladeGrad;
    ctx.fill();
    ctx.strokeStyle = '#120d17';
    ctx.lineWidth = 0.9;
    ctx.stroke();

    ctx.fillStyle = t.brass[2];
    ctx.strokeStyle = '#120d17';
    ctx.beginPath();
    ctx.roundRect(-0.8, -5.2, 2.6, 10.4, 1);
    ctx.fill();
    ctx.stroke();
  }

  if (withSlashFX) {
    const fxR = wType === 'greatsword' ? 21 : wType === 'spear' ? 22 : wType === 'daggers' ? 13 : 17;
    ctx.save();
    ctx.beginPath();
    ctx.arc(6, 0, fxR, -Math.PI * 0.48, Math.PI * 0.48);
    ctx.strokeStyle = t.blade[2];
    ctx.lineWidth = 3.2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(7.5, 0, fxR, -Math.PI * 0.35, Math.PI * 0.35);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
}

export function drawVectorSkeleton(
  ctx: CanvasRenderingContext2D,
  pose: SkeletonPose,
  t: PaletteTheme,
  weaponType: WeaponType,
  hairStyle: HairStyle,
) {
  ctx.save();
  const cx = 36 + (pose.tx || 0);
  const cy = 40 + (pose.ty || 0);
  ctx.translate(cx, cy);
  if (pose.rot) ctx.rotate((pose.rot * Math.PI) / 180);

  const lean = pose.lean || 0;
  const hipX = 0;
  const hipY = 6;
  const chestX = lean * 0.7;
  const chestY = -6;
  const headX = lean * 1.1 + (pose.headX || 0);
  const headY = -17 + (pose.headY || 0);

  // Cloak back
  ctx.save();
  const cw = pose.cloakWave || 0;
  const cLift = pose.cloakLift || 0;
  ctx.beginPath();
  ctx.moveTo(chestX - 6, chestY - 4);
  ctx.bezierCurveTo(
    chestX - 16 - cLift * 0.7,
    chestY + 2 - cLift * 0.4,
    hipX - 20 - cLift,
    hipY + 10 - cLift * 0.6 + cw,
    hipX - 12 - cLift * 0.9,
    hipY + 19 - cLift * 0.5 + cw,
  );
  ctx.lineTo(hipX + 4 - cLift * 0.3, hipY + 17 - cLift * 0.3);
  ctx.bezierCurveTo(hipX + 2, hipY + 6, chestX + 5, chestY + 2, chestX + 4, chestY - 4);
  ctx.closePath();
  const cloakGrad = ctx.createLinearGradient(chestX - 22, chestY - 4, hipX + 6, hipY + 20);
  cloakGrad.addColorStop(0, t.cloak[3]);
  cloakGrad.addColorStop(0.5, t.cloak[2]);
  cloakGrad.addColorStop(1, t.cloak[0]);
  ctx.fillStyle = cloakGrad;
  ctx.fill();
  ctx.strokeStyle = '#120d17';
  ctx.lineWidth = 1.1;
  ctx.stroke();
  ctx.restore();

  // Back arm
  if (pose.backArm) {
    const ba = pose.backArm;
    drawLimb(ctx, chestX + 3, chestY - 1, chestX + ba.ex, chestY + ba.ey, 3.2, 2.8, t.metal[0], t.metal[1], t.metal[2]);
    drawLimb(ctx, chestX + ba.ex, chestY + ba.ey, chestX + ba.hx, chestY + ba.hy, 2.8, 2.3, t.leather[0], t.leather[1], t.leather[2]);
    if (ba.swordAngle !== undefined) {
      drawWeapon(ctx, chestX + ba.hx, chestY + ba.hy, ba.swordAngle, ba.slashFX, t, weaponType);
    } else if (weaponType === 'daggers' && !pose.droppedSword) {
      drawWeapon(ctx, chestX + ba.hx, chestY + ba.hy, -15, false, t, weaponType, true);
    }
    ctx.fillStyle = '#cf8460';
    ctx.beginPath();
    ctx.arc(chestX + ba.hx, chestY + ba.hy, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Legs
  const legs = [pose.legR ?? { kx: 2.5, ky: 8, fx: 3, fy: 15 }, pose.legL ?? { kx: -2, ky: 8, fx: -2.5, fy: 15 }];
  legs.forEach((leg, idx) => {
    const isFront = idx === 1;
    const ox = hipX + (isFront ? -2 : 2.5);
    const oy = hipY + 1;
    const kx = ox + leg.kx;
    const ky = oy + leg.ky;
    const fx = ox + leg.fx;
    const fy = oy + leg.fy;
    drawLimb(ctx, ox, oy, kx, ky, 3.8, 3.1, t.metal[0], isFront ? t.metal[2] : t.metal[1], t.metal[3]);
    drawLimb(ctx, kx, ky, fx, fy, 3.2, 2.6, t.leather[0], isFront ? t.leather[2] : t.leather[1], t.leather[3]);
    ctx.fillStyle = isFront ? t.leather[3] : t.leather[2];
    ctx.fillRect(kx - 3.2, ky - 1.5, 6.4, 2.5);
    ctx.beginPath();
    ctx.ellipse(fx + 1.8, fy + 1.2, 4.2, 2.1, ((leg.footAng || 0) * Math.PI) / 180, 0, Math.PI * 2);
    ctx.fillStyle = isFront ? t.leather[1] : t.leather[0];
    ctx.fill();
    ctx.strokeStyle = '#120d17';
    ctx.lineWidth = 0.9;
    ctx.stroke();
  });

  // Torso armor
  ctx.save();
  ctx.fillStyle = t.leather[1];
  ctx.beginPath();
  ctx.roundRect(hipX - 6.5, hipY - 1, 13, 5.5, 1.5);
  ctx.fill();
  ctx.strokeStyle = '#120d17';
  ctx.lineWidth = 0.9;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(chestX - 6.5, chestY - 3);
  ctx.lineTo(chestX + 6.5, chestY - 3);
  ctx.lineTo(hipX + 5.5, hipY + 1);
  ctx.lineTo(hipX - 5.5, hipY + 1);
  ctx.closePath();
  const armorGrad = ctx.createLinearGradient(chestX - 6, chestY, chestX + 6, hipY);
  armorGrad.addColorStop(0, t.leather[4]);
  armorGrad.addColorStop(0.45, t.leather[2]);
  armorGrad.addColorStop(1, t.leather[0]);
  ctx.fillStyle = armorGrad;
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = t.brass[2];
  ctx.fillRect(hipX - 1.5, hipY - 1.8, 3.2, 3.2);
  ctx.restore();

  // Hood collar
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(chestX, chestY - 3.5, 7.8, 3.6, 0, 0, Math.PI * 2);
  const hoodGrad = ctx.createLinearGradient(chestX - 7, chestY - 7, chestX + 7, chestY);
  hoodGrad.addColorStop(0, t.cloak[4]);
  hoodGrad.addColorStop(0.5, t.cloak[2]);
  hoodGrad.addColorStop(1, t.cloak[0]);
  ctx.fillStyle = hoodGrad;
  ctx.fill();
  ctx.strokeStyle = '#120d17';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = t.brass[2];
  ctx.beginPath();
  ctx.arc(chestX + 2.2, chestY - 2.8, 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Head
  ctx.save();
  ctx.translate(headX, headY);
  if (pose.headRot) ctx.rotate((pose.headRot * Math.PI) / 180);
  ctx.fillStyle = t.hair[1];
  ctx.beginPath();
  ctx.arc(-1, -1.5, 8.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(-5.5, -4);
  ctx.quadraticCurveTo(-5.8, 4.5, 0.5, 6.2);
  ctx.quadraticCurveTo(6.2, 4.8, 6.2, -3.5);
  ctx.closePath();
  const faceGrad = ctx.createLinearGradient(-4, -3, 6, 5);
  faceGrad.addColorStop(0, '#ffd1b3');
  faceGrad.addColorStop(0.6, '#f0a884');
  faceGrad.addColorStop(1, '#cf8460');
  ctx.fillStyle = faceGrad;
  ctx.fill();
  ctx.strokeStyle = '#120d17';
  ctx.lineWidth = 0.9;
  ctx.stroke();

  if (pose.face === 'ko') {
    ctx.fillStyle = t.hair[0];
    ctx.fillRect(-1.5, 0.5, 2.5, 1.1);
    ctx.fillRect(2.8, 0.5, 2.5, 1.1);
  } else if (pose.face === 'hurt') {
    ctx.strokeStyle = t.hair[0];
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-2, 0); ctx.lineTo(0.2, 1.2); ctx.lineTo(-2, 2);
    ctx.moveTo(4.8, 0); ctx.lineTo(2.6, 1.2); ctx.lineTo(4.8, 2);
    ctx.stroke();
  } else {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-1.8, -0.4, 2.4, 2.1);
    ctx.fillRect(2.6, -0.4, 2.4, 2.1);
    ctx.fillStyle = '#120d17';
    ctx.fillRect(-0.8, -0.2, 1.4, 1.9);
    ctx.fillRect(3.5, -0.2, 1.4, 1.9);
  }

  if (hairStyle === 'hooded') {
    ctx.beginPath();
    ctx.moveTo(-8.8, 3.0);
    ctx.quadraticCurveTo(-9.5, -8.5, -1.0, -10.2);
    ctx.quadraticCurveTo(7.0, -9.8, 7.6, -2.5);
    ctx.lineTo(5.2, -1.8);
    ctx.quadraticCurveTo(0.5, -4.6, -5.4, -2.0);
    ctx.lineTo(-6.2, 3.2);
    ctx.closePath();
    ctx.fillStyle = t.cloak[2];
    ctx.fill();
    ctx.strokeStyle = '#120d17';
    ctx.lineWidth = 1.0;
    ctx.stroke();
  } else if (hairStyle === 'short') {
    ctx.beginPath();
    ctx.moveTo(-7.2, 0.8);
    ctx.quadraticCurveTo(-7.5, -6.5, -1.5, -8.0);
    ctx.quadraticCurveTo(4.5, -8.5, 6.8, -3.5);
    ctx.lineTo(5.6, -1.6);
    ctx.lineTo(0.4, -2.0);
    ctx.lineTo(-5.2, 1.2);
    ctx.closePath();
    ctx.fillStyle = t.hair[2];
    ctx.fill();
    ctx.strokeStyle = '#120d17';
    ctx.lineWidth = 1.0;
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(-8.2, 1.5);
    ctx.quadraticCurveTo(-9.2, -6.5, -2.5, -9.2);
    ctx.quadraticCurveTo(4.5, -10.0, 7.8, -4.5);
    ctx.lineTo(6.5, -1.2);
    ctx.lineTo(4.2, -3.2);
    ctx.lineTo(2.5, -0.8);
    ctx.lineTo(0.2, -3.5);
    ctx.lineTo(-2.2, -0.8);
    ctx.lineTo(-4.2, -3.2);
    ctx.lineTo(-5.8, 2.2);
    ctx.closePath();
    const hairGrad = ctx.createLinearGradient(-6, -9, 5, 2);
    hairGrad.addColorStop(0, t.hair[4]);
    hairGrad.addColorStop(0.5, t.hair[2]);
    hairGrad.addColorStop(1, t.hair[1]);
    ctx.fillStyle = hairGrad;
    ctx.fill();
    ctx.strokeStyle = '#120d17';
    ctx.lineWidth = 1.0;
    ctx.stroke();
  }
  ctx.restore();

  // Front arm
  if (pose.frontArm) {
    const fa = pose.frontArm;
    const sx = chestX - 3.5;
    const sy = chestY - 0.5;
    const ex = sx + fa.ex;
    const ey = sy + fa.ey;
    const hx = sx + fa.hx;
    const hy = sy + fa.hy;
    drawLimb(ctx, sx, sy, ex, ey, 3.3, 2.8, t.metal[0], t.metal[2], t.metal[3]);
    drawLimb(ctx, ex, ey, hx, hy, 2.9, 2.4, t.leather[0], t.leather[2], t.leather[3]);
    if (fa.swordAngle !== undefined) {
      drawWeapon(ctx, hx, hy, fa.swordAngle, fa.slashFX, t, weaponType);
    }
    ctx.fillStyle = '#f0a884';
    ctx.beginPath();
    ctx.arc(hx, hy, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#120d17';
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }

  ctx.restore();
}

export function rasterizePoseToCanvas(
  pose: SkeletonPose,
  opts: {
    theme: PaletteTheme;
    weapon: WeaponType;
    hair: HairStyle;
    ditherPct?: number;
    rimLight?: boolean;
    outlineMode?: '4way' | '8way' | 'none';
  },
): HTMLCanvasElement {
  const { offCtx, outCanvas, outCtx } = ensureBuffers();
  const pal = buildPaletteRgb(opts.theme);

  offCtx.clearRect(0, 0, CELL_SIZE, CELL_SIZE);
  drawVectorSkeleton(offCtx, pose, opts.theme, opts.weapon, opts.hair);

  const src = offCtx.getImageData(0, 0, CELL_SIZE, CELL_SIZE).data;
  const outData = outCtx.createImageData(CELL_SIZE, CELL_SIZE);
  const dst = outData.data;

  pooledMask.fill(0);
  pooledIdxMap.fill(0);

  const ditherSpread = ((opts.ditherPct ?? 0) / 100) * 52;
  for (let y = 0; y < CELL_SIZE; y++) {
    const by = (y & 3) << 2;
    for (let x = 0; x < CELL_SIZE; x++) {
      const i = y * CELL_SIZE + x;
      const idx = i * 4;
      if (src[idx + 3] >= 115) {
        pooledMask[i] = 1;
        let r = src[idx];
        let g = src[idx + 1];
        let b = src[idx + 2];
        if (ditherSpread > 0) {
          const dOff = BAYER_4X4[by + (x & 3)] * ditherSpread;
          r = Math.max(0, Math.min(255, r + dOff));
          g = Math.max(0, Math.min(255, g + dOff));
          b = Math.max(0, Math.min(255, b + dOff));
        }
        const palIdx = nearestPaletteIndex(r, g, b, pal);
        pooledIdxMap[i] = palIdx;
        const p = pal[palIdx];
        dst[idx] = p[0];
        dst[idx + 1] = p[1];
        dst[idx + 2] = p[2];
        dst[idx + 3] = 255;
      }
    }
  }

  if (opts.rimLight) {
    for (let y = 1; y < CELL_SIZE; y++) {
      for (let x = 1; x < CELL_SIZE; x++) {
        const p = y * CELL_SIZE + x;
        if (pooledMask[p] === 1 && (pooledMask[p - CELL_SIZE] === 0 || pooledMask[p - 1] === 0)) {
          const rp = pal[RIM_STEP_UP[pooledIdxMap[p]]];
          const o = p * 4;
          dst[o] = rp[0];
          dst[o + 1] = rp[1];
          dst[o + 2] = rp[2];
        }
      }
    }
  }

  const outlineMode = opts.outlineMode ?? '4way';
  if (outlineMode !== 'none') {
    const use8Way = outlineMode === '8way';
    for (let y = 0; y < CELL_SIZE; y++) {
      for (let x = 0; x < CELL_SIZE; x++) {
        const p = y * CELL_SIZE + x;
        if (pooledMask[p] === 0) {
          let hit =
            (x > 0 && pooledMask[p - 1] === 1) ||
            (x < CELL_SIZE - 1 && pooledMask[p + 1] === 1) ||
            (y > 0 && pooledMask[p - CELL_SIZE] === 1) ||
            (y < CELL_SIZE - 1 && pooledMask[p + CELL_SIZE] === 1);
          if (!hit && use8Way) {
            hit =
              (x > 0 && y > 0 && pooledMask[p - CELL_SIZE - 1] === 1) ||
              (x < CELL_SIZE - 1 && y > 0 && pooledMask[p - CELL_SIZE + 1] === 1) ||
              (x > 0 && y < CELL_SIZE - 1 && pooledMask[p + CELL_SIZE - 1] === 1) ||
              (x < CELL_SIZE - 1 && y < CELL_SIZE - 1 && pooledMask[p + CELL_SIZE + 1] === 1);
          }
          if (hit) {
            const o = p * 4;
            dst[o] = 18;
            dst[o + 1] = 13;
            dst[o + 2] = 23;
            dst[o + 3] = 255;
          }
        }
      }
    }
  }

  outCtx.putImageData(outData, 0, 0);

  const cellCanvas = document.createElement('canvas');
  cellCanvas.width = CELL_SIZE;
  cellCanvas.height = CELL_SIZE;
  const ctx = cellCanvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  const shWidth = pose.rot && Math.abs(pose.rot) > 45 ? 40 : 22;
  ctx.fillRect(Math.floor((CELL_SIZE - shWidth) / 2), 63, shWidth, 3);
  ctx.drawImage(outCanvas, 0, 0);
  return cellCanvas;
}

export function compileActionFromSpec(name: string, spec: ActionCompileSpec): CompiledAction {
  const theme = resolveTheme(spec.theme);
  const weapon = spec.weapon ?? 'broadsword';
  const hair = spec.hair ?? 'ranger';
  const autoTweens = Math.max(0, Math.min(4, spec.autoTweens ?? 0));
  const easing = spec.easing ?? 'linear';
  const keyframes = spec.keyframes ?? [];

  const expanded: KeyframeNode[] = [];
  for (let i = 0; i < keyframes.length; i++) {
    expanded.push(keyframes[i]);
    if (autoTweens > 0 && i < keyframes.length - 1) {
      for (let step = 1; step <= autoTweens; step++) {
        expanded.push(interpolateKeyframe(keyframes[i], keyframes[i + 1], step / (autoTweens + 1), easing));
      }
    }
  }

  const frames: HTMLCanvasElement[] = [];
  const boxes: FrameBoxSpec[] = [];

  expanded.forEach((kf, idx) => {
    frames.push(
      rasterizePoseToCanvas(kf, {
        theme,
        weapon,
        hair,
        ditherPct: spec.ditherPct ?? 0,
        rimLight: spec.rimLight ?? false,
        outlineMode: spec.outlineMode ?? '4way',
      }),
    );

    const isLying = kf.rot && Math.abs(kf.rot) > 45;
    const hurt: BoxRect = kf.hurtbox ?? (
      isLying
        ? { x: 14, y: 45, w: 42, h: 17 }
        : {
            x: Math.round(25 + (kf.tx || 0) + (kf.lean || 0) * 0.6),
            y: Math.round(14 + (kf.ty || 0)),
            w: 22,
            h: 48,
          }
    );

    const defaultHitBase = spec.defaultHitbox ?? { x: 40, y: 20, w: 28, h: 32 };
    const isActive =
      kf.hitbox?.active ??
      (Array.isArray(spec.activeFrames) ? spec.activeFrames.includes(idx) : Boolean(kf.frontArm?.slashFX));

    boxes.push({
      hurt,
      hit: {
        x: kf.hitbox?.x ?? defaultHitBase.x,
        y: kf.hitbox?.y ?? defaultHitBase.y,
        w: kf.hitbox?.w ?? defaultHitBase.w,
        h: kf.hitbox?.h ?? defaultHitBase.h,
        active: isActive,
      },
    });
  });

  return {
    name,
    fps: spec.fps ?? 10,
    loop: spec.loop ?? true,
    frames,
    boxes,
  };
}

/**
 * 4-bit Auto-Tiling 像素磚塊繪製器 (每個 tile 16×16 像素)
 */
export function drawAutoTile(
  ctx: CanvasRenderingContext2D,
  kind: TileKind,
  px: number,
  py: number,
  size: number,
  topOpen: boolean,
  bottomOpen: boolean,
  leftOpen: boolean,
  rightOpen: boolean,
) {
  if (kind === 'empty' || kind === 'torch') return;

  if (kind === 'platform') {
    ctx.fillStyle = '#472a1a';
    ctx.fillRect(px, py, size, 6);
    ctx.fillStyle = '#8c583a';
    ctx.fillRect(px, py + 1, size, 2);
    ctx.fillStyle = '#b07450';
    ctx.fillRect(px + 1, py + 1, size - 2, 1);
    ctx.fillStyle = '#120d17';
    ctx.fillRect(px, py + 5, size, 1);
    return;
  }

  if (kind === 'spike') {
    ctx.fillStyle = '#120d17';
    for (let sx = 0; sx < size; sx += 8) {
      ctx.beginPath();
      ctx.moveTo(px + sx, py + size);
      ctx.lineTo(px + sx + 4, py + 3);
      ctx.lineTo(px + sx + 8, py + size);
      ctx.closePath();
      ctx.fillStyle = '#8fa3bf';
      ctx.fill();
      ctx.strokeStyle = '#120d17';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(px + sx + 3, py + 6, 1, 5);
    }
    return;
  }

  const baseColor = kind === 'brick' ? '#2c2438' : '#1f222e';
  const midColor = kind === 'brick' ? '#403452' : '#32384a';
  const hiColor = kind === 'brick' ? '#5c4b75' : '#4b536b';

  ctx.fillStyle = baseColor;
  ctx.fillRect(px, py, size, size);

  // 磚塊內接縫紋理
  ctx.fillStyle = midColor;
  ctx.fillRect(px + 2, py + 2, size - 4, size - 4);
  ctx.fillStyle = '#161320';
  ctx.fillRect(px, py + Math.floor(size / 2), size, 1);
  ctx.fillRect(px + Math.floor(size / 2), py, 1, Math.floor(size / 2));

  // 4-bit Auto-Tiling 邊緣高光與青苔草皮
  if (topOpen) {
    if (kind === 'moss') {
      ctx.fillStyle = '#125226';
      ctx.fillRect(px, py, size, 5);
      ctx.fillStyle = '#32ab4f';
      ctx.fillRect(px, py + 1, size, 2);
      ctx.fillStyle = '#66d978';
      ctx.fillRect(px + 2, py + 1, size - 4, 1);
      // 垂落青苔齒
      ctx.fillStyle = '#1e7d39';
      ctx.fillRect(px + 3, py + 5, 2, 2);
      ctx.fillRect(px + 10, py + 5, 3, 3);
    } else {
      ctx.fillStyle = hiColor;
      ctx.fillRect(px, py + 1, size, 2);
    }
    ctx.fillStyle = '#120d17';
    ctx.fillRect(px, py, size, 1);
  }
  if (bottomOpen) {
    ctx.fillStyle = '#120d17';
    ctx.fillRect(px, py + size - 1, size, 1);
  }
  if (leftOpen) {
    ctx.fillStyle = '#120d17';
    ctx.fillRect(px, py, 1, size);
  }
  if (rightOpen) {
    ctx.fillStyle = '#120d17';
    ctx.fillRect(px + size - 1, py, 1, size);
  }
}

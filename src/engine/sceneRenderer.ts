import { getEntityWorldBox, VIEW_H, VIEW_W } from './physicsStepper';
import type { VfxSystem } from './vfxSystem';
import type {
  CompiledAction,
  GamePhase,
  ParallaxLayerSpec,
  PickupNode,
  PointLightSpec,
  PortalNode,
  RuntimeEntity,
} from './types';

export interface SceneRenderState {
  tick: number;
  camX: number;
  camY: number;
  camTrauma: number;
  nextRand: () => number;
  skyTopColor: string;
  skyBottomColor: string;
  ambientDarkness: number;
  parallaxLayers: ParallaxLayerSpec[];
  tileMapCanvas: HTMLCanvasElement | null;
  tileSize: number;
  tileRows: number;
  tileCols: number;
  torchPositions: Array<{ x: number; y: number }>;
  entityList: RuntimeEntity[];
  compiledActions: Map<string, CompiledAction>;
  pointLights: PointLightSpec[];
  lightCanvas: HTMLCanvasElement;
  lightCtx: CanvasRenderingContext2D;
  vfxSystem: VfxSystem;
  portals: PortalNode[];
  isPortalUnlocked: (portal: PortalNode) => boolean;
  pickups: PickupNode[];
  gamePhase: GamePhase;
  stageId: string;
  stageTitle: string;
  stageBannerTicks: number;
  endBannerTitle: string;
  endBannerSubtitle: string;
  keysCollected: string[];
  score: number;
  defeatedCount: number;
  playTimeTicks: number;
}

export function renderEngineScene(
  ctx: CanvasRenderingContext2D,
  state: SceneRenderState,
  opts: { showDebug?: boolean; enableLighting?: boolean } = {},
): void {
  const shakeMag = state.camTrauma * state.camTrauma * 9;
  const sx = shakeMag > 0.1 ? Math.round((state.nextRand() - 0.5) * 2 * shakeMag) : 0;
  const sy = shakeMag > 0.1 ? Math.round((state.nextRand() - 0.5) * 2 * shakeMag) : 0;
  const camRx = Math.round(state.camX);
  const camRy = Math.round(state.camY);

  ctx.save();

  // 1. Sky gradient backdrop
  const skyGrad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  skyGrad.addColorStop(0, state.skyTopColor);
  skyGrad.addColorStop(1, state.skyBottomColor);
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  // 2. Parallax layers
  for (const layer of state.parallaxLayers) {
    const offX = -(camRx * layer.speed);
    if (layer.type === 'stars') {
      ctx.fillStyle = layer.color;
      for (let i = 0; i < 42; i++) {
        const px = (((i * 73 + 19 + Math.round(offX)) % VIEW_W) + VIEW_W) % VIEW_W;
        const py = (i * 37 + 13) % Math.round(VIEW_H * 0.65);
        ctx.fillRect(px, py, i % 5 === 0 ? 2 : 1, i % 5 === 0 ? 2 : 1);
      }
    } else if (layer.type === 'mountains') {
      ctx.fillStyle = layer.color;
      const base = Math.round(VIEW_H * (layer.heightRatio ?? 0.72));
      for (let i = -1; i < 8; i++) {
        const mx = ((i * 96 + (offX % 96) + 96) % (96 * 8)) - 96;
        ctx.beginPath();
        ctx.moveTo(mx, VIEW_H);
        ctx.lineTo(mx + 48, base - (i % 2 === 0 ? 48 : 34));
        ctx.lineTo(mx + 96, VIEW_H);
        ctx.closePath();
        ctx.fill();
      }
    } else if (layer.type === 'forest') {
      ctx.fillStyle = layer.color;
      const base = Math.round(VIEW_H * (layer.heightRatio ?? 0.8));
      ctx.fillRect(0, base, VIEW_W, VIEW_H - base);
      for (let i = -1; i < 16; i++) {
        const tx = ((i * 38 + (offX % 38) + 38) % (38 * 16)) - 38;
        const h = 24 + ((i * 17) % 20);
        ctx.fillRect(tx + 15, base - h + 8, 6, h);
        ctx.beginPath();
        ctx.moveTo(tx + 18, base - h);
        ctx.lineTo(tx + 4, base - 6);
        ctx.lineTo(tx + 32, base - 6);
        ctx.closePath();
        ctx.fill();
      }
    } else if (layer.type === 'ruins') {
      ctx.fillStyle = layer.color;
      const base = Math.round(VIEW_H * (layer.heightRatio ?? 0.84));
      for (let i = -1; i < 10; i++) {
        const rx = ((i * 64 + (offX % 64) + 64) % (64 * 10)) - 64;
        const pillarH = 44 + ((i * 23) % 36);
        ctx.fillRect(rx + 8, base - pillarH, 12, pillarH + 50);
        if (i % 2 === 0) ctx.fillRect(rx + 4, base - pillarH - 4, 20, 5);
      }
    }
  }

  ctx.translate(-camRx + sx, -camRy + sy);

  // 3. Auto-tiled map & animated pixel torches
  if (state.tileMapCanvas) {
    ctx.drawImage(state.tileMapCanvas, 0, 0);
  } else {
    ctx.fillStyle = '#1f222e';
    ctx.fillRect(0, VIEW_H - 28, VIEW_W, 28);
    ctx.fillStyle = '#32ab4f';
    ctx.fillRect(0, VIEW_H - 28, VIEW_W, 3);
  }

  for (const tc of state.torchPositions) {
    ctx.fillStyle = '#472a1a';
    ctx.fillRect(tc.x - 2, tc.y - 4, 4, 11);
    const flick = ((state.tick >> 2) + tc.x) % 3;
    ctx.fillStyle = '#f97316';
    ctx.fillRect(tc.x - 3, tc.y - 9 - flick, 6, 6);
    ctx.fillStyle = '#ffe36e';
    ctx.fillRect(tc.x - 2, tc.y - 8 - (flick % 2), 4, 4);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(tc.x - 1, tc.y - 7, 2, 2);
  }

  // 3B. Stage Portals
  for (const p of state.portals) {
    const unlocked = state.isPortalUnlocked(p);
    const px = Math.round(p.x);
    const py = Math.round(p.y);
    const hw = Math.round(p.w / 2);
    const h = Math.round(p.h);
    const pulse = Math.sin(state.tick * 0.14) * 2;

    // Stone portal arch frame
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(px - hw - 3, py - h - 4, p.w + 6, h + 4);
    ctx.fillStyle = '#090c12';
    ctx.fillRect(px - hw, py - h, p.w, h);

    if (unlocked) {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = 0.38;
      ctx.fillRect(px - hw + 2, py - h + 2, p.w - 4, h - 2);
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2;
      ctx.strokeRect(px - hw + 3, py - h + 3, p.w - 6, h - 4);
      ctx.beginPath();
      ctx.arc(px, py - Math.round(h * 0.5), Math.max(4, Math.round(hw * 0.6 + pulse)), 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(px - 2, py - Math.round(h * 0.5) - 2, 4, 4);
    } else {
      ctx.fillStyle = 'rgba(100, 116, 139, 0.25)';
      ctx.fillRect(px - hw + 2, py - h + 2, p.w - 4, h - 2);
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(px - 3, py - Math.round(h * 0.5) - 3, 6, 6);
    }

    ctx.font = 'bold 8px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = unlocked ? '#4ade80' : '#94a3b8';
    const tag = unlocked ? (p.label ?? 'PORTAL') : (p.unlock === 'require_key' ? 'KEY LOCKED' : 'SEALED');
    ctx.fillText(tag, px, py - h - 8);
    ctx.textAlign = 'left';
  }

  // 3C. Collectible Pickups
  for (const pk of state.pickups) {
    if (pk.collected) continue;
    const bob = Math.round(Math.sin(state.tick * 0.12 + pk.x * 0.05) * 2.5);
    const px = Math.round(pk.x);
    const py = Math.round(pk.y + bob);

    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(px - 5, Math.round(pk.y) + 8, 10, 2);

    if (pk.kind === 'key') {
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(px - 4, py - 6, 8, 6);
      ctx.fillStyle = '#090b10';
      ctx.fillRect(px - 2, py - 4, 4, 2);
      ctx.fillStyle = '#fde68a';
      ctx.fillRect(px - 1, py, 2, 7);
      ctx.fillRect(px + 1, py + 3, 3, 2);
      ctx.fillRect(px + 1, py + 6, 2, 1);
    } else if (pk.kind === 'heal') {
      ctx.fillStyle = '#16a34a';
      ctx.fillRect(px - 5, py - 5, 10, 10);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(px - 1, py - 3, 2, 6);
      ctx.fillRect(px - 3, py - 1, 6, 2);
    } else {
      ctx.fillStyle = pk.color;
      ctx.beginPath();
      ctx.moveTo(px, py - 7);
      ctx.lineTo(px + 6, py);
      ctx.lineTo(px, py + 7);
      ctx.lineTo(px - 6, py);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(px - 1, py - 3, 2, 2);
    }
  }

  // 4. Afterimages
  state.vfxSystem.renderAfterimages(ctx);

  // 5. Entities
  for (const ent of state.entityList) {
    if (ent.defeated) continue;

    // Telegraph strike lane preview before Enemy/Boss lunges or slams
    if (ent.kind === 'enemy' && ent.aiState === 'telegraph') {
      const pulseAlpha = 0.25 + 0.2 * Math.sin(state.tick * 0.6);
      ctx.fillStyle = `rgba(239, 68, 68, ${pulseAlpha})`;
      const laneW = ent.isBoss ? 84 : 52;
      const laneX = ent.aiTargetDir >= 0 ? ent.x : ent.x - laneW;
      ctx.fillRect(Math.round(laneX), Math.round(ent.y - 36 * (ent.scale || 1)), laneW, Math.round(36 * (ent.scale || 1)));
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 1;
      ctx.strokeRect(Math.round(laneX) + 0.5, Math.round(ent.y - 36 * (ent.scale || 1)) + 0.5, laneW - 1, Math.round(36 * (ent.scale || 1)) - 1);
    }

    if (ent.kind === 'dummy') {
      const dx = Math.round(ent.x);
      const dy = Math.round(ent.y);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(dx - 13, dy - 2, 26, 3);
      ctx.fillStyle = ent.flashTicks > 0 ? '#ffffff' : '#694028';
      ctx.fillRect(dx - 4, dy - 48, 8, 46);
      ctx.fillStyle = ent.flashTicks > 0 ? '#ffffff' : '#8c583a';
      ctx.fillRect(dx - 11, dy - 38, 22, 22);
      ctx.strokeStyle = '#120d17';
      ctx.strokeRect(dx - 11.5, dy - 38.5, 23, 23);
      ctx.fillStyle = ent.flashTicks > 0 ? '#ffe36e' : '#b91c1c';
      ctx.fillRect(dx - 3, dy - 30, 6, 6);
    } else {
      const act = state.compiledActions.get(ent.state) ?? state.compiledActions.get('idle');
      if (act && act.frames.length > 0 && (ent.invulnTicks === 0 || ent.invulnTicks % 4 < 2)) {
        const sprite = act.frames[ent.frameIdx % act.frames.length];
        const scale = ent.scale || 1;
        ctx.save();
        ctx.translate(Math.round(ent.x), Math.round(ent.y - 64 * scale));
        ctx.scale(ent.facing * scale, scale);
        if (ent.isBoss) {
          ctx.filter =
            ent.flashTicks > 0
              ? 'brightness(2.5)'
              : ent.bossPhase === 2
                ? 'hue-rotate(-40deg) saturate(1.9) contrast(1.15)'
                : 'hue-rotate(-25deg) saturate(1.5)';
        } else if (ent.kind === 'enemy') {
          ctx.filter = ent.flashTicks > 0 ? 'brightness(2.5)' : 'hue-rotate(155deg) saturate(1.4)';
        } else if (ent.flashTicks > 0) {
          ctx.filter = 'brightness(2.2)';
        }
        ctx.drawImage(sprite, -36, 0);
        ctx.restore();
      }
    }

    if (ent.kind === 'enemy' && ent.aiState === 'telegraph') {
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ef4444';
      ctx.fillText('!', Math.round(ent.x), Math.round(ent.y - 66 * (ent.scale || 1)));
      ctx.textAlign = 'left';
    }

    if (ent.kind !== 'player' && !ent.isBoss) {
      const pct = Math.max(0, ent.hp / ent.maxHp);
      ctx.fillStyle = '#09080f';
      ctx.fillRect(Math.round(ent.x - 14), Math.round(ent.y - 58), 28, 4);
      ctx.fillStyle = ent.kind === 'enemy' ? '#f87171' : '#4ade80';
      ctx.fillRect(Math.round(ent.x - 13), Math.round(ent.y - 57), Math.round(26 * pct), 2);
    }
  }

  // 6. Slash Arcs & Bouncy Pixel Particles
  state.vfxSystem.renderForeground(ctx);

  // 7. Stepped 2D Pixel Lighting Pass
  if (opts.enableLighting !== false && (state.ambientDarkness > 0.02 || state.pointLights.length > 0)) {
    const lCtx = state.lightCtx;
    lCtx.globalCompositeOperation = 'source-over';
    lCtx.clearRect(0, 0, VIEW_W, VIEW_H);
    lCtx.fillStyle = `rgba(6, 7, 15, ${state.ambientDarkness})`;
    lCtx.fillRect(0, 0, VIEW_W, VIEW_H);

    lCtx.globalCompositeOperation = 'destination-out';
    for (const light of state.pointLights) {
      let lx = light.x;
      let ly = light.y;
      if (light.attachTo) {
        const target = state.entityList.find((e) => e.id === light.attachTo && !e.defeated);
        if (target) {
          lx = target.x + (light.offsetX ?? 0);
          ly = target.y + (light.offsetY ?? -26);
        }
      }
      const screenX = Math.round(lx - camRx);
      const screenY = Math.round(ly - camRy);
      const fOffset = light.flicker ? Math.sin(state.tick * 0.28 + lx * 0.1) * light.flicker * 10 : 0;
      const r = Math.max(12, light.radius + fOffset);

      const steps = [1.0, 0.72, 0.44];
      const alphas = [0.28, 0.45, 0.85];
      for (let s = 0; s < steps.length; s++) {
        lCtx.fillStyle = `rgba(0, 0, 0, ${alphas[s] * (light.intensity ?? 0.9)})`;
        lCtx.beginPath();
        lCtx.arc(screenX, screenY, Math.round(r * steps[s]), 0, Math.PI * 2);
        lCtx.fill();
      }
    }

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(state.lightCanvas, 0, 0);

    ctx.globalCompositeOperation = 'lighter';
    for (const light of state.pointLights) {
      let lx = light.x;
      let ly = light.y;
      if (light.attachTo) {
        const target = state.entityList.find((e) => e.id === light.attachTo && !e.defeated);
        if (target) {
          lx = target.x + (light.offsetX ?? 0);
          ly = target.y + (light.offsetY ?? -26);
        }
      }
      const screenX = Math.round(lx - camRx);
      const screenY = Math.round(ly - camRy);
      const r = Math.round(light.radius * 0.7);
      ctx.globalAlpha = 0.085 * (light.intensity ?? 0.9);
      ctx.fillStyle = light.color;
      ctx.beginPath();
      ctx.arc(screenX, screenY, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // 8. Debug Wireframes
  if (opts.showDebug) {
    if (state.tileRows > 0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      for (let r = 0; r <= state.tileRows; r++) {
        ctx.beginPath();
        ctx.moveTo(0, r * state.tileSize);
        ctx.lineTo(state.tileCols * state.tileSize, r * state.tileSize);
        ctx.stroke();
      }
      for (let c = 0; c <= state.tileCols; c++) {
        ctx.beginPath();
        ctx.moveTo(c * state.tileSize, 0);
        ctx.lineTo(c * state.tileSize, state.tileRows * state.tileSize);
        ctx.stroke();
      }
    }

    for (const ent of state.entityList) {
      if (ent.defeated) continue;
      const hurt = getEntityWorldBox(ent, state.compiledActions, 'hurt');
      ctx.strokeStyle = '#4ade80';
      ctx.strokeRect(hurt.x + 0.5, hurt.y + 0.5, hurt.w - 1, hurt.h - 1);
      const hit = getEntityWorldBox(ent, state.compiledActions, 'hit');
      if (hit.active) {
        ctx.fillStyle = 'rgba(248, 113, 113, 0.28)';
        ctx.fillRect(hit.x, hit.y, hit.w, hit.h);
        ctx.strokeStyle = '#f87171';
        ctx.strokeRect(hit.x + 0.5, hit.y + 0.5, hit.w - 1, hit.h - 1);
      }
    }
  }

  // 9. Popups (world space)
  state.vfxSystem.renderPopups(ctx);

  // 10. Screen-Space Tactical HUD (Top-Left Player/Stage, Top-Center Boss HP, Victory/Game Over Overlay)
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  const player = state.entityList.find((e) => e.kind === 'player');
  if (player) {
    const hpPct = Math.max(0, Math.min(1, player.hp / Math.max(1, player.maxHp)));
    ctx.fillStyle = 'rgba(9, 11, 16, 0.78)';
    ctx.fillRect(8, 8, 134, 24);
    ctx.strokeStyle = '#232a3b';
    ctx.strokeRect(8.5, 8.5, 133, 23);

    ctx.font = 'bold 8px monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(state.stageId.toUpperCase().replace(/_/g, ' ').slice(0, 12), 13, 17);

    ctx.fillStyle = '#1e293b';
    ctx.fillRect(13, 20, 86, 6);
    ctx.fillStyle = hpPct > 0.35 ? '#4ade80' : '#f87171';
    ctx.fillRect(13, 20, Math.round(86 * hpPct), 6);

    ctx.fillStyle = '#f1f5f9';
    ctx.fillText(`${player.hp}`, 104, 26);

    if (state.keysCollected.length > 0) {
      ctx.textAlign = 'right';
      ctx.fillStyle = '#fbbf24';
      ctx.fillText(`KEY×${state.keysCollected.length}`, 137, 17);
      ctx.textAlign = 'left';
    }
  }

  const activeBoss = state.entityList.find((e) => e.isBoss && !e.defeated);
  if (activeBoss) {
    const bw = 200;
    const bx = Math.round((VIEW_W - bw) / 2);
    const by = 10;
    const bpct = Math.max(0, Math.min(1, activeBoss.hp / Math.max(1, activeBoss.maxHp)));

    ctx.fillStyle = 'rgba(9, 11, 16, 0.85)';
    ctx.fillRect(bx - 6, by - 2, bw + 12, 22);
    ctx.strokeStyle = activeBoss.bossPhase === 2 ? '#f97316' : '#ef4444';
    ctx.strokeRect(bx - 5.5, by - 1.5, bw + 11, 21);

    ctx.font = 'bold 8px monospace';
    ctx.fillStyle = activeBoss.bossPhase === 2 ? '#fb923c' : '#fca5a5';
    const bossHeader = `${activeBoss.label ?? 'BOSS'}${activeBoss.bossPhase === 2 ? ' [ENRAGED]' : ''}`;
    ctx.fillText(bossHeader, bx, by + 7);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#f1f5f9';
    ctx.fillText(`${activeBoss.hp}/${activeBoss.maxHp}`, bx + bw, by + 7);
    ctx.textAlign = 'left';

    ctx.fillStyle = '#1f1215';
    ctx.fillRect(bx, by + 10, bw, 6);
    ctx.fillStyle = activeBoss.bossPhase === 2 ? '#f97316' : '#ef4444';
    ctx.fillRect(bx, by + 10, Math.round(bw * bpct), 6);
  }

  if (state.stageBannerTicks > 0 && state.gamePhase === 'playing') {
    const alpha = Math.min(1, state.stageBannerTicks / 30);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(9, 11, 16, 0.82)';
    ctx.fillRect(110, 44, 260, 26);
    ctx.strokeStyle = '#38bdf8';
    ctx.strokeRect(110.5, 44.5, 259, 25);
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText(state.stageTitle, VIEW_W / 2, 61);
    ctx.restore();
  }

  if (state.gamePhase !== 'playing') {
    const isVictory = state.gamePhase === 'victory';
    ctx.fillStyle = 'rgba(7, 9, 15, 0.74)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    const cardW = 292;
    const cardH = 122;
    const cx = Math.round((VIEW_W - cardW) / 2);
    const cy = Math.round((VIEW_H - cardH) / 2);

    ctx.fillStyle = '#0f131d';
    ctx.fillRect(cx, cy, cardW, cardH);
    ctx.strokeStyle = isVictory ? '#4ade80' : '#ef4444';
    ctx.lineWidth = 2;
    ctx.strokeRect(cx + 1, cy + 1, cardW - 2, cardH - 2);

    ctx.textAlign = 'center';
    ctx.font = 'bold 18px monospace';
    ctx.fillStyle = isVictory ? '#4ade80' : '#f87171';
    ctx.fillText(state.endBannerTitle || (isVictory ? 'VICTORY' : 'GAME OVER'), VIEW_W / 2, cy + 34);

    ctx.font = '10px monospace';
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(state.endBannerSubtitle || 'PRESS R TO RESTART', VIEW_W / 2, cy + 54);

    const sec = (state.playTimeTicks / 60).toFixed(1);
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`SCORE ${state.score}  ·  DEFEATED ${state.defeatedCount}  ·  TIME ${sec}s`, VIEW_W / 2, cy + 76);

    ctx.fillStyle = isVictory ? '#16a34a' : '#b91c1c';
    ctx.fillRect(VIEW_W / 2 - 78, cy + 88, 156, 20);
    ctx.font = 'bold 10px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('[ PRESS R TO RESTART ]', VIEW_W / 2, cy + 102);
    ctx.textAlign = 'left';
  }

  ctx.restore();
}


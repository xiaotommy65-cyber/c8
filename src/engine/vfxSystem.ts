import type { AfterimageOpts, SlashArcOpts, VFXBurstOpts } from './types';

export interface InternalParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  bounce: boolean;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

export interface InternalSlashArc {
  x: number;
  y: number;
  facing: 1 | -1;
  radius: number;
  color: string;
  coreColor: string;
  life: number;
  maxLife: number;
}

export interface InternalAfterimage {
  x: number;
  y: number;
  facing: 1 | -1;
  canvas: HTMLCanvasElement;
  color: string;
  life: number;
  maxLife: number;
  alpha: number;
}

export interface InternalPopup {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
}

export class VfxSystem {
  public particles: InternalParticle[] = [];
  public slashArcs: InternalSlashArc[] = [];
  public afterimages: InternalAfterimage[] = [];
  public popups: InternalPopup[] = [];

  private nextRand: () => number;

  constructor(randFn: () => number) {
    this.nextRand = randFn;
  }

  public burst(x: number, y: number, opts: VFXBurstOpts = {}): void {
    const count = opts.count ?? 14;
    const baseAngle = ((opts.angleDeg ?? -90) * Math.PI) / 180;
    const spread = ((opts.spread ?? 360) * Math.PI) / 180;
    const spdBase = opts.speed ?? 2.8;
    for (let i = 0; i < count; i++) {
      const a = baseAngle + (this.nextRand() - 0.5) * spread;
      const s = spdBase * (0.45 + this.nextRand() * 0.9);
      const life = opts.life ?? (16 + Math.floor(this.nextRand() * 14));
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        gravity: opts.gravity ?? 0.14,
        bounce: opts.bounce ?? true,
        life,
        maxLife: life,
        color: i % 2 === 0 ? (opts.color ?? '#ffe36e') : (opts.colorB ?? '#ffffff'),
        size: opts.size ?? (i % 3 === 0 ? 3 : 2),
      });
    }
  }

  public slashArc(x: number, y: number, facing: 1 | -1, opts: SlashArcOpts = {}): void {
    const life = opts.life ?? 9;
    this.slashArcs.push({
      x,
      y,
      facing,
      radius: opts.radius ?? 24,
      color: opts.color ?? '#66d978',
      coreColor: opts.coreColor ?? '#ffffff',
      life,
      maxLife: life,
    });
  }

  public addAfterimage(
    x: number,
    y: number,
    facing: 1 | -1,
    canvas: HTMLCanvasElement,
    opts: AfterimageOpts = {},
  ): void {
    const life = opts.life ?? 12;
    this.afterimages.push({
      x,
      y,
      facing,
      canvas,
      color: opts.color ?? '#38bdf8',
      life,
      maxLife: life,
      alpha: opts.alpha ?? 0.55,
    });
  }

  public popup(x: number, y: number, text: string, color = '#ffe36e'): void {
    this.popups.push({ x, y, text, color, life: 36 });
  }

  public clear(): void {
    this.particles = [];
    this.slashArcs = [];
    this.afterimages = [];
    this.popups = [];
  }

  public step(hasTilemap: boolean, isSolidAtPixel: (x: number, y: number) => boolean): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.x += pt.vx;
      pt.y += pt.vy;
      pt.vy += pt.gravity;
      if (pt.bounce && hasTilemap && isSolidAtPixel(pt.x, pt.y)) {
        pt.y -= pt.vy;
        pt.vy = -Math.abs(pt.vy) * 0.55;
        pt.vx *= 0.72;
      }
      pt.life--;
      if (pt.life <= 0) this.particles.splice(i, 1);
    }

    for (let i = this.slashArcs.length - 1; i >= 0; i--) {
      this.slashArcs[i].life--;
      if (this.slashArcs[i].life <= 0) this.slashArcs.splice(i, 1);
    }

    for (let i = this.afterimages.length - 1; i >= 0; i--) {
      this.afterimages[i].life--;
      if (this.afterimages[i].life <= 0) this.afterimages.splice(i, 1);
    }

    for (let i = this.popups.length - 1; i >= 0; i--) {
      this.popups[i].y -= 0.45;
      this.popups[i].life--;
      if (this.popups[i].life <= 0) this.popups.splice(i, 1);
    }
  }

  public renderAfterimages(ctx: CanvasRenderingContext2D): void {
    for (const af of this.afterimages) {
      ctx.save();
      ctx.globalAlpha = (af.life / af.maxLife) * af.alpha;
      ctx.translate(Math.round(af.x), Math.round(af.y - 64));
      ctx.scale(af.facing, 1);
      ctx.drawImage(af.canvas, -36, 0);
      ctx.restore();
    }
  }

  public renderForeground(ctx: CanvasRenderingContext2D): void {
    for (const arc of this.slashArcs) {
      const progress = 1 - arc.life / arc.maxLife;
      ctx.save();
      ctx.globalAlpha = 1 - progress * 0.65;
      ctx.translate(Math.round(arc.x), Math.round(arc.y));
      ctx.scale(arc.facing, 1);
      ctx.beginPath();
      ctx.arc(0, 0, arc.radius + progress * 6, -Math.PI * 0.45, Math.PI * 0.45);
      ctx.strokeStyle = arc.color;
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(2, 0, arc.radius + progress * 6, -Math.PI * 0.35, Math.PI * 0.35);
      ctx.strokeStyle = arc.coreColor;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }

    for (const pt of this.particles) {
      ctx.fillStyle = pt.color;
      ctx.fillRect(Math.round(pt.x), Math.round(pt.y), pt.size, pt.size);
    }
  }

  public renderPopups(ctx: CanvasRenderingContext2D): void {
    ctx.font = 'bold 10px monospace';
    for (const pp of this.popups) {
      ctx.fillStyle = '#000';
      ctx.fillText(pp.text, Math.round(pp.x) + 1, Math.round(pp.y) + 1);
      ctx.fillStyle = pp.color;
      ctx.fillText(pp.text, Math.round(pp.x), Math.round(pp.y));
    }
  }
}

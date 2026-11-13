import { parallel, sequence, tween, wait, waitTicks, waitUntil } from './coroutines';
import type { ChronoForgeEngine } from './ChronoForgeEngine';
import type {
  ActionCompileSpec,
  BoxRect,
  EasingName,
  EnemyAiProfile,
  HairStyle,
  KeyframeNode,
  LDtkJson,
  PaletteTheme,
  ParallaxLayerSpec,
  PickupKind,
  PickupSpec,
  PointLightSpec,
  PortalSpec,
  RuntimeEntity,
  TileKind,
  TiledJson,
  WeaponType,
} from './types';
import { BUILTIN_THEMES } from './types';

export interface FluentActorHandle {
  readonly id: string;
  readonly raw: () => RuntimeEntity | undefined;
  kind: (kind: 'player' | 'enemy' | 'dummy') => FluentActorHandle;
  at: (x: number, y: number) => FluentActorHandle;
  hp: (value: number) => FluentActorHandle;
  speed: (value: number) => FluentActorHandle;
  patrol: (range: number) => FluentActorHandle;
  facing: (dir: 1 | -1) => FluentActorHandle;
  ai: (
    profile: EnemyAiProfile,
    opts?: { aggroRange?: number; attackRange?: number; contactDamage?: number },
  ) => FluentActorHandle;
  boss: (scale?: number, label?: string) => FluentActorHandle;
  respawn: (enabled: boolean) => FluentActorHandle;
  noRespawn: () => FluentActorHandle;
  scale: (factor: number) => FluentActorHandle;
  label: (text: string) => FluentActorHandle;
  theme: (
    theme: PaletteTheme | keyof typeof BUILTIN_THEMES,
    weapon?: WeaponType,
    hair?: HairStyle,
  ) => FluentActorHandle;
  aura: (
    color: string,
    radius?: number,
    opts?: { offsetY?: number; intensity?: number; flicker?: number },
  ) => FluentActorHandle;
  follow: (lerp?: number) => FluentActorHandle;
  act: (actionName: string) => FluentActorHandle;
  say: (text: string, color?: string) => FluentActorHandle;
  on: (
    event: 'hit' | 'hurt' | 'defeated' | 'phase' | string,
    handler: (payload: unknown) => void,
  ) => FluentActorHandle;
}

export interface FluentActionBuilder {
  fps: (n: number) => FluentActionBuilder;
  loop: (enabled: boolean) => FluentActionBuilder;
  tweens: (autoTweens: number, easing?: EasingName) => FluentActionBuilder;
  easing: (easing: EasingName) => FluentActionBuilder;
  dither: (pct: number) => FluentActionBuilder;
  rimLight: (enabled?: boolean) => FluentActionBuilder;
  outline: (mode: '4way' | '8way' | 'none') => FluentActionBuilder;
  hitbox: (rect: BoxRect, activeFrames?: number[]) => FluentActionBuilder;
  theme: (
    theme: PaletteTheme | keyof typeof BUILTIN_THEMES,
    weapon?: WeaponType,
    hair?: HairStyle,
  ) => FluentActionBuilder;
  pose: (keyframe: KeyframeNode) => FluentActionBuilder;
  poses: (keyframes: KeyframeNode[]) => FluentActionBuilder;
  compile: () => FluentActionBuilder;
}

export interface FluentLightBuilder {
  at: (x: number, y: number) => FluentLightBuilder;
  attachTo: (entityId: string, offsetX?: number, offsetY?: number) => FluentLightBuilder;
  radius: (r: number) => FluentLightBuilder;
  color: (hex: string) => FluentLightBuilder;
  intensity: (val: number) => FluentLightBuilder;
  flicker: (val: number) => FluentLightBuilder;
}

export interface FluentPortalBuilder {
  at: (x: number, y: number) => FluentPortalBuilder;
  size: (w: number, h: number) => FluentPortalBuilder;
  to: (targetStage: string, spawnX?: number, spawnY?: number) => FluentPortalBuilder;
  requireKey: (keyName: string) => FluentPortalBuilder;
  requireClear: () => FluentPortalBuilder;
  alwaysOpen: () => FluentPortalBuilder;
  color: (hex: string) => FluentPortalBuilder;
  label: (text: string) => FluentPortalBuilder;
}

export interface FluentPickupBuilder {
  at: (x: number, y: number) => FluentPickupBuilder;
  key: (keyName: string) => FluentPickupBuilder;
  value: (val: number) => FluentPickupBuilder;
  color: (hex: string) => FluentPickupBuilder;
  label: (text: string) => FluentPickupBuilder;
}

export function createFluentDsl(engine: ChronoForgeEngine) {
  const scene = {
    clearWorld(opts?: { keepPlayer?: boolean; clearCoroutines?: boolean }) {
      engine.scene.clearWorld(opts);
      return this;
    },
    sky(topColor: string, bottomColor: string) {
      engine.scene.setSky(topColor, bottomColor);
      return this;
    },
    ambient(darknessAlpha: number) {
      engine.scene.setAmbientLight(darknessAlpha);
      return this;
    },
    parallax(
      type: ParallaxLayerSpec['type'],
      speed: number,
      color: string,
      heightRatio?: number,
    ) {
      engine.scene.addParallaxLayer({ type, speed, color, heightRatio });
      return this;
    },
    tilemap(asciiRows: string[], legend: Record<string, TileKind>, tileSize = 16) {
      engine.scene.compileTilemap(asciiRows, legend, tileSize);
      return this;
    },
    ldtk(ldtkJson: LDtkJson, options?: Parameters<typeof engine.scene.loadLDtk>[1]) {
      engine.scene.loadLDtk(ldtkJson, options);
      return this;
    },
    tiled(tiledJson: TiledJson, options?: Parameters<typeof engine.scene.loadTiled>[1]) {
      engine.scene.loadTiled(tiledJson, options);
      return this;
    },
    cameraFollow(entityOrId: string | FluentActorHandle, lerp = 0.14) {
      const id = typeof entityOrId === 'string' ? entityOrId : entityOrId.id;
      engine.camera.follow(id, lerp);
      return this;
    },
    shake(trauma: number) {
      engine.camera.addTrauma(trauma);
      return this;
    },
  };

  function actor(id: string, defaultKind: 'player' | 'enemy' | 'dummy' = 'player'): FluentActorHandle {
    let existing = engine.entities.get(id);
    if (!existing) {
      existing = engine.entities.spawn({ id, kind: defaultKind, x: 96, y: 192 });
    }

    const handle: FluentActorHandle = {
      id,
      raw: () => engine.entities.get(id),
      kind(kind) {
        const ent = engine.entities.get(id);
        if (ent) ent.kind = kind;
        return handle;
      },
      at(x, y) {
        const ent = engine.entities.get(id);
        if (ent) {
          ent.x = x;
          ent.y = y;
          ent.patrolOriginX = x;
        }
        return handle;
      },
      hp(value) {
        const ent = engine.entities.get(id);
        if (ent) {
          ent.maxHp = value;
          ent.hp = value;
        }
        return handle;
      },
      speed(value) {
        const ent = engine.entities.get(id);
        if (ent) ent.moveSpeed = value;
        return handle;
      },
      patrol(range) {
        const ent = engine.entities.get(id);
        if (ent) ent.patrolRange = range;
        return handle;
      },
      facing(dir) {
        const ent = engine.entities.get(id);
        if (ent) ent.facing = dir;
        return handle;
      },
      ai(profile, opts = {}) {
        const ent = engine.entities.get(id);
        if (ent) {
          ent.aiProfile = profile;
          if (profile === 'boss_warden') {
            ent.isBoss = true;
            ent.aggroRange = opts.aggroRange ?? 360;
            ent.attackRange = opts.attackRange ?? 130;
          } else if (profile === 'charger') {
            ent.aggroRange = opts.aggroRange ?? 175;
            ent.attackRange = opts.attackRange ?? 108;
          } else {
            if (typeof opts.aggroRange === 'number') ent.aggroRange = opts.aggroRange;
            if (typeof opts.attackRange === 'number') ent.attackRange = opts.attackRange;
          }
          if (typeof opts.contactDamage === 'number') ent.contactDamage = opts.contactDamage;
        }
        return handle;
      },
      boss(scale = 1.45, label = 'BOSS') {
        const ent = engine.entities.get(id);
        if (ent) {
          ent.isBoss = true;
          ent.scale = scale;
          ent.label = label;
          if (ent.aiProfile === 'wander') ent.aiProfile = 'boss_warden';
          ent.respawn = false;
        }
        return handle;
      },
      respawn(enabled) {
        const ent = engine.entities.get(id);
        if (ent) ent.respawn = enabled;
        return handle;
      },
      noRespawn() {
        const ent = engine.entities.get(id);
        if (ent) ent.respawn = false;
        return handle;
      },
      scale(factor) {
        const ent = engine.entities.get(id);
        if (ent) ent.scale = factor;
        return handle;
      },
      label(text) {
        const ent = engine.entities.get(id);
        if (ent) ent.label = text;
        return handle;
      },
      theme(theme, weapon, hair) {
        engine.setTheme(theme, weapon, hair);
        return handle;
      },
      aura(color, radius = 84, opts = {}) {
        engine.lights.addPointLight({
          id: `${id}_aura`,
          x: engine.entities.get(id)?.x ?? 0,
          y: engine.entities.get(id)?.y ?? 0,
          attachTo: id,
          offsetY: opts.offsetY ?? -26,
          radius,
          color,
          intensity: opts.intensity ?? 0.88,
          flicker: opts.flicker ?? 0.08,
        });
        return handle;
      },
      follow(lerp = 0.14) {
        engine.camera.follow(id, lerp);
        return handle;
      },
      act(actionName) {
        engine.triggerAction(id, actionName);
        return handle;
      },
      say(text, color = '#ffe36e') {
        const ent = engine.entities.get(id);
        if (ent) {
          engine.vfx.popup(ent.x - 10, ent.y - 52, text, color);
        }
        return handle;
      },
      on(event, handler) {
        if (event === 'hit') {
          engine.signals.on('combat:hit', (payload) => {
            if (payload.attacker.id === id) handler(payload);
          });
        } else if (event === 'hurt') {
          engine.signals.on('entity:hurt', (payload) => {
            if (payload.entity.id === id) handler(payload);
          });
        } else if (event === 'defeated') {
          engine.signals.on('entity:defeated', (payload) => {
            if (payload.entity.id === id) handler(payload);
          });
        } else if (event === 'phase') {
          engine.signals.on('boss:phase', (payload) => {
            if (payload.boss.id === id) handler(payload);
          });
        } else {
          engine.signals.on(event, (payload) => handler(payload));
        }
        return handle;
      },
    };

    return handle;
  }

  const hero = (id = 'hero') => actor(id, 'player');
  const enemy = (id: string) => actor(id, 'enemy');
  const dummy = (id: string) => actor(id, 'dummy');

  function action(name: string): FluentActionBuilder {
    const spec: ActionCompileSpec = {
      keyframes: [],
      fps: 15,
      loop: false,
    };

    const recompileIfReady = () => {
      if (spec.keyframes.length > 0) {
        engine.actions.compile(name, spec);
      }
    };

    const builder: FluentActionBuilder = {
      fps(n) {
        spec.fps = n;
        recompileIfReady();
        return builder;
      },
      loop(enabled) {
        spec.loop = enabled;
        recompileIfReady();
        return builder;
      },
      tweens(autoTweens, easing) {
        spec.autoTweens = autoTweens;
        if (easing) spec.easing = easing;
        recompileIfReady();
        return builder;
      },
      easing(easing) {
        spec.easing = easing;
        recompileIfReady();
        return builder;
      },
      dither(pct) {
        spec.ditherPct = pct;
        recompileIfReady();
        return builder;
      },
      rimLight(enabled = true) {
        spec.rimLight = enabled;
        recompileIfReady();
        return builder;
      },
      outline(mode) {
        spec.outlineMode = mode;
        recompileIfReady();
        return builder;
      },
      hitbox(rect, activeFrames) {
        spec.defaultHitbox = rect;
        if (activeFrames) spec.activeFrames = activeFrames;
        recompileIfReady();
        return builder;
      },
      theme(theme, weapon, hair) {
        spec.theme = theme;
        if (weapon) spec.weapon = weapon;
        if (hair) spec.hair = hair;
        recompileIfReady();
        return builder;
      },
      pose(keyframe) {
        spec.keyframes.push(keyframe);
        recompileIfReady();
        return builder;
      },
      poses(keyframes) {
        spec.keyframes = [...keyframes];
        recompileIfReady();
        return builder;
      },
      compile() {
        recompileIfReady();
        return builder;
      },
    };

    return builder;
  }

  function light(id: string): FluentLightBuilder {
    const existing = engine.lights.list().find((l) => l.id === id);
    const spec: PointLightSpec = existing ?? {
      id,
      x: 160,
      y: 120,
      radius: 80,
      color: '#ffe36e',
      intensity: 0.9,
      flicker: 0.08,
    };
    if (!existing) {
      engine.lights.addPointLight(spec);
    }

    const sync = () => {
      engine.lights.addPointLight(spec);
    };

    const builder: FluentLightBuilder = {
      at(x, y) {
        spec.x = x;
        spec.y = y;
        delete spec.attachTo;
        sync();
        return builder;
      },
      attachTo(entityId, offsetX = 0, offsetY = -26) {
        spec.attachTo = entityId;
        spec.offsetX = offsetX;
        spec.offsetY = offsetY;
        sync();
        return builder;
      },
      radius(r) {
        spec.radius = r;
        sync();
        return builder;
      },
      color(hex) {
        spec.color = hex;
        sync();
        return builder;
      },
      intensity(val) {
        spec.intensity = val;
        sync();
        return builder;
      },
      flicker(val) {
        spec.flicker = val;
        sync();
        return builder;
      },
    };

    return builder;
  }

  function portal(id: string): FluentPortalBuilder {
    const spec: PortalSpec = {
      id,
      x: 420,
      y: 208,
      w: 26,
      h: 40,
      targetStage: 'stage_2',
      spawnX: 56,
      spawnY: 208,
      unlock: 'always',
      color: '#34d399',
    };
    engine.worldPortals.add(spec);

    const sync = () => {
      engine.worldPortals.add(spec);
    };

    const builder: FluentPortalBuilder = {
      at(x, y) {
        spec.x = x;
        spec.y = y;
        sync();
        return builder;
      },
      size(w, h) {
        spec.w = w;
        spec.h = h;
        sync();
        return builder;
      },
      to(targetStage, spawnX = 56, spawnY = 208) {
        spec.targetStage = targetStage;
        spec.spawnX = spawnX;
        spec.spawnY = spawnY;
        sync();
        return builder;
      },
      requireKey(keyName) {
        spec.unlock = 'require_key';
        spec.requiredKey = keyName;
        sync();
        return builder;
      },
      requireClear() {
        spec.unlock = 'all_enemies';
        sync();
        return builder;
      },
      alwaysOpen() {
        spec.unlock = 'always';
        sync();
        return builder;
      },
      color(hex) {
        spec.color = hex;
        sync();
        return builder;
      },
      label(text) {
        spec.label = text;
        sync();
        return builder;
      },
    };

    return builder;
  }

  function pickup(id: string, kind: PickupKind = 'relic'): FluentPickupBuilder {
    const spec: PickupSpec = {
      id,
      kind,
      x: 200,
      y: 160,
    };
    engine.worldPickups.add(spec);

    const sync = () => {
      engine.worldPickups.add(spec);
    };

    const builder: FluentPickupBuilder = {
      at(x, y) {
        spec.x = x;
        spec.y = y;
        sync();
        return builder;
      },
      key(keyName) {
        spec.kind = 'key';
        spec.keyName = keyName;
        sync();
        return builder;
      },
      value(val) {
        spec.value = val;
        sync();
        return builder;
      },
      color(hex) {
        spec.color = hex;
        sync();
        return builder;
      },
      label(text) {
        spec.label = text;
        sync();
        return builder;
      },
    };

    return builder;
  }

  function stage(id: string, title: string, setup: () => void, subtitle?: string) {
    engine.stages.define(id, title, setup, subtitle);
  }

  return {
    scene,
    actor,
    hero,
    enemy,
    dummy,
    action,
    light,
    portal,
    pickup,
    stage,
    stages: engine.stages,
    game: engine.game,
    vfx: engine.vfx,
    sfx: engine.audio,
    flow: engine.flow,
    signals: engine.signals,
    wait,
    waitTicks,
    waitUntil,
    tween,
    parallel,
    sequence,
  };
}


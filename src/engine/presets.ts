import type { EnginePreset } from './types';

export const ENGINE_PRESETS: EnginePreset[] = [
  {
    id: 'emerald-citadel-campaign',
    title: '00. 翡翠秘境三幕試煉 (完整小遊戲)',
    summary: '4 模組完整 3 關卡可玩小遊戲：含鑰匙解鎖傳送門、守衛/衝鋒敵人 AI 狀態機、雙階段魔王 Boss、血量與勝負重開迴圈。',
    entryFile: 'main.ts',
    code: `import { buildCampaignHero } from './actors';
import { defineCitadelStages } from './stages.scene';
import { bindCampaignFlow } from './combat.flow';

// ChronoForge 完整小遊戲入口：三幕關卡 · 傳送門 · 魔王狀態機 · 勝負迴圈
buildCampaignHero();
defineCitadelStages();
bindCampaignFlow();

game.enableOutcomeLoop(true);
stages.enter('stage_1', { keepPlayerHp: false, spawnX: 56, spawnY: 208 });
`,
    files: [
      {
        path: 'main.ts',
        kind: 'entry',
        summary: '戰役總入口 · 啟動三幕試煉',
        code: `import { buildCampaignHero } from './actors';
import { defineCitadelStages } from './stages.scene';
import { bindCampaignFlow } from './combat.flow';

// ChronoForge 完整小遊戲入口：三幕關卡 · 傳送門 · 魔王狀態機 · 勝負迴圈
buildCampaignHero();
defineCitadelStages();
bindCampaignFlow();

game.enableOutcomeLoop(true);
stages.enter('stage_1', { keepPlayerHp: false, spawnX: 56, spawnY: 208 });
`,
      },
      {
        path: 'stages.scene.ts',
        kind: 'module',
        summary: '三幕關卡地形、收集品、傳送門與魔王配置',
        code: `// 關卡定義模組：三幕獨立 Tilemap、鑰匙/治療收集品、條件傳送門與敵人 AI
const STAGE1_MAP: string[] = [
  '....................................',
  '....................................',
  '........T.................T.........',
  '....................................',
  '....................................',
  '....................................',
  '...............T....................',
  '....................................',
  '....................................',
  '....................................',
  '............-------.................',
  '....................................',
  '....................................',
  '====================================',
  '####################################',
  '####################################',
];

const STAGE2_MAP: string[] = [
  '......................................',
  '......................................',
  '......T.......................T.......',
  '......................................',
  '......................................',
  '......................................',
  '..................T...................',
  '......................................',
  '......................................',
  '......................................',
  '......................................',
  '...........-----....------............',
  '......................................',
  '============^^==========^^============',
  '######################################',
  '######################################',
];

const STAGE3_MAP: string[] = [
  '..................................',
  '..................................',
  '.....T......................T.....',
  '..................................',
  '..................................',
  '................T.................',
  '..................................',
  '..................................',
  '..................................',
  '..................................',
  '....-----................-----....',
  '..................................',
  '..................................',
  '==================================',
  '##################################',
  '##################################',
];

const LEGEND = {
  '.': 'empty',
  '#': 'stone',
  '=': 'moss',
  '-': 'platform',
  '^': 'spike',
  'T': 'torch',
} as const;

export function defineCitadelStages(): void {
  // 第一幕：翡翠前哨走廊（取得高台鑰匙 + 突破雙哨兵進入傳送門）
  stage('stage_1', '第一幕｜翡翠前哨走廊', () => {
    scene
      .sky('#060914', '#131d33')
      .ambient(0.68)
      .parallax('stars', 0.06, 'rgba(103, 232, 249, 0.65)')
      .parallax('mountains', 0.16, '#0f1629', 0.72)
      .parallax('ruins', 0.3, '#162038', 0.84)
      .tilemap(STAGE1_MAP, LEGEND);

    pickup('citadel_key', 'key').at(240, 142).key('citadel_key').label('秘境鑰匙');

    enemy('citadel_guard_1')
      .at(208, 208)
      .hp(64)
      .speed(0.95)
      .patrol(48)
      .ai('sentinel', { aggroRange: 132, attackRange: 40, contactDamage: 12 })
      .noRespawn();

    enemy('citadel_guard_2')
      .at(392, 208)
      .hp(64)
      .speed(1.0)
      .patrol(52)
      .ai('sentinel', { aggroRange: 132, attackRange: 40, contactDamage: 12 })
      .noRespawn();

    portal('to_stage_2')
      .at(524, 208)
      .to('stage_2', 56, 208)
      .requireKey('citadel_key')
      .color('#34d399')
      .label('STAGE 2');

    light('stage1_key_glow').at(240, 142).color('#fbbf24').radius(72).intensity(0.88);
    light('stage1_portal_glow').at(524, 188).color('#34d399').radius(86).intensity(0.9);
  });

  // 第二幕：尖刺深淵與衝鋒迴廊（跳躍越刺 + 殲滅所有衝鋒獸解鎖王座門）
  stage('stage_2', '第二幕｜尖刺深淵與衝鋒迴廊', () => {
    scene
      .sky('#0a0818', '#1f1636')
      .ambient(0.72)
      .parallax('stars', 0.07, 'rgba(244, 114, 182, 0.5)')
      .parallax('mountains', 0.18, '#171029', 0.74)
      .parallax('ruins', 0.34, '#1e1633', 0.84)
      .tilemap(STAGE2_MAP, LEGEND);

    pickup('abyss_heal', 'heal').at(296, 158).value(45).label('+45 HP');

    enemy('charger_west')
      .at(128, 208)
      .hp(64)
      .speed(1.05)
      .patrol(30)
      .ai('charger', { aggroRange: 145, attackRange: 92, contactDamage: 14 })
      .noRespawn();

    enemy('charger_east')
      .at(476, 208)
      .hp(72)
      .speed(1.1)
      .patrol(34)
      .ai('charger', { aggroRange: 155, attackRange: 96, contactDamage: 14 })
      .noRespawn();

    portal('to_stage_3')
      .at(560, 208)
      .to('stage_3', 64, 208)
      .requireClear()
      .color('#f97316')
      .label('BOSS');

    light('stage2_heal_glow').at(296, 158).color('#4ade80').radius(68).intensity(0.85);
    light('stage2_portal_glow').at(560, 188).color('#f97316').radius(90).intensity(0.92);
  });

  // 第三幕：聖殿守望者王座（雙階段 Boss AI ＋ 勝利結算）
  stage('stage_3', '第三幕｜聖殿守望者王座', () => {
    scene
      .sky('#14070e', '#2c101d')
      .ambient(0.76)
      .parallax('stars', 0.05, 'rgba(251, 146, 60, 0.55)')
      .parallax('mountains', 0.16, '#210c16', 0.74)
      .tilemap(STAGE3_MAP, LEGEND);

    pickup('boss_elixir', 'heal').at(104, 142).value(55).label('+55 HP');

    enemy('citadel_warden')
      .at(380, 208)
      .hp(192)
      .speed(1.02)
      .patrol(90)
      .boss(1.45, '聖殿守望者 WARDEN')
      .ai('boss_warden', { aggroRange: 400, attackRange: 124, contactDamage: 14 })
      .noRespawn()
      .on('defeated', () => {
        game.victory('CITADEL CONQUERED', '聖殿守望者已伏誅 · 秘境三幕試煉全破！');
      });

    light('throne_crimson_beacon').at(340, 118).color('#f97316').radius(120).intensity(0.95).flicker(0.14);
  });
}
`,
      },
      {
        path: 'actors.ts',
        kind: 'module',
        summary: '英雄動作編譯與外觀設定',
        code: `export type HeroHandle = ReturnType<typeof hero>;

// 角色與戰鬥手模組：8向描邊寬劍連斬 + 護盾光環
export function buildCampaignHero(): HeroHandle {
  action('slash')
    .tweens(2, 'easeOutBack')
    .fps(20)
    .rimLight(true)
    .outline('8way')
    .hitbox({ x: 36, y: 12, w: 38, h: 42 }, [3, 4, 5, 6])
    .poses([
      { lean: -3, cloakLift: 5, frontArm: { ex: 2, ey: 0, hx: 7, hy: -4, swordAngle: -104 }, face: 'fierce' },
      { lean: 6, tx: 3, ty: -1, cloakLift: 15, frontArm: { ex: 6, ey: 2, hx: 12, hy: 3, swordAngle: 10, slashFX: true }, face: 'fierce' },
      { lean: 2, tx: 1, cloakLift: 8, frontArm: { ex: 3, ey: 4, hx: 8, hy: 5, swordAngle: -36 }, face: 'fierce' },
    ]);

  return hero('hero')
    .theme('emerald', 'broadsword', 'ranger')
    .at(56, 208)
    .hp(120)
    .speed(2.85)
    .aura('#4ade80', 92, { offsetY: -26, flicker: 0.08 })
    .follow(0.15);
}
`,
      },
      {
        path: 'combat.flow.ts',
        kind: 'module',
        summary: '關卡演出訊號流、魔王二階段警報與打擊回饋',
        code: `interface HitPayload {
  attacker: { id: string; x: number; y: number };
  target: { id: string; x: number; y: number };
  damage: number;
}

interface StagePayload {
  stageId: string;
  stageTitle: string;
}

export function bindCampaignFlow(): void {
  // 轉場進入新關卡時：啟動光環與舞台火花提示
  signals.on('stage:enter', (payload: StagePayload) => {
    flow.spawn(function* stageIntro() {
      yield* wait(0.12);
      const p = hero('hero');
      const raw = p.raw();
      if (raw) {
        vfx.burst(raw.x, raw.y - 24, {
          count: 16,
          color: '#4ade80',
          colorB: '#38bdf8',
          speed: 3.0,
          bounce: true,
        });
      }
      if (payload.stageId === 'stage_3') {
        p.say('BOSS FIGHT!', '#f97316');
      }
    }, 'stageIntro');
  });

  // 取得鑰匙或打倒敵人時給予明確提示
  signals.on('pickup:collect', (payload: { pickup: { kind: string } }) => {
    if (payload.pickup.kind === 'key') {
      hero('hero').say('PORTAL UNLOCKED!', '#fbbf24');
    }
  });

  // 命中打擊殘影與共鳴音效
  signals.on('combat:hit', (payload: HitPayload) => {
    vfx.afterimage(payload.attacker.id, { color: '#4ade80', life: 12, alpha: 0.58 });
    vfx.burst(payload.target.x, payload.target.y - 24, {
      count: 12,
      color: '#ffe36e',
      colorB: '#4ade80',
      speed: 3.4,
      bounce: true,
    });
  });

  // 魔王進入 50% 血量二階段狂暴
  signals.on('boss:phase', () => {
    hero('hero').say('WARDEN ENRAGED!', '#ef4444');
  });
}
`,
      },
    ],
  },
  {
    id: 'fluent-coroutines-suite',
    title: '01. 絕妙語法與多檔分裝',
    summary: '4 模組虛擬專案示範：TypeScript 跨檔 import、流暢鏈式 DSL (scene/hero/action)、線性時間軸協程 (yield* wait/tween) 與訊號流。',
    entryFile: 'main.ts',
    code: `import { setupWorld } from './world.scene';
import { buildHero, spawnGuardians } from './hero.actor';
import { bindCombatFlow } from './combat.flow';

// ChronoForge 絕妙語法入口：意圖如散文般清晰可讀
setupWorld();

const player = buildHero();
spawnGuardians();
bindCombatFlow(player);
`,
    files: [
      {
        path: 'main.ts',
        kind: 'entry',
        summary: '主進入點 · 組合各子模組',
        code: `import { setupWorld } from './world.scene';
import { buildHero, spawnGuardians } from './hero.actor';
import { bindCombatFlow } from './combat.flow';

// ChronoForge 絕妙語法入口：意圖如散文般清晰可讀
setupWorld();

const player = buildHero();
spawnGuardians();
bindCombatFlow(player);
`,
      },
      {
        path: 'world.scene.ts',
        kind: 'module',
        summary: '流暢場景、視差與動態點光',
        code: `// 場景模組：以流暢鏈式語法建構天空、視差與 Auto-Tile 地形
const MAP_LAYOUT: string[] = [
  '............................................',
  '............................................',
  '............T.................T.............',
  '............................................',
  '..................------....................',
  '.......T.................................T..',
  '.............---...........---..............',
  '............................................',
  '....----.........................----.......',
  '......................T.....................',
  '..........====.................====.........',
  '============================================',
  '############################################',
  '############################################',
];

export function setupWorld(): void {
  scene
    .sky('#060914', '#131b33')
    .ambient(0.72)
    .parallax('stars', 0.06, 'rgba(103, 232, 249, 0.65)')
    .parallax('mountains', 0.16, '#0f1629', 0.72)
    .parallax('ruins', 0.32, '#171f36', 0.84)
    .tilemap(MAP_LAYOUT, {
      '.': 'empty',
      '#': 'stone',
      '=': 'moss',
      '-': 'platform',
      'T': 'torch',
    });

  // 懸浮於遺跡中央的神龕水晶動態光源
  light('shrine_beacon')
    .at(288, 118)
    .color('#38bdf8')
    .radius(96)
    .intensity(0.95)
    .flicker(0.14);
}
`,
      },
      {
        path: 'hero.actor.ts',
        kind: 'module',
        summary: '英雄動作編譯與實體組裝',
        code: `export type ActorHandle = ReturnType<typeof hero>;

// 角色與動作編譯模組：純程式關鍵幀曲線 + easeOutBack 自動補間
export function buildHero(): ActorHandle {
  action('slash')
    .tweens(2, 'easeOutBack')
    .fps(20)
    .rimLight(true)
    .outline('8way')
    .hitbox({ x: 38, y: 14, w: 34, h: 38 }, [3, 4, 5, 6])
    .poses([
      { lean: -3, cloakLift: 5, frontArm: { ex: 2, ey: 0, hx: 7, hy: -4, swordAngle: -102 }, face: 'fierce' },
      { lean: 6, tx: 3, ty: -1, cloakLift: 15, frontArm: { ex: 6, ey: 2, hx: 12, hy: 3, swordAngle: 8, slashFX: true }, face: 'fierce' },
      { lean: 2, tx: 1, cloakLift: 8, frontArm: { ex: 3, ey: 4, hx: 8, hy: 5, swordAngle: -36 }, face: 'fierce' },
    ]);

  return hero('hero')
    .theme('emerald', 'broadsword', 'ranger')
    .at(96, 176)
    .hp(120)
    .speed(2.8)
    .aura('#4ade80', 88, { offsetY: -26, flicker: 0.09 })
    .follow(0.15);
}

export function spawnGuardians(): void {
  dummy('sanctuary_dummy').at(248, 176).hp(300);
  enemy('sentinel_east').at(396, 176).hp(110).patrol(68).speed(1.05);
  enemy('sentinel_far').at(548, 176).hp(130).patrol(74).speed(1.2);
}
`,
      },
      {
        path: 'combat.flow.ts',
        kind: 'module',
        summary: '時間軸協程與響應式訊號流',
        code: `import type { ActorHandle } from './hero.actor';

interface HitSignal {
  attacker: { id: string; x: number; y: number; facing: 1 | -1 };
  target: { id: string; x: number; y: number };
  damage: number;
}

// 演出與訊號模組：用 Generator 協程線性描述時間演出，告別散落計時器
export function bindCombatFlow(player: ActorHandle): void {
  // 1. 開場協程演出：等待落地後釋放護盾光環呼吸脈衝
  flow.spawn(function* introPulse() {
    yield* wait(0.35);
    player.say('CHRONO READY', '#4ade80');
    sfx.playPreset('powerup');

    const aura = light('hero_aura');
    yield* tween(0.45, 'easeOutBack', (t) => {
      aura.radius(72 + t * 44);
    });
    yield* tween(0.4, 'easeInOut', (t) => {
      aura.radius(116 - t * 28);
    });
  }, 'introPulse');

  // 2. 週期性神龕螢火噴泉協程
  flow.loop(function* shrineSparks() {
    vfx.burst(288, 122, {
      count: 4,
      color: '#38bdf8',
      colorB: '#e0f2fe',
      speed: 2.0,
      angleDeg: -90,
      spread: 75,
      bounce: true,
      life: 28,
    });
    yield* wait(0.24);
  }, 'shrineSparks');

  // 3. 響應式訊號流：命中瞬間觸發殘影 + ZzFX 和聲與餘震
  signals.on('combat:hit', (payload: HitSignal) => {
    vfx.afterimage(payload.attacker.id, { color: '#4ade80', life: 14, alpha: 0.65 });
    vfx.burst(payload.target.x, payload.target.y - 24, {
      count: 14,
      color: '#ffe36e',
      colorB: '#4ade80',
      speed: 3.6,
      bounce: true,
    });

    flow.spawn(function* hitEcho() {
      yield* waitTicks(5);
      sfx.zzfx(0.55, 0.02, 740, 0.01, 0.02, 0.11, 1, 1.3, 4);
    }, 'hitEcho');
  });
}
`,
      },
    ],
  },
  {
    id: 'dungeon-combat',
    title: '02. 地牢火把與橫向戰鬥',
    summary: '以 ASCII 編譯 4-bit 自動拼接磚塊地圖、視差遺跡背景、動態閃爍火把點光源與巡邏敵人。',
    code: `// AI Agent 純程式關卡腳本：地牢火把與橫向戰鬥
engine.setTheme('emerald', 'broadsword', 'ranger');

// 1. 場景天空、環境暗度與多層視差背景
engine.scene.setSky('#070914', '#161b30');
engine.scene.setAmbientLight(0.76);
engine.scene.addParallaxLayer({ type: 'stars', speed: 0.08, color: 'rgba(242, 207, 102, 0.55)' });
engine.scene.addParallaxLayer({ type: 'mountains', speed: 0.18, color: '#111626', heightRatio: 0.72 });
engine.scene.addParallaxLayer({ type: 'ruins', speed: 0.35, color: '#171d30', heightRatio: 0.84 });

// 2. ASCII 矩陣編譯 4-bit Auto-Tile 關卡（# 石牆, = 青苔磚, - 單向木平台, ^ 尖刺, T 火把）
engine.scene.compileTilemap([
  '............................................',
  '............................................',
  '............................................',
  '............T.................T.............',
  '............................................',
  '..................------....................',
  '.......T.................................T..',
  '.............---...........---..............',
  '............................................',
  '............................................',
  '....----.........................----.......',
  '......................T.....................',
  '..........====.................====.........',
  '============================================',
  '############################################',
  '############################################',
  '############################################',
], {
  '.': 'empty',
  '#': 'stone',
  '=': 'moss',
  '-': 'platform',
  '^': 'spike',
  'T': 'torch',
});

// 3. 純程式動作編譯：追加「升龍上斬 (slash)」改寫為具 2 幀自動補間的強化連斬
engine.actions.compile('slash', {
  autoTweens: 1,
  easing: 'easeOutBack',
  fps: 18,
  loop: false,
  rimLight: true,
  activeFrames: [3, 4, 5],
  defaultHitbox: { x: 38, y: 16, w: 32, h: 36 },
  keyframes: [
    { lean: -2, cloakLift: 5, frontArm: { ex: 3, ey: 1, hx: 8, hy: -2, swordAngle: -90 }, face: 'fierce' },
    { lean: 5, tx: 3, ty: 0, cloakLift: 14, frontArm: { ex: 5, ey: 2, hx: 11, hy: 3, swordAngle: -10, slashFX: true }, face: 'fierce' },
    { lean: 2, tx: 1, cloakLift: 8, frontArm: { ex: 3, ey: 4, hx: 8, hy: 5, swordAngle: -38 }, face: 'fierce' },
  ],
});

// 4. 生成玩家、訓練木樁、地牢巡邏敵人與跟隨火炬點光源
const hero = engine.entities.spawn({ id: 'hero', kind: 'player', x: 96, y: 192, hp: 100 });
engine.entities.spawn({ id: 'dummy_1', kind: 'dummy', x: 256, y: 192, hp: 300 });
engine.entities.spawn({ id: 'guard_1', kind: 'enemy', x: 390, y: 192, hp: 90, patrolRange: 64, speed: 0.9 });
engine.entities.spawn({ id: 'guard_2', kind: 'enemy', x: 560, y: 192, hp: 110, patrolRange: 72, speed: 1.1 });

engine.lights.addPointLight({
  id: 'hero_aura',
  attachTo: 'hero',
  offsetY: -28,
  radius: 78,
  color: '#4ade80',
  intensity: 0.85,
  flicker: 0.08,
});

engine.camera.follow('hero', 0.14);

// 5. 自訂戰鬥擊中粒子噴濺回呼
engine.onHit((attacker, target) => {
  engine.vfx.burst(target.x, target.y - 24, {
    count: 16,
    color: '#ffe36e',
    colorB: '#4ade80',
    speed: 3.8,
    bounce: true,
  });
});
`,
  },
  {
    id: 'action-compiler',
    title: '03. 純程式動作編譯與補間',
    summary: '示範以關鍵幀曲線、easeOutBack 緩動自動補間、Bayer 抖動與 Rim 邊緣光即時編譯自訂連招。',
    code: `// AI Agent 純程式動作編譯器展示：赤焰聖騎巨劍旋斬
engine.setTheme('crimson', 'greatsword', 'short');

engine.scene.setSky('#140910', '#2b101b');
engine.scene.setAmbientLight(0.35);
engine.scene.addParallaxLayer({ type: 'mountains', speed: 0.16, color: '#1f0d16', heightRatio: 0.72 });

engine.scene.compileTilemap([
  '....................................',
  '....................................',
  '....................................',
  '....................................',
  '.......T....................T.......',
  '....................................',
  '...........--------------...........',
  '....................................',
  '....................................',
  '....................................',
  '....................................',
  '....----....................----....',
  '....................................',
  '====================================',
  '####################################',
  '####################################',
], { '.': 'empty', '#': 'brick', '=': 'brick', '-': 'platform', 'T': 'torch' });

// 使用 autoTweens: 2 自動在 3 個核心姿勢間插入流暢過渡幀！
engine.actions.compile('slash', {
  autoTweens: 2,
  easing: 'easeOutBack',
  fps: 22,
  loop: false,
  ditherPct: 35,
  rimLight: true,
  outlineMode: '8way',
  activeFrames: [3, 4, 5, 6],
  defaultHitbox: { x: 36, y: 12, w: 34, h: 42 },
  keyframes: [
    {
      lean: -4, ty: 2, cloakLift: 4,
      legL: { kx: -4, ky: 7, fx: -7, fy: 15 },
      legR: { kx: 5, ky: 7, fx: 7, fy: 15 },
      frontArm: { ex: 1, ey: -2, hx: 5, hy: -7, swordAngle: -115 },
      face: 'fierce',
    },
    {
      lean: 6, tx: 4, ty: -3, cloakLift: 15, cloakWave: -5,
      legL: { kx: -6, ky: 6, fx: -10, fy: 14 },
      legR: { kx: 8, ky: 5, fx: 11, fy: 14 },
      frontArm: { ex: 6, ey: 2, hx: 12, hy: 3, swordAngle: 12, slashFX: true },
      face: 'fierce',
    },
    {
      lean: 1, tx: 1, ty: 1, cloakLift: 7,
      legL: { kx: -3, ky: 8, fx: -5, fy: 15 },
      legR: { kx: 4, ky: 8, fx: 6, fy: 15 },
      frontArm: { ex: 3, ey: 4, hx: 8, hy: 5, swordAngle: -35 },
      face: 'fierce',
    },
  ],
});

engine.entities.spawn({ id: 'hero', kind: 'player', x: 140, y: 192, hp: 120 });
engine.entities.spawn({ id: 'boss_dummy', kind: 'dummy', x: 310, y: 192, hp: 500 });
engine.lights.addPointLight({ attachTo: 'hero', offsetY: -28, radius: 95, color: '#ff6978', intensity: 0.9 });
engine.camera.follow('hero', 0.16);
`,
  },
  {
    id: 'vfx-lighting',
    title: '04. 像素粒子與動態光源實驗',
    summary: '高暗度神殿場景搭配環繞螢火動態光源、地形反彈火花噴泉與連續衝刺殘影測試。',
    code: `// AI Agent 特效與動態點光源腳本：暗影刺客與螢火聖殿
engine.setTheme('shadow', 'daggers', 'hooded');

engine.scene.setSky('#04050c', '#0b0e1f');
engine.scene.setAmbientLight(0.84);
engine.scene.addParallaxLayer({ type: 'stars', speed: 0.06, color: 'rgba(103, 232, 249, 0.7)' });
engine.scene.addParallaxLayer({ type: 'forest', speed: 0.24, color: '#0e1326', heightRatio: 0.82 });

engine.scene.compileTilemap([
  '....................................',
  '....................................',
  '....................................',
  '........T..................T........',
  '....................................',
  '.............----------.............',
  '....................................',
  '....................................',
  '......----................----......',
  '....................................',
  '.................==.................',
  '...............======...............',
  '............============............',
  '====================================',
  '####################################',
  '####################################',
], { '.': 'empty', '#': 'stone', '=': 'moss', '-': 'platform', 'T': 'torch' });

engine.entities.spawn({ id: 'hero', kind: 'player', x: 120, y: 192, speed: 3.1 });
engine.entities.spawn({ id: 'target_1', kind: 'dummy', x: 288, y: 160, hp: 300 });

engine.lights.addPointLight({ id: 'orb_a', x: 240, y: 110, radius: 74, color: '#38bdf8', intensity: 0.95, flicker: 0.12 });
engine.lights.addPointLight({ id: 'orb_b', x: 340, y: 110, radius: 74, color: '#a855f7', intensity: 0.95, flicker: 0.12 });
engine.lights.addPointLight({ id: 'player_glow', attachTo: 'hero', offsetY: -26, radius: 86, color: '#67e8f9', intensity: 0.9 });

engine.camera.follow('hero', 0.15);

// 每 Tick 驅動環繞螢火光源與噴泉反彈粒子
engine.onUpdate((tick) => {
  const t = tick * 0.045;
  engine.lights.updateLight('orb_a', {
    x: 288 + Math.cos(t) * 68,
    y: 118 + Math.sin(t * 1.5) * 28,
  });
  engine.lights.updateLight('orb_b', {
    x: 288 - Math.cos(t) * 68,
    y: 118 - Math.sin(t * 1.5) * 28,
  });

  if (tick % 6 === 0) {
    engine.vfx.burst(288, 128, {
      count: 4,
      color: '#67e8f9',
      colorB: '#c084fc',
      speed: 2.3,
      angleDeg: -90,
      spread: 55,
      bounce: true,
      life: 32,
    });
  }
});
`,
  },
  {
    id: 'studio-bridge',
    title: '05. 匯入工作室精靈圖關卡',
    summary: '展示透過 engine.actions.importBundle() 直接橋接 / 工作室匯出的精靈圖集與逐幀碰撞規格。',
    code: `// AI Agent 與精靈圖工作室互通範本：載入 Studio Runtime Bundle
if (importedBundle) {
  await engine.actions.importBundle(importedBundle);
} else {
  engine.setTheme('azure', 'spear', 'ranger');
}

engine.scene.setSky('#081426', '#162f4d');
engine.scene.setAmbientLight(0.32);
engine.scene.addParallaxLayer({ type: 'stars', speed: 0.05, color: 'rgba(255,255,255,0.45)' });
engine.scene.addParallaxLayer({ type: 'mountains', speed: 0.15, color: '#10223b', heightRatio: 0.7 });
engine.scene.addParallaxLayer({ type: 'forest', speed: 0.3, color: '#0c2b24', heightRatio: 0.82 });

engine.scene.compileTilemap([
  '............................................',
  '............................................',
  '............................................',
  '............................................',
  '............------..........................',
  '................................T...........',
  '......................------................',
  '............................................',
  '......----........................----......',
  '............................................',
  '............................................',
  '................====........................',
  '...............======.......................',
  '==============........======================',
  '##############^^^^^^^^######################',
  '############################################',
], { '.': 'empty', '#': 'stone', '=': 'moss', '-': 'platform', '^': 'spike', 'T': 'torch' });

engine.entities.spawn({ id: 'hero', kind: 'player', x: 76, y: 192, hp: 100 });
engine.entities.spawn({ id: 'dummy_a', kind: 'dummy', x: 420, y: 192, hp: 250 });
engine.entities.spawn({ id: 'patrol_a', kind: 'enemy', x: 520, y: 192, hp: 90, patrolRange: 60 });

engine.lights.addPointLight({ attachTo: 'hero', offsetY: -28, radius: 95, color: '#63b5ff', intensity: 0.85 });
engine.camera.follow('hero', 0.14);
`,
  },
  {
    id: 'zzfx-audio-combat',
    title: '06. ZzFX 純程式 8-Bit 音效戰鬥',
    summary: '零外部音檔依賴：直接用 20 維 ZzFX 參數陣列於揮砍、連擊命中與跳躍時即時合成 Web Audio 8-bit 音效。',
    code: `// AI Agent 純程式音訊驅動範本：ZzFX Web Audio 合成與連擊和聲
engine.setTheme('emerald', 'broadsword', 'ranger');
engine.audio.setAutoCombatAudio(true);

engine.scene.setSky('#08101c', '#182438');
engine.scene.setAmbientLight(0.45);
engine.scene.addParallaxLayer({ type: 'stars', speed: 0.06, color: 'rgba(255,230,140,0.55)' });
engine.scene.addParallaxLayer({ type: 'ruins', speed: 0.28, color: '#131d2e', heightRatio: 0.84 });

engine.scene.compileTilemap([
  '....................................',
  '....................................',
  '.......T....................T.......',
  '....................................',
  '.............----------.............',
  '....................................',
  '....................................',
  '....----....................----....',
  '....................................',
  '.................====...............',
  '====================================',
  '####################################',
  '####################################',
], { '.': 'empty', '#': 'stone', '=': 'moss', '-': 'platform', 'T': 'torch' });

engine.entities.spawn({ id: 'hero', kind: 'player', x: 92, y: 140, hp: 100 });
engine.entities.spawn({ id: 'dummy_s', kind: 'dummy', x: 256, y: 140, hp: 300 });
engine.entities.spawn({ id: 'enemy_s', kind: 'enemy', x: 390, y: 140, hp: 90, patrolRange: 54 });
engine.lights.addPointLight({ attachTo: 'hero', offsetY: -26, radius: 88, color: '#fde047', intensity: 0.88 });
engine.camera.follow('hero', 0.14);

// 載入完成時以純程式 ZzFX 播放開場水晶短音
engine.audio.playPreset('powerup');

// 連擊命中時依照 Combo 數動態升調合成額外 ZzFX 共鳴餘韻！
engine.onHit((_attacker, target) => {
  const pitch = 520 + Math.min(8, engine.combo) * 110;
  engine.audio.zzfx(0.75, 0.02, pitch, 0.01, 0.03, 0.14, 1, 1.4, 6, 0, 140, 0.04);
  engine.vfx.popup(target.x - 10, target.y - 54, 'SFX +' + Math.round(pitch) + 'Hz', '#38bdf8');
  if (engine.combo >= 3 && engine.combo % 3 === 0) {
    engine.audio.playPreset('coin');
  }
});
`,
  },
  {
    id: 'ldtk-aseprite-pipeline',
    title: '07. LDtk ＋ Aseprite 標準管線',
    summary: '支援直接載入外部 LDtk / Tiled (.tmj) 關卡與 Aseprite JSON (frameTags + slices)，可搭配右上「匯入外部資產」立即替換。',
    code: `// 業界標準外部格式管線：支援 LDtk / Tiled (.tmj) 地圖 + Aseprite JSON
// 1. 載入標準 Aseprite JSON (支援匯入檔或內建符合 Aseprite 規範的標籤示範結構)
const sampleAseprite = importedAssets?.asepriteJson ?? {
  frames: [
    { frame: { x: 0, y: 0, w: 32, h: 32 }, duration: 130 },
    { frame: { x: 32, y: 0, w: 32, h: 32 }, duration: 130 },
    { frame: { x: 64, y: 0, w: 32, h: 32 }, duration: 90 },
    { frame: { x: 96, y: 0, w: 32, h: 32 }, duration: 90 },
    { frame: { x: 128, y: 0, w: 32, h: 32 }, duration: 75 },
    { frame: { x: 160, y: 0, w: 32, h: 32 }, duration: 75 },
    { frame: { x: 192, y: 0, w: 32, h: 32 }, duration: 95 },
  ],
  meta: {
    app: 'http://www.aseprite.org/',
    frameTags: [
      { name: 'idle', from: 0, to: 1, direction: 'pingpong', color: '#32ab4f' },
      { name: 'run', from: 2, to: 3, direction: 'forward', color: '#38bdf8' },
      { name: 'slash', from: 4, to: 6, direction: 'forward', color: '#f97316' },
    ],
    slices: [
      { name: 'hurt', keys: [{ frame: 0, bounds: { x: 4, y: 2, w: 22, h: 46 } }] },
      { name: 'hit', keys: [{ frame: 5, bounds: { x: 20, y: 10, w: 32, h: 34 } }] },
    ],
  },
};

if (importedAssets?.asepriteJson) {
  await engine.assets.loadAseprite(importedAssets.asepriteJson, importedAssets.asepriteImageUrl ?? null);
} else {
  // 未上傳 PNG 時保留引擎高精細角色並示範 Aseprite JSON 標籤讀取檢查
  engine.setTheme('azure', 'spear', 'ranger');
  if (sampleAseprite.meta?.frameTags) {
    engine.vfx.popup(110, 84, 'Aseprite Tags: ' + sampleAseprite.meta.frameTags.length, '#38bdf8');
  }
}

// 2. 載入標準 LDtk JSON 或 Tiled (.tmj) 關卡（優先套用您上傳的地圖）
engine.scene.setSky('#070b14', '#131d33');
engine.scene.setAmbientLight(0.55);
engine.scene.addParallaxLayer({ type: 'stars', speed: 0.07, color: 'rgba(165, 243, 252, 0.5)' });
engine.scene.addParallaxLayer({ type: 'mountains', speed: 0.2, color: '#0f1829', heightRatio: 0.74 });

if (importedAssets?.tiledJson) {
  engine.scene.loadTiled(importedAssets.tiledJson);
} else {
  const sampleLDtk = importedAssets?.ldtkJson ?? {
    levels: [{
      identifier: 'Level_0',
      pxWid: 512,
      pxHei: 256,
      layerInstances: [
        {
          __identifier: 'IntGrid_Walls',
          __type: 'IntGrid',
          __cWid: 32,
          __cHei: 16,
          __gridSize: 16,
          intGridCsv: Array.from({ length: 32 * 16 }, (_, idx) => {
            const r = Math.floor(idx / 32);
            const c = idx % 32;
            if (r >= 13) return r === 13 ? 2 : 1;
            if (r === 9 && c >= 10 && c <= 20) return 4;
            if (r === 6 && (c === 7 || c === 24)) return 6;
            if (r === 12 && (c === 14 || c === 15)) return 5;
            return 0;
          }),
        },
        {
          __identifier: 'Entities',
          __type: 'Entities',
          __cWid: 32,
          __cHei: 16,
          __gridSize: 16,
          entityInstances: [
            { __identifier: 'PlayerSpawn', px: [72, 192] },
            { __identifier: 'Dummy', px: [300, 192] },
            { __identifier: 'EnemyGuard', px: [410, 192] },
          ],
        },
      ],
    }],
  };
  engine.scene.loadLDtk(sampleLDtk);
}

const p = engine.entities.list().find((e) => e.kind === 'player');
if (p) {
  engine.lights.addPointLight({ attachTo: p.id, offsetY: -26, radius: 92, color: '#63b5ff', intensity: 0.9 });
  engine.camera.follow(p.id, 0.14);
}
`,
  },
];

export const SDK_REFERENCE_DOCS = [
  {
    namespace: 'stage / stages / portal / pickup / game (多關卡與勝負迴圈)',
    desc: 'stage(id, title, fn) 註冊關卡並透過 stages.enter(id) 切換清除重建；portal(id).at().to().requireKey()/.requireClear() 控制傳送門解鎖；pickup(id, "key"|"heal"|"relic") 配置收集品；game.victory() / gameover() / restart() 驅動勝負畫面與 R 鍵重開。',
  },
  {
    namespace: 'enemy().ai(profile) / .boss(scale, label) / .noRespawn()',
    desc: '確定性敵人與魔王狀態機（patrol -> chase -> telegraph 前搖預警 -> lunge/slam -> recover）；boss_warden 於 50% HP 自動進入狂暴二階段並釋放震地衝擊波，擊敗時發射 entity:defeated 訊號。',
  },
  {
    namespace: 'scene / hero / enemy / action / light (流暢鏈式 DSL)',
    desc: '詩意散文級鏈式語法：scene.sky().ambient().parallax().tilemap()；hero("hero").at(96,176).hp(120).aura("#4ade80").follow()；action("slash").tweens(2, "easeOutBack").poses([...])，每一步即時編譯。',
  },
  {
    namespace: 'flow.spawn(function* () { yield* wait / tween / waitUntil })',
    desc: '確定性 60Hz 時間軸協程：以標準 Generator 線性編排延遲與緩動動畫，支援 sequence()、parallel() 與逐幀步進暫停。',
  },
  {
    namespace: 'signals.on / once / emit ("combat:hit" | "stage:enter" | "entity:defeated" | ...)',
    desc: 'Godot 式響應訊號匯流排：內建 combat:hit、entity:spawn、entity:hurt、entity:defeated、portal:enter、pickup:collect、stage:enter、boss:phase、game:phase 與自訂頻道，完全解耦戰鬥、特效與音效邏輯。',
  },
  {
    namespace: 'Sucrase 虛擬多檔 TypeScript + import / export',
    desc: '於左側虛擬模組樹建立任意 .ts 模組並使用標準 import { fn } from "./module" 跨檔組合，內建循環依賴偵測與精確至檔名的轉譯錯誤回報。',
  },
  {
    namespace: 'engine.audio.zzfx(...params) / playPreset(name)',
    desc: '整合 ZzFX Web Audio 復古波形合成器：傳入 20 維數值陣列或呼叫 playPreset("slash"|"hit"|"jump"|"dash"|"hurt"|"coin"|"powerup"|"explosion") 即時發聲，零外部音檔負擔。',
  },
  {
    namespace: 'engine.assets.loadAseprite(json, imageSrc?, opts?)',
    desc: '標準 Aseprite JSON（Array/Hash）匯入器：自動解析 meta.frameTags（forward/reverse/pingpong）、逐幀 duration FPS 與 meta.slices 碰撞框直接註冊為可動作戰動畫。',
  },
  {
    namespace: 'engine.scene.loadLDtk(ldtkJson, options?)',
    desc: '標準 LDtk 關卡匯入器：解析 layerInstances 的 intGridCsv 碰撞磚格（自動執行 4-bit 拼接與火把點光），並讀取 entityInstances 於精確 px 座標生成角色與敵人。',
  },
  {
    namespace: 'engine.scene.loadTiled(tiledJson, options?)',
    desc: '標準 Tiled（.tmj）地圖匯入器：讀取 tilelayer data 陣列與 objectgroup objects 實體出生點，支援自訂 gidLegend 對應磚塊類型。',
  },
  {
    namespace: 'engine.actions.compile(name, spec)',
    desc: '純程式動作編譯器：輸入骨架 keyframes、easing (linear/easeInOut/easeOutBack)、autoTweens、weapon 與 activeFrames，自動產出 32 色 1px 描邊精靈幀與碰撞框。',
  },
  {
    namespace: 'engine.actions.importBundle(json)',
    desc: '匯入 `/` 精靈圖工作室輸出的 chronopixel_runtime_bundle.json（含 Atlas PNG 與每幀 Hitbox/Hurtbox），無縫延續角色美術設定。',
  },
  {
    namespace: 'engine.scene.compileTilemap(ascii, legend, size)',
    desc: '傳入 ASCII 地圖字串與圖例（stone/moss/brick/platform/spike/torch），自動執行 4-bit Auto-Tiling 渲染與碰撞網格建立。',
  },
  {
    namespace: 'engine.scene.addParallaxLayer / lights.addPointLight',
    desc: '多層視差滾動背景（stars/mountains/forest/ruins）與 2D 階梯像素動態點光源（attachTo 跟隨實體與 flicker 閃爍）。',
  },
  {
    namespace: 'engine.vfx.burst / slashArc / afterimage',
    desc: '程式化像素特效系統：可碰撞地形彈跳粒子、刀光貝茲弧線、衝刺殘影與 camera.addTrauma() 創傷鏡頭震動。',
  },
  {
    namespace: 'engine.entities.spawn / onUpdate / onHit',
    desc: '於 60Hz 固定步長 ECS 世界生成玩家、木樁與巡邏敵人，並透過回呼掛載自訂遊戲邏輯。',
  },
];


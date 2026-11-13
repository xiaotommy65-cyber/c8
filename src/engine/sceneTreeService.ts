import { ZZFX_MICRO_RUNTIME_JS, ZZFX_PRESETS } from './zzfxAudio';
import type {
  CompiledAction,
  EngineSceneNode,
  EngineSceneTreeSnapshot,
  FrameBoxSpec,
  GamePhase,
  ParallaxLayerSpec,
  PickupNode,
  PointLightSpec,
  PortalNode,
  RuntimeEntity,
  TileKind,
} from './types';

export interface SceneTreeContext {
  tick: number;
  score: number;
  combo: number;
  crc32: number;
  ambientDarkness: number;
  skyTopColor: string;
  skyBottomColor: string;
  autoCombatAudio: boolean;
  tileCols: number;
  tileRows: number;
  tileSize: number;
  tileGrid: TileKind[][];
  tileMapCanvas: HTMLCanvasElement | null;
  torchPositions: Array<{ x: number; y: number }>;
  pointLights: PointLightSpec[];
  entityList: RuntimeEntity[];
  parallaxLayers: ParallaxLayerSpec[];
  compiledActions: Map<string, CompiledAction>;
  portals: PortalNode[];
  pickups: PickupNode[];
  isPortalUnlocked: (portal: PortalNode) => boolean;
  gamePhase: GamePhase;
  stageId: string;
  stageTitle: string;
  keysCollected: string[];
}

export function buildSceneTreeSnapshot(ctx: SceneTreeContext): EngineSceneTreeSnapshot {
  const lightNodes: EngineSceneNode[] = ctx.pointLights.map((l, idx) => ({
    id: `light:${l.id ?? idx}`,
    label: l.id ?? `PointLight_${idx + 1}`,
    kind: 'light',
    typeTag: 'PointLight2D',
    props: {
      x: Math.round(l.x),
      y: Math.round(l.y),
      radius: Math.round(l.radius),
      intensity: Number((l.intensity ?? 0.9).toFixed(2)),
      flicker: Number((l.flicker ?? 0.05).toFixed(2)),
      color: l.color,
      attachTo: l.attachTo ?? '',
    },
  }));

  const entityNodes: EngineSceneNode[] = ctx.entityList.map((e) => ({
    id: `entity:${e.id}`,
    label: e.label ? `${e.id} (${e.label})` : e.id,
    kind: 'entity',
    typeTag:
      e.kind === 'player'
        ? 'CharacterBody2D'
        : e.isBoss
          ? `BossWarden2D[P${e.bossPhase}]`
          : e.kind === 'enemy'
            ? `EnemyAI(${e.aiProfile})`
            : 'TargetDummy2D',
    props: {
      kind: e.kind,
      x: Math.round(e.x),
      y: Math.round(e.y),
      hp: e.hp,
      maxHp: e.maxHp,
      moveSpeed: Number(e.moveSpeed.toFixed(2)),
      facing: e.facing,
      state: e.state,
      aiState: e.aiState,
      patrolRange: e.patrolRange,
    },
  }));

  const portalNodes: EngineSceneNode[] = ctx.portals.map((p) => ({
    id: `portal:${p.id}`,
    label: p.id,
    kind: 'portal',
    typeTag: 'StagePortal2D',
    props: {
      x: Math.round(p.x),
      y: Math.round(p.y),
      targetStage: p.targetStage,
      unlock: p.unlock,
      unlocked: ctx.isPortalUnlocked(p),
      color: p.color,
    },
  }));

  const pickupNodes: EngineSceneNode[] = ctx.pickups.map((pk) => ({
    id: `pickup:${pk.id}`,
    label: pk.id,
    kind: 'pickup',
    typeTag: `Pickup(${pk.kind})`,
    props: {
      kind: pk.kind,
      x: Math.round(pk.x),
      y: Math.round(pk.y),
      collected: pk.collected,
      value: pk.value,
      color: pk.color,
    },
  }));

  const parallaxNodes: EngineSceneNode[] = ctx.parallaxLayers.map((layer, idx) => ({
    id: `parallax:${idx}`,
    label: `${layer.type}_${idx + 1}`,
    kind: 'parallax',
    typeTag: 'ParallaxLayer',
    props: {
      type: layer.type,
      speed: layer.speed,
      color: layer.color,
      heightRatio: layer.heightRatio ?? 0.8,
    },
  }));

  const actionNodes: EngineSceneNode[] = [...ctx.compiledActions.values()].map((act) => {
    const refBox = act.boxes.find((b) => b.hit.active) ?? act.boxes[0];
    return {
      id: `action:${act.name}`,
      label: act.name,
      kind: 'action',
      typeTag: 'CompiledAction',
      props: {
        fps: act.fps,
        loop: act.loop,
        frames: act.frames.length,
        activeHitFrames: act.boxes.filter((b) => b.hit.active).length,
        hitX: refBox?.hit.x ?? 40,
        hitY: refBox?.hit.y ?? 18,
        hitW: refBox?.hit.w ?? 30,
        hitH: refBox?.hit.h ?? 34,
      },
    };
  });

  const stageNode: EngineSceneNode = {
    id: 'stage:current',
    label: ctx.stageTitle,
    kind: 'stage',
    typeTag: `Stage(${ctx.stageId})`,
    props: {
      stageId: ctx.stageId,
      gamePhase: ctx.gamePhase,
      keys: ctx.keysCollected.join(', ') || 'none',
    },
  };

  const envNode: EngineSceneNode = {
    id: 'env:world',
    label: 'Environment2D',
    kind: 'environment',
    typeTag: 'WorldEnvironment',
    props: {
      ambientDarkness: Number(ctx.ambientDarkness.toFixed(2)),
      skyTopColor: ctx.skyTopColor,
      skyBottomColor: ctx.skyBottomColor,
      autoCombatAudio: ctx.autoCombatAudio,
    },
  };

  const tileNode: EngineSceneNode = {
    id: 'tilemap:main',
    label: 'TileMapLayer',
    kind: 'tilemap',
    typeTag: 'AutoTileMap2D',
    props: {
      cols: ctx.tileCols,
      rows: ctx.tileRows,
      tileSize: ctx.tileSize,
      torches: ctx.torchPositions.length,
    },
  };

  const root: EngineSceneNode = {
    id: 'root:scene',
    label: 'WorldRoot',
    kind: 'root',
    typeTag: 'Node2D',
    props: {
      tick: ctx.tick,
      score: ctx.score,
      combo: ctx.combo,
      crc32: `0x${ctx.crc32.toString(16).toUpperCase().padStart(8, '0')}`,
    },
    children: [
      stageNode,
      envNode,
      tileNode,
      ...portalNodes,
      ...pickupNodes,
      ...parallaxNodes,
      ...lightNodes,
      ...entityNodes,
      ...actionNodes,
    ],
  };

  const countNodes = (n: EngineSceneNode): number =>
    1 + (n.children ? n.children.reduce((acc, c) => acc + countNodes(c), 0) : 0);

  return { root, nodeCount: countNodes(root) };
}

export function generateFluentNodeCodeSnippet(ctx: SceneTreeContext, nodeId: string): string {
  if (nodeId === 'env:world') {
    return `scene\n  .sky('${ctx.skyTopColor}', '${ctx.skyBottomColor}')\n  .ambient(${ctx.ambientDarkness.toFixed(2)});`;
  }
  if (nodeId.startsWith('light:')) {
    const id = nodeId.slice('light:'.length);
    const l = ctx.pointLights.find((item, i) => (item.id ?? String(i)) === id);
    if (!l) return '';
    if (l.attachTo) {
      return `light('${l.id}')\n  .attachTo('${l.attachTo}', 0, ${l.offsetY ?? -26})\n  .radius(${Math.round(l.radius)})\n  .color('${l.color}')\n  .intensity(${(l.intensity ?? 0.9).toFixed(2)})\n  .flicker(${(l.flicker ?? 0.05).toFixed(2)});`;
    }
    return `light('${l.id}')\n  .at(${Math.round(l.x)}, ${Math.round(l.y)})\n  .radius(${Math.round(l.radius)})\n  .color('${l.color}')\n  .intensity(${(l.intensity ?? 0.9).toFixed(2)})\n  .flicker(${(l.flicker ?? 0.05).toFixed(2)});`;
  }
  if (nodeId.startsWith('entity:')) {
    const id = nodeId.slice('entity:'.length);
    const e = ctx.entityList.find((ent) => ent.id === id);
    if (!e) return '';
    const ctor = e.kind === 'player' ? 'hero' : e.kind === 'enemy' ? 'enemy' : 'dummy';
    return `${ctor}('${e.id}')\n  .at(${Math.round(e.x)}, ${Math.round(e.y)})\n  .hp(${e.maxHp})\n  .speed(${e.moveSpeed.toFixed(2)})${e.kind === 'enemy' ? `\n  .patrol(${e.patrolRange})` : ''};`;
  }
  if (nodeId.startsWith('portal:')) {
    const id = nodeId.slice('portal:'.length);
    const p = ctx.portals.find((item) => item.id === id);
    if (!p) return '';
    const lockChain =
      p.unlock === 'require_key'
        ? `\n  .requireKey('${p.requiredKey ?? 'key'}')`
        : p.unlock === 'all_enemies'
          ? '\n  .requireClear()'
          : '';
    return `portal('${p.id}')\n  .at(${Math.round(p.x)}, ${Math.round(p.y)})\n  .to('${p.targetStage}', ${Math.round(p.spawnX)}, ${Math.round(p.spawnY)})${lockChain};`;
  }
  if (nodeId.startsWith('pickup:')) {
    const id = nodeId.slice('pickup:'.length);
    const pk = ctx.pickups.find((item) => item.id === id);
    if (!pk) return '';
    return `pickup('${pk.id}', '${pk.kind}')\n  .at(${Math.round(pk.x)}, ${Math.round(pk.y)})${pk.keyName ? `\n  .key('${pk.keyName}')` : `\n  .value(${pk.value})`};`;
  }
  if (nodeId.startsWith('action:')) {
    const name = nodeId.slice('action:'.length);
    const act = ctx.compiledActions.get(name);
    if (!act) return '';
    const refBox = act.boxes.find((b) => b.hit.active) ?? act.boxes[0];
    const activeIdx = act.boxes
      .map((b, i) => (b.hit.active ? i : -1))
      .filter((i) => i >= 0);
    return `action('${act.name}')\n  .fps(${act.fps})\n  .hitbox({ x: ${refBox?.hit.x ?? 40}, y: ${refBox?.hit.y ?? 18}, w: ${refBox?.hit.w ?? 30}, h: ${refBox?.hit.h ?? 34} }, ${JSON.stringify(activeIdx)});`;
  }
  return '// 選擇環境、光源、傳送門、道具、動作或實體節點即可產生對應流暢 DSL 程式碼';
}

export function exportStandaloneHtmlBuild(ctx: SceneTreeContext, title: string): string {
  const packedActions: Record<string, { fps: number; loop: boolean; frames: string[]; boxes: FrameBoxSpec[] }> = {};
  for (const [k, act] of ctx.compiledActions.entries()) {
    packedActions[k] = {
      fps: act.fps,
      loop: act.loop,
      frames: act.frames.map((c) => c.toDataURL('image/png')),
      boxes: act.boxes,
    };
  }

  const tileMapUrl = ctx.tileMapCanvas ? ctx.tileMapCanvas.toDataURL('image/png') : '';
  const payload = {
    title,
    ambientDarkness: ctx.ambientDarkness,
    skyTopColor: ctx.skyTopColor,
    skyBottomColor: ctx.skyBottomColor,
    tileSize: ctx.tileSize,
    tileGrid: ctx.tileGrid,
    tileMapUrl,
    parallaxLayers: ctx.parallaxLayers,
    lights: ctx.pointLights,
    entities: ctx.entityList.map((e) => ({ ...e })),
    actions: packedActions,
    sfx: {
      jump: ZZFX_PRESETS.jump,
      slash: ZZFX_PRESETS.slash,
    },
  };

  const closeScript = '<' + '/script>';
  const closeStyle = '<' + '/style>';
  const closeBody = '<' + '/body>';
  const closeHtml = '<' + '/html>';

  return [
    '<!DOCTYPE html><html lang="zh-TW"><head><meta charset="UTF-8">',
    `<title>${title} // ChronoForge Playable Build</title>`,
    '<style>',
    'body{margin:0;min-height:100vh;background:#090b10;color:#f1f5f9;font-family:monospace;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px;}',
    '.wrap{max-width:960px;width:100%;border:1px solid #232a3b;background:#111622;padding:12px;}',
    'canvas{width:100%;height:auto;aspect-ratio:16/9;display:block;image-rendering:pixelated;background:#090b10;}',
    '.hud{display:flex;justify-content:space-between;margin-top:8px;font-size:13px;color:#94a3b8;}',
    closeStyle,
    '</head><body><div class="wrap">',
    `<div style="margin-bottom:8px;color:#22c55e;font-weight:bold;">${title} · ChronoForge Compiled Build</div>`,
    '<canvas id="c" width="480" height="270"></canvas>',
    '<div class="hud"><span id="hp">HP 100/100</span><span>操作：A/D 移動 · W/Space 跳躍 · J 攻擊（含 ZzFX 8-bit 音效）</span></div>',
    '</div><script>',
    ZZFX_MICRO_RUNTIME_JS,
    `const D=${JSON.stringify(payload)};`,
    'const c=document.getElementById("c"),x=c.getContext("2d");',
    'const mImg=new Image();if(D.tileMapUrl)mImg.src=D.tileMapUrl;',
    'const aImgs={};Object.entries(D.actions).forEach(([k,a])=>{aImgs[k]=a.frames.map(u=>{const i=new Image();i.src=u;return i;});});',
    'const inp={l:0,r:0,j:0,s:0};let pj=0,ps=0;',
    'window.addEventListener("keydown",e=>{if(e.key==="a"||e.key==="ArrowLeft")inp.l=1;if(e.key==="d"||e.key==="ArrowRight")inp.r=1;if(e.key==="w"||e.key===" "||e.key==="ArrowUp"){e.preventDefault();inp.j=1;}if(e.key==="j"||e.key==="J")inp.s=1;});',
    'window.addEventListener("keyup",e=>{if(e.key==="a"||e.key==="ArrowLeft")inp.l=0;if(e.key==="d"||e.key==="ArrowRight")inp.r=0;if(e.key==="w"||e.key===" "||e.key==="ArrowUp")inp.j=0;if(e.key==="j"||e.key==="J")inp.s=0;});',
    'let p=D.entities.find(e=>e.kind==="player")||D.entities[0];',
    'function solid(px,py){const cc=Math.floor(px/D.tileSize),rr=Math.floor(py/D.tileSize);const row=D.tileGrid[rr];if(!row)return false;const t=row[cc];return t==="stone"||t==="moss"||t==="brick";}',
    'let camX=0,tick=0;',
    'function step(){tick++;if(!p)return;let vx=0;if(inp.l){vx=-2.5;p.facing=-1;}if(inp.r){vx=2.5;p.facing=1;}p.vx=vx;if(inp.j&&!pj&&p.grounded){p.vy=-6.2;p.grounded=false;zzfx(...D.sfx.jump);}p.vy=Math.min(8,p.vy+0.34);p.x+=p.vx;p.y+=p.vy;p.grounded=false;if(D.tileGrid.length){if(p.vy>=0&&solid(p.x,p.y)){p.y=Math.floor(p.y/D.tileSize)*D.tileSize;p.vy=0;p.grounded=true;}}else if(p.y>242){p.y=242;p.vy=0;p.grounded=true;}if(inp.s&&!ps&&p.state!=="slash"){p.state="slash";p.frameIdx=0;zzfx(...D.sfx.slash);}pj=inp.j;ps=inp.s;if(p.state!=="slash"){p.state=!p.grounded&&D.actions.jump?"jump":vx?"run":"idle";}const act=D.actions[p.state]||D.actions.idle;if(tick%Math.max(2,Math.round(60/act.fps))===0){p.frameIdx++;if(p.frameIdx>=act.frames.length){p.frameIdx=0;if(!act.loop)p.state="idle";}}camX=Math.max(0,p.x-240);}',
    'function draw(){const g=x.createLinearGradient(0,0,0,270);g.addColorStop(0,D.skyTopColor);g.addColorStop(1,D.skyBottomColor);x.fillStyle=g;x.fillRect(0,0,480,270);x.save();x.translate(-Math.round(camX),0);if(D.tileMapUrl&&mImg.complete)x.drawImage(mImg,0,0);D.entities.forEach(e=>{const imgs=aImgs[e.state]||aImgs.idle;const im=imgs&&imgs[e.frameIdx%imgs.length];if(im&&im.complete){x.save();x.translate(Math.round(e.x),Math.round(e.y-64));x.scale(e.facing,1);x.drawImage(im,-36,0);x.restore();}});x.restore();}',
    'function loop(){step();draw();requestAnimationFrame(loop);}requestAnimationFrame(loop);',
    closeScript,
    closeBody,
    closeHtml,
  ].join('');
}

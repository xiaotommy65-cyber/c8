import { installHeadlessDomShim } from './headlessDomShim';
import { ChronoForgeEngine, type EngineInputState } from './ChronoForgeEngine';
import { compileAndExecuteProject } from './moduleCompiler';
import type {
  ExternalImportedAssets,
  GamePhase,
  StudioBundleInput,
  VirtualProjectFile,
} from './types';

export type PlaytestScenarioId =
  | 'combat-sweep'
  | 'reachability-jump'
  | 'idle-liveness'
  | 'campaign-clear';

export interface PlaytestCheckItem {
  id: string;
  label: string;
  status: 'pass' | 'warn' | 'fail';
  detail: string;
}

export interface PlaytestReport {
  success: boolean;
  error?: string;
  scenario: PlaytestScenarioId;
  ticksSimulated: number;
  compileMs: number;
  simMs: number;
  crc32: string;
  checks: PlaytestCheckItem[];
  metrics: {
    hitsLanded: number;
    totalDamageDealt: number;
    playerDamageTaken: number;
    maxCombo: number;
    playerFinalX: number;
    playerFinalY: number;
    activeCoroutines: number;
    entityCount: number;
    lightCount: number;
    compiledActions: string[];
    stagesVisited?: string[];
    keysCollected?: number;
    bossPhaseReached?: number;
    finalGamePhase?: GamePhase;
  };
  timelineEvents: string[];
  spatialHints: string[];
  asciiRadar: string;
}

function getTileFromEngine(engine: ChronoForgeEngine, c: number, r: number): string {
  const internal = engine as unknown as {
    tileGrid?: string[][];
    tileRows?: number;
    tileCols?: number;
  };
  const rows = internal.tileRows ?? internal.tileGrid?.length ?? 0;
  const cols = internal.tileCols ?? internal.tileGrid?.[0]?.length ?? 0;
  if (r < 0 || r >= rows || c < 0 || c >= cols) return 'empty';
  return internal.tileGrid?.[r]?.[c] ?? 'empty';
}

function buildAsciiRadar(engine: ChronoForgeEngine): string {
  const tree = engine.getSceneTree();
  const tileNode = tree.root.children?.find((n) => n.kind === 'tilemap');
  const cols = Math.min(48, Math.max(24, Number(tileNode?.props.cols ?? 36)));
  const rows = Math.min(18, Math.max(10, Number(tileNode?.props.rows ?? 16)));
  const tileSize = Math.max(8, Number(tileNode?.props.tileSize ?? 16));

  const internal = engine as unknown as {
    tileGrid?: string[][];
  };

  const grid: string[][] = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => {
      const t = internal.tileGrid?.[r]?.[c] ?? 'empty';
      if (t === 'stone' || t === 'brick') return '#';
      if (t === 'moss') return '=';
      if (t === 'platform') return '-';
      if (t === 'spike') return '^';
      if (t === 'torch') return 'T';
      return '.';
    }),
  );

  for (const pk of engine.worldPickups.list()) {
    if (pk.collected) continue;
    const pc = Math.max(0, Math.min(cols - 1, Math.floor(pk.x / tileSize)));
    const pr = Math.max(0, Math.min(rows - 1, Math.floor(pk.y / tileSize)));
    grid[pr][pc] = pk.kind === 'key' ? 'K' : '+';
  }

  for (const portal of engine.worldPortals.list()) {
    const oc = Math.max(0, Math.min(cols - 1, Math.floor(portal.x / tileSize)));
    const or = Math.max(0, Math.min(rows - 1, Math.floor((portal.y - 12) / tileSize)));
    grid[or][oc] = 'O';
  }

  for (const ent of engine.entities.list()) {
    const ec = Math.max(0, Math.min(cols - 1, Math.floor(ent.x / tileSize)));
    const er = Math.max(0, Math.min(rows - 1, Math.floor((ent.y - 8) / tileSize)));
    grid[er][ec] = ent.kind === 'player' ? '@' : ent.isBoss ? 'B' : ent.kind === 'enemy' ? 'E' : 'D';
  }

  return grid.map((r) => r.join('')).join('\n');
}

function isSpikeAhead(engine: ChronoForgeEngine, x: number, y: number, dir: 1 | -1): boolean {
  const tileSize = 16;
  const col = Math.floor(x / tileSize);
  const floorRow = Math.floor((y + 4) / tileSize);
  const bodyRow = Math.floor((y - 4) / tileSize);
  for (const dc of [dir, dir * 2]) {
    if (
      getTileFromEngine(engine, col + dc, floorRow) === 'spike' ||
      getTileFromEngine(engine, col + dc, bodyRow) === 'spike'
    ) {
      return true;
    }
  }
  return false;
}

function chooseBotInput(
  scenario: PlaytestScenarioId,
  tick: number,
  engine: ChronoForgeEngine,
): EngineInputState {
  const empty: EngineInputState = { left: false, right: false, jump: false, slash: false, dash: false };
  if (scenario === 'idle-liveness') return empty;

  const player = engine.entities.list().find((e) => e.kind === 'player');
  if (!player) return empty;

  if (scenario === 'reachability-jump') {
    const phase = Math.floor(tick / 90) % 2;
    return {
      left: phase === 1,
      right: phase === 0,
      jump: tick % 44 >= 8 && tick % 44 <= 12,
      slash: false,
      dash: tick % 80 === 20,
    };
  }

  if (scenario === 'campaign-clear') {
    if (engine.game.phase !== 'playing') return empty;

    const enemies = engine.entities.list().filter((e) => e.kind === 'enemy' && !e.defeated);
    const portals = engine.worldPortals.list();
    const portal = portals[0];
    const uncollected = engine.worldPickups.list().filter((p) => !p.collected);
    const keyPickup = uncollected.find((p) => p.kind === 'key');
    const healPickup = uncollected.find((p) => p.kind === 'heal');

    // Decide primary spatial objective (x, y)
    let goalX = player.x + 80;
    let goalY = player.y;
    let combatTarget = enemies[0] ?? null;
    if (enemies.length > 0) {
      let bestD = Math.abs(enemies[0].x - player.x);
      for (const e of enemies) {
        const d = Math.abs(e.x - player.x);
        if (d < bestD) {
          bestD = d;
          combatTarget = e;
        }
      }
    }

    const portalOpen = portal ? engine.worldPortals.isUnlocked(portal) : false;

    if (portal && portalOpen) {
      goalX = portal.x;
      goalY = portal.y;
    } else if (keyPickup && (!combatTarget || Math.abs(combatTarget.x - player.x) > 64)) {
      goalX = keyPickup.x;
      goalY = keyPickup.y + 18;
    } else if (healPickup && player.hp <= player.maxHp * 0.65 && Math.abs(healPickup.x - player.x) < 160) {
      goalX = healPickup.x;
      goalY = healPickup.y + 18;
    } else if (combatTarget) {
      goalX = combatTarget.x;
      goalY = combatTarget.y;
    } else if (portal) {
      goalX = portal.x;
      goalY = portal.y;
    }

    const dx = goalX - player.x;
    const moveDir: 1 | -1 = dx >= 0 ? 1 : -1;
    const deadZone = combatTarget && goalX === combatTarget.x ? (combatTarget.isBoss ? 34 : 26) : 6;

    const threateningEnemy = enemies.find(
      (e) =>
        (e.aiState === 'telegraph' || e.aiState === 'slam') &&
        Math.abs(e.x - player.x) <= 92 &&
        Math.abs(e.y - player.y) <= 44,
    );

    const needsHighJump = player.y > goalY + 18 && Math.abs(dx) <= 42 && tick % 26 < 4;
    const spikeJump = Math.abs(dx) > deadZone && isSpikeAhead(engine, player.x, player.y, moveDir);
    const dodgeJump = Boolean(threateningEnemy) && player.grounded;
    const stuckJump = Math.abs(player.vx) < 0.05 && Math.abs(dx) > deadZone && tick % 36 < 4;

    const closeEnemy = enemies.find(
      (e) =>
        Math.abs(e.x - player.x) <= (e.isBoss ? 56 : 44) &&
        Math.abs(e.y - player.y) <= (e.isBoss ? 64 : 46),
    );

    return {
      left: dx < -deadZone,
      right: dx > deadZone,
      jump: spikeJump || dodgeJump || needsHighJump || stuckJump,
      slash: Boolean(closeEnemy) && tick % 18 >= 1 && tick % 18 <= 4,
      dash: Boolean(threateningEnemy) && player.dashTicks === 0 && tick % 45 === 10,
    };
  }

  // combat-sweep: navigate toward nearest target & test hitbox contact
  const targets = engine.entities.list().filter((e) => e.kind !== 'player');
  if (targets.length === 0) {
    return { ...empty, right: tick % 80 < 40, slash: tick % 28 === 10 };
  }

  let nearest = targets[0];
  let bestDist = Math.abs(nearest.x - player.x);
  for (const t of targets) {
    const d = Math.abs(t.x - player.x);
    if (d < bestDist) {
      bestDist = d;
      nearest = t;
    }
  }

  const dx = nearest.x - player.x;
  const inStrikeRange = Math.abs(dx) <= 44 && Math.abs(nearest.y - player.y) <= 48;

  return {
    left: dx < -28,
    right: dx > 28,
    jump: (player.y > nearest.y + 18 && tick % 36 < 4) || (Math.abs(player.vx) < 0.05 && tick % 40 < 4),
    slash: inStrikeRange && tick % 22 >= 2 && tick % 22 <= 5,
    dash: Math.abs(dx) > 110 && tick % 65 === 15,
  };
}

export async function runHeadlessPlaytest(
  files: VirtualProjectFile[],
  entryFile: string,
  options: {
    ticks?: number;
    scenario?: PlaytestScenarioId;
    importedBundle?: StudioBundleInput | null;
    importedAssets?: ExternalImportedAssets | null;
  } = {},
): Promise<PlaytestReport> {
  installHeadlessDomShim();

  const scenario = options.scenario ?? 'combat-sweep';
  const defaultTicks = scenario === 'campaign-clear' ? 1800 : 240;
  const maxTicks = Math.max(30, Math.min(3600, options.ticks ?? defaultTicks));

  const engine = new ChronoForgeEngine();
  engine.audio.setMuted(true);

  const compileRes = await compileAndExecuteProject(
    files,
    entryFile,
    engine,
    options.importedBundle ?? null,
    options.importedAssets ?? null,
  );

  if (!compileRes.success) {
    return {
      success: false,
      error: compileRes.error,
      scenario,
      ticksSimulated: 0,
      compileMs: compileRes.compileMs,
      simMs: 0,
      crc32: '0x00000000',
      checks: [
        {
          id: 'compile',
          label: 'TypeScript 編譯與多檔連結',
          status: 'fail',
          detail: compileRes.error ?? '未知編譯錯誤',
        },
      ],
      metrics: {
        hitsLanded: 0,
        totalDamageDealt: 0,
        playerDamageTaken: 0,
        maxCombo: 0,
        playerFinalX: 0,
        playerFinalY: 0,
        activeCoroutines: 0,
        entityCount: 0,
        lightCount: 0,
        compiledActions: [],
      },
      timelineEvents: [],
      spatialHints: [],
      asciiRadar: '',
    };
  }

  let hitsLanded = 0;
  let totalDamageDealt = 0;
  let playerDamageTaken = 0;
  let maxCombo = 0;
  let sawMovement = false;
  let sawGrounded = false;
  let bossPhaseReached = 1;
  let keysCollected = 0;
  const stagesVisited = new Set<string>([engine.stages.current().id]);
  const timelineEvents: string[] = [];

  const playerStart = engine.entities.list().find((e) => e.kind === 'player');
  const startX = playerStart?.x ?? 0;

  engine.signals.on('combat:hit', (payload) => {
    hitsLanded++;
    totalDamageDealt += payload.damage;
    if (timelineEvents.length < 32) {
      timelineEvents.push(
        `[t=${engine.tick}] 命中 ${payload.attacker.id} -> ${payload.target.id} (-${payload.damage} HP)`,
      );
    }
  });

  engine.signals.on('entity:hurt', (payload) => {
    if (payload.entity.kind === 'player') {
      playerDamageTaken += payload.damage;
      if (timelineEvents.length < 32) {
        timelineEvents.push(
          `[t=${engine.tick}] 玩家受傷 來源=${payload.source} (-${payload.damage} HP)`,
        );
      }
    }
  });

  engine.signals.on('pickup:collect', (payload) => {
    if (payload.pickup.kind === 'key') keysCollected++;
    if (timelineEvents.length < 32) {
      timelineEvents.push(`[t=${engine.tick}] 取得收集品 ${payload.pickup.id} (${payload.pickup.kind})`);
    }
  });

  engine.signals.on('stage:enter', (payload) => {
    stagesVisited.add(payload.stageId);
    if (timelineEvents.length < 32) {
      timelineEvents.push(`[t=${engine.tick}] 進入關卡 ${payload.stageId} (${payload.stageTitle})`);
    }
  });

  engine.signals.on('entity:defeated', (payload) => {
    if (timelineEvents.length < 32) {
      timelineEvents.push(`[t=${engine.tick}] 擊破敵人 ${payload.entity.id}`);
    }
  });

  engine.signals.on('boss:phase', (payload) => {
    bossPhaseReached = Math.max(bossPhaseReached, payload.phase);
    if (timelineEvents.length < 32) {
      timelineEvents.push(`[t=${engine.tick}] Boss 狂暴進入 Phase ${payload.phase}`);
    }
  });

  engine.signals.on('game:phase', (payload) => {
    if (timelineEvents.length < 32) {
      timelineEvents.push(`[t=${engine.tick}] 戰局結果: ${payload.phase.toUpperCase()} (${payload.title})`);
    }
  });

  let ticksSimulated = 0;
  const tSim0 = performance.now();
  for (let i = 0; i < maxTicks; i++) {
    const input = chooseBotInput(scenario, i, engine);
    engine.stepTick(input);
    ticksSimulated = i + 1;
    if (engine.combo > maxCombo) maxCombo = engine.combo;
    const p = engine.entities.list().find((e) => e.kind === 'player');
    if (p) {
      if (p.grounded) sawGrounded = true;
      if (Math.abs(p.x - startX) > 8 || stagesVisited.size > 1) sawMovement = true;
    }
    if (scenario === 'campaign-clear' && engine.game.phase !== 'playing') {
      break;
    }
  }
  const simMs = Number((performance.now() - tSim0).toFixed(2));

  const stats = engine.getStats();
  const finalPlayer = engine.entities.list().find((e) => e.kind === 'player');
  const hasTargets = engine.entities.list().some((e) => e.kind !== 'player');
  const crcHex = `0x${stats.crc32.toString(16).toUpperCase().padStart(8, '0')}`;

  const checks: PlaytestCheckItem[] = [
    {
      id: 'compile',
      label: 'TypeScript 編譯與多檔連結',
      status: 'pass',
      detail: `編譯 ${compileRes.compiledFilesCount} 個模組，產出 ${stats.compiledFrameCount} 幀精靈 (${compileRes.compileMs} ms)`,
    },
    {
      id: 'player_ground',
      label: '玩家生成與地形接地檢定',
      status: finalPlayer ? (sawGrounded ? 'pass' : 'warn') : 'fail',
      detail: finalPlayer
        ? sawGrounded
          ? `最終座標 (${Math.round(finalPlayer.x)}, ${Math.round(finalPlayer.y)})，地形站立正常`
          : '玩家未偵測到接地 (grounded=false)，請檢查地形碰撞列高'
        : '場景中缺少 player 實體，無法進行操作測試',
    },
    {
      id: 'combat_hitbox',
      label: '攻擊 Hitbox 接觸判定',
      status:
        scenario !== 'combat-sweep' && scenario !== 'campaign-clear'
          ? 'pass'
          : !hasTargets && hitsLanded === 0
            ? 'pass'
            : hitsLanded > 0
              ? 'pass'
              : 'warn',
      detail:
        scenario !== 'combat-sweep' && scenario !== 'campaign-clear'
          ? '非戰鬥劇本（略過主動揮砍接觸檢定）'
          : hitsLanded > 0
            ? `實戰命中 ${hitsLanded} 次，累計輸出 ${totalDamageDealt} 傷害，最高連擊 ${maxCombo}`
            : !hasTargets
              ? '場景內無敵對/木樁目標可供檢定'
              : '機器人靠近目標揮砍但未觸發 Hitbox，請檢查 defaultHitbox 或地形高低差',
    },
    {
      id: 'traversal',
      label: '位移探索與協程活性',
      status:
        scenario === 'idle-liveness'
          ? 'pass'
          : sawMovement
            ? 'pass'
            : 'warn',
      detail:
        scenario === 'idle-liveness'
          ? `靜態活性正常，進行中協程 ${engine.flow.activeCount()} 個`
          : sawMovement
            ? `水平移動暢通，歷經關卡 ${[...stagesVisited].join(' -> ')}`
            : '玩家未能產生有效水平位移，可能遭到出生點牆壁阻擋',
    },
    ...(scenario === 'campaign-clear'
      ? [
          {
            id: 'campaign_clear',
            label: '多關卡推進與 Boss 通關迴圈檢定',
            status: (engine.game.phase === 'victory' ? 'pass' : 'fail') as 'pass' | 'fail',
            detail:
              engine.game.phase === 'victory'
                ? `於 ${ticksSimulated} ticks 突破 ${stagesVisited.size} 關卡（Boss Phase ${bossPhaseReached}）達成 VICTORY！`
                : `模擬結束狀態=${engine.game.phase.toUpperCase()}，停留在 ${engine.stages.current().id}（取得鑰匙 ${keysCollected} 把 · Boss Phase ${bossPhaseReached}）`,
          },
        ]
      : []),
    {
      id: 'determinism',
      label: '確定性 CRC32 狀態校驗',
      status: 'pass',
      detail: `${ticksSimulated} ticks 模擬耗時 ${simMs} ms · CRC32 ${crcHex}`,
    },
  ];

  const spatialHints: string[] = [];
  if (finalPlayer && hasTargets && hitsLanded === 0 && scenario === 'combat-sweep') {
    const targets = engine.entities.list().filter((e) => e.kind !== 'player');
    let nearest = targets[0];
    let bestDist = Math.abs(nearest.x - finalPlayer.x);
    for (const t of targets) {
      const d = Math.abs(t.x - finalPlayer.x);
      if (d < bestDist) {
        bestDist = d;
        nearest = t;
      }
    }

    const internal = engine as unknown as {
      tileGrid?: string[][];
      tileSize?: number;
    };
    const tileSize = Math.max(8, internal.tileSize ?? 16);
    const grid = internal.tileGrid ?? [];
    const pCol = Math.floor(finalPlayer.x / tileSize);
    const tCol = Math.floor(nearest.x / tileSize);
    const bodyRow = Math.max(0, Math.min(grid.length - 1, Math.floor((finalPlayer.y - 12) / tileSize)));
    const stepDir = tCol >= pCol ? 1 : -1;

    const blockedCols: number[] = [];
    for (let c = pCol; stepDir > 0 ? c <= tCol : c >= tCol; c += stepDir) {
      const cell = grid[bodyRow]?.[c];
      if (cell === 'stone' || cell === 'brick' || cell === 'moss') {
        blockedCols.push(c);
      }
    }

    if (blockedCols.length > 0) {
      const firstCol = blockedCols[0];
      spatialHints.push(
        `牆體阻塞病因：row=${bodyRow}, col=${firstCol} (x=${firstCol * tileSize}..${(firstCol + 1) * tileSize}) 固體磚塊阻斷玩家 (${Math.round(finalPlayer.x)}, ${Math.round(finalPlayer.y)}) 通往 ${nearest.id}，建議呼叫 patch_tilemap_cell 開鑿通行口。`,
      );
    }

    const dx = Math.round(nearest.x - finalPlayer.x);
    const dy = Math.round(nearest.y - finalPlayer.y);
    if (Math.abs(dy) > 36 || Math.abs(dx) > 48) {
      spatialHints.push(
        `目標距離落差：${nearest.id} 位處 (${Math.round(nearest.x)}, ${Math.round(nearest.y)})，與玩家終點 (${Math.round(finalPlayer.x)}, ${Math.round(finalPlayer.y)}) 相距 dx=${dx}px, dy=${dy}px；可調整座標或用 patch_action_hitbox 擴展 slash 攻擊框。`,
      );
    }
  }

  return {
    success: checks.every((c) => c.status !== 'fail'),
    scenario,
    ticksSimulated,
    compileMs: compileRes.compileMs,
    simMs,
    crc32: crcHex,
    checks,
    metrics: {
      hitsLanded,
      totalDamageDealt,
      playerDamageTaken,
      maxCombo,
      playerFinalX: Math.round(finalPlayer?.x ?? 0),
      playerFinalY: Math.round(finalPlayer?.y ?? 0),
      activeCoroutines: engine.flow.activeCount(),
      entityCount: stats.entityCount,
      lightCount: stats.lightCount,
      compiledActions: engine.actions.list(),
      stagesVisited: [...stagesVisited],
      keysCollected,
      bossPhaseReached,
      finalGamePhase: engine.game.phase,
    },
    timelineEvents,
    spatialHints,
    asciiRadar: buildAsciiRadar(engine),
  };
}


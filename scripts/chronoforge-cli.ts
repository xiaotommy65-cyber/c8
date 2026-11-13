import { readWorkspaceBus } from '../server/mcpGateway.ts';
import { runHeadlessPlaytest, type PlaytestScenarioId } from '../src/engine/playtestDiagnostics.ts';
import { ENGINE_PRESETS } from '../src/engine/presets.ts';

function parseArg(flag: string): string | undefined {
  const prefix = `--${flag}=`;
  const found = process.argv.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}

async function main() {
  const presetArg = parseArg('preset');
  const scenarioArg = (parseArg('scenario') ?? 'combat-sweep') as PlaytestScenarioId;
  const ticksArg = Number(parseArg('ticks') ?? '240');
  const asJson = process.argv.includes('--json');

  let files;
  let entryFile;
  let label;

  if (presetArg) {
    const preset = ENGINE_PRESETS.find((p) => p.id === presetArg);
    if (!preset) {
      console.error(`找不到預設卡匣：${presetArg}`);
      process.exit(1);
    }
    entryFile = preset.entryFile ?? 'main.ts';
    files =
      preset.files?.map((f) => ({ ...f })) ?? [
        { path: 'main.ts', kind: 'entry' as const, code: preset.code },
      ];
    label = `Preset(${preset.id})`;
  } else {
    const ws = readWorkspaceBus();
    files = ws.files;
    entryFile = ws.entryFile;
    label = `Workspace(${ws.presetId}, source=${ws.source})`;
  }

  const report = await runHeadlessPlaytest(files, entryFile, {
    scenario: scenarioArg,
    ticks: ticksArg,
  });

  if (asJson) {
    console.log(JSON.stringify({ source: label, ...report }, null, 2));
    process.exit(report.success ? 0 : 1);
  }

  console.log(`\nChronoForge Headless Verification CLI · ${label}`);
  console.log(`Scenario: ${report.scenario} | Ticks: ${report.ticksSimulated} | Compile: ${report.compileMs}ms | Sim: ${report.simMs}ms | CRC32: ${report.crc32}\n`);
  for (const c of report.checks) {
    const mark = c.status === 'pass' ? '[PASS]' : c.status === 'warn' ? '[WARN]' : '[FAIL]';
    console.log(`${mark} ${c.label}: ${c.detail}`);
  }
  if (report.timelineEvents.length > 0) {
    console.log('\nTimeline Events:');
    for (const ev of report.timelineEvents.slice(0, 10)) {
      console.log(`  ${ev}`);
    }
  }
  if (report.asciiRadar) {
    console.log('\nASCII Level Radar (@=Hero, E=Enemy, D=Dummy, T=Torch, #/==Solid):');
    console.log(report.asciiRadar);
  }
  process.exit(report.success ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

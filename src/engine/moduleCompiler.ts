import { transform } from 'sucrase';
import type { ChronoForgeEngine } from './ChronoForgeEngine';
import type { ExternalImportedAssets, StudioBundleInput, VirtualProjectFile } from './types';

export interface ModuleCompileResult {
  success: boolean;
  error?: string;
  errorFile?: string;
  compiledFilesCount: number;
  compileMs: number;
}

function normalizeVirtualPath(rawPath: string): string {
  return rawPath
    .trim()
    .replace(/^\.\//, '')
    .replace(/^\//, '');
}

function resolveImportTarget(specifier: string, fileMap: Map<string, VirtualProjectFile>): string | null {
  const clean = normalizeVirtualPath(specifier);
  const candidates = [
    clean,
    `${clean}.ts`,
    `${clean}.js`,
    `${clean}/index.ts`,
  ];
  for (const cand of candidates) {
    if (fileMap.has(cand)) return cand;
  }
  return null;
}

function extractRelativeImports(code: string): string[] {
  const deps = new Set<string>();
  const stripped = code
    .replace(/^\s*(?:import|export)\s+type\s+[^;]+;?/gm, '');
  const importRegex = /(?:import|export)\s+(?:[^'"]*from\s+)?['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)/g;
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(stripped)) !== null) {
    const spec = match[1] ?? match[2];
    if (spec && (spec.startsWith('./') || spec.startsWith('../') || !spec.includes('/'))) {
      deps.add(spec);
    }
  }
  return [...deps];
}

export async function compileAndExecuteProject(
  files: VirtualProjectFile[],
  entryFile: string,
  engine: ChronoForgeEngine,
  importedBundle: StudioBundleInput | null,
  importedAssets: ExternalImportedAssets | null,
): Promise<ModuleCompileResult> {
  const t0 = performance.now();
  const fileMap = new Map<string, VirtualProjectFile>();
  for (const f of files) {
    fileMap.set(normalizeVirtualPath(f.path), {
      ...f,
      path: normalizeVirtualPath(f.path),
    });
  }

  const normalizedEntry = normalizeVirtualPath(entryFile);
  if (!fileMap.has(normalizedEntry)) {
    return {
      success: false,
      error: `找不到進入點檔案：${entryFile}`,
      errorFile: entryFile,
      compiledFilesCount: 0,
      compileMs: 0,
    };
  }

  // 1. Topological sort with cycle detection starting from entryFile
  const order: string[] = [];
  const stateMap = new Map<string, 'visiting' | 'visited'>();

  const visit = (path: string, stack: string[]) => {
    const state = stateMap.get(path);
    if (state === 'visited') return;
    if (state === 'visiting') {
      const cycle = [...stack, path].join(' -> ');
      throw new Error(`偵測到循環模組依賴 (${cycle})`);
    }
    const file = fileMap.get(path);
    if (!file) {
      throw new Error(`找不到模組檔案：${path}`);
    }
    stateMap.set(path, 'visiting');
    const specs = extractRelativeImports(file.code);
    for (const spec of specs) {
      const resolved = resolveImportTarget(spec, fileMap);
      if (!resolved) {
        const err = new Error(`[${path}] 無法解析匯入模組 '${spec}'`) as Error & { file?: string };
        err.file = path;
        throw err;
      }
      visit(resolved, [...stack, path]);
    }
    stateMap.set(path, 'visited');
    order.push(path);
  };

  try {
    visit(normalizedEntry, []);
  } catch (err) {
    const e = err as Error & { file?: string };
    return {
      success: false,
      error: e.message,
      errorFile: e.file ?? normalizedEntry,
      compiledFilesCount: 0,
      compileMs: Number((performance.now() - t0).toFixed(2)),
    };
  }

  // 2. Transpile all reachable virtual TypeScript modules using Sucrase
  const transpiledMap = new Map<string, string>();
  for (const path of order) {
    const file = fileMap.get(path)!;
    try {
      const result = transform(file.code, {
        transforms: ['typescript', 'imports'],
        filePath: path,
      });
      transpiledMap.set(path, result.code);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: `[${path}] TypeScript 語法錯誤：${msg}`,
        errorFile: path,
        compiledFilesCount: 0,
        compileMs: Number((performance.now() - t0).toFixed(2)),
      };
    }
  }

  // 3. Evaluate modules sequentially in topological order (supports top-level await across modules!)
  const moduleCache = new Map<string, Record<string, unknown>>();
  const dsl = engine.dsl;
  const dslKeys = [
    'scene',
    'actor',
    'hero',
    'enemy',
    'dummy',
    'action',
    'light',
    'portal',
    'pickup',
    'stage',
    'stages',
    'game',
    'vfx',
    'sfx',
    'flow',
    'signals',
    'wait',
    'waitTicks',
    'waitUntil',
    'tween',
    'parallel',
    'sequence',
  ] as const;

  const dslValues = dslKeys.map((k) => dsl[k]);

  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (
    ...args: string[]
  ) => (...vals: unknown[]) => Promise<void>;

  for (const path of order) {
    const jsCode = transpiledMap.get(path)!;
    const modExports: Record<string, unknown> = {};
    const modObj = { exports: modExports };

    const scopedRequire = (specifier: string) => {
      const target = resolveImportTarget(specifier, fileMap);
      if (!target || !moduleCache.has(target)) {
        throw new Error(`[${path}] 執行期找不到已編譯模組 '${specifier}'`);
      }
      return moduleCache.get(target)!;
    };

    try {
      const fn = new AsyncFunction(
        'require',
        'module',
        'exports',
        'engine',
        'importedBundle',
        'importedAssets',
        ...dslKeys,
        jsCode,
      );
      await fn(
        scopedRequire,
        modObj,
        modExports,
        engine,
        importedBundle,
        importedAssets,
        ...dslValues,
      );
      moduleCache.set(path, modObj.exports);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: `[${path}] 執行期錯誤：${msg}`,
        errorFile: path,
        compiledFilesCount: order.length,
        compileMs: Number((performance.now() - t0).toFixed(2)),
      };
    }
  }

  const compileMs = Number((performance.now() - t0).toFixed(2));
  engine.compileMs = compileMs;
  engine.signals.emit('scene:ready', {
    tileCols: engine.getSceneTree().root.children?.[1]?.props.cols as number ?? 0,
    tileRows: engine.getSceneTree().root.children?.[1]?.props.rows as number ?? 0,
  });

  return {
    success: true,
    compiledFilesCount: order.length,
    compileMs,
  };
}

import fs from 'node:fs';
import path from 'node:path';
import { runHeadlessPlaytest, type PlaytestScenarioId } from '../src/engine/playtestDiagnostics.ts';
import { ENGINE_PRESETS } from '../src/engine/presets.ts';
import {
  patchActionHitboxInSource,
  patchProjectSourceFromInspector,
  patchTilemapInSource,
  type TilemapCellEdit,
} from '../src/engine/sourcePatcher.ts';
import type { VirtualProjectFile } from '../src/engine/types.ts';
import {
  THREEJS_MCP_RESOURCES,
  getThreeJsAgentGuide,
  readThreeJsMcpResource,
  searchThreeJsDocs,
  syncThreeJsDocs,
} from './threejsDocsService.ts';

export interface WorkspaceBusSnapshot {
  presetId: string;
  entryFile: string;
  files: VirtualProjectFile[];
  source: 'web' | 'mcp' | 'cli' | 'default';
  updatedAt: string | null;
}

type WorkspaceListener = (snapshot: WorkspaceBusSnapshot) => void;
const workspaceListeners = new Set<WorkspaceListener>();

export function subscribeWorkspaceUpdates(listener: WorkspaceListener): () => void {
  workspaceListeners.add(listener);
  return () => {
    workspaceListeners.delete(listener);
  };
}

const DATA_DIR = path.join(process.cwd(), 'data');
const WORKSPACE_BUS_FILE = path.join(DATA_DIR, 'workspace-bus.json');

function getDefaultWorkspace(): WorkspaceBusSnapshot {
  const first = ENGINE_PRESETS[0];
  return {
    presetId: first.id,
    entryFile: first.entryFile ?? 'main.ts',
    files:
      first.files?.map((f) => ({ ...f })) ?? [
        { path: 'main.ts', kind: 'entry', code: first.code, summary: '主腳本' },
      ],
    source: 'default',
    updatedAt: null,
  };
}

export function readWorkspaceBus(): WorkspaceBusSnapshot {
  if (!fs.existsSync(WORKSPACE_BUS_FILE)) {
    return getDefaultWorkspace();
  }
  try {
    const raw = fs.readFileSync(WORKSPACE_BUS_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<WorkspaceBusSnapshot>;
    if (Array.isArray(parsed.files) && parsed.files.length > 0 && parsed.entryFile) {
      return {
        presetId: parsed.presetId ?? 'custom-workspace',
        entryFile: parsed.entryFile,
        files: parsed.files,
        source: parsed.source ?? 'web',
        updatedAt: parsed.updatedAt ?? null,
      };
    }
  } catch {
    // fallback to default
  }
  return getDefaultWorkspace();
}

export function writeWorkspaceBus(input: {
  presetId?: string;
  entryFile?: string;
  files: VirtualProjectFile[];
  source?: 'web' | 'mcp' | 'cli';
}): WorkspaceBusSnapshot {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const snapshot: WorkspaceBusSnapshot = {
    presetId: input.presetId ?? 'custom-workspace',
    entryFile: input.entryFile ?? input.files[0]?.path ?? 'main.ts',
    files: input.files,
    source: input.source ?? 'web',
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(WORKSPACE_BUS_FILE, JSON.stringify(snapshot, null, 2), 'utf8');
  for (const listener of workspaceListeners) {
    try {
      listener(snapshot);
    } catch {
      // ignore closed listener
    }
  }
  return snapshot;
}

export const MCP_TOOL_DEFINITIONS = [
  {
    name: 'simulate_project',
    description:
      'Compile virtual TypeScript game modules and run deterministic headless ChronoForge physics, Hitbox collision checks, coroutine stepping, CRC32 verification, and return an ASCII level radar.',
    inputSchema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          description: 'Optional virtual .ts files. Defaults to active workspace bus if omitted.',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              kind: { type: 'string', enum: ['entry', 'module'] },
              code: { type: 'string' },
            },
            required: ['path', 'code'],
          },
        },
        entryFile: { type: 'string', description: 'Entry module path (default: main.ts)' },
        ticks: {
          type: 'number',
          description: 'Number of deterministic 60Hz ticks (30-3600, default 240 or 1800 for campaign-clear)',
        },
        scenario: {
          type: 'string',
          enum: ['combat-sweep', 'reachability-jump', 'idle-liveness', 'campaign-clear'],
          description: 'Bot playtest scenario to run',
        },
      },
    },
  },
  {
    name: 'get_workspace',
    description: 'Read the active ChronoForge multi-file TypeScript project from the shared workspace bus.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'push_workspace',
    description: 'Write updated multi-file TypeScript modules to the shared workspace bus for live web preview.',
    inputSchema: {
      type: 'object',
      properties: {
        presetId: { type: 'string' },
        entryFile: { type: 'string' },
        files: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              kind: { type: 'string', enum: ['entry', 'module'] },
              code: { type: 'string' },
            },
            required: ['path', 'code'],
          },
        },
      },
      required: ['files'],
    },
  },
  {
    name: 'patch_workspace_node',
    description:
      'Bidirectionally patch a Scene Tree node property (e.g. hero x/y/hp, light radius/color, env:world ambientDarkness) directly inside the corresponding .ts source file.',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Scene node ID, e.g. entity:hero, light:shrine_beacon, env:world' },
        prop: { type: 'string', description: 'Property name, e.g. x, y, hp, radius, color, ambientDarkness' },
        value: { type: ['string', 'number', 'boolean'] },
      },
      required: ['nodeId', 'prop', 'value'],
    },
  },
  {
    name: 'patch_tilemap_cell',
    description:
      'Bidirectionally edit one or more cells in the ASCII MAP_LAYOUT / compileTilemap grid inside the TypeScript scene module (e.g., punch a doorway in stone wall # by setting glyph to .).',
    inputSchema: {
      type: 'object',
      properties: {
        row: { type: 'number', description: 'Zero-based row index inside MAP_LAYOUT' },
        col: { type: 'number', description: 'Zero-based column index inside MAP_LAYOUT' },
        glyph: { type: 'string', description: 'Tile character (., #, =, -, T, ^)' },
        edits: {
          type: 'array',
          description: 'Optional batch edits [{ row, col, glyph }]',
          items: {
            type: 'object',
            properties: {
              row: { type: 'number' },
              col: { type: 'number' },
              glyph: { type: 'string' },
            },
            required: ['row', 'col', 'glyph'],
          },
        },
      },
    },
  },
  {
    name: 'patch_action_hitbox',
    description:
      'Bidirectionally update a compiled action hitbox rectangle { x, y, w, h } and optional active frames directly inside the TypeScript actor module.',
    inputSchema: {
      type: 'object',
      properties: {
        actionName: { type: 'string', description: 'Action identifier, e.g. slash' },
        x: { type: 'number' },
        y: { type: 'number' },
        w: { type: 'number' },
        h: { type: 'number' },
        activeFrames: {
          type: 'array',
          items: { type: 'number' },
        },
      },
      required: ['actionName'],
    },
  },
  {
    name: 'get_threejs_agent_guide',
    description:
      'Fetch the official Three.js (r187+) LLM/Agent instructions (threejs.org/docs/llms.txt) plus curated WebGPURenderer and TSL (three/tsl) art-pairing patterns.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'search_threejs_docs',
    description:
      'Search cached Three.js r187 official documentation (llms-full.txt) and TSL reference by class, shader node, or keyword (e.g. WebGPURenderer, MeshPhysicalNodeMaterial, Fn, CanvasTexture).',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search keyword(s), e.g. WebGPURenderer or MeshStandardNodeMaterial' },
        limit: { type: 'number', description: 'Max matching sections to return (1-10, default 5)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'sync_threejs_docs',
    description:
      'Force refresh the local server cache from official https://threejs.org/docs/llms.txt and llms-full.txt endpoints.',
    inputSchema: {
      type: 'object',
      properties: {
        force: { type: 'boolean', description: 'Force HTTP re-fetch bypassing 24h cache TTL (default true)' },
      },
    },
  },
];

export interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

export async function handleMcpJsonRpc(body: JsonRpcRequest): Promise<Record<string, unknown>> {
  const id = body?.id ?? null;
  const method = body?.method ?? '';
  const params = body?.params ?? {};

  if (method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {}, resources: {} },
        serverInfo: {
          name: 'chronoforge-closed-loop-runtime',
          version: '1.1.0',
        },
      },
    };
  }

  if (method === 'notifications/initialized' || method === 'ping') {
    return { jsonrpc: '2.0', id, result: {} };
  }

  if (method === 'tools/list') {
    return {
      jsonrpc: '2.0',
      id,
      result: { tools: MCP_TOOL_DEFINITIONS },
    };
  }

  if (method === 'resources/list') {
    return {
      jsonrpc: '2.0',
      id,
      result: { resources: THREEJS_MCP_RESOURCES },
    };
  }

  if (method === 'resources/read') {
    const uri = String(params.uri ?? '');
    const resItem = await readThreeJsMcpResource(uri);
    if (!resItem) {
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32602, message: `找不到指定 MCP Resource：${uri}` },
      };
    }
    return {
      jsonrpc: '2.0',
      id,
      result: {
        contents: [resItem],
      },
    };
  }

  if (method === 'tools/call') {
    const toolName = String(params.name ?? '');
    const args = (params.arguments ?? {}) as Record<string, unknown>;

    try {
      if (toolName === 'get_workspace') {
        const ws = readWorkspaceBus();
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: JSON.stringify(ws, null, 2) }],
            isError: false,
          },
        };
      }

      if (toolName === 'push_workspace') {
        const files = args.files as VirtualProjectFile[];
        if (!Array.isArray(files) || files.length === 0) {
          throw new Error('push_workspace 需要非空的 files 陣列');
        }
        const normalized = files.map((f, idx) => ({
          path: f.path,
          kind: f.kind ?? (idx === 0 ? ('entry' as const) : ('module' as const)),
          code: String(f.code ?? ''),
          summary: f.summary,
        }));
        const saved = writeWorkspaceBus({
          presetId: typeof args.presetId === 'string' ? args.presetId : 'mcp-agent-project',
          entryFile: typeof args.entryFile === 'string' ? args.entryFile : normalized[0].path,
          files: normalized,
          source: 'mcp',
        });
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: JSON.stringify({ ok: true, updatedAt: saved.updatedAt, fileCount: saved.files.length }) }],
            isError: false,
          },
        };
      }

      if (toolName === 'patch_workspace_node') {
        const ws = readWorkspaceBus();
        const nodeId = String(args.nodeId ?? '');
        const prop = String(args.prop ?? '');
        const value = args.value as string | number | boolean;
        const patch = patchProjectSourceFromInspector(ws.files, nodeId, prop, value);
        if (patch.patched) {
          writeWorkspaceBus({
            presetId: ws.presetId,
            entryFile: ws.entryFile,
            files: patch.updatedFiles,
            source: 'mcp',
          });
        }
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: JSON.stringify({ ...patch, updatedFiles: undefined }, null, 2) }],
            isError: !patch.patched,
          },
        };
      }

      if (toolName === 'patch_tilemap_cell') {
        const ws = readWorkspaceBus();
        const rawEdits = Array.isArray(args.edits)
          ? (args.edits as TilemapCellEdit[])
          : typeof args.row === 'number' && typeof args.col === 'number'
            ? [{ row: args.row, col: args.col, glyph: String(args.glyph ?? '.') }]
            : [];
        const patch = patchTilemapInSource(ws.files, rawEdits);
        if (patch.patched) {
          writeWorkspaceBus({
            presetId: ws.presetId,
            entryFile: ws.entryFile,
            files: patch.updatedFiles,
            source: 'mcp',
          });
        }
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: JSON.stringify({ ...patch, updatedFiles: undefined }, null, 2) }],
            isError: !patch.patched,
          },
        };
      }

      if (toolName === 'patch_action_hitbox') {
        const ws = readWorkspaceBus();
        const actionName = String(args.actionName ?? 'slash');
        const patch = patchActionHitboxInSource(
          ws.files,
          actionName,
          {
            x: typeof args.x === 'number' ? args.x : undefined,
            y: typeof args.y === 'number' ? args.y : undefined,
            w: typeof args.w === 'number' ? args.w : undefined,
            h: typeof args.h === 'number' ? args.h : undefined,
          },
          Array.isArray(args.activeFrames) ? (args.activeFrames as number[]) : undefined,
        );
        if (patch.patched) {
          writeWorkspaceBus({
            presetId: ws.presetId,
            entryFile: ws.entryFile,
            files: patch.updatedFiles,
            source: 'mcp',
          });
        }
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: JSON.stringify({ ...patch, updatedFiles: undefined }, null, 2) }],
            isError: !patch.patched,
          },
        };
      }

      if (toolName === 'simulate_project') {
        const ws = readWorkspaceBus();
        const files = Array.isArray(args.files) && args.files.length > 0
          ? (args.files as VirtualProjectFile[]).map((f, idx) => ({
              path: f.path,
              kind: f.kind ?? (idx === 0 ? ('entry' as const) : ('module' as const)),
              code: String(f.code ?? ''),
            }))
          : ws.files;
        const entryFile = typeof args.entryFile === 'string' ? args.entryFile : ws.entryFile;
        const scenario = (typeof args.scenario === 'string'
          ? args.scenario
          : 'combat-sweep') as PlaytestScenarioId;
        const ticks =
          typeof args.ticks === 'number'
            ? args.ticks
            : scenario === 'campaign-clear'
              ? 1800
              : 240;

        const report = await runHeadlessPlaytest(files, entryFile, { ticks, scenario });
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: JSON.stringify(report, null, 2) }],
            isError: !report.success,
          },
        };
      }

      if (toolName === 'get_threejs_agent_guide') {
        const guide = await getThreeJsAgentGuide();
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: `${guide.llmsTxt}\n\n---\n\n${guide.tslArtQuickstart}\n\n<!-- synced: ${guide.meta.syncedAt} (${guide.meta.source}, v${guide.meta.version}) -->`,
              },
            ],
            isError: false,
          },
        };
      }

      if (toolName === 'search_threejs_docs') {
        const query = String(args.query ?? '');
        const limit = typeof args.limit === 'number' ? args.limit : 5;
        const result = await searchThreeJsDocs(query, limit);
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            isError: false,
          },
        };
      }

      if (toolName === 'sync_threejs_docs') {
        const force = args.force !== false;
        const meta = await syncThreeJsDocs(force);
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: JSON.stringify({ ok: true, ...meta }, null, 2) }],
            isError: false,
          },
        };
      }

      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `未知 MCP 工具：${toolName}` },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: msg }],
          isError: true,
        },
      };
    }
  }

  return {
    jsonrpc: '2.0',
    id,
    error: { code: -32601, message: `不支援的 MCP 方法：${method}` },
  };
}

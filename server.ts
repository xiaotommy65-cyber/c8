import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createServer as createViteServer } from 'vite';
import { inspectHtmlArtifact } from './server/inspector.ts';
import { compareArtifactVersions } from './server/diff.ts';
import {
  handleMcpJsonRpc,
  MCP_TOOL_DEFINITIONS,
  readWorkspaceBus,
  subscribeWorkspaceUpdates,
  writeWorkspaceBus,
} from './server/mcpGateway.ts';
import {
  THREEJS_MCP_RESOURCES,
  getThreeJsAgentGuide,
  searchThreeJsDocs,
  syncThreeJsDocs,
} from './server/threejsDocsService.ts';
import { runHeadlessPlaytest, type PlaytestScenarioId } from './src/engine/playtestDiagnostics.ts';
import type { ArtifactRecord, CuratorialNote } from './src/types/artifact.ts';
import type { VirtualProjectFile } from './src/engine/types.ts';

const WORKSPACE_ROOT = process.cwd();
const DATA_DIR = path.join(WORKSPACE_ROOT, 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const ARCHIVE_FILE = path.join(DATA_DIR, 'archive.json');
const BUS_BUNDLE_FILE = path.join(DATA_DIR, 'bus-bundle.json');

const SEEDED_BASELINE_REL = 'assets/aistudio/Emerald_Ranger____HD_Pixel_Shader___Sprite_Sheet_Studio_82cc6658.html';
const SEEDED_BASELINE_ABS = path.join(WORKSPACE_ROOT, 'public', SEEDED_BASELINE_REL);

const LIVE_STUDIO_REL = 'emerald-ranger-studio.html';
const LIVE_STUDIO_ABS = path.join(WORKSPACE_ROOT, 'public', LIVE_STUDIO_REL);

function ensureStorageDirs() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

function readArchive(): ArtifactRecord[] {
  ensureStorageDirs();
  if (!fs.existsSync(ARCHIVE_FILE)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(ARCHIVE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeArchive(records: ArtifactRecord[]) {
  ensureStorageDirs();
  fs.writeFileSync(ARCHIVE_FILE, JSON.stringify(records, null, 2), 'utf8');
}

function resolveArtifactHtmlPath(record: ArtifactRecord): string {
  return path.join(WORKSPACE_ROOT, record.sourcePath);
}

function seedPrimaryArtifacts(): ArtifactRecord[] {
  let records = readArchive();
  let changed = false;
  const nowIso = new Date().toISOString();

  // 1. Ensure ACC-2026-001 (Original Baseline Snapshot)
  if (fs.existsSync(SEEDED_BASELINE_ABS)) {
    const baselineRaw = fs.readFileSync(SEEDED_BASELINE_ABS, 'utf8');
    const existing001Idx = records.findIndex((item) => item.accessionId === 'ACC-2026-001');
    if (existing001Idx === -1) {
      const report = inspectHtmlArtifact(
        baselineRaw,
        'Emerald_Ranger____HD_Pixel_Shader___Sprite_Sheet_Studio_82cc6658.html',
      );
      records.push({
        id: 'emerald-ranger-baseline-v1',
        accessionId: 'ACC-2026-001',
        versionTag: 'v1.0.0-baseline',
        title: '翠風遊俠 // 精靈圖工作室（原始基準快照）',
        originFileName: 'Emerald_Ranger____HD_Pixel_Shader___Sprite_Sheet_Studio_82cc6658.html',
        sourcePath: `public/${SEEDED_BASELINE_REL}`,
        previewUrl: `/${SEEDED_BASELINE_REL}`,
        archivedAt: nowIso,
        lastInspectedAt: nowIso,
        locked: true,
        technicalReport: report,
        curatorialNotes: [
          {
            id: 'note-seed-v1',
            author: '文物鑑定室',
            content:
              '原始上傳基準檔已永久封存為 v1.0.0-baseline。經檢測記錄色盤標示不一致、待機首幀 backArm 佩劍未渲染、ObjectURL 未回收及全域去背碰撞等問題。',
            createdAt: nowIso,
          },
        ],
      });
      changed = true;
    } else if (!records[existing001Idx].versionTag) {
      records[existing001Idx] = {
        ...records[existing001Idx],
        versionTag: 'v1.0.0-baseline',
        title: '翠風遊俠 // 精靈圖工作室（原始基準快照）',
      };
      changed = true;
    }
  }

  // 2. Ensure ACC-2026-002 (Live Upgraded Frontend v2.0.0)
  if (fs.existsSync(LIVE_STUDIO_ABS)) {
    const liveRaw = fs.readFileSync(LIVE_STUDIO_ABS, 'utf8');
    const liveReport = inspectHtmlArtifact(liveRaw, LIVE_STUDIO_REL);
    const existing002Idx = records.findIndex((item) => item.accessionId === 'ACC-2026-002');
    const targetVersionTag = 'v2.0.0-micro-engine';
    const targetTitle = '翠風遊俠 // ChronoPixel v2.0 微縮引擎與著色管線工作室';
    if (existing002Idx === -1) {
      records.unshift({
        id: 'emerald-ranger-studio-v1-1',
        accessionId: 'ACC-2026-002',
        versionTag: targetVersionTag,
        parentAccessionId: 'ACC-2026-001',
        title: targetTitle,
        originFileName: LIVE_STUDIO_REL,
        sourcePath: `public/${LIVE_STUDIO_REL}`,
        previewUrl: `/${LIVE_STUDIO_REL}`,
        archivedAt: nowIso,
        lastInspectedAt: nowIso,
        locked: true,
        technicalReport: liveReport,
        curatorialNotes: [
          {
            id: 'note-seed-v2-0',
            author: '工程修訂室',
            content:
              '現行前台已升級至 ChronoPixel v2.0：整合 5 階段可程式化像素著色器 Render Graph、60Hz 固定步長 ECS 與可重播確定性迴圈（含 CRC32 校驗），並內建單檔可執行遊戲卡匣編譯器。',
            createdAt: nowIso,
          },
        ],
      });
      changed = true;
    } else if (
      records[existing002Idx].versionTag !== targetVersionTag ||
      records[existing002Idx].technicalReport.metrics.fileSizeBytes !== liveReport.metrics.fileSizeBytes
    ) {
      records[existing002Idx] = {
        ...records[existing002Idx],
        versionTag: targetVersionTag,
        title: targetTitle,
        lastInspectedAt: nowIso,
        technicalReport: liveReport,
      };
      changed = true;
    }
  }

  if (changed) {
    writeArchive(records);
  }
  return records;
}

function nextAccessionId(records: ArtifactRecord[]): string {
  let maxNum = 0;
  for (const r of records) {
    const m = r.accessionId.match(/ACC-\d{4}-(\d+)/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > maxNum) maxNum = n;
    }
  }
  const year = new Date().getFullYear();
  return `ACC-${year}-${String(maxNum + 1).padStart(3, '0')}`;
}

async function startServer() {
  seedPrimaryArtifacts();

  const app = express();
  app.use(express.json({ limit: '12mb' }));

  // Sprite & Frame Creation Zone at /studio (served independently from React SPA)
  app.get(['/studio', '/studio/'], (_req, res) => {
    if (!fs.existsSync(LIVE_STUDIO_ABS)) {
      res.status(404).send('Live Emerald Ranger studio file not found');
      return;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.sendFile(LIVE_STUDIO_ABS);
  });

  // Cross-Zone Asset Bus: Studio (/studio) <-> Lobby (/) <-> Engine (/engine)
  app.get('/api/project-bus/studio-bundle', (_req, res) => {
    ensureStorageDirs();
    if (!fs.existsSync(BUS_BUNDLE_FILE)) {
      res.json({ bundle: null, updatedAt: null });
      return;
    }
    try {
      const raw = fs.readFileSync(BUS_BUNDLE_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      res.json({
        bundle: parsed?.bundle ?? null,
        updatedAt: parsed?.updatedAt ?? null,
      });
    } catch {
      res.json({ bundle: null, updatedAt: null });
    }
  });

  app.post('/api/project-bus/studio-bundle', (req, res) => {
    const bundle = req.body?.bundle ?? req.body;
    if (!bundle || typeof bundle !== 'object') {
      res.status(400).json({ error: '缺少有效的 Studio Runtime Bundle 資料' });
      return;
    }
    ensureStorageDirs();
    const updatedAt = new Date().toISOString();
    fs.writeFileSync(BUS_BUNDLE_FILE, JSON.stringify({ bundle, updatedAt }, null, 2), 'utf8');
    res.json({ ok: true, updatedAt });
  });

  // Bidirectional Workspace Bus (Web Workbench <-> External AI CLI / MCP Agents)
  app.get('/api/project-bus/workspace', (_req, res) => {
    res.json(readWorkspaceBus());
  });

  app.post('/api/project-bus/workspace', (req, res) => {
    const { files, entryFile, presetId, source } = req.body ?? {};
    if (!Array.isArray(files) || files.length === 0) {
      res.status(400).json({ error: '缺少有效的虛擬專案 files 陣列' });
      return;
    }
    const saved = writeWorkspaceBus({
      presetId: typeof presetId === 'string' ? presetId : 'web-workspace',
      entryFile: typeof entryFile === 'string' ? entryFile : files[0].path,
      files: files as VirtualProjectFile[],
      source: source === 'mcp' || source === 'cli' ? source : 'web',
    });
    res.json({ ok: true, workspace: saved });
  });

  // Real-time Server-Sent Events stream for MCP / CLI -> Browser auto hot-reload
  app.get('/api/project-bus/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    res.write(`event: connected\ndata: ${JSON.stringify({ ok: true, time: new Date().toISOString() })}\n\n`);

    const unsubscribe = subscribeWorkspaceUpdates((snapshot) => {
      res.write(`event: workspace_update\ndata: ${JSON.stringify(snapshot)}\n\n`);
    });

    const heartbeat = setInterval(() => {
      res.write(': keepalive\n\n');
    }, 25000);

    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  // Isomorphic Headless Playtest & Collision Diagnostics API
  app.post('/api/runtime/simulate', async (req, res) => {
    try {
      const { files, entryFile, ticks, scenario } = req.body ?? {};
      const ws = readWorkspaceBus();
      const targetFiles = Array.isArray(files) && files.length > 0 ? (files as VirtualProjectFile[]) : ws.files;
      const targetEntry = typeof entryFile === 'string' && entryFile.trim() ? entryFile : ws.entryFile;
      const report = await runHeadlessPlaytest(targetFiles, targetEntry, {
        ticks: typeof ticks === 'number' ? ticks : 240,
        scenario: (typeof scenario === 'string' ? scenario : 'combat-sweep') as PlaytestScenarioId,
      });
      res.json(report);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ success: false, error: msg });
    }
  });

  // Model Context Protocol (MCP) JSON-RPC 2.0 HTTP Gateway
  app.get('/mcp', (_req, res) => {
    res.json({
      name: 'chronoforge-closed-loop-runtime',
      protocol: 'MCP JSON-RPC 2.0 over HTTP POST',
      endpoint: '/mcp',
      tools: MCP_TOOL_DEFINITIONS,
      resources: THREEJS_MCP_RESOURCES,
    });
  });

  app.post('/mcp', async (req, res) => {
    const response = await handleMcpJsonRpc(req.body ?? {});
    res.json(response);
  });

  // Direct REST inspection endpoints for Three.js r187 official LLM/Agent docs
  app.get('/api/threejs-docs/guide', async (_req, res) => {
    const guide = await getThreeJsAgentGuide();
    res.json(guide);
  });

  app.get('/api/threejs-docs/search', async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 5;
    const result = await searchThreeJsDocs(q, Number.isFinite(limit) ? limit : 5);
    res.json(result);
  });

  app.post('/api/threejs-docs/sync', async (_req, res) => {
    const meta = await syncThreeJsDocs(true);
    res.json({ ok: true, meta });
  });

  // Serve uploaded archived HTML files safely for sandboxed iframe previews
  app.get('/artifacts/raw/:filename', (req, res) => {
    const safeName = path.basename(req.params.filename);
    const targetPath = path.join(UPLOADS_DIR, safeName);
    if (!fs.existsSync(targetPath)) {
      res.status(404).send('Artifact file not found');
      return;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.sendFile(targetPath);
  });

  // GET all archived artifacts
  app.get('/api/artifacts', (_req, res) => {
    const records = readArchive();
    res.json({ artifacts: records });
  });

  // GET version diff between two archived artifacts (must be registered before :id)
  app.get('/api/artifacts/diff', (req, res) => {
    const baseId = typeof req.query.base === 'string' ? req.query.base : '';
    const targetId = typeof req.query.target === 'string' ? req.query.target : '';
    if (!baseId || !targetId) {
      res.status(400).json({ error: '請同時指定基準版本 (base) 與目標版本 (target)' });
      return;
    }

    const records = readArchive();
    const baseRecord = records.find((r) => r.id === baseId || r.accessionId === baseId);
    const targetRecord = records.find((r) => r.id === targetId || r.accessionId === targetId);
    if (!baseRecord || !targetRecord) {
      res.status(404).json({ error: '找不到指定的比對版本紀錄' });
      return;
    }

    const baseAbs = resolveArtifactHtmlPath(baseRecord);
    const targetAbs = resolveArtifactHtmlPath(targetRecord);
    const baseRaw = fs.existsSync(baseAbs) ? fs.readFileSync(baseAbs, 'utf8') : '';
    const targetRaw = fs.existsSync(targetAbs) ? fs.readFileSync(targetAbs, 'utf8') : '';

    const diffResult = compareArtifactVersions(baseRecord, baseRaw, targetRecord, targetRaw);
    res.json({ diff: diffResult });
  });

  // POST snapshot the current live frontend studio file into the historical archive
  app.post('/api/artifacts/snapshot-live', (req, res) => {
    if (!fs.existsSync(LIVE_STUDIO_ABS)) {
      res.status(404).json({ error: '找不到現行前台檔案' });
      return;
    }
    const { versionTag, title, note } = req.body ?? {};
    const rawHtml = fs.readFileSync(LIVE_STUDIO_ABS, 'utf8');
    const records = readArchive();
    const accessionId = nextAccessionId(records);
    const id = `${accessionId.toLowerCase()}-${crypto.randomBytes(3).toString('hex')}`;
    const storedFileName = `${id}.html`;
    const storedAbsPath = path.join(UPLOADS_DIR, storedFileName);

    ensureStorageDirs();
    fs.writeFileSync(storedAbsPath, rawHtml, 'utf8');

    const report = inspectHtmlArtifact(rawHtml, LIVE_STUDIO_REL);
    const nowIso = new Date().toISOString();
    const cleanTag =
      typeof versionTag === 'string' && versionTag.trim()
        ? versionTag.trim()
        : `snapshot-${nowIso.slice(0, 10)}`;
    const finalTitle =
      typeof title === 'string' && title.trim()
        ? title.trim()
        : `翠風遊俠 // 精靈圖工作室 (${cleanTag})`;

    const latestParent = records[0]?.accessionId;
    const notes: CuratorialNote[] = [];
    if (typeof note === 'string' && note.trim()) {
      notes.push({
        id: `note-${crypto.randomBytes(4).toString('hex')}`,
        author: '版本快照管理員',
        content: note.trim(),
        createdAt: nowIso,
      });
    }

    const snapshotRecord: ArtifactRecord = {
      id,
      accessionId,
      versionTag: cleanTag,
      parentAccessionId: latestParent,
      title: finalTitle,
      originFileName: LIVE_STUDIO_REL,
      sourcePath: `data/uploads/${storedFileName}`,
      previewUrl: `/artifacts/raw/${storedFileName}`,
      archivedAt: nowIso,
      lastInspectedAt: nowIso,
      locked: false,
      technicalReport: report,
      curatorialNotes: notes,
    };

    const updated = [snapshotRecord, ...records];
    writeArchive(updated);
    res.status(201).json({ artifact: snapshotRecord });
  });

  // GET single artifact with raw HTML source
  app.get('/api/artifacts/:id', (req, res) => {
    const records = readArchive();
    const found = records.find((r) => r.id === req.params.id);
    if (!found) {
      res.status(404).json({ error: '找不到指定的文物典藏紀錄' });
      return;
    }
    const fileAbs = resolveArtifactHtmlPath(found);
    const rawHtml = fs.existsSync(fileAbs) ? fs.readFileSync(fileAbs, 'utf8') : '';
    res.json({ artifact: { ...found, rawHtml } });
  });

  // POST dry-run inspection without archiving yet
  app.post('/api/artifacts/analyze', (req, res) => {
    const { htmlContent, fileName } = req.body ?? {};
    if (typeof htmlContent !== 'string' || !htmlContent.trim()) {
      res.status(400).json({ error: '請提供有效的 HTML 文物原始碼內容' });
      return;
    }
    const safeName = typeof fileName === 'string' && fileName.trim() ? fileName.trim() : 'untitled_artifact.html';
    const report = inspectHtmlArtifact(htmlContent, safeName);
    res.json({ report });
  });

  // POST inspect and permanently archive a new HTML artifact
  app.post('/api/artifacts', (req, res) => {
    const { htmlContent, fileName, title, note, versionTag, parentAccessionId } = req.body ?? {};
    if (typeof htmlContent !== 'string' || !htmlContent.trim()) {
      res.status(400).json({ error: 'HTML 原始碼內容不可為空' });
      return;
    }

    const records = readArchive();
    const accessionId = nextAccessionId(records);
    const cleanOrigin = (typeof fileName === 'string' && fileName.trim() ? fileName.trim() : `${accessionId}.html`)
      .replace(/[^a-zA-Z0-9._-]/g, '_');
    const id = `${accessionId.toLowerCase()}-${crypto.randomBytes(3).toString('hex')}`;
    const storedFileName = `${id}.html`;
    const storedAbsPath = path.join(UPLOADS_DIR, storedFileName);

    ensureStorageDirs();
    fs.writeFileSync(storedAbsPath, htmlContent, 'utf8');

    const report = inspectHtmlArtifact(htmlContent, cleanOrigin);
    const nowIso = new Date().toISOString();
    const finalTitle =
      typeof title === 'string' && title.trim()
        ? title.trim()
        : report.detectedTitle || cleanOrigin;

    const notes: CuratorialNote[] = [];
    if (typeof note === 'string' && note.trim()) {
      notes.push({
        id: `note-${crypto.randomBytes(4).toString('hex')}`,
        author: '典藏登錄員',
        content: note.trim(),
        createdAt: nowIso,
      });
    }

    const newRecord: ArtifactRecord = {
      id,
      accessionId,
      versionTag: typeof versionTag === 'string' && versionTag.trim() ? versionTag.trim() : 'custom-import',
      parentAccessionId: typeof parentAccessionId === 'string' && parentAccessionId.trim() ? parentAccessionId.trim() : undefined,
      title: finalTitle,
      originFileName: cleanOrigin,
      sourcePath: `data/uploads/${storedFileName}`,
      previewUrl: `/artifacts/raw/${storedFileName}`,
      archivedAt: nowIso,
      lastInspectedAt: nowIso,
      locked: false,
      technicalReport: report,
      curatorialNotes: notes,
    };

    const updated = [newRecord, ...records];
    writeArchive(updated);
    res.status(201).json({ artifact: newRecord });
  });

  // POST re-run technical inspection on an existing archived artifact
  app.post('/api/artifacts/:id/reinspect', (req, res) => {
    const records = readArchive();
    const idx = records.findIndex((r) => r.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: '找不到指定的文物典藏紀錄' });
      return;
    }

    const target = records[idx];
    const fileAbs = resolveArtifactHtmlPath(target);
    if (!fs.existsSync(fileAbs)) {
      res.status(404).json({ error: '伺服器磁碟中找不到該文物的原始檔案' });
      return;
    }

    const rawHtml = fs.readFileSync(fileAbs, 'utf8');
    const freshReport = inspectHtmlArtifact(rawHtml, target.originFileName);
    const nowIso = new Date().toISOString();

    records[idx] = {
      ...target,
      lastInspectedAt: nowIso,
      technicalReport: freshReport,
    };
    writeArchive(records);
    res.json({ artifact: { ...records[idx], rawHtml } });
  });

  // PATCH add a curatorial note
  app.patch('/api/artifacts/:id/notes', (req, res) => {
    const { author, content } = req.body ?? {};
    if (typeof content !== 'string' || !content.trim()) {
      res.status(400).json({ error: '附註內容不可為空' });
      return;
    }

    const records = readArchive();
    const idx = records.findIndex((r) => r.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: '找不到指定的文物典藏紀錄' });
      return;
    }

    const noteItem: CuratorialNote = {
      id: `note-${crypto.randomBytes(4).toString('hex')}`,
      author: typeof author === 'string' && author.trim() ? author.trim() : '研究員',
      content: content.trim(),
      createdAt: new Date().toISOString(),
    };

    records[idx] = {
      ...records[idx],
      curatorialNotes: [noteItem, ...records[idx].curatorialNotes],
    };
    writeArchive(records);
    res.json({ artifact: records[idx], note: noteItem });
  });

  // DELETE a curatorial note
  app.delete('/api/artifacts/:id/notes/:noteId', (req, res) => {
    const records = readArchive();
    const idx = records.findIndex((r) => r.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: '找不到指定的文物典藏紀錄' });
      return;
    }

    records[idx] = {
      ...records[idx],
      curatorialNotes: records[idx].curatorialNotes.filter((n) => n.id !== req.params.noteId),
    };
    writeArchive(records);
    res.json({ artifact: records[idx] });
  });

  // DELETE an archived artifact (unless locked)
  app.delete('/api/artifacts/:id', (req, res) => {
    const records = readArchive();
    const target = records.find((r) => r.id === req.params.id);
    if (!target) {
      res.status(404).json({ error: '找不到指定的文物典藏紀錄' });
      return;
    }
    if (target.locked) {
      res.status(403).json({ error: '此筆為核心歷史典藏文物，已鎖定保護無法刪除' });
      return;
    }

    if (target.sourcePath.startsWith('data/uploads/')) {
      const fileAbs = resolveArtifactHtmlPath(target);
      if (fs.existsSync(fileAbs)) {
        fs.unlinkSync(fileAbs);
      }
    }

    const remaining = records.filter((r) => r.id !== req.params.id);
    writeArchive(remaining);
    res.json({ ok: true, remaining });
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(WORKSPACE_ROOT, 'dist');
    app.use(express.static(distDir, { index: false }));
    app.use(express.static(path.join(WORKSPACE_ROOT, 'public'), { index: false }));
    app.get(['/', '/archive', '/archive/*', '/engine', '/engine/*', '/play', '/play/*'], (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const PORT = 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT} (Lobby at /, Studio at /studio, Engine at /engine, Play at /play, Archive at /archive)`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

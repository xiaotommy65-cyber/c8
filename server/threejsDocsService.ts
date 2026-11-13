import fs from 'node:fs';
import path from 'node:path';

const CACHE_DIR = path.join(process.cwd(), 'data', 'threejs-docs-cache');
const LLMS_TXT_FILE = path.join(CACHE_DIR, 'llms.txt');
const LLMS_FULL_FILE = path.join(CACHE_DIR, 'llms-full.txt');
const META_FILE = path.join(CACHE_DIR, 'meta.json');

const OFFICIAL_LLMS_URL = 'https://threejs.org/docs/llms.txt';
const OFFICIAL_LLMS_FULL_URL = 'https://threejs.org/docs/llms-full.txt';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface ThreeJsDocsMeta {
  version: string;
  llmsUrl: string;
  llmsFullUrl: string;
  syncedAt: string;
  source: 'official-live' | 'official-cached' | 'offline-fallback';
  llmsBytes: number;
  llmsFullBytes: number;
}

const OFFLINE_FALLBACK_LLMS_TXT = `# Three.js (r187)
> Three.js is a cross-browser JavaScript library for creating 3D graphics using WebGL and WebGPU.

## Instructions for Large Language Models

### 1. Use Import Maps or Modern ESM (r187+)
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

### 2. Choosing Between WebGLRenderer and WebGPURenderer
- Use WebGLRenderer for maximum legacy compatibility.
- Use WebGPURenderer (from 'three/webgpu') when you need TSL shaders, compute shaders, or modern node materials:
  import * as THREE from 'three/webgpu';
  const renderer = new THREE.WebGPURenderer({ antialias: true });
  await renderer.init();

### 3. TSL (Three.js Shading Language)
import { Fn, uniform, texture, uv, color, float, vec2, vec3, mix, sin, time, positionLocal, normalWorld } from 'three/tsl';
const material = new THREE.MeshStandardNodeMaterial();
material.colorNode = texture(myTexture).mul(color(0xff0000));
`;

export const CHRONOFORGE_TSL_ART_QUICKSTART = `# ChronoForge × Three.js r187 美術與 TSL 快速接軌指南

## 1. WebGPU + WebGL2 自動降級初始化 (three/webgpu)
\`\`\`ts
import * as THREE from 'three/webgpu';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const renderer = new THREE.WebGPURenderer({ antialias: true });
await renderer.init(); // r187 WebGPURenderer 必須先完成非同步初始化
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap; // r187 已移除 PCFSoftShadowMap

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
pmrem.dispose();
\`\`\`

## 2. 將 2D ChronoForgeEngine 像素畫布投射至 3D 螢幕 (TSL)
\`\`\`ts
import * as THREE from 'three/webgpu';
import { color, float, mix, sin, texture, uniform, uv } from 'three/tsl';

const screenTex = new THREE.CanvasTexture(engineCanvas);
screenTex.colorSpace = THREE.SRGBColorSpace;
screenTex.minFilter = THREE.NearestFilter;
screenTex.magFilter = THREE.NearestFilter;
screenTex.generateMipmaps = false;

const uBootFlash = uniform(0);
const screenMat = new THREE.MeshBasicNodeMaterial();
const sampled = texture(screenTex, uv());
const scanline = sin(uv().y.mul(float(270 * Math.PI * 2))).mul(0.025).add(0.975);
screenMat.colorNode = mix(sampled.rgb.mul(scanline), color(0xd1fae5), uBootFlash.mul(0.8));
\`\`\`

## 3. 3D 美術複合模型與材質對比原則
- 使用 RoundedBoxGeometry / ExtrudeGeometry 組裝多件式 THREE.Group 物件。
- 相鄰材質保持 roughness 差異 >= 0.25（如霧面塑膠 0.55 vs 亮面糖果按鈕 0.16 + clearcoat 0.9 vs 鍍金接腳 metalness 0.95）。
- 動態更新 CanvasTexture 時每幀設定 \`screenTex.needsUpdate = true\`，並於卸載時完整 \`dispose()\`。
`;

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function readCachedMeta(): ThreeJsDocsMeta | null {
  if (!fs.existsSync(META_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(META_FILE, 'utf8')) as ThreeJsDocsMeta;
  } catch {
    return null;
  }
}

async function fetchWithTimeout(url: string, timeoutMs = 8000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} fetching ${url}`);
    }
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

export async function syncThreeJsDocs(forceRefresh = false): Promise<ThreeJsDocsMeta> {
  ensureCacheDir();
  const existingMeta = readCachedMeta();

  if (
    !forceRefresh &&
    existingMeta &&
    fs.existsSync(LLMS_TXT_FILE) &&
    fs.existsSync(LLMS_FULL_FILE)
  ) {
    const ageMs = Date.now() - Date.parse(existingMeta.syncedAt);
    if (Number.isFinite(ageMs) && ageMs < CACHE_TTL_MS) {
      return {
        ...existingMeta,
        source: existingMeta.source === 'offline-fallback' ? 'offline-fallback' : 'official-cached',
      };
    }
  }

  try {
    const [llmsTxt, llmsFullTxt] = await Promise.all([
      fetchWithTimeout(OFFICIAL_LLMS_URL),
      fetchWithTimeout(OFFICIAL_LLMS_FULL_URL, 12000),
    ]);

    const versionMatch = llmsTxt.match(/three@([0-9]+\.[0-9]+\.[0-9]+)/i);
    const meta: ThreeJsDocsMeta = {
      version: versionMatch?.[1] ?? '0.187.0',
      llmsUrl: OFFICIAL_LLMS_URL,
      llmsFullUrl: OFFICIAL_LLMS_FULL_URL,
      syncedAt: new Date().toISOString(),
      source: 'official-live',
      llmsBytes: Buffer.byteLength(llmsTxt, 'utf8'),
      llmsFullBytes: Buffer.byteLength(llmsFullTxt, 'utf8'),
    };

    fs.writeFileSync(LLMS_TXT_FILE, llmsTxt, 'utf8');
    fs.writeFileSync(LLMS_FULL_FILE, llmsFullTxt, 'utf8');
    fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2), 'utf8');
    return meta;
  } catch {
    if (existingMeta && fs.existsSync(LLMS_TXT_FILE) && fs.existsSync(LLMS_FULL_FILE)) {
      return { ...existingMeta, source: 'official-cached' };
    }

    const fallbackFull = `${OFFLINE_FALLBACK_LLMS_TXT}\n\n${CHRONOFORGE_TSL_ART_QUICKSTART}`;
    const fallbackMeta: ThreeJsDocsMeta = {
      version: '0.187.0',
      llmsUrl: OFFICIAL_LLMS_URL,
      llmsFullUrl: OFFICIAL_LLMS_FULL_URL,
      syncedAt: new Date().toISOString(),
      source: 'offline-fallback',
      llmsBytes: Buffer.byteLength(OFFLINE_FALLBACK_LLMS_TXT, 'utf8'),
      llmsFullBytes: Buffer.byteLength(fallbackFull, 'utf8'),
    };
    fs.writeFileSync(LLMS_TXT_FILE, OFFLINE_FALLBACK_LLMS_TXT, 'utf8');
    fs.writeFileSync(LLMS_FULL_FILE, fallbackFull, 'utf8');
    fs.writeFileSync(META_FILE, JSON.stringify(fallbackMeta, null, 2), 'utf8');
    return fallbackMeta;
  }
}

export async function getThreeJsAgentGuide(): Promise<{
  meta: ThreeJsDocsMeta;
  llmsTxt: string;
  tslArtQuickstart: string;
}> {
  const meta = await syncThreeJsDocs(false);
  const llmsTxt = fs.existsSync(LLMS_TXT_FILE)
    ? fs.readFileSync(LLMS_TXT_FILE, 'utf8')
    : OFFLINE_FALLBACK_LLMS_TXT;
  return {
    meta,
    llmsTxt,
    tslArtQuickstart: CHRONOFORGE_TSL_ART_QUICKSTART,
  };
}

interface DocSection {
  heading: string;
  body: string;
}

function splitMarkdownSections(markdown: string): DocSection[] {
  const lines = markdown.split(/\r?\n/);
  const sections: DocSection[] = [];
  let currentHeading = 'Three.js Reference';
  let buffer: string[] = [];

  for (const line of lines) {
    if (/^#{1,3}\s+/.test(line)) {
      if (buffer.length > 0) {
        sections.push({ heading: currentHeading, body: buffer.join('\n').trim() });
      }
      currentHeading = line.replace(/^#{1,3}\s+/, '').trim();
      buffer = [line];
    } else {
      buffer.push(line);
      if (buffer.length >= 160) {
        sections.push({ heading: currentHeading, body: buffer.join('\n').trim() });
        buffer = [`(續 ${currentHeading})`];
      }
    }
  }
  if (buffer.length > 0) {
    sections.push({ heading: currentHeading, body: buffer.join('\n').trim() });
  }
  return sections;
}

export async function searchThreeJsDocs(
  query: string,
  limit = 5,
): Promise<{
  meta: ThreeJsDocsMeta;
  query: string;
  totalMatches: number;
  matches: Array<{ heading: string; score: number; excerpt: string }>;
}> {
  const meta = await syncThreeJsDocs(false);
  const fullText = fs.existsSync(LLMS_FULL_FILE)
    ? fs.readFileSync(LLMS_FULL_FILE, 'utf8')
    : OFFLINE_FALLBACK_LLMS_TXT;

  const combined = `${fullText}\n\n${CHRONOFORGE_TSL_ART_QUICKSTART}`;
  const sections = splitMarkdownSections(combined);
  const terms = query
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0);

  if (terms.length === 0) {
    return {
      meta,
      query,
      totalMatches: sections.length,
      matches: sections.slice(0, Math.max(1, Math.min(8, limit))).map((s) => ({
        heading: s.heading,
        score: 1,
        excerpt: s.body.slice(0, 1400),
      })),
    };
  }

  const scored: Array<{ heading: string; score: number; excerpt: string }> = [];
  for (const sec of sections) {
    const hLower = sec.heading.toLowerCase();
    const bLower = sec.body.toLowerCase();
    let score = 0;

    for (const term of terms) {
      if (hLower === term) score += 25;
      else if (hLower.includes(term)) score += 12;

      let idx = 0;
      let count = 0;
      while ((idx = bLower.indexOf(term, idx)) !== -1 && count < 10) {
        count++;
        idx += term.length;
      }
      score += count * 2;
    }

    if (score > 0) {
      scored.push({
        heading: sec.heading,
        score,
        excerpt: sec.body.slice(0, 1600),
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const safeLimit = Math.max(1, Math.min(10, limit));
  return {
    meta,
    query,
    totalMatches: scored.length,
    matches: scored.slice(0, safeLimit),
  };
}

export const THREEJS_MCP_RESOURCES = [
  {
    uri: 'threejs://docs/llms.txt',
    name: 'Three.js Official Agent Guide (llms.txt)',
    description: 'Official Three.js r187 LLM instructions, WebGPURenderer, and TSL entry points.',
    mimeType: 'text/markdown',
  },
  {
    uri: 'threejs://docs/tsl-quickstart',
    name: 'ChronoForge × Three.js r187 & TSL Art Quickstart',
    description: 'Curated WebGPURenderer + TSL CanvasTexture & RoomEnvironment patterns used in ChronoForge.',
    mimeType: 'text/markdown',
  },
  {
    uri: 'threejs://docs/llms-full.txt',
    name: 'Three.js Full Markdown Reference (llms-full.txt)',
    description: 'Complete cached Three.js r187 documentation index (use search_threejs_docs for targeted excerpts).',
    mimeType: 'text/plain',
  },
];

export async function readThreeJsMcpResource(uri: string): Promise<{
  uri: string;
  mimeType: string;
  text: string;
} | null> {
  if (uri === 'threejs://docs/tsl-quickstart') {
    return {
      uri,
      mimeType: 'text/markdown',
      text: CHRONOFORGE_TSL_ART_QUICKSTART,
    };
  }
  if (uri === 'threejs://docs/llms.txt') {
    const guide = await getThreeJsAgentGuide();
    return {
      uri,
      mimeType: 'text/markdown',
      text: guide.llmsTxt,
    };
  }
  if (uri === 'threejs://docs/llms-full.txt') {
    await syncThreeJsDocs(false);
    const full = fs.existsSync(LLMS_FULL_FILE)
      ? fs.readFileSync(LLMS_FULL_FILE, 'utf8')
      : OFFLINE_FALLBACK_LLMS_TXT;
    return {
      uri,
      mimeType: 'text/plain',
      text: full,
    };
  }
  return null;
}

import type { VirtualProjectFile } from './types';

export interface SourcePatchResult {
  patched: boolean;
  filePath?: string;
  lineNumber?: number;
  beforeLine?: string;
  afterLine?: string;
  updatedFiles: VirtualProjectFile[];
  reason?: string;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getLineNumberAt(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) {
    if (text.charCodeAt(i) === 10) line++;
  }
  return line;
}

function getLineText(text: string, lineNumber: number): string {
  const lines = text.split('\n');
  return (lines[lineNumber - 1] ?? '').trim();
}

function formatNum(val: number, decimals = 2): string {
  return Number.isInteger(val) ? String(val) : Number(val.toFixed(decimals)).toString();
}

function replaceNthCallArg(callArgs: string, argIdx: number, nextLiteral: string): string | null {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;

  for (let i = 0; i < callArgs.length; i++) {
    const ch = callArgs[i];
    if (quote) {
      if (ch === quote && callArgs[i - 1] !== '\\') quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
    } else if (ch === '(' || ch === '{' || ch === '[') {
      depth++;
    } else if (ch === ')' || ch === '}' || ch === ']') {
      depth--;
    } else if (ch === ',' && depth === 0) {
      parts.push(callArgs.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(callArgs.slice(start));

  if (argIdx >= parts.length) return null;
  const leading = parts[argIdx].match(/^\s*/)?.[0] ?? '';
  const trailing = parts[argIdx].match(/\s*$/)?.[0] ?? '';
  parts[argIdx] = `${leading}${nextLiteral}${trailing}`;
  return parts.join(',');
}

function patchObjectPropInBlock(block: string, key: string, nextLiteral: string): string | null {
  const propRe = new RegExp(`(\\b${escapeRegExp(key)}\\s*:\\s*)([^,}\\n]+)`);
  if (!propRe.test(block)) return null;
  return block.replace(propRe, `$1${nextLiteral}`);
}

function buildResult(
  files: VirtualProjectFile[],
  fileIdx: number,
  nextCode: string,
  matchOffset: number,
): SourcePatchResult {
  const oldCode = files[fileIdx].code;
  const lineNumber = getLineNumberAt(oldCode, Math.max(0, matchOffset));
  const updatedFiles = files.map((f, idx) => (idx === fileIdx ? { ...f, code: nextCode } : f));
  return {
    patched: true,
    filePath: files[fileIdx].path,
    lineNumber,
    beforeLine: getLineText(oldCode, lineNumber),
    afterLine: getLineText(nextCode, lineNumber),
    updatedFiles,
  };
}

export function patchProjectSourceFromInspector(
  files: VirtualProjectFile[],
  nodeId: string,
  prop: string,
  value: string | number | boolean,
): SourcePatchResult {
  // 1. WorldEnvironment patching: .sky / .ambient / setSky / setAmbientLight
  if (nodeId === 'env:world') {
    for (let i = 0; i < files.length; i++) {
      const code = files[i].code;

      if (prop === 'ambientDarkness' && typeof value === 'number') {
        const formatted = Number(value).toFixed(2);
        const re = /(\.ambient\(|scene\.setAmbientLight\()\s*([^)]+)\)/;
        const m = re.exec(code);
        if (m) {
          const next = code.replace(re, `$1${formatted})`);
          return buildResult(files, i, next, m.index);
        }
      }

      if ((prop === 'skyTopColor' || prop === 'skyBottomColor') && typeof value === 'string') {
        const re = /(\.sky\(|scene\.setSky\()([^)]+)\)/;
        const m = re.exec(code);
        if (m) {
          const argIdx = prop === 'skyTopColor' ? 0 : 1;
          const patchedArgs = replaceNthCallArg(m[2], argIdx, `'${value}'`);
          if (patchedArgs !== null) {
            const next = code.slice(0, m.index) + `${m[1]}${patchedArgs})` + code.slice(m.index + m[0].length);
            return buildResult(files, i, next, m.index);
          }
        }
      }

      if (prop === 'autoCombatAudio' && typeof value === 'boolean') {
        const re = /(audio\.setAutoCombatAudio\()\s*(true|false)\s*\)/;
        const m = re.exec(code);
        if (m) {
          const next = code.replace(re, `$1${value})`);
          return buildResult(files, i, next, m.index);
        }
      }
    }
    return { patched: false, updatedFiles: files, reason: `未在現有模組中找到 env:world.${prop} 語句` };
  }

  // 2. Entity patching: hero('id').at(x, y) / enemy('id').patrol(r) / engine.entities.spawn({ id: 'id', ... })
  if (nodeId.startsWith('entity:')) {
    const id = nodeId.slice('entity:'.length);
    const idEsc = escapeRegExp(id);

    for (let i = 0; i < files.length; i++) {
      const code = files[i].code;

      // 2A. Fluent builder chain: hero('id')...;
      const chainRe = new RegExp(
        `(?:hero|enemy|dummy|actor)\\(\\s*['"]${idEsc}['"](?:\\s*,\\s*['"][^'"]+['"])?\\s*\\)[\\s\\S]*?;`,
      );
      const cm = chainRe.exec(code);
      if (cm) {
        const stmt = cm[0];
        let nextStmt: string | null = null;
        let innerOffset = 0;

        if ((prop === 'x' || prop === 'y') && typeof value === 'number') {
          const atRe = /\.at\(([^)]+)\)/;
          const am = atRe.exec(stmt);
          if (am) {
            const updatedArgs = replaceNthCallArg(am[1], prop === 'x' ? 0 : 1, String(Math.round(value)));
            if (updatedArgs !== null) {
              nextStmt = stmt.slice(0, am.index) + `.at(${updatedArgs})` + stmt.slice(am.index + am[0].length);
              innerOffset = am.index;
            }
          }
        } else {
          const methodMap: Record<string, string> = {
            hp: 'hp',
            moveSpeed: 'speed',
            patrolRange: 'patrol',
            facing: 'facing',
          };
          const methodName = methodMap[prop];
          if (methodName && typeof value === 'number') {
            const mRe = new RegExp(`\\.${methodName}\\(([^)]+)\\)`);
            const mm = mRe.exec(stmt);
            const lit = prop === 'moveSpeed' ? formatNum(value, 2) : String(Math.round(value));
            if (mm) {
              nextStmt = stmt.slice(0, mm.index) + `.${methodName}(${lit})` + stmt.slice(mm.index + mm[0].length);
              innerOffset = mm.index;
            } else {
              // Cleanly chain the property right before the trailing semicolon
              const indent = stmt.includes('\n') ? '\n    ' : '';
              nextStmt = stmt.slice(0, -1) + `${indent}.${methodName}(${lit});`;
              innerOffset = stmt.length - 1;
            }
          }
        }

        if (nextStmt) {
          const nextCode = code.slice(0, cm.index) + nextStmt + code.slice(cm.index + stmt.length);
          return buildResult(files, i, nextCode, cm.index + innerOffset);
        }
      }

      // 2B. Classic imperative spawn({ id: '...', x: ..., y: ... })
      const spawnRe = new RegExp(
        `entities\\.spawn\\(\\s*\\{[^}]*id\\s*:\\s*['"]${idEsc}['"][^}]*\\}\\s*\\)`,
      );
      const sm = spawnRe.exec(code);
      if (sm) {
        const block = sm[0];
        const keyMap: Record<string, string> = {
          x: 'x',
          y: 'y',
          hp: 'hp',
          maxHp: 'hp',
          moveSpeed: 'speed',
          patrolRange: 'patrolRange',
          facing: 'facing',
        };
        const targetKey = keyMap[prop];
        if (targetKey && typeof value === 'number') {
          const lit = prop === 'moveSpeed' ? formatNum(value, 2) : String(Math.round(value));
          const updatedBlock = patchObjectPropInBlock(block, targetKey, lit);
          if (updatedBlock) {
            const nextCode = code.slice(0, sm.index) + updatedBlock + code.slice(sm.index + block.length);
            return buildResult(files, i, nextCode, sm.index);
          }
        }
      }
    }
    return { patched: false, updatedFiles: files, reason: `未找到實體 '${id}' 的宣告語句以就地回寫` };
  }

  // 3. PointLight2D patching: light('id')... / .aura(color, radius, opts) / addPointLight({ id: 'id' })
  if (nodeId.startsWith('light:')) {
    const id = nodeId.slice('light:'.length);
    const idEsc = escapeRegExp(id);

    for (let i = 0; i < files.length; i++) {
      const code = files[i].code;

      // 3A. Standalone fluent light('id')...;
      const lightRe = new RegExp(`light\\(\\s*['"]${idEsc}['"]\\s*\\)[\\s\\S]*?;`);
      const lm = lightRe.exec(code);
      if (lm) {
        const stmt = lm[0];
        let nextStmt: string | null = null;
        let innerOffset = 0;

        if ((prop === 'x' || prop === 'y') && typeof value === 'number') {
          const atRe = /\.at\(([^)]+)\)/;
          const am = atRe.exec(stmt);
          if (am) {
            const args = replaceNthCallArg(am[1], prop === 'x' ? 0 : 1, String(Math.round(value)));
            if (args !== null) {
              nextStmt = stmt.slice(0, am.index) + `.at(${args})` + stmt.slice(am.index + am[0].length);
              innerOffset = am.index;
            }
          }
        } else if (prop === 'color' && typeof value === 'string') {
          const cRe = /\.color\(([^)]+)\)/;
          const cm = cRe.exec(stmt);
          if (cm) {
            nextStmt = stmt.slice(0, cm.index) + `.color('${value}')` + stmt.slice(cm.index + cm[0].length);
            innerOffset = cm.index;
          }
        } else if (['radius', 'intensity', 'flicker'].includes(prop) && typeof value === 'number') {
          const mRe = new RegExp(`\\.${prop}\\(([^)]+)\\)`);
          const mm = mRe.exec(stmt);
          const lit = prop === 'radius' ? String(Math.round(value)) : formatNum(value, 2);
          if (mm) {
            nextStmt = stmt.slice(0, mm.index) + `.${prop}(${lit})` + stmt.slice(mm.index + mm[0].length);
            innerOffset = mm.index;
          }
        }

        if (nextStmt) {
          const nextCode = code.slice(0, lm.index) + nextStmt + code.slice(lm.index + stmt.length);
          return buildResult(files, i, nextCode, lm.index + innerOffset);
        }
      }

      // 3B. Actor attached .aura(color, radius, opts) where light id is `<entityId>_aura`
      if (id.endsWith('_aura')) {
        const ownerId = escapeRegExp(id.slice(0, -'_aura'.length));
        const chainRe = new RegExp(
          `(?:hero|enemy|dummy|actor)\\(\\s*['"]${ownerId}['"](?:\\s*,\\s*['"][^'"]+['"])?\\s*\\)[\\s\\S]*?;`,
        );
        const cm = chainRe.exec(code);
        if (cm) {
          const stmt = cm[0];
          const auraRe = /\.aura\(([^)]+)\)/;
          const am = auraRe.exec(stmt);
          if (am) {
            let nextArgs: string | null = null;
            if (prop === 'color' && typeof value === 'string') {
              nextArgs = replaceNthCallArg(am[1], 0, `'${value}'`);
            } else if (prop === 'radius' && typeof value === 'number') {
              nextArgs = replaceNthCallArg(am[1], 1, String(Math.round(value)));
            } else if ((prop === 'intensity' || prop === 'flicker') && typeof value === 'number') {
              nextArgs = patchObjectPropInBlock(am[1], prop, formatNum(value, 2));
            }
            if (nextArgs !== null) {
              const nextStmt = stmt.slice(0, am.index) + `.aura(${nextArgs})` + stmt.slice(am.index + am[0].length);
              const nextCode = code.slice(0, cm.index) + nextStmt + code.slice(cm.index + stmt.length);
              return buildResult(files, i, nextCode, cm.index + am.index);
            }
          }
        }
      }

      // 3C. Classic addPointLight({ id: '...', ... })
      const addLightRe = new RegExp(
        `addPointLight\\(\\s*\\{[^}]*id\\s*:\\s*['"]${idEsc}['"][^}]*\\}\\s*\\)`,
      );
      const alm = addLightRe.exec(code);
      if (alm) {
        const block = alm[0];
        if (['x', 'y', 'radius', 'intensity', 'flicker', 'color'].includes(prop)) {
          const lit =
            prop === 'color'
              ? `'${value}'`
              : prop === 'intensity' || prop === 'flicker'
                ? formatNum(Number(value), 2)
                : String(Math.round(Number(value)));
          const updatedBlock = patchObjectPropInBlock(block, prop, lit);
          if (updatedBlock) {
            const nextCode = code.slice(0, alm.index) + updatedBlock + code.slice(alm.index + block.length);
            return buildResult(files, i, nextCode, alm.index);
          }
        }
      }
    }
    return { patched: false, updatedFiles: files, reason: `未找到光源 '${id}' 的宣告語句以就地回寫` };
  }

  // 4. CompiledAction Hitbox patching: action('slash')... .hitbox({ x, y, w, h }, ...)
  if (nodeId.startsWith('action:')) {
    const actionName = nodeId.slice('action:'.length);
    const keyMap: Record<string, 'x' | 'y' | 'w' | 'h'> = {
      hitX: 'x',
      hitY: 'y',
      hitW: 'w',
      hitH: 'h',
    };
    const key = keyMap[prop];
    if (key && typeof value === 'number') {
      return patchActionHitboxInSource(files, actionName, { [key]: Math.round(value) });
    }
  }

  return { patched: false, updatedFiles: files, reason: `節點類型 '${nodeId}' 目前為唯讀或無對應回寫語句` };
}

export interface TilemapCellEdit {
  row: number;
  col: number;
  glyph: string;
}

export const GLYPH_TO_TILE_KIND: Record<string, 'empty' | 'stone' | 'moss' | 'platform' | 'torch' | 'spike'> = {
  '.': 'empty',
  '#': 'stone',
  '=': 'moss',
  '-': 'platform',
  T: 'torch',
  '^': 'spike',
};

export const TILE_KIND_TO_GLYPH: Record<string, string> = {
  empty: '.',
  stone: '#',
  moss: '=',
  platform: '-',
  torch: 'T',
  spike: '^',
};

export function patchTilemapInSource(
  files: VirtualProjectFile[],
  edits: TilemapCellEdit[],
): SourcePatchResult {
  if (!Array.isArray(edits) || edits.length === 0) {
    return { patched: false, updatedFiles: files, reason: '未提供有效的 Tilemap 格子編輯項目' };
  }

  for (let i = 0; i < files.length; i++) {
    const code = files[i].code;
    const mapDeclRe = /(?:const\s+MAP_LAYOUT[^=]*=\s*|compileTilemap\s*\(\s*|\.tilemap\s*\(\s*)\[([\s\S]*?)\]/;
    const m = mapDeclRe.exec(code);
    if (!m) continue;

    const arrayBody = m[1];
    const rowQuoteRe = /^([ \t]*)(['"])([^\n]*?)\2(,?)$/gm;
    const rowMatches: Array<{
      full: string;
      indent: string;
      quote: string;
      content: string;
      comma: string;
      start: number;
      end: number;
    }> = [];

    let rm: RegExpExecArray | null;
    while ((rm = rowQuoteRe.exec(arrayBody)) !== null) {
      rowMatches.push({
        full: rm[0],
        indent: rm[1],
        quote: rm[2],
        content: rm[3],
        comma: rm[4],
        start: rm.index,
        end: rm.index + rm[0].length,
      });
    }

    if (rowMatches.length === 0) continue;

    let appliedCount = 0;
    let firstEditOffset = -1;
    const rowStrings = rowMatches.map((r) => r.content);

    for (const edit of edits) {
      if (edit.row < 0 || edit.row >= rowStrings.length || edit.col < 0) continue;
      const glyph = (edit.glyph || '.').slice(0, 1);
      let rowStr = rowStrings[edit.row];
      if (edit.col >= rowStr.length) {
        rowStr = rowStr.padEnd(edit.col + 1, '.');
      }
      rowStrings[edit.row] = rowStr.slice(0, edit.col) + glyph + rowStr.slice(edit.col + 1);
      appliedCount++;
      if (firstEditOffset === -1) {
        firstEditOffset = m.index + m[0].indexOf(arrayBody) + rowMatches[edit.row].start;
      }
    }

    if (appliedCount === 0) {
      return { patched: false, updatedFiles: files, reason: '指定的 (row, col) 超出目前地圖陣列邊界' };
    }

    let nextBody = '';
    let cursor = 0;
    for (let idx = 0; idx < rowMatches.length; idx++) {
      const rInfo = rowMatches[idx];
      nextBody += arrayBody.slice(cursor, rInfo.start);
      nextBody += `${rInfo.indent}${rInfo.quote}${rowStrings[idx]}${rInfo.quote}${rInfo.comma}`;
      cursor = rInfo.end;
    }
    nextBody += arrayBody.slice(cursor);

    const bodyRelIdx = m[0].indexOf(arrayBody);
    const absBodyStart = m.index + bodyRelIdx;
    const nextCode = code.slice(0, absBodyStart) + nextBody + code.slice(absBodyStart + arrayBody.length);
    return buildResult(files, i, nextCode, Math.max(0, firstEditOffset));
  }

  return { patched: false, updatedFiles: files, reason: '未在現有模組中找到 MAP_LAYOUT 或 compileTilemap(...) 字串陣列' };
}

export function patchActionHitboxInSource(
  files: VirtualProjectFile[],
  actionName: string,
  hitbox: { x?: number; y?: number; w?: number; h?: number },
  activeFrames?: number[],
): SourcePatchResult {
  const escName = escapeRegExp(actionName);

  for (let i = 0; i < files.length; i++) {
    const code = files[i].code;

    // A. Fluent DSL: action('slash')... .hitbox({ x: ..., y: ..., w: ..., h: ... }, [frames]);
    const fluentRe = new RegExp(`action\\(\\s*['"]${escName}['"]\\s*\\)[\\s\\S]*?;`);
    const fm = fluentRe.exec(code);
    if (fm) {
      const stmt = fm[0];
      const hbRe = /\.hitbox\(\s*(\{[^}]+\})(\s*,\s*\[[^\]]*\])?\s*\)/;
      const hm = hbRe.exec(stmt);
      if (hm) {
        let objBlock = hm[1];
        for (const k of ['x', 'y', 'w', 'h'] as const) {
          const val = hitbox[k];
          if (typeof val === 'number' && !Number.isNaN(val)) {
            const patchedObj = patchObjectPropInBlock(objBlock, k, String(Math.round(val)));
            if (patchedObj) objBlock = patchedObj;
          }
        }
        const framesPart =
          Array.isArray(activeFrames) && activeFrames.length > 0
            ? `, [${activeFrames.map((n) => Math.round(n)).join(', ')}]`
            : hm[2] ?? '';
        const nextStmt =
          stmt.slice(0, hm.index) + `.hitbox(${objBlock}${framesPart})` + stmt.slice(hm.index + hm[0].length);
        const nextCode = code.slice(0, fm.index) + nextStmt + code.slice(fm.index + stmt.length);
        return buildResult(files, i, nextCode, fm.index + hm.index);
      }
    }

    // B. Imperative SDK: actions.compile('slash', { ... defaultHitbox: { ... } ... })
    const impRe = new RegExp(`actions\\.compile\\(\\s*['"]${escName}['"]\\s*,\\s*\\{[\\s\\S]*?\\}\\s*\\)`);
    const im = impRe.exec(code);
    if (im) {
      const stmt = im[0];
      const dhRe = /(defaultHitbox\s*:\s*)(\{[^}]+\})/;
      const dm = dhRe.exec(stmt);
      if (dm) {
        let objBlock = dm[2];
        for (const k of ['x', 'y', 'w', 'h'] as const) {
          const val = hitbox[k];
          if (typeof val === 'number' && !Number.isNaN(val)) {
            const patchedObj = patchObjectPropInBlock(objBlock, k, String(Math.round(val)));
            if (patchedObj) objBlock = patchedObj;
          }
        }
        const nextStmt = stmt.slice(0, dm.index) + `${dm[1]}${objBlock}` + stmt.slice(dm.index + dm[0].length);
        const nextCode = code.slice(0, im.index) + nextStmt + code.slice(im.index + stmt.length);
        return buildResult(files, i, nextCode, im.index + dm.index);
      }
    }
  }

  return {
    patched: false,
    updatedFiles: files,
    reason: `未找到動作 '${actionName}' 的 .hitbox(...) 或 defaultHitbox 宣告（請於檔案中顯式宣告 action('${actionName}').hitbox(...)）`,
  };
}


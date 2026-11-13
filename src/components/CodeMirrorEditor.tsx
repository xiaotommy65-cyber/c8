import { useEffect, useRef } from 'react';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { javascript } from '@codemirror/lang-javascript';
import { autocompletion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { HighlightStyle, syntaxHighlighting, bracketMatching } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import type { VirtualProjectFile } from '../engine/types';

interface CodeMirrorEditorProps {
  value: string;
  activePath: string;
  projectFiles: VirtualProjectFile[];
  onChange: (nextCode: string) => void;
  onCompileShortcut: () => void;
}

const chronoForgeTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: '#0D1017',
      color: '#E2E8F0',
      height: '100%',
      fontSize: '12px',
      fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    },
    '.cm-content': {
      caretColor: '#4ADE80',
      padding: '12px 0',
      lineHeight: '1.6',
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: '#4ADE80',
      borderLeftWidth: '2px',
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: 'rgba(56, 189, 248, 0.22)',
    },
    '.cm-gutters': {
      backgroundColor: '#0B0E14',
      color: '#475569',
      borderRight: '1px solid #1E2536',
      minWidth: '42px',
    },
    '.cm-activeLineGutter': {
      backgroundColor: '#131822',
      color: '#94A3B8',
    },
    '.cm-activeLine': {
      backgroundColor: 'rgba(30, 41, 59, 0.32)',
    },
    '.cm-matchingBracket, .cm-nonmatchingBracket': {
      backgroundColor: 'rgba(74, 222, 128, 0.18)',
      outline: '1px solid rgba(74, 222, 128, 0.45)',
    },
    '.cm-tooltip': {
      backgroundColor: '#131822',
      border: '1px solid #2D374E',
      borderRadius: '6px',
      color: '#E2E8F0',
      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.45)',
    },
    '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
      backgroundColor: '#1E293B',
      color: '#FFFFFF',
    },
    '.cm-completionLabel': {
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: '12px',
    },
    '.cm-completionDetail': {
      color: '#38BDF8',
      fontSize: '11px',
      marginLeft: '8px',
    },
    '.cm-scroller': {
      overflow: 'auto',
    },
  },
  { dark: true },
);

const chronoForgeHighlight = syntaxHighlighting(
  HighlightStyle.define([
    { tag: tags.keyword, color: '#C084FC', fontWeight: '600' },
    { tag: [tags.name, tags.deleted, tags.character, tags.macroName], color: '#E2E8F0' },
    { tag: [tags.function(tags.variableName), tags.labelName], color: '#38BDF8' },
    { tag: [tags.propertyName], color: '#7DD3FC' },
    { tag: [tags.color, tags.constant(tags.name), tags.standard(tags.name)], color: '#FBBF24' },
    { tag: [tags.definition(tags.name), tags.separator], color: '#E2E8F0' },
    { tag: [tags.typeName, tags.className, tags.number, tags.changed, tags.annotation, tags.modifier, tags.self, tags.namespace], color: '#FBBF24' },
    { tag: [tags.operator, tags.operatorKeyword, tags.url, tags.escape, tags.regexp, tags.link, tags.special(tags.string)], color: '#94A3B8' },
    { tag: [tags.meta, tags.comment], color: '#64748B', fontStyle: 'italic' },
    { tag: tags.strong, fontWeight: 'bold' },
    { tag: tags.emphasis, fontStyle: 'italic' },
    { tag: tags.string, color: '#4ADE80' },
    { tag: tags.bool, color: '#F472B6' },
  ]),
);

const TOP_LEVEL_DSL_COMPLETIONS = [
  { label: 'scene', type: 'namespace', detail: '流暢場景建立器 (.sky/.ambient/.parallax/.tilemap)' },
  { label: 'hero', type: 'function', detail: "(id = 'hero') => FluentActorHandle" },
  { label: 'enemy', type: 'function', detail: '(id: string) => FluentActorHandle' },
  { label: 'dummy', type: 'function', detail: '(id: string) => FluentActorHandle' },
  { label: 'actor', type: 'function', detail: '(id, kind?) => FluentActorHandle' },
  { label: 'action', type: 'function', detail: '(name) => FluentActionBuilder' },
  { label: 'light', type: 'function', detail: '(id) => FluentLightBuilder' },
  { label: 'flow', type: 'namespace', detail: '協程排程器 (.spawn/.loop)' },
  { label: 'signals', type: 'namespace', detail: '訊號匯流排 (.on/.once/.emit)' },
  { label: 'vfx', type: 'namespace', detail: '像素特效 (.burst/.slashArc/.afterimage/.popup)' },
  { label: 'sfx', type: 'namespace', detail: 'ZzFX 音效合成 (.playPreset/.zzfx)' },
  { label: 'wait', type: 'function', detail: 'yield* wait(seconds)' },
  { label: 'waitTicks', type: 'function', detail: 'yield* waitTicks(ticks)' },
  { label: 'waitUntil', type: 'function', detail: 'yield* waitUntil(() => boolean)' },
  { label: 'tween', type: 'function', detail: "yield* tween(sec, 'easeOutBack', (t) => ...)" },
  { label: 'parallel', type: 'function', detail: 'yield* parallel(...coroutines)' },
  { label: 'sequence', type: 'function', detail: 'yield* sequence(...coroutines)' },
  { label: 'engine', type: 'variable', detail: 'ChronoForgeEngine 核心實例' },
  { label: 'importedBundle', type: 'variable', detail: '工作室跨區匯流排精靈套件' },
  { label: 'importedAssets', type: 'variable', detail: 'Aseprite / LDtk / Tiled 匯入資產' },
];

const DOT_COMPLETIONS: Record<string, Array<{ label: string; type: string; detail: string }>> = {
  scene: [
    { label: 'sky', type: 'method', detail: '(topHex, bottomHex) => scene' },
    { label: 'ambient', type: 'method', detail: '(darknessAlpha: 0..0.92) => scene' },
    { label: 'parallax', type: 'method', detail: "(type, speed, color, heightRatio?) => scene" },
    { label: 'tilemap', type: 'method', detail: '(asciiRows, legend, tileSize?) => scene' },
    { label: 'ldtk', type: 'method', detail: '(ldtkJson, options?) => scene' },
    { label: 'tiled', type: 'method', detail: '(tiledJson, options?) => scene' },
    { label: 'cameraFollow', type: 'method', detail: '(actorOrId, lerp?) => scene' },
    { label: 'shake', type: 'method', detail: '(trauma: 0..1) => scene' },
  ],
  flow: [
    { label: 'spawn', type: 'method', detail: '(function* () { yield* wait(...); }) => handle' },
    { label: 'loop', type: 'method', detail: '(function* () { ... }) => handle' },
    { label: 'activeCount', type: 'method', detail: '() => number' },
    { label: 'clear', type: 'method', detail: '() => void' },
  ],
  signals: [
    { label: 'on', type: 'method', detail: "(event, (payload) => void) => unsub" },
    { label: 'once', type: 'method', detail: "(event, (payload) => void) => unsub" },
    { label: 'emit', type: 'method', detail: '(event, payload) => void' },
    { label: 'off', type: 'method', detail: '(event, handler) => void' },
  ],
  vfx: [
    { label: 'burst', type: 'method', detail: '(x, y, { count, color, speed, bounce })' },
    { label: 'slashArc', type: 'method', detail: '(x, y, facing, { radius, color })' },
    { label: 'afterimage', type: 'method', detail: '(entityId, { color, life, alpha })' },
    { label: 'popup', type: 'method', detail: '(x, y, text, color?)' },
  ],
  sfx: [
    { label: 'playPreset', type: 'method', detail: "('slash' | 'hit' | 'jump' | 'dash' | 'coin' | 'powerup')" },
    { label: 'zzfx', type: 'method', detail: '(...params: 20D array)' },
    { label: 'setAutoCombatAudio', type: 'method', detail: '(enabled: boolean)' },
  ],
};

const CHAIN_METHODS = [
  { label: 'at', type: 'method', detail: '(x, y) => actor' },
  { label: 'hp', type: 'method', detail: '(value) => actor' },
  { label: 'speed', type: 'method', detail: '(value) => actor' },
  { label: 'patrol', type: 'method', detail: '(range) => actor' },
  { label: 'facing', type: 'method', detail: '(1 | -1) => actor' },
  { label: 'theme', type: 'method', detail: "(theme, weapon?, hair?) => actor/action" },
  { label: 'aura', type: 'method', detail: '(colorHex, radius?, opts?) => actor' },
  { label: 'follow', type: 'method', detail: '(lerp = 0.14) => actor' },
  { label: 'act', type: 'method', detail: '(actionName) => actor' },
  { label: 'say', type: 'method', detail: '(text, color?) => actor' },
  { label: 'on', type: 'method', detail: "('hit' | 'hurt' | event, fn) => actor" },
  { label: 'fps', type: 'method', detail: '(fps) => action' },
  { label: 'loop', type: 'method', detail: '(bool) => action' },
  { label: 'tweens', type: 'method', detail: "(count, 'easeOutBack') => action" },
  { label: 'rimLight', type: 'method', detail: '(enabled = true) => action' },
  { label: 'dither', type: 'method', detail: '(pct) => action' },
  { label: 'outline', type: 'method', detail: "('4way' | '8way' | 'none') => action" },
  { label: 'hitbox', type: 'method', detail: '({ x, y, w, h }, activeFrames) => action' },
  { label: 'poses', type: 'method', detail: '(keyframes[]) => action' },
  { label: 'pose', type: 'method', detail: '(keyframe) => action' },
  { label: 'radius', type: 'method', detail: '(r) => light' },
  { label: 'color', type: 'method', detail: '(hex) => light' },
  { label: 'intensity', type: 'method', detail: '(val) => light' },
  { label: 'flicker', type: 'method', detail: '(val) => light' },
  { label: 'attachTo', type: 'method', detail: '(entityId, ox?, oy?) => light' },
];

export function CodeMirrorEditor({
  value,
  activePath,
  projectFiles,
  onChange,
  onCompileShortcut,
}: CodeMirrorEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onCompileRef = useRef(onCompileShortcut);
  const filesRef = useRef(projectFiles);
  const activePathRef = useRef(activePath);
  const completionCompartmentRef = useRef(new Compartment());

  onChangeRef.current = onChange;
  onCompileRef.current = onCompileShortcut;
  filesRef.current = projectFiles;
  activePathRef.current = activePath;

  useEffect(() => {
    if (!hostRef.current) return;

    const customCompletionSource = (context: CompletionContext): CompletionResult | null => {
      // Suggest relative virtual imports when inside `from './...'`
      const importMatch = context.matchBefore(/from\s+['"][^'"]*$/);
      if (importMatch) {
        const quoteIdx = Math.max(importMatch.text.lastIndexOf("'"), importMatch.text.lastIndexOf('"'));
        const fromPos = importMatch.from + quoteIdx + 1;
        const options = filesRef.current
          .filter((f) => f.path !== activePathRef.current)
          .map((f) => ({
            label: `./${f.path.replace(/\.ts$/, '')}`,
            type: 'file',
            detail: f.summary ?? '專案虛擬模組',
          }));
        return { from: fromPos, options };
      }

      // Namespace dot completion: scene. / flow. / signals. / vfx. / sfx.
      const nsMatch = context.matchBefore(/\b(scene|flow|signals|vfx|sfx)\.\w*$/);
      if (nsMatch) {
        const dotIdx = nsMatch.text.indexOf('.');
        const ns = nsMatch.text.slice(0, dotIdx);
        return {
          from: nsMatch.from + dotIdx + 1,
          options: DOT_COMPLETIONS[ns] ?? [],
        };
      }

      // Chained builder dot completion: ). / hero().
      const chainMatch = context.matchBefore(/\)\.\w*|\.\w*$/);
      if (chainMatch && chainMatch.text.includes('.')) {
        const dotIdx = chainMatch.text.lastIndexOf('.');
        return {
          from: chainMatch.from + dotIdx + 1,
          options: CHAIN_METHODS,
        };
      }

      // Top-level DSL identifiers
      const word = context.matchBefore(/\w*/);
      if (!word || (word.from === word.to && !context.explicit)) return null;
      return {
        from: word.from,
        options: TOP_LEVEL_DSL_COMPLETIONS,
      };
    };

    const compileKeymap = keymap.of([
      {
        key: 'Mod-Enter',
        run: () => {
          onCompileRef.current();
          return true;
        },
      },
      indentWithTab,
      ...defaultKeymap,
      ...historyKeymap,
    ]);

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        history(),
        bracketMatching(),
        javascript({ typescript: true }),
        chronoForgeTheme,
        chronoForgeHighlight,
        completionCompartmentRef.current.of(
          autocompletion({ override: [customCompletionSource] }),
        ),
        compileKeymap,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
      ],
    });

    const view = new EditorView({
      state,
      parent: hostRef.current,
    });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external document updates (file switch or preset change)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentDoc = view.state.doc.toString();
    if (currentDoc !== value) {
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: value },
      });
    }
  }, [value, activePath]);

  return <div ref={hostRef} className="flex-1 h-full min-h-0 overflow-hidden bg-[#0D1017]" />;
}

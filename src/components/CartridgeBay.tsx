import { AnimatePresence, motion } from 'motion/react';
import { Disc3, Sparkles, X } from 'lucide-react';
import type { EnginePreset } from '../engine/types';

export interface CartridgeMeta {
  id: string;
  serial: string;
  shortTitle: string;
  subtitle: string;
  shellBg: string;
  shellBorder: string;
  shellShadow: string;
  labelGradient: string;
  accentHex: string;
  emblem: 'citadel' | 'coroutines' | 'dungeon' | 'action' | 'vfx' | 'studio' | 'mcp';
}

export const CARTRIDGE_CATALOG: Record<string, CartridgeMeta> = {
  'emerald-citadel-campaign': {
    id: 'emerald-citadel-campaign',
    serial: 'CF-000',
    shortTitle: '翡翠秘境三幕試煉',
    subtitle: '三幕關卡 · 傳送門 · 魔王狀態機',
    shellBg: '#10B981',
    shellBorder: '#047857',
    shellShadow: '#065F46',
    labelGradient: 'linear-gradient(135deg, #064E3B 0%, #0F766E 55%, #10B981 100%)',
    accentHex: '#34D399',
    emblem: 'citadel',
  },
  'fluent-coroutines-suite': {
    id: 'fluent-coroutines-suite',
    serial: 'CF-001',
    shortTitle: '絕妙語法與協程劇本',
    subtitle: '跨檔 DSL · 協程時間軸 · 訊號流',
    shellBg: '#0EA5E9',
    shellBorder: '#0369A1',
    shellShadow: '#075985',
    labelGradient: 'linear-gradient(135deg, #0C4A6E 0%, #1D4ED8 55%, #06B6D4 100%)',
    accentHex: '#38BDF8',
    emblem: 'coroutines',
  },
  'dungeon-combat': {
    id: 'dungeon-combat',
    serial: 'CF-002',
    shortTitle: '地牢火把與橫向戰鬥',
    subtitle: '4-bit 自動磚塊 · 火把動態光 · AI',
    shellBg: '#F97316',
    shellBorder: '#C2410C',
    shellShadow: '#9A3412',
    labelGradient: 'linear-gradient(135deg, #431407 0%, #9A3412 55%, #EA580C 100%)',
    accentHex: '#FB923C',
    emblem: 'dungeon',
  },
  'action-compiler': {
    id: 'action-compiler',
    serial: 'CF-003',
    shortTitle: '純程式動作編譯補間',
    subtitle: '關鍵幀曲線 · Bayer 抖動 · Rim光',
    shellBg: '#8B5CF6',
    shellBorder: '#5B21B6',
    shellShadow: '#4C1D95',
    labelGradient: 'linear-gradient(135deg, #2E1065 0%, #6D28D9 60%, #EC4899 100%)',
    accentHex: '#A78BFA',
    emblem: 'action',
  },
  'vfx-lighting': {
    id: 'vfx-lighting',
    serial: 'CF-004',
    shortTitle: '像素粒子與動態光源',
    subtitle: '雙環螢火光源 · 地形反彈火花',
    shellBg: '#06B6D4',
    shellBorder: '#0E7490',
    shellShadow: '#155E75',
    labelGradient: 'linear-gradient(135deg, #083344 0%, #164E63 55%, #22D3EE 100%)',
    accentHex: '#22D3EE',
    emblem: 'vfx',
  },
  'studio-bridge': {
    id: 'studio-bridge',
    serial: 'CF-005',
    shortTitle: '工作室精靈匯流排卡匣',
    subtitle: '同步 /studio 即時角色幀與色盤',
    shellBg: '#F59E0B',
    shellBorder: '#B45309',
    shellShadow: '#92400E',
    labelGradient: 'linear-gradient(135deg, #451A03 0%, #B45309 55%, #FBBF24 100%)',
    accentHex: '#FBBF24',
    emblem: 'studio',
  },
};

export function resolveCartridgeMeta(presetId: string, presets: EnginePreset[]): CartridgeMeta {
  if (CARTRIDGE_CATALOG[presetId]) {
    return CARTRIDGE_CATALOG[presetId];
  }
  const found = presets.find((p) => p.id === presetId);
  if (found) {
    return {
      id: found.id,
      serial: 'CF-USR',
      shortTitle: found.title.replace(/^\d+\.\s*/, ''),
      subtitle: found.summary,
      shellBg: '#64748B',
      shellBorder: '#334155',
      shellShadow: '#1E293B',
      labelGradient: 'linear-gradient(135deg, #0F172A 0%, #334155 60%, #475569 100%)',
      accentHex: '#94A3B8',
      emblem: 'mcp',
    };
  }
  return {
    id: presetId,
    serial: 'CF-MCP',
    shortTitle: '外部 AI 燒錄卡匣',
    subtitle: '來自 /mcp 開發匯流排的即時腳本',
    shellBg: '#334155',
    shellBorder: '#1E293B',
    shellShadow: '#0F172A',
    labelGradient: 'linear-gradient(135deg, #090D16 0%, #1E293B 55%, #10B981 100%)',
    accentHex: '#34D399',
    emblem: 'mcp',
  };
}

function CartridgeEmblemSvg({ emblem, accentHex }: { emblem: CartridgeMeta['emblem']; accentHex: string }) {
  switch (emblem) {
    case 'citadel':
      return (
        <svg viewBox="0 0 48 48" className="w-8 h-8" aria-hidden="true">
          <path d="M10 38V20l6-5v6h4V13l4-4 4 4v8h4v-6l6 5v18H10z" fill={accentHex} opacity="0.92" />
          <rect x="20" y="27" width="8" height="11" rx="2" fill="#06281E" />
          <circle cx="24" cy="18" r="2.5" fill="#FDE047" />
        </svg>
      );
    case 'coroutines':
      return (
        <svg viewBox="0 0 48 48" className="w-8 h-8" aria-hidden="true">
          <path d="M8 24h10l5-10 6 20 5-10h6" stroke={accentHex} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <circle cx="38" cy="24" r="3" fill="#F8FAFC" />
        </svg>
      );
    case 'dungeon':
      return (
        <svg viewBox="0 0 48 48" className="w-8 h-8" aria-hidden="true">
          <path d="M24 9c5 6 8 10 8 15a8 8 0 1 1-16 0c0-5 3-9 8-15z" fill={accentHex} />
          <path d="M24 18c2.5 3 4 5 4 7.5a4 4 0 1 1-8 0c0-2.5 1.5-4.5 4-7.5z" fill="#FEF08A" />
          <rect x="21" y="33" width="6" height="8" rx="1.5" fill="#FED7AA" opacity="0.85" />
        </svg>
      );
    case 'action':
      return (
        <svg viewBox="0 0 48 48" className="w-8 h-8" aria-hidden="true">
          <path d="M11 33L33 11l4 4-22 22-5 1 1-5z" fill={accentHex} />
          <path d="M14 14l4 4M30 30l4 4" stroke="#F8FAFC" strokeWidth="3.5" strokeLinecap="round" />
        </svg>
      );
    case 'vfx':
      return (
        <svg viewBox="0 0 48 48" className="w-8 h-8" aria-hidden="true">
          <circle cx="19" cy="22" r="6" fill={accentHex} opacity="0.9" />
          <circle cx="31" cy="27" r="4.5" fill="#F472B6" opacity="0.9" />
          <circle cx="25" cy="14" r="3" fill="#FEF08A" />
          <path d="M12 36c6-4 18-4 24 0" stroke="#F8FAFC" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.7" />
        </svg>
      );
    case 'studio':
      return (
        <svg viewBox="0 0 48 48" className="w-8 h-8" aria-hidden="true">
          <rect x="10" y="10" width="12" height="12" rx="2" fill={accentHex} />
          <rect x="26" y="10" width="12" height="12" rx="2" fill="#34D399" />
          <rect x="10" y="26" width="12" height="12" rx="2" fill="#F8FAFC" opacity="0.9" />
          <rect x="26" y="26" width="12" height="12" rx="2" fill="#FB7185" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 48 48" className="w-8 h-8" aria-hidden="true">
          <rect x="11" y="12" width="26" height="24" rx="4" stroke={accentHex} strokeWidth="3" fill="none" />
          <path d="M18 20l4 4-4 4M25 28h6" stroke="#F8FAFC" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
  }
}

export function CartridgePhysicalBody({
  meta,
  compact = false,
  isSelected = false,
  showPins = false,
}: {
  meta: CartridgeMeta;
  compact?: boolean;
  isSelected?: boolean;
  showPins?: boolean;
}) {
  return (
    <div
      style={{
        backgroundColor: meta.shellBg,
        borderColor: meta.shellBorder,
        boxShadow: isSelected
          ? `0 6px 0 ${meta.shellShadow}, 0 12px 24px rgba(0,0,0,0.45), 0 0 0 2px #F8FAFC`
          : `0 5px 0 ${meta.shellShadow}, 0 10px 20px rgba(0,0,0,0.38)`,
      }}
      className={`relative rounded-t-xl rounded-b-md border-2 select-none overflow-visible ${
        compact ? 'w-[144px] h-[116px] p-2' : 'w-[168px] h-[136px] p-2.5'
      }`}
    >
      {/* Top Molded Grip Lip */}
      <div className="h-2.5 w-full flex items-center justify-between px-1 mb-1.5">
        <div className="flex gap-0.5">
          <span className="w-3 h-0.5 rounded-full bg-black/25" />
          <span className="w-3 h-0.5 rounded-full bg-black/25" />
        </div>
        <span className="text-[8px] font-mono font-bold tracking-widest text-black/45">
          {meta.serial}
        </span>
        <div className="flex gap-0.5">
          <span className="w-3 h-0.5 rounded-full bg-black/25" />
          <span className="w-3 h-0.5 rounded-full bg-black/25" />
        </div>
      </div>

      {/* Side Ribbed Grips */}
      <div className="absolute left-0.5 top-5 bottom-4 flex flex-col justify-center gap-1 opacity-30">
        <span className="w-1 h-1.5 rounded-r bg-black" />
        <span className="w-1 h-1.5 rounded-r bg-black" />
        <span className="w-1 h-1.5 rounded-r bg-black" />
      </div>
      <div className="absolute right-0.5 top-5 bottom-4 flex flex-col justify-center gap-1 opacity-30">
        <span className="w-1 h-1.5 rounded-l bg-black" />
        <span className="w-1 h-1.5 rounded-l bg-black" />
        <span className="w-1 h-1.5 rounded-l bg-black" />
      </div>

      {/* Glossy Center Cover Label Sticker */}
      <div
        style={{ background: meta.labelGradient }}
        className="w-full h-[calc(100%-22px)] rounded-lg border border-black/30 p-2 flex flex-col justify-between text-white shadow-inner overflow-hidden relative"
      >
        <div className="flex items-start justify-between gap-1">
          <CartridgeEmblemSvg emblem={meta.emblem} accentHex={meta.accentHex} />
          <span className="text-[9px] font-mono uppercase tracking-wider text-white/75">
            ROM·60HZ
          </span>
        </div>

        <div className="space-y-0.5 text-left">
          <div className="text-xs font-bold leading-tight truncate text-white">
            {meta.shortTitle}
          </div>
          <div className="text-[10px] leading-tight truncate text-white/75">
            {meta.subtitle}
          </div>
        </div>

        {/* Insert Direction Triangle */}
        <div className="absolute bottom-1 right-1.5 text-[8px] text-white/45" aria-hidden="true">
          ▼
        </div>
      </div>

      {/* Exposed Gold PCB Contact Pins (Visible on Eject / Insert Close-up) */}
      {showPins && (
        <div className="absolute -bottom-3 left-4 right-4 h-3 bg-[#064E3B] border border-black/50 rounded-b-sm flex items-center justify-around px-1.5 shadow-md">
          {Array.from({ length: 9 }).map((_, idx) => (
            <span key={idx} className="w-1.5 h-2 rounded-t-[1px] bg-[#FACC15]" />
          ))}
        </div>
      )}
    </div>
  );
}

interface TopCartridgeSlotProps {
  activeMeta: CartridgeMeta;
  isOpen: boolean;
  isInserting: boolean;
  onToggleOpen: () => void;
}

export function TopCartridgeSlot({
  activeMeta,
  isOpen,
  isInserting,
  onToggleOpen,
}: TopCartridgeSlotProps) {
  return (
    <div className="relative flex justify-center -mb-1 z-20 select-none">
      {/* Recessed Slot Lip on Console Spine */}
      <button
        type="button"
        onClick={onToggleOpen}
        aria-label={`點擊更換遊戲卡匣（目前：${activeMeta.shortTitle}）`}
        className="group relative flex flex-col items-center cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80 rounded-t-xl"
      >
        {/* Top Cartridge Spine Peeking Out */}
        <motion.div
          animate={{
            y: isOpen ? -24 : isInserting ? 3 : 0,
            opacity: isOpen ? 0 : 1,
          }}
          transition={{ type: 'spring', stiffness: 360, damping: 20 }}
          style={{
            backgroundColor: activeMeta.shellBg,
            borderColor: activeMeta.shellBorder,
          }}
          className="px-4 py-1 rounded-t-lg border-x-2 border-t-2 flex items-center gap-2 text-white shadow-[0_-2px_8px_rgba(0,0,0,0.3)] group-hover:-translate-y-0.5 transition-transform"
        >
          <span className="font-mono text-[10px] font-bold tracking-wider opacity-90">
            {activeMeta.serial}
          </span>
          <span className="text-[11px] font-semibold tracking-tight whitespace-nowrap max-w-[140px] sm:max-w-[200px] truncate">
            {activeMeta.shortTitle}
          </span>
          <span className="text-[10px] opacity-80 whitespace-nowrap">
            · 換卡
          </span>
        </motion.div>

        {/* Slot Receiver Plastic Collar */}
        <div className="w-[210px] sm:w-[250px] h-2 bg-[#1B1F2A] border-x border-t border-white/15 rounded-t-md shadow-inner flex items-center justify-center">
          <span
            className={`w-28 h-0.5 rounded-full transition-colors ${
              isInserting ? 'bg-[#FACC15]' : 'bg-white/15'
            }`}
          />
        </div>
      </button>
    </div>
  );
}

interface CartridgeSwapOverlayProps {
  phase: 'ejecting' | 'tray-open' | 'inserting';
  activeCartId: string;
  insertingMeta: CartridgeMeta | null;
  presets: EnginePreset[];
  hasCustomMcpCart: boolean;
  hideTopPreview?: boolean;
  onSelectCartridge: (id: string) => void;
  onClose: () => void;
}

export function CartridgeSwapOverlay({
  phase,
  activeCartId,
  insertingMeta,
  presets,
  hasCustomMcpCart,
  hideTopPreview = false,
  onSelectCartridge,
  onClose,
}: CartridgeSwapOverlayProps) {
  const activeMeta = resolveCartridgeMeta(activeCartId, presets);
  const displayPresets = presets;

  return (
    <AnimatePresence>
      <motion.div
        key="cartridge-swap-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-40 flex flex-col justify-between pointer-events-auto"
        role="dialog"
        aria-modal="true"
        aria-label="卡匣抽換特寫托盤"
      >
        {/* Top Close-up Stage: Either 2D Preview Card or Unobstructed 3D Cartridge Label */}
        <div className="flex-1 flex flex-col items-center justify-end pb-3 sm:pt-6 px-4 pointer-events-none">
          {hideTopPreview ? (
            <span
              className={`px-3 py-1 rounded-md text-xs font-mono shadow-lg border ${
                phase === 'inserting' && insertingMeta
                  ? 'bg-[#0B0E14]/95 border-[#FACC15]/50 text-[#FDE047]'
                  : 'bg-[#0B0E14]/92 border-white/15 text-[#CBD5E1]'
              }`}
            >
              {phase === 'inserting' && insertingMeta
                ? `正在壓入卡榫：${insertingMeta.serial} ${insertingMeta.shortTitle}`
                : `已彈出目前卡匣 · ${activeMeta.serial} ${activeMeta.shortTitle}`}
            </span>
          ) : phase === 'inserting' && insertingMeta ? (
            <motion.div
              key={`insert-${insertingMeta.id}`}
              initial={{ y: -90, scale: 1.06, rotateZ: -3, opacity: 0.9 }}
              animate={{ y: 24, scale: 0.95, rotateZ: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 420, damping: 25 }}
              className="flex flex-col items-center gap-2 mb-auto"
            >
              <CartridgePhysicalBody meta={insertingMeta} showPins />
              <span className="px-3 py-1 rounded-md bg-[#0B0E14]/95 border border-[#FACC15]/50 text-xs font-mono text-[#FDE047] shadow-lg">
                正在壓入卡榫：{insertingMeta.shortTitle}
              </span>
            </motion.div>
          ) : (
            <motion.div
              key={`eject-${activeMeta.id}`}
              initial={{ y: 38, scale: 0.9, rotateZ: 0, opacity: 0 }}
              animate={{ y: -2, scale: 1, rotateZ: -2.5, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 20 }}
              className="flex flex-col items-center gap-2 mb-auto"
            >
              <CartridgePhysicalBody meta={activeMeta} showPins />
              <span className="px-3 py-1 rounded-md bg-[#0B0E14]/92 border border-white/15 text-[11px] font-mono text-[#CBD5E1] shadow-lg">
                已彈出目前卡匣 · {activeMeta.serial} {activeMeta.shortTitle}
              </span>
            </motion.div>
          )}
        </div>

        {/* Bottom Interactive Cartridge Selection Tray (Solid opaque surface, no backdrop-blur over 3D) */}
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 290, damping: 26 }}
          className="bg-[#0F121B]/96 border-t border-[#272E42] px-4 sm:px-6 pt-3 pb-[max(14px,env(safe-area-inset-bottom))] shadow-[0_-18px_50px_rgba(0,0,0,0.75)]"
        >
          <div className="max-w-[1160px] mx-auto space-y-2.5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-xs text-[#CBD5E1]">
                <Disc3 className="w-4 h-4 text-[#34D399]" aria-hidden="true" />
                <span className="font-semibold text-white">點選卡匣直接插入掌機插槽</span>
                <span className="hidden sm:inline text-[#94A3B8]">
                  · 含主線試煉卡匣與純程式技術展演卡匣
                </span>
              </div>

              <button
                type="button"
                onClick={onClose}
                disabled={phase === 'inserting'}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#1E2433] hover:bg-[#2A3247] text-[#E2E8F0] rounded-lg border border-white/10 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
                收回插槽 (Esc)
              </button>
            </div>

            {/* Horizontal Swipeable Cartridge Rack */}
            <div className="flex items-stretch gap-3.5 overflow-x-auto pb-2 pt-2 px-1">
              {hasCustomMcpCart && (
                <button
                  type="button"
                  disabled={phase === 'inserting'}
                  onClick={() => onSelectCartridge('__custom_mcp__')}
                  className="shrink-0 group flex flex-col items-center gap-1.5 cursor-pointer focus:outline-none disabled:opacity-50"
                >
                  <div className="transition-transform duration-150 group-hover:-translate-y-2 group-active:scale-95">
                    <CartridgePhysicalBody
                      compact
                      isSelected={activeCartId === 'mcp-agent-project'}
                      meta={{
                        id: 'mcp-agent-project',
                        serial: 'CF-MCP',
                        shortTitle: '外部 AI 燒錄卡匣',
                        subtitle: '工作區即時同步腳本',
                        shellBg: '#334155',
                        shellBorder: '#1E293B',
                        shellShadow: '#0F172A',
                        labelGradient: 'linear-gradient(135deg, #090D16 0%, #1E293B 55%, #10B981 100%)',
                        accentHex: '#34D399',
                        emblem: 'mcp',
                      }}
                    />
                  </div>
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#34D399] whitespace-nowrap">
                    <Sparkles className="w-3 h-3" aria-hidden="true" />
                    目前外部工作區
                  </span>
                </button>
              )}

              {displayPresets.map((preset) => {
                const meta = resolveCartridgeMeta(preset.id, displayPresets);
                const selected = preset.id === activeCartId;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    disabled={phase === 'inserting'}
                    onClick={() => onSelectCartridge(preset.id)}
                    className="shrink-0 group flex flex-col items-center gap-1.5 cursor-pointer focus:outline-none disabled:opacity-50"
                  >
                    <div className="transition-transform duration-150 group-hover:-translate-y-2 group-active:scale-95">
                      <CartridgePhysicalBody compact meta={meta} isSelected={selected} />
                    </div>
                    <span
                      className={`text-[11px] font-medium whitespace-nowrap ${
                        selected ? 'text-[#34D399]' : 'text-[#94A3B8] group-hover:text-white'
                      }`}
                    >
                      {selected ? '插槽中' : '點擊插入'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

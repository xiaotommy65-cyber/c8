import { useEffect, useState } from 'react';
import { ArrowRight, Boxes, Code2, Cpu, Database, Gamepad2, Layers, Sparkles } from 'lucide-react';
import { ENGINE_PRESETS } from '../engine/presets';
import type { StudioBundleInput } from '../engine/types';
import { PWAInstallButton } from './PWAControls';

interface BusPayload {
  bundle: StudioBundleInput | null;
  updatedAt: string | null;
}

export function LobbyHub() {
  const [busData, setBusData] = useState<BusPayload>({ bundle: null, updatedAt: null });
  const [artifactCount, setArtifactCount] = useState<number | null>(null);
  const [latestTag, setLatestTag] = useState<string>('v2.0.0-micro-engine');

  useEffect(() => {
    fetch('/api/project-bus/studio-bundle')
      .then((r) => r.json())
      .then((data) => {
        if (data?.bundle) {
          setBusData({ bundle: data.bundle, updatedAt: data.updatedAt ?? null });
        } else {
          try {
            const raw = localStorage.getItem('chronoforge_studio_bus');
            if (raw) {
              const parsed = JSON.parse(raw);
              if (parsed?.bundle) setBusData({ bundle: parsed.bundle, updatedAt: parsed.updatedAt ?? null });
            }
          } catch {
            // ignore local storage errors
          }
        }
      })
      .catch(() => {});

    fetch('/api/artifacts')
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data?.artifacts) ? data.artifacts : [];
        setArtifactCount(list.length);
        if (list[0]?.versionTag) setLatestTag(list[0].versionTag);
      })
      .catch(() => {});
  }, []);

  const busAnimCount = busData.bundle?.animations
    ? Object.keys(busData.bundle.animations).length
    : 0;

  return (
    <div className="min-h-screen bg-[#0B0E14] text-[#E2E8F0] font-sans flex flex-col">
      {/* Strict 3-Zone Top Bar */}
      <header className="h-14 border-b border-[#232A3B] bg-[#111520] px-6 flex items-center justify-between gap-8 shrink-0">
        <a
          href="/"
          className="text-base font-semibold tracking-tight text-white whitespace-nowrap shrink-0"
        >
          ChronoForge
        </a>

        <nav className="hidden md:flex items-center gap-6 text-sm text-[#94A3B8]" aria-label="層級工作區導覽">
          <a href="/" className="text-white border-b border-[#16A34A] pb-0.5 whitespace-nowrap shrink-0">
            總部大廳
          </a>
          <a href="/studio" className="hover:text-white transition-colors whitespace-nowrap shrink-0">
            精靈與幀製作區
          </a>
          <a href="/engine" className="hover:text-white transition-colors whitespace-nowrap shrink-0">
            純程式引擎區
          </a>
          <a href="/play" className="hover:text-white transition-colors whitespace-nowrap shrink-0">
            遊戲遊玩區
          </a>
          <a href="/archive" className="hover:text-white transition-colors whitespace-nowrap shrink-0">
            文物歷史庫
          </a>
        </nav>

        <a
          href="/play"
          className="px-4 py-2 text-xs font-semibold bg-[#16A34A] hover:bg-[#15803D] text-white rounded-md transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-1.5"
        >
          進入遊戲區
          <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
        </a>
      </header>

      <main className="flex-1 max-w-[1440px] w-full mx-auto px-6 py-10 space-y-10">
        {/* Hero Overview */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch border-b border-[#232A3B] pb-10">
          <div className="lg:col-span-7 flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              <div className="text-xs font-mono text-[#4ADE80] tracking-wide">
                PURE-CODE 2D PIXEL DEVELOPMENT SUITE
              </div>
              <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-white leading-tight [text-wrap:balance]">
                面向 AI Agent 與程式開發者的分層像素遊戲引擎工作台
              </h1>
              <p className="text-sm sm:text-base text-[#94A3B8] max-w-2xl leading-relaxed">
                將美術精靈與逐幀碰撞製作、Godot 式節點樹與純程式遊戲引擎、以及數位文物版本稽核分離為獨立層級，透過跨區資產匯流排即時串聯。
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <a
                href="/play"
                className="px-5 py-2.5 text-sm font-semibold bg-[#16A34A] hover:bg-[#15803D] text-white rounded-md transition-colors inline-flex items-center gap-2 whitespace-nowrap"
              >
                <Gamepad2 className="w-4 h-4" />
                進入大螢幕遊玩區
              </a>
              <a
                href="/engine"
                className="px-5 py-2.5 text-sm font-medium bg-[#131822] hover:bg-[#1E2534] text-[#E2E8F0] border border-[#232A3B] rounded-md transition-colors inline-flex items-center gap-2 whitespace-nowrap"
              >
                <Code2 className="w-4 h-4 text-[#38BDF8]" />
                開啟純程式引擎區
              </a>
              <a
                href="/studio"
                className="px-5 py-2.5 text-sm font-medium bg-[#131822] hover:bg-[#1E2534] text-[#E2E8F0] border border-[#232A3B] rounded-md transition-colors inline-flex items-center gap-2 whitespace-nowrap"
              >
                <Sparkles className="w-4 h-4 text-[#FBBF24]" />
                精靈與幀製作區
              </a>
              <PWAInstallButton className="py-2.5 px-4 text-sm" />
            </div>
          </div>

          {/* Right Panel: Cross-Zone Asset Bus Status */}
          <div className="lg:col-span-5 border border-[#232A3B] bg-[#131822] rounded-lg p-5 flex flex-col justify-between gap-4">
            <div className="flex items-center justify-between border-b border-[#232A3B] pb-3">
              <span className="text-sm font-medium text-white">跨區資產匯流排狀態</span>
              <span className="font-mono text-xs text-[#94A3B8]">
                {busData.updatedAt ? busData.updatedAt.slice(11, 19) : '待機中'}
              </span>
            </div>

            {busData.bundle ? (
              <div className="flex items-center gap-4">
                {busData.bundle.atlasDataUrl ? (
                  <div className="w-20 h-20 bg-[#0B0E14] border border-[#232A3B] rounded flex items-center justify-center shrink-0 overflow-hidden">
                    <img
                      src={busData.bundle.atlasDataUrl}
                      alt="工作室匯流排精靈圖集"
                      className="w-16 h-16 object-contain [image-rendering:pixelated]"
                    />
                  </div>
                ) : (
                  <div className="w-20 h-20 bg-[#0B0E14] border border-[#232A3B] rounded flex items-center justify-center shrink-0">
                    <Layers className="w-6 h-6 text-[#38BDF8]" />
                  </div>
                )}
                <div className="min-w-0 space-y-1 text-xs">
                  <div className="font-medium text-white truncate">
                    角色主題：{busData.bundle.appearance?.theme ?? '自訂角色'}
                  </div>
                  <div className="font-mono text-[#94A3B8] tabular-nums">
                    武器：{busData.bundle.appearance?.weapon ?? 'broadsword'} · 動畫序列：{busAnimCount} 組
                  </div>
                  <div className="text-[#38BDF8]">
                    已同步至匯流排，可直接於引擎區載入實戰測試
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-3 text-xs text-[#94A3B8] leading-relaxed">
                目前匯流排尚未收到來自精靈製作區的快照。前往 <span className="text-white font-medium">/studio</span> 調整角色或碰撞框後點擊「傳送至引擎區」，即可零下載直接串接。
              </div>
            )}

            <div className="pt-2 border-t border-[#232A3B] flex items-center justify-between gap-3">
              <span className="text-xs font-mono text-[#94A3B8] tabular-nums">
                路徑：/studio → Bus → /engine
              </span>
              {busData.bundle ? (
                <a
                  href="/engine?bus=studio"
                  className="px-3.5 py-1.5 text-xs font-medium bg-[#0284C7] hover:bg-[#0369A1] text-white rounded transition-colors whitespace-nowrap"
                >
                  帶入資產啟動引擎
                </a>
              ) : (
                <a
                  href="/studio"
                  className="px-3.5 py-1.5 text-xs font-medium bg-[#1E293B] hover:bg-[#293548] text-white rounded transition-colors whitespace-nowrap"
                >
                  前往精靈區製作
                </a>
              )}
            </div>
          </div>
        </section>

        {/* Four Hierarchical Zones Grid */}
        <section className="space-y-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold text-white">01. 核心層級工作區架構</h2>
            <span className="text-xs font-mono text-[#94A3B8]">4 獨立執行層 · 單一頂欄切換</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            <a
              href="/studio"
              className="group border border-[#232A3B] hover:border-[#4ADE80]/60 bg-[#131822] rounded-lg p-5 flex flex-col justify-between gap-5 transition-colors"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs font-mono text-[#94A3B8]">
                  <span>ZONE 01 · /studio</span>
                  <Boxes className="w-4 h-4 text-[#FBBF24]" />
                </div>
                <h3 className="text-base font-semibold text-white group-hover:text-[#4ADE80] transition-colors">
                  精靈與逐幀製作區
                </h3>
                <p className="text-xs text-[#94A3B8] leading-relaxed">
                  72×72 像素 5 階段著色管線、32 色大師鎖定色盤、程式化武器與配色生成器、逐幀 Hurtbox/Hitbox 編輯。
                </p>
              </div>
              <div className="pt-3 border-t border-[#232A3B] flex items-center justify-between text-xs text-[#CBD5E1]">
                <span>開啟像素工作室</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </a>

            <a
              href="/engine"
              className="group border border-[#232A3B] hover:border-[#38BDF8]/60 bg-[#131822] rounded-lg p-5 flex flex-col justify-between gap-5 transition-colors"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs font-mono text-[#94A3B8]">
                  <span>ZONE 02 · /engine</span>
                  <Cpu className="w-4 h-4 text-[#38BDF8]" />
                </div>
                <h3 className="text-base font-semibold text-white group-hover:text-[#38BDF8] transition-colors">
                  純程式引擎區
                </h3>
                <p className="text-xs text-[#94A3B8] leading-relaxed">
                  多檔 TypeScript 編輯器、Godot 式 Scene Tree 與 Inspector 雙向回寫、無頭試跑診斷與 MCP 熱更新工作台。
                </p>
              </div>
              <div className="pt-3 border-t border-[#232A3B] flex items-center justify-between text-xs text-[#38BDF8]">
                <span>啟動引擎 IDE</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </a>

            <a
              href="/play"
              className="group border border-[#232A3B] hover:border-[#4ADE80]/80 bg-[#131822] rounded-lg p-5 flex flex-col justify-between gap-5 transition-colors"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs font-mono text-[#94A3B8]">
                  <span>ZONE 03 · /play</span>
                  <Gamepad2 className="w-4 h-4 text-[#4ADE80]" />
                </div>
                <h3 className="text-base font-semibold text-white group-hover:text-[#4ADE80] transition-colors">
                  獨立遊戲遊玩區
                </h3>
                <p className="text-xs text-[#94A3B8] leading-relaxed">
                  純淨大尺寸 16:9 劇院像素畫布，預設關閉除錯線框並即時同步引擎修改與 MCP SSE 熱更新，一鍵切回調參。
                </p>
              </div>
              <div className="pt-3 border-t border-[#232A3B] flex items-center justify-between text-xs text-[#4ADE80]">
                <span>大螢幕直接開玩</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </a>

            <a
              href="/archive"
              className="group border border-[#232A3B] hover:border-[#D4AF37]/70 bg-[#131822] rounded-lg p-5 flex flex-col justify-between gap-5 transition-colors"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs font-mono text-[#94A3B8]">
                  <span>ZONE 04 · /archive</span>
                  <Database className="w-4 h-4 text-[#D4AF37]" />
                </div>
                <h3 className="text-base font-semibold text-white group-hover:text-[#D4AF37] transition-colors">
                  文物歷史稽核庫
                </h3>
                <p className="text-xs text-[#94A3B8] leading-relaxed">
                  自動化程式碼與著色器管線檢測、色盤鎖定稽核、版本差異 LCS 比對與策展技術檔案存證。
                </p>
              </div>
              <div className="pt-3 border-t border-[#232A3B] flex items-center justify-between text-xs font-mono tabular-nums text-[#CBD5E1]">
                <span>
                  典藏：{artifactCount ?? '—'} 筆 · 最新 {latestTag}
                </span>
                <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </a>
          </div>
        </section>

        {/* Engine Preset Cartridge Launcher */}
        <section className="space-y-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold text-white">02. 純程式遊戲卡匣啟動器</h2>
            <span className="text-xs font-mono text-[#94A3B8]">可選擇直入 /play 大螢幕遊玩或 /engine 檢視腳本</span>
          </div>

          <div className="border border-[#232A3B] bg-[#131822] rounded-lg divide-y divide-[#232A3B]">
            {ENGINE_PRESETS.map((preset) => (
              <div
                key={preset.id}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-[#171D29] transition-colors"
              >
                <div className="space-y-1 min-w-0">
                  <div className="text-sm font-medium text-white">{preset.title}</div>
                  <div className="text-xs text-[#94A3B8]">{preset.summary}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
                  <a
                    href={`/play?preset=${encodeURIComponent(preset.id)}`}
                    className="px-3.5 py-1.5 text-xs font-semibold bg-[#16A34A] hover:bg-[#15803D] text-white rounded transition-colors whitespace-nowrap inline-flex items-center gap-1.5"
                  >
                    開始遊玩
                    <ArrowRight className="w-3 h-3" />
                  </a>
                  <a
                    href={`/engine?preset=${encodeURIComponent(preset.id)}`}
                    className="px-3.5 py-1.5 text-xs font-mono bg-[#1E293B] hover:bg-[#293548] text-white rounded transition-colors whitespace-nowrap inline-flex items-center gap-1.5"
                  >
                    引擎編輯
                    <ArrowRight className="w-3 h-3" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

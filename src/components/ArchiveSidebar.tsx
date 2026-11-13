import { Search, Lock } from 'lucide-react';
import type { ArtifactRecord } from '../types/artifact';

interface ArchiveSidebarProps {
  artifacts: ArtifactRecord[];
  selectedId: string | null;
  searchQuery: string;
  categoryFilter: string;
  onSearchChange: (q: string) => void;
  onCategoryChange: (cat: string) => void;
  onSelectArtifact: (id: string) => void;
}

export function ArchiveSidebar({
  artifacts,
  selectedId,
  searchQuery,
  categoryFilter,
  onSearchChange,
  onCategoryChange,
  onSelectArtifact,
}: ArchiveSidebarProps) {
  const categories = ['全部', ...Array.from(new Set(artifacts.map((a) => a.technicalReport.category)))];

  const filtered = artifacts.filter((item) => {
    const matchesCat = categoryFilter === '全部' || item.technicalReport.category === categoryFilter;
    const q = searchQuery.trim().toLowerCase();
    if (!q) return matchesCat;
    return (
      matchesCat &&
      (item.title.toLowerCase().includes(q) ||
        item.accessionId.toLowerCase().includes(q) ||
        item.originFileName.toLowerCase().includes(q) ||
        item.technicalReport.engineType.toLowerCase().includes(q))
    );
  });

  return (
    <aside className="w-full lg:w-[300px] shrink-0 border-b lg:border-b-0 lg:border-r border-[#2A2C38] bg-[#121319] flex flex-col">
      <div className="p-5 border-b border-[#2A2C38] space-y-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xs font-medium tracking-widest uppercase text-[#9E998E]">
            典藏索引目錄
          </h2>
          <span className="font-mono text-xs tabular-nums text-[#D4AF37]">
            {artifacts.length} 件存檔
          </span>
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 text-[#78746C] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="搜尋編號、名稱或引擎..."
            aria-label="搜尋文物典藏"
            className="w-full bg-[#0D0D11] border border-[#2A2C38] text-sm text-[#F3EFE6] placeholder-[#67635C] pl-9 pr-3 py-2 focus:outline-none focus:border-[#D4AF37] transition-colors"
          />
        </div>

        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="文物分類篩選">
          {categories.map((cat) => {
            const active = categoryFilter === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => onCategoryChange(cat)}
                className={`px-2.5 py-1 text-xs whitespace-nowrap transition-colors cursor-pointer border ${
                  active
                    ? 'bg-[#D4AF37]/15 border-[#D4AF37] text-[#F3EFE6]'
                    : 'bg-transparent border-[#2A2C38] text-[#9E998E] hover:text-[#F3EFE6] hover:border-[#3D4052]'
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-[#2A2C38]">
        {filtered.length === 0 ? (
          <div className="p-6 text-center text-sm text-[#78746C]">
            沒有符合條件的歷史文物紀錄。
          </div>
        ) : (
          filtered.map((item) => {
            const isSelected = item.id === selectedId;
            const warnCount = item.technicalReport.findings.filter(
              (f) => f.severity === 'warning' || f.severity === 'critical',
            ).length;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectArtifact(item.id)}
                className={`w-full text-left p-4 transition-colors cursor-pointer block focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D4AF37] ${
                  isSelected
                    ? 'bg-[#1B1D26]'
                    : 'bg-transparent hover:bg-[#161820]'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2 min-w-0 font-mono text-xs tabular-nums">
                    <span className={isSelected ? 'text-[#D4AF37]' : 'text-[#9E998E]'}>
                      {item.accessionId}
                    </span>
                    {item.versionTag && (
                      <>
                        <span aria-hidden="true" className="text-[#5A5751]">·</span>
                        <span className="text-[#78746C] truncate">{item.versionTag}</span>
                      </>
                    )}
                  </div>
                  {item.locked && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-[#78746C] shrink-0">
                      <Lock className="w-3 h-3" aria-hidden="true" />
                      核心典藏
                    </span>
                  )}
                </div>

                <div className="font-serif text-base font-medium text-[#F3EFE6] leading-snug mb-2 line-clamp-2">
                  {item.title}
                </div>

                <div className="flex items-center gap-2 text-xs text-[#8D887E] font-mono tabular-nums flex-wrap">
                  <span>{item.technicalReport.metrics.lineCount} 行</span>
                  <span aria-hidden="true">·</span>
                  <span>{item.technicalReport.metrics.paletteColorCount} 色</span>
                  <span aria-hidden="true">·</span>
                  <span className={warnCount > 0 ? 'text-[#F59E0B]' : 'text-[#34D399]'}>
                    {warnCount > 0 ? `${warnCount} 項警示` : '稽核通過'}
                  </span>
                </div>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}

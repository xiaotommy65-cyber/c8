/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState } from 'react';
import { Plus, AlertTriangle, RefreshCw } from 'lucide-react';
import type { ArtifactRecord, ArtifactWithSource } from './types/artifact';
import { ArchiveSidebar } from './components/ArchiveSidebar';
import { ArtifactDossier, type DossierTab } from './components/ArtifactDossier';
import { AddArtifactModal } from './components/AddArtifactModal';
import { VersionDiffView } from './components/VersionDiffView';
import { SnapshotModal } from './components/SnapshotModal';
import { EngineWorkbench } from './components/EngineWorkbench';
import { GamePlayZone } from './components/GamePlayZone';
import { LobbyHub } from './components/LobbyHub';

type ArchiveViewMode = DossierTab | 'diff';

export default function App() {
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
  if (pathname === '/play' || pathname.startsWith('/play/')) {
    return <GamePlayZone />;
  }
  if (pathname === '/engine' || pathname.startsWith('/engine/')) {
    return <EngineWorkbench />;
  }
  if (pathname === '/archive' || pathname.startsWith('/archive/')) {
    return <ArchiveApp />;
  }
  return <LobbyHub />;
}

function ArchiveApp() {
  const [artifacts, setArtifacts] = useState<ArtifactRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeArtifact, setActiveArtifact] = useState<ArtifactWithSource | null>(null);
  const [activeView, setActiveView] = useState<ArchiveViewMode>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('全部');

  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [reinspecting, setReinspecting] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSnapshotModalOpen, setIsSnapshotModalOpen] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((prev) => (prev === msg ? null : prev));
    }, 2800);
  }, []);

  const fetchArtifactDetail = useCallback(async (id: string) => {
    setLoadingDetail(true);
    setErrorBanner(null);
    try {
      const res = await fetch(`/api/artifacts/${encodeURIComponent(id)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '讀取文物詳細檔案失敗');
      setActiveArtifact(data.artifact);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : '無法讀取文物詳細資料');
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  const loadArchiveList = useCallback(
    async (preferredId?: string) => {
      setLoadingList(true);
      setErrorBanner(null);
      try {
        const res = await fetch('/api/artifacts');
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '無法取得歷史數據庫清單');
        const list: ArtifactRecord[] = data.artifacts ?? [];
        setArtifacts(list);

        const targetId =
          preferredId && list.some((item) => item.id === preferredId)
            ? preferredId
            : list[0]?.id ?? null;

        setSelectedId(targetId);
        if (targetId) {
          await fetchArtifactDetail(targetId);
        } else {
          setActiveArtifact(null);
        }
      } catch (err) {
        setErrorBanner(err instanceof Error ? err.message : '連線歷史數據庫失敗');
      } finally {
        setLoadingList(false);
      }
    },
    [fetchArtifactDetail],
  );

  useEffect(() => {
    loadArchiveList();
  }, [loadArchiveList]);

  const handleSelectArtifact = (id: string) => {
    if (activeView === 'diff') {
      setActiveView('overview');
    }
    if (id === selectedId && activeArtifact) return;
    setSelectedId(id);
    fetchArtifactDetail(id);
  };

  const handleReinspect = async (id: string) => {
    setReinspecting(true);
    setErrorBanner(null);
    try {
      const res = await fetch(`/api/artifacts/${encodeURIComponent(id)}/reinspect`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '重新檢測失敗');
      setActiveArtifact(data.artifact);
      setArtifacts((prev) =>
        prev.map((item) => (item.id === id ? data.artifact : item)),
      );
      showToast('已完成最新技術檢測並更新數據庫存檔');
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : '重新檢測時發生錯誤');
    } finally {
      setReinspecting(false);
    }
  };

  const handleAddNote = async (id: string, author: string, content: string) => {
    const res = await fetch(`/api/artifacts/${encodeURIComponent(id)}/notes`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ author, content }),
    });
    const data = await res.json();
    if (!res.ok) {
      setErrorBanner(data.error || '寫入附註失敗');
      return;
    }
    setActiveArtifact((prev) =>
      prev && prev.id === id
        ? { ...prev, curatorialNotes: data.artifact.curatorialNotes }
        : prev,
    );
    setArtifacts((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, curatorialNotes: data.artifact.curatorialNotes } : item,
      ),
    );
    showToast('策展附註已存檔至歷史數據庫');
  };

  const handleDeleteNote = async (id: string, noteId: string) => {
    const res = await fetch(
      `/api/artifacts/${encodeURIComponent(id)}/notes/${encodeURIComponent(noteId)}`,
      { method: 'DELETE' },
    );
    const data = await res.json();
    if (!res.ok) {
      setErrorBanner(data.error || '刪除附註失敗');
      return;
    }
    setActiveArtifact((prev) =>
      prev && prev.id === id
        ? { ...prev, curatorialNotes: data.artifact.curatorialNotes }
        : prev,
    );
    showToast('已移除該則附註');
  };

  const handleDeleteArtifact = async (id: string) => {
    const res = await fetch(`/api/artifacts/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    const data = await res.json();
    if (!res.ok) {
      setErrorBanner(data.error || '刪除存檔失敗');
      return;
    }
    showToast('已從歷史數據庫移除該筆存檔');
    await loadArchiveList();
  };

  const handleArchivedNew = async (newRecord: ArtifactRecord) => {
    showToast(`已歸檔為 ${newRecord.accessionId}`);
    await loadArchiveList(newRecord.id);
    setActiveView('overview');
  };

  const handleSnapshotCaptured = async (snapshot: ArtifactRecord) => {
    showToast(`已建立前台快照 ${snapshot.accessionId} (${snapshot.versionTag})`);
    await loadArchiveList(snapshot.id);
    setActiveView('diff');
  };

  return (
    <div className="min-h-screen bg-[#0D0D11] text-[#F3EFE6] flex flex-col">
      {/* Unified Cross-Zone Hierarchy Strip */}
      <div className="border-b border-[#2A2C38] bg-[#0B0E14] px-6 py-2 flex items-center justify-between gap-4 text-xs text-[#94A3B8]">
        <div className="flex items-center gap-5 overflow-x-auto">
          <a href="/" className="hover:text-white transition-colors whitespace-nowrap shrink-0">
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
          <a href="/archive" className="text-[#D4AF37] font-medium whitespace-nowrap shrink-0">
            文物歷史庫
          </a>
        </div>
        <span className="font-mono text-[11px] text-[#64748B] whitespace-nowrap hidden sm:inline">
          ChronoForge Suite · Archive Audit Zone
        </span>
      </div>

      {/* Strict 3-Zone Top Bar Contract */}
      <header className="border-b border-[#2A2C38] bg-[#111218] px-6 py-3.5 flex items-center justify-between gap-8">
        <a
          href="/archive"
          onClick={(e) => {
            e.preventDefault();
            setActiveView('overview');
          }}
          className="font-serif text-lg font-medium tracking-tight text-[#F3EFE6] whitespace-nowrap shrink-0"
        >
          文物區歷史數據庫
        </a>

        <nav className="hidden md:flex items-center gap-6 text-sm text-[#9E998E]" aria-label="後台導覽">
          {(
            [
              ['overview', '技術總覽'],
              ['audit', '稽核檢測'],
              ['palette', '色盤規格'],
              ['sandbox', '即時展台'],
              ['diff', '版本對比'],
            ] as Array<[ArchiveViewMode, string]>
          ).map(([viewKey, label]) => (
            <button
              key={viewKey}
              type="button"
              onClick={() => setActiveView(viewKey)}
              className={`whitespace-nowrap shrink-0 cursor-pointer transition-colors pb-0.5 border-b ${
                activeView === viewKey
                  ? 'text-[#F3EFE6] border-[#D4AF37]'
                  : 'border-transparent hover:text-[#F3EFE6]'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="shrink-0">
          <button
            type="button"
            onClick={() => setIsAddModalOpen(true)}
            className="px-4 py-2 text-xs font-medium text-[#0D0D11] bg-[#D4AF37] hover:bg-[#E2BF4E] cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            新增文物檢測
          </button>
        </div>
      </header>

      {errorBanner && (
        <div className="bg-[#EF4444]/10 border-b border-[#EF4444]/40 px-6 py-2.5 flex items-center justify-between gap-4 text-sm text-[#FCA5A5]">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => loadArchiveList(selectedId ?? undefined)}
            className="text-xs underline cursor-pointer whitespace-nowrap"
          >
            重新載入
          </button>
        </div>
      )}

      {/* Main 1440px Museum Backstage Workspace */}
      <div className="flex-1 w-full max-w-[1440px] mx-auto flex flex-col lg:flex-row border-x border-[#2A2C38]/60">
        <ArchiveSidebar
          artifacts={artifacts}
          selectedId={selectedId}
          searchQuery={searchQuery}
          categoryFilter={categoryFilter}
          onSearchChange={setSearchQuery}
          onCategoryChange={setCategoryFilter}
          onSelectArtifact={handleSelectArtifact}
        />

        <main className="flex-1 min-w-0 flex flex-col">
          {loadingList ? (
            <div className="p-10 space-y-6">
              <div className="h-4 w-40 bg-[#1B1D26]" />
              <div className="h-9 w-2/3 bg-[#1B1D26]" />
              <div className="h-48 bg-[#15161D] border border-[#2A2C38]" />
            </div>
          ) : activeView === 'diff' ? (
            <VersionDiffView artifacts={artifacts} />
          ) : loadingDetail ? (
            <div className="p-10 space-y-6">
              <div className="h-4 w-40 bg-[#1B1D26]" />
              <div className="h-9 w-2/3 bg-[#1B1D26]" />
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 pt-4">
                <div className="h-20 bg-[#15161D] border border-[#2A2C38]" />
                <div className="h-20 bg-[#15161D] border border-[#2A2C38]" />
                <div className="h-20 bg-[#15161D] border border-[#2A2C38]" />
                <div className="h-20 bg-[#15161D] border border-[#2A2C38]" />
              </div>
              <div className="h-48 bg-[#15161D] border border-[#2A2C38]" />
            </div>
          ) : activeArtifact ? (
            <ArtifactDossier
              artifact={activeArtifact}
              activeTab={activeView}
              onTabChange={(tab) => setActiveView(tab)}
              onReinspect={handleReinspect}
              onOpenSnapshotModal={() => setIsSnapshotModalOpen(true)}
              onAddNote={handleAddNote}
              onDeleteNote={handleDeleteNote}
              onDeleteArtifact={handleDeleteArtifact}
              reinspecting={reinspecting}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center space-y-4">
              <p className="font-serif text-xl text-[#F3EFE6]">歷史數據庫尚無文物存檔</p>
              <p className="text-sm text-[#9E998E] max-w-md">
                點擊右上角「新增文物檢測」上傳 HTML 數位作品，系統將立即執行管線分析並建立典藏檔案。
              </p>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => loadArchiveList()}
                  className="px-4 py-2 text-xs text-[#F3EFE6] border border-[#2A2C38] cursor-pointer inline-flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  重新讀取
                </button>
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(true)}
                  className="px-4 py-2 text-xs font-medium text-[#0D0D11] bg-[#D4AF37] cursor-pointer"
                >
                  新增文物檢測
                </button>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Toast Confirmation */}
      {toastMsg && (
        <div
          role="status"
          className="fixed bottom-5 right-5 z-50 bg-[#1B1D26] border border-[#D4AF37] px-4 py-2.5 text-sm text-[#F3EFE6] shadow-lg"
        >
          {toastMsg}
        </div>
      )}

      <AddArtifactModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onArchived={handleArchivedNew}
      />

      <SnapshotModal
        isOpen={isSnapshotModalOpen}
        onClose={() => setIsSnapshotModalOpen(false)}
        onCaptured={handleSnapshotCaptured}
      />
    </div>
  );
}

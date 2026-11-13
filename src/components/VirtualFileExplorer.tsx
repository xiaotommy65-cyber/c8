import { useState } from 'react';
import { FileCode2, FolderTree, Plus, Trash2, Download } from 'lucide-react';
import type { VirtualProjectFile } from '../engine/types';

interface VirtualFileExplorerProps {
  files: VirtualProjectFile[];
  activePath: string;
  errorFile?: string | null;
  onSelectFile: (path: string) => void;
  onAddFile: (path: string) => void;
  onDeleteFile: (path: string) => void;
  onExportProjectJson: () => void;
}

export function VirtualFileExplorer({
  files,
  activePath,
  errorFile,
  onSelectFile,
  onAddFile,
  onDeleteFile,
  onExportProjectJson,
}: VirtualFileExplorerProps) {
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);

  const handleCreate = () => {
    const clean = draftName.trim().replace(/^\.\//, '');
    if (!clean) {
      setNameError('請輸入檔名');
      return;
    }
    const finalPath = clean.endsWith('.ts') ? clean : `${clean}.ts`;
    if (files.some((f) => f.path === finalPath)) {
      setNameError('檔案名稱重複');
      return;
    }
    onAddFile(finalPath);
    setDraftName('');
    setNameError(null);
    setCreating(false);
  };

  return (
    <aside className="w-[196px] shrink-0 border-r border-[#232A3B] bg-[#0B0E14] flex flex-col">
      <div className="h-9 px-3 border-b border-[#1E2536] flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#CBD5E1] whitespace-nowrap">
          <FolderTree className="w-3.5 h-3.5 text-[#38BDF8]" />
          虛擬模組樹
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            title="新增虛擬模組"
            onClick={() => {
              setCreating((v) => !v);
              setNameError(null);
            }}
            className="p-1 text-[#94A3B8] hover:text-white rounded transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            title="匯出多檔專案包 (.json)"
            onClick={onExportProjectJson}
            className="p-1 text-[#94A3B8] hover:text-white rounded transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {creating && (
        <div className="p-2 border-b border-[#1E2536] bg-[#10141D] space-y-1.5">
          <input
            type="text"
            value={draftName}
            onChange={(e) => {
              setDraftName(e.target.value);
              setNameError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate();
              if (e.key === 'Escape') setCreating(false);
            }}
            placeholder="fx.particles.ts"
            className="w-full px-2 py-1 text-[11px] font-mono bg-[#0B0E14] border border-[#2D374E] rounded text-white focus:outline-none focus:border-[#38BDF8]"
          />
          {nameError && <div className="text-[10px] text-[#F87171]">{nameError}</div>}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleCreate}
              className="flex-1 py-1 text-[11px] font-medium bg-[#16A34A] hover:bg-[#15803D] text-white rounded cursor-pointer"
            >
              建立
            </button>
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="px-2 py-1 text-[11px] text-[#94A3B8] hover:text-white rounded cursor-pointer"
            >
              取消
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto py-1">
        {files.map((file) => {
          const isActive = file.path === activePath;
          const isError = errorFile === file.path;
          return (
            <div
              key={file.path}
              className={`group h-8 px-2.5 flex items-center justify-between gap-1 text-xs transition-colors ${
                isActive
                  ? 'bg-[#161F30] text-white'
                  : 'text-[#94A3B8] hover:bg-[#111622] hover:text-[#E2E8F0]'
              }`}
            >
              <button
                type="button"
                onClick={() => onSelectFile(file.path)}
                className="flex-1 min-w-0 flex items-center gap-1.5 text-left cursor-pointer"
              >
                <FileCode2
                  className={`w-3.5 h-3.5 shrink-0 ${
                    isError
                      ? 'text-[#F87171]'
                      : file.kind === 'entry'
                        ? 'text-[#4ADE80]'
                        : 'text-[#38BDF8]'
                  }`}
                />
                <span className="font-mono text-[11px] truncate">{file.path}</span>
              </button>

              <div className="flex items-center gap-1 shrink-0">
                {file.kind === 'entry' ? (
                  <span className="font-mono text-[10px] text-[#4ADE80]">入口</span>
                ) : (
                  files.length > 1 && (
                    <button
                      type="button"
                      title="刪除模組"
                      onClick={() => onDeleteFile(file.path)}
                      className="opacity-0 group-hover:opacity-100 p-0.5 text-[#64748B] hover:text-[#F87171] transition-opacity cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="p-2.5 border-t border-[#1E2536] text-[10px] font-mono text-[#64748B] leading-relaxed">
        支援 TypeScript 型別與跨檔 <span className="text-[#38BDF8]">import / export</span>
      </div>
    </aside>
  );
}

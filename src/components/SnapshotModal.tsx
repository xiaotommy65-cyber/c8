import { useState } from 'react';
import { X, Camera, AlertTriangle } from 'lucide-react';
import type { ArtifactRecord } from '../types/artifact';

interface SnapshotModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCaptured: (record: ArtifactRecord) => void;
}

export function SnapshotModal({ isOpen, onClose, onCaptured }: SnapshotModalProps) {
  const [versionTag, setVersionTag] = useState('v1.2.0-snapshot');
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCapture = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/artifacts/snapshot-live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          versionTag: versionTag.trim(),
          title: title.trim(),
          note: note.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '擷取前台快照失敗');
      onCaptured(data.artifact);
      setTitle('');
      setNote('');
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '無法建立前台快照');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="snapshot-modal-title"
    >
      <form
        onSubmit={handleCapture}
        className="w-full max-w-lg bg-[#15161D] border border-[#2A2C38] flex flex-col"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#2A2C38]">
          <h2 id="snapshot-modal-title" className="font-serif text-lg text-[#F3EFE6]">
            擷取現行前台版本快照並存檔
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="關閉視窗"
            className="p-1.5 text-[#9E998E] hover:text-[#F3EFE6] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-[#9E998E] leading-relaxed">
            系統將直接讀取目前前台（/）所服務的最新《翠風遊俠精靈圖工作室》原始碼，自動執行技術檢測並建立獨立的歷史快照版本供日後對比。
          </p>

          <div>
            <label className="block text-xs text-[#9E998E] mb-1.5" htmlFor="snap-version-tag">
              版本標籤（Version Tag）
            </label>
            <input
              id="snap-version-tag"
              type="text"
              value={versionTag}
              onChange={(e) => setVersionTag(e.target.value)}
              placeholder="例如：v1.2.0-brush-tool"
              className="w-full bg-[#0D0D11] border border-[#2A2C38] px-3 py-2 font-mono text-sm text-[#F3EFE6] focus:outline-none focus:border-[#D4AF37]"
            />
          </div>

          <div>
            <label className="block text-xs text-[#9E998E] mb-1.5" htmlFor="snap-title">
              快照標題（留空則自動帶入版本號）
            </label>
            <input
              id="snap-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：翠風遊俠 // 新增像素畫筆前基準"
              className="w-full bg-[#0D0D11] border border-[#2A2C38] px-3 py-2 text-sm text-[#F3EFE6] focus:outline-none focus:border-[#D4AF37]"
            />
          </div>

          <div>
            <label className="block text-xs text-[#9E998E] mb-1.5" htmlFor="snap-note">
              修訂紀錄附註（選填）
            </label>
            <input
              id="snap-note"
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="紀錄此次變更的目的與測試項目..."
              className="w-full bg-[#0D0D11] border border-[#2A2C38] px-3 py-2 text-sm text-[#F3EFE6] focus:outline-none focus:border-[#D4AF37]"
            />
          </div>

          {errorMsg && (
            <div className="p-3 border border-[#EF4444]/40 bg-[#EF4444]/10 text-sm text-[#FCA5A5] flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-[#2A2C38] bg-[#121319] flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-[#9E998E] border border-[#2A2C38] cursor-pointer"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-[#0D0D11] bg-[#D4AF37] hover:bg-[#E2BF4E] disabled:opacity-40 cursor-pointer inline-flex items-center gap-2"
          >
            <Camera className="w-4 h-4" />
            {saving ? '快照歸檔中...' : '確認擷取並歸檔'}
          </button>
        </div>
      </form>
    </div>
  );
}

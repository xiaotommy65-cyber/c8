import { useState } from 'react';
import { X, Upload, FileSearch, Archive, AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { ArtifactRecord, TechnicalReport } from '../types/artifact';

interface AddArtifactModalProps {
  isOpen: boolean;
  onClose: () => void;
  onArchived: (newArtifact: ArtifactRecord) => void;
}

export function AddArtifactModal({ isOpen, onClose, onArchived }: AddArtifactModalProps) {
  const [fileName, setFileName] = useState('');
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [htmlContent, setHtmlContent] = useState('');
  const [previewReport, setPreviewReport] = useState<TechnicalReport | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setErrorMsg(null);
    setPreviewReport(null);

    const reader = new FileReader();
    reader.onload = () => {
      const content = typeof reader.result === 'string' ? reader.result : '';
      setHtmlContent(content);
      const titleMatch = content.match(/<title>([^<]+)<\/title>/i);
      if (titleMatch && !title) {
        setTitle(titleMatch[1].trim());
      }
    };
    reader.onerror = () => {
      setErrorMsg('讀取本地檔案失敗，請確認檔案格式為 UTF-8 HTML。');
    };
    reader.readAsText(file);
  };

  const handleAnalyze = async () => {
    if (!htmlContent.trim()) {
      setErrorMsg('請先上傳 HTML 檔案或貼上原始碼內容。');
      return;
    }
    setAnalyzing(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/artifacts/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          htmlContent,
          fileName: fileName || 'custom_artifact.html',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '技術檢測失敗');
      }
      setPreviewReport(data.report);
      if (!title.trim() && data.report?.detectedTitle) {
        setTitle(data.report.detectedTitle);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '執行檢測時發生未知錯誤');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSaveToArchive = async () => {
    if (!htmlContent.trim()) {
      setErrorMsg('請先提供 HTML 原始碼內容。');
      return;
    }
    setSaving(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/artifacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          htmlContent,
          fileName: fileName || 'custom_artifact.html',
          title: title.trim(),
          note: note.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '存檔失敗');
      }
      onArchived(data.artifact);
      setFileName('');
      setTitle('');
      setNote('');
      setHtmlContent('');
      setPreviewReport(null);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '存檔至歷史數據庫失敗');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-artifact-heading"
    >
      <div className="w-full max-w-3xl bg-[#15161D] border border-[#2A2C38] max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#2A2C38]">
          <div>
            <h2 id="add-artifact-heading" className="font-serif text-xl text-[#F3EFE6]">
              新增數位文物技術檢測與存檔
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="關閉視窗"
            className="p-2 text-[#9E998E] hover:text-[#F3EFE6] cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-[#9E998E] mb-1.5" htmlFor="artifact-title-input">
                典藏名稱
              </label>
              <input
                id="artifact-title-input"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例如：像素水波紋著色器實驗 v1"
                className="w-full bg-[#0D0D11] border border-[#2A2C38] px-3 py-2 text-sm text-[#F3EFE6] placeholder-[#67635C] focus:outline-none focus:border-[#D4AF37]"
              />
            </div>

            <div>
              <label className="block text-xs text-[#9E998E] mb-1.5" htmlFor="artifact-file-upload">
                上傳 HTML 文物檔
              </label>
              <label
                htmlFor="artifact-file-upload"
                className="flex items-center justify-between bg-[#0D0D11] border border-[#2A2C38] hover:border-[#D4AF37] px-3 py-2 text-sm text-[#F3EFE6] cursor-pointer transition-colors"
              >
                <span className="truncate text-[#9E998E]">
                  {fileName || '選擇 .html 或 .htm 檔案...'}
                </span>
                <Upload className="w-4 h-4 text-[#D4AF37] shrink-0 ml-2" />
                <input
                  id="artifact-file-upload"
                  type="file"
                  accept=".html,.htm,text/html"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs text-[#9E998E] mb-1.5" htmlFor="artifact-source-textarea">
              HTML 原始碼（上傳檔案後自動帶入，或直接貼上）
            </label>
            <textarea
              id="artifact-source-textarea"
              rows={8}
              value={htmlContent}
              onChange={(e) => {
                setHtmlContent(e.target.value);
                setPreviewReport(null);
              }}
              placeholder="<!DOCTYPE html>..."
              className="w-full bg-[#0D0D11] border border-[#2A2C38] p-3 font-mono text-xs text-[#D6D2C9] placeholder-[#5A5751] focus:outline-none focus:border-[#D4AF37]"
            />
          </div>

          <div>
            <label className="block text-xs text-[#9E998E] mb-1.5" htmlFor="artifact-note-input">
              初始策展鑑定附註（選填）
            </label>
            <input
              id="artifact-note-input"
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="紀錄來源脈絡、測試環境或觀察重點..."
              className="w-full bg-[#0D0D11] border border-[#2A2C38] px-3 py-2 text-sm text-[#F3EFE6] placeholder-[#67635C] focus:outline-none focus:border-[#D4AF37]"
            />
          </div>

          {errorMsg && (
            <div className="p-3 border border-[#EF4444]/50 bg-[#EF4444]/10 text-sm text-[#FCA5A5] flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {previewReport && (
            <div className="border border-[#2A2C38] bg-[#0D0D11] p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-[#2A2C38] pb-2">
                <span className="text-xs font-medium text-[#34D399] inline-flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  預檢報告完成
                </span>
                <span className="font-mono text-xs text-[#9E998E] tabular-nums">
                  {previewReport.category} · {previewReport.metrics.lineCount} 行 · {previewReport.metrics.paletteColorCount} 色
                </span>
              </div>
              <p className="text-sm text-[#D6D2C9] leading-relaxed">{previewReport.summary}</p>
              <div className="text-xs text-[#9E998E] font-mono tabular-nums">
                偵測到 {previewReport.findings.length} 項稽核項目，{previewReport.metrics.functionCount} 個函式，{previewReport.metrics.canvasCount} 個畫布元件。
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-[#2A2C38] flex flex-wrap items-center justify-end gap-3 bg-[#121319]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-[#9E998E] hover:text-[#F3EFE6] border border-[#2A2C38] cursor-pointer transition-colors"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={analyzing || !htmlContent.trim()}
            className="px-4 py-2 text-sm text-[#F3EFE6] bg-[#1E202B] hover:bg-[#272A38] border border-[#3A3E52] disabled:opacity-40 cursor-pointer inline-flex items-center gap-2 transition-colors"
          >
            <FileSearch className="w-4 h-4 text-[#D4AF37]" />
            {analyzing ? '檢測中...' : '執行技術檢測'}
          </button>
          <button
            type="button"
            onClick={handleSaveToArchive}
            disabled={saving || !htmlContent.trim()}
            className="px-4 py-2 text-sm font-medium text-[#0D0D11] bg-[#D4AF37] hover:bg-[#E2BF4E] disabled:opacity-40 cursor-pointer inline-flex items-center gap-2 transition-colors"
          >
            <Archive className="w-4 h-4" />
            {saving ? '存檔中...' : '寫入歷史數據庫存檔'}
          </button>
        </div>
      </div>
    </div>
  );
}

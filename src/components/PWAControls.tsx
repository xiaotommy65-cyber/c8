import { useState } from 'react';
import { Download, Share, Smartphone, WifiOff, X } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  compact?: boolean;
  className?: string;
}

export function PWAInstallButton({ compact = false, className = '' }: PWAInstallButtonProps) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#16A34A] hover:bg-[#15803D] text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${className}`}
      >
        <Download className="w-3.5 h-3.5" aria-hidden="true" />
        {compact ? '安裝 App' : '安裝橫版掌機 App'}
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-black/20 bg-black/[0.06] hover:bg-black/[0.12] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${className}`}
        >
          <Smartphone className="w-3.5 h-3.5" aria-hidden="true" />
          加入主畫面
        </button>

        {showIOSGuide && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ios-pwa-guide-title"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-xs p-4"
          >
            <div className="w-full max-w-sm rounded-2xl bg-[#161922] border border-[#2A3142] p-5 text-[#E2E8F0] shadow-2xl space-y-4">
              <div className="flex items-start justify-between gap-3">
                <h3 id="ios-pwa-guide-title" className="text-base font-semibold text-white">
                  安裝 iPhone / iPad 橫版掌機
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  aria-label="關閉視窗"
                  className="p-1 text-[#94A3B8] hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <ol className="space-y-2.5 text-sm text-[#CBD5E1] list-decimal pl-5 leading-relaxed">
                <li>
                  點擊 Safari 工具列的 <span className="inline-flex items-center gap-1 font-semibold text-white"><Share className="w-3.5 h-3.5" /> 分享</span> 按鈕。
                </li>
                <li>向下捲動並選擇「加入主畫面」。</li>
                <li>從桌面圖示開啟，即可全螢幕橫向啟動 ChronoPocket。</li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full py-2.5 rounded-xl bg-[#16A34A] hover:bg-[#15803D] text-white text-xs font-semibold cursor-pointer transition-colors"
              >
                我知道了
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
}

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      className="fixed bottom-3 left-3 z-50 flex items-center gap-2 rounded-lg bg-[#92400E] border border-[#F59E0B]/40 px-3 py-1.5 text-xs font-medium text-[#FEF3C7] shadow-lg"
    >
      <WifiOff className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      離線掌機模式 · 本機卡匣可正常遊玩
    </div>
  );
}

import React, { useState } from 'react';
import { Download, WifiOff, X } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from './usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[13px] font-medium text-[#1A1A19] dark:text-[#F2F0EA] hover:bg-[#ECECE9] dark:hover:bg-[#1F1F1D] transition-colors whitespace-nowrap cursor-pointer"
      >
        <Download className="w-3.5 h-3.5 text-[#C2934B]" aria-hidden="true" />
        <span>Install App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[13px] text-[#5C5B57] dark:text-[#A5A39B] hover:bg-[#ECECE9] dark:hover:bg-[#1F1F1D] transition-colors whitespace-nowrap cursor-pointer"
        >
          <Download className="w-3.5 h-3.5 text-[#8A8984]" aria-hidden="true" />
          <span>Install iOS</span>
        </button>

        {showIOSGuide && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ios-pwa-title"
          >
            <div className="w-full max-w-sm rounded-xl border border-[#E7E6E2] dark:border-[#2A2A28] bg-white dark:bg-[#181817] p-5">
              <div className="flex items-center justify-between border-b border-[#F1F1EE] dark:border-[#242422] pb-3">
                <h3 id="ios-pwa-title" className="text-sm font-semibold">
                  Install Offline Field App
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  aria-label="Close installation guide"
                  className="p-1 text-[#8A8984] hover:text-[#1A1A19]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <ol className="mt-3 space-y-2 text-xs text-[#5C5B57] dark:text-[#A5A39B]">
                <li>1. Tap the Share button in Safari toolbar.</li>
                <li>2. Select &ldquo;Add to Home Screen&rdquo;.</li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-4 w-full rounded-lg bg-[#1A1A19] dark:bg-[#F2F0EA] text-white dark:text-[#111110] py-2 text-xs font-medium"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div
      role="status"
      className="fixed bottom-4 left-4 z-50 inline-flex items-center gap-2 rounded-lg border border-[#E7E6E2] bg-white dark:bg-[#181817] px-3 py-1.5 text-xs text-[#B45309] shadow-sm"
    >
      <WifiOff className="w-3.5 h-3.5" aria-hidden="true" />
      <span>Offline Field Mode — Cached PWA Active</span>
    </div>
  );
};

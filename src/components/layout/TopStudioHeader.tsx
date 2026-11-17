import React from 'react';
import { Columns2, ExternalLink, Menu, Radio } from 'lucide-react';
import { RfLinkAnalysis } from '@/src/lib/geodesic/rf';
import { WorkspaceId } from './SidebarNav';

interface TopStudioHeaderProps {
  activeWorkspace: WorkspaceId;
  rfLink: RfLinkAnalysis;
  gpsLocked: boolean;
  modemState: string;
  splitKioskOpen: boolean;
  pipelineBusy?: boolean;
  onToggleSplitKiosk: () => void;
  onOpenMobileMenu: () => void;
  onQuickTransmit: () => void;
}

const WORKSPACE_TITLES: Record<WorkspaceId, string> = {
  screech: 'Live Transceiver',
  map: 'Field Map & LOS',
  postman: 'DTN Mailbag',
  architecture: 'Hardware & Firmware',
};

export const TopStudioHeader: React.FC<TopStudioHeaderProps> = ({
  activeWorkspace,
  rfLink,
  gpsLocked,
  modemState,
  splitKioskOpen,
  pipelineBusy = false,
  onToggleSplitKiosk,
  onOpenMobileMenu,
  onQuickTransmit,
}) => {
  return (
    <header className="h-12 px-3 sm:px-4 bg-[#F9F9F8] dark:bg-[#111110] border-b border-[#E7E6E2] dark:border-[#2A2A28] flex items-center justify-between gap-2 sm:gap-4 shrink-0">
      {/* Left: Mobile Menu + Active Workspace Title */}
      <div className="flex items-center gap-2.5 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          aria-label="Open navigation menu"
          className="lg:hidden p-1.5 rounded-lg border border-[#E7E6E2] dark:border-[#2A2A28] bg-white dark:bg-[#181817] text-[#1A1A19] dark:text-[#F2F0EA]"
        >
          <Menu className="w-4 h-4" />
        </button>

        <Radio className="w-4 h-4 text-[#8A8984] shrink-0 hidden sm:block" aria-hidden="true" />
        <h1 className="text-[13px] font-semibold text-[#1A1A19] dark:text-[#F2F0EA] truncate">
          {WORKSPACE_TITLES[activeWorkspace]}
        </h1>
      </div>

      {/* Right: Quiet Live Telemetry + Compact Actions */}
      <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
        <div className="hidden lg:flex items-center gap-2 text-xs text-[#6E6D68] font-mono tabular-nums mr-1">
          <span>{modemState}</span>
          <span aria-hidden="true">·</span>
          <span>{gpsLocked ? 'GPS Lock' : 'Preset'}</span>
          <span aria-hidden="true">·</span>
          <span
            className={
              rfLink.linkQuality === 'CLEAR'
                ? 'text-[#15803D] font-medium'
                : rfLink.linkQuality === 'DEGRADED'
                ? 'text-[#B45309] font-medium'
                : 'text-[#C81E1E] font-medium'
            }
          >
            {rfLink.rxSignalDbm.toFixed(0)} dBm
          </span>
        </div>

        <button
          type="button"
          onClick={onToggleSplitKiosk}
          aria-pressed={splitKioskOpen}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-2 sm:px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            splitKioskOpen
              ? 'border-[#1A1A19] bg-[#1A1A19] text-white dark:border-[#F2F0EA] dark:bg-[#F2F0EA] dark:text-[#111110]'
              : 'border-[#E7E6E2] dark:border-[#2A2A28] bg-white dark:bg-[#181817] text-[#3D3D3A] dark:text-[#E2E0D8] hover:border-[#C5C4BE]'
          }`}
        >
          <Columns2 className="w-3.5 h-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">Kiosk Drawer</span>
          <span className="sm:hidden">Kiosk</span>
        </button>

        <a
          href="?kiosk=1"
          target="_blank"
          rel="noopener noreferrer"
          title="Open standalone Kiosk receiver window"
          className="hidden md:inline-flex items-center gap-1 rounded-lg border border-[#E7E6E2] dark:border-[#2A2A28] bg-white dark:bg-[#181817] px-2.5 py-1.5 text-xs font-medium text-[#3D3D3A] dark:text-[#E2E0D8] hover:border-[#C5C4BE] transition-colors whitespace-nowrap shrink-0"
        >
          <span>Kiosk Tab</span>
          <ExternalLink className="w-3 h-3 text-[#8A8984]" aria-hidden="true" />
        </a>

        <button
          type="button"
          disabled={pipelineBusy}
          onClick={onQuickTransmit}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#1A1A19] dark:bg-[#F2F0EA] text-white dark:text-[#111110] px-2.5 sm:px-3 py-1.5 text-xs font-medium hover:bg-[#C2934B] dark:hover:bg-[#C2934B] dark:hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Radio className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{pipelineBusy ? 'Sending…' : 'Transmit'}</span>
        </button>
      </div>
    </header>
  );
};

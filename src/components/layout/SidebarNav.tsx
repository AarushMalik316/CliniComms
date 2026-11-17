import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Cpu,
  HardDrive,
  MapPin,
  Moon,
  PanelLeftClose,
  Plus,
  Radio,
  Search,
  Server,
  Sun,
  Truck,
  Wifi,
  X,
} from 'lucide-react';
import { PWAInstallButton } from '../pwa/PWAInstallButton';

export type WorkspaceId = 'screech' | 'map' | 'postman' | 'architecture';

interface SidebarNavProps {
  activeWorkspace: WorkspaceId;
  onSelectWorkspace: (ws: WorkspaceId) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onQuickTransmit: () => void;
  isDark: boolean;
  onToggleTheme: () => void;
  selectedNodeFilter: string | null;
  onSelectNodeFilter: (nodeId: string | null) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  pipelineBusy?: boolean;
}

const WORKSPACE_ITEMS: Array<{ id: WorkspaceId; label: string; icon: React.FC<{ className?: string }> }> = [
  { id: 'screech', label: 'Live Transceiver', icon: Radio },
  { id: 'map', label: 'Field Map & LOS', icon: MapPin },
  { id: 'postman', label: 'DTN Mailbag', icon: Truck },
  { id: 'architecture', label: 'Hardware & Firmware', icon: Cpu },
];

const FIELD_NODE_ITEMS: Array<{
  id: string;
  label: string;
  workspace: WorkspaceId;
  icon: React.FC<{ className?: string }>;
}> = [
  { id: 'CLINIC_01', label: 'Clinic_01 Pi Zero', workspace: 'postman', icon: HardDrive },
  { id: 'MEDIC_01', label: 'Mobile Medic 01', workspace: 'map', icon: Radio },
  { id: 'TRUCK_MULE', label: 'Supply Truck ESP32', workspace: 'postman', icon: Truck },
  { id: 'RANGER_KIOSK', label: 'Town Ranger Kiosk', workspace: 'screech', icon: Wifi },
  { id: 'HOSPITAL_GW', label: 'Town Hospital Server', workspace: 'postman', icon: Server },
];

export const SidebarNav: React.FC<SidebarNavProps> = ({
  activeWorkspace,
  onSelectWorkspace,
  searchQuery,
  onSearchChange,
  onQuickTransmit,
  isDark,
  onToggleTheme,
  selectedNodeFilter,
  onSelectNodeFilter,
  mobileOpen,
  onCloseMobile,
  pipelineBusy = false,
}) => {
  const [workspacesOpen, setWorkspacesOpen] = useState(true);
  const [nodesOpen, setNodesOpen] = useState(true);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const q = searchQuery.trim().toLowerCase();
  const filteredWorkspaces = WORKSPACE_ITEMS.filter((w) =>
    w.label.toLowerCase().includes(q)
  );
  const filteredNodes = FIELD_NODE_ITEMS.filter((n) =>
    n.label.toLowerCase().includes(q)
  );

  const navBody = (
    <aside
      aria-label="Primary Sidebar"
      className="w-[236px] h-full flex flex-col bg-[#F5F5F4] dark:bg-[#141413] border-r border-[#E7E6E2] dark:border-[#2A2A28] select-none"
    >
      {/* Top Workspace Brand Selector */}
      <div className="h-12 px-3.5 flex items-center justify-between border-b border-[#E7E6E2] dark:border-[#2A2A28]">
        <a
          href={import.meta.env.BASE_URL}
          className="inline-flex items-center gap-2 text-sm font-semibold tracking-tight text-[#1A1A19] dark:text-[#F2F0EA] whitespace-nowrap"
        >
          <span className="w-5 h-5 rounded-md bg-[#C2934B] text-white inline-flex items-center justify-center text-[11px] font-bold">
            S
          </span>
          <span>Screech</span>
        </a>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close navigation sidebar"
          className="lg:hidden p-1 text-[#6E6D68] hover:text-[#1A1A19] dark:hover:text-[#F2F0EA]"
        >
          <PanelLeftClose className="w-4 h-4" />
        </button>
      </div>

      {/* Search Bar */}
      <div className="px-3 pt-3 pb-2">
        <div className="relative flex items-center">
          <Search className="w-3.5 h-3.5 text-[#8A8984] absolute left-2.5 pointer-events-none" aria-hidden="true" />
          <input
            ref={searchInputRef}
            type="search"
            aria-label="Search workspaces, nodes, and packets"
            placeholder="Search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full rounded-lg border border-[#E7E6E2] dark:border-[#2A2A28] bg-white dark:bg-[#1C1C1A] pl-8 pr-11 py-1.5 text-xs text-[#1A1A19] dark:text-[#F2F0EA] placeholder:text-[#8A8984] focus:outline-none focus:border-[#C2934B]"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              aria-label="Clear search"
              className="absolute right-2 text-[#8A8984] hover:text-[#1A1A19]"
            >
              <X className="w-3 h-3" />
            </button>
          ) : (
            <span className="absolute right-2 text-[10px] font-mono text-[#8A8984] border border-[#E7E6E2] dark:border-[#2A2A28] rounded px-1 py-0.2">
              ⌘K
            </span>
          )}
        </div>
      </div>

      {/* Quick New Action */}
      <div className="px-2 pb-2 space-y-0.5">
        <button
          type="button"
          disabled={pipelineBusy}
          onClick={onQuickTransmit}
          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[13px] font-medium text-[#4B4A46] dark:text-[#C8C6BE] hover:bg-[#ECECE9] dark:hover:bg-[#1F1F1D] transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="w-3.5 h-3.5 text-[#6E6D68]" aria-hidden="true" />
          <span>New Burst</span>
        </button>
      </div>

      {/* Scrollable Sections */}
      <div className="flex-1 overflow-y-auto px-2 py-1 space-y-4">
        {/* Workspaces Group */}
        <div>
          <button
            type="button"
            onClick={() => setWorkspacesOpen((v) => !v)}
            className="w-full flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium text-[#8A8984] hover:text-[#1A1A19] dark:hover:text-[#F2F0EA] cursor-pointer"
          >
            {workspacesOpen ? (
              <ChevronDown className="w-3 h-3" aria-hidden="true" />
            ) : (
              <ChevronRight className="w-3 h-3" aria-hidden="true" />
            )}
            <span>Workspaces</span>
          </button>

          {workspacesOpen && (
            <nav aria-label="Workspaces" className="mt-0.5 space-y-0.5">
              {filteredWorkspaces.map((item) => {
                const Icon = item.icon;
                const active = activeWorkspace === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-current={active ? 'page' : undefined}
                    onClick={() => {
                      onSelectWorkspace(item.id);
                      onSelectNodeFilter(null);
                      onCloseMobile();
                    }}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[13px] transition-colors cursor-pointer whitespace-nowrap ${
                      active
                        ? 'bg-white dark:bg-[#222220] text-[#1A1A19] dark:text-[#F2F0EA] font-medium shadow-[0_1px_2px_rgba(0,0,0,0.04)] border border-[#E7E6E2] dark:border-[#2E2E2B]'
                        : 'text-[#5C5B57] dark:text-[#A5A39B] hover:bg-[#ECECE9] dark:hover:bg-[#1F1F1D]'
                    }`}
                  >
                    <Icon
                      className={`w-3.5 h-3.5 shrink-0 ${
                        active ? 'text-[#C2934B]' : 'text-[#8A8984]'
                      }`}
                      aria-hidden="true"
                    />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </nav>
          )}
        </div>

        {/* Field Nodes / Datasets Group */}
        <div>
          <button
            type="button"
            onClick={() => setNodesOpen((v) => !v)}
            className="w-full flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium text-[#8A8984] hover:text-[#1A1A19] dark:hover:text-[#F2F0EA] cursor-pointer"
          >
            {nodesOpen ? (
              <ChevronDown className="w-3 h-3" aria-hidden="true" />
            ) : (
              <ChevronRight className="w-3 h-3" aria-hidden="true" />
            )}
            <span>Field Nodes</span>
          </button>

          {nodesOpen && (
            <div className="mt-0.5 space-y-0.5">
              {filteredNodes.map((node) => {
                const Icon = node.icon;
                const active = selectedNodeFilter === node.id;
                return (
                  <button
                    key={node.id}
                    type="button"
                    onClick={() => {
                      onSelectNodeFilter(active ? null : node.id);
                      onSelectWorkspace(node.workspace);
                      onCloseMobile();
                    }}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[13px] transition-colors cursor-pointer whitespace-nowrap ${
                      active
                        ? 'bg-white dark:bg-[#222220] text-[#1A1A19] dark:text-[#F2F0EA] font-medium border border-[#E7E6E2] dark:border-[#2E2E2B]'
                        : 'text-[#5C5B57] dark:text-[#A5A39B] hover:bg-[#ECECE9] dark:hover:bg-[#1F1F1D]'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0 text-[#8A8984]" aria-hidden="true" />
                    <span className="truncate">{node.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Utility Section */}
      <div className="p-2 border-t border-[#E7E6E2] dark:border-[#2A2A28] space-y-1">
        <button
          type="button"
          onClick={onToggleTheme}
          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[13px] text-[#5C5B57] dark:text-[#A5A39B] hover:bg-[#ECECE9] dark:hover:bg-[#1F1F1D] transition-colors cursor-pointer whitespace-nowrap"
        >
          <span className="inline-flex items-center gap-2.5">
            {isDark ? (
              <Sun className="w-3.5 h-3.5 text-[#C2934B]" aria-hidden="true" />
            ) : (
              <Moon className="w-3.5 h-3.5 text-[#8A8984]" aria-hidden="true" />
            )}
            <span>{isDark ? 'Light Studio' : 'Night Ops'}</span>
          </span>
        </button>

        <div className="px-1">
          <PWAInstallButton />
        </div>

        <div className="px-2.5 py-1.5 flex items-center justify-between text-[11px] font-mono text-[#8A8984]">
          <span>146.520 MHz</span>
          <span>1.80 W</span>
        </div>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop persistent sidebar */}
      <div className="hidden lg:block shrink-0 h-screen sticky top-0">{navBody}</div>

      {/* Mobile slide-over drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/30"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative z-10 h-full">{navBody}</div>
        </div>
      )}
    </>
  );
};

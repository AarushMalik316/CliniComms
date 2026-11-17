import React, { useState } from 'react';
import {
  ArrowUp,
  Crosshair,
  Download,
  Mic,
  MicOff,
  Radio,
  Thermometer,
  Volume2,
} from 'lucide-react';
import { DecodedFrameResult } from '@/src/lib/protocol/frame';
import { GeoCoord } from '@/src/lib/geodesic/rf';
import { KioskLogEntry } from './RangerKioskPanel';

export type TxMode = 'MEDIC_SOS' | 'FRIDGE_TELEMETRY' | 'CUSTOM_FIELD_CODE';

interface RightTransceiverDrawerProps {
  txMode: TxMode;
  onChangeTxMode: (mode: TxMode) => void;
  medicCoord: GeoCoord;
  onMedicCoordChange: (coord: GeoCoord) => void;
  fridgeTempC: number;
  onFridgeTempChange: (t: number) => void;
  noisePercent: number;
  onNoisePercentChange: (n: number) => void;
  humanVoiceActive: boolean;
  onToggleHumanVoice: (checked: boolean) => void;
  liveAudioSpeaker: boolean;
  onToggleSpeaker: (checked: boolean) => void;
  micListening: boolean;
  onToggleMic: () => void;
  micError: string | null;
  pipelineNote: string;
  pipelineBusy: boolean;
  onTransmit: (overrideCode?: string) => void;
  onExportWav: () => void;
  onLockGps: () => void;
  gpsLoading: boolean;
  lastDecoded: DecodedFrameResult | null;
  kioskLogs: KioskLogEntry[];
}

export const RightTransceiverDrawer: React.FC<RightTransceiverDrawerProps> = ({
  txMode,
  onChangeTxMode,
  medicCoord,
  onMedicCoordChange,
  fridgeTempC,
  onFridgeTempChange,
  noisePercent,
  onNoisePercentChange,
  humanVoiceActive,
  onToggleHumanVoice,
  liveAudioSpeaker,
  onToggleSpeaker,
  micListening,
  onToggleMic,
  micError,
  pipelineNote,
  pipelineBusy,
  onTransmit,
  onExportWav,
  onLockGps,
  gpsLoading,
  lastDecoded,
  kioskLogs,
}) => {
  const [composerCode, setComposerCode] = useState('');

  const handleComposerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = composerCode.trim().toUpperCase().slice(0, 8);
    if (cleaned) {
      onChangeTxMode('CUSTOM_FIELD_CODE');
      onTransmit(cleaned);
      setComposerCode('');
    } else {
      onTransmit();
    }
  };

  const latestLog = kioskLogs[0];

  return (
    <aside
      aria-label="Field Transmitter & Live Command Stream"
      className="w-full xl:w-[356px] shrink-0 rounded-xl border border-[#E7E6E2] dark:border-[#2A2A28] bg-white dark:bg-[#181817] shadow-[0_1px_2px_rgba(0,0,0,0.02)] flex flex-col overflow-hidden"
    >
      {/* Top Action Strip */}
      <div className="px-4 py-3 border-b border-[#F1F1EE] dark:border-[#242422] flex items-center justify-between gap-2">
        <span className="text-[13px] font-semibold text-[#1A1A19] dark:text-[#F2F0EA]">
          TX &amp; Channel Control
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onLockGps}
            disabled={gpsLoading}
            className="inline-flex items-center gap-1 rounded-md border border-[#E7E6E2] dark:border-[#2A2A28] px-2 py-1 text-[11px] text-[#5C5B57] dark:text-[#C8C6BE] hover:border-[#C2934B] cursor-pointer"
          >
            <Crosshair className="w-3 h-3" aria-hidden="true" />
            {gpsLoading ? 'Locking' : 'GPS'}
          </button>
          <button
            type="button"
            onClick={onExportWav}
            className="inline-flex items-center gap-1 rounded-md border border-[#E7E6E2] dark:border-[#2A2A28] px-2 py-1 text-[11px] text-[#5C5B57] dark:text-[#C8C6BE] hover:border-[#C2934B] cursor-pointer"
          >
            <Download className="w-3 h-3" aria-hidden="true" />
            .WAV
          </button>
        </div>
      </div>

      {/* Scrollable Stream + Controls */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Right-aligned quick trigger chips (matching reference chat-feed rhythm without AI) */}
        <div className="flex justify-end">
          <div className="inline-flex flex-wrap justify-end gap-1.5">
            <button
              type="button"
              onClick={() => {
                onChangeTxMode('MEDIC_SOS');
                onTransmit();
              }}
              className="rounded-lg bg-[#F4F4F2] dark:bg-[#222220] px-3 py-1.5 text-xs font-medium text-[#1A1A19] dark:text-[#F2F0EA] hover:bg-[#ECECE9] dark:hover:bg-[#2C2C29] transition-colors cursor-pointer"
            >
              Send Medic GPS SOS
            </button>
          </div>
        </div>

        {/* Plain-prose real telemetry summary */}
        <div className="space-y-2 text-[13px] leading-relaxed text-[#3D3D3A] dark:text-[#D5D3CC]">
          <p data-testid="tx-pipeline-note">{pipelineNote}</p>

          {lastDecoded && (
            <ul className="space-y-1 text-xs font-mono text-[#5C5B57] dark:text-[#A5A39B] pl-1">
              <li>• Frame Size → 28 bytes (300 baud AFSK)</li>
              <li>• Intact → {28 - lastDecoded.repairedByteCount - lastDecoded.damagedByteCount} bytes</li>
              <li>• RS-FEC Repaired → {lastDecoded.repairedByteCount} bytes</li>
              <li>
                • CRC-16 → 0x{lastDecoded.calculatedCrc.toString(16).padStart(4, '0').toUpperCase()} (
                {lastDecoded.crcValid ? 'Valid' : 'Rejected'})
              </li>
            </ul>
          )}
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => {
              onChangeTxMode('FRIDGE_TELEMETRY');
              onFridgeTempChange(11.4);
            }}
            className="rounded-lg bg-[#F4F4F2] dark:bg-[#222220] px-3 py-1.5 text-xs font-medium text-[#1A1A19] dark:text-[#F2F0EA] hover:bg-[#ECECE9] dark:hover:bg-[#2C2C29] transition-colors cursor-pointer"
          >
            Simulate Fridge &gt;8°C Excursion
          </button>
        </div>

        {/* Active Mode Configuration Card */}
        <div className="rounded-xl border border-[#E7E6E2] dark:border-[#2A2A28] bg-[#F9F9F8] dark:bg-[#141413] p-3 space-y-3">
          <div className="grid grid-cols-3 gap-1 rounded-lg bg-[#ECECE9] dark:bg-[#222220] p-0.5" role="tablist" aria-label="Packet payload type">
            {(
              [
                { id: 'MEDIC_SOS', label: 'Medic SOS' },
                { id: 'FRIDGE_TELEMETRY', label: 'Fridge' },
                { id: 'CUSTOM_FIELD_CODE', label: 'Code' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={txMode === tab.id}
                onClick={() => onChangeTxMode(tab.id)}
                className={`py-1 px-2 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                  txMode === tab.id
                    ? 'bg-white dark:bg-[#181817] text-[#1A1A19] dark:text-[#F2F0EA] shadow-xs'
                    : 'text-[#6E6D68] hover:text-[#1A1A19] dark:hover:text-[#F2F0EA]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {txMode === 'MEDIC_SOS' && (
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11px] text-[#6E6D68]">
                Lat (°N)
                <input
                  type="number"
                  step="0.0001"
                  value={medicCoord.lat}
                  onChange={(e) =>
                    onMedicCoordChange({ ...medicCoord, lat: parseFloat(e.target.value) || 0 })
                  }
                  className="mt-1 w-full rounded-md border border-[#E7E6E2] dark:border-[#2A2A28] bg-white dark:bg-[#181817] px-2 py-1 text-xs font-mono text-[#1A1A19] dark:text-[#F2F0EA] tabular-nums"
                />
              </label>
              <label className="text-[11px] text-[#6E6D68]">
                Lon (°E)
                <input
                  type="number"
                  step="0.0001"
                  value={medicCoord.lon}
                  onChange={(e) =>
                    onMedicCoordChange({ ...medicCoord, lon: parseFloat(e.target.value) || 0 })
                  }
                  className="mt-1 w-full rounded-md border border-[#E7E6E2] dark:border-[#2A2A28] bg-white dark:bg-[#181817] px-2 py-1 text-xs font-mono text-[#1A1A19] dark:text-[#F2F0EA] tabular-nums"
                />
              </label>
            </div>
          )}

          {txMode === 'FRIDGE_TELEMETRY' && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="inline-flex items-center gap-1 text-[#6E6D68]">
                  <Thermometer className="w-3.5 h-3.5" aria-hidden="true" />
                  Clinic_01 Probe
                </span>
                <span
                  className={`font-mono font-semibold tabular-nums ${
                    fridgeTempC > 8.0 ? 'text-[#C81E1E]' : 'text-[#15803D]'
                  }`}
                >
                  {fridgeTempC.toFixed(1)}°C
                </span>
              </div>
              <input
                type="range"
                aria-label="Vaccine fridge probe temperature"
                min={2.0}
                max={15.0}
                step={0.2}
                value={fridgeTempC}
                onChange={(e) => onFridgeTempChange(parseFloat(e.target.value))}
                className="w-full accent-[#C2934B] cursor-pointer"
              />
            </div>
          )}

          {/* Static Noise & Carrier Controls */}
          <div className="space-y-2 pt-1 border-t border-[#E7E6E2] dark:border-[#2A2A28]">
            <div>
              <div className="flex items-center justify-between text-[11px]">
                <label htmlFor="drawer-noise-slider" className="text-[#6E6D68]">
                  Channel Static Injector
                </label>
                <span className="font-mono font-medium tabular-nums">{noisePercent}%</span>
              </div>
              <input
                id="drawer-noise-slider"
                type="range"
                min={0}
                max={100}
                step={1}
                value={noisePercent}
                onChange={(e) => onNoisePercentChange(parseInt(e.target.value, 10))}
                className="mt-1 w-full accent-[#C2934B] cursor-pointer"
              />
            </div>

            <label className="flex items-center justify-between text-xs text-[#3D3D3A] dark:text-[#D5D3CC] cursor-pointer">
              <span>Human Voice on Channel (LBT)</span>
              <input
                type="checkbox"
                checked={humanVoiceActive}
                onChange={(e) => onToggleHumanVoice(e.target.checked)}
                className="accent-[#C2934B] w-3.5 h-3.5 cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between text-xs text-[#3D3D3A] dark:text-[#D5D3CC] cursor-pointer">
              <span className="inline-flex items-center gap-1.5">
                <Volume2 className="w-3.5 h-3.5 text-[#8A8984]" aria-hidden="true" />
                Live Speaker Audio
              </span>
              <input
                type="checkbox"
                checked={liveAudioSpeaker}
                onChange={(e) => onToggleSpeaker(e.target.checked)}
                className="accent-[#1A1A19] dark:accent-[#F2F0EA] w-3.5 h-3.5 cursor-pointer"
              />
            </label>

            <button
              type="button"
              onClick={onToggleMic}
              className={`w-full flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-xs transition-colors cursor-pointer ${
                micListening
                  ? 'border-[#15803D] bg-[#ECFDF5] text-[#15803D]'
                  : 'border-[#E7E6E2] dark:border-[#2A2A28] bg-white dark:bg-[#181817] text-[#3D3D3A] dark:text-[#D5D3CC]'
              }`}
            >
              <span className="inline-flex items-center gap-1.5">
                {micListening ? (
                  <Mic className="w-3.5 h-3.5" aria-hidden="true" />
                ) : (
                  <MicOff className="w-3.5 h-3.5 text-[#8A8984]" aria-hidden="true" />
                )}
                <span>Acoustic Mic RX</span>
              </span>
              <span className="font-mono text-[10px] font-medium">
                {micListening ? 'LISTENING' : 'OFF'}
              </span>
            </button>
            {micError && <div className="text-[11px] text-[#C81E1E]">{micError}</div>}
          </div>
        </div>

        {latestLog && (
          <div className="text-xs text-[#8A8984] flex items-center gap-1.5">
            <Radio className="w-3 h-3" aria-hidden="true" />
            <span>
              Last RX {new Date(latestLog.receivedAt).toLocaleTimeString([], { hour12: false })} ·{' '}
              {latestLog.decoded.valid ? 'Verified' : 'Rejected'}
            </span>
          </div>
        )}
      </div>

      {/* Bottom Rounded Composer Bar (matching reference bottom-right input box) */}
      <form
        onSubmit={handleComposerSubmit}
        className="p-3 border-t border-[#F1F1EE] dark:border-[#242422]"
      >
        <div className="rounded-xl border border-[#E7E6E2] dark:border-[#2A2A28] bg-[#F9F9F8] dark:bg-[#141413] p-2.5 space-y-2">
          <input
            type="text"
            maxLength={8}
            aria-label="Custom 8-byte field code or press transmit"
            placeholder="8-byte field code (e.g. MED_EVAC)..."
            value={composerCode}
            onChange={(e) => setComposerCode(e.target.value)}
            className="w-full bg-transparent text-xs text-[#1A1A19] dark:text-[#F2F0EA] placeholder:text-[#8A8984] focus:outline-none"
          />
          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] font-mono text-[#8A8984]">
              {pipelineBusy ? 'Transmitting...' : 'Bell 202 · 300 baud'}
            </span>
            <button
              type="submit"
              aria-label="Transmit 28-byte AFSK burst"
              className="w-7 h-7 rounded-full bg-[#1A1A19] dark:bg-[#F2F0EA] text-white dark:text-[#111110] inline-flex items-center justify-center hover:bg-[#C2934B] dark:hover:bg-[#C2934B] dark:hover:text-white transition-colors cursor-pointer"
            >
              <ArrowUp className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </form>
    </aside>
  );
};

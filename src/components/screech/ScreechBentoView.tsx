import React, { useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Grid, PieChart } from 'lucide-react';
import { DecodedFrameResult, FRAME_SIZE, PacketType } from '@/src/lib/protocol/frame';
import { RfLinkAnalysis } from '@/src/lib/geodesic/rf';
import { DspOscilloscope } from './DspOscilloscope';
import { HexMatrixInspector } from './HexMatrixInspector';
import { KioskLogEntry } from './RangerKioskPanel';

interface ScreechBentoViewProps {
  lastSamples: Float32Array | null;
  playbackStartMs: number | null;
  playbackDurationMs: number;
  humanVoiceActive: boolean;
  noisePercent: number;
  isDark: boolean;
  lastTxFrame: Uint8Array | null;
  lastDecoded: DecodedFrameResult | null;
  rfLink: RfLinkAnalysis;
  kioskLogs: KioskLogEntry[];
  onAcknowledge: (id: string) => void;
  searchQuery: string;
}

export const ScreechBentoView: React.FC<ScreechBentoViewProps> = ({
  lastSamples,
  playbackStartMs,
  playbackDurationMs,
  humanVoiceActive,
  noisePercent,
  isDark,
  lastTxFrame,
  lastDecoded,
  rfLink,
  kioskLogs,
  onAcknowledge,
  searchQuery,
}) => {
  const [showHexMatrix, setShowHexMatrix] = useState(false);

  // Compute 28-byte integrity breakdown for the Donut Ring
  const parityBytes = 8;
  const headerBytes = 3;
  const repairedBytes = lastDecoded?.repairedByteCount ?? 0;
  const damagedBytes = lastDecoded?.damagedByteCount ?? 0;
  const intactPayloadBytes = Math.max(
    0,
    FRAME_SIZE - parityBytes - headerBytes - repairedBytes - damagedBytes
  );

  const segments = [
    { label: 'Intact Data', count: intactPayloadBytes, color: '#C2934B' },
    { label: 'RS Parity', count: parityBytes, color: '#3F3F3D' },
    { label: 'FEC Repaired', count: repairedBytes, color: '#15803D' },
    { label: 'Header / Damaged', count: headerBytes + damagedBytes, color: damagedBytes > 0 ? '#C81E1E' : '#D4D3CE' },
  ];

  // SVG Donut Geometry
  const radius = 58;
  const circumference = 2 * Math.PI * radius;
  let runningOffset = 0;

  const q = searchQuery.trim().toLowerCase();
  const filteredLogs = kioskLogs.filter((entry) => {
    if (!q) return true;
    const nodeHex = `0x${entry.decoded.nodeId.toString(16).padStart(4, '0')}`.toLowerCase();
    const kind = entry.decoded.payload?.kind.toLowerCase() ?? 'rejected';
    return nodeHex.includes(q) || kind.includes(q) || entry.sourceTransport.toLowerCase().includes(q);
  });

  const validCount = kioskLogs.filter((l) => l.decoded.valid).length;
  const fecRepairedTotal = kioskLogs.reduce((acc, l) => acc + l.decoded.repairedByteCount, 0);

  return (
    <div className="space-y-3.5">
      {/* Top Row: Acoustic Signal Line Chart + 28-Byte Integrity Donut */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-3.5">
        {/* Card 1: Acoustic AFSK Signal */}
        <div className="xl:col-span-7 rounded-xl border border-[#E7E6E2] dark:border-[#2A2A28] bg-white dark:bg-[#181817] p-4 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className="text-[13px] font-semibold text-[#1A1A19] dark:text-[#F2F0EA]">
              Acoustic AFSK Signal
            </h2>
            <div className="flex items-center gap-3 text-[11px] text-[#6E6D68]">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-xs bg-[#C2934B] inline-block" aria-hidden="true" />
                1200 Hz Mark
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-xs bg-[#52524E] inline-block" aria-hidden="true" />
                2200 Hz Space
              </span>
            </div>
          </div>

          <DspOscilloscope
            lastSamples={lastSamples}
            playbackStartTimeMs={playbackStartMs}
            playbackDurationMs={playbackDurationMs}
            humanVoiceSimulated={humanVoiceActive}
            noisePercent={noisePercent}
            isDark={isDark}
          />
        </div>

        {/* Card 2: 28-Byte Frame Integrity Donut / Hex Matrix Toggle */}
        <div className="xl:col-span-5 rounded-xl border border-[#E7E6E2] dark:border-[#2A2A28] bg-white dark:bg-[#181817] p-4 shadow-[0_1px_2px_rgba(0,0,0,0.02)] flex flex-col">
          <div className="flex items-center justify-between gap-2 mb-2">
            <h2 className="text-[13px] font-semibold text-[#1A1A19] dark:text-[#F2F0EA]">
              28-Byte FEC Integrity
            </h2>
            <button
              type="button"
              onClick={() => setShowHexMatrix((v) => !v)}
              className="inline-flex items-center gap-1 rounded-md border border-[#E7E6E2] dark:border-[#2A2A28] px-2 py-1 text-[11px] font-medium text-[#5C5B57] dark:text-[#C8C6BE] hover:border-[#C2934B] transition-colors cursor-pointer"
            >
              {showHexMatrix ? (
                <>
                  <PieChart className="w-3 h-3" aria-hidden="true" />
                  <span>Ring View</span>
                </>
              ) : (
                <>
                  <Grid className="w-3 h-3" aria-hidden="true" />
                  <span>Hex Matrix</span>
                </>
              )}
            </button>
          </div>

          {showHexMatrix ? (
            <div className="flex-1 overflow-y-auto max-h-[245px] -mx-2">
              <HexMatrixInspector txFrame={lastTxFrame} decoded={lastDecoded} />
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center py-2">
              <div className="flex flex-wrap items-center justify-center gap-3 text-[11px] text-[#6E6D68] mb-3">
                {segments.map((seg) => (
                  <span key={seg.label} className="inline-flex items-center gap-1.5">
                    <span
                      className="w-2 h-2 rounded-xs inline-block"
                      style={{ backgroundColor: seg.color }}
                      aria-hidden="true"
                    />
                    {seg.label} ({seg.count}B)
                  </span>
                ))}
              </div>

              <div className="relative w-[156px] h-[156px] flex items-center justify-center">
                <svg viewBox="0 0 148 148" className="w-full h-full -rotate-90" role="img" aria-label="28-Byte Frame Integrity Donut Chart">
                  {segments.map((seg) => {
                    if (seg.count <= 0) return null;
                    const frac = seg.count / FRAME_SIZE;
                    const gap = 4;
                    const dash = Math.max(0, frac * circumference - gap);
                    const offset = -runningOffset;
                    runningOffset += frac * circumference;
                    return (
                      <circle
                        key={seg.label}
                        cx="74"
                        cy="74"
                        r={radius}
                        fill="none"
                        stroke={seg.color}
                        strokeWidth="18"
                        strokeDasharray={`${dash} ${circumference}`}
                        strokeDashoffset={offset}
                      />
                    );
                  })}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="text-[11px] text-[#8A8984]">Frame</span>
                  <span className="text-2xl font-semibold text-[#1A1A19] dark:text-[#F2F0EA] tabular-nums leading-tight">
                    28B
                  </span>
                  <span className="text-[10px] font-mono text-[#6E6D68]">
                    {lastDecoded
                      ? lastDecoded.valid
                        ? 'CRC VALID'
                        : 'CRC FAIL'
                      : 'READY'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Row: Stacked KPIs (Left) + Telemetry Log Table (Right) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-3.5">
        {/* Stacked KPI Cards */}
        <div className="xl:col-span-4 flex flex-col gap-3.5">
          {/* KPI 1: VHF Link Signal */}
          <div className="flex-1 rounded-xl border border-[#E7E6E2] dark:border-[#2A2A28] bg-white dark:bg-[#181817] p-4 shadow-[0_1px_2px_rgba(0,0,0,0.02)] flex flex-col justify-between">
            <div className="text-[13px] font-semibold text-[#1A1A19] dark:text-[#F2F0EA]">
              VHF Link Budget
            </div>
            <div className="py-4 text-center">
              <div className="text-xs text-[#8A8984] mb-1">146.520 MHz Rx Strength</div>
              <div className="text-3xl font-semibold tracking-tight text-[#1A1A19] dark:text-[#F2F0EA] tabular-nums">
                {rfLink.rxSignalDbm.toFixed(1)} <span className="text-base font-normal text-[#8A8984]">dBm</span>
              </div>
              <div className="mt-2.5 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium tabular-nums bg-[#F4F4F2] dark:bg-[#222220]">
                {rfLink.linkQuality === 'CLEAR' ? (
                  <span className="text-[#15803D] inline-flex items-center gap-1">
                    <ArrowUpRight className="w-3 h-3" aria-hidden="true" />
                    CLEAR LOS · {rfLink.distanceKm.toFixed(1)} km
                  </span>
                ) : rfLink.linkQuality === 'DEGRADED' ? (
                  <span className="text-[#B45309] inline-flex items-center gap-1">
                    <ArrowDownRight className="w-3 h-3" aria-hidden="true" />
                    DEGRADED · {rfLink.distanceKm.toFixed(1)} km
                  </span>
                ) : (
                  <span className="text-[#C81E1E] inline-flex items-center gap-1">
                    <ArrowDownRight className="w-3 h-3" aria-hidden="true" />
                    BLOCKED · +{rfLink.diffractionLossDb.toFixed(0)} dB loss
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* KPI 2: Solar Power & FEC Repair */}
          <div className="flex-1 rounded-xl border border-[#E7E6E2] dark:border-[#2A2A28] bg-white dark:bg-[#181817] p-4 shadow-[0_1px_2px_rgba(0,0,0,0.02)] flex flex-col justify-between">
            <div className="text-[13px] font-semibold text-[#1A1A19] dark:text-[#F2F0EA]">
              Continuous Solar Load
            </div>
            <div className="py-4 text-center">
              <div className="text-xs text-[#8A8984] mb-1">Total System Draw</div>
              <div className="text-3xl font-semibold tracking-tight text-[#1A1A19] dark:text-[#F2F0EA] tabular-nums">
                1.80 <span className="text-base font-normal text-[#8A8984]">W</span>
              </div>
              <div className="mt-2.5 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium tabular-nums bg-[#ECFDF5] dark:bg-[#052E16] text-[#15803D] dark:text-[#4ADE80]">
                <ArrowUpRight className="w-3 h-3" aria-hidden="true" />
                $37 BOM · {fecRepairedTotal}B FEC Repaired
              </div>
            </div>
          </div>
        </div>

        {/* Table Card: Decoded Telemetry Log */}
        <div className="xl:col-span-8 rounded-xl border border-[#E7E6E2] dark:border-[#2A2A28] bg-white dark:bg-[#181817] p-4 shadow-[0_1px_2px_rgba(0,0,0,0.02)] flex flex-col">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className="text-[13px] font-semibold text-[#1A1A19] dark:text-[#F2F0EA]">
              Decoded Telemetry Frames
            </h2>
            <span className="text-xs text-[#8A8984] font-mono tabular-nums">
              {validCount}/{kioskLogs.length} CRC-16 Verified
            </span>
          </div>

          <div className="flex-1 overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs tabular-nums" data-testid="kiosk-packet-log">
              <thead>
                <tr className="border-b border-[#E7E6E2] dark:border-[#2A2A28] text-[11px] font-medium text-[#8A8984]">
                  <th className="py-2 pr-3 font-medium">Node</th>
                  <th className="py-2 px-3 font-medium">Time</th>
                  <th className="py-2 px-3 font-medium">Transport</th>
                  <th className="py-2 px-3 font-medium">Payload</th>
                  <th className="py-2 pl-3 text-right font-medium">Integrity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F1EE] dark:divide-[#242422]">
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-[#8A8984]">
                      No telemetry frames matching filter. Transmit a burst from the right panel.
                    </td>
                  </tr>
                ) : (
                  filteredLogs.slice(0, 8).map((entry) => {
                    const d = entry.decoded;
                    const timeStr = new Date(entry.receivedAt).toLocaleTimeString([], {
                      hour12: false,
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    });

                    let payloadText = 'Unrecoverable Noise';
                    let urgent = false;
                    if (d.valid && d.payload?.kind === 'MEDIC_SOS') {
                      payloadText = `SOS ${d.payload.lat.toFixed(4)}°, ${d.payload.lon.toFixed(4)}°`;
                      urgent = true;
                    } else if (d.valid && d.payload?.kind === 'FRIDGE_TELEMETRY') {
                      payloadText = `Fridge ${d.payload.tempC.toFixed(2)}°C · Bat ${d.payload.batteryPct}%`;
                      urgent = d.payload.tempC > 8.0;
                    } else if (d.valid && d.payload?.kind === 'CUSTOM_FIELD_CODE') {
                      payloadText = `Code: ${d.payload.code}`;
                    } else if (!d.valid) {
                      payloadText = 'Rejected (CRC-16 Mismatch)';
                    }

                    return (
                      <tr key={entry.id} className="hover:bg-[#F9F9F8] dark:hover:bg-[#1E1E1C] transition-colors">
                        <td className="py-2.5 pr-3 font-mono text-[#1A1A19] dark:text-[#F2F0EA]">
                          0x{d.nodeId.toString(16).padStart(4, '0').toUpperCase()}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[#6E6D68]">{timeStr}</td>
                        <td className="py-2.5 px-3 text-[#6E6D68]">
                          {entry.sourceTransport === 'ACOUSTIC_MIC' ? 'Acoustic Mic' : 'VHF AFSK'}
                        </td>
                        <td
                          className={`py-2.5 px-3 font-medium ${
                            !d.valid
                              ? 'text-[#C81E1E]'
                              : urgent
                              ? 'text-[#C2934B]'
                              : 'text-[#1A1A19] dark:text-[#F2F0EA]'
                          }`}
                        >
                          {payloadText}
                        </td>
                        <td className="py-2.5 pl-3 text-right font-mono">
                          <div className="inline-flex items-center gap-2">
                            <span
                              className={
                                !d.valid
                                  ? 'text-[#C81E1E]'
                                  : d.repairedByteCount > 0
                                  ? 'text-[#15803D] font-medium'
                                  : 'text-[#6E6D68]'
                              }
                            >
                              {!d.valid
                                ? 'CRC FAIL'
                                : d.repairedByteCount > 0
                                ? `FEC +${d.repairedByteCount}B`
                                : 'CRC OK'}
                            </span>
                            {d.valid &&
                              !entry.acknowledged &&
                              d.packetType !== PacketType.CustomFieldCode && (
                                <button
                                  type="button"
                                  onClick={() => onAcknowledge(entry.id)}
                                  className="rounded border border-[#E7E6E2] dark:border-[#2A2A28] px-1.5 py-0.5 text-[10px] hover:border-[#1A1A19] cursor-pointer"
                                >
                                  Ack
                                </button>
                              )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              <tfoot>
                <tr className="border-t border-[#E7E6E2] dark:border-[#2A2A28] font-medium text-[#1A1A19] dark:text-[#F2F0EA]">
                  <td className="pt-2.5 pr-3">Summary</td>
                  <td className="pt-2.5 px-3 text-[#8A8984]" colSpan={2}>
                    {kioskLogs.length} frame(s) logged
                  </td>
                  <td className="pt-2.5 px-3 font-mono text-xs text-[#6E6D68]">
                    Repaired {fecRepairedTotal} B total
                  </td>
                  <td className="pt-2.5 pl-3 text-right font-mono">
                    {kioskLogs.length > 0
                      ? `${Math.round((validCount / kioskLogs.length) * 100)}% Valid`
                      : '—'}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

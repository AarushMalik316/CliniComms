import React, { useEffect, useState } from 'react';
import { BellOff, CheckCircle2, Lock, Radio, ShieldAlert } from 'lucide-react';
import { DecodedFrameResult, PacketType } from '@/src/lib/protocol/frame';
import { DesertFieldPreset, GeoCoord, RfLinkAnalysis } from '@/src/lib/geodesic/rf';
import { DecodedMapPin, DesertLeafletMap } from '../map/DesertLeafletMap';

export interface KioskLogEntry {
  id: string;
  receivedAt: number;
  sourceTransport: 'ACOUSTIC_MIC' | 'VHF_BROADCAST' | 'LOCAL_SIM';
  decoded: DecodedFrameResult;
  rxSignalDbm: number;
  acknowledged: boolean;
}

interface RangerKioskPanelProps {
  logs: KioskLogEntry[];
  onAcknowledge: (id: string) => void;
  onAcknowledgeAll: () => void;
  alarmMuted: boolean;
  onToggleMute: () => void;
  preset: DesertFieldPreset;
  medicCoord: GeoCoord;
  truckCoord: GeoCoord;
  rfLink: RfLinkAnalysis;
  repeaterEnabled: boolean;
  roadWashedOut: boolean;
  decodedPins: DecodedMapPin[];
  isStandaloneKiosk?: boolean;
}

export const RangerKioskPanel: React.FC<RangerKioskPanelProps> = ({
  logs,
  onAcknowledge,
  onAcknowledgeAll,
  alarmMuted,
  onToggleMute,
  preset,
  medicCoord,
  truckCoord,
  rfLink,
  repeaterEnabled,
  roadWashedOut,
  decodedPins,
  isStandaloneKiosk = false,
}) => {
  const [wakeLockActive, setWakeLockActive] = useState(false);

  useEffect(() => {
    let sentinel: { release: () => Promise<void> } | null = null;
    const nav = navigator as unknown as {
      wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> };
    };
    if (nav.wakeLock?.request) {
      nav.wakeLock
        .request('screen')
        .then((s) => {
          sentinel = s;
          setWakeLockActive(true);
        })
        .catch(() => {
          setWakeLockActive(false);
        });
    }
    return () => {
      if (sentinel) {
        void sentinel.release().catch(() => {});
      }
    };
  }, []);

  const unackUrgentCount = logs.filter(
    (l) => !l.acknowledged && l.decoded.valid && l.decoded.packetType !== PacketType.CustomFieldCode
  ).length;

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#181817]">
      {/* Kiosk Hardware Status Header */}
      <div className="p-4 border-b border-[#DFDDD6] dark:border-[#2A2A28] space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-xs font-mono font-semibold tracking-wider text-[#141413] dark:text-[#F2F0EA]">
              TOWN RANGER POST KIOSK
            </h2>
            <p className="text-[11px] font-mono text-[#6E6D68]">
              $30 ANDROID ALWAYS-ON RECEIVER · 0.75W
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onToggleMute}
              className={`inline-flex items-center gap-1 border px-2 py-1 text-[11px] font-mono transition-colors cursor-pointer whitespace-nowrap ${
                alarmMuted
                  ? 'border-[#D97706] text-[#D97706] bg-[#D97706]/10'
                  : 'border-[#DFDDD6] dark:border-[#2A2A28] text-[#141413] dark:text-[#F2F0EA] hover:border-[#141413]'
              }`}
            >
              <BellOff className="w-3 h-3" aria-hidden="true" />
              {alarmMuted ? 'Alarm Muted' : 'Mute Alarm'}
            </button>
            {unackUrgentCount > 0 && (
              <button
                type="button"
                onClick={onAcknowledgeAll}
                className="inline-flex items-center gap-1 border border-[#008A52] bg-[#008A52] text-white px-2 py-1 text-[11px] font-mono hover:bg-[#007344] transition-colors cursor-pointer whitespace-nowrap"
              >
                <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                Ack All ({unackUrgentCount})
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-px bg-[#DFDDD6] dark:bg-[#2A2A28] border border-[#DFDDD6] dark:border-[#2A2A28] font-mono text-[10px]">
          <div className="bg-[#F6F5F0] dark:bg-[#111110] px-2.5 py-1.5 flex items-center justify-between">
            <span className="text-[#6E6D68]">WAKELOCK</span>
            <span className="text-[#008A52] font-semibold inline-flex items-center gap-1">
              <Lock className="w-2.5 h-2.5" aria-hidden="true" />
              {wakeLockActive ? 'OS ACTIVE' : 'KIOSK LOCK'}
            </span>
          </div>
          <div className="bg-[#F6F5F0] dark:bg-[#111110] px-2.5 py-1.5 flex items-center justify-between">
            <span className="text-[#6E6D68]">TRRS LINE</span>
            <span className="text-[#141413] dark:text-[#F2F0EA] font-semibold inline-flex items-center gap-1">
              <Radio className="w-2.5 h-2.5 text-[#008A52]" aria-hidden="true" />
              CONNECTED
            </span>
          </div>
        </div>
      </div>

      {/* Live Mini-Map for Decoded Rescue Coordinates */}
      <div className="border-b border-[#DFDDD6] dark:border-[#2A2A28]">
        <div className="px-4 py-1.5 bg-[#F6F5F0] dark:bg-[#111110] border-b border-[#DFDDD6] dark:border-[#2A2A28] flex items-center justify-between font-mono text-[10px] text-[#6E6D68]">
          <span>VERIFIED RESCUE PLOTTER</span>
          <span className="tabular-nums">{decodedPins.length} VALID PIN(S)</span>
        </div>
        <DesertLeafletMap
          preset={preset}
          medicCoord={medicCoord}
          truckCoord={truckCoord}
          rfLink={rfLink}
          repeaterEnabled={repeaterEnabled}
          roadWashedOut={roadWashedOut}
          decodedPins={decodedPins}
          compact={!isStandaloneKiosk}
          heightClass={isStandaloneKiosk ? 'h-[300px]' : 'h-[180px]'}
        />
      </div>

      {/* Decoded Packet Log */}
      <div className="flex-1 overflow-y-auto divide-y divide-[#DFDDD6] dark:divide-[#2A2A28]" data-testid="kiosk-packet-log">
        {logs.length === 0 ? (
          <div className="p-6 text-center font-mono text-xs text-[#6E6D68]">
            Listening on 146.520 MHz TRRS audio line &amp; BroadcastChannel. No frames received yet.
          </div>
        ) : (
          logs.map((entry) => {
            const d = entry.decoded;
            const timeStr = new Date(entry.receivedAt).toLocaleTimeString([], {
              hour12: false,
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            });

            let summary = 'UNKNOWN PAYLOAD';
            let isUrgent = false;

            if (!d.valid) {
              summary = `PACKET REJECTED (${d.failureReason ?? 'CRC-16 MISMATCH'}) — NOT PLOTTED`;
            } else if (d.payload?.kind === 'MEDIC_SOS') {
              summary = `MEDIC SOS @ ${d.payload.lat.toFixed(4)}° N, ${d.payload.lon.toFixed(4)}° E`;
              isUrgent = true;
            } else if (d.payload?.kind === 'FRIDGE_TELEMETRY') {
              const alarm = d.payload.tempC > 8.0 ? 'THERMAL ALARM' : 'NOMINAL';
              summary = `CLINIC_01 FRIDGE: ${d.payload.tempC.toFixed(2)}°C [${alarm}] · BAT ${d.payload.batteryPct}%`;
              isUrgent = d.payload.tempC > 8.0;
            } else if (d.payload?.kind === 'CUSTOM_FIELD_CODE') {
              summary = `FIELD CODE: "${d.payload.code}"`;
            }

            return (
              <div
                key={entry.id}
                className={`p-3 font-mono text-xs transition-colors ${
                  !d.valid
                    ? 'bg-[#C81E1E]/5'
                    : isUrgent && !entry.acknowledged
                    ? 'bg-[#FF4400]/5'
                    : ''
                }`}
              >
                <div className="flex items-center justify-between gap-2 text-[10px] text-[#6E6D68]">
                  <span className="tabular-nums">
                    {timeStr} · NODE 0x{d.nodeId.toString(16).padStart(4, '0').toUpperCase()} · {entry.sourceTransport}
                  </span>
                  <span
                    className={
                      !d.valid
                        ? 'text-[#C81E1E] font-semibold'
                        : d.repairedByteCount > 0
                        ? 'text-[#008A52] font-semibold'
                        : 'text-[#008A52]'
                    }
                  >
                    {!d.valid
                      ? 'CRC FAIL'
                      : d.repairedByteCount > 0
                      ? `FEC +${d.repairedByteCount}B`
                      : 'CRC OK'}
                  </span>
                </div>

                <div className="mt-1 flex items-start justify-between gap-2">
                  <div
                    className={`text-xs font-medium leading-snug ${
                      !d.valid
                        ? 'text-[#C81E1E]'
                        : isUrgent
                        ? 'text-[#FF4400]'
                        : 'text-[#141413] dark:text-[#F2F0EA]'
                    }`}
                  >
                    {!d.valid && <ShieldAlert className="w-3.5 h-3.5 inline mr-1 -mt-0.5" aria-hidden="true" />}
                    {summary}
                  </div>
                  {d.valid && !entry.acknowledged && (
                    <button
                      type="button"
                      onClick={() => onAcknowledge(entry.id)}
                      className="shrink-0 border border-[#DFDDD6] dark:border-[#2A2A28] px-2 py-0.5 text-[10px] hover:border-[#141413] dark:hover:border-[#F2F0EA] cursor-pointer"
                    >
                      Ack
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DESERT_PRESETS,
  GeoCoord,
  analyzeVhfLink,
  haversineDistanceKm,
  interpolateRoute,
} from '@/src/lib/geodesic/rf';
import {
  DecodedFrameResult,
  FramePayload,
  PacketType,
  decodeAndRepairFrame,
  encodeFrame,
  injectChannelNoise,
} from '@/src/lib/protocol/frame';
import {
  addAcousticStatic,
  checkCarrierSense,
  encodeWavFile,
  modulateAfskFrame,
} from '@/src/lib/modem/afsk';
import {
  BroadcastPacketMessage,
  SCREECH_CHANNEL_NAME,
  acousticModem,
} from '@/src/lib/modem/audioSession';
import { DtnBundle, SyncReceipt } from '@/src/lib/dtn/crypto';
import { executeProximityHandshake } from '@/src/lib/dtn/handshake';
import {
  loadDtnState,
  resetDtnStorage,
  saveDtnState,
} from '@/src/lib/dtn/storage';
import { SidebarNav, WorkspaceId } from './components/layout/SidebarNav';
import { TopStudioHeader } from './components/layout/TopStudioHeader';
import { ScreechBentoView } from './components/screech/ScreechBentoView';
import {
  RightTransceiverDrawer,
  TransmitOptions,
  TxMode,
} from './components/screech/RightTransceiverDrawer';
import { KioskLogEntry, RangerKioskPanel } from './components/screech/RangerKioskPanel';
import { GeospatialWorkspace } from './components/map/GeospatialWorkspace';
import { DecodedMapPin } from './components/map/DesertLeafletMap';
import { PostmanWorkspace } from './components/dtn/PostmanWorkspace';
import { ArchitectureWorkspace } from './components/arch/ArchitectureWorkspace';
import { OfflineIndicator } from './components/pwa/PWAInstallButton';

export default function App() {
  const isStandaloneKiosk = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('kiosk') === '1';
  }, []);

  const [isDark, setIsDark] = useState<boolean>(false);
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceId>('screech');
  const [splitKioskOpen, setSplitKioskOpen] = useState<boolean>(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedNodeFilter, setSelectedNodeFilter] = useState<string | null>(null);

  // Geospatial & RF state
  const [presetId, setPresetId] = useState<string>(DESERT_PRESETS[0].id);
  const preset = useMemo(
    () => DESERT_PRESETS.find((p) => p.id === presetId) ?? DESERT_PRESETS[0],
    [presetId]
  );
  const [medicCoord, setMedicCoord] = useState<GeoCoord>(DESERT_PRESETS[0].medic);
  const [repeaterEnabled, setRepeaterEnabled] = useState<boolean>(true);
  const [gpsLocked, setGpsLocked] = useState<boolean>(false);
  const [gpsLoading, setGpsLoading] = useState<boolean>(false);
  const [modemState, setModemState] = useState<string>('44.1 kHz Ready');

  // Screech TX & DSP State
  const [txMode, setTxMode] = useState<TxMode>('MEDIC_SOS');
  const [fridgeTempC, setFridgeTempC] = useState<number>(3.8);
  const [noisePercent, setNoisePercent] = useState<number>(12);
  const [humanVoiceActive, setHumanVoiceActive] = useState<boolean>(false);
  const [liveAudioSpeaker, setLiveAudioSpeaker] = useState<boolean>(true);
  const [micListening, setMicListening] = useState<boolean>(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [pipelineBusy, setPipelineBusy] = useState<boolean>(false);
  const [pipelineNote, setPipelineNote] = useState<string>(
    'Modem idle on 146.520 MHz VHF. Ready to modulate 28-byte Reed-Solomon protected frames.'
  );
  const [lastTxFrame, setLastTxFrame] = useState<Uint8Array | null>(null);
  const [lastDecoded, setLastDecoded] = useState<DecodedFrameResult | null>(null);
  const [lastSamples, setLastSamples] = useState<Float32Array | null>(null);
  const [playbackStartMs, setPlaybackStartMs] = useState<number | null>(null);
  const [playbackDurationMs, setPlaybackDurationMs] = useState<number>(0);

  // Truck & DTN state (0 = Hospital, 1 = Clinic_01)
  const [truckProgress, setTruckProgress] = useState<number>(0.15);
  const [truckSpeedMode, setTruckSpeedMode] = useState<'IDLE' | 'TO_CLINIC' | 'TO_HOSPITAL'>('IDLE');
  const [roadWashedOut, setRoadWashedOut] = useState<boolean>(false);
  const [bundles, setBundles] = useState<DtnBundle[]>([]);
  const [receipts, setReceipts] = useState<SyncReceipt[]>([]);
  const dtnLoadedRef = useRef(false);

  // Kiosk RX state
  const [kioskLogs, setKioskLogs] = useState<KioskLogEntry[]>([]);
  const [alarmMuted, setAlarmMuted] = useState<boolean>(false);
  const txTimersRef = useRef<number[]>([]);

  useEffect(() => {
    return () => {
      txTimersRef.current.forEach((id) => window.clearTimeout(id));
      txTimersRef.current = [];
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) root.classList.add('dark');
    else root.classList.remove('dark');
  }, [isDark]);

  useEffect(() => {
    void loadDtnState().then((state) => {
      setBundles(state.bundles);
      setReceipts(state.receipts);
      dtnLoadedRef.current = true;
    });
  }, []);

  useEffect(() => {
    if (!dtnLoadedRef.current) return;
    void saveDtnState({ bundles, receipts });
  }, [bundles, receipts]);

  // Seed initial baseline telemetry frame on boot
  useEffect(() => {
    if (isStandaloneKiosk) return;
    const initFrame = encodeFrame({
      nodeId: 0x0101,
      payload: {
        kind: 'FRIDGE_TELEMETRY',
        tempC: 3.84,
        alertCode: 0,
        batteryPct: 92,
        flags: [0, 1, 1, 1],
      },
    });
    const decoded = decodeAndRepairFrame(initFrame, [], initFrame);
    setLastTxFrame(initFrame);
    setLastDecoded(decoded);
    setKioskLogs([
      {
        id: 'BOOT-FRIDGE-01',
        receivedAt: Date.now() - 45000,
        sourceTransport: 'VHF_BROADCAST',
        decoded,
        rxSignalDbm: -82.4,
        acknowledged: true,
      },
    ]);
  }, [isStandaloneKiosk]);

  // Listen to BroadcastChannel for Dual-Window Kiosk synchronization
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const ch = new BroadcastChannel(SCREECH_CHANNEL_NAME);
    ch.onmessage = (ev: MessageEvent<BroadcastPacketMessage>) => {
      const msg = ev.data;
      if (!msg || msg.type !== 'AFSK_BURST') return;
      const tx = new Uint8Array(msg.txBytes);
      const rx = new Uint8Array(msg.rxBytes);
      const decoded = decodeAndRepairFrame(rx, msg.erasureRsIndices, tx);
      setKioskLogs((prev) => {
        if (prev.some((p) => p.id === msg.id)) return prev;
        return [
          {
            id: msg.id,
            receivedAt: msg.sentAt,
            sourceTransport: 'VHF_BROADCAST' as const,
            decoded,
            rxSignalDbm: msg.rxSignalDbm,
            acknowledged: false,
          },
          ...prev,
        ].slice(0, 40);
      });
    };
    return () => ch.close();
  }, []);

  const rfLink = useMemo(
    () => analyzeVhfLink(medicCoord, preset.townPost, preset, repeaterEnabled),
    [medicCoord, preset, repeaterEnabled]
  );

  const truckCoord = useMemo(
    () => interpolateRoute(preset.waypoints, truckProgress).coord,
    [preset.waypoints, truckProgress]
  );

  const nearestStation = useMemo(() => {
    const distClinicM = haversineDistanceKm(truckCoord, preset.clinic) * 1000;
    const distHospM = haversineDistanceKm(truckCoord, preset.hospital) * 1000;
    if (distClinicM <= distHospM) {
      return { node: 'clinic_pi' as const, distanceMeters: distClinicM };
    }
    return { node: 'hospital_server' as const, distanceMeters: distHospM };
  }, [truckCoord, preset.clinic, preset.hospital]);

  useEffect(() => {
    if (truckSpeedMode === 'IDLE' || roadWashedOut) return;
    const id = setInterval(() => {
      setTruckProgress((prev) => {
        const delta = truckSpeedMode === 'TO_CLINIC' ? 0.04 : -0.04;
        const next = Math.max(0, Math.min(1, prev + delta));
        if (next === 0 || next === 1) {
          setTruckSpeedMode('IDLE');
        }
        return next;
      });
    }, 180);
    return () => clearInterval(id);
  }, [truckSpeedMode, roadWashedOut]);

  useEffect(() => {
    if (!dtnLoadedRef.current) return;
    if (nearestStation.distanceMeters > 100) return;

    setBundles((prevBundles) => {
      const res = executeProximityHandshake({
        bundles: prevBundles,
        peerStation: nearestStation.node,
        distanceMeters: nearestStation.distanceMeters,
      });
      if (!res.triggered || !res.receipt) return prevBundles;
      setReceipts((prevR) => [res.receipt!, ...prevR]);
      return res.updatedBundles;
    });
  }, [nearestStation]);

  const handlePacketDelivered = useCallback((entry: KioskLogEntry) => {
    setKioskLogs((prev) => [entry, ...prev].slice(0, 40));
  }, []);

  const handleLockGps = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setPipelineNote('Browser Geolocation API unavailable; using desert preset coordinates.');
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setMedicCoord({
          lat: Number(pos.coords.latitude.toFixed(5)),
          lon: Number(pos.coords.longitude.toFixed(5)),
          elevationM: pos.coords.altitude ? Math.round(pos.coords.altitude) : 185,
        });
        setGpsLocked(true);
        setGpsLoading(false);
        setPipelineNote(
          `Hardware GPS fix acquired (±${Math.round(pos.coords.accuracy)}m accuracy).`
        );
      },
      (err) => {
        setGpsLocked(false);
        setGpsLoading(false);
        setPipelineNote(`GPS lock unavailable (${err.message}); preset active.`);
      },
      { enableHighAccuracy: true, timeout: 6000 }
    );
  };

  const handleToggleMic = async () => {
    setMicError(null);
    if (micListening) {
      acousticModem.stopMicrophoneListener();
      setMicListening(false);
      setModemState('44.1 kHz Ready');
      return;
    }
    const res = await acousticModem.startMicrophoneListener((frameBytes, erasures) => {
      const decoded = decodeAndRepairFrame(frameBytes, erasures);
      setLastDecoded(decoded);
      setLastTxFrame(frameBytes);
      handlePacketDelivered({
        id: `MIC-${Date.now().toString(36)}`,
        receivedAt: Date.now(),
        sourceTransport: 'ACOUSTIC_MIC',
        decoded,
        rxSignalDbm: rfLink.rxSignalDbm,
        acknowledged: false,
      });
    });
    if (res.ok) {
      setMicListening(true);
      setModemState('Mic Goertzel RX');
    } else {
      setMicError(res.error ?? 'Microphone access denied');
    }
  };

  const buildPayload = (options?: TransmitOptions): FramePayload => {
    const effectiveMode: TxMode =
      options?.mode ?? (options?.code ? 'CUSTOM_FIELD_CODE' : txMode);
    if (effectiveMode === 'CUSTOM_FIELD_CODE') {
      return {
        kind: 'CUSTOM_FIELD_CODE',
        code: (options?.code || 'MED_EVAC').slice(0, 8),
      };
    }
    if (effectiveMode === 'FRIDGE_TELEMETRY') {
      const effectiveTemp = options?.fridgeTempC ?? fridgeTempC;
      return {
        kind: 'FRIDGE_TELEMETRY',
        tempC: effectiveTemp,
        alertCode: effectiveTemp > 8.0 ? 1 : 0,
        batteryPct: 88,
        flags: [0, 1, 1, 1],
      };
    }
    return {
      kind: 'MEDIC_SOS',
      lat: medicCoord.lat,
      lon: medicCoord.lon,
    };
  };

  const handleTransmit = (options?: TransmitOptions) => {
    if (pipelineBusy) return;

    const micSample = acousticModem.sampleMicFrame();
    const senseBuf = micSample?.timeDomain ?? new Float32Array(512);
    const lbt = checkCarrierSense(senseBuf, humanVoiceActive);

    if (!lbt.clear) {
      setModemState('Carrier Busy Wait');
      setPipelineNote(lbt.reason);
      return;
    }

    const payload = buildPayload(options);
    const frame = encodeFrame({
      nodeId: payload.kind === 'FRIDGE_TELEMETRY' ? 0x0101 : 0x0001,
      payload,
    });
    const modulated = modulateAfskFrame(frame);
    const noisyAudio =
      noisePercent > 0 ? addAcousticStatic(modulated.samples, noisePercent) : modulated.samples;

    setLastTxFrame(frame);
    setLastSamples(noisyAudio);
    setPipelineBusy(true);
    setModemState('PTT + 500ms Mark');
    setPipelineNote('PTT keyed via PC817 optocoupler · holding 500ms 1200Hz squelch front-porch...');

    const durMs = Math.round(modulated.durationSeconds * 1000);
    setPlaybackStartMs(performance.now());
    setPlaybackDurationMs(durMs);

    if (liveAudioSpeaker) {
      void acousticModem.playAfskBurst(noisyAudio, modulated.sampleRate);
    }

    const markTimer = window.setTimeout(() => {
      setModemState('TX AFSK Burst');
    }, 480);

    const rxTimer = window.setTimeout(() => {
      const noisyPacket = injectChannelNoise(frame, noisePercent);
      const decoded = decodeAndRepairFrame(
        noisyPacket.corruptedFrame,
        noisyPacket.erasureHints,
        frame
      );

      setLastDecoded(decoded);
      setPipelineBusy(false);
      setModemState('44.1 kHz Ready');

      setPipelineNote(
        decoded.valid
          ? decoded.repairedByteCount > 0
            ? `Decoded & repaired ${decoded.repairedByteCount} corrupted byte(s) via GF(2^8) Reed-Solomon FEC.`
            : 'Frame received intact with zero bit errors. CRC-16-CCITT verified.'
          : `Frame rejected by CRC-16-CCITT: ${decoded.failureReason}`
      );

      const entry: KioskLogEntry = {
        id: `PKT-${Date.now().toString(36)}-${Math.floor(Math.random() * 900 + 100)}`,
        receivedAt: Date.now(),
        sourceTransport: 'VHF_BROADCAST',
        decoded,
        rxSignalDbm: rfLink.rxSignalDbm,
        acknowledged: false,
      };
      handlePacketDelivered(entry);

      if (typeof BroadcastChannel !== 'undefined') {
        const ch = new BroadcastChannel(SCREECH_CHANNEL_NAME);
        const msg: BroadcastPacketMessage = {
          type: 'AFSK_BURST',
          id: entry.id,
          sentAt: entry.receivedAt,
          txBytes: Array.from(frame),
          rxBytes: Array.from(noisyPacket.corruptedFrame),
          erasureRsIndices: noisyPacket.erasureHints,
          noisePercent,
          rxSignalDbm: rfLink.rxSignalDbm,
        };
        ch.postMessage(msg);
        ch.close();
      }
    }, Math.max(950, durMs + 20));

    txTimersRef.current.push(markTimer, rxTimer);
  };

  const handleExportWav = () => {
    const frame =
      lastTxFrame ??
      encodeFrame({
        nodeId: 0x0001,
        payload: buildPayload(),
      });
    const mod = modulateAfskFrame(frame);
    const wavBytes = encodeWavFile(mod.samples, mod.sampleRate);
    const blob = new Blob([new Uint8Array(wavBytes)], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `screech_afsk_146520_${Date.now()}.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const decodedPins: DecodedMapPin[] = useMemo(() => {
    const pins: DecodedMapPin[] = [];
    for (const log of kioskLogs) {
      if (log.decoded.valid && log.decoded.payload?.kind === 'MEDIC_SOS') {
        pins.push({
          id: log.id,
          lat: log.decoded.payload.lat,
          lon: log.decoded.payload.lon,
          label: `NODE 0x${log.decoded.nodeId.toString(16).padStart(4, '0').toUpperCase()}`,
          timestamp: log.receivedAt,
        });
      } else if (
        log.decoded.valid &&
        log.decoded.packetType === PacketType.FridgeTelemetry &&
        log.decoded.payload?.kind === 'FRIDGE_TELEMETRY' &&
        log.decoded.payload.tempC > 8.0
      ) {
        pins.push({
          id: log.id,
          lat: preset.clinic.lat,
          lon: preset.clinic.lon,
          label: `FRIDGE ALARM ${log.decoded.payload.tempC.toFixed(1)}°C`,
          timestamp: log.receivedAt,
        });
      }
    }
    return pins;
  }, [kioskLogs, preset.clinic.lat, preset.clinic.lon]);

  if (isStandaloneKiosk) {
    return (
      <div className="min-h-screen bg-[#F9F9F8] dark:bg-[#111110] text-[#1A1A19] dark:text-[#F2F0EA] flex flex-col">
        <div className="px-4 py-2.5 border-b border-[#E7E6E2] dark:border-[#2A2A28] bg-white dark:bg-[#181817] flex items-center justify-between">
          <span className="text-xs font-semibold">Screech — Town Ranger Kiosk Receiver</span>
          <span className="text-xs font-mono text-[#15803D]">BroadcastChannel &amp; TRRS Active</span>
        </div>
        <div className="flex-1 p-3.5">
          <div className="h-full rounded-xl border border-[#E7E6E2] dark:border-[#2A2A28] overflow-hidden">
            <RangerKioskPanel
              logs={kioskLogs}
              onAcknowledge={(id) =>
                setKioskLogs((prev) =>
                  prev.map((l) => (l.id === id ? { ...l, acknowledged: true } : l))
                )
              }
              onAcknowledgeAll={() =>
                setKioskLogs((prev) => prev.map((l) => ({ ...l, acknowledged: true })))
              }
              alarmMuted={alarmMuted}
              onToggleMute={() => setAlarmMuted((m) => !m)}
              preset={preset}
              medicCoord={medicCoord}
              truckCoord={truckCoord}
              rfLink={rfLink}
              repeaterEnabled={repeaterEnabled}
              roadWashedOut={roadWashedOut}
              decodedPins={decodedPins}
              isStandaloneKiosk
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F9F9F8] dark:bg-[#111110] text-[#1A1A19] dark:text-[#F2F0EA] flex">
      <SidebarNav
        activeWorkspace={activeWorkspace}
        onSelectWorkspace={setActiveWorkspace}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onQuickTransmit={() => {
          setActiveWorkspace('screech');
          handleTransmit();
        }}
        isDark={isDark}
        onToggleTheme={() => setIsDark((d) => !d)}
        selectedNodeFilter={selectedNodeFilter}
        onSelectNodeFilter={setSelectedNodeFilter}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
        pipelineBusy={pipelineBusy}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        <TopStudioHeader
          activeWorkspace={activeWorkspace}
          rfLink={rfLink}
          gpsLocked={gpsLocked}
          modemState={modemState}
          splitKioskOpen={splitKioskOpen}
          pipelineBusy={pipelineBusy}
          onToggleSplitKiosk={() => setSplitKioskOpen((s) => !s)}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          onQuickTransmit={() => handleTransmit()}
        />

        <div className="flex-1 p-3.5 flex flex-col xl:flex-row gap-3.5 items-stretch">
          <main className="flex-1 min-w-0">
            {activeWorkspace === 'screech' && (
              <ScreechBentoView
                lastSamples={lastSamples}
                playbackStartMs={playbackStartMs}
                playbackDurationMs={playbackDurationMs}
                humanVoiceActive={humanVoiceActive}
                noisePercent={noisePercent}
                isDark={isDark}
                lastTxFrame={lastTxFrame}
                lastDecoded={lastDecoded}
                rfLink={rfLink}
                kioskLogs={kioskLogs}
                onAcknowledge={(id) =>
                  setKioskLogs((prev) =>
                    prev.map((l) => (l.id === id ? { ...l, acknowledged: true } : l))
                  )
                }
                searchQuery={searchQuery}
              />
            )}

            {activeWorkspace === 'map' && (
              <GeospatialWorkspace
                preset={preset}
                onSelectPreset={(id) => {
                  const next = DESERT_PRESETS.find((p) => p.id === id);
                  if (!next) return;
                  setPresetId(id);
                  setMedicCoord(next.medic);
                  setGpsLocked(false);
                }}
                medicCoord={medicCoord}
                onMedicCoordChange={setMedicCoord}
                truckCoord={truckCoord}
                truckProgress={truckProgress}
                rfLink={rfLink}
                repeaterEnabled={repeaterEnabled}
                onToggleRepeater={() => setRepeaterEnabled((r) => !r)}
                roadWashedOut={roadWashedOut}
                decodedPins={decodedPins}
              />
            )}

            {activeWorkspace === 'postman' && (
              <PostmanWorkspace
                bundles={bundles}
                receipts={receipts}
                truckProgress={truckProgress}
                truckSpeedMode={truckSpeedMode}
                roadWashedOut={roadWashedOut}
                nearestStation={nearestStation}
                onQueueBundle={(b) => setBundles((prev) => [b, ...prev])}
                onSetTruckProgress={(p) => {
                  setTruckSpeedMode('IDLE');
                  setTruckProgress(p);
                }}
                onDispatchTruck={(dir) => setTruckSpeedMode(dir)}
                onToggleRoadWashedOut={() => {
                  setRoadWashedOut((w) => !w);
                  setTruckSpeedMode('IDLE');
                }}
                onResetStorage={async () => {
                  const fresh = await resetDtnStorage();
                  setBundles(fresh.bundles);
                  setReceipts(fresh.receipts);
                }}
              />
            )}

            {activeWorkspace === 'architecture' && <ArchitectureWorkspace />}
          </main>

          {/* Right Panel: Docked Kiosk Receiver OR Live Transceiver Command Drawer */}
          {splitKioskOpen ? (
            <aside
              aria-label="Docked Ranger Kiosk Receiver"
              className="w-full xl:w-[356px] shrink-0 rounded-xl border border-[#E7E6E2] dark:border-[#2A2A28] overflow-hidden"
            >
              <RangerKioskPanel
                logs={kioskLogs}
                onAcknowledge={(id) =>
                  setKioskLogs((prev) =>
                    prev.map((l) => (l.id === id ? { ...l, acknowledged: true } : l))
                  )
                }
                onAcknowledgeAll={() =>
                  setKioskLogs((prev) => prev.map((l) => ({ ...l, acknowledged: true })))
                }
                alarmMuted={alarmMuted}
                onToggleMute={() => setAlarmMuted((m) => !m)}
                preset={preset}
                medicCoord={medicCoord}
                truckCoord={truckCoord}
                rfLink={rfLink}
                repeaterEnabled={repeaterEnabled}
                roadWashedOut={roadWashedOut}
                decodedPins={decodedPins}
              />
            </aside>
          ) : (
            activeWorkspace === 'screech' && (
              <RightTransceiverDrawer
                txMode={txMode}
                onChangeTxMode={setTxMode}
                medicCoord={medicCoord}
                onMedicCoordChange={setMedicCoord}
                fridgeTempC={fridgeTempC}
                onFridgeTempChange={setFridgeTempC}
                noisePercent={noisePercent}
                onNoisePercentChange={setNoisePercent}
                humanVoiceActive={humanVoiceActive}
                onToggleHumanVoice={(checked) => {
                  setHumanVoiceActive(checked);
                  if (!checked && modemState === 'Carrier Busy Wait') {
                    setModemState('44.1 kHz Ready');
                    setPipelineNote('Channel clear. Ready to modulate 28-byte frames.');
                  }
                }}
                liveAudioSpeaker={liveAudioSpeaker}
                onToggleSpeaker={setLiveAudioSpeaker}
                micListening={micListening}
                onToggleMic={handleToggleMic}
                micError={micError}
                pipelineNote={pipelineNote}
                pipelineBusy={pipelineBusy}
                onTransmit={handleTransmit}
                onExportWav={handleExportWav}
                onLockGps={handleLockGps}
                gpsLoading={gpsLoading}
                lastDecoded={lastDecoded}
                kioskLogs={kioskLogs}
              />
            )
          )}
        </div>
      </div>

      <OfflineIndicator />
    </div>
  );
}

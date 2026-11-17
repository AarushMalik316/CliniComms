import React from 'react';
import { Mountain, Radio, RotateCcw } from 'lucide-react';
import {
  DESERT_PRESETS,
  DesertFieldPreset,
  GeoCoord,
  RfLinkAnalysis,
  haversineDistanceKm,
} from '@/src/lib/geodesic/rf';
import { DecodedMapPin, DesertLeafletMap } from './DesertLeafletMap';

interface GeospatialWorkspaceProps {
  preset: DesertFieldPreset;
  onSelectPreset: (presetId: string) => void;
  medicCoord: GeoCoord;
  onMedicCoordChange: (coord: GeoCoord) => void;
  truckCoord: GeoCoord;
  truckProgress: number;
  rfLink: RfLinkAnalysis;
  repeaterEnabled: boolean;
  onToggleRepeater: () => void;
  roadWashedOut: boolean;
  decodedPins: DecodedMapPin[];
}

export const GeospatialWorkspace: React.FC<GeospatialWorkspaceProps> = ({
  preset,
  onSelectPreset,
  medicCoord,
  onMedicCoordChange,
  truckCoord,
  truckProgress,
  rfLink,
  repeaterEnabled,
  onToggleRepeater,
  roadWashedOut,
  decodedPins,
}) => {
  const moveMedicToCanyonShadow = () => {
    const dLat = preset.canyonRidgeCenter.lat - preset.townPost.lat;
    const dLon = preset.canyonRidgeCenter.lon - preset.townPost.lon;
    onMedicCoordChange({
      lat: Number((preset.canyonRidgeCenter.lat + dLat * 0.25).toFixed(5)),
      lon: Number((preset.canyonRidgeCenter.lon + dLon * 0.25).toFixed(5)),
      elevationM: 145,
    });
  };

  const truckToClinicKm = haversineDistanceKm(truckCoord, preset.clinic);

  const svgW = 760;
  const svgH = 148;
  const padL = 42;
  const padR = 16;
  const padT = 16;
  const padB = 24;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;

  const elevations = rfLink.profile.flatMap((p) => [p.terrainM, p.losHeightM, p.fresnelBottomM]);
  const minElev = Math.floor(Math.min(...elevations) / 50) * 50;
  const maxElev = Math.ceil(Math.max(...elevations) / 50) * 50 + 50;
  const elevSpan = Math.max(100, maxElev - minElev);

  const toX = (f: number) => padL + f * plotW;
  const toY = (m: number) => padT + plotH - ((m - minElev) / elevSpan) * plotH;

  const terrainPts = rfLink.profile
    .map((p) => `${toX(p.fraction).toFixed(1)},${toY(p.terrainM).toFixed(1)}`)
    .join(' ');
  const terrainArea = `${toX(0).toFixed(1)},${(padT + plotH).toFixed(1)} ${terrainPts} ${toX(1).toFixed(1)},${(padT + plotH).toFixed(1)}`;
  const losPts = rfLink.profile
    .map((p) => `${toX(p.fraction).toFixed(1)},${toY(p.losHeightM).toFixed(1)}`)
    .join(' ');
  const fresnelPts = rfLink.profile
    .map((p) => `${toX(p.fraction).toFixed(1)},${toY(p.fresnelBottomM).toFixed(1)}`)
    .join(' ');

  return (
    <div className="space-y-3.5">
      {/* Controls & Map Card */}
      <div className="rounded-xl border border-[#E7E6E2] dark:border-[#2A2A28] bg-white dark:bg-[#181817] overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
        <div className="px-4 py-3 border-b border-[#F1F1EE] dark:border-[#242422] flex flex-wrap items-center justify-between gap-2.5">
          <div>
            <h2 className="text-[13px] font-semibold text-[#1A1A19] dark:text-[#F2F0EA]">
              Topographic Field Map &amp; VHF Line-of-Sight
            </h2>
            <p className="text-xs text-[#8A8984]">
              Drag the Medic_01 pin to calculate real Haversine distance, FSPL, and canyon diffraction
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Select desert field sector"
              value={preset.id}
              onChange={(e) => onSelectPreset(e.target.value)}
              className="rounded-lg border border-[#E7E6E2] dark:border-[#2A2A28] bg-[#F9F9F8] dark:bg-[#141413] px-2.5 py-1.5 text-xs text-[#1A1A19] dark:text-[#F2F0EA] cursor-pointer"
            >
              {DESERT_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={onToggleRepeater}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                repeaterEnabled
                  ? 'border-[#15803D]/30 bg-[#ECFDF5] text-[#15803D] dark:bg-[#052E16] dark:text-[#4ADE80]'
                  : 'border-[#C81E1E]/30 bg-[#FEF2F2] text-[#C81E1E]'
              }`}
            >
              <Radio className="w-3.5 h-3.5" aria-hidden="true" />
              Repeater: {repeaterEnabled ? 'Online' : 'Offline'}
            </button>

            <button
              type="button"
              onClick={moveMedicToCanyonShadow}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#E7E6E2] dark:border-[#2A2A28] bg-white dark:bg-[#181817] px-2.5 py-1.5 text-xs font-medium text-[#B45309] hover:border-[#C2934B] transition-colors cursor-pointer whitespace-nowrap"
            >
              <Mountain className="w-3.5 h-3.5" aria-hidden="true" />
              Test Canyon Blockage
            </button>

            <button
              type="button"
              onClick={() => onMedicCoordChange(preset.medic)}
              className="inline-flex items-center gap-1 rounded-lg border border-[#E7E6E2] dark:border-[#2A2A28] bg-white dark:bg-[#181817] px-2.5 py-1.5 text-xs text-[#5C5B57] dark:text-[#C8C6BE] hover:border-[#1A1A19] transition-colors cursor-pointer whitespace-nowrap"
            >
              <RotateCcw className="w-3 h-3" aria-hidden="true" />
              Reset
            </button>
          </div>
        </div>

        <DesertLeafletMap
          preset={preset}
          medicCoord={medicCoord}
          truckCoord={truckCoord}
          rfLink={rfLink}
          repeaterEnabled={repeaterEnabled}
          roadWashedOut={roadWashedOut}
          decodedPins={decodedPins}
          onMedicDrag={onMedicCoordChange}
          heightClass="h-[380px]"
        />
      </div>

      {/* Bottom Row: RF Metrics + Elevation Profile */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-3.5">
        <div className="xl:col-span-4 rounded-xl border border-[#E7E6E2] dark:border-[#2A2A28] bg-white dark:bg-[#181817] p-4 space-y-2.5 text-xs tabular-nums">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-semibold text-[#1A1A19] dark:text-[#F2F0EA]">
              Link Analysis
            </span>
            <span
              data-testid="rf-link-status"
              className={`font-mono font-semibold ${
                rfLink.linkQuality === 'CLEAR'
                  ? 'text-[#15803D]'
                  : rfLink.linkQuality === 'DEGRADED'
                  ? 'text-[#B45309]'
                  : 'text-[#C81E1E]'
              }`}
            >
              {rfLink.linkQuality} · {rfLink.rxSignalDbm.toFixed(1)} dBm
            </span>
          </div>

          <div className="divide-y divide-[#F1F1EE] dark:divide-[#242422]">
            <div className="py-1.5 flex justify-between">
              <span className="text-[#8A8984]">Haversine Distance</span>
              <span className="font-mono">{rfLink.distanceKm.toFixed(2)} km</span>
            </div>
            <div className="py-1.5 flex justify-between">
              <span className="text-[#8A8984]">Azimuth Bearing</span>
              <span className="font-mono">{rfLink.bearingDeg.toFixed(1)}°</span>
            </div>
            <div className="py-1.5 flex justify-between">
              <span className="text-[#8A8984]">FSPL (146.52 MHz)</span>
              <span className="font-mono">{rfLink.fsplDb.toFixed(1)} dB</span>
            </div>
            <div className="py-1.5 flex justify-between">
              <span className="text-[#8A8984]">Knife-Edge Diffraction</span>
              <span className="font-mono">+{rfLink.diffractionLossDb.toFixed(1)} dB</span>
            </div>
            <div className="py-1.5 flex justify-between">
              <span className="text-[#8A8984]">Truck to Clinic_01</span>
              <span className="font-mono">
                {truckToClinicKm.toFixed(1)} km ({Math.round(truckProgress * 100)}%)
              </span>
            </div>
          </div>
        </div>

        <div className="xl:col-span-8 rounded-xl border border-[#E7E6E2] dark:border-[#2A2A28] bg-white dark:bg-[#181817] p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-[13px] font-semibold text-[#1A1A19] dark:text-[#F2F0EA]">
              Elevation &amp; 1st Fresnel Clearance
            </span>
            <span className="text-xs text-[#8A8984] font-mono tabular-nums">
              {rfLink.viaRepeater
                ? 'Routed via Hilltop Repeater'
                : rfLink.obstructed
                ? `Canyon Obstructed (+${rfLink.maxObstructionM.toFixed(0)}m)`
                : 'Clear Line of Sight'}
            </span>
          </div>

          <svg
            viewBox={`0 0 ${svgW} ${svgH}`}
            className="w-full h-[148px] rounded-lg bg-[#F9F9F8] dark:bg-[#141413]"
            role="img"
            aria-label="VHF Terrain Elevation and Line of Sight Fresnel Profile"
          >
            {[0.25, 0.5, 0.75].map((f) => {
              const y = padT + f * plotH;
              const m = Math.round(maxElev - f * elevSpan);
              return (
                <g key={f}>
                  <line x1={padL} y1={y} x2={svgW - padR} y2={y} stroke="#E7E6E2" strokeOpacity="0.6" />
                  <text x={6} y={y + 3} fontSize="9" fontFamily="JetBrains Mono, monospace" fill="#8A8984">
                    {m}m
                  </text>
                </g>
              );
            })}

            <polygon points={terrainArea} fill="#C2934B" fillOpacity="0.18" />
            <polyline points={terrainPts} fill="none" stroke="#C2934B" strokeWidth="1.8" />
            <polyline points={fresnelPts} fill="none" stroke="#8A8984" strokeWidth="1" strokeDasharray="4 4" />
            <polyline
              points={losPts}
              fill="none"
              stroke={rfLink.obstructed ? '#C81E1E' : '#15803D'}
              strokeWidth="2"
            />

            <text x={padL} y={svgH - 6} fontSize="9" fontFamily="JetBrains Mono, monospace" fill="#8A8984">
              0.0 km (TX)
            </text>
            <text x={svgW - padR - 72} y={svgH - 6} fontSize="9" fontFamily="JetBrains Mono, monospace" fill="#8A8984">
              {rfLink.distanceKm.toFixed(1)} km (RX)
            </text>
          </svg>
        </div>
      </div>
    </div>
  );
};

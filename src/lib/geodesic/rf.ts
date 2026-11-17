export interface GeoCoord {
  lat: number;
  lon: number;
  elevationM?: number;
}

export interface DesertFieldPreset {
  id: string;
  name: string;
  region: string;
  clinic: GeoCoord;
  medic: GeoCoord;
  repeater: GeoCoord;
  townPost: GeoCoord;
  hospital: GeoCoord;
  canyonRidgeCenter: GeoCoord;
  canyonRidgeRadiusKm: number;
  canyonHeightM: number;
  waypoints: GeoCoord[];
}

export const VHF_FREQUENCY_MHZ = 146.52;

export const DESERT_PRESETS: DesertFieldPreset[] = [
  {
    id: 'rub-al-khali',
    name: "Rub' al Khali Sector 4",
    region: 'Empty Quarter Deep Dunes',
    clinic: { lat: 24.9124, lon: 55.3821, elevationM: 185 },
    medic: { lat: 24.9682, lon: 55.4415, elevationM: 192 },
    repeater: { lat: 25.0412, lon: 55.3490, elevationM: 490 },
    townPost: { lat: 25.2048, lon: 55.2708, elevationM: 18 },
    hospital: { lat: 25.2185, lon: 55.2842, elevationM: 14 },
    canyonRidgeCenter: { lat: 25.0080, lon: 55.4850 },
    canyonRidgeRadiusKm: 4.5,
    canyonHeightM: 640,
    waypoints: [
      { lat: 25.2185, lon: 55.2842, elevationM: 14 },
      { lat: 25.1720, lon: 55.3010, elevationM: 42 },
      { lat: 25.1150, lon: 55.3280, elevationM: 96 },
      { lat: 25.0510, lon: 55.3460, elevationM: 140 },
      { lat: 24.9890, lon: 55.3650, elevationM: 162 },
      { lat: 24.9410, lon: 55.3740, elevationM: 178 },
      { lat: 24.9124, lon: 55.3821, elevationM: 185 },
    ],
  },
  {
    id: 'wadi-rum',
    name: 'Wadi Rum Clinic Outpost',
    region: 'Southern Sandstone Canyons',
    clinic: { lat: 29.5765, lon: 35.4194, elevationM: 950 },
    medic: { lat: 29.6210, lon: 35.4580, elevationM: 980 },
    repeater: { lat: 29.6650, lon: 35.3910, elevationM: 1480 },
    townPost: { lat: 29.7420, lon: 35.3420, elevationM: 810 },
    hospital: { lat: 29.7560, lon: 35.3310, elevationM: 805 },
    canyonRidgeCenter: { lat: 29.6050, lon: 35.4950 },
    canyonRidgeRadiusKm: 3.8,
    canyonHeightM: 1620,
    waypoints: [
      { lat: 29.7560, lon: 35.3310, elevationM: 805 },
      { lat: 29.7180, lon: 35.3540, elevationM: 830 },
      { lat: 29.6740, lon: 35.3790, elevationM: 880 },
      { lat: 29.6320, lon: 35.3980, elevationM: 915 },
      { lat: 29.5980, lon: 35.4110, elevationM: 938 },
      { lat: 29.5765, lon: 35.4194, elevationM: 950 },
    ],
  },
  {
    id: 'thar-desert',
    name: 'Thar Desert Mobile Unit',
    region: 'Western Arid Frontier',
    clinic: { lat: 26.8120, lon: 70.8240, elevationM: 225 },
    medic: { lat: 26.8640, lon: 70.8820, elevationM: 218 },
    repeater: { lat: 26.9050, lon: 70.8990, elevationM: 390 },
    townPost: { lat: 26.9157, lon: 70.9083, elevationM: 229 },
    hospital: { lat: 26.9230, lon: 70.9190, elevationM: 231 },
    canyonRidgeCenter: { lat: 26.8480, lon: 70.9450 },
    canyonRidgeRadiusKm: 4.0,
    canyonHeightM: 580,
    waypoints: [
      { lat: 26.9230, lon: 70.9190, elevationM: 231 },
      { lat: 26.9010, lon: 70.8960, elevationM: 228 },
      { lat: 26.8750, lon: 70.8710, elevationM: 224 },
      { lat: 26.8460, lon: 70.8480, elevationM: 221 },
      { lat: 26.8120, lon: 70.8240, elevationM: 225 },
    ],
  },
];

const EARTH_RADIUS_KM = 6371.0;

export function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/**
 * Computes great-circle Haversine distance in kilometers between two WGS84 points.
 */
export function haversineDistanceKm(a: GeoCoord, b: GeoCoord): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return EARTH_RADIUS_KM * c;
}

/**
 * Computes initial azimuth bearing in degrees (0..360) from point A to point B.
 */
export function computeBearingDeg(a: GeoCoord, b: GeoCoord): number {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLon = toRad(b.lon - a.lon);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/**
 * Free-Space Path Loss in dB:
 * FSPL(dB) = 32.44 + 20*log10(distance_km) + 20*log10(freq_MHz)
 */
export function computeFsplDb(distanceKm: number, freqMhz = VHF_FREQUENCY_MHZ): number {
  const d = Math.max(0.01, distanceKm);
  return 32.44 + 20 * Math.log10(d) + 20 * Math.log10(freqMhz);
}

export interface ElevationSample {
  fraction: number;
  distanceKm: number;
  terrainM: number;
  losHeightM: number;
  fresnelBottomM: number;
}

export interface RfLinkAnalysis {
  distanceKm: number;
  bearingDeg: number;
  fsplDb: number;
  diffractionLossDb: number;
  totalPathLossDb: number;
  rxSignalDbm: number;
  linkQuality: 'CLEAR' | 'DEGRADED' | 'BLOCKED';
  obstructed: boolean;
  maxObstructionM: number;
  profile: ElevationSample[];
  viaRepeater: boolean;
}

/**
 * Evaluates terrain elevation along a path including the canyon ridge obstacle
 * and computes knife-edge diffraction loss at 146.520 MHz VHF.
 */
export function analyzeVhfLink(
  tx: GeoCoord,
  rx: GeoCoord,
  preset: DesertFieldPreset,
  repeaterEnabled = true
): RfLinkAnalysis {
  const direct = evaluateSingleHop(tx, rx, preset);
  if (!direct.obstructed || !repeaterEnabled) {
    return { ...direct, viaRepeater: false };
  }

  // Try routing via Hilltop VHF Repeater if direct LOS is shadowed by canyon ridge
  const hop1 = evaluateSingleHop(tx, preset.repeater, preset);
  const hop2 = evaluateSingleHop(preset.repeater, rx, preset);

  const viaRepeaterRx = Math.min(hop1.rxSignalDbm, hop2.rxSignalDbm);
  if (viaRepeaterRx > direct.rxSignalDbm + 6) {
    const worstObstructed = hop1.obstructed || hop2.obstructed;
    return {
      distanceKm: hop1.distanceKm + hop2.distanceKm,
      bearingDeg: hop1.bearingDeg,
      fsplDb: hop1.fsplDb,
      diffractionLossDb: hop1.diffractionLossDb + hop2.diffractionLossDb,
      totalPathLossDb: hop1.totalPathLossDb,
      rxSignalDbm: viaRepeaterRx,
      linkQuality: worstObstructed ? (viaRepeaterRx > -116 ? 'DEGRADED' : 'BLOCKED') : 'CLEAR',
      obstructed: worstObstructed,
      maxObstructionM: Math.max(hop1.maxObstructionM, hop2.maxObstructionM),
      profile: hop1.profile,
      viaRepeater: true,
    };
  }

  return { ...direct, viaRepeater: false };
}

function evaluateSingleHop(
  tx: GeoCoord,
  rx: GeoCoord,
  preset: DesertFieldPreset
): Omit<RfLinkAnalysis, 'viaRepeater'> {
  const distanceKm = haversineDistanceKm(tx, rx);
  const bearingDeg = computeBearingDeg(tx, rx);
  const fsplDb = computeFsplDb(distanceKm, VHF_FREQUENCY_MHZ);

  const txElev = (tx.elevationM ?? preset.clinic.elevationM ?? 180) + 2; // 2m handheld mast
  const rxElev = (rx.elevationM ?? preset.townPost.elevationM ?? 50) + 12; // 12m base antenna

  const steps = 32;
  const profile: ElevationSample[] = [];
  let maxObstructionM = -999;
  let maxKnifeEdgeV = -999;

  const wavelengthM = 300 / VHF_FREQUENCY_MHZ; // ~2.047m

  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const pt: GeoCoord = {
      lat: tx.lat + (rx.lat - tx.lat) * f,
      lon: tx.lon + (rx.lon - tx.lon) * f,
    };

    // Base interpolated desert floor + canyon ridge Gaussian mountain obstacle
    const baseTerrain =
      (tx.elevationM ?? 180) * (1 - f) + (rx.elevationM ?? 180) * f;
    const distToRidge = haversineDistanceKm(pt, preset.canyonRidgeCenter);
    const ridgeFactor = Math.exp(
      -(distToRidge * distToRidge) / (2 * Math.pow(preset.canyonRidgeRadiusKm * 0.48, 2))
    );
    const terrainM = baseTerrain + preset.canyonHeightM * ridgeFactor * 0.85;

    // Earth bulge curvature + Line of Sight ray
    const d1m = Math.max(1, f * distanceKm * 1000);
    const d2m = Math.max(1, (1 - f) * distanceKm * 1000);
    const totalM = Math.max(1, distanceKm * 1000);
    const earthBulge = (d1m * d2m) / (2 * 6371000 * 1.333);
    const losHeightM = txElev + (rxElev - txElev) * f - earthBulge;

    const fresnelRadius = Math.sqrt((wavelengthM * d1m * d2m) / totalM);
    const fresnelBottomM = losHeightM - 0.6 * fresnelRadius;

    const obstructionM = terrainM - losHeightM;
    if (obstructionM > maxObstructionM) {
      maxObstructionM = obstructionM;
    }

    if (i > 0 && i < steps) {
      const h = terrainM - losHeightM;
      const v = h * Math.sqrt((2 * (d1m + d2m)) / (wavelengthM * d1m * d2m));
      if (v > maxKnifeEdgeV) maxKnifeEdgeV = v;
    }

    profile.push({
      fraction: f,
      distanceKm: f * distanceKm,
      terrainM,
      losHeightM,
      fresnelBottomM,
    });
  }

  // ITU-R P.526 knife-edge diffraction loss approximation
  let diffractionLossDb = 0;
  if (maxKnifeEdgeV > -0.78) {
    diffractionLossDb =
      6.9 +
      20 *
        Math.log10(
          Math.sqrt(Math.pow(maxKnifeEdgeV - 0.1, 2) + 1) + maxKnifeEdgeV - 0.1
        );
  }
  diffractionLossDb = Math.max(0, Math.min(48, diffractionLossDb));

  // Typical 5W VHF handheld = +37 dBm ERP
  const txPowerDbm = 37;
  const totalPathLossDb = fsplDb + diffractionLossDb;
  const rxSignalDbm = txPowerDbm - totalPathLossDb;
  const obstructed = maxObstructionM > 0;

  let linkQuality: 'CLEAR' | 'DEGRADED' | 'BLOCKED' = 'CLEAR';
  if (rxSignalDbm < -118 || diffractionLossDb > 24) {
    linkQuality = 'BLOCKED';
  } else if (rxSignalDbm < -102 || diffractionLossDb > 8) {
    linkQuality = 'DEGRADED';
  }

  return {
    distanceKm,
    bearingDeg,
    fsplDb,
    diffractionLossDb,
    totalPathLossDb,
    rxSignalDbm,
    linkQuality,
    obstructed,
    maxObstructionM: Math.max(0, maxObstructionM),
    profile,
  };
}

/**
 * Interpolates a coordinate along a polyline of waypoints given normalized progress t in [0, 1].
 */
export function interpolateRoute(
  waypoints: GeoCoord[],
  progress: number
): { coord: GeoCoord; totalKm: number; traveledKm: number } {
  if (waypoints.length === 0) {
    return { coord: { lat: 0, lon: 0 }, totalKm: 0, traveledKm: 0 };
  }
  if (waypoints.length === 1) {
    return { coord: waypoints[0], totalKm: 0, traveledKm: 0 };
  }

  const segLengths: number[] = [];
  let totalKm = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const d = haversineDistanceKm(waypoints[i], waypoints[i + 1]);
    segLengths.push(d);
    totalKm += d;
  }

  const clamped = Math.max(0, Math.min(1, progress));
  const targetKm = clamped * totalKm;
  let accKm = 0;

  for (let i = 0; i < segLengths.length; i++) {
    const seg = segLengths[i];
    if (accKm + seg >= targetKm || i === segLengths.length - 1) {
      const localT = seg > 0 ? (targetKm - accKm) / seg : 0;
      const a = waypoints[i];
      const b = waypoints[i + 1];
      return {
        coord: {
          lat: a.lat + (b.lat - a.lat) * localT,
          lon: a.lon + (b.lon - a.lon) * localT,
          elevationM: (a.elevationM ?? 0) + ((b.elevationM ?? 0) - (a.elevationM ?? 0)) * localT,
        },
        totalKm,
        traveledKm: targetKm,
      };
    }
    accKm += seg;
  }

  return { coord: waypoints[waypoints.length - 1], totalKm, traveledKm: totalKm };
}

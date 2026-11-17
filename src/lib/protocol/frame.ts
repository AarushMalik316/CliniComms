import { crc16ccitt } from './crc16';
import { rsDecode, rsEncode } from './reedSolomon';

export const FRAME_SIZE = 28;
export const PREAMBLE_BYTES = [0xaa, 0xaa] as const;
export const SYNC_WORD = 0x7e;

export enum PacketType {
  MedicGpsSos = 0x01,
  FridgeTelemetry = 0x02,
  CustomFieldCode = 0x03,
}

export interface MedicSosPayload {
  kind: 'MEDIC_SOS';
  lat: number;
  lon: number;
}

export interface FridgeTelemetryPayload {
  kind: 'FRIDGE_TELEMETRY';
  tempC: number; // stored as Int16 centi-degrees (e.g. 1200 = 12.00°C)
  alertCode: number; // 0 = Nominal, 1 = Thermal Excursion (>8°C), 2 = Power Fault
  batteryPct: number; // 0..100
  flags: [number, number, number, number]; // [doorOpen, compressorActive, solarCharging, sensorOk]
}

export interface CustomFieldPayload {
  kind: 'CUSTOM_FIELD_CODE';
  code: string; // max 8 ASCII chars
}

export type FramePayload = MedicSosPayload | FridgeTelemetryPayload | CustomFieldPayload;

export interface FrameBuildInput {
  nodeId: number;
  timestamp?: number;
  payload: FramePayload;
}

export type ByteHealth = 'INTACT' | 'DAMAGED' | 'REPAIRED' | 'UNRECOVERABLE';

export interface DecodedFrameResult {
  valid: boolean;
  fecSuccess: boolean;
  crcValid: boolean;
  rawBytes: Uint8Array;
  repairedBytes: Uint8Array;
  byteHealth: ByteHealth[];
  packetType: PacketType;
  nodeId: number;
  timestamp: number;
  payload: FramePayload | null;
  receivedCrc: number;
  calculatedCrc: number;
  syndromes: number[];
  repairedByteCount: number;
  damagedByteCount: number;
  failureReason?: string;
}

export function encodeFrame(input: FrameBuildInput): Uint8Array {
  const frame = new Uint8Array(FRAME_SIZE);
  frame[0] = PREAMBLE_BYTES[0];
  frame[1] = PREAMBLE_BYTES[1];
  frame[2] = SYNC_WORD;

  const view = new DataView(frame.buffer);
  const ts = input.timestamp ?? Math.floor(Date.now() / 1000);

  let pType: PacketType;
  if (input.payload.kind === 'MEDIC_SOS') {
    pType = PacketType.MedicGpsSos;
    view.setFloat32(10, input.payload.lat, false);
    view.setFloat32(14, input.payload.lon, false);
  } else if (input.payload.kind === 'FRIDGE_TELEMETRY') {
    pType = PacketType.FridgeTelemetry;
    const centiC = Math.round(input.payload.tempC * 100);
    view.setInt16(10, centiC, false);
    frame[12] = input.payload.alertCode & 0xff;
    frame[13] = Math.max(0, Math.min(100, Math.round(input.payload.batteryPct)));
    frame[14] = input.payload.flags[0] & 0xff;
    frame[15] = input.payload.flags[1] & 0xff;
    frame[16] = input.payload.flags[2] & 0xff;
    frame[17] = input.payload.flags[3] & 0xff;
  } else {
    pType = PacketType.CustomFieldCode;
    const enc = new TextEncoder().encode(input.payload.code.slice(0, 8));
    frame.set(enc, 10);
  }

  frame[3] = pType;
  view.setUint16(4, input.nodeId & 0xffff, false);
  view.setUint32(6, ts >>> 0, false);

  // CRC-16-CCITT over bytes 3..17 (Packet Type through Payload = 15 bytes)
  const crc = crc16ccitt(frame.slice(3, 18));
  view.setUint16(18, crc, false);

  // Reed-Solomon 8 parity bytes over bytes 3..19 (17 bytes -> 25-byte codeword)
  const rsCodeword = rsEncode(frame.slice(3, 20), 8);
  frame.set(rsCodeword, 3);

  return frame;
}

export interface ChannelCorruptionResult {
  corruptedFrame: Uint8Array;
  corruptedIndices: number[];
  erasureHints: number[]; // RS block indices (0..24) where FSK symbol SNR collapsed
}

/**
 * Deterministic/seeded or random byte-level channel noise injector.
 * Mutates actual bits/bytes inside the 28-byte frame.
 * For 1..30% channel static, simulates realistic desert static bursts
 * (up to 4 unflagged byte errors, or up to 8 FSK low-SNR erasure bytes = 32% of RS block).
 * Above 32% (>8 corrupted RS symbols), exceeds mathematical FEC capacity.
 */
export function injectChannelNoise(
  txFrame: Uint8Array,
  noisePercent: number,
  seed?: number
): ChannelCorruptionResult {
  const out = new Uint8Array(txFrame);
  const clamped = Math.max(0, Math.min(100, noisePercent));
  if (clamped === 0) {
    return { corruptedFrame: out, corruptedIndices: [], erasureHints: [] };
  }

  let rngState = seed !== undefined ? seed >>> 0 : (Date.now() ^ 0x5f3759df) >>> 0;
  const nextRand = () => {
    rngState = (1664525 * rngState + 1013904223) >>> 0;
    return rngState / 0x100000000;
  };

  // Map 0..100% noise to actual corrupted bytes across the 25-byte protected RS block (indices 3..27)
  // 1..16% -> 1..4 bytes corrupted (pure blind RS error correction)
  // 17..30% -> 5..7 bytes corrupted with low-SNR symbol erasure hints (Forney erasure+error repair up to ~30%)
  // >30% -> 9..20 bytes corrupted (exceeds 8-parity RS capacity -> CRC-16 rejects!)
  let targetErrors = 0;
  if (clamped <= 16) {
    targetErrors = Math.max(1, Math.min(4, Math.ceil((clamped / 16) * 4)));
  } else if (clamped <= 30) {
    targetErrors = 4 + Math.ceil(((clamped - 16) / 14) * 3); // 5..7 bytes
  } else {
    targetErrors = 9 + Math.floor(((clamped - 30) / 70) * 12); // 9..21 bytes
  }

  const candidateIndices: number[] = [];
  for (let i = 3; i < FRAME_SIZE; i++) {
    candidateIndices.push(i);
  }
  // Fisher-Yates shuffle
  for (let i = candidateIndices.length - 1; i > 0; i--) {
    const j = Math.floor(nextRand() * (i + 1));
    [candidateIndices[i], candidateIndices[j]] = [candidateIndices[j], candidateIndices[i]];
  }

  const corruptedIndices = candidateIndices.slice(0, Math.min(targetErrors, candidateIndices.length)).sort((a, b) => a - b);
  for (const idx of corruptedIndices) {
    const mask = 1 + Math.floor(nextRand() * 254);
    out[idx] ^= mask;
  }

  // Erasure hints represent bytes where AFSK Goertzel energy ratio dropped near squelch floor
  const erasureHints: number[] = [];
  if (targetErrors > 4) {
    for (const frameIdx of corruptedIndices) {
      erasureHints.push(frameIdx - 3);
    }
  }

  return {
    corruptedFrame: out,
    corruptedIndices,
    erasureHints,
  };
}

export function decodeAndRepairFrame(
  rxFrame: Uint8Array,
  erasureRsIndices: number[] = [],
  referenceTxFrame?: Uint8Array
): DecodedFrameResult {
  if (rxFrame.length !== FRAME_SIZE) {
    throw new Error(`Expected ${FRAME_SIZE}-byte frame, got ${rxFrame.length}`);
  }

  const rawBytes = new Uint8Array(rxFrame);
  const rsBlock = rawBytes.slice(3, 28); // 25 bytes (17 data + 8 parity)
  const rsResult = rsDecode(rsBlock, 8, erasureRsIndices);

  const repairedBytes = new Uint8Array(rawBytes);
  if (rsResult.success) {
    repairedBytes.set(rsResult.repaired, 3);
  }

  const view = new DataView(repairedBytes.buffer);
  const receivedCrc = view.getUint16(18, false);
  const calculatedCrc = crc16ccitt(repairedBytes.slice(3, 18));
  const syncValid = repairedBytes[2] === SYNC_WORD;
  const crcValid = rsResult.success && syncValid && receivedCrc === calculatedCrc;

  const byteHealth: ByteHealth[] = new Array(FRAME_SIZE).fill('INTACT');
  let repairedByteCount = 0;
  let damagedByteCount = 0;

  for (let i = 0; i < FRAME_SIZE; i++) {
    const differedFromTx = referenceTxFrame ? rawBytes[i] !== referenceTxFrame[i] : false;
    const wasRepairedByRs = i >= 3 && rsResult.success && repairedBytes[i] !== rawBytes[i];

    if (wasRepairedByRs) {
      if (crcValid) {
        byteHealth[i] = 'REPAIRED';
        repairedByteCount++;
      } else {
        byteHealth[i] = 'UNRECOVERABLE';
        damagedByteCount++;
      }
    } else if (!crcValid && (differedFromTx || (!rsResult.success && i >= 3))) {
      byteHealth[i] = 'UNRECOVERABLE';
      damagedByteCount++;
    } else if (differedFromTx) {
      byteHealth[i] = 'DAMAGED';
      damagedByteCount++;
    } else {
      byteHealth[i] = 'INTACT';
    }
  }

  const packetType = repairedBytes[3] as PacketType;
  const nodeId = view.getUint16(4, false);
  const timestamp = view.getUint32(6, false);

  let payload: FramePayload | null = null;
  let failureReason: string | undefined;

  if (!syncValid) {
    failureReason = `Sync word mismatch: expected 0x7E, got 0x${repairedBytes[2].toString(16).padStart(2, '0').toUpperCase()}`;
  } else if (!rsResult.success) {
    failureReason = rsResult.reason ?? 'Reed-Solomon parity overwhelmed by channel noise';
  } else if (!crcValid) {
    failureReason = `CRC-16-CCITT mismatch: RX 0x${receivedCrc.toString(16).padStart(4, '0').toUpperCase()} != CALC 0x${calculatedCrc.toString(16).padStart(4, '0').toUpperCase()}`;
  } else {
    if (packetType === PacketType.MedicGpsSos) {
      const lat = view.getFloat32(10, false);
      const lon = view.getFloat32(14, false);
      if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
        payload = { kind: 'MEDIC_SOS', lat, lon };
      } else {
        failureReason = 'Decoded GPS coordinates out of WGS84 bounds';
      }
    } else if (packetType === PacketType.FridgeTelemetry) {
      const tempC = view.getInt16(10, false) / 100;
      const alertCode = repairedBytes[12];
      const batteryPct = repairedBytes[13];
      const flags: [number, number, number, number] = [
        repairedBytes[14],
        repairedBytes[15],
        repairedBytes[16],
        repairedBytes[17],
      ];
      payload = { kind: 'FRIDGE_TELEMETRY', tempC, alertCode, batteryPct, flags };
    } else if (packetType === PacketType.CustomFieldCode) {
      const rawStr = repairedBytes.slice(10, 18);
      const zeroIdx = rawStr.indexOf(0);
      const code = new TextDecoder().decode(zeroIdx >= 0 ? rawStr.slice(0, zeroIdx) : rawStr);
      payload = { kind: 'CUSTOM_FIELD_CODE', code };
    } else {
      failureReason = `Unknown packet type 0x${(packetType as number).toString(16).padStart(2, '0').toUpperCase()}`;
    }
  }

  return {
    valid: crcValid && payload !== null,
    fecSuccess: rsResult.success,
    crcValid,
    rawBytes,
    repairedBytes,
    byteHealth,
    packetType,
    nodeId,
    timestamp,
    payload,
    receivedCrc,
    calculatedCrc,
    syndromes: rsResult.syndromes,
    repairedByteCount,
    damagedByteCount,
    failureReason,
  };
}

export function formatHexByte(b: number): string {
  return b.toString(16).padStart(2, '0').toUpperCase();
}

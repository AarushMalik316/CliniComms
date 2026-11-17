import test from 'node:test';
import assert from 'node:assert/strict';
import { crc16ccitt } from './crc16';
import { rsEncode, rsDecode } from './reedSolomon';
import {
  FRAME_SIZE,
  PacketType,
  decodeAndRepairFrame,
  encodeFrame,
  injectChannelNoise,
} from './frame';

test('CRC-16-CCITT produces deterministic 0x1021 checksums', () => {
  const check = crc16ccitt(new TextEncoder().encode('123456789'));
  assert.equal(check, 0x29b1);
});

test('Reed-Solomon GF(2^8) repairs up to 4 random errors without erasures', () => {
  const msg = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]);
  const cw = rsEncode(msg, 8);
  assert.equal(cw.length, 25);

  const corrupted = new Uint8Array(cw);
  corrupted[0] ^= 0xff;
  corrupted[5] ^= 0x3c;
  corrupted[14] ^= 0x81;
  corrupted[22] ^= 0x19;

  const decoded = rsDecode(corrupted, 8);
  assert.equal(decoded.success, true);
  assert.deepEqual(decoded.message, msg);
  assert.equal(decoded.correctedIndices.length, 4);
});

test('Reed-Solomon repairs 7 erasure-flagged symbols (~28-30% burst corruption)', () => {
  const msg = new Uint8Array(17).map((_, i) => (i * 13 + 7) & 0xff);
  const cw = rsEncode(msg, 8);
  const corrupted = new Uint8Array(cw);
  const erasures = [1, 4, 8, 11, 15, 19, 23];
  for (const idx of erasures) {
    corrupted[idx] ^= 0xaa;
  }

  const decoded = rsDecode(corrupted, 8, erasures);
  assert.equal(decoded.success, true);
  assert.deepEqual(decoded.message, msg);
});

test('28-byte Medic GPS SOS frame round-trips intact and repairs static noise', () => {
  const frame = encodeFrame({
    nodeId: 0x0001,
    timestamp: 1794855979,
    payload: { kind: 'MEDIC_SOS', lat: 24.9682, lon: 55.4415 },
  });
  assert.equal(frame.length, FRAME_SIZE);
  assert.equal(frame[0], 0xaa);
  assert.equal(frame[1], 0xaa);
  assert.equal(frame[2], 0x7e);
  assert.equal(frame[3], PacketType.MedicGpsSos);

  // Clean decode
  const clean = decodeAndRepairFrame(frame, [], frame);
  assert.equal(clean.valid, true);
  assert.equal(clean.crcValid, true);
  assert.equal(clean.payload?.kind, 'MEDIC_SOS');
  if (clean.payload?.kind === 'MEDIC_SOS') {
    assert.ok(Math.abs(clean.payload.lat - 24.9682) < 0.0001);
    assert.ok(Math.abs(clean.payload.lon - 55.4415) < 0.0001);
  }

  // 25% channel static -> RS repairs frame, CRC-16 passes
  const noisy = injectChannelNoise(frame, 25, 1337);
  const repaired = decodeAndRepairFrame(noisy.corruptedFrame, noisy.erasureHints, frame);
  assert.equal(repaired.valid, true);
  assert.equal(repaired.fecSuccess, true);
  assert.equal(repaired.crcValid, true);
  assert.ok(repaired.repairedByteCount > 0);

  // 65% catastrophic static -> exceeds RS capacity -> CRC-16 rejects
  const severe = injectChannelNoise(frame, 65, 9999);
  const rejected = decodeAndRepairFrame(severe.corruptedFrame, severe.erasureHints, frame);
  assert.equal(rejected.valid, false);
  assert.equal(rejected.crcValid, false);
});

test('28-byte Fridge Telemetry frame packs centi-degrees and flags accurately', () => {
  const frame = encodeFrame({
    nodeId: 0x0102,
    timestamp: 1794856000,
    payload: {
      kind: 'FRIDGE_TELEMETRY',
      tempC: 12.34,
      alertCode: 1,
      batteryPct: 84,
      flags: [1, 1, 0, 1],
    },
  });
  const decoded = decodeAndRepairFrame(frame, [], frame);
  assert.equal(decoded.valid, true);
  assert.equal(decoded.payload?.kind, 'FRIDGE_TELEMETRY');
  if (decoded.payload?.kind === 'FRIDGE_TELEMETRY') {
    assert.equal(decoded.payload.tempC, 12.34);
    assert.equal(decoded.payload.alertCode, 1);
    assert.equal(decoded.payload.batteryPct, 84);
    assert.deepEqual(decoded.payload.flags, [1, 1, 0, 1]);
  }
});

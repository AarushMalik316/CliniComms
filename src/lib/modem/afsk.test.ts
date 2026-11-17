import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SAMPLE_RATE,
  addAcousticStatic,
  checkCarrierSense,
  demodulateAfskAudio,
  encodeWavFile,
  modulateAfskFrame,
} from './afsk';
import { decodeAndRepairFrame, encodeFrame } from '../protocol/frame';

test('Carrier Sense blocks transmission on human voice or high RMS noise', () => {
  const quiet = new Float32Array(1024).fill(0.001);
  assert.equal(checkCarrierSense(quiet, false).clear, true);
  assert.equal(checkCarrierSense(quiet, true).clear, false);

  const loud = new Float32Array(1024).fill(0.25);
  assert.equal(checkCarrierSense(loud, false).clear, false);
});

test('Bell 202 AFSK modulation + Goertzel demodulation round-trips a 28-byte frame', () => {
  const frame = encodeFrame({
    nodeId: 0x0042,
    timestamp: 1794856100,
    payload: { kind: 'MEDIC_SOS', lat: 25.2048, lon: 55.2708 },
  });

  const mod = modulateAfskFrame(frame);
  assert.equal(mod.sampleRate, SAMPLE_RATE);
  assert.ok(mod.durationSeconds >= 1.4 && mod.durationSeconds <= 2.2);

  // Demodulate clean audio
  const demodClean = demodulateAfskAudio(mod.samples, mod.sampleRate);
  assert.equal(demodClean.detected, true);
  assert.ok(demodClean.frame !== null);
  const decodedClean = decodeAndRepairFrame(demodClean.frame!, demodClean.erasureRsIndices, frame);
  assert.equal(decodedClean.valid, true);
  assert.equal(decodedClean.nodeId, 0x0042);

  // Demodulate with moderate acoustic noise
  const noisySamples = addAcousticStatic(mod.samples, 18, 77);
  const demodNoisy = demodulateAfskAudio(noisySamples, mod.sampleRate);
  assert.equal(demodNoisy.detected, true);
  const decodedNoisy = decodeAndRepairFrame(demodNoisy.frame!, demodNoisy.erasureRsIndices, frame);
  assert.equal(decodedNoisy.valid, true);
});

test('WAV encoder writes valid RIFF/WAVE PCM headers', () => {
  const samples = new Float32Array([0, 0.5, -0.5, 0]);
  const wav = encodeWavFile(samples, 44100);
  const header = new TextDecoder().decode(wav.slice(0, 4));
  const wave = new TextDecoder().decode(wav.slice(8, 12));
  assert.equal(header, 'RIFF');
  assert.equal(wave, 'WAVE');
  assert.equal(wav.length, 44 + samples.length * 2);
});

test('Demodulates quiet, padded, speaker-to-mic acoustic signal with 12% static', () => {
  const frame = encodeFrame({
    nodeId: 0x0001,
    timestamp: 1794856200,
    payload: { kind: 'CUSTOM_FIELD_CODE', code: 'HELLO' },
  });

  const mod = modulateAfskFrame(frame);
  const noisy = addAcousticStatic(mod.samples, 12, 99);

  // Simulate 0.6s leading ambient noise + 18x attenuation (quiet mic) + 0.5s trailing silence
  const lead = Math.round(SAMPLE_RATE * 0.6);
  const trail = Math.round(SAMPLE_RATE * 0.5);
  const roomBuf = new Float32Array(lead + noisy.length + trail);
  for (let i = 0; i < noisy.length; i++) {
    roomBuf[lead + i] = noisy[i] * 0.05;
  }

  const demod = demodulateAfskAudio(roomBuf, SAMPLE_RATE);
  assert.equal(demod.detected, true);
  assert.ok(demod.frame !== null);
  const decoded = decodeAndRepairFrame(demod.frame!, demod.erasureRsIndices, frame);
  assert.equal(decoded.valid, true);
  assert.equal(decoded.payload?.kind, 'CUSTOM_FIELD_CODE');
  if (decoded.payload?.kind === 'CUSTOM_FIELD_CODE') {
    assert.equal(decoded.payload.code, 'HELLO');
  }
});

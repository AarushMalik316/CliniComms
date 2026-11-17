import { FRAME_SIZE } from '../protocol/frame';

export const SAMPLE_RATE = 44100;
export const MARK_FREQ_HZ = 1200; // Logic 1
export const SPACE_FREQ_HZ = 2200; // Logic 0
export const BAUD_RATE = 300; // 44100 / 300 = 147 exact integer samples per bit
export const SAMPLES_PER_BIT = SAMPLE_RATE / BAUD_RATE;
export const FRONT_PORCH_MS = 500;
export const TRAILER_MS = 80;
export const SQUELCH_RMS_THRESHOLD = 0.045;

export interface AfskModulationOutput {
  samples: Float32Array;
  sampleRate: number;
  durationSeconds: number;
  frontPorchSamples: number;
  bitCount: number;
}

/**
 * Computes RMS energy of an audio sample window for Carrier Sense (Listen-Before-Talk).
 */
export function computeRmsEnergy(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sumSq = 0;
  for (let i = 0; i < samples.length; i++) {
    sumSq += samples[i] * samples[i];
  }
  return Math.sqrt(sumSq / samples.length);
}

/**
 * Checks if the RF audio channel is clear using RMS energy against the squelch floor.
 */
export function checkCarrierSense(
  inputSamples: Float32Array,
  humanVoiceSimulated = false,
  squelchThreshold = SQUELCH_RMS_THRESHOLD
): { clear: boolean; rms: number; reason: string } {
  const rms = computeRmsEnergy(inputSamples);
  if (humanVoiceSimulated) {
    return {
      clear: false,
      rms: Math.max(rms, 0.24),
      reason: 'CARRIER_BUSY_WAIT: Human voice energy detected on 146.520 MHz',
    };
  }
  if (rms > squelchThreshold) {
    return {
      clear: false,
      rms,
      reason: `CARRIER_BUSY_WAIT: Channel RMS ${rms.toFixed(3)} exceeds squelch ${squelchThreshold.toFixed(3)}`,
    };
  }
  return {
    clear: true,
    rms,
    reason: 'CHANNEL_CLEAR: Squelch open, safe to key PTT',
  };
}

/**
 * Encodes a byte buffer into UART-style 8N1 bit stream (start=0, 8 LSB-first bits, stop=1)
 * preceded by idle mark sync bits.
 */
export function bytesToBitStream(bytes: Uint8Array): number[] {
  const bits: number[] = [];
  // 4 idle mark bits after front porch before first start bit
  for (let i = 0; i < 4; i++) bits.push(1);
  for (let b = 0; b < bytes.length; b++) {
    const byte = bytes[b];
    bits.push(0); // Start bit (Space = 2200 Hz)
    for (let bit = 0; bit < 8; bit++) {
      bits.push((byte >> bit) & 1);
    }
    bits.push(1); // Stop bit (Mark = 1200 Hz)
  }
  return bits;
}

/**
 * Generates phase-continuous Bell 202 AFSK audio samples at 44100 Hz:
 * - 500ms continuous 1200 Hz front-porch carrier (PTT relay stabilization)
 * - 28-byte packet modulated at 300 baud (1200 Hz Mark / 2200 Hz Space)
 * - 80ms 1200 Hz trailer
 */
export function modulateAfskFrame(frame: Uint8Array, amplitude = 0.72): AfskModulationOutput {
  const bits = bytesToBitStream(frame);
  const frontPorchSamples = Math.round((FRONT_PORCH_MS / 1000) * SAMPLE_RATE);
  const trailerSamples = Math.round((TRAILER_MS / 1000) * SAMPLE_RATE);
  const dataSamples = bits.length * SAMPLES_PER_BIT;
  const totalSamples = frontPorchSamples + dataSamples + trailerSamples;

  const samples = new Float32Array(totalSamples);
  let phase = 0;
  let idx = 0;

  // 1. 500ms 1200 Hz Front-Porch Mark Carrier
  const markPhaseInc = (2 * Math.PI * MARK_FREQ_HZ) / SAMPLE_RATE;
  for (let i = 0; i < frontPorchSamples; i++) {
    samples[idx++] = Math.sin(phase) * amplitude;
    phase = (phase + markPhaseInc) % (2 * Math.PI);
  }

  // 2. Phase-continuous FSK data modulation
  for (let b = 0; b < bits.length; b++) {
    const freq = bits[b] === 1 ? MARK_FREQ_HZ : SPACE_FREQ_HZ;
    const phaseInc = (2 * Math.PI * freq) / SAMPLE_RATE;
    for (let s = 0; s < SAMPLES_PER_BIT; s++) {
      samples[idx++] = Math.sin(phase) * amplitude;
      phase = (phase + phaseInc) % (2 * Math.PI);
    }
  }

  // 3. 80ms Trailer with smooth cosine ramp-down on final 10ms
  const fadeSamples = Math.min(trailerSamples, Math.round(0.01 * SAMPLE_RATE));
  for (let i = 0; i < trailerSamples; i++) {
    const fade = i >= trailerSamples - fadeSamples ? (trailerSamples - i) / fadeSamples : 1;
    samples[idx++] = Math.sin(phase) * amplitude * fade;
    phase = (phase + markPhaseInc) % (2 * Math.PI);
  }

  return {
    samples,
    sampleRate: SAMPLE_RATE,
    durationSeconds: totalSamples / SAMPLE_RATE,
    frontPorchSamples,
    bitCount: bits.length,
  };
}

/**
 * Adds Gaussian-approximated static noise to an audio signal buffer for acoustic DSP simulation.
 */
export function addAcousticStatic(samples: Float32Array, noisePercent: number, seed = 42): Float32Array {
  const out = new Float32Array(samples.length);
  const noiseGain = (Math.max(0, Math.min(100, noisePercent)) / 100) * 0.95;
  let s = seed >>> 0;
  const rand = () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return (s / 0x100000000) * 2 - 1;
  };
  for (let i = 0; i < samples.length; i++) {
    const n = (rand() + rand() + rand()) / 3;
    out[i] = Math.max(-1, Math.min(1, samples[i] + n * noiseGain));
  }
  return out;
}

/**
 * Goertzel single-frequency DFT magnitude squared detector.
 * Used for real-time 1200 Hz (Mark) vs 2200 Hz (Space) discrimination.
 */
export function goertzelMagnitude(
  samples: Float32Array,
  start: number,
  length: number,
  targetFreq: number,
  sampleRate = SAMPLE_RATE
): number {
  const k = (length * targetFreq) / sampleRate;
  const omega = (2 * Math.PI * k) / length;
  const coeff = 2 * Math.cos(omega);
  let q0 = 0;
  let q1 = 0;
  let q2 = 0;

  const end = Math.min(samples.length, start + length);
  for (let i = start; i < end; i++) {
    q0 = coeff * q1 - q2 + samples[i];
    q2 = q1;
    q1 = q0;
  }

  const real = q1 - q2 * Math.cos(omega);
  const imag = q2 * Math.sin(omega);
  return Math.sqrt(real * real + imag * imag) / Math.max(1, length / 2);
}

export interface AfskDemodulationResult {
  detected: boolean;
  frame: Uint8Array | null;
  erasureRsIndices: number[];
  markEnergyAvg: number;
  spaceEnergyAvg: number;
  snrDb: number;
}

/**
 * Demodulates an AFSK audio buffer using Goertzel tone detection and 0xAA 0xAA 0x7E framing.
 */
export function demodulateAfskAudio(
  samples: Float32Array,
  sampleRate = SAMPLE_RATE
): AfskDemodulationResult {
  const spb = Math.round(sampleRate / BAUD_RATE);
  const step = Math.max(8, Math.floor(spb / 4));
  const markHistory: number[] = [];
  const spaceHistory: number[] = [];

  // Scan sliding windows to find active carrier start
  let carrierStart = -1;
  for (let pos = 0; pos + spb < samples.length; pos += step) {
    const m = goertzelMagnitude(samples, pos, spb, MARK_FREQ_HZ, sampleRate);
    const s = goertzelMagnitude(samples, pos, spb, SPACE_FREQ_HZ, sampleRate);
    markHistory.push(m);
    spaceHistory.push(s);
    if (carrierStart === -1 && m > 0.12 && m > s * 1.4) {
      carrierStart = pos;
    }
  }

  if (carrierStart === -1) {
    return {
      detected: false,
      frame: null,
      erasureRsIndices: [],
      markEnergyAvg: 0,
      spaceEnergyAvg: 0,
      snrDb: 0,
    };
  }

  // Locate first start bit transition (Space > Mark) after front porch
  const searchStart = carrierStart + Math.round(sampleRate * 0.25);
  let firstStartBit = -1;
  for (let pos = searchStart; pos + spb < samples.length; pos += 4) {
    const m = goertzelMagnitude(samples, pos, spb, MARK_FREQ_HZ, sampleRate);
    const s = goertzelMagnitude(samples, pos, spb, SPACE_FREQ_HZ, sampleRate);
    if (s > m * 1.15 && s > 0.1) {
      firstStartBit = pos;
      break;
    }
  }

  if (firstStartBit === -1) {
    return {
      detected: false,
      frame: null,
      erasureRsIndices: [],
      markEnergyAvg: 0,
      spaceEnergyAvg: 0,
      snrDb: 0,
    };
  }

  // Try small sample-phase offsets around firstStartBit to lock cleanly on 8N1 UART frames
  let bestFrame: Uint8Array | null = null;
  let bestSyncScore = -1;
  let bestErasures: number[] = [];
  let sumM = 0;
  let sumS = 0;
  let countBits = 0;

  for (let offset = -Math.floor(spb * 0.25); offset <= Math.floor(spb * 0.25); offset += Math.max(4, Math.floor(spb / 12))) {
    const base = firstStartBit + offset;
    if (base < 0 || base + FRAME_SIZE * 10 * spb > samples.length) continue;

    const bytes = new Uint8Array(FRAME_SIZE);
    const erasures: number[] = [];
    let localM = 0;
    let localS = 0;
    let localBits = 0;

    for (let byteIdx = 0; byteIdx < FRAME_SIZE; byteIdx++) {
      let val = 0;
      let minConfidence = 999;
      for (let bitIdx = 0; bitIdx < 8; bitIdx++) {
        const bitPos = base + (byteIdx * 10 + 1 + bitIdx) * spb;
        const m = goertzelMagnitude(samples, bitPos, spb, MARK_FREQ_HZ, sampleRate);
        const s = goertzelMagnitude(samples, bitPos, spb, SPACE_FREQ_HZ, sampleRate);
        const bit = m >= s ? 1 : 0;
        if (bit) val |= 1 << bitIdx;

        const ratio = Math.max(m, s) / (Math.min(m, s) + 1e-5);
        if (ratio < minConfidence) minConfidence = ratio;
        localM += m;
        localS += s;
        localBits++;
      }
      bytes[byteIdx] = val;
      if (byteIdx >= 3 && minConfidence < 1.35) {
        erasures.push(byteIdx - 3);
      }
    }

    let syncScore = 0;
    if (bytes[0] === 0xaa) syncScore += 2;
    if (bytes[1] === 0xaa) syncScore += 2;
    if (bytes[2] === 0x7e) syncScore += 4;

    if (syncScore > bestSyncScore) {
      bestSyncScore = syncScore;
      bestFrame = bytes;
      bestErasures = erasures;
      sumM = localM;
      sumS = localS;
      countBits = localBits;
    }
    if (syncScore === 8) break;
  }

  if (!bestFrame || bestSyncScore < 4) {
    return {
      detected: false,
      frame: null,
      erasureRsIndices: [],
      markEnergyAvg: 0,
      spaceEnergyAvg: 0,
      snrDb: 0,
    };
  }

  const markAvg = countBits > 0 ? sumM / countBits : 0;
  const spaceAvg = countBits > 0 ? sumS / countBits : 0;
  const snrDb = 20 * Math.log10(Math.max(markAvg, spaceAvg) / (Math.min(markAvg, spaceAvg) * 0.2 + 0.01));

  return {
    detected: true,
    frame: bestFrame,
    erasureRsIndices: bestErasures,
    markEnergyAvg: markAvg,
    spaceEnergyAvg: spaceAvg,
    snrDb: Number.isFinite(snrDb) ? snrDb : 18,
  };
}

/**
 * Encodes Float32 PCM samples into a standard 16-bit mono RIFF/WAV file buffer.
 */
export function encodeWavFile(samples: Float32Array, sampleRate = SAMPLE_RATE): Uint8Array {
  const numSamples = samples.length;
  const dataSize = numSamples * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Uint8Array(buffer);
}

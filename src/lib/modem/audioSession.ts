import {
  SAMPLE_RATE,
  computeRmsEnergy,
  demodulateAfskAudio,
  goertzelMagnitude,
  MARK_FREQ_HZ,
  SPACE_FREQ_HZ,
} from './afsk';
import { decodeAndRepairFrame } from '../protocol/frame';

export interface LiveAudioFrame {
  timeDomain: Float32Array;
  spectrumBins: Float32Array;
  markEnergy: number;
  spaceEnergy: number;
  rms: number;
}

class AcousticModemEngine {
  private ctx: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private micAnalyser: AnalyserNode | null = null;
  private txAnalyser: AnalyserNode | null = null;
  private activePlaybackSource: AudioBufferSourceNode | null = null;
  private recordedChunks: Float32Array[] = [];
  private scriptProcessor: ScriptProcessorNode | null = null;
  private isListening = false;

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!this.ctx) {
      this.ctx = new AudioCtx({ sampleRate: SAMPLE_RATE });
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  public getIsListening(): boolean {
    return this.isListening;
  }

  public async playAfskBurst(
    samples: Float32Array,
    sampleRate = SAMPLE_RATE,
    onComplete?: () => void
  ): Promise<boolean> {
    const ctx = this.ensureContext();
    if (!ctx) return false;

    try {
      if (this.activePlaybackSource) {
        try {
          this.activePlaybackSource.stop();
        } catch {
          // ignore
        }
      }

      const buf = ctx.createBuffer(1, samples.length, sampleRate);
      buf.copyToChannel(new Float32Array(samples), 0);

      const src = ctx.createBufferSource();
      src.buffer = buf;

      const gain = ctx.createGain();
      gain.gain.value = 0.65; // strong acoustic speaker level for over-the-air RX

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      this.txAnalyser = analyser;

      src.connect(gain);
      gain.connect(analyser);
      analyser.connect(ctx.destination);

      this.activePlaybackSource = src;
      src.onended = () => {
        if (this.activePlaybackSource === src) {
          this.activePlaybackSource = null;
          this.txAnalyser = null;
        }
        onComplete?.();
      };
      src.start();
      return true;
    } catch {
      return false;
    }
  }

  public async startMicrophoneListener(
    onPacketCaptured?: (frame: Uint8Array, erasures: number[]) => void
  ): Promise<{ ok: boolean; error?: string }> {
    if (this.isListening) return { ok: true };
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return { ok: false, error: 'Browser microphone API unavailable' };
    }

    const ctx = this.ensureContext();
    if (!ctx) return { ok: false, error: 'Web Audio API unavailable' };

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      this.micStream = stream;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;

      // Capture rolling 3.2s window so full ~1.5s burst + margins are always enclosed
      const proc = ctx.createScriptProcessor(2048, 1, 1);
      this.recordedChunks = [];
      let cooldownUntil = 0;
      let activeToneChunks = 0;
      let tailChunksRemaining = 0;
      let chunkCounter = 0;

      proc.onaudioprocess = (ev) => {
        const input = ev.inputBuffer.getChannelData(0);
        this.recordedChunks.push(new Float32Array(input));
        const maxChunks = Math.ceil((ctx.sampleRate * 3.2) / 2048);
        if (this.recordedChunks.length > maxChunks) {
          this.recordedChunks.shift();
        }

        const now = Date.now();
        if (now < cooldownUntil) return;

        // Check for 1200 Hz / 2200 Hz acoustic energy down to quiet mic levels
        const mEnergy = goertzelMagnitude(input, 0, input.length, MARK_FREQ_HZ, ctx.sampleRate);
        const sEnergy = goertzelMagnitude(input, 0, input.length, SPACE_FREQ_HZ, ctx.sampleRate);
        const tonePresent = mEnergy > 0.008 || sEnergy > 0.008;

        if (tonePresent) {
          activeToneChunks++;
          tailChunksRemaining = 6; // Keep checking ~280ms after tone ends
        } else if (tailChunksRemaining > 0) {
          tailChunksRemaining--;
        } else {
          activeToneChunks = 0;
          return;
        }

        chunkCounter++;
        // Require at least ~320ms of tone and throttle demodulation to every 2nd chunk (~90ms)
        const minBuffered = Math.ceil((ctx.sampleRate * 1.5) / 2048);
        if (
          this.recordedChunks.length < minBuffered ||
          activeToneChunks < 7 ||
          (chunkCounter % 2 !== 0 && tailChunksRemaining > 0)
        ) {
          return;
        }

        const totalLen = this.recordedChunks.reduce((acc, c) => acc + c.length, 0);
        const merged = new Float32Array(totalLen);
        let off = 0;
        for (const chunk of this.recordedChunks) {
          merged.set(chunk, off);
          off += chunk.length;
        }

        const demod = demodulateAfskAudio(merged, ctx.sampleRate);
        if (demod.detected && demod.frame) {
          const check = decodeAndRepairFrame(demod.frame, demod.erasureRsIndices);
          if (check.valid || tailChunksRemaining === 0) {
            cooldownUntil = now + 1800;
            this.recordedChunks = [];
            activeToneChunks = 0;
            tailChunksRemaining = 0;
            onPacketCaptured?.(demod.frame, demod.erasureRsIndices);
          }
        }
      };

      source.connect(analyser);
      analyser.connect(proc);
      proc.connect(ctx.destination);

      this.micSource = source;
      this.micAnalyser = analyser;
      this.scriptProcessor = proc;
      this.isListening = true;
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Microphone permission denied',
      };
    }
  }

  public stopMicrophoneListener(): void {
    this.isListening = false;
    if (this.scriptProcessor) {
      this.scriptProcessor.disconnect();
      this.scriptProcessor = null;
    }
    if (this.micSource) {
      this.micSource.disconnect();
      this.micSource = null;
    }
    if (this.micAnalyser) {
      this.micAnalyser.disconnect();
      this.micAnalyser = null;
    }
    if (this.micStream) {
      for (const track of this.micStream.getTracks()) {
        track.stop();
      }
      this.micStream = null;
    }
    this.recordedChunks = [];
  }

  public sampleLiveFrame(): LiveAudioFrame | null {
    const analyser = this.txAnalyser ?? this.micAnalyser;
    if (!analyser || !this.ctx) return null;

    const timeDomain = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(timeDomain);

    const freqData = new Float32Array(analyser.frequencyBinCount);
    analyser.getFloatFrequencyData(freqData);

    const rms = computeRmsEnergy(timeDomain);
    const markEnergy = goertzelMagnitude(
      timeDomain,
      0,
      Math.min(timeDomain.length, 512),
      MARK_FREQ_HZ,
      this.ctx.sampleRate
    );
    const spaceEnergy = goertzelMagnitude(
      timeDomain,
      0,
      Math.min(timeDomain.length, 512),
      SPACE_FREQ_HZ,
      this.ctx.sampleRate
    );

    return {
      timeDomain,
      spectrumBins: freqData,
      markEnergy,
      spaceEnergy,
      rms,
    };
  }
}

export const acousticModem = new AcousticModemEngine();

export const SCREECH_CHANNEL_NAME = 'screech_vhf_channel';

export interface BroadcastPacketMessage {
  type: 'AFSK_BURST';
  id: string;
  sentAt: number;
  txBytes: number[];
  rxBytes: number[];
  erasureRsIndices: number[];
  noisePercent: number;
  rxSignalDbm: number;
}

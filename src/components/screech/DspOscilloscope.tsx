import React, { useEffect, useRef } from 'react';
import { acousticModem } from '@/src/lib/modem/audioSession';
import {
  MARK_FREQ_HZ,
  SAMPLE_RATE,
  SPACE_FREQ_HZ,
  goertzelMagnitude,
} from '@/src/lib/modem/afsk';

interface DspOscilloscopeProps {
  lastSamples: Float32Array | null;
  playbackStartTimeMs: number | null;
  playbackDurationMs: number;
  humanVoiceSimulated: boolean;
  noisePercent: number;
  isDark: boolean;
}

export const DspOscilloscope: React.FC<DspOscilloscopeProps> = ({
  lastSamples,
  playbackStartTimeMs,
  playbackDurationMs,
  humanVoiceSimulated,
  noisePercent,
  isDark,
}) => {
  const waveCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const specCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const propsRef = useRef({
    lastSamples,
    playbackStartTimeMs,
    playbackDurationMs,
    humanVoiceSimulated,
    noisePercent,
    isDark,
  });
  propsRef.current = {
    lastSamples,
    playbackStartTimeMs,
    playbackDurationMs,
    humanVoiceSimulated,
    noisePercent,
    isDark,
  };

  useEffect(() => {
    let rafId = 0;

    const draw = () => {
      const waveCanvas = waveCanvasRef.current;
      const specCanvas = specCanvasRef.current;
      if (!waveCanvas || !specCanvas) {
        rafId = requestAnimationFrame(draw);
        return;
      }

      const {
        lastSamples: samples,
        playbackStartTimeMs: startMs,
        playbackDurationMs: durMs,
        humanVoiceSimulated: voiceSim,
        noisePercent: noisePct,
        isDark: dark,
      } = propsRef.current;

      const bgColor = dark ? '#181817' : '#FFFFFF';
      const gridColor = dark ? '#262624' : '#F1F1EE';
      const textColor = dark ? '#8E8D88' : '#9B9A95';
      const waveColor = dark ? '#C2934B' : '#C2934B';
      const secondaryColor = dark ? '#7A7974' : '#A6A5A0';

      const liveFrame = acousticModem.sampleLiveFrame();
      let displayWave = new Float32Array(512);
      let markEnergy = 0;
      let spaceEnergy = 0;

      const now = performance.now();
      const inPlayback =
        samples !== null &&
        startMs !== null &&
        now - startMs >= 0 &&
        now - startMs <= durMs;

      if (liveFrame && liveFrame.rms > 0.004) {
        displayWave = liveFrame.timeDomain.slice(0, 512);
        markEnergy = Math.min(1, liveFrame.markEnergy * 2.2);
        spaceEnergy = Math.min(1, liveFrame.spaceEnergy * 2.2);
      } else if (inPlayback && samples && startMs !== null) {
        const progress = (now - startMs) / Math.max(1, durMs);
        const startIdx = Math.min(
          Math.max(0, samples.length - 512),
          Math.floor(progress * (samples.length - 512))
        );
        displayWave = samples.slice(startIdx, startIdx + 512);
        markEnergy = Math.min(1, goertzelMagnitude(displayWave, 0, 512, MARK_FREQ_HZ, SAMPLE_RATE) * 1.4);
        spaceEnergy = Math.min(1, goertzelMagnitude(displayWave, 0, 512, SPACE_FREQ_HZ, SAMPLE_RATE) * 1.4);
      } else if (voiceSim) {
        const tBase = now * 0.001;
        for (let i = 0; i < displayWave.length; i++) {
          const t = tBase + i / SAMPLE_RATE;
          displayWave[i] =
            0.22 * Math.sin(2 * Math.PI * 340 * t) +
            0.14 * Math.sin(2 * Math.PI * 690 * t) +
            0.06 * Math.sin(2 * Math.PI * 1450 * t);
        }
        markEnergy = 0.18;
        spaceEnergy = 0.16;
      } else if (samples && samples.length >= 512) {
        const mid = Math.min(samples.length - 512, Math.floor(samples.length * 0.48));
        displayWave = samples.slice(mid, mid + 512);
        markEnergy = Math.min(1, goertzelMagnitude(displayWave, 0, 512, MARK_FREQ_HZ, SAMPLE_RATE) * 1.4);
        spaceEnergy = Math.min(1, goertzelMagnitude(displayWave, 0, 512, SPACE_FREQ_HZ, SAMPLE_RATE) * 1.4);
      } else {
        const nFloor = 0.02 + (noisePct / 100) * 0.18;
        for (let i = 0; i < displayWave.length; i++) {
          displayWave[i] =
            (Math.sin(i * 0.43 + now * 0.015) + Math.cos(i * 1.21 - now * 0.02)) * nFloor * 0.45;
        }
      }

      // 1. Time-Domain Line Trace
      const wCtx = waveCanvas.getContext('2d');
      if (wCtx) {
        const w = waveCanvas.width;
        const h = waveCanvas.height;
        wCtx.fillStyle = bgColor;
        wCtx.fillRect(0, 0, w, h);

        wCtx.strokeStyle = gridColor;
        wCtx.lineWidth = 1;
        for (let gy = 24; gy < h; gy += 32) {
          wCtx.beginPath();
          wCtx.moveTo(0, gy + 0.5);
          wCtx.lineTo(w, gy + 0.5);
          wCtx.stroke();
        }

        wCtx.strokeStyle = voiceSim ? '#D97706' : waveColor;
        wCtx.lineWidth = 1.8;
        wCtx.beginPath();
        for (let i = 0; i < displayWave.length; i++) {
          const x = (i / (displayWave.length - 1)) * w;
          const y = h / 2 - displayWave[i] * (h * 0.4);
          if (i === 0) wCtx.moveTo(x, y);
          else wCtx.lineTo(x, y);
        }
        wCtx.stroke();
      }

      // 2. Smooth Spectrum Curve (0..3200 Hz)
      const sCtx = specCanvas.getContext('2d');
      if (sCtx) {
        const w = specCanvas.width;
        const h = specCanvas.height;
        sCtx.fillStyle = bgColor;
        sCtx.fillRect(0, 0, w, h);

        sCtx.strokeStyle = gridColor;
        sCtx.lineWidth = 1;
        for (let gy = 18; gy < h - 18; gy += 28) {
          sCtx.beginPath();
          sCtx.moveTo(0, gy + 0.5);
          sCtx.lineTo(w, gy + 0.5);
          sCtx.stroke();
        }

        const numBins = 36;
        const binW = w / (numBins - 1);

        // Draw spectrum curve
        sCtx.strokeStyle = secondaryColor;
        sCtx.lineWidth = 1.6;
        sCtx.beginPath();
        for (let b = 0; b < numBins; b++) {
          const freq = b * 90;
          const mag = goertzelMagnitude(displayWave, 0, displayWave.length, freq, SAMPLE_RATE);
          const norm = Math.min(1, mag * 1.65);
          const x = b * binW;
          const y = h - 22 - norm * (h - 36);
          if (b === 0) sCtx.moveTo(x, y);
          else sCtx.lineTo(x, y);
        }
        sCtx.stroke();

        // Highlight Mark (1200Hz) & Space (2200Hz) energy markers
        const markX = (MARK_FREQ_HZ / 3240) * w;
        const spaceX = (SPACE_FREQ_HZ / 3240) * w;

        sCtx.fillStyle = '#C2934B';
        sCtx.fillRect(markX - 3, h - 22 - Math.max(4, markEnergy * (h - 36)), 6, Math.max(4, markEnergy * (h - 36)));

        sCtx.fillStyle = '#4A4A47';
        sCtx.fillRect(spaceX - 3, h - 22 - Math.max(4, spaceEnergy * (h - 36)), 6, Math.max(4, spaceEnergy * (h - 36)));

        sCtx.font = '10px "JetBrains Mono", monospace';
        sCtx.fillStyle = textColor;
        sCtx.fillText('0 Hz', 4, h - 6);
        sCtx.fillText('1.2 kHz', markX - 18, h - 6);
        sCtx.fillText('2.2 kHz', spaceX - 18, h - 6);
        sCtx.fillText('3.2 kHz', w - 44, h - 6);
      }

      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <div className="space-y-2" data-testid="dsp-oscilloscope">
      <canvas
        ref={waveCanvasRef}
        width={560}
        height={108}
        className="w-full h-[108px] block rounded-md"
        aria-label="Real-time AFSK time-domain waveform oscilloscope"
      />
      <canvas
        ref={specCanvasRef}
        width={560}
        height={104}
        className="w-full h-[104px] block rounded-md"
        aria-label="Real-time Goertzel 1200 Hz and 2200 Hz frequency spectrum"
      />
    </div>
  );
};

'use client';

import { useCallback, useMemo, useRef, useState } from 'react';

import {
  AUDIO_WAVEFORM_VERSION,
  type AudioWaveformJson,
} from '../audio-waveform';

import type { LiveAudioPcmSamples } from '../plugins/contracts';

const VISUAL_WAVEFORM_FRAME_RATE_HZ = 30;

type VisualWaveformTap = {
  appendSamples: (input: LiveAudioPcmSamples) => void;
  livePairs: AudioWaveformJson | null;
  pairRevision: number;
  reset: () => void;
  stop: () => void;
};

export function useLiveAudioVisualWaveform(): VisualWaveformTap {
  const frameSampleCountRef = useRef(0);
  const frameMinRef = useRef(1);
  const frameMaxRef = useRef(-1);
  const pairsRef = useRef<number[]>([]);
  const [livePairs, setLivePairs] = useState<AudioWaveformJson | null>(null);
  const [pairRevision, setPairRevision] = useState(0);

  const resetFrame = useCallback(() => {
    frameSampleCountRef.current = 0;
    frameMinRef.current = 1;
    frameMaxRef.current = -1;
  }, []);

  const appendSamples = useCallback(
    ({ sampleRateHz, samples }: LiveAudioPcmSamples) => {
      if (sampleRateHz <= 0 || samples.length === 0) {
        return;
      }

      const samplesPerFrame = Math.max(
        1,
        Math.round(sampleRateHz / VISUAL_WAVEFORM_FRAME_RATE_HZ),
      );
      const nextFramePairs: number[] = [];

      samples.forEach((sample) => {
        frameMinRef.current = Math.min(frameMinRef.current, sample);
        frameMaxRef.current = Math.max(frameMaxRef.current, sample);
        frameSampleCountRef.current += 1;

        if (frameSampleCountRef.current < samplesPerFrame) {
          return;
        }

        nextFramePairs.push(
          roundWaveformValue(frameMinRef.current),
          roundWaveformValue(frameMaxRef.current),
        );
        resetFrame();
      });

      if (nextFramePairs.length === 0) {
        return;
      }

      const nextPairs = pairsRef.current.concat(nextFramePairs);
      pairsRef.current = nextPairs;
      setLivePairs({
        v: AUDIO_WAVEFORM_VERSION,
        sampleRateHz: VISUAL_WAVEFORM_FRAME_RATE_HZ,
        pairs: nextPairs,
      });
      setPairRevision((currentRevision) => currentRevision + 1);
    },
    [resetFrame],
  );

  const reset = useCallback(() => {
    resetFrame();
    pairsRef.current = [];
    setLivePairs(null);
    setPairRevision(0);
  }, [resetFrame]);

  const stop = useCallback(() => undefined, []);

  return useMemo(
    () => ({
      appendSamples,
      livePairs,
      pairRevision,
      reset,
      stop,
    }),
    [appendSamples, livePairs, pairRevision, reset, stop],
  );
}

function roundWaveformValue(inputValue: number) {
  return Math.round(inputValue * 10_000) / 10_000;
}

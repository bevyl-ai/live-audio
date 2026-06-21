'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  AudioWaveformAccumulator,
  type AudioWaveformJson,
} from '../audio-waveform';

import type { LiveAudioCaptureCompleteEvent } from '../capture/complete-event';
import {
  type LiveAudioCaptureProgressEvent,
  type MediabunnyPcmCapture,
  type MediabunnyPcmCaptureStatus,
  startMediabunnyPcmCapture,
} from '../capture/mediabunny-pcm-capture';
import {
  type PcmCaptureStats,
  type PcmFrame,
  createInitialPcmCaptureStats,
} from '../capture/pcm';
import {
  appendPcmFrameToWaveformAccumulator,
  createPcmWaveformAccumulator,
} from '../capture/pcm-waveform-accumulator';

export type LiveAudioSignalLevel = { rms: number; peak: number };
export type LiveAudioPcmCaptureState = 'idle' | MediabunnyPcmCaptureStatus;

const PCM_TIMESLICE_MS = 30;

export type UseMediabunnyPcmCaptureOptions = {
  onProgress?: (event: LiveAudioCaptureProgressEvent) => void;
  progressIntervalMs?: number;
};

export function useMediabunnyPcmCapture(
  options: UseMediabunnyPcmCaptureOptions = {},
) {
  const onProgressRef = useRef(options.onProgress);
  const captureRef = useRef<MediabunnyPcmCapture | null>(null);
  const startAttemptRef = useRef(0);
  const waveformAccumulatorRef = useRef<AudioWaveformAccumulator | null>(null);
  const [captureState, setCaptureState] =
    useState<LiveAudioPcmCaptureState>('idle');
  const [stats, setStats] = useState<PcmCaptureStats>(
    createInitialPcmCaptureStats,
  );
  const [lastFrame, setLastFrame] = useState<PcmFrame | null>(null);
  const [livePairs, setLivePairs] = useState<AudioWaveformJson | null>(null);
  const [pairRevision, setPairRevision] = useState(0);
  const [completeEvent, setCompleteEvent] =
    useState<LiveAudioCaptureCompleteEvent | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const progressIntervalMs = options.progressIntervalMs;

  useEffect(() => {
    onProgressRef.current = options.onProgress;
  }, [options.onProgress]);

  const currentLevel = useMemo(() => {
    if (!lastFrame) {
      return { rms: 0, peak: 0 };
    }

    return measureLiveAudioSignalLevel(lastFrame.samples);
  }, [lastFrame]);

  const elapsedSeconds = useMemo(() => {
    if (stats.lastTimestampSeconds !== null) {
      return stats.lastTimestampSeconds;
    }

    if (!livePairs || livePairs.pairs.length === 0) {
      return 0;
    }

    return livePairs.pairs.length / 2 / livePairs.sampleRateHz;
  }, [livePairs, stats.lastTimestampSeconds]);

  const stop = useCallback(() => {
    const activeCapture = captureRef.current;
    captureRef.current = null;

    activeCapture?.stop();
  }, []);

  const start = useCallback(
    ({
      onComplete,
      stream,
    }: {
      onComplete?: (event: LiveAudioCaptureCompleteEvent) => void;
      stream: MediaStream;
    }) => {
      stop();
      const startAttempt = startAttemptRef.current + 1;
      startAttemptRef.current = startAttempt;
      setCaptureState('idle');
      setErrorMessage(null);
      setStats(createInitialPcmCaptureStats());
      setLastFrame(null);
      waveformAccumulatorRef.current = null;
      setLivePairs(null);
      setPairRevision(0);
      setCompleteEvent(null);
      const progressCallbacks = onProgressRef.current
        ? {
            onProgress(event: LiveAudioCaptureProgressEvent) {
              if (startAttemptRef.current !== startAttempt) {
                return;
              }

              onProgressRef.current?.(event);
            },
          }
        : {};

      const capture = startMediabunnyPcmCapture(stream, {
        mono: true,
        timesliceMs: PCM_TIMESLICE_MS,
        ...(progressIntervalMs !== undefined ? { progressIntervalMs } : {}),
        ...progressCallbacks,
        onFrame(frame) {
          if (startAttemptRef.current !== startAttempt) {
            return;
          }

          setLastFrame(frame);

          if (!waveformAccumulatorRef.current) {
            waveformAccumulatorRef.current = createPcmWaveformAccumulator(
              frame.sampleRateHz,
            );
          }

          setLivePairs(
            appendPcmFrameToWaveformAccumulator(
              waveformAccumulatorRef.current,
              frame,
            ),
          );
          setPairRevision((currentRevision: number) => currentRevision + 1);
        },
        onStats(nextStats) {
          if (startAttemptRef.current !== startAttempt) {
            return;
          }

          setStats(nextStats);
        },
        onStatus(nextStatus) {
          if (startAttemptRef.current !== startAttempt) {
            return;
          }

          setCaptureState(nextStatus);
        },
        onComplete(nextCompleteEvent) {
          if (startAttemptRef.current !== startAttempt) {
            return;
          }

          setCompleteEvent(nextCompleteEvent);
          onComplete?.(nextCompleteEvent);
        },
      });

      captureRef.current = capture;
      void capture.done
        .catch((captureError) => {
          if (startAttemptRef.current !== startAttempt) {
            return;
          }

          setCaptureState('error');
          setErrorMessage(
            captureError instanceof Error
              ? captureError.message
              : 'Live audio capture failed',
          );
        })
        .finally(() => {
          if (
            startAttemptRef.current === startAttempt &&
            captureRef.current === capture
          ) {
            captureRef.current = null;
          }
        });
    },
    [progressIntervalMs, stop],
  );

  const markStopped = useCallback(() => {
    setCaptureState((currentState: LiveAudioPcmCaptureState) =>
      currentState === 'idle' || currentState === 'error'
        ? currentState
        : 'stopped',
    );
  }, []);

  useEffect(() => {
    return () => {
      startAttemptRef.current += 1;
      stop();
    };
  }, [stop]);

  return useMemo(
    () => ({
      captureState,
      completeEvent,
      currentLevel,
      elapsedSeconds,
      errorMessage,
      lastFrame,
      livePairs,
      markStopped,
      pairRevision,
      start,
      stats,
      stop,
    }),
    [
      captureState,
      completeEvent,
      currentLevel,
      elapsedSeconds,
      errorMessage,
      lastFrame,
      livePairs,
      markStopped,
      pairRevision,
      start,
      stats,
      stop,
    ],
  );
}

export function measureLiveAudioSignalLevel(
  samples: Float32Array,
): LiveAudioSignalLevel {
  if (samples.length === 0) {
    return { rms: 0, peak: 0 };
  }

  // eslint-disable-next-line no-restricted-syntax -- accumulates signal energy while scanning samples once.
  let sumOfSquares = 0;
  // eslint-disable-next-line no-restricted-syntax -- tracks the largest absolute sample while scanning samples once.
  let peak = 0;

  samples.forEach((sample) => {
    const absoluteSample = Math.abs(sample);
    sumOfSquares += sample * sample;
    peak = Math.max(peak, absoluteSample);
  });

  return {
    rms: Math.sqrt(sumOfSquares / samples.length),
    peak,
  };
}

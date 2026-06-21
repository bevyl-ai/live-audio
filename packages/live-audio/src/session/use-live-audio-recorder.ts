'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { AudioWaveformJson } from '../audio-waveform';

import type { LiveAudioCaptureCompleteEvent } from '../capture/complete-event';
import type { LiveAudioCaptureProgressEvent } from '../capture/mediabunny-pcm-capture';
import { useLiveAudioRealtimeUpload } from '../hooks/use-live-audio-realtime-upload';
import { useLiveAudioTranscription } from '../hooks/use-live-audio-transcription';
import { useLiveAudioVisualWaveform } from '../hooks/use-live-audio-visual-waveform';
import { useMediabunnyPcmCapture } from '../hooks/use-mediabunny-pcm-capture';
import type { LiveAudioRealtimeUploadClip } from '../realtime-upload/state';
import type { LiveAudioTranscriptionBatch } from '../transcription/transcription-batches';
import {
  getLiveAudioWaveformDurationSeconds,
  resolveLiveAudioPreviewWaveform,
} from '../waveform/preview-waveform';
import type {
  LiveAudioRecorderOptions,
  LiveAudioRecorderState,
} from './recorder-types';

const DEFAULT_BATCH_CLIP_RETRY_COUNT = 10;
const DEFAULT_BATCH_CLIP_RETRY_DELAY_MS = 150;
const DEFAULT_CAPTURE_COMPLETE_TRANSCRIPTION_WAIT_MS = 1500;

export function waitForCaptureCompleteTranscription({
  finishTranscription,
  waitMs = DEFAULT_CAPTURE_COMPLETE_TRANSCRIPTION_WAIT_MS,
}: {
  finishTranscription: Promise<void> | null;
  waitMs?: number;
}) {
  if (!finishTranscription) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, waitMs);

    void finishTranscription
      .catch(() => undefined)
      .then(() => {
        clearTimeout(timeout);
        resolve();
      });
  });
}

export function useLiveAudioRecorder({
  batchClipRetryCount = DEFAULT_BATCH_CLIP_RETRY_COUNT,
  batchClipRetryDelayMs = DEFAULT_BATCH_CLIP_RETRY_DELAY_MS,
  objectPath,
  onCaptureComplete,
  onCaptureUploadError,
  onCaptureUploaded,
  onClipUploaded,
  onError,
  onProcessingError,
  onProgress,
  plugins,
  progressIntervalMs,
}: LiveAudioRecorderOptions) {
  const startAttemptRef = useRef(0);
  const hasStartedCaptureRef = useRef(false);
  const livePairsRef = useRef<AudioWaveformJson | null>(null);
  const reportedCaptureErrorMessageRef = useRef<string | null>(null);
  const reportedProcessingErrorMessageRef = useRef<string | null>(null);
  const pendingBatchClipKeysRef = useRef<ReadonlySet<string>>(new Set());
  const batchClipRetryTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(
    new Set(),
  );
  const pendingTranscriptionFinishRef = useRef<Promise<void> | null>(null);
  const stopRecorderResourcesRef = useRef<() => void>(() => undefined);
  const shouldStopRealtimeUploadAfterCaptureRef = useRef(false);
  const shouldUploadCaptureCompleteRef = useRef(false);
  const [pendingBatchClipCount, setPendingBatchClipCount] = useState(0);
  const [progressElapsedSeconds, setProgressElapsedSeconds] = useState(0);
  const handleCaptureProgress = useCallback(
    (event: LiveAudioCaptureProgressEvent) => {
      setProgressElapsedSeconds((currentElapsedSeconds) =>
        Math.max(currentElapsedSeconds, event.elapsedSeconds),
      );
      onProgress?.(event);
    },
    [onProgress],
  );
  const pcmCapture = useMediabunnyPcmCapture({
    onProgress: handleCaptureProgress,
    ...(progressIntervalMs === undefined ? {} : { progressIntervalMs }),
  });
  const visualWaveform = useLiveAudioVisualWaveform();
  const appendVisualWaveformSamples = visualWaveform.appendSamples;
  const resetVisualWaveform = visualWaveform.reset;
  const stopVisualWaveform = visualWaveform.stop;
  const transcription = useLiveAudioTranscription({ plugins });

  const clearPendingBatchClip = useCallback((batchKey: string) => {
    if (!pendingBatchClipKeysRef.current.has(batchKey)) {
      return;
    }

    const nextPendingBatchClipKeys = new Set(pendingBatchClipKeysRef.current);
    nextPendingBatchClipKeys.delete(batchKey);
    pendingBatchClipKeysRef.current = nextPendingBatchClipKeys;
    setPendingBatchClipCount(nextPendingBatchClipKeys.size);
  }, []);

  const clearPendingBatchClips = useCallback(() => {
    pendingBatchClipKeysRef.current = new Set();
    setPendingBatchClipCount(0);
  }, []);

  const clearBatchClipRetryTimers = useCallback(() => {
    for (const retryTimer of batchClipRetryTimersRef.current) {
      clearTimeout(retryTimer);
    }

    batchClipRetryTimersRef.current = new Set();
  }, []);

  const handleClipUploaded = useCallback(
    (clip: LiveAudioRealtimeUploadClip) => {
      clearPendingBatchClip(clip.batch.key);
      onClipUploaded?.(clip);
    },
    [clearPendingBatchClip, onClipUploaded],
  );

  const reportProcessingError = useCallback(
    (errorMessage: string) => {
      if (reportedProcessingErrorMessageRef.current === errorMessage) {
        return;
      }

      reportedProcessingErrorMessageRef.current = errorMessage;
      clearPendingBatchClips();
      onProcessingError?.(errorMessage);
    },
    [clearPendingBatchClips, onProcessingError],
  );

  const realtimeUpload = useLiveAudioRealtimeUpload({
    objectPath,
    ...(onCaptureUploadError ? { onCaptureUploadError } : {}),
    ...(onCaptureUploaded ? { onCaptureUploaded } : {}),
    onClipUploaded: handleClipUploaded,
    onUploadError: reportProcessingError,
    plugins,
  });

  useEffect(() => {
    livePairsRef.current = pcmCapture.livePairs;
  }, [pcmCapture.livePairs]);

  const addPendingBatchClip = useCallback((batchKey: string) => {
    if (pendingBatchClipKeysRef.current.has(batchKey)) {
      return;
    }

    pendingBatchClipKeysRef.current = new Set(
      pendingBatchClipKeysRef.current,
    ).add(batchKey);
    setPendingBatchClipCount(pendingBatchClipKeysRef.current.size);
  }, []);

  const stopRecorderResources = useCallback(() => {
    shouldStopRealtimeUploadAfterCaptureRef.current = false;
    shouldUploadCaptureCompleteRef.current = false;
    pendingTranscriptionFinishRef.current = null;
    setProgressElapsedSeconds(0);
    clearBatchClipRetryTimers();
    void transcription.stop({ mode: 'cancel' });
    resetVisualWaveform();
    pcmCapture.stop();
    realtimeUpload.stop();
  }, [
    clearBatchClipRetryTimers,
    pcmCapture,
    realtimeUpload,
    resetVisualWaveform,
    transcription,
  ]);

  useEffect(() => {
    stopRecorderResourcesRef.current = stopRecorderResources;
  }, [stopRecorderResources]);

  const reset = useCallback(() => {
    startAttemptRef.current += 1;
    hasStartedCaptureRef.current = false;
    reportedCaptureErrorMessageRef.current = null;
    reportedProcessingErrorMessageRef.current = null;
    clearPendingBatchClips();
    stopRecorderResources();
  }, [clearPendingBatchClips, stopRecorderResources]);

  const uploadBatchClip = useCallback(
    (batch: LiveAudioTranscriptionBatch, startAttempt: number, attempt = 0) => {
      if (startAttemptRef.current !== startAttempt) {
        clearPendingBatchClip(batch.key);
        return;
      }

      const file = realtimeUpload.createClipFileFromBatch(batch);

      if (!file) {
        if (attempt < batchClipRetryCount) {
          // oxlint-disable-next-line @rikalabs/no-pass-through-intermediate-vars -- setTimeout handle must be named for self-clearing retry callback
          const batchClipRetryTimer = setTimeout(() => {
            batchClipRetryTimersRef.current.delete(batchClipRetryTimer);
            uploadBatchClip(batch, startAttempt, attempt + 1);
          }, batchClipRetryDelayMs);
          batchClipRetryTimersRef.current.add(batchClipRetryTimer);
        } else {
          clearPendingBatchClip(batch.key);
        }

        return;
      }

      realtimeUpload.uploadBatchClip({
        batch,
        file,
        liveWaveform: livePairsRef.current,
      });
    },
    [
      batchClipRetryCount,
      batchClipRetryDelayMs,
      clearPendingBatchClip,
      realtimeUpload,
    ],
  );

  const handleCaptureComplete = useCallback(
    (event: LiveAudioCaptureCompleteEvent) => {
      const shouldUploadCaptureComplete =
        shouldUploadCaptureCompleteRef.current;
      shouldUploadCaptureCompleteRef.current = false;

      if (!shouldUploadCaptureComplete) {
        return;
      }

      const captureAttempt = startAttemptRef.current;
      const finishTranscription = pendingTranscriptionFinishRef.current;

      void waitForCaptureCompleteTranscription({ finishTranscription }).then(
        () => {
          if (pendingTranscriptionFinishRef.current === finishTranscription) {
            pendingTranscriptionFinishRef.current = null;
          }

          if (startAttemptRef.current !== captureAttempt) {
            return;
          }

          onCaptureComplete?.(event);
          realtimeUpload.uploadCaptureComplete({
            completedBatches: transcription.readSnapshot().completedBatches,
            event,
            liveWaveform: livePairsRef.current,
          });

          if (shouldStopRealtimeUploadAfterCaptureRef.current) {
            shouldStopRealtimeUploadAfterCaptureRef.current = false;
            realtimeUpload.stop();
          }
        },
      );
    },
    [onCaptureComplete, realtimeUpload, transcription],
  );

  const start = useCallback(
    async ({ stream }: { stream: MediaStream }) => {
      reset();

      const startAttempt = startAttemptRef.current;

      try {
        const realtimeUploadStart = realtimeUpload.start();

        hasStartedCaptureRef.current = true;
        void transcription.start({
          onBatchProgress: realtimeUpload.uploadBatchWindow,
          onBatchComplete(batch) {
            addPendingBatchClip(batch.key);
            realtimeUpload.completeBatchWindow(batch);
            uploadBatchClip(batch, startAttempt);
          },
          onPcmChunk: realtimeUpload.uploadPcmChunk,
          onPcmSamples: appendVisualWaveformSamples,
          stream,
        });
        pcmCapture.start({
          onComplete: handleCaptureComplete,
          stream,
        });

        await realtimeUploadStart;

        if (startAttemptRef.current !== startAttempt) {
          realtimeUpload.stop();
          return false;
        }

        return true;
      } catch (error) {
        if (startAttemptRef.current === startAttempt) {
          realtimeUpload.stop();
          void transcription.stop();
          stopVisualWaveform();
          pcmCapture.stop();
          hasStartedCaptureRef.current = false;
          pcmCapture.markStopped();
        }

        throw error;
      }
    },
    [
      addPendingBatchClip,
      handleCaptureComplete,
      pcmCapture,
      realtimeUpload,
      reset,
      stopVisualWaveform,
      transcription,
      uploadBatchClip,
      appendVisualWaveformSamples,
    ],
  );

  const stop = useCallback(() => {
    if (!hasStartedCaptureRef.current) {
      startAttemptRef.current += 1;
      realtimeUpload.stop();
      pcmCapture.markStopped();
      return;
    }

    shouldUploadCaptureCompleteRef.current = true;
    shouldStopRealtimeUploadAfterCaptureRef.current = true;
    pendingTranscriptionFinishRef.current = transcription.stop({
      mode: 'finish',
    });
    stopVisualWaveform();
    pcmCapture.stop();
    hasStartedCaptureRef.current = false;
    pcmCapture.markStopped();
  }, [pcmCapture, realtimeUpload, stopVisualWaveform, transcription]);

  useEffect(() => {
    const nextErrorMessage = pcmCapture.errorMessage;

    if (
      !nextErrorMessage ||
      reportedCaptureErrorMessageRef.current === nextErrorMessage
    ) {
      return;
    }

    reportedCaptureErrorMessageRef.current = nextErrorMessage;
    onError?.(nextErrorMessage);
  }, [onError, pcmCapture.errorMessage]);

  useEffect(() => {
    const nextErrorMessage =
      transcription.errorMessage ?? realtimeUpload.errorMessage;

    if (!nextErrorMessage) {
      return;
    }

    reportProcessingError(nextErrorMessage);
  }, [
    realtimeUpload.errorMessage,
    reportProcessingError,
    transcription.errorMessage,
  ]);

  useEffect(() => {
    return () => {
      startAttemptRef.current += 1;
      hasStartedCaptureRef.current = false;
      stopRecorderResourcesRef.current();
    };
  }, []);

  const state = useMemo<LiveAudioRecorderState>(
    () => ({
      completeEvent: pcmCapture.completeEvent,
      errorMessage:
        pcmCapture.errorMessage ??
        transcription.errorMessage ??
        realtimeUpload.errorMessage,
      isProcessingComplete:
        pendingBatchClipCount === 0 &&
        (realtimeUpload.status === 'idle' ||
          realtimeUpload.status === 'complete' ||
          realtimeUpload.status === 'error'),
      previewWaveform: resolveLiveAudioPreviewWaveform({
        committedPairs: pcmCapture.livePairs,
        committedRevision: pcmCapture.pairRevision,
        targetDurationSeconds: Math.max(
          progressElapsedSeconds,
          getLiveAudioWaveformDurationSeconds(pcmCapture.livePairs),
          getLiveAudioWaveformDurationSeconds(visualWaveform.livePairs),
        ),
        visualPairs: visualWaveform.livePairs,
        visualRevision: visualWaveform.pairRevision,
      }),
      transcriptionBatches: transcription.completedBatches.concat(
        transcription.activeBatch ? [transcription.activeBatch] : [],
      ),
    }),
    [
      pcmCapture.completeEvent,
      pcmCapture.errorMessage,
      pcmCapture.livePairs,
      pcmCapture.pairRevision,
      pendingBatchClipCount,
      progressElapsedSeconds,
      realtimeUpload.errorMessage,
      realtimeUpload.status,
      transcription.activeBatch,
      transcription.completedBatches,
      transcription.errorMessage,
      visualWaveform.livePairs,
      visualWaveform.pairRevision,
    ],
  );

  return {
    pcmCapture,
    realtimeUpload,
    reset,
    start,
    state,
    stop,
    transcription,
  };
}

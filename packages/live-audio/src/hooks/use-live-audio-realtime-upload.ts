'use client';

import { useCallback, useMemo, useRef, useState } from 'react';

import type { AudioWaveformJson } from '../audio-waveform';

import type { LiveAudioCaptureCompleteEvent } from '../capture/complete-event';
import { createAudioClipFileFromPcmChunks } from '../clips/pcm-chunk-audio-clips';
import type {
  LiveAudioPcmStreamChunk,
  LiveAudioPluginSession,
} from '../plugins/contracts';
import { uploadRealtimeBatchClip } from '../realtime-upload/batch-clip';
import { uploadRealtimeBatchWindow } from '../realtime-upload/batch-window';
import { enqueueRealtimePcmChunkUpload } from '../realtime-upload/pcm-segments';
import {
  type LiveAudioRealtimeUploadCapture,
  type LiveAudioRealtimeUploadClip,
  type RealtimeUploadChunk,
  type RealtimeUploadStats,
  type RealtimeUploadStatus,
  buildRealtimeUploadWindowFileName,
} from '../realtime-upload/state';
import { uploadRealtimeCapture } from '../realtime-upload/upload-capture';
import type { LiveAudioRealtimeUploadOptions } from '../realtime-upload/upload-options';
import type { WindowUpload } from '../realtime-upload/window-state';
import type { LiveAudioTranscriptionBatch } from '../transcription/transcription-batches';
import { useLiveAudioRealtimeUploadLifecycle } from './use-live-audio-realtime-upload-lifecycle';

const ignoreUploadedClip = (_clip: LiveAudioRealtimeUploadClip) => {};
const ignoreUploadedCapture = (_capture: LiveAudioRealtimeUploadCapture) => {};
const ignoreUploadError = (_errorMessage: string) => {};

export function useLiveAudioRealtimeUpload({
  objectPath,
  onCaptureUploadError,
  onCaptureUploaded = ignoreUploadedCapture,
  onClipUploaded = ignoreUploadedClip,
  onUploadError = ignoreUploadError,
  plugins,
}: LiveAudioRealtimeUploadOptions) {
  const chunksRef = useRef<RealtimeUploadChunk[]>([]);
  const pcmChunksRef = useRef<LiveAudioPcmStreamChunk[]>([]);
  const pendingUploadsRef = useRef<Promise<void>[]>([]);
  const pluginSessionsRef = useRef<LiveAudioPluginSession[]>([]);
  const startAttemptRef = useRef(0);
  const sessionIdRef = useRef<string | null>(null);
  const windowUploadsRef = useRef<WindowUpload[]>([]);
  const [chunks, setChunks] = useState<RealtimeUploadChunk[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [stats, setStats] = useState<RealtimeUploadStats | null>(null);
  const [status, setStatus] = useState<RealtimeUploadStatus>('idle');

  const uploadedSizeBytes = useMemo(
    () => chunks.reduce(readUploadedSizeBytes, 0),
    [chunks],
  );

  const setRealtimeUploadChunks = useCallback(
    (
      update: (
        currentChunks: readonly RealtimeUploadChunk[],
      ) => RealtimeUploadChunk[],
    ) => {
      const nextChunks = update(chunksRef.current);
      chunksRef.current = nextChunks;
      setChunks(nextChunks);
    },
    [],
  );

  const updateChunk = useCallback(
    (batchKey: string, update: Partial<RealtimeUploadChunk>) => {
      setRealtimeUploadChunks((currentChunks) =>
        currentChunks.map((chunk) =>
          chunk.batchKey === batchKey ? { ...chunk, ...update } : chunk,
        ),
      );
    },
    [setRealtimeUploadChunks],
  );

  const reportUploadError = useCallback(
    (attempt: number, error: unknown) => {
      if (startAttemptRef.current !== attempt) {
        return;
      }

      const errorMessage =
        error instanceof Error ? error.message : 'Realtime audio upload failed';

      setStatus('error');
      setErrorMessage(errorMessage);
      onUploadError(errorMessage);
    },
    [onUploadError],
  );

  const trackUpload = useCallback((upload: Promise<void>) => {
    pendingUploadsRef.current = pendingUploadsRef.current.concat(upload);
    void upload.finally(() => {
      pendingUploadsRef.current = pendingUploadsRef.current.filter(
        (pendingUpload) => pendingUpload !== upload,
      );
    });
  }, []);

  const enqueuePcmChunkUpload = useCallback(
    ({
      attempt,
      chunk,
      currentSessionId,
      windowUpload,
    }: {
      attempt: number;
      chunk: LiveAudioPcmStreamChunk;
      currentSessionId: string;
      windowUpload: WindowUpload;
    }) => {
      enqueueRealtimePcmChunkUpload({
        attempt,
        chunk,
        chunksRef,
        currentSessionId,
        objectPath,
        pluginSessionsRef,
        reportUploadError,
        startAttemptRef,
        trackUpload,
        updateChunk,
        windowUpload,
        windowUploadsRef,
      });
    },
    [objectPath, reportUploadError, trackUpload, updateChunk],
  );

  const uploadBatchWindow = useCallback(
    (batch: LiveAudioTranscriptionBatch) => {
      const currentSessionId = sessionIdRef.current;

      if (!currentSessionId) {
        return;
      }

      uploadRealtimeBatchWindow({
        batch,
        currentSessionId,
        enqueuePcmChunkUpload: ({ chunk, currentSessionId, windowUpload }) => {
          enqueuePcmChunkUpload({
            attempt: startAttemptRef.current,
            chunk,
            currentSessionId,
            windowUpload,
          });
        },
        objectPath,
        pcmChunksRef,
        pluginSessionsRef,
        reportUploadError,
        setRealtimeUploadChunks,
        startAttemptRef,
        trackUpload,
        windowUploadsRef,
      });
    },
    [
      enqueuePcmChunkUpload,
      objectPath,
      reportUploadError,
      setRealtimeUploadChunks,
      trackUpload,
    ],
  );

  const uploadPcmChunk = useCallback(
    (chunk: LiveAudioPcmStreamChunk) => {
      const currentSessionId = sessionIdRef.current;

      if (!currentSessionId) {
        return;
      }

      const attempt = startAttemptRef.current;
      pcmChunksRef.current = pcmChunksRef.current.concat(chunk);
      windowUploadsRef.current.forEach((windowUpload) => {
        if (windowUpload.completed || chunk.endMs <= windowUpload.startMs) {
          return;
        }

        enqueuePcmChunkUpload({
          attempt,
          chunk,
          currentSessionId,
          windowUpload,
        });
      });
    },
    [enqueuePcmChunkUpload],
  );

  const completeBatchWindow = useCallback(
    (batch: LiveAudioTranscriptionBatch) => {
      uploadBatchWindow(batch);
      windowUploadsRef.current = windowUploadsRef.current.map((windowUpload) =>
        windowUpload.batchKey === batch.key
          ? { ...windowUpload, completed: true }
          : windowUpload,
      );
    },
    [uploadBatchWindow],
  );

  const createClipFileFromBatch = useCallback(
    (batch: LiveAudioTranscriptionBatch) =>
      createAudioClipFileFromPcmChunks({
        batch,
        chunks: pcmChunksRef.current,
        fileName: buildRealtimeUploadWindowFileName({ batch }),
      }),
    [],
  );

  const uploadBatchClip = useCallback(
    ({
      batch,
      file,
      liveWaveform,
    }: {
      batch: LiveAudioTranscriptionBatch;
      file: File;
      liveWaveform?: AudioWaveformJson | null;
    }) => {
      const currentSessionId = sessionIdRef.current;

      if (!currentSessionId) {
        return;
      }

      uploadRealtimeBatchClip({
        batch,
        completeBatchWindow,
        currentSessionId,
        file,
        liveWaveform,
        objectPath,
        onClipUploaded,
        pluginSessionsRef,
        reportUploadError,
        startAttemptRef,
        trackUpload,
        updateChunk,
      });
    },
    [
      completeBatchWindow,
      objectPath,
      onClipUploaded,
      reportUploadError,
      trackUpload,
      updateChunk,
    ],
  );

  const uploadCaptureComplete = useCallback(
    ({
      completedBatches,
      event,
      liveWaveform,
    }: {
      completedBatches: readonly LiveAudioTranscriptionBatch[];
      event: LiveAudioCaptureCompleteEvent;
      liveWaveform?: AudioWaveformJson | null;
    }) => {
      const currentSessionId = sessionIdRef.current;

      if (!currentSessionId) {
        return;
      }

      uploadRealtimeCapture({
        completedBatches,
        currentSessionId,
        event,
        liveWaveform,
        objectPath,
        onCaptureUploadError,
        onCaptureUploaded,
        pluginSessionsRef,
        reportUploadError,
        startAttemptRef,
        trackUpload,
      });
    },
    [
      objectPath,
      onCaptureUploadError,
      onCaptureUploaded,
      reportUploadError,
      trackUpload,
    ],
  );

  const { start, stop } = useLiveAudioRealtimeUploadLifecycle({
    chunksRef,
    objectPath,
    pcmChunksRef,
    pendingUploadsRef,
    pluginSessionsRef,
    plugins,
    reportUploadError,
    sessionIdRef,
    setChunks,
    setErrorMessage,
    setSessionId,
    setStats,
    setStatus,
    startAttemptRef,
    windowUploadsRef,
  });

  return {
    chunks,
    errorMessage,
    sessionId,
    start,
    stats,
    status,
    stop,
    completeBatchWindow,
    createClipFileFromBatch,
    uploadCaptureComplete,
    uploadBatchClip,
    uploadBatchWindow,
    uploadPcmChunk,
    uploadedSizeBytes,
  };
}

function readUploadedSizeBytes(
  totalSizeBytes: number,
  chunk: RealtimeUploadChunk,
) {
  return chunk.status === 'uploaded'
    ? totalSizeBytes + chunk.sizeBytes
    : totalSizeBytes;
}

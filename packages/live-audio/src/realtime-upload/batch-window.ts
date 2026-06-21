import type { MutableRefObject } from 'react';

import { notifyBatchProgressPlugins } from '../plugins/events';
import type {
  LiveAudioPcmStreamChunk,
  LiveAudioPluginSession,
} from '../plugins/contracts';
import type { RealtimeUploadChunk } from './state';
import {
  buildRealtimeUploadObjectName,
  buildRealtimeUploadWindowFileName,
} from './state';
import {
  type WindowUpload,
  createWindowUpload,
  markWindowUploadScanned,
  readBatchUploadStartMs,
  readStreamingProgress,
  readUnscannedWindowItems,
  upsertRealtimeChunk,
  upsertWindowUpload,
} from './window-state';
import type { LiveAudioTranscriptionBatch } from '../transcription/transcription-batches';

export function uploadRealtimeBatchWindow({
  batch,
  currentSessionId,
  enqueuePcmChunkUpload,
  objectPath,
  pcmChunksRef,
  pluginSessionsRef,
  reportUploadError,
  setRealtimeUploadChunks,
  startAttemptRef,
  trackUpload,
  windowUploadsRef,
}: {
  batch: LiveAudioTranscriptionBatch;
  currentSessionId: string;
  enqueuePcmChunkUpload: (input: {
    chunk: LiveAudioPcmStreamChunk;
    currentSessionId: string;
    windowUpload: WindowUpload;
  }) => void;
  objectPath: string;
  pcmChunksRef: MutableRefObject<LiveAudioPcmStreamChunk[]>;
  pluginSessionsRef: MutableRefObject<LiveAudioPluginSession[]>;
  reportUploadError: (attempt: number, error: unknown) => void;
  setRealtimeUploadChunks: (
    update: (
      currentChunks: readonly RealtimeUploadChunk[],
    ) => RealtimeUploadChunk[],
  ) => void;
  startAttemptRef: MutableRefObject<number>;
  trackUpload: (upload: Promise<void>) => void;
  windowUploadsRef: MutableRefObject<WindowUpload[]>;
}) {
  const startMs = readBatchUploadStartMs(batch);

  if (startMs === null) {
    return;
  }

  const attempt = startAttemptRef.current;
  const fileName = buildRealtimeUploadWindowFileName({ batch });
  const objectName = buildRealtimeUploadObjectName({
    fileName,
    objectPath,
    sessionId: currentSessionId,
  });
  const currentWindowUpload =
    windowUploadsRef.current.find(
      (windowUpload) => windowUpload.batchKey === batch.key,
    ) ?? createWindowUpload({ batch, startMs });
  const shouldRescanWindow = startMs !== currentWindowUpload.startMs;
  const nextWindowUpload = {
    ...currentWindowUpload,
    scannedPcmChunkCount: shouldRescanWindow
      ? 0
      : currentWindowUpload.scannedPcmChunkCount,
    startMs,
    transcript: batch.transcript,
  };
  const unscannedPcmChunks = readUnscannedWindowItems(
    pcmChunksRef.current,
    nextWindowUpload,
  );

  windowUploadsRef.current = upsertWindowUpload(
    windowUploadsRef.current,
    markWindowUploadScanned(nextWindowUpload, pcmChunksRef.current.length),
  );
  setRealtimeUploadChunks((currentChunks) =>
    upsertRealtimeChunk(currentChunks, {
      batchKey: batch.key,
      fileName,
      objectName,
      progress: readStreamingProgress(nextWindowUpload),
      segmentCount: nextWindowUpload.queuedChunkIndexes.length,
      sizeBytes: nextWindowUpload.uploadedSizeBytes,
      status:
        nextWindowUpload.queuedChunkIndexes.length > 0 ? 'uploading' : 'queued',
      transcript: batch.transcript,
      uploadedSegmentCount: nextWindowUpload.uploadedSegmentCount,
      url: null,
    }),
  );
  trackUpload(
    notifyBatchProgressPlugins(pluginSessionsRef.current, {
      batch,
      objectName,
      sessionId: currentSessionId,
    }).catch((error: unknown) => {
      if (startAttemptRef.current !== attempt) {
        return;
      }

      reportUploadError(attempt, error);
    }),
  );

  unscannedPcmChunks
    .filter((chunk) => chunk.endMs > startMs)
    .forEach((chunk) => {
      const latestWindowUpload = windowUploadsRef.current.find(
        (candidate) => candidate.batchKey === batch.key,
      );

      if (latestWindowUpload) {
        enqueuePcmChunkUpload({
          chunk,
          currentSessionId,
          windowUpload: latestWindowUpload,
        });
      }
    });
}

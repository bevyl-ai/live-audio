import { readBatchClipTimeRangeMs } from '../clips/audio-clips';
import type { RealtimeUploadChunk } from './state';
import type { LiveAudioTranscriptionBatch } from '../transcription/transcription-batches';

export type WindowUpload = {
  batchKey: string;
  completed: boolean;
  queuedChunkIndexes: readonly number[];
  scannedPcmChunkCount: number;
  startMs: number;
  transcript: string;
  uploadedSegmentCount: number;
  uploadedSizeBytes: number;
};

export function createWindowUpload({
  batch,
  startMs,
}: {
  batch: LiveAudioTranscriptionBatch;
  startMs: number;
}): WindowUpload {
  return {
    batchKey: batch.key,
    completed: false,
    queuedChunkIndexes: [],
    scannedPcmChunkCount: 0,
    startMs,
    transcript: batch.transcript,
    uploadedSegmentCount: 0,
    uploadedSizeBytes: 0,
  };
}

export function markWindowUploadScanned(
  windowUpload: WindowUpload,
  scannedPcmChunkCount: number,
) {
  return {
    ...windowUpload,
    scannedPcmChunkCount: Math.max(
      windowUpload.scannedPcmChunkCount,
      scannedPcmChunkCount,
    ),
  };
}

export function readUnscannedWindowItems<T>(
  items: readonly T[],
  windowUpload: WindowUpload,
) {
  return items.slice(windowUpload.scannedPcmChunkCount);
}

export function upsertWindowUpload(
  uploads: readonly WindowUpload[],
  nextUpload: WindowUpload,
) {
  const existingUploadIndex = uploads.findIndex(
    (upload) => upload.batchKey === nextUpload.batchKey,
  );

  if (existingUploadIndex === -1) {
    return uploads.concat(nextUpload);
  }

  return uploads.map((upload, index) =>
    index === existingUploadIndex ? nextUpload : upload,
  );
}

export function upsertRealtimeChunk(
  chunks: readonly RealtimeUploadChunk[],
  nextChunk: RealtimeUploadChunk,
) {
  const existingChunkIndex = chunks.findIndex(
    (chunk) => chunk.batchKey === nextChunk.batchKey,
  );

  if (existingChunkIndex === -1) {
    return chunks.concat(nextChunk);
  }

  return chunks.map((chunk, index) =>
    index === existingChunkIndex ? nextChunk : chunk,
  );
}

export function readStreamingProgress(windowUpload: WindowUpload) {
  if (windowUpload.completed) {
    return 95;
  }

  if (windowUpload.queuedChunkIndexes.length === 0) {
    return 0;
  }

  const progress =
    windowUpload.uploadedSegmentCount / windowUpload.queuedChunkIndexes.length;

  return Math.max(5, Math.min(90, Math.round(progress * 90)));
}

export function readBatchUploadStartMs(batch: LiveAudioTranscriptionBatch) {
  const clipTimeRange = readBatchClipTimeRangeMs(batch);

  return clipTimeRange?.startMs ?? null;
}

export function waitForUploadsToDrain(
  readPendingUploads: () => readonly Promise<void>[],
) {
  return new Promise<void>((resolve) => {
    const poll = () => {
      const pendingUploads = readPendingUploads();
      if (pendingUploads.length === 0) {
        resolve();
        return;
      }

      void Promise.allSettled(pendingUploads).then(poll);
    };

    poll();
  });
}

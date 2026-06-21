import type { MutableRefObject } from 'react';

import type {
  LiveAudioPcmStreamChunk,
  LiveAudioPluginSession,
} from '../plugins/contracts';
import { notifyPcmChunkPlugins } from '../plugins/events';
import type { RealtimeUploadChunk } from './state';
import { buildRealtimeUploadSegmentObjectName } from './state';
import type { WindowUpload } from './window-state';
import { readStreamingProgress, upsertWindowUpload } from './window-state';

export function enqueueRealtimePcmChunkUpload({
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
}: {
  attempt: number;
  chunk: LiveAudioPcmStreamChunk;
  chunksRef: MutableRefObject<RealtimeUploadChunk[]>;
  currentSessionId: string;
  objectPath: string;
  pluginSessionsRef: MutableRefObject<LiveAudioPluginSession[]>;
  reportUploadError: (attempt: number, error: unknown) => void;
  startAttemptRef: MutableRefObject<number>;
  trackUpload: (upload: Promise<void>) => void;
  updateChunk: (batchKey: string, update: Partial<RealtimeUploadChunk>) => void;
  windowUpload: WindowUpload;
  windowUploadsRef: MutableRefObject<WindowUpload[]>;
}) {
  if (
    windowUpload.completed ||
    windowUpload.queuedChunkIndexes.includes(chunk.index)
  ) {
    return;
  }

  const nextWindowUpload = {
    ...windowUpload,
    queuedChunkIndexes: windowUpload.queuedChunkIndexes.concat(chunk.index),
  };
  windowUploadsRef.current = upsertWindowUpload(
    windowUploadsRef.current,
    nextWindowUpload,
  );

  updateChunk(windowUpload.batchKey, {
    progress: readStreamingProgress(nextWindowUpload),
    segmentCount: nextWindowUpload.queuedChunkIndexes.length,
    status: 'uploading',
    transcript: windowUpload.transcript,
  });

  const objectName = buildRealtimeUploadSegmentObjectName({
    batchKey: windowUpload.batchKey,
    objectPath,
    segmentIndex: chunk.index,
    sessionId: currentSessionId,
  });
  trackUpload(
    notifyPcmChunkPlugins(pluginSessionsRef.current, {
      batchKey: windowUpload.batchKey,
      chunk,
      objectName,
      sessionId: currentSessionId,
    })
      .then(() => {
        if (startAttemptRef.current !== attempt) {
          return;
        }

        const currentWindowUpload = windowUploadsRef.current.find(
          (candidate) => candidate.batchKey === windowUpload.batchKey,
        );

        if (!currentWindowUpload) {
          return;
        }

        const uploadedWindowUpload = {
          ...currentWindowUpload,
          uploadedSegmentCount: currentWindowUpload.uploadedSegmentCount + 1,
          uploadedSizeBytes:
            currentWindowUpload.uploadedSizeBytes + chunk.data.byteLength,
        };
        windowUploadsRef.current = upsertWindowUpload(
          windowUploadsRef.current,
          uploadedWindowUpload,
        );

        const currentChunk = chunksRef.current.find(
          (chunk) => chunk.batchKey === windowUpload.batchKey,
        );

        if (
          currentWindowUpload.completed ||
          currentChunk?.status === 'uploaded'
        ) {
          updateChunk(windowUpload.batchKey, {
            segmentCount: uploadedWindowUpload.queuedChunkIndexes.length,
            uploadedSegmentCount: uploadedWindowUpload.uploadedSegmentCount,
          });
          return;
        }

        updateChunk(windowUpload.batchKey, {
          progress: readStreamingProgress(uploadedWindowUpload),
          segmentCount: uploadedWindowUpload.queuedChunkIndexes.length,
          sizeBytes: uploadedWindowUpload.uploadedSizeBytes,
          status: 'uploading',
          uploadedSegmentCount: uploadedWindowUpload.uploadedSegmentCount,
        });
      })
      .catch((error: unknown) => {
        if (startAttemptRef.current !== attempt) {
          return;
        }

        updateChunk(windowUpload.batchKey, { status: 'failed' });
        reportUploadError(attempt, error);
      }),
  );
}

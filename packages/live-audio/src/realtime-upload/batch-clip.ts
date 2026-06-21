import type { MutableRefObject } from 'react';

import type { AudioWaveformJson } from '../audio-waveform';

import { readBatchClipTimeRangeMs } from '../clips/audio-clips';
import type { LiveAudioPluginSession } from '../plugins/contracts';
import { notifyBatchCompletePlugins } from '../plugins/events';
import type { LiveAudioTranscriptionBatch } from '../transcription/transcription-batches';
import type { LiveAudioRealtimeUploadClip, RealtimeUploadChunk } from './state';
import {
  buildRealtimeUploadChunkFileName,
  buildRealtimeUploadObjectName,
} from './state';
import { buildBatchWaveformInput } from './upload-waveform';

export function uploadRealtimeBatchClip({
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
}: {
  batch: LiveAudioTranscriptionBatch;
  completeBatchWindow: (batch: LiveAudioTranscriptionBatch) => void;
  currentSessionId: string;
  file: File;
  liveWaveform?: AudioWaveformJson | null;
  objectPath: string;
  onClipUploaded: (clip: LiveAudioRealtimeUploadClip) => void;
  pluginSessionsRef: MutableRefObject<LiveAudioPluginSession[]>;
  reportUploadError: (attempt: number, error: unknown) => void;
  startAttemptRef: MutableRefObject<number>;
  trackUpload: (upload: Promise<void>) => void;
  updateChunk: (batchKey: string, update: Partial<RealtimeUploadChunk>) => void;
}) {
  completeBatchWindow(batch);

  const attempt = startAttemptRef.current;
  const fileName = buildRealtimeUploadChunkFileName({ batch, file });
  const clipTimeRange = readBatchClipTimeRangeMs(batch);
  const objectName = buildRealtimeUploadObjectName({
    fileName,
    objectPath,
    sessionId: currentSessionId,
  });

  updateChunk(batch.key, {
    fileName,
    objectName,
    progress: 95,
    sizeBytes: file.size,
    status: 'uploading',
    transcript: batch.transcript,
  });

  const waveformInput = buildBatchWaveformInput({
    batch,
    liveWaveform,
    objectPath,
    sessionId: currentSessionId,
  });
  trackUpload(
    notifyBatchCompletePlugins(pluginSessionsRef.current, {
      batch,
      file,
      fileName,
      objectName,
      sessionId: currentSessionId,
      ...(waveformInput ? { waveform: waveformInput } : {}),
    })
      .then((result) => {
        if (startAttemptRef.current !== attempt) {
          return;
        }

        if (!result.audio) {
          throw new Error('Live audio plugin did not upload batch audio.');
        }

        updateChunk(batch.key, {
          progress: 100,
          status: 'uploaded',
          url: result.audio.url,
        });

        if (clipTimeRange) {
          onClipUploaded({
            batch,
            durationSeconds:
              (clipTimeRange.endMs - clipTimeRange.startMs) / 1000,
            url: result.audio.url,
            ...(result.waveform ? { waveformUrl: result.waveform.url } : {}),
          });
        }
      })
      .catch((error: unknown) => {
        if (startAttemptRef.current !== attempt) {
          return;
        }

        updateChunk(batch.key, { status: 'failed' });
        reportUploadError(attempt, error);
      }),
  );
}

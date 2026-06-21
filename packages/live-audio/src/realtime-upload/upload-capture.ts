import type { MutableRefObject } from 'react';

import type { AudioWaveformJson } from '../audio-waveform';

import {
  type LiveAudioCaptureCompleteEvent,
  createLiveAudioCaptureCompleteFile,
  getLiveAudioCaptureCompleteDurationSeconds,
} from '../capture/complete-event';
import type { LiveAudioPluginSession } from '../plugins/contracts';
import { notifyCaptureCompletePlugins } from '../plugins/events';
import type { LiveAudioTranscriptionBatch } from '../transcription/transcription-batches';
import {
  type LiveAudioRealtimeUploadCapture,
  buildRealtimeUploadCaptureFileName,
  buildRealtimeUploadObjectName,
} from './state';
import { buildCaptureWaveformInput } from './upload-waveform';

export function uploadRealtimeCapture({
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
}: {
  completedBatches: readonly LiveAudioTranscriptionBatch[];
  currentSessionId: string;
  event: LiveAudioCaptureCompleteEvent;
  liveWaveform?: AudioWaveformJson | null;
  objectPath: string;
  onCaptureUploadError?: (errorMessage: string) => void;
  onCaptureUploaded: (capture: LiveAudioRealtimeUploadCapture) => void;
  pluginSessionsRef: MutableRefObject<LiveAudioPluginSession[]>;
  reportUploadError: (attempt: number, error: unknown) => void;
  startAttemptRef: MutableRefObject<number>;
  trackUpload: (upload: Promise<void>) => void;
}) {
  const attempt = startAttemptRef.current;
  const fileName = buildRealtimeUploadCaptureFileName({
    mimeType: event.audio.mimeType,
  });
  const file = createLiveAudioCaptureCompleteFile({ event, fileName });
  const objectName = buildRealtimeUploadObjectName({
    fileName,
    objectPath,
    sessionId: currentSessionId,
  });
  const waveformInput = buildCaptureWaveformInput({
    event,
    liveWaveform,
    objectPath,
    sessionId: currentSessionId,
  });
  trackUpload(
    notifyCaptureCompletePlugins(pluginSessionsRef.current, {
      completedBatches,
      event,
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
          throw new Error('Live audio plugin did not upload captured audio.');
        }

        onCaptureUploaded({
          completedBatches,
          durationSeconds: getLiveAudioCaptureCompleteDurationSeconds(event),
          sessionId: currentSessionId,
          url: result.audio.url,
          ...(result.waveform ? { waveformUrl: result.waveform.url } : {}),
        });
      })
      .catch((error: unknown) => {
        if (startAttemptRef.current !== attempt) {
          return;
        }

        onCaptureUploadError?.(
          error instanceof Error
            ? error.message
            : 'Live audio capture upload failed.',
        );
        reportUploadError(attempt, error);
      }),
  );
}

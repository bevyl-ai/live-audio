import { describe, expect, it, vi } from 'vitest';

import type { LiveAudioCaptureCompleteEvent } from '../src/capture/complete-event';
import { createInitialPcmCaptureStats } from '../src/capture/pcm';
import { uploadRealtimeCapture } from '../src/realtime-upload/upload-capture';

describe('uploadRealtimeCapture', () => {
  it('reports the saved audio when an optional capture artifact upload fails', async () => {
    const onCaptureUploaded = vi.fn();
    const reportUploadError = vi.fn();
    const trackedUploads: Promise<void>[] = [];

    uploadRealtimeCapture({
      completedBatches: [],
      currentSessionId: 'session-1',
      event: createCompleteEvent(),
      objectPath: 'recordings/demo',
      onCaptureUploaded,
      pluginSessionsRef: {
        current: [
          {
            async onCaptureComplete() {
              return {
                audio: {
                  objectName: 'capture.webm',
                  url: 'https://example.com/capture.webm',
                },
              };
            },
          },
          {
            async onCaptureComplete() {
              throw new Error('waveform upload failed');
            },
          },
        ],
      },
      reportUploadError,
      startAttemptRef: { current: 1 },
      trackUpload: (upload) => void trackedUploads.push(upload),
    });

    await Promise.all(trackedUploads);

    expect(reportUploadError).not.toHaveBeenCalled();
    expect(onCaptureUploaded).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-1',
        url: 'https://example.com/capture.webm',
      }),
    );
  });

  it('reports final capture upload failures separately from uploaded captures', async () => {
    const onCaptureUploaded = vi.fn();
    const onCaptureUploadError = vi.fn();
    const reportUploadError = vi.fn();
    const trackedUploads: Promise<void>[] = [];

    uploadRealtimeCapture({
      completedBatches: [],
      currentSessionId: 'session-1',
      event: createCompleteEvent(),
      objectPath: 'recordings/demo',
      onCaptureUploadError,
      onCaptureUploaded,
      pluginSessionsRef: {
        current: [
          {
            async onCaptureComplete() {
              throw new Error('audio upload failed');
            },
          },
        ],
      },
      reportUploadError,
      startAttemptRef: { current: 1 },
      trackUpload: (upload) => void trackedUploads.push(upload),
    });

    await Promise.all(trackedUploads);

    expect(onCaptureUploaded).not.toHaveBeenCalled();
    expect(onCaptureUploadError).toHaveBeenCalledWith('audio upload failed');
    expect(reportUploadError).toHaveBeenCalledTimes(1);
  });
});

function createCompleteEvent(): LiveAudioCaptureCompleteEvent {
  return {
    completedAtMs: 1200,
    audio: {
      blob: new Blob(['audio'], { type: 'audio/webm' }),
      chunks: [],
      mimeType: 'audio/webm',
      sizeBytes: 5,
    },
    pcm: {
      frames: [],
      stats: createInitialPcmCaptureStats('audio/webm'),
    },
  };
}

import { describe, expect, it } from 'vitest';

import type { LiveAudioPluginCaptureCompleteInput } from '../src/plugins/contracts';
import { notifyCaptureCompletePlugins } from '../src/plugins/events';

describe('notifyCaptureCompletePlugins', () => {
  it('keeps the uploaded audio result when an optional capture artifact fails', async () => {
    const result = await notifyCaptureCompletePlugins(
      [
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
      buildCaptureCompleteInput(),
    );

    expect(result).toEqual({
      audio: {
        objectName: 'capture.webm',
        url: 'https://example.com/capture.webm',
      },
    });
  });

  it('keeps failing when every capture artifact upload fails', async () => {
    await expect(
      notifyCaptureCompletePlugins(
        [
          {
            async onCaptureComplete() {
              throw new Error('audio upload failed');
            },
          },
        ],
        buildCaptureCompleteInput(),
      ),
    ).rejects.toThrow('audio upload failed');
  });
});

function buildCaptureCompleteInput(): LiveAudioPluginCaptureCompleteInput {
  return {
    completedBatches: [],
    event: {
      completedAtMs: 1,
      audio: {
        blob: new Blob(['audio'], { type: 'audio/webm' }),
        chunks: [],
        mimeType: 'audio/webm',
        sizeBytes: 5,
      },
      pcm: {
        frames: [],
        stats: {
          mediaRecorderMimeType: 'audio/webm',
          chunksReceived: 0,
          bytesReceived: 0,
          audioFramesDecoded: 0,
          pcmFramesEmitted: 0,
          pcmSamplesEmitted: 0,
          lastTimestampSeconds: null,
          sampleRateHz: null,
          channelCount: null,
        },
      },
    },
    file: new File(['audio'], 'capture.webm', { type: 'audio/webm' }),
    fileName: 'capture.webm',
    objectName: 'capture.webm',
    sessionId: 'session-1',
  };
}

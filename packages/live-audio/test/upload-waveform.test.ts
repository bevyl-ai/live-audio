import { describe, expect, it } from 'vitest';

import type { LiveAudioCaptureCompleteEvent } from '../src/capture/complete-event';
import type { PcmFrame } from '../src/capture/pcm';
import { createInitialPcmCaptureStats } from '../src/capture/pcm';
import { buildCaptureWaveformInput } from '../src/realtime-upload/upload-waveform';

describe('buildCaptureWaveformInput', () => {
  it('uses complete-event pcm frames for final capture waveform upload', () => {
    const input = buildCaptureWaveformInput({
      event: buildCompleteEvent({
        frames: [
          buildPcmFrame(Array.from<number>({ length: 1600 }).fill(0.2)),
          buildPcmFrame(Array.from<number>({ length: 1600 }).fill(0.7)),
        ],
      }),
      liveWaveform: null,
      objectPath: 'recordings/demo',
      sessionId: 'session-1',
    });

    expect(input?.objectName).toBe(
      'recordings/demo/session-1/live-audio-capture-waveform-30hz.json',
    );
    expect(input?.waveform.sampleRateHz).toBe(30);
    expect(input?.waveform.pairs.length).toBeGreaterThan(0);
  });

  it('falls back to the live waveform when final capture has no decoded frames', () => {
    const input = buildCaptureWaveformInput({
      event: buildCompleteEvent({ frames: [] }),
      liveWaveform: {
        v: 1,
        sampleRateHz: 30,
        pairs: [0, 0, 1, 1],
      },
      objectPath: 'recordings/demo',
      sessionId: 'session-1',
    });

    expect(input?.waveform.pairs).toEqual([0, 0, 1, 1]);
  });
});

function buildCompleteEvent({
  frames,
}: {
  frames: readonly PcmFrame[];
}): LiveAudioCaptureCompleteEvent {
  return {
    completedAtMs: 10,
    audio: {
      blob: new Blob(['audio'], { type: 'audio/webm' }),
      chunks: [],
      mimeType: 'audio/webm',
      sizeBytes: 5,
    },
    pcm: {
      frames,
      stats: createInitialPcmCaptureStats('audio/webm'),
    },
  };
}

function buildPcmFrame(samples: number[], sampleRateHz = 48000): PcmFrame {
  return {
    sequence: 1,
    timestampSeconds: 0,
    durationSeconds: samples.length / sampleRateHz,
    sampleRateHz,
    channelCount: 1,
    samples: Float32Array.from(samples),
  };
}

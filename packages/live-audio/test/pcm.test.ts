import {
  AudioSample,
  type AudioSampleInit,
  AudioSampleResource,
} from 'mediabunny';
import { describe, expect, it } from 'vitest';

import { readBatchClipTimeRangeMs } from '../src/clips/audio-clips';
import {
  selectSupportedMediaRecorderAudioMimeType,
  startMediabunnyPcmCapture,
} from '../src/capture/mediabunny-pcm-capture';
import {
  buildPcmFrameFromAudioSample,
  createInitialPcmCaptureStats,
  recordMediaRecorderChunk,
  recordPcmFrame,
} from '../src/capture/pcm';

function createStereoSample() {
  return new AudioSample({
    data: Float32Array.from([1, -1, 0.5, -0.25, 0.25, 0.75]),
    format: 'f32',
    numberOfChannels: 2,
    sampleRate: 48_000,
    timestamp: 1.25,
  });
}

class InvalidPcmPlaneResource extends AudioSampleResource {
  getFormat(): AudioSampleInit['format'] {
    return 'f32';
  }

  getSampleRate() {
    return 48_000;
  }

  getNumberOfFrames() {
    return 2;
  }

  getNumberOfChannels() {
    return 2;
  }

  getTimestamp() {
    return 0;
  }

  close() {}

  getDataPlane() {
    return new Uint8Array(4);
  }
}

class UnusedMediaStream extends EventTarget implements MediaStream {
  active = false;
  id = 'unused-media-stream';
  onaddtrack:
    | ((this: MediaStream, event: MediaStreamTrackEvent) => void)
    | null = null;
  onremovetrack:
    | ((this: MediaStream, event: MediaStreamTrackEvent) => void)
    | null = null;

  addTrack() {}

  clone() {
    return new UnusedMediaStream();
  }

  getAudioTracks() {
    return [];
  }

  getTrackById() {
    return null;
  }

  getTracks() {
    return [];
  }

  getVideoTracks() {
    return [];
  }

  removeTrack() {}
}

describe('PCM helpers', () => {
  it('builds ordered mono PCM frames from MediaBunny AudioSample metadata', () => {
    const audioSample = createStereoSample();

    try {
      const pcmFrame = buildPcmFrameFromAudioSample({
        audioSample,
        sequence: 7,
        mono: true,
      });

      expect(pcmFrame.sequence).toBe(7);
      expect(pcmFrame.timestampSeconds).toBe(1.25);
      expect(pcmFrame.durationSeconds).toBe(3 / 48_000);
      expect(pcmFrame.sampleRateHz).toBe(48_000);
      expect(pcmFrame.channelCount).toBe(1);
      expect(Array.from(pcmFrame.samples)).toEqual([0, 0.125, 0.5]);
    } finally {
      audioSample.close();
    }
  });

  it('keeps decoded channels when mono capture is disabled', () => {
    const audioSample = createStereoSample();

    try {
      const pcmFrame = buildPcmFrameFromAudioSample({
        audioSample,
        sequence: 8,
        mono: false,
      });

      expect(pcmFrame.sequence).toBe(8);
      expect(pcmFrame.channelCount).toBe(2);
      expect(Array.from(pcmFrame.samples)).toEqual([
        1, -1, 0.5, -0.25, 0.25, 0.75,
      ]);
    } finally {
      audioSample.close();
    }
  });

  it('rejects decoded PCM whose data plane does not match frame metadata', () => {
    const audioSample = new AudioSample(new InvalidPcmPlaneResource());

    try {
      expect(() =>
        buildPcmFrameFromAudioSample({
          audioSample,
          sequence: 0,
          mono: true,
        }),
      ).toThrow(/invalid size|sample count/i);
    } finally {
      audioSample.close();
    }
  });

  it('updates chunk and emitted-frame stats without mutating prior snapshots', () => {
    const initialStats = createInitialPcmCaptureStats();
    const chunkStats = recordMediaRecorderChunk(initialStats, 128);
    const frameStats = recordPcmFrame(chunkStats, {
      sequence: 0,
      timestampSeconds: 1,
      durationSeconds: 0.02,
      sampleRateHz: 48_000,
      channelCount: 1,
      samples: Float32Array.from([0.1, 0.2, 0.3]),
    });

    expect(initialStats.chunksReceived).toBe(0);
    expect(initialStats.mediaRecorderMimeType).toBeNull();
    expect(chunkStats.chunksReceived).toBe(1);
    expect(chunkStats.bytesReceived).toBe(128);
    expect(frameStats.audioFramesDecoded).toBe(1);
    expect(frameStats.pcmFramesEmitted).toBe(1);
    expect(frameStats.pcmSamplesEmitted).toBe(3);
    expect(frameStats.lastTimestampSeconds).toBe(1);
    expect(frameStats.sampleRateHz).toBe(48_000);
    expect(frameStats.channelCount).toBe(1);
  });

  it('selects the first supported MediaRecorder MIME type in preferred order', () => {
    const selectedMimeType = selectSupportedMediaRecorderAudioMimeType(
      (mimeType) =>
        mimeType === 'audio/webm;codecs=opus' ||
        mimeType === 'audio/webm' ||
        mimeType === 'audio/mp4',
    );

    expect(selectedMimeType).toBe('audio/webm;codecs=opus');
    expect(selectSupportedMediaRecorderAudioMimeType(() => false)).toBeNull();
  });

  it('rejects invalid recorder numeric options instead of dropping them', () => {
    const mediaStream = new UnusedMediaStream();

    expect(() =>
      startMediabunnyPcmCapture(mediaStream, {
        audioBitsPerSecond: 0,
        onFrame() {},
      }),
    ).toThrow('audioBitsPerSecond must be a positive safe integer');
    expect(() =>
      startMediabunnyPcmCapture(mediaStream, {
        timesliceMs: Number.NaN,
        onFrame() {},
      }),
    ).toThrow('timesliceMs must be a positive safe integer');
    expect(() =>
      startMediabunnyPcmCapture(mediaStream, {
        maxCacheSizeBytes: 1.5,
        onFrame() {},
      }),
    ).toThrow('maxCacheSizeBytes must be a positive safe integer');
    expect(() =>
      startMediabunnyPcmCapture(mediaStream, {
        progressIntervalMs: 0,
        onFrame() {},
      }),
    ).toThrow('progressIntervalMs must be a positive safe integer');
  });
});

describe('live audio clip timing', () => {
  it('keeps finalized zero-duration provider words uploadable', () => {
    expect(
      readBatchClipTimeRangeMs({
        key: 'zero-duration-turn',
        message: {
          isComplete: true,
          sourceBatchKey: 'zero-duration-turn',
          transcript: 'ok',
          words: [{ endMs: 400, startMs: 400, text: 'ok' }],
        },
        transcript: 'ok',
        words: [{ endMs: 400, startMs: 400, text: 'ok' }],
      }),
    ).toEqual({
      startMs: 400,
      endMs: 480,
    });
  });
});

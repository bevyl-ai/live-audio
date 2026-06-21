import type { AudioSample } from 'mediabunny';

const BYTES_PER_FLOAT32 = 4;

export type PcmFrame = {
  sequence: number;
  timestampSeconds: number;
  durationSeconds: number;
  sampleRateHz: number;
  channelCount: number;
  samples: Float32Array;
};

export type PcmCaptureStats = {
  mediaRecorderMimeType: string | null;
  chunksReceived: number;
  bytesReceived: number;
  audioFramesDecoded: number;
  pcmFramesEmitted: number;
  pcmSamplesEmitted: number;
  lastTimestampSeconds: number | null;
  sampleRateHz: number | null;
  channelCount: number | null;
};

export function createInitialPcmCaptureStats(
  mediaRecorderMimeType: string | null = null,
): PcmCaptureStats {
  return {
    mediaRecorderMimeType,
    chunksReceived: 0,
    bytesReceived: 0,
    audioFramesDecoded: 0,
    pcmFramesEmitted: 0,
    pcmSamplesEmitted: 0,
    lastTimestampSeconds: null,
    sampleRateHz: null,
    channelCount: null,
  };
}

export function recordMediaRecorderChunk(
  stats: PcmCaptureStats,
  byteLength: number,
): PcmCaptureStats {
  return {
    ...stats,
    chunksReceived: stats.chunksReceived + 1,
    bytesReceived: stats.bytesReceived + byteLength,
  };
}

function assertAudioSampleCanBuildPcmFrame(audioSample: AudioSample) {
  if (audioSample.numberOfChannels < 1) {
    throw new Error('PCM channel count must be positive');
  }
}

function downmixInterleavedF32ToMono(
  samples: Float32Array,
  frameCount: number,
  channelCount: number,
) {
  if (channelCount < 1) {
    throw new Error('PCM channel count must be positive');
  }

  if (channelCount === 1) {
    return samples;
  }

  const expectedSampleCount = frameCount * channelCount;
  if (samples.length !== expectedSampleCount) {
    throw new Error('PCM sample count does not match frame and channel counts');
  }

  const monoSamples = new Float32Array(frameCount);

  for (
    // eslint-disable-next-line no-restricted-syntax -- frame index advances through decoded PCM frames.
    let frameIndex = 0;
    frameIndex < frameCount;
    frameIndex++
  ) {
    // eslint-disable-next-line no-restricted-syntax -- sum accumulates channel values for one frame.
    let sum = 0;

    for (
      // eslint-disable-next-line no-restricted-syntax -- channel index advances through channels in the current frame.
      let channelIndex = 0;
      channelIndex < channelCount;
      channelIndex++
    ) {
      const sampleIndex = frameIndex * channelCount + channelIndex;
      const sample = samples[sampleIndex];

      if (sample === undefined) {
        throw new Error('PCM sample is missing channel data');
      }

      sum += sample;
    }

    monoSamples[frameIndex] = sum / channelCount;
  }

  return monoSamples;
}

export function buildPcmFrameFromAudioSample({
  audioSample,
  sequence,
  mono,
}: {
  audioSample: AudioSample;
  sequence: number;
  mono: boolean;
}): PcmFrame {
  assertAudioSampleCanBuildPcmFrame(audioSample);

  const copiedSamples = ((f32Plane: Float32Array) => (
    audioSample.copyTo(f32Plane, { planeIndex: 0, format: 'f32' }),
    f32Plane
  ))(
    new Float32Array(
      audioSample.allocationSize({ planeIndex: 0, format: 'f32' }) /
        BYTES_PER_FLOAT32,
    ),
  );
  const samples = mono
    ? downmixInterleavedF32ToMono(
        copiedSamples,
        audioSample.numberOfFrames,
        audioSample.numberOfChannels,
      )
    : copiedSamples;
  const channelCount = mono ? 1 : audioSample.numberOfChannels;

  return {
    sequence,
    timestampSeconds: audioSample.timestamp,
    durationSeconds: audioSample.duration,
    sampleRateHz: audioSample.sampleRate,
    channelCount,
    samples,
  };
}

export function recordPcmFrame(
  stats: PcmCaptureStats,
  pcmFrame: PcmFrame,
): PcmCaptureStats {
  return {
    ...stats,
    audioFramesDecoded: stats.audioFramesDecoded + 1,
    pcmFramesEmitted: stats.pcmFramesEmitted + 1,
    pcmSamplesEmitted: stats.pcmSamplesEmitted + pcmFrame.samples.length,
    lastTimestampSeconds: pcmFrame.timestampSeconds,
    sampleRateHz: pcmFrame.sampleRateHz,
    channelCount: pcmFrame.channelCount,
  };
}

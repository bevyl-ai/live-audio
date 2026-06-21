import { describe, expect, it } from 'vitest';

import type { PcmFrame } from '../src/capture/pcm';
import {
  appendPcmFrameToWaveformAccumulator,
  buildAudioWaveformFromPcmFrames,
  createPcmWaveformAccumulator,
} from '../src/capture/pcm-waveform-accumulator';

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

describe('appendPcmFrameToWaveformAccumulator', () => {
  it('builds growing 30hz pair snapshots from pcm frames', () => {
    const accumulator = createPcmWaveformAccumulator(48000);
    const firstSnapshot = appendPcmFrameToWaveformAccumulator(
      accumulator,
      buildPcmFrame(Array.from({ length: 1600 }, () => 0.5)),
    );
    const firstLength = firstSnapshot.pairs.length;
    const secondSnapshot = appendPcmFrameToWaveformAccumulator(
      accumulator,
      buildPcmFrame(Array.from({ length: 1600 }, () => -0.25)),
    );

    expect(firstSnapshot.sampleRateHz).toBe(30);
    expect(secondSnapshot.pairs.length).toBeGreaterThan(firstLength);
    expect(secondSnapshot.pairs).toBe(firstSnapshot.pairs);
  });
});

describe('buildAudioWaveformFromPcmFrames', () => {
  it('builds a final waveform from completed capture pcm frames', () => {
    const waveform = buildAudioWaveformFromPcmFrames([
      buildPcmFrame(Array.from<number>({ length: 1600 }).fill(0.25)),
      buildPcmFrame(Array.from<number>({ length: 1600 }).fill(-0.5)),
    ]);

    expect(waveform?.sampleRateHz).toBe(30);
    expect(waveform?.pairs.length).toBeGreaterThan(0);
    expect(waveform?.pairs.at(-1)).toBe(-0.5);
  });

  it('returns null when capture completed without decoded pcm frames', () => {
    const waveform = buildAudioWaveformFromPcmFrames([]);

    expect(waveform).toBeNull();
  });
});

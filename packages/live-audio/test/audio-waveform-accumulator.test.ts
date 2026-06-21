import { describe, expect, it } from 'vitest';

import {
  AUDIO_WAVEFORM_FRAME_RATE_HZ,
  AUDIO_WAVEFORM_VERSION,
  AudioWaveformAccumulator,
  type AudioWaveformJson,
  parseAudioWaveformJson,
} from '../src/audio-waveform';

function reduceSamplesToWaveformJson(
  samples: ArrayLike<number>,
  sourceSampleRateHz: number,
): AudioWaveformJson {
  const totalFrames = Math.floor(
    (samples.length * AUDIO_WAVEFORM_FRAME_RATE_HZ) / sourceSampleRateHz,
  );
  const pairs = Array.from({ length: totalFrames }, (_entry, frameIndex) => {
    const start = Math.floor(
      (frameIndex * sourceSampleRateHz) / AUDIO_WAVEFORM_FRAME_RATE_HZ,
    );
    const end = Math.floor(
      ((frameIndex + 1) * sourceSampleRateHz) / AUDIO_WAVEFORM_FRAME_RATE_HZ,
    );
    const frameValues = Array.from(
      { length: end - start },
      (_value, offset) => samples[start + offset],
    ).filter((value) => value != null);
    const min = frameValues.length > 0 ? Math.min(...frameValues) : 1;
    const max = frameValues.length > 0 ? Math.max(...frameValues) : -1;

    return [+min.toFixed(4), +max.toFixed(4)];
  }).flat();

  return {
    v: AUDIO_WAVEFORM_VERSION,
    sampleRateHz: AUDIO_WAVEFORM_FRAME_RATE_HZ,
    pairs,
  };
}

describe('AudioWaveformAccumulator', () => {
  it('preserves the 30hz waveform JSON contract', () => {
    const samples = Float32Array.from({ length: 1600 }, (_entry, index) =>
      index % 2 === 0 ? -0.25 : 0.5,
    );
    const accumulator = new AudioWaveformAccumulator(1600);

    for (const sample of samples) {
      accumulator.addSample(sample);
    }

    expect(accumulator.toWaveformJson()).toEqual({
      v: AUDIO_WAVEFORM_VERSION,
      sampleRateHz: AUDIO_WAVEFORM_FRAME_RATE_HZ,
      pairs: Array.from({ length: 30 }, () => [-0.25, 0.5]).flat(),
    });
  });

  it('matches retained sample reduction with fractional frame boundaries', () => {
    const samples = Float32Array.from({ length: 16000 }, (_entry, index) => {
      if (index % 11 === 0) {
        return -0.375;
      }

      if (index % 7 === 0) {
        return 0.625;
      }

      return index % 2 === 0 ? -0.125 : 0.25;
    });
    const accumulator = new AudioWaveformAccumulator(16000);

    for (const sample of samples) {
      accumulator.addSample(sample);
    }

    expect(accumulator.toWaveformJson()).toEqual(
      reduceSamplesToWaveformJson(samples, 16000),
    );
  });

  it('addMonoSamples matches repeated addSample calls', () => {
    const samples = Float32Array.from({ length: 16000 }, (_entry, index) => {
      if (index % 11 === 0) {
        return -0.375;
      }

      if (index % 7 === 0) {
        return 0.625;
      }

      return index % 2 === 0 ? -0.125 : 0.25;
    });
    const sampleLoopAccumulator = new AudioWaveformAccumulator(16000);
    const batchAccumulator = new AudioWaveformAccumulator(16000);

    for (const sample of samples) {
      sampleLoopAccumulator.addSample(sample);
    }

    batchAccumulator.addMonoSamples(samples);

    expect(batchAccumulator.toWaveformJson()).toEqual(
      sampleLoopAccumulator.toWaveformJson(),
    );
  });

  it('getLiveSnapshot reuses the internal pairs buffer', () => {
    const accumulator = new AudioWaveformAccumulator(
      AUDIO_WAVEFORM_FRAME_RATE_HZ,
    );
    accumulator.addMonoSamples(Float32Array.from([0.5, -0.25, 0.75]));
    const firstSnapshot = accumulator.getLiveSnapshot();
    const firstLength = firstSnapshot.pairs.length;

    accumulator.addMonoSamples(Float32Array.from([0.5, -0.25, 0.75]));
    const secondSnapshot = accumulator.getLiveSnapshot();

    expect(secondSnapshot.pairs).toBe(firstSnapshot.pairs);
    expect(secondSnapshot.pairs.length).toBeGreaterThan(firstLength);
  });

  it('fails when the source sample rate is not positive', () => {
    expect(() => new AudioWaveformAccumulator(0)).toThrow(
      'Audio waveform sample rate must be positive',
    );
  });

  it('fails when the source sample rate is lower than the waveform frame rate', () => {
    expect(() => new AudioWaveformAccumulator(29)).toThrow(
      'Audio waveform sample rate must be at least the waveform frame rate',
    );
  });
});

describe('parseAudioWaveformJson', () => {
  it('accepts the waveform JSON contract without runtime dependencies', () => {
    const waveform: AudioWaveformJson = {
      v: AUDIO_WAVEFORM_VERSION,
      sampleRateHz: AUDIO_WAVEFORM_FRAME_RATE_HZ,
      pairs: [0, 1],
    };

    expect(parseAudioWaveformJson(waveform)).toBe(waveform);
  });

  it('rejects invalid waveform JSON', () => {
    expect(
      parseAudioWaveformJson({
        v: AUDIO_WAVEFORM_VERSION,
        sampleRateHz: AUDIO_WAVEFORM_FRAME_RATE_HZ,
        pairs: [0, 'nope'],
      }),
    ).toBeNull();
  });
});

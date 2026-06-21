import { describe, expect, it } from 'vitest';

import {
  cropAudioWaveform,
  getAudioWaveformPairRange,
  type AudioWaveformJson,
} from '../src/audio-waveform';

function buildWaveform(pairValues: number[]): AudioWaveformJson {
  return {
    v: 1,
    sampleRateHz: 30,
    pairs: pairValues,
  };
}

describe('getAudioWaveformPairRange', () => {
  it('maps seconds to pair indices at 30hz', () => {
    const waveform = buildWaveform(
      Array.from({ length: 120 }, (_entry, index) => index / 100),
    );

    expect(getAudioWaveformPairRange(waveform, 1, 2)).toEqual({
      waveform,
      pairStartIndex: 60,
      pairEndIndex: 120,
    });
  });

  it('clamps indices to the pair buffer bounds', () => {
    const waveform = buildWaveform([0, 1, 0, 1]);

    expect(getAudioWaveformPairRange(waveform, -1, 999)).toEqual({
      waveform,
      pairStartIndex: 0,
      pairEndIndex: 4,
    });
  });
});

describe('cropAudioWaveform', () => {
  it('returns a sliced copy for persisted trim windows', () => {
    const waveform = buildWaveform([0, 1, 0, 1, 0, 1]);

    expect(cropAudioWaveform(waveform, 0, 1 / 30)).toEqual({
      v: 1,
      sampleRateHz: 30,
      pairs: [0, 1],
    });
  });
});

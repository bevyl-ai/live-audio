import type { AudioWaveformJson } from '../src/audio-waveform';
import { describe, expect, it } from 'vitest';

import {
  getLiveAudioWaveformDurationSeconds,
  resolveLiveAudioPreviewWaveform,
} from '../src';

describe('resolveLiveAudioPreviewWaveform', () => {
  it('uses real visual pairs before filling to the recording clock', () => {
    const resolved = resolveLiveAudioPreviewWaveform({
      committedPairs: createLiveWaveform({
        durationSeconds: 1,
        value: 0.1,
      }),
      committedRevision: 3,
      targetDurationSeconds: 2,
      visualPairs: createLiveWaveform({
        durationSeconds: 1.3,
        value: 0.8,
      }),
      visualRevision: 5,
    });

    expect(resolved.durationSeconds).toBe(2);
    expect(resolved.revision).toBe(8);
    expect(resolved.pairs?.pairs).toHaveLength(120);
    expect(resolved.pairs?.pairs[59]).toBe(0.1);
    expect(resolved.pairs?.pairs[60]).toBe(0.8);
    expect(resolved.pairs?.pairs[119]).toBe(0.8);
  });

  it('fills visual-only pairs to the recording clock', () => {
    const resolved = resolveLiveAudioPreviewWaveform({
      committedPairs: null,
      targetDurationSeconds: 2,
      visualPairs: createLiveWaveform({
        durationSeconds: 1.3,
        value: 0.8,
      }),
    });

    expect(resolved.durationSeconds).toBe(2);
    expect(resolved.pairs?.pairs).toHaveLength(120);
    expect(resolved.pairs?.pairs[119]).toBe(0.8);
  });

  it('caps extrapolation to one waveform frame beyond the latest real pair', () => {
    const resolved = resolveLiveAudioPreviewWaveform({
      committedPairs: createLiveWaveform({
        durationSeconds: 1,
        value: 0.3,
      }),
      targetDurationSeconds: 2,
      visualPairs: null,
    });

    expect(resolved.durationSeconds).toBeCloseTo(1 + 1 / 30);
    expect(resolved.pairs?.pairs).toHaveLength(62);
    expect(resolved.pairs?.pairs[59]).toBe(0.3);
    expect(resolved.pairs?.pairs[60]).toBe(0.3);
    expect(resolved.pairs?.pairs[61]).toBe(0.3);
  });

  it('trims preview pairs when capture progress is behind available waveform data', () => {
    const resolved = resolveLiveAudioPreviewWaveform({
      committedPairs: createLiveWaveform({
        durationSeconds: 2,
        value: 0.4,
      }),
      targetDurationSeconds: 1,
      visualPairs: null,
    });

    expect(resolved.durationSeconds).toBe(1);
    expect(resolved.pairs?.pairs).toHaveLength(60);
    expect(resolved.pairs?.pairs[59]).toBe(0.4);
  });

  it('keeps target duration even before any waveform pairs exist', () => {
    const resolved = resolveLiveAudioPreviewWaveform({
      committedPairs: null,
      targetDurationSeconds: 0.5,
      visualPairs: null,
    });

    expect(resolved.durationSeconds).toBe(0.5);
    expect(resolved.pairs).toBeNull();
  });
});

describe('getLiveAudioWaveformDurationSeconds', () => {
  it('reads duration from flattened min/max waveform pairs', () => {
    expect(
      getLiveAudioWaveformDurationSeconds(
        createLiveWaveform({ durationSeconds: 1.25 }),
      ),
    ).toBe(1.25);
  });
});

function createLiveWaveform({
  durationSeconds,
  value = 0,
}: {
  durationSeconds: number;
  value?: number;
}): AudioWaveformJson {
  const sampleRateHz = 30;
  const pairCount = Math.round(durationSeconds * sampleRateHz * 2);

  return {
    v: 1,
    sampleRateHz,
    pairs: Array.from({ length: pairCount }, () => value),
  };
}

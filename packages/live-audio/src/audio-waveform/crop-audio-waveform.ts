import type { AudioWaveformJson } from './audio-waveform-json';

export type AudioWaveformPairRange = {
  waveform: AudioWaveformJson;
  pairStartIndex: number;
  pairEndIndex: number;
};

export function getAudioWaveformPairRange(
  waveform: AudioWaveformJson,
  startSeconds: number,
  endSeconds: number,
): AudioWaveformPairRange {
  const pairStartIndex = Math.max(
    0,
    Math.floor(startSeconds * waveform.sampleRateHz * 2),
  );
  const pairEndIndex = Math.min(
    waveform.pairs.length,
    Math.floor(endSeconds * waveform.sampleRateHz * 2),
  );

  return {
    waveform,
    pairStartIndex,
    pairEndIndex,
  };
}

export function cropAudioWaveform(
  waveform: AudioWaveformJson,
  startSeconds: number,
  endSeconds: number,
): AudioWaveformJson {
  const { pairStartIndex, pairEndIndex } = getAudioWaveformPairRange(
    waveform,
    startSeconds,
    endSeconds,
  );

  return {
    ...waveform,
    pairs: waveform.pairs.slice(pairStartIndex, pairEndIndex),
  };
}

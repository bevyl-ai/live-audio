export const AUDIO_WAVEFORM_FRAME_RATE_HZ = 30;
export const AUDIO_WAVEFORM_VERSION = 1;

export type AudioWaveformJson = {
  pairs: number[];
  sampleRateHz: number;
  v: typeof AUDIO_WAVEFORM_VERSION;
};

export function parseAudioWaveformJson(
  inputValue: unknown,
): AudioWaveformJson | null {
  if (!isAudioWaveformJson(inputValue)) {
    return null;
  }

  return inputValue;
}

function isAudioWaveformJson(inputValue: unknown): inputValue is AudioWaveformJson {
  if (!inputValue || typeof inputValue !== 'object') {
    return false;
  }

  const candidate = inputValue as Partial<AudioWaveformJson>;

  return (
    candidate.v === AUDIO_WAVEFORM_VERSION &&
    candidate.sampleRateHz === AUDIO_WAVEFORM_FRAME_RATE_HZ &&
    Array.isArray(candidate.pairs) &&
    candidate.pairs.every((value) => typeof value === 'number')
  );
}

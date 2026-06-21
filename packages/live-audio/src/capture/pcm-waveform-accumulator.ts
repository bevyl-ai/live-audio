import {
  AudioWaveformAccumulator,
  type AudioWaveformJson,
} from '../audio-waveform';

import type { PcmFrame } from './pcm';

export function createPcmWaveformAccumulator(
  sourceSampleRateHz: number,
): AudioWaveformAccumulator {
  return new AudioWaveformAccumulator(sourceSampleRateHz);
}

export function appendPcmFrameToWaveformAccumulator(
  accumulator: AudioWaveformAccumulator,
  frame: PcmFrame,
): AudioWaveformJson {
  if (frame.samples.length === 0) {
    return accumulator.getLiveSnapshot();
  }

  accumulator.addMonoSamples(frame.samples);
  return accumulator.getLiveSnapshot();
}

export function buildAudioWaveformFromPcmFrames(
  frames: readonly PcmFrame[],
): AudioWaveformJson | null {
  const firstFrame = frames[0];

  if (!firstFrame) {
    return null;
  }

  const accumulator = createPcmWaveformAccumulator(firstFrame.sampleRateHz);
  let waveform: AudioWaveformJson | null = null;

  for (const frame of frames) {
    waveform = appendPcmFrameToWaveformAccumulator(accumulator, frame);
  }

  return waveform;
}

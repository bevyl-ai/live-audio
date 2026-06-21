import {
  AUDIO_WAVEFORM_FRAME_RATE_HZ,
  AUDIO_WAVEFORM_VERSION,
  type AudioWaveformJson,
} from './audio-waveform-json';

export class AudioWaveformAccumulator {
  readonly #sourceSampleRateHz: number;
  readonly #pairs: number[] = [];
  #frameMin = 1;
  #frameMax = -1;
  #nextWaveformFrameIndex = 0;
  #sourceSampleCount = 0;

  constructor(sourceSampleRateHz: number) {
    if (!Number.isFinite(sourceSampleRateHz) || sourceSampleRateHz <= 0) {
      throw new Error('Audio waveform sample rate must be positive');
    }

    if (sourceSampleRateHz < AUDIO_WAVEFORM_FRAME_RATE_HZ) {
      throw new Error(
        'Audio waveform sample rate must be at least the waveform frame rate',
      );
    }

    this.#sourceSampleRateHz = sourceSampleRateHz;
  }

  addSample(value: number) {
    this.#ingestSample(value);
    this.#appendCompleteFrames();
  }

  addMonoSamples(samples: Float32Array) {
    samples.forEach((value) => {
      this.#ingestSample(value);
      this.#appendCompleteFrames();
    });
  }

  getLiveSnapshot(): AudioWaveformJson {
    this.#appendCompleteFrames();

    return {
      v: AUDIO_WAVEFORM_VERSION,
      sampleRateHz: AUDIO_WAVEFORM_FRAME_RATE_HZ,
      pairs: this.#pairs,
    };
  }

  toWaveformJson(): AudioWaveformJson {
    this.#appendCompleteFrames();

    return {
      v: AUDIO_WAVEFORM_VERSION,
      sampleRateHz: AUDIO_WAVEFORM_FRAME_RATE_HZ,
      pairs: [...this.#pairs],
    };
  }

  #ingestSample(value: number) {
    if (value < this.#frameMin) {
      this.#frameMin = value;
    }

    if (value > this.#frameMax) {
      this.#frameMax = value;
    }

    this.#sourceSampleCount++;
  }

  #appendCompleteFrames() {
    while (
      this.#sourceSampleCount >= this.#getFrameEnd(this.#nextWaveformFrameIndex)
    ) {
      this.#appendFrame();
      this.#nextWaveformFrameIndex++;
    }
  }

  #appendFrame() {
    this.#pairs.push(+this.#frameMin.toFixed(4), +this.#frameMax.toFixed(4));
    this.#frameMin = 1;
    this.#frameMax = -1;
  }

  #getFrameEnd(frameIndex: number) {
    return Math.floor(
      ((frameIndex + 1) * this.#sourceSampleRateHz) /
        AUDIO_WAVEFORM_FRAME_RATE_HZ,
    );
  }
}

const WAV_BITS_PER_SAMPLE = 16;
const WAV_BYTES_PER_SAMPLE = 2;

export function encodeInterleavedSamplesAsWav({
  channelCount,
  sampleRateHz,
  samples,
}: {
  channelCount: number;
  sampleRateHz: number;
  samples: Float32Array;
}) {
  const byteLength = 44 + samples.length * WAV_BYTES_PER_SAMPLE;
  const wavBuffer = new ArrayBuffer(byteLength);
  const view = new DataView(wavBuffer);
  // eslint-disable-next-line no-restricted-syntax -- WAV data offset advances as samples are written.
  let offset = writeWavHeader({
    byteLength,
    channelCount,
    frameCount: Math.floor(samples.length / channelCount),
    offset: 0,
    sampleRateHz,
    view,
  });

  samples.forEach((sample) => {
    const clampedSample = Math.max(-1, Math.min(1, sample));

    view.setInt16(
      offset,
      clampedSample < 0 ? clampedSample * 0x8000 : clampedSample * 0x7fff,
      true,
    );
    offset += 2;
  });

  return wavBuffer;
}

export function encodeAudioBufferAsWav(audioBuffer: AudioBuffer) {
  const byteLength =
    44 +
    audioBuffer.length * audioBuffer.numberOfChannels * WAV_BYTES_PER_SAMPLE;
  const wavBuffer = new ArrayBuffer(byteLength);
  const view = new DataView(wavBuffer);
  // eslint-disable-next-line no-restricted-syntax -- WAV data offset advances as interleaved samples are written.
  let offset = writeWavHeader({
    byteLength,
    channelCount: audioBuffer.numberOfChannels,
    frameCount: audioBuffer.length,
    offset: 0,
    sampleRateHz: audioBuffer.sampleRate,
    view,
  });

  for (
    // eslint-disable-next-line no-restricted-syntax -- frame index advances through WAV sample frames.
    let frameIndex = 0;
    frameIndex < audioBuffer.length;
    frameIndex++
  ) {
    for (
      // eslint-disable-next-line no-restricted-syntax -- channel index interleaves channels for WAV output.
      let channelIndex = 0;
      channelIndex < audioBuffer.numberOfChannels;
      channelIndex++
    ) {
      const sample = audioBuffer.getChannelData(channelIndex)[frameIndex] ?? 0;
      const clampedSample = Math.max(-1, Math.min(1, sample));

      view.setInt16(
        offset,
        clampedSample < 0 ? clampedSample * 0x8000 : clampedSample * 0x7fff,
        true,
      );
      offset += 2;
    }
  }

  return wavBuffer;
}

function writeWavHeader({
  byteLength,
  channelCount,
  offset,
  sampleRateHz,
  view,
}: {
  byteLength: number;
  channelCount: number;
  frameCount: number;
  offset: number;
  sampleRateHz: number;
  view: DataView;
}) {
  // eslint-disable-next-line no-restricted-syntax -- WAV header offset advances through fixed binary fields.
  let nextOffset = offset;

  nextOffset = writeAscii(view, nextOffset, 'RIFF');
  view.setUint32(nextOffset, byteLength - 8, true);
  nextOffset += 4;
  nextOffset = writeAscii(view, nextOffset, 'WAVE');
  nextOffset = writeAscii(view, nextOffset, 'fmt ');
  view.setUint32(nextOffset, 16, true);
  nextOffset += 4;
  view.setUint16(nextOffset, 1, true);
  nextOffset += 2;
  view.setUint16(nextOffset, channelCount, true);
  nextOffset += 2;
  view.setUint32(nextOffset, sampleRateHz, true);
  nextOffset += 4;
  view.setUint32(
    nextOffset,
    sampleRateHz * channelCount * WAV_BYTES_PER_SAMPLE,
    true,
  );
  nextOffset += 4;
  view.setUint16(nextOffset, channelCount * WAV_BYTES_PER_SAMPLE, true);
  nextOffset += 2;
  view.setUint16(nextOffset, WAV_BITS_PER_SAMPLE, true);
  nextOffset += 2;
  nextOffset = writeAscii(view, nextOffset, 'data');
  view.setUint32(nextOffset, byteLength - 44, true);
  nextOffset += 4;

  return nextOffset;
}

function writeAscii(view: DataView, offset: number, inputValue: string) {
  for (
    // eslint-disable-next-line no-restricted-syntax -- character index writes fixed WAV header tags.
    let index = 0;
    index < inputValue.length;
    index++
  ) {
    view.setUint8(offset + index, inputValue.charCodeAt(index));
  }

  return offset + inputValue.length;
}

import { readBatchClipTimeRangeMs } from './audio-clips';
import type { LiveAudioPcmStreamChunk } from '../plugins/contracts';
import type { LiveAudioTranscriptionBatch } from '../transcription/transcription-batches';
import { encodeInterleavedSamplesAsWav } from './wav-encoder';

const PCM_CHANNEL_COUNT = 1;
const PCM_BYTES_PER_SAMPLE = 2;

export function createAudioClipFileFromPcmChunks({
  batch,
  chunks,
  fileName,
}: {
  batch: LiveAudioTranscriptionBatch;
  chunks: readonly LiveAudioPcmStreamChunk[];
  fileName: string;
}) {
  const clipTimeRange = readBatchClipTimeRangeMs(batch);

  if (!clipTimeRange || chunks.length === 0) {
    return null;
  }

  const firstChunk = chunks.find((chunk) =>
    overlapsTimeRange({
      endMs: clipTimeRange.endMs,
      itemEndMs: chunk.endMs,
      itemStartMs: chunk.startMs,
      startMs: clipTimeRange.startMs,
    }),
  );

  if (!firstChunk) {
    return null;
  }

  const samples = copyPcmChunkRange({
    chunks,
    endMs: clipTimeRange.endMs,
    sampleRateHz: firstChunk.sampleRateHz,
    startMs: clipTimeRange.startMs,
  });

  if (samples.length === 0) {
    return null;
  }

  const wavBytes = encodeInterleavedSamplesAsWav({
    channelCount: PCM_CHANNEL_COUNT,
    samples,
    sampleRateHz: firstChunk.sampleRateHz,
  });

  return new File([wavBytes], fileName, { type: 'audio/wav' });
}

function copyPcmChunkRange({
  chunks,
  endMs,
  sampleRateHz,
  startMs,
}: {
  chunks: readonly LiveAudioPcmStreamChunk[];
  endMs: number;
  sampleRateHz: number;
  startMs: number;
}) {
  const samples: number[] = [];

  chunks.forEach((chunk) => {
    if (
      chunk.sampleRateHz !== sampleRateHz ||
      !overlapsTimeRange({
        endMs,
        itemEndMs: chunk.endMs,
        itemStartMs: chunk.startMs,
        startMs,
      })
    ) {
      return;
    }

    const firstSampleIndex = Math.max(
      0,
      Math.floor(((startMs - chunk.startMs) / 1000) * sampleRateHz),
    );
    const lastSampleIndex = Math.min(
      Math.floor(chunk.data.byteLength / PCM_BYTES_PER_SAMPLE),
      Math.ceil(((endMs - chunk.startMs) / 1000) * sampleRateHz),
    );

    for (
      // eslint-disable-next-line no-restricted-syntax -- sample index copies the requested raw PCM byte range.
      let sampleIndex = firstSampleIndex;
      sampleIndex < lastSampleIndex;
      sampleIndex++
    ) {
      samples.push(readPcm16Sample(chunk.data, sampleIndex));
    }
  });

  return new Float32Array(samples);
}

function overlapsTimeRange({
  endMs,
  itemEndMs,
  itemStartMs,
  startMs,
}: {
  endMs: number;
  itemEndMs: number;
  itemStartMs: number;
  startMs: number;
}) {
  return itemEndMs > startMs && itemStartMs < endMs;
}

function readPcm16Sample(payload: Uint8Array, sampleIndex: number) {
  const byteIndex = sampleIndex * PCM_BYTES_PER_SAMPLE;
  const lowByte = payload[byteIndex];
  const highByte = payload[byteIndex + 1];

  if (lowByte === undefined || highByte === undefined) {
    return 0;
  }

  const unsignedValue = lowByte | (highByte << 8);
  const signedValue =
    unsignedValue >= 0x8000 ? unsignedValue - 0x10000 : unsignedValue;

  return signedValue < 0 ? signedValue / 0x8000 : signedValue / 0x7fff;
}

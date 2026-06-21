import type { LiveAudioTranscriptionBatch } from '../transcription/transcription-batches';

type ClipTimeRangeMs = {
  startMs: number;
  endMs: number;
};

export const MIN_LIVE_AUDIO_WORD_DURATION_MS = 80;

/**
 * Returns the provider-aligned clip range for a transcription batch. Prefer a
 * provider speech-start timestamp when present; first-word timestamps are only a
 * fallback for providers that do not expose speech detection events.
 */
export function readBatchClipTimeRangeMs(
  batch: LiveAudioTranscriptionBatch,
): ClipTimeRangeMs | null {
  const firstWord = batch.words[0];
  const lastWord = batch.words.at(-1);

  if (!firstWord || !lastWord || lastWord.endMs < firstWord.startMs) {
    return null;
  }

  const startMs = batch.audioStartMs ?? firstWord.startMs;
  const endMs =
    lastWord.endMs === firstWord.startMs
      ? firstWord.startMs + MIN_LIVE_AUDIO_WORD_DURATION_MS
      : lastWord.endMs;

  return {
    startMs,
    endMs: endMs <= startMs ? startMs + MIN_LIVE_AUDIO_WORD_DURATION_MS : endMs,
  };
}

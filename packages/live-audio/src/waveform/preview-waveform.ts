import type { AudioWaveformJson } from '../audio-waveform';

const MAX_COMMITTED_WAVEFORM_EXTRAPOLATED_FRAME_COUNT = 1;

export type LiveAudioPreviewWaveformInput = {
  committedPairs: AudioWaveformJson | null;
  committedRevision?: number;
  targetDurationSeconds: number;
  visualPairs: AudioWaveformJson | null;
  visualRevision?: number;
};

export type LiveAudioPreviewWaveform = {
  durationSeconds: number;
  pairs: AudioWaveformJson | null;
  revision: number;
};

export function resolveLiveAudioPreviewWaveform({
  committedPairs,
  committedRevision = 0,
  targetDurationSeconds,
  visualPairs,
  visualRevision = 0,
}: LiveAudioPreviewWaveformInput): LiveAudioPreviewWaveform {
  const pairs = mergeLiveAudioPreviewWaveformPairs({
    committedPairs,
    targetDurationSeconds,
    visualPairs,
  });

  return {
    durationSeconds:
      pairs === null
        ? Math.max(0, targetDurationSeconds)
        : getLiveAudioWaveformDurationSeconds(pairs),
    pairs,
    revision: committedRevision + visualRevision,
  };
}

export function getLiveAudioWaveformDurationSeconds(
  pairs: AudioWaveformJson | null,
) {
  if (!pairs || pairs.sampleRateHz <= 0) {
    return 0;
  }

  return pairs.pairs.length / 2 / pairs.sampleRateHz;
}

function mergeLiveAudioPreviewWaveformPairs({
  committedPairs,
  targetDurationSeconds,
  visualPairs,
}: LiveAudioPreviewWaveformInput) {
  if (!committedPairs) {
    return resizeLiveAudioWaveformPairs({
      maxExtrapolatedFrameCount:
        visualPairs === null
          ? MAX_COMMITTED_WAVEFORM_EXTRAPOLATED_FRAME_COUNT
          : null,
      pairs: visualPairs,
      targetDurationSeconds,
    });
  }

  if (
    !visualPairs ||
    visualPairs.sampleRateHz !== committedPairs.sampleRateHz ||
    visualPairs.pairs.length <= committedPairs.pairs.length
  ) {
    return resizeLiveAudioWaveformPairs({
      maxExtrapolatedFrameCount:
        visualPairs === null
          ? MAX_COMMITTED_WAVEFORM_EXTRAPOLATED_FRAME_COUNT
          : null,
      pairs: committedPairs,
      targetDurationSeconds,
    });
  }

  const mergedPairs = {
    ...committedPairs,
    pairs: committedPairs.pairs.concat(
      visualPairs.pairs.slice(committedPairs.pairs.length),
    ),
  };

  return resizeLiveAudioWaveformPairs({
    maxExtrapolatedFrameCount: null,
    pairs: mergedPairs,
    targetDurationSeconds,
  });
}

function resizeLiveAudioWaveformPairs({
  maxExtrapolatedFrameCount,
  pairs,
  targetDurationSeconds,
}: {
  maxExtrapolatedFrameCount: number | null;
  pairs: AudioWaveformJson | null;
  targetDurationSeconds: number;
}) {
  if (!pairs) {
    return null;
  }

  const targetPairCount = getLiveAudioWaveformTargetPairCount({
    sampleRateHz: pairs.sampleRateHz,
    targetDurationSeconds,
  });
  const pairFrameValueCount = 2;
  const maxExtrapolatedPairCount =
    maxExtrapolatedFrameCount === null
      ? targetPairCount
      : pairs.pairs.length + maxExtrapolatedFrameCount * pairFrameValueCount;
  const cappedTargetPairCount = Math.min(
    targetPairCount,
    maxExtrapolatedPairCount,
  );

  if (cappedTargetPairCount === pairs.pairs.length) {
    return pairs;
  }

  if (cappedTargetPairCount < pairs.pairs.length) {
    return {
      ...pairs,
      pairs: pairs.pairs.slice(0, cappedTargetPairCount),
    };
  }

  const tailPair = readLatestLiveAudioWaveformPair(pairs.pairs);

  if (!tailPair) {
    return pairs;
  }

  const missingPairValueCount = cappedTargetPairCount - pairs.pairs.length;
  const extrapolatedPairs = Array.from(
    { length: missingPairValueCount },
    (_, index) => tailPair[index % tailPair.length] ?? 0,
  );

  return {
    ...pairs,
    pairs: pairs.pairs.concat(extrapolatedPairs),
  };
}

function getLiveAudioWaveformTargetPairCount({
  sampleRateHz,
  targetDurationSeconds,
}: {
  sampleRateHz: number;
  targetDurationSeconds: number;
}) {
  if (sampleRateHz <= 0) {
    return 0;
  }

  return Math.max(0, Math.floor(targetDurationSeconds * sampleRateHz * 2));
}

function readLatestLiveAudioWaveformPair(pairs: number[]) {
  if (pairs.length === 0) {
    return null;
  }

  if (pairs.length === 1) {
    const onlyValue = pairs[0];

    if (typeof onlyValue !== 'number') {
      return null;
    }

    return [onlyValue, onlyValue];
  }

  const lastPairStartIndex =
    pairs.length % 2 === 0 ? pairs.length - 2 : Math.max(0, pairs.length - 3);
  const minValue = pairs[lastPairStartIndex];
  const maxValue = pairs[lastPairStartIndex + 1];

  if (typeof minValue !== 'number' || typeof maxValue !== 'number') {
    return null;
  }

  return [minValue, maxValue];
}

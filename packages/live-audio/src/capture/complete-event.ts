import type { PcmCaptureStats, PcmFrame } from './pcm';

export type LiveAudioCaptureCompleteEvent = {
  completedAtMs: number;
  audio: {
    blob: Blob;
    chunks: readonly Blob[];
    mimeType: string | null;
    sizeBytes: number;
  };
  pcm: {
    stats: PcmCaptureStats;
    frames: readonly PcmFrame[];
  };
};

export function createLiveAudioCaptureCompleteFile({
  event,
  fileName,
}: {
  event: LiveAudioCaptureCompleteEvent;
  fileName: string;
}) {
  return new File(
    [event.audio.blob],
    fileName,
    event.audio.mimeType ? { type: event.audio.mimeType } : undefined,
  );
}

export function getLiveAudioCaptureCompleteDurationSeconds(
  event: LiveAudioCaptureCompleteEvent,
) {
  const lastFrame = event.pcm.frames.at(-1);

  if (lastFrame) {
    return lastFrame.timestampSeconds + lastFrame.durationSeconds;
  }

  return event.pcm.stats.lastTimestampSeconds ?? 0;
}

export function buildLiveAudioCaptureCompleteEvent({
  audioChunks,
  completedAtMs,
  frames,
  mimeType,
  stats,
}: {
  audioChunks: readonly Blob[];
  completedAtMs: number;
  frames: readonly PcmFrame[];
  mimeType: string | null;
  stats: PcmCaptureStats;
}): LiveAudioCaptureCompleteEvent {
  const blob = new Blob(
    Array.from(audioChunks),
    mimeType ? { type: mimeType } : {},
  );

  return {
    completedAtMs,
    audio: {
      blob,
      chunks: audioChunks,
      mimeType,
      sizeBytes: blob.size,
    },
    pcm: {
      stats,
      frames,
    },
  };
}

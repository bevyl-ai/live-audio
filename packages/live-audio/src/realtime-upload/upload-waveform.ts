import {
  type AudioWaveformJson,
  cropAudioWaveform,
} from '../audio-waveform';

import type { LiveAudioCaptureCompleteEvent } from '../capture/complete-event';
import { buildAudioWaveformFromPcmFrames } from '../capture/pcm-waveform-accumulator';
import { readBatchClipTimeRangeMs } from '../clips/audio-clips';
import type { LiveAudioPluginBatchWaveformInput } from '../plugins/contracts';
import type { LiveAudioTranscriptionBatch } from '../transcription/transcription-batches';
import {
  buildRealtimeUploadCaptureWaveformFileName,
  buildRealtimeUploadObjectName,
  buildRealtimeUploadWaveformFileName,
} from './state';

export function buildBatchWaveformInput({
  batch,
  liveWaveform,
  objectPath,
  sessionId,
}: {
  batch: LiveAudioTranscriptionBatch;
  liveWaveform?: AudioWaveformJson | null;
  objectPath: string;
  sessionId: string;
}): LiveAudioPluginBatchWaveformInput | null {
  if (!liveWaveform) {
    return null;
  }

  const clipTimeRange = readBatchClipTimeRangeMs(batch);
  if (!clipTimeRange) {
    return null;
  }

  const fileName = buildRealtimeUploadWaveformFileName({ batch });
  const objectName = buildRealtimeUploadObjectName({
    fileName,
    objectPath,
    sessionId,
  });
  const croppedWaveform = cropAudioWaveform(
    liveWaveform,
    clipTimeRange.startMs / 1000,
    clipTimeRange.endMs / 1000,
  );

  return {
    objectName,
    waveform: croppedWaveform,
  };
}

export function buildCaptureWaveformInput({
  event,
  liveWaveform,
  objectPath,
  sessionId,
}: {
  event: LiveAudioCaptureCompleteEvent;
  liveWaveform?: AudioWaveformJson | null;
  objectPath: string;
  sessionId: string;
}): LiveAudioPluginBatchWaveformInput | null {
  const waveform =
    buildAudioWaveformFromPcmFrames(event.pcm.frames) ?? liveWaveform;

  if (!waveform) {
    return null;
  }

  const fileName = buildRealtimeUploadCaptureWaveformFileName();
  const objectName = buildRealtimeUploadObjectName({
    fileName,
    objectPath,
    sessionId,
  });

  return {
    objectName,
    waveform,
  };
}

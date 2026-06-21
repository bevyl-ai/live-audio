import type { LiveAudioTranscriptionBatch } from '../transcription/transcription-batches';

export type LiveAudioRealtimeUploadCapture = {
  completedBatches: readonly LiveAudioTranscriptionBatch[];
  durationSeconds: number;
  sessionId: string;
  url: string;
  waveformUrl?: string;
};

export type LiveAudioRealtimeUploadClip = {
  batch: LiveAudioTranscriptionBatch;
  durationSeconds: number;
  url: string;
  waveformUrl?: string;
};

export type RealtimeUploadChunkStatus =
  | 'queued'
  | 'uploading'
  | 'uploaded'
  | 'failed';

export type RealtimeUploadStatus =
  | 'idle'
  | 'recording'
  | 'flushing'
  | 'complete'
  | 'error';

export type RealtimeUploadChunk = {
  batchKey: string;
  fileName: string;
  objectName: string;
  progress: number;
  segmentCount: number;
  sizeBytes: number;
  status: RealtimeUploadChunkStatus;
  transcript: string;
  uploadedSegmentCount: number;
  url: string | null;
};

export type RealtimeUploadStats = {
  chunkCount: number;
  stoppedAtMs: number | null;
  totalSizeBytes: number;
};

export function buildRealtimeUploadChunkFileName({
  batch,
  file,
}: {
  batch: LiveAudioTranscriptionBatch;
  file: File;
}) {
  const extension = readAudioFileExtension(file.type);
  const batchLabel = batch.key.padStart(4, '0');

  return toSafeFilename(`live-audio-batch-${batchLabel}.${extension}`);
}

export function buildRealtimeUploadWindowFileName({
  batch,
}: {
  batch: LiveAudioTranscriptionBatch;
}) {
  const batchLabel = batch.key.padStart(4, '0');

  return toSafeFilename(`live-audio-batch-${batchLabel}.wav`);
}

export function buildRealtimeUploadCaptureFileName({
  mimeType,
}: {
  mimeType: string | null;
}) {
  const extension = readAudioFileExtension(mimeType ?? '');

  return toSafeFilename(`live-audio-capture.${extension}`);
}

export function buildRealtimeUploadSegmentObjectName({
  batchKey,
  objectPath,
  segmentIndex,
  sessionId,
}: {
  batchKey: string;
  objectPath: string;
  segmentIndex: number;
  sessionId: string;
}) {
  const batchLabel = batchKey.padStart(4, '0');
  const segmentLabel = String(segmentIndex).padStart(6, '0');

  return `${objectPath}/${sessionId}/windows/${toSafeFilename(
    batchLabel,
  )}/segments/${toSafeFilename(`pcm-${segmentLabel}.pcm`)}`;
}

export function buildRealtimeUploadObjectName({
  fileName,
  objectPath,
  sessionId,
}: {
  fileName: string;
  objectPath: string;
  sessionId: string;
}) {
  return `${objectPath}/${sessionId}/${fileName}`;
}

export function buildRealtimeUploadWaveformFileName({
  batch,
}: {
  batch: LiveAudioTranscriptionBatch;
}) {
  const batchLabel = batch.key.padStart(4, '0');

  return toSafeFilename(`live-audio-batch-${batchLabel}-waveform-30hz.json`);
}

export function buildRealtimeUploadCaptureWaveformFileName() {
  return toSafeFilename('live-audio-capture-waveform-30hz.json');
}

function readAudioFileExtension(mimeType: string) {
  if (!mimeType) {
    return 'wav';
  }

  if (mimeType.includes('ogg')) {
    return 'ogg';
  }

  if (mimeType.includes('webm')) {
    return 'webm';
  }

  if (mimeType.includes('mp4')) {
    return 'm4a';
  }

  if (mimeType.includes('wav')) {
    return 'wav';
  }

  return 'wav';
}

function toSafeFilename(filename: string) {
  return filename
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

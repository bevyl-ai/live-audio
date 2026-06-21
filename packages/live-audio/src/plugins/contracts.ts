import type { AudioWaveformJson } from '../audio-waveform';
import { z } from 'zod';

import type { LiveAudioCaptureCompleteEvent } from '../capture/complete-event';
import type {
  LiveAudioTranscriptionBatch,
  LiveAudioTranscriptionMessage,
} from '../transcription/transcription-batches';
import {
  LiveAudioTranscriptionBatchSchema,
  LiveAudioTranscriptionMessageSchema,
} from '../transcription/transcription-batches';

export type LiveAudioPcmStreamChunk = {
  data: Uint8Array;
  durationMs: number;
  endMs: number;
  index: number;
  sampleRateHz: number;
  startMs: number;
};

export type LiveAudioPcmSamples = {
  sampleRateHz: number;
  samples: Float32Array;
};

export type LiveAudioUploadedArtifact = {
  objectName: string;
  url: string;
};

export const LiveAudioTranscriptionStatusSchema = z.enum([
  'idle',
  'connecting',
  'streaming',
  'stopping',
  'stopped',
  'error',
]);

export type LiveAudioTranscriptionStatus = z.infer<
  typeof LiveAudioTranscriptionStatusSchema
>;

export const LiveAudioTranscriptionSnapshotSchema = z.object({
  activeBatch: LiveAudioTranscriptionBatchSchema.nullable(),
  completedBatches: z.array(LiveAudioTranscriptionBatchSchema).readonly(),
  lastMessage: LiveAudioTranscriptionMessageSchema.nullable(),
  messages: z.array(LiveAudioTranscriptionMessageSchema).readonly(),
  status: LiveAudioTranscriptionStatusSchema,
});

export type LiveAudioTranscriptionSnapshotInput = z.infer<
  typeof LiveAudioTranscriptionSnapshotSchema
>;

export type LiveAudioPluginTranscriptionMessage = {
  audioStartMs?: number;
  message: LiveAudioTranscriptionMessage;
};

export type LiveAudioPluginStartContext =
  | {
      emitClose: () => void;
      emitError: (errorMessage: string) => void;
      emitMessage: (event: LiveAudioPluginTranscriptionMessage) => void;
      emitPcmChunk: (chunk: LiveAudioPcmStreamChunk) => void;
      emitPcmSamples: (input: LiveAudioPcmSamples) => void;
      kind: 'transcription';
      stream: MediaStream;
    }
  | {
      kind: 'upload';
      objectPath: string;
      sessionId: string;
    };

export type LiveAudioPluginPcmChunkInput = {
  batchKey: string;
  chunk: LiveAudioPcmStreamChunk;
  objectName: string;
  sessionId: string;
};

export type LiveAudioPluginBatchProgressInput = {
  batch: LiveAudioTranscriptionBatch;
  objectName: string;
  sessionId: string;
};

export type LiveAudioPluginBatchWaveformInput = {
  objectName: string;
  waveform: AudioWaveformJson;
};

export type LiveAudioPluginBatchCompleteInput = {
  batch: LiveAudioTranscriptionBatch;
  file: File;
  fileName: string;
  objectName: string;
  sessionId: string;
  waveform?: LiveAudioPluginBatchWaveformInput;
};

export type LiveAudioPluginBatchCompleteResult = {
  audio?: LiveAudioUploadedArtifact;
  waveform?: LiveAudioUploadedArtifact;
};

export type LiveAudioPluginCaptureCompleteInput = {
  completedBatches: readonly LiveAudioTranscriptionBatch[];
  event: LiveAudioCaptureCompleteEvent;
  file: File;
  fileName: string;
  objectName: string;
  sessionId: string;
  waveform?: LiveAudioPluginBatchWaveformInput;
};

export type LiveAudioPluginCaptureCompleteResult =
  LiveAudioPluginBatchCompleteResult;

export type LiveAudioPluginSnapshotSchema =
  z.ZodType<LiveAudioTranscriptionSnapshotInput>;

export type LiveAudioPluginSnapshotCapability<
  SnapshotSchema extends LiveAudioPluginSnapshotSchema =
    LiveAudioPluginSnapshotSchema,
> = {
  schema: SnapshotSchema;
  read: (input: LiveAudioTranscriptionSnapshotInput) => z.infer<SnapshotSchema>;
};

export type LiveAudioPluginSession = {
  onBatchComplete?: (
    input: LiveAudioPluginBatchCompleteInput,
  ) =>
    | LiveAudioPluginBatchCompleteResult
    | undefined
    | Promise<LiveAudioPluginBatchCompleteResult | undefined>;
  onCaptureComplete?: (
    input: LiveAudioPluginCaptureCompleteInput,
  ) =>
    | LiveAudioPluginCaptureCompleteResult
    | undefined
    | Promise<LiveAudioPluginCaptureCompleteResult | undefined>;
  onBatchProgress?: (
    input: LiveAudioPluginBatchProgressInput,
  ) => void | Promise<void>;
  onPcmChunk?: (input: LiveAudioPluginPcmChunkInput) => void | Promise<void>;
  snapshot?: LiveAudioPluginSnapshotCapability;
  stop?: () => void | Promise<void>;
};

export type LiveAudioTranscriptionPlugin = {
  id: string;
  kind: 'transcription';
  start: (
    context: Extract<LiveAudioPluginStartContext, { kind: 'transcription' }>,
  ) => LiveAudioPluginSession | Promise<LiveAudioPluginSession>;
};

export type LiveAudioUploadPlugin = {
  id: string;
  kind: 'upload';
  start: (
    context: Extract<LiveAudioPluginStartContext, { kind: 'upload' }>,
  ) => LiveAudioPluginSession | Promise<LiveAudioPluginSession>;
};

export type LiveAudioPlugin =
  | LiveAudioTranscriptionPlugin
  | LiveAudioUploadPlugin;

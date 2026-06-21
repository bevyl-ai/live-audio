import { z } from 'zod';

export const LiveAudioTranscriptionWordSchema = z.object({
  endMs: z.number(),
  startMs: z.number(),
  text: z.string(),
});

export const LiveAudioTranscriptionMessageSchema = z.object({
  audioStartMs: z.number().optional(),
  isComplete: z.boolean(),
  sourceBatchKey: z.string().optional(),
  transcript: z.string(),
  words: z.array(LiveAudioTranscriptionWordSchema).readonly(),
});

export type LiveAudioTranscriptionWord = z.infer<
  typeof LiveAudioTranscriptionWordSchema
>;

export type LiveAudioTranscriptionMessage = z.infer<
  typeof LiveAudioTranscriptionMessageSchema
>;

export const LiveAudioTranscriptionBatchSchema = z.object({
  audioStartMs: z.number().optional(),
  key: z.string(),
  message: LiveAudioTranscriptionMessageSchema,
  transcript: z.string(),
  words: z.array(LiveAudioTranscriptionWordSchema).readonly(),
});

export type LiveAudioTranscriptionBatch = z.infer<
  typeof LiveAudioTranscriptionBatchSchema
>;

export type LiveAudioTranscriptionBatchState = {
  activeBatch: LiveAudioTranscriptionBatch | null;
  completedBatches: readonly LiveAudioTranscriptionBatch[];
  messages: readonly LiveAudioTranscriptionMessage[];
};

export function createInitialLiveAudioTranscriptionBatchState(): LiveAudioTranscriptionBatchState {
  return {
    activeBatch: null,
    completedBatches: [],
    messages: [],
  };
}

export function recordLiveAudioTranscriptionMessage({
  audioStartMs,
  message,
  state,
}: {
  audioStartMs?: number;
  message: LiveAudioTranscriptionMessage;
  state: LiveAudioTranscriptionBatchState;
}) {
  const nextMessages = state.messages.concat(message);
  const batchAudioStartMs = message.audioStartMs ?? audioStartMs;
  const batchKey =
    message.sourceBatchKey ??
    state.activeBatch?.key ??
    `message-${state.messages.length}`;
  const previousBatch = readExistingBatch({
    batchKey,
    state,
  });
  const batchWords =
    message.words.length > 0 ? message.words : previousBatch?.words;
  const batchMessage =
    batchWords === undefined || batchWords === message.words
      ? message
      : {
          ...message,
          words: batchWords,
        };
  const batch = {
    ...(batchAudioStartMs === undefined
      ? {}
      : { audioStartMs: batchAudioStartMs }),
    key: batchKey,
    message: batchMessage,
    transcript: message.transcript,
    words: batchMessage.words,
  };

  if (!message.isComplete) {
    return {
      completedBatch: null,
      state: {
        activeBatch: batch,
        completedBatches: state.completedBatches,
        messages: nextMessages,
      },
    };
  }

  return {
    completedBatch: batch,
    state: {
      activeBatch: null,
      completedBatches: upsertBatch(state.completedBatches, batch),
      messages: nextMessages,
    },
  };
}

export function completeLiveAudioTranscriptionActiveBatch({
  state,
}: {
  state: LiveAudioTranscriptionBatchState;
}) {
  const activeBatch = state.activeBatch;

  if (!activeBatch) {
    return {
      completedBatch: null,
      state,
    };
  }

  return {
    completedBatch: activeBatch,
    state: {
      activeBatch: null,
      completedBatches: upsertBatch(state.completedBatches, activeBatch),
      messages: state.messages,
    },
  };
}

function readExistingBatch({
  batchKey,
  state,
}: {
  batchKey: string;
  state: LiveAudioTranscriptionBatchState;
}) {
  if (state.activeBatch?.key === batchKey) {
    return state.activeBatch;
  }

  return state.completedBatches.find((batch) => batch.key === batchKey);
}

function upsertBatch(
  batches: readonly LiveAudioTranscriptionBatch[],
  nextBatch: LiveAudioTranscriptionBatch,
) {
  const existingBatchIndex = batches.findIndex(
    (batch) => batch.key === nextBatch.key,
  );

  if (existingBatchIndex === -1) {
    return batches.concat(nextBatch);
  }

  return batches.map((batch, index) =>
    index === existingBatchIndex ? nextBatch : batch,
  );
}

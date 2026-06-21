import { describe, expect, it } from 'vitest';

import {
  completeLiveAudioTranscriptionActiveBatch,
  createInitialLiveAudioTranscriptionBatchState,
  recordLiveAudioTranscriptionMessage,
} from '../src/transcription/transcription-batches';

describe('recordLiveAudioTranscriptionMessage', () => {
  it('uses the provider batch key when available', () => {
    const initialState = createInitialLiveAudioTranscriptionBatchState();

    const update = recordLiveAudioTranscriptionMessage({
      message: {
        isComplete: true,
        sourceBatchKey: 'provider-turn-3',
        transcript: 'first turn',
        words: [],
      },
      state: initialState,
    });

    expect(update.completedBatch?.key).toBe('provider-turn-3');
    expect(update.state.completedBatches.map((batch) => batch.key)).toEqual([
      'provider-turn-3',
    ]);
  });

  it('assigns distinct fallback keys when final messages omit provider batch keys', () => {
    const initialState = createInitialLiveAudioTranscriptionBatchState();
    const firstUpdate = recordLiveAudioTranscriptionMessage({
      message: {
        isComplete: true,
        transcript: 'first turn',
        words: [],
      },
      state: initialState,
    });
    const secondUpdate = recordLiveAudioTranscriptionMessage({
      message: {
        isComplete: true,
        transcript: 'second turn',
        words: [],
      },
      state: firstUpdate.state,
    });

    expect(
      secondUpdate.state.completedBatches.map((batch) => batch.key),
    ).toEqual(['message-0', 'message-1']);
    expect(
      secondUpdate.state.completedBatches.map((batch) => batch.transcript),
    ).toEqual(['first turn', 'second turn']);
  });

  it('reuses the active fallback key until a missing-provider-key batch completes', () => {
    const initialState = createInitialLiveAudioTranscriptionBatchState();
    const partialUpdate = recordLiveAudioTranscriptionMessage({
      message: {
        isComplete: false,
        transcript: 'partial',
        words: [],
      },
      state: initialState,
    });
    const completeUpdate = recordLiveAudioTranscriptionMessage({
      message: {
        isComplete: true,
        transcript: 'final',
        words: [],
      },
      state: partialUpdate.state,
    });

    expect(partialUpdate.state.activeBatch?.key).toBe('message-0');
    expect(completeUpdate.completedBatch?.key).toBe('message-0');
    expect(completeUpdate.state.activeBatch).toBeNull();
    expect(
      completeUpdate.state.completedBatches.map((batch) => batch.key),
    ).toEqual(['message-0']);
    expect(completeUpdate.state.completedBatches[0]?.transcript).toBe('final');
  });

  it('clears a fallback-key active batch when the final message has provider batch key', () => {
    const initialState = createInitialLiveAudioTranscriptionBatchState();
    const partialUpdate = recordLiveAudioTranscriptionMessage({
      message: {
        isComplete: false,
        transcript: 'provider final pending',
        words: [],
      },
      state: initialState,
    });
    const completeUpdate = recordLiveAudioTranscriptionMessage({
      message: {
        isComplete: true,
        sourceBatchKey: 'provider-turn-7',
        transcript: 'provider final',
        words: [],
      },
      state: partialUpdate.state,
    });

    expect(partialUpdate.state.activeBatch?.key).toBe('message-0');
    expect(completeUpdate.completedBatch?.key).toBe('provider-turn-7');
    expect(completeUpdate.state.activeBatch).toBeNull();
    expect(
      completeUpdate.state.completedBatches.map((batch) => batch.key),
    ).toEqual(['provider-turn-7']);
    expect(completeUpdate.state.completedBatches[0]?.transcript).toBe(
      'provider final',
    );
  });

  it('records normalized timestamped words on the active and completed batch', () => {
    const initialState = createInitialLiveAudioTranscriptionBatchState();
    const partialUpdate = recordLiveAudioTranscriptionMessage({
      message: {
        isComplete: false,
        transcript: 'partial words',
        words: [{ endMs: 550, startMs: 100, text: 'partial' }],
      },
      state: initialState,
    });
    const completeUpdate = recordLiveAudioTranscriptionMessage({
      message: {
        isComplete: true,
        transcript: 'final words',
        words: [{ endMs: 650, startMs: 100, text: 'final' }],
      },
      state: partialUpdate.state,
    });

    expect(partialUpdate.state.activeBatch?.words).toEqual([
      { endMs: 550, startMs: 100, text: 'partial' },
    ]);
    expect(completeUpdate.completedBatch?.words).toEqual([
      { endMs: 650, startMs: 100, text: 'final' },
    ]);
  });

  it('keeps same-key word timings when a formatted provider update only changes text', () => {
    const initialState = createInitialLiveAudioTranscriptionBatchState();
    const timingUpdate = recordLiveAudioTranscriptionMessage({
      message: {
        isComplete: true,
        sourceBatchKey: 'provider-turn-9',
        transcript: 'hello world',
        words: [
          { endMs: 200, startMs: 100, text: 'hello' },
          { endMs: 420, startMs: 260, text: 'world' },
        ],
      },
      state: initialState,
    });
    const formattedUpdate = recordLiveAudioTranscriptionMessage({
      message: {
        isComplete: true,
        sourceBatchKey: 'provider-turn-9',
        transcript: 'Hello, world.',
        words: [],
      },
      state: timingUpdate.state,
    });

    expect(formattedUpdate.state.completedBatches).toHaveLength(1);
    expect(formattedUpdate.state.completedBatches[0]?.transcript).toBe(
      'Hello, world.',
    );
    expect(formattedUpdate.state.completedBatches[0]?.words).toEqual([
      { endMs: 200, startMs: 100, text: 'hello' },
      { endMs: 420, startMs: 260, text: 'world' },
    ]);
  });

  it('does not read AssemblyAI field names from generic transcription messages', () => {
    const initialState = createInitialLiveAudioTranscriptionBatchState();
    const update = recordLiveAudioTranscriptionMessage({
      message: {
        isComplete: true,
        sourceBatchKey: 'normalized-key',
        transcript: 'normalized text',
        words: [],
      },
      state: initialState,
    });

    expect(update.completedBatch).toMatchObject({
      key: 'normalized-key',
      transcript: 'normalized text',
    });
  });
});

describe('completeLiveAudioTranscriptionActiveBatch', () => {
  it('moves the active partial batch onto the completed rail', () => {
    const initialState = createInitialLiveAudioTranscriptionBatchState();
    const partialUpdate = recordLiveAudioTranscriptionMessage({
      message: {
        isComplete: false,
        transcript: 'still speaking',
        words: [{ startMs: 100, endMs: 550, text: 'still' }],
      },
      state: initialState,
    });

    const completeUpdate = completeLiveAudioTranscriptionActiveBatch({
      state: partialUpdate.state,
    });

    expect(completeUpdate.completedBatch?.key).toBe('message-0');
    expect(completeUpdate.completedBatch?.transcript).toBe('still speaking');
    expect(completeUpdate.state.activeBatch).toBeNull();
    expect(
      completeUpdate.state.completedBatches.map((batch) => batch.transcript),
    ).toEqual(['still speaking']);
  });

  it('keeps completed batches unchanged when there is no active batch', () => {
    const initialState = createInitialLiveAudioTranscriptionBatchState();
    const completeUpdate = completeLiveAudioTranscriptionActiveBatch({
      state: initialState,
    });

    expect(completeUpdate.completedBatch).toBeNull();
    expect(completeUpdate.state).toBe(initialState);
  });
});

'use client';

import { useMemo, useRef, useState } from 'react';

import type { z } from 'zod';

import type {
  LiveAudioPcmSamples,
  LiveAudioPcmStreamChunk,
  LiveAudioPlugin,
  LiveAudioPluginSession,
  LiveAudioTranscriptionPlugin,
  LiveAudioTranscriptionSnapshotInput,
  LiveAudioTranscriptionStatus,
} from '../plugins/contracts';
import { LiveAudioTranscriptionSnapshotSchema } from '../plugins/contracts';
import { startPluginSessions, stopPluginSessions } from '../plugins/events';
import {
  type LiveAudioTranscriptionBatch,
  type LiveAudioTranscriptionBatchState,
  type LiveAudioTranscriptionMessage,
  completeLiveAudioTranscriptionActiveBatch,
  createInitialLiveAudioTranscriptionBatchState,
  recordLiveAudioTranscriptionMessage,
} from '../transcription/transcription-batches';

type LiveAudioTranscriptionBatchCallbacks = {
  onBatchComplete?: (batch: LiveAudioTranscriptionBatch) => void;
};

type LiveAudioTranscriptionStopOptions = {
  mode?: 'cancel' | 'finish';
};

export function useLiveAudioTranscription({
  plugins,
}: {
  plugins: readonly LiveAudioPlugin[];
}) {
  const transcriptionPlugins = useMemo(
    () =>
      plugins.filter(
        (plugin): plugin is LiveAudioTranscriptionPlugin =>
          plugin.kind === 'transcription',
      ),
    [plugins],
  );
  const batchCallbacksRef = useRef<LiveAudioTranscriptionBatchCallbacks>({});
  const sessionsRef = useRef<LiveAudioPluginSession[]>([]);
  const startAttemptRef = useRef(0);
  const batchStateRef = useRef<LiveAudioTranscriptionBatchState>(
    createInitialLiveAudioTranscriptionBatchState(),
  );
  const [status, setStatus] = useState<LiveAudioTranscriptionStatus>('idle');
  const [batchState, setBatchState] =
    useState<LiveAudioTranscriptionBatchState>(
      createInitialLiveAudioTranscriptionBatchState,
    );
  const [lastMessage, setLastMessage] =
    useState<LiveAudioTranscriptionMessage | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function start({
    onBatchComplete,
    onBatchProgress,
    onPcmChunk,
    onPcmSamples,
    stream,
  }: {
    onBatchComplete?: (batch: LiveAudioTranscriptionBatch) => void;
    onBatchProgress?: (batch: LiveAudioTranscriptionBatch) => void;
    onPcmChunk?: (chunk: LiveAudioPcmStreamChunk) => void;
    onPcmSamples?: (input: LiveAudioPcmSamples) => void;
    stream: MediaStream;
  }) {
    const attempt = startAttemptRef.current + 1;
    startAttemptRef.current = attempt;
    batchCallbacksRef.current = onBatchComplete ? { onBatchComplete } : {};
    void stopActiveSessions();
    setStatus('connecting');
    setLastMessage(null);
    setErrorMessage(null);
    const initialBatchState = createInitialLiveAudioTranscriptionBatchState();
    batchStateRef.current = initialBatchState;
    setBatchState(initialBatchState);

    try {
      const sessions = await startPluginSessions(
        transcriptionPlugins.map(
          (plugin) => () =>
            plugin.start({
              emitClose() {
                if (startAttemptRef.current !== attempt) {
                  return;
                }

                setStatus((currentStatus) =>
                  currentStatus === 'error' ? 'error' : 'stopped',
                );
              },
              emitError(nextErrorMessage) {
                if (startAttemptRef.current !== attempt) {
                  return;
                }

                setStatus('error');
                setErrorMessage(nextErrorMessage);
              },
              emitMessage(event) {
                if (startAttemptRef.current !== attempt) {
                  return;
                }

                recordMessage({
                  ...(event.audioStartMs === undefined
                    ? {}
                    : { audioStartMs: event.audioStartMs }),
                  message: event.message,
                  onBatchComplete,
                  onBatchProgress,
                });
              },
              emitPcmChunk(chunk) {
                if (startAttemptRef.current === attempt) {
                  onPcmChunk?.(chunk);
                }
              },
              emitPcmSamples(input) {
                if (startAttemptRef.current === attempt) {
                  onPcmSamples?.(input);
                }
              },
              kind: 'transcription',
              stream,
            }),
        ),
      );

      if (startAttemptRef.current !== attempt) {
        void stopPluginSessions(sessions);
        return;
      }

      sessionsRef.current = sessions;
      setStatus('streaming');
    } catch (error) {
      if (startAttemptRef.current !== attempt) {
        return;
      }

      void stopActiveSessions();
      setStatus('error');
      setErrorMessage(
        error instanceof Error
          ? error.message
          : `${plugins.map((plugin) => plugin.id).join(', ') || 'no live-audio plugin'} streaming could not start.`,
      );
    }
  }

  function recordMessage({
    audioStartMs,
    message,
    onBatchComplete,
    onBatchProgress,
  }: {
    audioStartMs?: number;
    message: LiveAudioTranscriptionMessage;
    onBatchComplete?: (batch: LiveAudioTranscriptionBatch) => void;
    onBatchProgress?: (batch: LiveAudioTranscriptionBatch) => void;
  }) {
    setLastMessage(message);

    const update = recordLiveAudioTranscriptionMessage({
      ...(audioStartMs === undefined ? {} : { audioStartMs }),
      message,
      state: batchStateRef.current,
    });
    batchStateRef.current = update.state;
    setBatchState(update.state);

    if (update.state.activeBatch) {
      onBatchProgress?.(update.state.activeBatch);
    }

    if (update.completedBatch) {
      onBatchComplete?.(update.completedBatch);
    }
  }

  async function stop({
    mode = 'cancel',
  }: LiveAudioTranscriptionStopOptions = {}) {
    const sessionAttempt = startAttemptRef.current;

    if (mode === 'cancel') {
      completeActiveBatch();
      startAttemptRef.current += 1;
    }

    const stoppedSessions = stopActiveSessions();

    if (mode === 'cancel') {
      setStatus((currentStatus) =>
        currentStatus === 'error' ? 'error' : 'stopped',
      );
      await stoppedSessions;
      return;
    }

    await stoppedSessions;

    if (startAttemptRef.current !== sessionAttempt) {
      return;
    }

    completeActiveBatch();
    startAttemptRef.current += 1;
    setStatus((currentStatus) =>
      currentStatus === 'error' ? 'error' : 'stopped',
    );
  }

  function completeActiveBatch() {
    const update = completeLiveAudioTranscriptionActiveBatch({
      state: batchStateRef.current,
    });
    batchStateRef.current = update.state;
    setBatchState(update.state);

    if (update.completedBatch) {
      batchCallbacksRef.current.onBatchComplete?.(update.completedBatch);
    }
  }

  async function stopActiveSessions() {
    const sessions = sessionsRef.current;
    sessionsRef.current = [];

    if (sessions.length > 0) {
      setStatus('stopping');
    }

    await stopPluginSessions(sessions);
  }

  function readSnapshot(): z.infer<
    typeof LiveAudioTranscriptionSnapshotSchema
  > {
    const input: LiveAudioTranscriptionSnapshotInput = {
      activeBatch: batchStateRef.current.activeBatch,
      completedBatches: batchStateRef.current.completedBatches,
      lastMessage,
      messages: batchStateRef.current.messages,
      status,
    };
    const snapshot = sessionsRef.current.find(
      (session) => session.snapshot,
    )?.snapshot;

    if (snapshot) {
      return snapshot.schema.parse(snapshot.read(input));
    }

    return LiveAudioTranscriptionSnapshotSchema.parse(input);
  }

  return {
    activeBatch: batchState.activeBatch,
    completedBatches: batchState.completedBatches,
    errorMessage,
    lastMessage,
    readSnapshot,
    start,
    status,
    stop,
  };
}

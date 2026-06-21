'use client';

import {
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
} from 'react';

import type {
  LiveAudioPcmStreamChunk,
  LiveAudioPlugin,
  LiveAudioPluginSession,
  LiveAudioUploadPlugin,
} from '../plugins/contracts';
import { startPluginSessions, stopPluginSessions } from '../plugins/events';
import type {
  RealtimeUploadChunk,
  RealtimeUploadStats,
  RealtimeUploadStatus,
} from '../realtime-upload/state';
import {
  type WindowUpload,
  waitForUploadsToDrain,
} from '../realtime-upload/window-state';

type LiveAudioRealtimeUploadLifecycleOptions = {
  chunksRef: MutableRefObject<RealtimeUploadChunk[]>;
  objectPath: string;
  pcmChunksRef: MutableRefObject<LiveAudioPcmStreamChunk[]>;
  pendingUploadsRef: MutableRefObject<Promise<void>[]>;
  pluginSessionsRef: MutableRefObject<LiveAudioPluginSession[]>;
  plugins: readonly LiveAudioPlugin[];
  reportUploadError: (attempt: number, error: unknown) => void;
  sessionIdRef: MutableRefObject<string | null>;
  setChunks: Dispatch<SetStateAction<RealtimeUploadChunk[]>>;
  setErrorMessage: Dispatch<SetStateAction<string | null>>;
  setSessionId: Dispatch<SetStateAction<string | null>>;
  setStats: Dispatch<SetStateAction<RealtimeUploadStats | null>>;
  setStatus: Dispatch<SetStateAction<RealtimeUploadStatus>>;
  startAttemptRef: MutableRefObject<number>;
  windowUploadsRef: MutableRefObject<WindowUpload[]>;
};

export function useLiveAudioRealtimeUploadLifecycle({
  chunksRef,
  objectPath,
  pcmChunksRef,
  pendingUploadsRef,
  pluginSessionsRef,
  plugins,
  reportUploadError,
  sessionIdRef,
  setChunks,
  setErrorMessage,
  setSessionId,
  setStats,
  setStatus,
  startAttemptRef,
  windowUploadsRef,
}: LiveAudioRealtimeUploadLifecycleOptions) {
  const uploadPlugins = useMemo(
    () =>
      plugins.filter(
        (plugin): plugin is LiveAudioUploadPlugin => plugin.kind === 'upload',
      ),
    [plugins],
  );
  const finishWhenUploadsDrain = useCallback(
    (attempt: number) => {
      void waitForUploadsToDrain(() => pendingUploadsRef.current).then(() => {
        if (startAttemptRef.current !== attempt) {
          return;
        }

        const completedChunks = chunksRef.current;
        setStats({
          chunkCount: completedChunks.length,
          stoppedAtMs: performance.now(),
          totalSizeBytes: completedChunks.reduce(
            (totalSizeBytes, chunk) => totalSizeBytes + chunk.sizeBytes,
            0,
          ),
        });
        setStatus((currentStatus) =>
          currentStatus === 'error' ? 'error' : 'complete',
        );
        void stopPluginSessions(pluginSessionsRef.current);
        pluginSessionsRef.current = [];
      });
    },
    [
      chunksRef,
      pendingUploadsRef,
      pluginSessionsRef,
      setStats,
      setStatus,
      startAttemptRef,
    ],
  );

  const stop = useCallback(() => {
    const attempt = startAttemptRef.current;

    setStatus((currentStatus) =>
      currentStatus === 'recording' ? 'flushing' : currentStatus,
    );
    finishWhenUploadsDrain(attempt);
  }, [finishWhenUploadsDrain, setStatus, startAttemptRef]);

  const start = useCallback(async () => {
    const attempt = startAttemptRef.current + 1;
    const currentSessionId = crypto.randomUUID();
    startAttemptRef.current = attempt;
    sessionIdRef.current = currentSessionId;
    void stopPluginSessions(pluginSessionsRef.current);
    chunksRef.current = [];
    pcmChunksRef.current = [];
    pendingUploadsRef.current = [];
    pluginSessionsRef.current = [];
    windowUploadsRef.current = [];
    setChunks([]);
    setErrorMessage(null);
    setSessionId(currentSessionId);
    setStats(null);
    setStatus('recording');

    try {
      const sessions = await startPluginSessions(
        uploadPlugins.map(
          (plugin) => () =>
            plugin.start({
              kind: 'upload',
              objectPath,
              sessionId: currentSessionId,
            }),
        ),
      );

      if (startAttemptRef.current !== attempt) {
        void stopPluginSessions(sessions);
        return;
      }

      pluginSessionsRef.current = sessions;
    } catch (error) {
      reportUploadError(attempt, error);
      throw error;
    }
  }, [
    chunksRef,
    objectPath,
    pcmChunksRef,
    pendingUploadsRef,
    pluginSessionsRef,
    reportUploadError,
    sessionIdRef,
    setChunks,
    setErrorMessage,
    setSessionId,
    setStats,
    setStatus,
    startAttemptRef,
    uploadPlugins,
    windowUploadsRef,
  ]);

  useEffect(() => {
    return () => {
      startAttemptRef.current += 1;
      sessionIdRef.current = null;
      pendingUploadsRef.current = [];
      void stopPluginSessions(pluginSessionsRef.current);
      pluginSessionsRef.current = [];
    };
  }, [pendingUploadsRef, pluginSessionsRef, sessionIdRef, startAttemptRef]);

  return { start, stop };
}

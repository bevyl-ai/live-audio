import { z } from 'zod';

import type {
  LiveAudioPluginSession,
  LiveAudioPluginStartContext,
  LiveAudioTranscriptionPlugin,
} from '../contracts';
import { LiveAudioTranscriptionSnapshotSchema } from '../contracts';
import {
  type AssemblyAiAudioCaptureFactory,
  convertFloat32SamplesToPcm16,
  createWebAudioPcmCapture,
} from './assemblyai-audio-capture';
import {
  buildAssemblyAiWebSocketUrl,
  parseAssemblyAiSocketData,
  readAssemblyAiErrorMessage,
} from './assemblyai-message';
import {
  type AssemblyAiWebSocket,
  type AssemblyAiWebSocketFactory,
  createBrowserAssemblyAiWebSocket,
  isAssemblyAiWebSocketOpen,
} from './assemblyai-websocket';

const DEFAULT_ASSEMBLYAI_ENDPOINT = 'wss://streaming.assemblyai.com/v3/ws';
const DEFAULT_SPEECH_MODEL = 'universal-streaming-english';
const DEFAULT_FORMAT_TURNS = true;
const DEFAULT_BUFFER_SIZE = 4096;
const FORCE_ENDPOINT_TURN_TIMEOUT_MS = 1500;
const STOP_CLOSE_TIMEOUT_MS = 1500;

export const AssemblyAiLiveAudioSnapshotSchema =
  LiveAudioTranscriptionSnapshotSchema.extend({
    provider: z.literal('assemblyai'),
    readyState: z.number(),
  });

export type AssemblyAiLiveAudioPluginOptions = {
  audioCaptureFactory?: AssemblyAiAudioCaptureFactory;
  bufferSize?: number;
  endpoint?: string;
  formatTurns?: boolean;
  getToken: () => Promise<string>;
  speechModel?: string;
  webSocketFactory?: AssemblyAiWebSocketFactory;
};

export function createAssemblyAiLiveAudioPlugin({
  audioCaptureFactory = createWebAudioPcmCapture,
  bufferSize = DEFAULT_BUFFER_SIZE,
  endpoint = DEFAULT_ASSEMBLYAI_ENDPOINT,
  formatTurns = DEFAULT_FORMAT_TURNS,
  getToken,
  speechModel = DEFAULT_SPEECH_MODEL,
  webSocketFactory = createBrowserAssemblyAiWebSocket,
}: AssemblyAiLiveAudioPluginOptions): LiveAudioTranscriptionPlugin {
  return {
    id: 'assemblyai',
    kind: 'transcription',
    async start(context) {
      return startAssemblyAiTranscriptionSession({
        audioCaptureFactory,
        bufferSize,
        context,
        endpoint,
        formatTurns,
        getToken,
        speechModel,
        webSocketFactory,
      });
    },
  };
}

async function startAssemblyAiTranscriptionSession({
  audioCaptureFactory,
  bufferSize,
  context,
  endpoint,
  formatTurns,
  getToken,
  speechModel,
  webSocketFactory,
}: {
  audioCaptureFactory: AssemblyAiAudioCaptureFactory;
  bufferSize: number;
  context: Extract<LiveAudioPluginStartContext, { kind: 'transcription' }>;
  endpoint: string;
  formatTurns: boolean;
  getToken: () => Promise<string>;
  speechModel: string;
  webSocketFactory: AssemblyAiWebSocketFactory;
}): Promise<LiveAudioPluginSession> {
  const pendingAudioPayloads: ArrayBuffer[] = [];
  const socketRef: { current: AssemblyAiWebSocket | null } = { current: null };
  const audioSampleRateHzRef = { current: 0 };
  const audioCapture = audioCaptureFactory({
    bufferSize,
    onSamples(samples) {
      context.emitPcmSamples({
        sampleRateHz: audioSampleRateHzRef.current,
        samples,
      });
      const payload = convertFloat32SamplesToPcm16(samples);
      const socket = socketRef.current;

      if (socket && isAssemblyAiWebSocketOpen(socket)) {
        socket.send(payload);
        return;
      }

      pendingAudioPayloads.push(payload);
    },
    stream: context.stream,
  });
  audioSampleRateHzRef.current = audioCapture.sampleRateHz;
  audioCapture.start();

  const token = await getToken().catch((error: unknown) => {
    audioCapture.stop();
    throw error;
  });
  const socket = webSocketFactory(
    buildAssemblyAiWebSocketUrl({
      endpoint,
      formatTurns,
      sampleRateHz: Math.round(audioCapture.sampleRateHz),
      speechModel,
      token,
    }),
  );
  socketRef.current = socket;
  const stopState: {
    closeTimeout: ReturnType<typeof setTimeout> | null;
    forceEndpointTimeout: ReturnType<typeof setTimeout> | null;
    promise: Promise<void> | null;
    resolve: (() => void) | null;
    shouldTerminateAfterForcedEndpoint: boolean;
  } = {
    closeTimeout: null,
    forceEndpointTimeout: null,
    promise: null,
    resolve: null,
    shouldTerminateAfterForcedEndpoint: false,
  };

  const clearForceEndpointTimeout = () => {
    if (stopState.forceEndpointTimeout !== null) {
      clearTimeout(stopState.forceEndpointTimeout);
      stopState.forceEndpointTimeout = null;
    }
  };

  const sendTerminate = () => {
    clearForceEndpointTimeout();
    stopState.shouldTerminateAfterForcedEndpoint = false;

    if (!isAssemblyAiWebSocketOpen(socket)) {
      socket.close();
      return;
    }

    socket.send(JSON.stringify({ type: 'Terminate' }));
    stopState.closeTimeout = setTimeout(() => {
      socket.close();
      resolveStopped();
    }, STOP_CLOSE_TIMEOUT_MS);
  };

  const waitForForcedEndpointTurn = () => {
    if (stopState.forceEndpointTimeout !== null) {
      return;
    }

    stopState.forceEndpointTimeout = setTimeout(
      () => sendTerminate(),
      FORCE_ENDPOINT_TURN_TIMEOUT_MS,
    );
  };

  const resolveStopped = () => {
    if (stopState.closeTimeout !== null) {
      clearTimeout(stopState.closeTimeout);
      stopState.closeTimeout = null;
    }

    clearForceEndpointTimeout();
    stopState.shouldTerminateAfterForcedEndpoint = false;

    const resolve = stopState.resolve;
    stopState.resolve = null;
    stopState.promise = null;
    resolve?.();
  };

  socket.onopen = () => {
    while (pendingAudioPayloads.length > 0) {
      const payload = pendingAudioPayloads.shift();

      if (payload) {
        socket.send(payload);
      }
    }
  };
  socket.onmessage = (event) => {
    const message = handleAssemblyAiSocketMessage({ context, event });

    if (
      stopState.shouldTerminateAfterForcedEndpoint &&
      message?.isComplete &&
      (!formatTurns || message.isFormatted)
    ) {
      sendTerminate();
    }
  };
  socket.onerror = () => {
    context.emitError('AssemblyAI realtime websocket failed.');
  };
  socket.onclose = () => {
    context.emitClose();
    resolveStopped();
  };

  return {
    snapshot: {
      schema: AssemblyAiLiveAudioSnapshotSchema,
      read(input) {
        return AssemblyAiLiveAudioSnapshotSchema.parse({
          provider: 'assemblyai',
          readyState: socket.readyState,
          ...input,
        });
      },
    },
    stop() {
      audioCapture.stop();

      if (stopState.promise) {
        return stopState.promise;
      }

      if (socket.readyState === 3) {
        return Promise.resolve();
      }

      stopState.promise = new Promise<void>((resolve) => {
        stopState.resolve = resolve;

        if (isAssemblyAiWebSocketOpen(socket)) {
          stopState.shouldTerminateAfterForcedEndpoint = true;
          socket.send(JSON.stringify({ type: 'ForceEndpoint' }));
          waitForForcedEndpointTurn();
          return;
        }

        socket.close();
      });

      return stopState.promise;
    },
  };
}

function handleAssemblyAiSocketMessage({
  context,
  event,
}: {
  context: Extract<LiveAudioPluginStartContext, { kind: 'transcription' }>;
  event: { data: unknown };
}) {
  if (typeof event.data !== 'string') {
    return null;
  }

  const message = parseAssemblyAiSocketData(event.data);

  if (!message) {
    context.emitError('AssemblyAI realtime message could not be parsed.');
    return null;
  }

  if (message.kind === 'transcription') {
    context.emitMessage({ message: message.message });
    return {
      isComplete: message.message.isComplete,
      isFormatted: message.isFormatted,
    };
  }

  if (message.message.type === 'Error') {
    context.emitError(readAssemblyAiErrorMessage(message.message));
  }

  return null;
}

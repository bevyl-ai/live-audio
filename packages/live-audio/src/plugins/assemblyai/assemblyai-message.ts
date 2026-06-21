import { z } from 'zod';

import type {
  LiveAudioTranscriptionMessage,
  LiveAudioTranscriptionWord,
} from '../../transcription/transcription-batches';

const assemblyAiWordSchema = z
  .object({
    confidence: z.number().optional(),
    end: z.number().optional(),
    start: z.number().optional(),
    text: z.string().optional(),
    word_is_final: z.boolean().optional(),
  })
  .passthrough();

const assemblyAiTurnMessageSchema = z
  .object({
    end_of_turn: z.boolean().optional(),
    end_of_turn_confidence: z.number().optional(),
    transcript: z.string().optional(),
    turn_is_formatted: z.boolean().optional(),
    turn_order: z.number().optional(),
    type: z.literal('Turn'),
    words: z.array(assemblyAiWordSchema).optional(),
  })
  .passthrough();

const assemblyAiRealtimeMessageSchema = z
  .object({
    type: z.string(),
  })
  .passthrough();

const assemblyAiTokenResponseSchema = z
  .object({
    token: z.string().min(1),
  })
  .passthrough();

export type AssemblyAiRealtimeMessage = z.infer<
  typeof assemblyAiRealtimeMessageSchema
>;

type AssemblyAiTurnMessage = z.infer<typeof assemblyAiTurnMessageSchema>;
type AssemblyAiWord = z.infer<typeof assemblyAiWordSchema>;

export type AssemblyAiParsedRealtimeMessage =
  | {
      kind: 'provider';
      message: AssemblyAiRealtimeMessage;
    }
  | {
      isFormatted: boolean;
      kind: 'transcription';
      message: LiveAudioTranscriptionMessage;
    };

type AssemblyAiTokenFetcher = (input: string) => Promise<{
  json: () => Promise<unknown>;
  ok: boolean;
  status: number;
}>;

export async function fetchAssemblyAiTemporaryToken({
  fetcher = fetch,
  tokenUrl,
}: {
  fetcher?: AssemblyAiTokenFetcher;
  tokenUrl: string;
}) {
  const response = await fetcher(tokenUrl);

  if (!response.ok) {
    throw new Error(`AssemblyAI token request failed: ${response.status}`);
  }

  const body: unknown = await response.json();
  const tokenResponse = assemblyAiTokenResponseSchema.safeParse(body);

  if (!tokenResponse.success) {
    throw new Error('AssemblyAI token response did not include a token.');
  }

  return tokenResponse.data.token;
}

export function buildAssemblyAiWebSocketUrl({
  endpoint,
  formatTurns,
  sampleRateHz,
  speechModel,
  token,
}: {
  endpoint: string;
  formatTurns: boolean;
  sampleRateHz: number;
  speechModel: string;
  token: string;
}) {
  if (!Number.isSafeInteger(sampleRateHz) || sampleRateHz <= 0) {
    throw new Error('AssemblyAI sample rate must be a positive safe integer.');
  }

  if (!token) {
    throw new Error('AssemblyAI token is required.');
  }

  const params = new URLSearchParams({
    format_turns: String(formatTurns),
    sample_rate: String(sampleRateHz),
    speech_model: speechModel,
    token,
  });

  return `${endpoint}?${params.toString()}`;
}

export function parseAssemblyAiRealtimeMessage(
  input: unknown,
): AssemblyAiParsedRealtimeMessage | null {
  const message = assemblyAiRealtimeMessageSchema.safeParse(input);

  if (!message.success) {
    return null;
  }

  if (message.data.type !== 'Turn') {
    return {
      kind: 'provider',
      message: message.data,
    };
  }

  const turnMessage = assemblyAiTurnMessageSchema.safeParse(input);
  if (!turnMessage.success) {
    return null;
  }

  return {
    isFormatted: turnMessage.data.turn_is_formatted === true,
    kind: 'transcription',
    message: normalizeAssemblyAiTurnMessage(turnMessage.data),
  };
}

export function parseAssemblyAiSocketData(payload: string) {
  try {
    const input: unknown = JSON.parse(payload);
    return parseAssemblyAiRealtimeMessage(input);
  } catch {
    return null;
  }
}

function normalizeAssemblyAiTurnMessage(
  message: AssemblyAiTurnMessage,
): LiveAudioTranscriptionMessage {
  const isComplete = message.end_of_turn === true;

  return {
    isComplete,
    ...(message.turn_order === undefined
      ? {}
      : { sourceBatchKey: String(message.turn_order) }),
    transcript: message.transcript ?? '',
    words: (message.words ?? [])
      .filter((word) => word.word_is_final !== false)
      .map(normalizeAssemblyAiWord)
      .filter(isLiveAudioTranscriptionWord),
  };
}

function normalizeAssemblyAiWord(
  word: AssemblyAiWord,
): LiveAudioTranscriptionWord | null {
  if (
    typeof word.start !== 'number' ||
    typeof word.end !== 'number' ||
    typeof word.text !== 'string'
  ) {
    return null;
  }

  return {
    endMs: word.end,
    startMs: word.start,
    text: word.text,
  };
}

function isLiveAudioTranscriptionWord(
  word: LiveAudioTranscriptionWord | null,
): word is LiveAudioTranscriptionWord {
  return word !== null;
}

export function readAssemblyAiErrorMessage(message: AssemblyAiRealtimeMessage) {
  const providerError = message.error;
  return typeof providerError === 'string'
    ? providerError
    : 'AssemblyAI realtime websocket returned an error.';
}

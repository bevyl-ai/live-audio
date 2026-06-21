import type {
  LiveAudioPluginBatchCompleteResult,
  LiveAudioPluginSession,
} from './contracts';

type StartPluginSession = () =>
  | LiveAudioPluginSession
  | Promise<LiveAudioPluginSession>;

export async function startPluginSessions(
  starts: readonly StartPluginSession[],
) {
  const results = await Promise.allSettled(
    starts.map((start) => Promise.resolve(start())),
  );
  const sessions = results
    .filter(isFulfilledPluginSession)
    .map((result) => result.value);
  const rejectedResult = results.find(isRejectedPluginSession);

  if (rejectedResult) {
    await stopPluginSessions(sessions);
    throw rejectedResult.reason;
  }

  return sessions;
}

export function notifyPcmChunkPlugins(
  sessions: readonly LiveAudioPluginSession[],
  input: Parameters<NonNullable<LiveAudioPluginSession['onPcmChunk']>>[0],
) {
  return Promise.all(
    sessions.map((session) => Promise.resolve(session.onPcmChunk?.(input))),
  ).then(() => undefined);
}

export function notifyBatchProgressPlugins(
  sessions: readonly LiveAudioPluginSession[],
  input: Parameters<NonNullable<LiveAudioPluginSession['onBatchProgress']>>[0],
) {
  return Promise.all(
    sessions.map((session) =>
      Promise.resolve(session.onBatchProgress?.(input)),
    ),
  ).then(() => undefined);
}

export function notifyBatchCompletePlugins(
  sessions: readonly LiveAudioPluginSession[],
  input: Parameters<NonNullable<LiveAudioPluginSession['onBatchComplete']>>[0],
) {
  return Promise.all(
    sessions.map((session) =>
      Promise.resolve(session.onBatchComplete?.(input)),
    ),
  ).then(mergeUploadedArtifacts);
}

export function notifyCaptureCompletePlugins(
  sessions: readonly LiveAudioPluginSession[],
  input: Parameters<
    NonNullable<LiveAudioPluginSession['onCaptureComplete']>
  >[0],
) {
  return Promise.allSettled(
    sessions.map((session) =>
      Promise.resolve(session.onCaptureComplete?.(input)),
    ),
  ).then(mergeSettledUploadedArtifacts);
}

export function stopPluginSessions(
  sessions: readonly LiveAudioPluginSession[],
) {
  return Promise.allSettled(
    sessions.map((session) => Promise.resolve(session.stop?.())),
  ).then(() => undefined);
}

function isFulfilledPluginSession(
  operationResult: PromiseSettledResult<LiveAudioPluginSession>,
): operationResult is PromiseFulfilledResult<LiveAudioPluginSession> {
  return operationResult.status === 'fulfilled';
}

function isRejectedPluginSession(
  operationResult: PromiseSettledResult<LiveAudioPluginSession>,
): operationResult is PromiseRejectedResult {
  return operationResult.status === 'rejected';
}

function isFulfilledUploadedArtifacts(
  operationResult: PromiseSettledResult<
    LiveAudioPluginBatchCompleteResult | undefined
  >,
): operationResult is PromiseFulfilledResult<
  LiveAudioPluginBatchCompleteResult | undefined
> {
  return operationResult.status === 'fulfilled';
}

function isRejectedUploadedArtifacts(
  operationResult: PromiseSettledResult<
    LiveAudioPluginBatchCompleteResult | undefined
  >,
): operationResult is PromiseRejectedResult {
  return operationResult.status === 'rejected';
}

function mergeSettledUploadedArtifacts(
  results: readonly PromiseSettledResult<
    LiveAudioPluginBatchCompleteResult | undefined
  >[],
): LiveAudioPluginBatchCompleteResult {
  const fulfilledResults = results
    .filter(isFulfilledUploadedArtifacts)
    .map((result) => result.value);

  if (fulfilledResults.length === 0) {
    const rejectedResult = results.find(isRejectedUploadedArtifacts);

    if (rejectedResult) {
      throw rejectedResult.reason;
    }
  }

  return mergeUploadedArtifacts(fulfilledResults);
}

function mergeUploadedArtifacts(
  results: readonly (LiveAudioPluginBatchCompleteResult | undefined)[],
): LiveAudioPluginBatchCompleteResult {
  return results.reduce<LiveAudioPluginBatchCompleteResult>(
    (mergedResult, result) => ({
      ...(mergedResult.audio ? { audio: mergedResult.audio } : {}),
      ...(mergedResult.waveform ? { waveform: mergedResult.waveform } : {}),
      ...(result?.audio ? { audio: result.audio } : {}),
      ...(result?.waveform ? { waveform: result.waveform } : {}),
    }),
    {},
  );
}

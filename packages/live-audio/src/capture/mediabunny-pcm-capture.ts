import {
  ALL_FORMATS,
  AudioSampleSink,
  Input,
  ReadableStreamSource,
} from 'mediabunny';

import {
  type LiveAudioCaptureCompleteEvent,
  buildLiveAudioCaptureCompleteEvent,
} from './complete-event';
import {
  type PcmCaptureStats,
  type PcmFrame,
  buildPcmFrameFromAudioSample,
  createInitialPcmCaptureStats,
  recordMediaRecorderChunk,
  recordPcmFrame,
} from './pcm';

export type MediabunnyPcmCaptureStatus =
  | 'recording'
  | 'decoding'
  | 'stopped'
  | 'error';

export type MediabunnyPcmCapture = {
  done: Promise<PcmCaptureStats>;
  stop: () => void;
};

export type LiveAudioCaptureProgressEvent = {
  elapsedSeconds: number;
};

export type MediabunnyPcmCaptureOptions = {
  mimeType?: string;
  audioBitsPerSecond?: number;
  timesliceMs?: number;
  progressIntervalMs?: number;
  maxCacheSizeBytes?: number;
  mono?: boolean;
  onFrame: (frame: PcmFrame) => void;
  onComplete?: (event: LiveAudioCaptureCompleteEvent) => void;
  onProgress?: (event: LiveAudioCaptureProgressEvent) => void;
  onStats?: (stats: PcmCaptureStats) => void;
  onStatus?: (status: MediabunnyPcmCaptureStatus) => void;
};

const DEFAULT_PROGRESS_INTERVAL_MS = 33;
const preferredMediaRecorderAudioMimeTypes = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
];

type ValidatedCaptureSettings = {
  mediaRecorderOptions: MediaRecorderOptions;
  timesliceMs: number;
  progressIntervalMs: number;
  maxCacheSizeBytes: number | null;
};

export function selectSupportedMediaRecorderAudioMimeType(
  isTypeSupported: (mimeType: string) => boolean,
): string | null {
  return (
    preferredMediaRecorderAudioMimeTypes.find((mimeType) =>
      isTypeSupported(mimeType),
    ) ?? null
  );
}

function createMediaRecorder(
  stream: MediaStream,
  options: MediaRecorderOptions,
) {
  if (options.mimeType && !MediaRecorder.isTypeSupported(options.mimeType)) {
    throw new Error(
      `MediaRecorder MIME type is not supported: ${options.mimeType}`,
    );
  }

  return new MediaRecorder(stream, options);
}

function buildMediaRecorderOptions({
  mimeType,
  audioBitsPerSecond,
}: Pick<MediabunnyPcmCaptureOptions, 'audioBitsPerSecond' | 'mimeType'>) {
  const selectedMimeType =
    mimeType ??
    selectSupportedMediaRecorderAudioMimeType((candidateMimeType) =>
      MediaRecorder.isTypeSupported(candidateMimeType),
    );

  return {
    ...(selectedMimeType ? { mimeType: selectedMimeType } : {}),
    ...(audioBitsPerSecond !== undefined ? { audioBitsPerSecond } : {}),
  };
}

function readPositiveIntegerOption({
  name,
  value,
  defaultValue,
}: {
  name: string;
  value: number | undefined;
  defaultValue?: number;
}) {
  if (value === undefined) {
    return defaultValue ?? null;
  }

  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive safe integer`);
  }

  return value;
}

function buildValidatedCaptureSettings(
  options: MediabunnyPcmCaptureOptions,
): ValidatedCaptureSettings {
  const audioBitsPerSecond = readPositiveIntegerOption({
    name: 'audioBitsPerSecond',
    value: options.audioBitsPerSecond,
  });
  const timesliceMs =
    readPositiveIntegerOption({
      name: 'timesliceMs',
      value: options.timesliceMs,
      defaultValue: 250,
    }) ?? 250;
  const progressIntervalMs =
    readPositiveIntegerOption({
      name: 'progressIntervalMs',
      value: options.progressIntervalMs,
      defaultValue: DEFAULT_PROGRESS_INTERVAL_MS,
    }) ?? DEFAULT_PROGRESS_INTERVAL_MS;
  const maxCacheSizeBytes = readPositiveIntegerOption({
    name: 'maxCacheSizeBytes',
    value: options.maxCacheSizeBytes,
  });

  return {
    mediaRecorderOptions: buildMediaRecorderOptions({
      mimeType: options.mimeType,
      ...(audioBitsPerSecond !== null ? { audioBitsPerSecond } : {}),
    }),
    timesliceMs,
    progressIntervalMs,
    maxCacheSizeBytes,
  };
}

function callCaptureCallback(name: string, callback: () => void) {
  try {
    callback();
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`${name} callback failed: ${error.message}`, {
        cause: error,
      });
    }

    throw new Error(`${name} callback failed`, { cause: error });
  }
}

export function startMediabunnyPcmCapture(
  stream: MediaStream,
  options: MediabunnyPcmCaptureOptions,
): MediabunnyPcmCapture {
  const {
    mediaRecorderOptions,
    progressIntervalMs,
    timesliceMs,
    maxCacheSizeBytes,
  } = buildValidatedCaptureSettings(options);
  const mediaRecorder = createMediaRecorder(stream, mediaRecorderOptions);
  const mono = options.mono !== false;
  // eslint-disable-next-line no-restricted-syntax -- capture stats update as MediaRecorder chunks and PCM frames arrive.
  let stats = createInitialPcmCaptureStats(
    mediaRecorder.mimeType || mediaRecorderOptions.mimeType || null,
  );
  const audioChunks: Blob[] = [];
  const pcmFrames: PcmFrame[] = [];
  // eslint-disable-next-line no-restricted-syntax -- each emitted PCM frame needs the next monotonic sequence number.
  let sequence = 0;
  // eslint-disable-next-line no-restricted-syntax -- stop requests are latched across stream cancellation and recorder events.
  let stopRequested = false;
  // eslint-disable-next-line no-restricted-syntax -- stream cancellation is shared across async recorder callbacks.
  let cancelled = false;
  // eslint-disable-next-line no-restricted-syntax -- recorder stop state gates byte stream closure after pending reads finish.
  let recorderStopped = false;
  // eslint-disable-next-line no-restricted-syntax -- byte stream closure is latched to prevent double close/error calls.
  let streamClosed = false;
  // eslint-disable-next-line no-restricted-syntax -- async chunk reads are counted so the stream closes only after draining.
  let pendingChunkReads = 0;
  // eslint-disable-next-line no-restricted-syntax -- ReadableStream exposes its controller after start() runs.
  let byteController: ReadableStreamDefaultController<Uint8Array> | null = null;
  // eslint-disable-next-line no-restricted-syntax -- capture failure promise keeps its reject callback for recorder errors.
  let rejectCaptureFailure: ((error: Error) => void) | null = null;
  // eslint-disable-next-line no-restricted-syntax -- live progress uses wall-clock capture time between decoded PCM frames.
  let recordingStartedAtMs: number | null = null;
  // eslint-disable-next-line no-restricted-syntax -- decoded PCM progress keeps wall-clock progress monotonic after late frames arrive.
  let latestPcmElapsedSeconds = 0;
  // eslint-disable-next-line no-restricted-syntax -- progress timer identity is owned by the capture lifecycle.
  let progressTimer: ReturnType<typeof setInterval> | null = null;
  const captureFailure = new Promise<PcmCaptureStats>((_, reject) => {
    rejectCaptureFailure = reject;
  });

  const publishStats = () => {
    const onStats = options.onStats;
    if (onStats) {
      callCaptureCallback('onStats', () => onStats(stats));
    }
  };

  const publishStatus = (status: MediabunnyPcmCaptureStatus) => {
    const onStatus = options.onStatus;
    if (onStatus) {
      callCaptureCallback('onStatus', () => onStatus(status));
    }
  };

  const publishErrorStatus = () => {
    try {
      publishStatus('error');
    } catch {
      // Preserve the original capture failure when the error callback also fails.
    }
  };

  const publishFrame = (pcmFrame: PcmFrame) => {
    pcmFrames.push(pcmFrame);
    latestPcmElapsedSeconds = Math.max(
      latestPcmElapsedSeconds,
      pcmFrame.timestampSeconds + pcmFrame.durationSeconds,
    );
    callCaptureCallback('onFrame', () => options.onFrame(pcmFrame));
  };

  const readProgressElapsedSeconds = () => {
    if (recordingStartedAtMs === null) {
      return latestPcmElapsedSeconds;
    }

    return Math.max(
      latestPcmElapsedSeconds,
      (performance.now() - recordingStartedAtMs) / 1000,
    );
  };

  const publishProgress = () => {
    const onProgress = options.onProgress;
    const elapsedSeconds = readProgressElapsedSeconds();

    if (!onProgress || elapsedSeconds <= 0) {
      return;
    }

    callCaptureCallback('onProgress', () =>
      onProgress({
        elapsedSeconds,
      }),
    );
  };

  const clearProgressTimer = () => {
    if (progressTimer === null) {
      return;
    }

    clearInterval(progressTimer);
    progressTimer = null;
  };

  const publishComplete = () => {
    const onComplete = options.onComplete;
    if (!onComplete) {
      return;
    }

    const completeEvent = buildLiveAudioCaptureCompleteEvent({
      audioChunks,
      completedAtMs: performance.now(),
      frames: pcmFrames,
      mimeType: stats.mediaRecorderMimeType,
      stats,
    });

    callCaptureCallback('onComplete', () => onComplete(completeEvent));
  };

  const failByteStream = (error: Error) => {
    clearProgressTimer();

    if (!cancelled && !streamClosed && byteController) {
      streamClosed = true;
      byteController.error(error);
    }

    if (rejectCaptureFailure) {
      rejectCaptureFailure(error);
      rejectCaptureFailure = null;
    }
  };

  const closeByteStreamWhenReady = () => {
    if (
      cancelled ||
      streamClosed ||
      !recorderStopped ||
      pendingChunkReads > 0 ||
      !byteController
    ) {
      return;
    }

    streamClosed = true;
    byteController.close();
  };

  const stopRecording = () => {
    if (stopRequested) {
      return;
    }

    stopRequested = true;
    try {
      publishProgress();
    } finally {
      clearProgressTimer();
    }

    if (mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
  };

  const byteStream = new ReadableStream<Uint8Array>({
    start(controller) {
      byteController = controller;
    },
    cancel() {
      cancelled = true;
      stopRecording();
    },
  });

  mediaRecorder.addEventListener('dataavailable', (event) => {
    if (event.data.size === 0 || cancelled || streamClosed) {
      return;
    }

    audioChunks.push(event.data);
    pendingChunkReads += 1;

    void (async () => {
      try {
        const bytes = new Uint8Array(await event.data.arrayBuffer());

        if (cancelled || streamClosed) {
          return;
        }

        stats = recordMediaRecorderChunk(stats, bytes.byteLength);
        publishStats();

        if (!byteController) {
          throw new Error(
            'MediaRecorder produced bytes before the stream opened',
          );
        }

        byteController.enqueue(bytes);
      } catch (error) {
        failByteStream(
          error instanceof Error
            ? error
            : new Error('MediaRecorder dataavailable handler failed'),
        );
      } finally {
        pendingChunkReads -= 1;
        closeByteStreamWhenReady();
      }
    })();
  });

  mediaRecorder.addEventListener('stop', () => {
    recorderStopped = true;
    closeByteStreamWhenReady();
  });

  mediaRecorder.addEventListener('error', (event) => {
    failByteStream(
      event.error instanceof Error
        ? event.error
        : new Error(event.message || 'MediaRecorder emitted an error'),
    );
  });

  const input = new Input({
    source: new ReadableStreamSource(
      byteStream,
      maxCacheSizeBytes !== null ? { maxCacheSize: maxCacheSizeBytes } : {},
    ),
    formats: ALL_FORMATS,
  });

  const done = (async () => {
    try {
      publishStatus('recording');
      mediaRecorder.start(timesliceMs);
      recordingStartedAtMs = performance.now();
      if (options.onProgress) {
        progressTimer = setInterval(() => {
          try {
            publishProgress();
          } catch (error) {
            failByteStream(
              error instanceof Error
                ? error
                : new Error('PCM progress callback failed'),
            );
          }
        }, progressIntervalMs);
      }

      const decodedStats = (async () => {
        const audioTrack = await input.getPrimaryAudioTrack();
        if (!audioTrack) {
          throw new Error('MediaBunny did not find an audio track');
        }

        const sink = new AudioSampleSink(audioTrack);
        publishStatus('decoding');

        for await (const audioSample of sink.samples()) {
          try {
            if (
              audioSample.numberOfFrames === 0 ||
              audioSample.numberOfChannels === 0
            ) {
              continue;
            }

            const pcmFrame = buildPcmFrameFromAudioSample({
              audioSample,
              sequence,
              mono,
            });
            sequence += 1;
            stats = recordPcmFrame(stats, pcmFrame);
            publishFrame(pcmFrame);
            publishStats();
          } finally {
            audioSample.close();
          }
        }

        publishStatus('stopped');
        publishComplete();
        return stats;
      })();

      return await Promise.race([decodedStats, captureFailure]);
    } catch (error) {
      publishErrorStatus();
      throw error;
    } finally {
      rejectCaptureFailure = null;
      stopRecording();
      input.dispose();
    }
  })();

  return {
    done,
    stop: () => stopRecording(),
  };
}

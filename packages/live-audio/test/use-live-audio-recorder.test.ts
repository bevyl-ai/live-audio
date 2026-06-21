import { describe, expect, it, vi } from 'vitest';

import { waitForCaptureCompleteTranscription } from '../src/session/use-live-audio-recorder';

describe('waitForCaptureCompleteTranscription', () => {
  // Real timers: bun's vi has no advanceTimersByTimeAsync. The waitMs bound
  // is small enough to exercise the race in real time.
  it('continues capture completion when transcription stop hangs', async () => {
    const completion = vi.fn();
    const completionPromise = waitForCaptureCompleteTranscription({
      finishTranscription: new Promise(() => undefined),
      waitMs: 50,
    }).then(completion);

    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(completion).not.toHaveBeenCalled();

    await completionPromise;
    expect(completion).toHaveBeenCalledTimes(1);
  });

  it('uses completed transcription metadata when it is ready before the bound', async () => {
    const completion = vi.fn();
    let resolveTranscription!: () => void;
    const finishTranscription = new Promise<void>((resolve) => {
      resolveTranscription = resolve;
    });

    const completionPromise = waitForCaptureCompleteTranscription({
      finishTranscription,
      waitMs: 25,
    }).then(completion);

    resolveTranscription();
    await completionPromise;

    expect(completion).toHaveBeenCalledTimes(1);
  });
});

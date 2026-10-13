import { Window } from 'happy-dom';
import { describe, expect, it } from 'vitest';

import type {
  LiveAudioPluginStartContext,
  LiveAudioTranscriptionPlugin,
} from '../src/plugins/contracts';

const window = new Window();
Object.assign(globalThis, {
  IS_REACT_ACT_ENVIRONMENT: true,
  document: window.document,
  window,
});

const { act, renderHook } = await import('@testing-library/react');
const { useLiveAudioTranscription } =
  await import('../src/hooks/use-live-audio-transcription');

type TranscriptionContext = Extract<
  LiveAudioPluginStartContext,
  { kind: 'transcription' }
>;

function createSocketPlugin({
  errorOnStop = false,
}: { errorOnStop?: boolean } = {}) {
  const contexts: TranscriptionContext[] = [];
  const plugin: LiveAudioTranscriptionPlugin = {
    id: 'socket',
    kind: 'transcription',
    start(context) {
      contexts.push(context);

      return {
        stop() {
          if (errorOnStop) {
            context.emitError('socket failed');
          }

          context.emitClose();
        },
      };
    },
  };

  return { contexts, plugin };
}

function renderTranscription(plugin: LiveAudioTranscriptionPlugin) {
  const plugins = [plugin];

  return renderHook(() => useLiveAudioTranscription({ plugins }));
}

describe('useLiveAudioTranscription', () => {
  it('ignores a socket error that fires during a finish stop', async () => {
    const { plugin } = createSocketPlugin({ errorOnStop: true });
    const { result } = renderTranscription(plugin);

    await act(() => result.current.start({ stream: {} as MediaStream }));
    expect(result.current.status).toBe('streaming');

    await act(() => result.current.stop({ mode: 'finish' }));

    expect(result.current.errorMessage).toBeNull();
    expect(result.current.status).toBe('stopped');
  });

  it('ignores a socket error that fires during a cancel stop', async () => {
    const { plugin } = createSocketPlugin({ errorOnStop: true });
    const { result } = renderTranscription(plugin);

    await act(() => result.current.start({ stream: {} as MediaStream }));
    await act(() => result.current.stop({ mode: 'cancel' }));

    expect(result.current.errorMessage).toBeNull();
    expect(result.current.status).toBe('stopped');
  });

  it('reports a socket error that fires while streaming', async () => {
    const { contexts, plugin } = createSocketPlugin();
    const { result } = renderTranscription(plugin);

    await act(() => result.current.start({ stream: {} as MediaStream }));
    act(() => contexts[0]?.emitError('socket failed'));

    expect(result.current.errorMessage).toBe('socket failed');
    expect(result.current.status).toBe('error');
  });

  it('reports errors again after a restart', async () => {
    const { contexts, plugin } = createSocketPlugin();
    const { result } = renderTranscription(plugin);

    await act(() => result.current.start({ stream: {} as MediaStream }));
    await act(() => result.current.stop({ mode: 'finish' }));
    await act(() => result.current.start({ stream: {} as MediaStream }));
    act(() => contexts[1]?.emitError('socket failed'));

    expect(result.current.errorMessage).toBe('socket failed');
  });
});

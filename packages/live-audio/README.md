# @bevyl-ai/live-audio

Realtime browser audio recording primitives from Bevyl.

`@bevyl-ai/live-audio` provides React hooks, waveform utilities, and lifecycle
ports for microphone capture, PCM waveform generation, realtime transcription,
and upload plugins. It is browser-first and keeps app transport details outside
the package.

The package does not send audio to Bevyl. Audio leaves the browser only through
plugins or callbacks that your application provides.

## Install

```bash
bun add @bevyl-ai/live-audio
```

React is a peer dependency. The package uses browser microphone APIs, `Blob`,
`File`, `MediaRecorder`, and WebSocket, so it should run in a browser client
component or equivalent client-only runtime.

## Quick Start

```tsx
'use client';

import { useLiveAudioRecordingSession } from '@bevyl-ai/live-audio';

export function Recorder() {
  const session = useLiveAudioRecordingSession({
    objectPath: 'recordings/demo',
    plugins: [],
    onCaptureUploaded(capture) {
      console.log('capture uploaded', capture);
    },
  });

  return (
    <div>
      <button disabled={session.isStarting} onClick={session.startCapture}>
        Start
      </button>
      <button onClick={session.stopCapture}>Stop</button>
      <p>{session.intakeState}</p>
    </div>
  );
}
```

## Plugins

Plugins own side effects such as transcription providers or uploads. The core
recorder calls lifecycle methods; your app decides where tokens, files, and
URLs come from.

```ts
import type { LiveAudioUploadPlugin } from '@bevyl-ai/live-audio';

export function createUploadPlugin(): LiveAudioUploadPlugin {
  return {
    id: 'upload',
    kind: 'upload',
    start() {
      return {
        async onCaptureComplete({ file, objectName }) {
          const url = await uploadFile({ file, objectName });

          return {
            audio: {
              objectName,
              url,
            },
          };
        },
      };
    },
  };
}
```

## Waveform Helpers

The package also exports the small zero-dependency waveform JSON helpers used by
the recorder.

```ts
import {
  AudioWaveformAccumulator,
  cropAudioWaveform,
} from '@bevyl-ai/live-audio';

const accumulator = new AudioWaveformAccumulator(48_000);

accumulator.addMonoSamples(Float32Array.from([0, 0.5, -0.5, 1]));

const waveform = accumulator.toWaveformJson();
const firstSecond = cropAudioWaveform(waveform, 0, 1);
```

## AssemblyAI

The AssemblyAI realtime plugin is exported as a subpath so the root package
stays provider-agnostic.

```ts
import { createAssemblyAiLiveAudioPlugin } from '@bevyl-ai/live-audio/plugins/assemblyai';

const assemblyAi = createAssemblyAiLiveAudioPlugin({
  async getToken() {
    const response = await fetch('/api/assemblyai-token');
    const body = await response.json();

    return body.token;
  },
});
```

Mint provider tokens on your own server. Do not put provider API keys in browser
code.

## Package Shape

- `src/session` contains `useLiveAudioRecordingSession` and
  `useLiveAudioRecorder`.
- `src/hooks` contains lower-level capture, transcription, upload, and waveform
  hooks.
- `src/plugins/contracts.ts` contains the `LiveAudioPlugin` lifecycle port.
- `src/plugins/assemblyai` contains the optional AssemblyAI provider plugin.

## Development

```bash
bun install
bun test
bun run typecheck
```

## License

MIT

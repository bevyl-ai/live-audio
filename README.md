# Bevyl Live Audio

Open-source realtime browser audio primitives from Bevyl.

This repository contains `@bevyl-ai/live-audio`: React hooks, waveform helpers,
and plugin lifecycle contracts for browser microphone recording, realtime
transcription, waveform capture, and upload side effects.

It does not send audio to Bevyl. Network behavior is owned by plugins supplied
by the consuming application.

## Install

```bash
bun add @bevyl-ai/live-audio
```

## Package

- [packages/live-audio](./packages/live-audio)

## Development

```bash
bun install
bun run typecheck
bun test
```

## Releasing

See [RELEASING.md](./RELEASING.md).

## Security

See [SECURITY.md](./SECURITY.md). Do not put provider API keys in browser code;
mint short-lived provider tokens server-side and pass those to the browser.

## License

MIT

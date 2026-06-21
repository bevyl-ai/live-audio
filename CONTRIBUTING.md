# Contributing

Thanks for taking a look.

This repository is intentionally small. Please keep changes focused on browser
audio capture, waveform generation, transcription-provider adapters, and the
plugin lifecycle contract.

## Development

```bash
bun install
bun run typecheck
bun test
```

## Pull Requests

- Keep provider-specific code behind explicit package subpaths.
- Keep application transport details out of the package.
- Do not add provider secrets, product routes, sample customer data, or private
  Bevyl app assumptions to tests or docs.
- Add tests for capture, waveform, transcription, and plugin lifecycle changes.

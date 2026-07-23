import { describe, expect, it } from 'vitest';

type BundleOutput = {
  kind: string;
  text: () => Promise<string>;
};

declare const Bun: {
  build: (options: {
    entrypoints: string[];
    format: 'esm';
    naming: string;
    splitting: boolean;
    target: 'browser';
  }) => Promise<{
    outputs: BundleOutput[];
    success: boolean;
  }>;
};

describe('browser bundle', () => {
  it('keeps the Mediabunny capture runtime out of the entry chunk', async () => {
    const build = await Bun.build({
      entrypoints: [new URL('../src/index.ts', import.meta.url).pathname],
      format: 'esm',
      naming: '[name]-[hash].[ext]',
      splitting: true,
      target: 'browser',
    });

    expect(build.success).toBe(true);

    const entryChunk = build.outputs.find(
      (output) => output.kind === 'entry-point',
    );
    const asyncChunks = build.outputs.filter(
      (output) => output.kind === 'chunk',
    );

    expect(entryChunk).toBeDefined();
    expect(await entryChunk!.text()).not.toContain('AudioSampleSink');
    expect(
      await Promise.all(
        asyncChunks.map(async (output) =>
          (await output.text()).includes('AudioSampleSink'),
        ),
      ),
    ).toContain(true);
  });
});

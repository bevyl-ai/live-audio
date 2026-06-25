import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const packageDir = path.join(repoRoot, "packages/live-audio");
const tempRoot = await mkdtemp(path.join(tmpdir(), "live-audio-pack-smoke-"));

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: process.env,
    encoding: "utf8",
    stdio: options.stdio ?? "pipe",
  });

  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
    throw new Error(
      `${command} ${args.join(" ")} failed with exit ${result.status}\n${output}`,
    );
  }

  return result;
}

try {
  run("npm", ["pack", "--pack-destination", tempRoot], { cwd: packageDir });

  const tarballName = (await readdir(tempRoot)).find((entry) =>
    entry.endsWith(".tgz"),
  );
  if (!tarballName) {
    throw new Error("npm pack did not produce a tarball.");
  }

  const consumerDir = path.join(tempRoot, "consumer");
  await mkdir(consumerDir);
  const consumerImportsPath = path.join(consumerDir, "consumer-imports.mjs");
  const consumerTypesPath = path.join(consumerDir, "consumer-types.ts");
  await writeFile(
    consumerImportsPath,
    `
const root = await import('@bevyl-ai/live-audio');
if (typeof root.useLiveAudioRecordingSession !== 'function') {
  throw new Error('Root export is missing useLiveAudioRecordingSession.');
}

const waveform = await import('@bevyl-ai/live-audio/audio-waveform');
if (typeof waveform.AudioWaveformAccumulator !== 'function') {
  throw new Error('Waveform subpath is missing AudioWaveformAccumulator.');
}

`.trimStart(),
  );
  await writeFile(
    consumerTypesPath,
    `
import { useLiveAudioRecordingSession } from '@bevyl-ai/live-audio';
import {
  AudioWaveformAccumulator,
  type AudioWaveformJson,
} from '@bevyl-ai/live-audio/audio-waveform';

const waveform: AudioWaveformJson = new AudioWaveformAccumulator(
  48_000,
).toWaveformJson();

void waveform;
void useLiveAudioRecordingSession;
`.trimStart(),
  );

  await writeFile(
    path.join(consumerDir, "package.json"),
    JSON.stringify({ type: "module", private: true }, null, 2),
  );

  run("npm", ["install", "--silent", path.join(tempRoot, tarballName)], {
    cwd: consumerDir,
  });
  run("node", [consumerImportsPath], {
    cwd: consumerDir,
    stdio: "inherit",
  });
  run(
    path.join(packageDir, "node_modules/.bin/tsc"),
    [
      "--module",
      "NodeNext",
      "--moduleResolution",
      "NodeNext",
      "--target",
      "ES2022",
      "--lib",
      "DOM,DOM.Iterable,ES2022",
      "--strict",
      "--skipLibCheck",
      "--noEmit",
      consumerTypesPath,
    ],
    { cwd: consumerDir, stdio: "inherit" },
  );
} finally {
  await rm(tempRoot, { force: true, recursive: true });
}

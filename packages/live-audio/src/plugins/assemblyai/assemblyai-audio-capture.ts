export type AssemblyAiAudioCapture = {
  readSamples: () => Float32Array;
  sampleRateHz: number;
  start: () => void;
  stop: () => void;
};

export type AssemblyAiAudioCaptureFactory = (input: {
  bufferSize: number;
  onSamples: (samples: Float32Array) => void;
  stream: MediaStream;
}) => AssemblyAiAudioCapture;

export function createWebAudioPcmCapture({
  bufferSize,
  onSamples,
  stream,
}: {
  bufferSize: number;
  onSamples: (samples: Float32Array) => void;
  stream: MediaStream;
}): AssemblyAiAudioCapture {
  const audioContext = new AudioContext();
  const sourceNode = audioContext.createMediaStreamSource(stream);
  const processorNode = audioContext.createScriptProcessor(bufferSize, 1, 1);
  const silentOutputNode = audioContext.createGain();
  const sampleBuffers: Float32Array[] = [];
  const connectionState = {
    isConnected: false,
    isStopped: false,
  };
  silentOutputNode.gain.value = 0;

  processorNode.onaudioprocess = (event) => {
    sampleBuffers.push(copyInputBufferToMono(event.inputBuffer));
    onSamples(sampleBuffers.at(-1)!);
  };

  return {
    readSamples() {
      return concatenateSampleBuffers(sampleBuffers);
    },
    sampleRateHz: audioContext.sampleRate,
    start() {
      if (connectionState.isConnected || connectionState.isStopped) {
        return;
      }

      sourceNode.connect(processorNode);
      processorNode.connect(silentOutputNode);
      silentOutputNode.connect(audioContext.destination);
      connectionState.isConnected = true;
      void audioContext.resume();
    },
    stop() {
      if (connectionState.isStopped) {
        return;
      }

      connectionState.isStopped = true;
      processorNode.onaudioprocess = null;

      if (connectionState.isConnected) {
        sourceNode.disconnect();
        processorNode.disconnect();
        silentOutputNode.disconnect();
      }

      void audioContext.close();
    },
  };
}

export function convertFloat32SamplesToPcm16(samples: Float32Array) {
  const pcm = new Int16Array(samples.length);

  for (
    // eslint-disable-next-line no-restricted-syntax -- sample index advances through PCM samples.
    let sampleIndex = 0;
    sampleIndex < samples.length;
    sampleIndex++
  ) {
    const sample = Math.max(-1, Math.min(1, samples[sampleIndex] ?? 0));
    pcm[sampleIndex] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }

  const bytes = new Uint8Array(pcm.byteLength);
  bytes.set(new Uint8Array(pcm.buffer));
  return bytes.buffer;
}

function copyInputBufferToMono(inputBuffer: AudioBuffer) {
  const frameCount = inputBuffer.length;
  const channelCount = inputBuffer.numberOfChannels;
  const monoSamples = new Float32Array(frameCount);

  for (
    // eslint-disable-next-line no-restricted-syntax -- frame index advances through live PCM frames.
    let frameIndex = 0;
    frameIndex < frameCount;
    frameIndex++
  ) {
    // eslint-disable-next-line no-restricted-syntax -- channel sum downmixes the current frame.
    let sum = 0;

    for (
      // eslint-disable-next-line no-restricted-syntax -- channel index advances through input channels.
      let channelIndex = 0;
      channelIndex < channelCount;
      channelIndex++
    ) {
      sum += inputBuffer.getChannelData(channelIndex)[frameIndex] ?? 0;
    }

    monoSamples[frameIndex] = sum / channelCount;
  }

  return monoSamples;
}

function concatenateSampleBuffers(sampleBuffers: readonly Float32Array[]) {
  const sampleCount = sampleBuffers.reduce(
    (totalSamples, samples) => totalSamples + samples.length,
    0,
  );
  const combinedSamples = new Float32Array(sampleCount);
  // eslint-disable-next-line no-restricted-syntax -- output offset advances across copied sample buffers.
  let offset = 0;

  sampleBuffers.forEach((samples) => {
    combinedSamples.set(samples, offset);
    offset += samples.length;
  });

  return combinedSamples;
}

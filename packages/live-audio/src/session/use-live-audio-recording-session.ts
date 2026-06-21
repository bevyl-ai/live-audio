'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type {
  LiveAudioRecorderOptions,
  LiveAudioRecorderState,
} from './recorder-types';
import { useLiveAudioRecorder } from './use-live-audio-recorder';

export type LiveAudioRecordingIntakeState =
  | 'idle'
  | 'requesting-permission'
  | 'active'
  | 'stopped';

export type LiveAudioRecordingSessionOptions = LiveAudioRecorderOptions & {
  mediaTrackConstraints?: boolean | MediaTrackConstraints;
};

function stopSessionStream(activeStream: MediaStream) {
  activeStream.getTracks().forEach((track) => track.stop());
}

export function useLiveAudioRecordingSession({
  mediaTrackConstraints = true,
  ...recorderOptions
}: LiveAudioRecordingSessionOptions) {
  const activeStreamRef = useRef<MediaStream | null>(null);
  const intakeStateRef = useRef<LiveAudioRecordingIntakeState>('idle');
  const startAttemptRef = useRef(0);
  const [intakeState, setIntakeState] =
    useState<LiveAudioRecordingIntakeState>('idle');
  const [sessionErrorMessage, setSessionErrorMessage] = useState<string | null>(
    null,
  );
  const recorder = useLiveAudioRecorder(recorderOptions);
  const recorderRef = useRef(recorder);

  useEffect(() => {
    recorderRef.current = recorder;
  }, [recorder]);

  const updateIntakeState = useCallback(
    (nextState: LiveAudioRecordingIntakeState) => {
      intakeStateRef.current = nextState;
      setIntakeState(nextState);
    },
    [],
  );

  const stopActiveStream = useCallback(() => {
    const activeStream = activeStreamRef.current;
    activeStreamRef.current = null;

    if (activeStream) {
      stopSessionStream(activeStream);
    }
  }, []);

  const stopSessionResources = useCallback(() => {
    recorderRef.current.stop();
    stopActiveStream();
  }, [stopActiveStream]);

  const resetCapture = useCallback(() => {
    startAttemptRef.current += 1;
    recorderRef.current.reset();
    stopActiveStream();
    setSessionErrorMessage(null);
    updateIntakeState('idle');
  }, [stopActiveStream, updateIntakeState]);

  const getDefaultStream = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Microphone capture is not available in this browser.');
    }

    return navigator.mediaDevices.getUserMedia({
      audio: mediaTrackConstraints,
    });
  }, [mediaTrackConstraints]);

  const startCapture = useCallback(async () => {
    const startAttempt = startAttemptRef.current + 1;
    startAttemptRef.current = startAttempt;
    recorderRef.current.reset();
    stopActiveStream();
    setSessionErrorMessage(null);
    updateIntakeState('requesting-permission');

    try {
      const stream = await getDefaultStream();

      if (startAttemptRef.current !== startAttempt) {
        stopSessionStream(stream);
        return false;
      }

      activeStreamRef.current = stream;
      updateIntakeState('active');

      const didStart = await recorderRef.current.start({
        stream,
      });

      if (!didStart) {
        stopActiveStream();
        updateIntakeState('idle');
      }

      return didStart;
    } catch (error) {
      stopActiveStream();

      if (startAttemptRef.current !== startAttempt) {
        return false;
      }

      updateIntakeState('idle');
      setSessionErrorMessage(
        error instanceof Error ? error.message : 'Live audio capture failed.',
      );
      return false;
    }
  }, [getDefaultStream, stopActiveStream, updateIntakeState]);

  const stopCapture = useCallback(() => {
    if (intakeStateRef.current === 'requesting-permission') {
      startAttemptRef.current += 1;
    }

    stopSessionResources();
    updateIntakeState(intakeStateRef.current === 'idle' ? 'idle' : 'stopped');
  }, [stopSessionResources, updateIntakeState]);

  useEffect(() => {
    return () => {
      startAttemptRef.current += 1;
      stopSessionResources();
    };
  }, [stopSessionResources]);

  const state = useMemo<LiveAudioRecorderState>(
    () => ({
      ...recorder.state,
      errorMessage: sessionErrorMessage ?? recorder.state.errorMessage,
    }),
    [recorder.state, sessionErrorMessage],
  );

  return {
    errorMessage: state.errorMessage,
    intakeState,
    isActive: intakeState === 'active',
    isStarting: intakeState === 'requesting-permission',
    pcmCapture: recorder.pcmCapture,
    realtimeUpload: recorder.realtimeUpload,
    recorder,
    resetCapture,
    startCapture,
    state,
    stopCapture,
    transcription: recorder.transcription,
  };
}

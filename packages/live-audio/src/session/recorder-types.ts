import type { LiveAudioCaptureCompleteEvent } from '../capture/complete-event';
import type { LiveAudioCaptureProgressEvent } from '../capture/mediabunny-pcm-capture';
import type { UseMediabunnyPcmCaptureOptions } from '../hooks/use-mediabunny-pcm-capture';
import type { LiveAudioPlugin } from '../plugins/contracts';
import type {
  LiveAudioRealtimeUploadCapture,
  LiveAudioRealtimeUploadClip,
} from '../realtime-upload/state';
import type { LiveAudioTranscriptionBatch } from '../transcription/transcription-batches';
import type { LiveAudioPreviewWaveform } from '../waveform/preview-waveform';

export type LiveAudioRecorderState = {
  completeEvent: LiveAudioCaptureCompleteEvent | null;
  errorMessage: string | null;
  isProcessingComplete: boolean;
  previewWaveform: LiveAudioPreviewWaveform;
  transcriptionBatches: readonly LiveAudioTranscriptionBatch[];
};

export type LiveAudioRecorderOptions = {
  batchClipRetryCount?: number;
  batchClipRetryDelayMs?: number;
  objectPath: string;
  onCaptureComplete?: (event: LiveAudioCaptureCompleteEvent) => void;
  onCaptureUploadError?: (errorMessage: string) => void;
  onCaptureUploaded?: (capture: LiveAudioRealtimeUploadCapture) => void;
  onClipUploaded?: (clip: LiveAudioRealtimeUploadClip) => void;
  onError?: (errorMessage: string) => void;
  onProcessingError?: (errorMessage: string) => void;
  onProgress?: (event: LiveAudioCaptureProgressEvent) => void;
  plugins: readonly LiveAudioPlugin[];
  progressIntervalMs?: UseMediabunnyPcmCaptureOptions['progressIntervalMs'];
};

import type { LiveAudioPlugin } from '../plugins/contracts';
import type {
  LiveAudioRealtimeUploadCapture,
  LiveAudioRealtimeUploadClip,
} from './state';

export type LiveAudioRealtimeUploadOptions = {
  objectPath: string;
  plugins: readonly LiveAudioPlugin[];
  onCaptureUploadError?: (errorMessage: string) => void;
  onCaptureUploaded?: (capture: LiveAudioRealtimeUploadCapture) => void;
  onClipUploaded?: (clip: LiveAudioRealtimeUploadClip) => void;
  onUploadError?: (errorMessage: string) => void;
};

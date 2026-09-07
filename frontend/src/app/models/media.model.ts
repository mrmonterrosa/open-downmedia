export interface FormatOption {
  id: string;
  label: string;
  ext: string;
  resolution?: string;
  filesize?: number;
  isAudioOnly?: boolean;
  isVideoOnly?: boolean;
}

export interface MediaInfo {
  id: string;
  title: string;
  thumbnail: string;
  duration?: number;
  durationString?: string;
  uploader?: string;
  uploaderUrl?: string;
  platform: string;
  description?: string;
  hasAudio: boolean;
  hasVideo: boolean;
  formats: FormatOption[];
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  details?: string;
}

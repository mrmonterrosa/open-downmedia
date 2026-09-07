export interface FormatOption {
  id: string;
  label: string;
  ext: string;
  resolution?: string;
  filesize?: number;
  isAudioOnly?: boolean;
  isVideoOnly?: boolean;
  isImage?: boolean;
  directUrl?: string;
}

export interface MediaImageItem {
  id: string;
  url: string;
  thumbnail: string;
  filename?: string;
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
  mediaType: 'video' | 'image' | 'carousel';
  hasAudio: boolean;
  hasVideo: boolean;
  hasImages: boolean;
  images?: MediaImageItem[];
  formats: FormatOption[];
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  details?: string;
}

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import YTDlpWrap from 'yt-dlp-wrap';
import ffmpegPath from 'ffmpeg-static';
import { ENV } from '../config/environment.js';

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
  formats: {
    id: string;
    label: string;
    ext: string;
    resolution?: string;
    filesize?: number;
    isAudioOnly?: boolean;
    isVideoOnly?: boolean;
  }[];
}

class YtDlpService {
  private ytdlp: YTDlpWrap | null = null;
  private binaryPath: string = '';
  private isReady: boolean = false;

  constructor() {
    this.initBinary();
  }

  public async initBinary(): Promise<void> {
    try {
      if (!fs.existsSync(ENV.BIN_DIR)) {
        fs.mkdirSync(ENV.BIN_DIR, { recursive: true });
      }
      if (!fs.existsSync(ENV.DOWNLOADS_DIR)) {
        fs.mkdirSync(ENV.DOWNLOADS_DIR, { recursive: true });
      }

      const isWindows = process.platform === 'win32';
      const binaryName = isWindows ? 'yt-dlp.exe' : 'yt-dlp';
      const localBin = path.join(ENV.BIN_DIR, binaryName);

      if (fs.existsSync(localBin)) {
        this.binaryPath = localBin;
      } else {
        // Intentar descargar usando curl
        console.log(`[yt-dlp] Descargando la última versión del binario de yt-dlp...`);
        try {
          const downloadUrl = isWindows
            ? 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
            : 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';
          execSync(`curl.exe -L -o "${localBin}" "${downloadUrl}"`, { stdio: 'ignore' });
          if (!isWindows) {
            fs.chmodSync(localBin, '755');
          }
          this.binaryPath = localBin;
          console.log(`[yt-dlp] Binario descargado exitosamente en: ${this.binaryPath}`);
        } catch {
          // Si curl falla, intentar con YTDlpWrap o buscar en PATH
          try {
            await YTDlpWrap.downloadFromGithub(localBin);
            this.binaryPath = localBin;
          } catch {
            this.binaryPath = 'yt-dlp';
          }
        }
      }

      this.ytdlp = new YTDlpWrap(this.binaryPath);
      const version = await this.ytdlp.getVersion();
      console.log(`[yt-dlp] Motor listo y verificado. Versión: ${version.trim()}`);
      this.isReady = true;
    } catch (error) {
      console.error(`[yt-dlp] Error inicializando el servicio:`, error);
      this.ytdlp = new YTDlpWrap();
      this.isReady = false;
    }
  }

  public async checkHealth(): Promise<{ ready: boolean; version?: string; ffmpeg: boolean }> {
    try {
      const version = this.ytdlp ? await this.ytdlp.getVersion() : 'No disponible';
      return {
        ready: this.isReady,
        version: version?.trim(),
        ffmpeg: !!ffmpegPath && fs.existsSync(ffmpegPath),
      };
    } catch {
      return {
        ready: false,
        ffmpeg: !!ffmpegPath,
      };
    }
  }

  private detectPlatform(url: string, extractor?: string): string {
    const u = url.toLowerCase();
    if (u.includes('tiktok.com')) return 'TikTok';
    if (u.includes('instagram.com')) return 'Instagram';
    if (u.includes('youtube.com') || u.includes('youtu.be')) return 'YouTube';
    if (u.includes('twitter.com') || u.includes('x.com')) return 'X / Twitter';
    if (u.includes('threads.net')) return 'Threads';
    if (u.includes('facebook.com') || u.includes('fb.watch')) return 'Facebook';
    if (u.includes('reddit.com')) return 'Reddit';
    if (u.includes('pinterest.com') || u.includes('pin.it')) return 'Pinterest';
    return extractor || 'Web';
  }

  public async getInfo(url: string): Promise<MediaInfo> {
    if (!this.ytdlp) {
      throw new Error('El motor yt-dlp aún no está listo.');
    }

    const jsonOutput = await this.ytdlp.execPromise([
      '--dump-json',
      '--no-warnings',
      '--no-playlist',
      url,
    ]);

    const rawMetadata: any = JSON.parse(jsonOutput);

    const platform = this.detectPlatform(url, rawMetadata.extractor_key || rawMetadata.extractor);

    let durationString = '';
    if (rawMetadata.duration) {
      const secs = Math.floor(rawMetadata.duration);
      const m = Math.floor(secs / 60);
      const s = secs % 60;
      durationString = `${m}:${s < 10 ? '0' : ''}${s}`;
    }

    const formatsList = [
      {
        id: 'video_hd',
        label: platform === 'TikTok' ? 'Video MP4 HD (Sin Marca de Agua)' : 'Video MP4 HD (Mejor Calidad)',
        ext: 'mp4',
        resolution: rawMetadata.resolution || (rawMetadata.width && rawMetadata.height ? `${rawMetadata.width}x${rawMetadata.height}` : 'HD'),
        isAudioOnly: false,
      },
      {
        id: 'video_sd',
        label: 'Video MP4 (Rápido / Ligero)',
        ext: 'mp4',
        resolution: 'SD',
        isAudioOnly: false,
      },
      {
        id: 'audio_mp3',
        label: 'Solo Audio (MP3)',
        ext: 'mp3',
        isAudioOnly: true,
      },
      {
        id: 'audio_m4a',
        label: 'Solo Audio (M4A Original)',
        ext: 'm4a',
        isAudioOnly: true,
      },
    ];

    return {
      id: rawMetadata.id || 'media',
      title: rawMetadata.title || 'Video sin título',
      thumbnail: rawMetadata.thumbnail || (rawMetadata.thumbnails?.[0]?.url ?? ''),
      duration: rawMetadata.duration,
      durationString,
      uploader: rawMetadata.uploader || rawMetadata.channel || rawMetadata.creator || 'Autor desconocido',
      uploaderUrl: rawMetadata.uploader_url,
      platform,
      description: rawMetadata.description ? rawMetadata.description.slice(0, 200) + '...' : undefined,
      hasAudio: true,
      hasVideo: !rawMetadata.is_live,
      formats: formatsList,
    };
  }

  public getDownloadArgs(url: string, format: string, outputTemplate: string): string[] {
    const args = [
      url,
      '-o', outputTemplate,
      '--no-playlist',
      '--no-warnings',
    ];

    if (ffmpegPath && fs.existsSync(ffmpegPath)) {
      args.push('--ffmpeg-location', ffmpegPath);
    }

    if (format === 'audio_mp3') {
      args.push('-x', '--audio-format', 'mp3', '--audio-quality', '0');
    } else if (format === 'audio_m4a') {
      args.push('-f', 'ba[ext=m4a]/ba/b', '-x');
    } else if (format === 'video_sd') {
      args.push('-f', 'bv*[height<=720]+ba/b[height<=720]/b', '--merge-output-format', 'mp4');
    } else {
      args.push('-f', 'bv*+ba/b', '--merge-output-format', 'mp4');
    }

    return args;
  }

  public executeDownload(args: string[]): any {
    if (!this.ytdlp) throw new Error('yt-dlp no inicializado');
    return this.ytdlp.exec(args);
  }
}

export const ytdlpService = new YtDlpService();

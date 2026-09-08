import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import YTDlpWrap from 'yt-dlp-wrap';
import ffmpegPath from 'ffmpeg-static';
import { ENV } from '../config/environment.js';
import { imageExtractorService } from './image.service.js';

export interface MediaImageItem {
  id: string;
  url: string;
  thumbnail: string;
  filename?: string;
}

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

export function extractRealMediaPayload(itemUrl: string): { realUrl: string; filename: string; headers?: Record<string, string> } {
  try {
    if (itemUrl && itemUrl.includes('token=')) {
      const match = itemUrl.match(/token=([^\&]+)/);
      if (match) {
        const parts = match[1].split('.');
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
        if (payload.url) {
          return {
            realUrl: payload.url,
            filename: payload.filename || 'photo.jpg',
            headers: payload.headers || { 'user-agent': 'TelegramBot (like TwitterBot)' },
          };
        }
      }
    }
  } catch {}
  return { realUrl: itemUrl, filename: 'photo.jpg' };
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
          console.log(`[yt-dlp] Binario instalado en: ${this.binaryPath}`);
        } catch {
          this.binaryPath = 'yt-dlp';
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

  /**
   * Extracción especializada para publicaciones de Instagram (fotos, carruseles y videos)
   */
  private async extractInstagram(url: string): Promise<MediaInfo | null> {
    try {
      const { igdl } = await import('btch-downloader');
      const res: any = await igdl(url);

      if (res && res.result && Array.isArray(res.result) && res.result.length > 0) {
        // Filtrar elementos únicos decodificando la URL real de cada uno
        const uniqueItems: { realUrl: string; filename: string; originalItem: any }[] = [];
        const seen = new Set<string>();

        for (const item of res.result) {
          if (item && item.url) {
            const payload = extractRealMediaPayload(item.url);
            if (!seen.has(payload.realUrl)) {
              seen.add(payload.realUrl);
              uniqueItems.push({
                realUrl: payload.realUrl,
                filename: payload.filename,
                originalItem: item,
              });
            }
          }
        }

        if (uniqueItems.length > 0) {
          const isCarousel = uniqueItems.length > 1;

          // Construir lista con la URL proxy para que el navegador muestre cada miniatura sin bloqueos de CORS/Referer
          const imagesList: MediaImageItem[] = uniqueItems.map((it, idx) => {
            const proxyThumb = `/api/media/image-proxy?url=${encodeURIComponent(it.realUrl)}`;
            return {
              id: `img_${idx}`,
              url: it.realUrl,
              thumbnail: proxyThumb,
              filename: it.filename && it.filename.startsWith('open_downmedia_')
                ? it.filename
                : `open_downmedia_${it.filename || `instagram_photo_${idx + 1}.jpg`}`,
            };
          });

          const formatsList: FormatOption[] = [];

          if (isCarousel) {
            formatsList.push({
              id: 'image_all',
              label: `Descargar Álbum Completo (ZIP - ${uniqueItems.length} Fotos)`,
              ext: 'zip',
              isImage: true,
            });
          }

          imagesList.forEach((it, idx) => {
            formatsList.push({
              id: `image_${idx}`,
              label: isCarousel ? `Foto ${idx + 1} en Alta Calidad` : 'Foto en Alta Calidad (JPG)',
              ext: 'jpg',
              isImage: true,
              directUrl: it.url,
            });
          });

          return {
            id: `ig_${Date.now()}`,
            title: `Publicación de Instagram (${uniqueItems.length} ${uniqueItems.length > 1 ? 'elementos' : 'foto'})`,
            thumbnail: imagesList[0].thumbnail,
            uploader: 'Instagram User',
            platform: 'Instagram',
            mediaType: isCarousel ? 'carousel' : 'image',
            hasAudio: false,
            hasVideo: false,
            hasImages: true,
            images: imagesList,
            formats: formatsList,
          };
        }
      }
    } catch (igErr) {
      console.warn('[Instagram Scraper] Error extrayendo publicación:', igErr);
    }
    return null;
  }

  public async getInfo(url: string): Promise<MediaInfo> {
    const platform = this.detectPlatform(url);

    // Si es Pinterest o un enlace con patrón explícito de fotos/galerías, intentar extracción directa de imágenes primero
    const isPhotoPattern = url.includes('/photo/') || url.includes('/photos/') || url.includes('/gallery/') || platform === 'Pinterest';
    if (isPhotoPattern) {
      console.log(`[getInfo] URL identificada con patrón de fotos/galería (${platform}), buscando imágenes directamente...`);
      const imgRes = await imageExtractorService.extractUniversalImages(url, platform);
      if (imgRes) {
        return imgRes;
      }
    }

    if (platform === 'Instagram') {
      const igResult = await imageExtractorService.extractInstagram(url);
      if (igResult) {
        return igResult;
      }
    }

    if (platform === 'Reddit') {
      const rdResult = await imageExtractorService.extractReddit(url);
      if (rdResult) {
        return rdResult;
      }
    }

    if (!this.ytdlp) {
      throw new Error('El motor yt-dlp aún no está listo.');
    }

    try {
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        throw new Error('Protocolo de URL no válido');
      }

      const jsonOutput = await this.ytdlp.execPromise([
        '--dump-json',
        '--no-warnings',
        '--no-playlist',
        '--',
        url,
      ]);

      const rawMetadata: any = JSON.parse(jsonOutput);
      const detectedPlatform = this.detectPlatform(url, rawMetadata.extractor_key || rawMetadata.extractor);

      let durationString = '';
      if (rawMetadata.duration) {
        const secs = Math.floor(rawMetadata.duration);
        const m = Math.floor(secs / 60);
        const s = secs % 60;
        durationString = `${m}:${s < 10 ? '0' : ''}${s}`;
      }

      const formatsList: FormatOption[] = [
        {
          id: 'video_hd',
          label: detectedPlatform === 'TikTok' ? 'Video MP4 HD (Sin Marca de Agua)' : 'Video MP4 HD (Mejor Calidad)',
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
        platform: detectedPlatform,
        description: rawMetadata.description ? rawMetadata.description.slice(0, 200) + '...' : undefined,
        mediaType: 'video',
        hasAudio: true,
        hasVideo: !rawMetadata.is_live,
        hasImages: false,
        formats: formatsList,
      };
    } catch (ytdlpError: any) {
      const errMsg = ytdlpError?.message || '';

      // Si yt-dlp indica ausencia de video o error en formatos, activar rescate universal de imágenes
      console.log(`[getInfo] yt-dlp no localizó video para ${url}. Error: ${errMsg.slice(0, 80)}. Activando rescate universal de fotos/carrusel...`);
      const imageResult = await imageExtractorService.extractUniversalImages(url, platform);
      if (imageResult) {
        return imageResult;
      }

      throw ytdlpError;
    }
  }

  public getDownloadArgs(url: string, format: string, outputTemplate: string): string[] {
    const args = [
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

    // Delimitador estándar '--' para prevenir inyección de opciones/flags CLI
    args.push('--', url);

    return args;
  }

  public executeDownload(args: string[]): any {
    if (!this.ytdlp) throw new Error('yt-dlp no inicializado');
    return this.ytdlp.exec(args);
  }
}

export const ytdlpService = new YtDlpService();

import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import { ytdlpService } from '../services/ytdlp.service.js';
import { ENV } from '../config/environment.js';

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\-\. ]/g, '_').trim() || 'media_download';
}

const COMMON_IMAGE_HEADERS = {
  'user-agent': 'TelegramBot (like TwitterBot)',
  'accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
  'referer': 'https://www.instagram.com/',
};

export const mediaController = {
  async getHealth(req: Request, res: Response): Promise<void> {
    const health = await ytdlpService.checkHealth();
    res.json({
      status: 'ok',
      service: 'open-downmedia-api',
      timestamp: new Date().toISOString(),
      ytdlp: health,
    });
  },

  async imageProxy(req: Request, res: Response): Promise<void> {
    try {
      const imageUrl = req.query.url as string;
      if (!imageUrl) {
        res.status(400).send('URL requerida');
        return;
      }

      const fetchRes = await fetch(imageUrl, { headers: COMMON_IMAGE_HEADERS });

      if (!fetchRes.ok) {
        res.status(fetchRes.status).send('Error al cargar la imagen desde el CDN.');
        return;
      }

      const arrayBuffer = await fetchRes.arrayBuffer();
      res.setHeader('Content-Type', fetchRes.headers.get('content-type') || 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.send(Buffer.from(arrayBuffer));
    } catch (err) {
      console.error('[Image Proxy] Error:', err);
      res.status(500).send('Error procesando imagen');
    }
  },

  async extractInfo(req: Request, res: Response): Promise<void> {
    try {
      const { url } = req.body;
      if (!url) {
        res.status(400).json({ success: false, error: 'URL requerida' });
        return;
      }

      console.log(`[Controller] Extrayendo metadatos para: ${url}`);
      const info = await ytdlpService.getInfo(url);
      res.json({ success: true, data: info });
    } catch (error: any) {
      console.error(`[Controller] Error extrayendo info:`, error?.message || error);
      res.status(500).json({
        success: false,
        error: 'No se pudo procesar la URL. Asegúrate de que la publicación sea pública y válida.',
        details: process.env.NODE_ENV === 'development' ? error?.message : undefined,
      });
    }
  },

  async downloadMedia(req: Request, res: Response): Promise<void> {
    const url = req.query.url as string;
    const format = (req.query.format as string) || 'video_hd';
    const directUrl = req.query.directUrl as string | undefined;

    if (!url) {
      res.status(400).json({ success: false, error: 'URL requerida' });
      return;
    }

    // 1. Manejo de descarga de todas las imágenes en un archivo ZIP
    if (format === 'image_all') {
      try {
        console.log(`[Download ZIP] Empaquetando álbum completo de fotos para: ${url}`);
        const info = await ytdlpService.getInfo(url);

        if (!info.images || info.images.length === 0) {
          res.status(404).json({ success: false, error: 'No se encontraron imágenes en esta publicación.' });
          return;
        }

        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', 'attachment; filename="open_downmedia_album.zip"');

        const zip = (archiver as any).ZipArchive
          ? new (archiver as any).ZipArchive()
          : (archiver as any)('zip');
        zip.pipe(res);

        for (let i = 0; i < info.images.length; i++) {
          const imgItem = info.images[i];
          try {
            const fetchRes = await fetch(imgItem.url, { headers: COMMON_IMAGE_HEADERS });
            if (fetchRes.ok) {
              const buffer = Buffer.from(await fetchRes.arrayBuffer());
              zip.append(buffer, { name: `foto_${i + 1}.jpg` });
            }
          } catch (itemErr) {
            console.warn(`[Download ZIP] Error descargando foto ${i + 1}:`, itemErr);
          }
        }

        await zip.finalize();
        console.log(`[Download ZIP] Álbum de ${info.images.length} fotos transmitido con éxito.`);
        return;
      } catch (zipErr) {
        console.error(`[Download ZIP] Error creando archivo ZIP:`, zipErr);
        if (!res.headersSent) {
          res.status(500).json({ success: false, error: 'Error al generar el archivo ZIP de imágenes.' });
        }
        return;
      }
    }

    // 2. Manejo de descarga de una imagen individual específica
    if (format.startsWith('image_') || directUrl) {
      try {
        let imageUrl = directUrl;
        let photoIndex = 1;

        if (format.startsWith('image_')) {
          const parsedIndex = parseInt(format.replace('image_', ''), 10);
          photoIndex = isNaN(parsedIndex) ? 1 : parsedIndex + 1;
        }

        if (!imageUrl) {
          const info = await ytdlpService.getInfo(url);
          const index = photoIndex - 1;
          imageUrl = info.images?.[index]?.url;
        }

        if (!imageUrl) {
          res.status(404).json({ success: false, error: 'URL de imagen no encontrada.' });
          return;
        }

        console.log(`[Download Image] Transmitiendo foto ${photoIndex}...`);
        const fetchRes = await fetch(imageUrl, { headers: COMMON_IMAGE_HEADERS });

        if (!fetchRes.ok) {
          res.status(fetchRes.status).json({ success: false, error: 'No se pudo descargar la imagen desde el CDN.' });
          return;
        }

        const buffer = Buffer.from(await fetchRes.arrayBuffer());
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Content-Disposition', `attachment; filename="foto_${photoIndex}.jpg"`);
        res.send(buffer);
        return;
      } catch (imgErr) {
        console.error(`[Download Image] Error descargando imagen:`, imgErr);
        if (!res.headersSent) {
          res.status(500).json({ success: false, error: 'Error al descargar la imagen.' });
        }
        return;
      }
    }

    // 3. Manejo de descarga de Videos y Audios mediante yt-dlp
    const isAudio = format.startsWith('audio');
    const ext = isAudio ? (format === 'audio_mp3' ? 'mp3' : 'm4a') : 'mp4';

    const downloadId = `down_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const outputTemplate = path.join(ENV.DOWNLOADS_DIR, `${downloadId}.%(ext)s`);

    console.log(`[Download Video] Procesando video con yt-dlp: ${url} (Formato: ${format})`);

    try {
      const args = ytdlpService.getDownloadArgs(url, format, outputTemplate);
      const downloadProcess = ytdlpService.executeDownload(args);

      downloadProcess.on('error', (err: any) => {
        console.error(`[Download Video] Error en yt-dlp:`, err);
        if (!res.headersSent) {
          res.status(500).json({ success: false, error: 'Error durante la descarga del video.' });
        }
      });

      downloadProcess.on('close', () => {
        try {
          const files = fs.readdirSync(ENV.DOWNLOADS_DIR);
          const matchedFile = files.find((f) => f.startsWith(downloadId));

          if (!matchedFile) {
            console.error(`[Download Video] Archivo no encontrado con prefijo ${downloadId}`);
            if (!res.headersSent) {
              res.status(500).json({ success: false, error: 'Archivo no encontrado tras la descarga.' });
            }
            return;
          }

          const filePath = path.join(ENV.DOWNLOADS_DIR, matchedFile);
          const downloadFilename = sanitizeFilename(`open_downmedia_${downloadId.split('_')[1]}.${ext}`);

          res.download(filePath, downloadFilename, (downloadErr) => {
            try {
              if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                console.log(`[Download Video] Archivo temporal eliminado: ${matchedFile}`);
              }
            } catch (cleanupErr) {
              console.warn(`[Download Video] Error eliminando archivo temporal:`, cleanupErr);
            }

            if (downloadErr && !res.headersSent) {
              console.error(`[Download Video] Error transmitiendo archivo al cliente:`, downloadErr);
            }
          });
        } catch (readErr) {
          console.error(`[Download Video] Error buscando archivo:`, readErr);
          if (!res.headersSent) {
            res.status(500).json({ success: false, error: 'Error procesando el archivo final.' });
          }
        }
      });
    } catch (error: any) {
      console.error(`[Download Video] Error general:`, error);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: 'Error al iniciar la descarga.' });
      }
    }
  },
};

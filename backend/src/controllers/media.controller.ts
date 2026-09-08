import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import { ytdlpService } from '../services/ytdlp.service.js';
import { getImageHeaders } from '../services/image.service.js';
import { downloadControlService } from '../services/download-control.service.js';
import { ENV } from '../config/environment.js';

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\-\. ]/g, '_').trim() || 'media_download';
}

async function fetchImageBuffer(imageUrl: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  try {
    const headers = getImageHeaders(imageUrl);
    let fetchRes = await fetch(imageUrl, { headers });

    let contentType = fetchRes.headers.get('content-type') || '';
    if (contentType.includes('text/html') || fetchRes.status >= 400) {
      const fallbackHeaders = {
        ...headers,
        'user-agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
        'referer': 'https://www.facebook.com/',
      };
      const retryRes = await fetch(imageUrl, { headers: fallbackHeaders });
      if (retryRes.ok && (retryRes.headers.get('content-type') || '').startsWith('image/')) {
        fetchRes = retryRes;
        contentType = retryRes.headers.get('content-type') || 'image/jpeg';
      }
    }

    if (!fetchRes.ok) return null;

    contentType = fetchRes.headers.get('content-type') || 'image/jpeg';
    if (contentType.includes('text/html')) return null;

    const arrayBuffer = await fetchRes.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      contentType,
    };
  } catch (e) {
    console.error(`[fetchImageBuffer] Error obteniendo imagen (${imageUrl}):`, e);
    return null;
  }
}

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

      const imgData = await fetchImageBuffer(imageUrl);
      if (!imgData) {
        res.status(502).send('No se pudo cargar la imagen desde el CDN.');
        return;
      }

      res.setHeader('Content-Type', imgData.contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.send(imgData.buffer);
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

      // 1. Revisar si la metadata ya está almacenada en la memoria caché
      const cached = downloadControlService.getCachedInfo(url);
      if (cached) {
        res.json({ success: true, data: cached, fromCache: true });
        return;
      }

      console.log(`[Controller] Extrayendo metadatos para: ${url}`);
      const info = await ytdlpService.getInfo(url);

      // 2. Guardar en memoria caché para peticiones concurrentes o repetidas
      downloadControlService.setCachedInfo(url, info);

      res.json({ success: true, data: info, fromCache: false });
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
    let url = (req.query.url as string) || '';
    let format = (req.query.format as string) || '';
    let directUrl = req.query.directUrl as string | undefined;
    const base64Param = (req.query.base64 || req.query.b64) as string | undefined;
    const requestedFilename = req.query.filename as string | undefined;

    // Si viene el parámetro base64 (ej: /api/media/download?base64=...)
    if (base64Param) {
      try {
        const decoded = Buffer.from(base64Param.trim(), 'base64').toString('utf-8').trim();
        if (decoded.startsWith('{') && decoded.endsWith('}')) {
          const parsed = JSON.parse(decoded);
          if (parsed.url && !url) url = parsed.url;
          if (parsed.directUrl && !directUrl) directUrl = parsed.directUrl;
          if (parsed.format && !format) format = parsed.format;
        } else if (decoded.startsWith('http://') || decoded.startsWith('https://')) {
          // El parámetro base64 contiene directamente la URL de la imagen/recurso
          directUrl = decoded;
          if (!url) url = decoded;
          if (!format) format = 'image_0';
        }
      } catch (e) {
        console.warn('[Download Media] Error decodificando parámetro base64:', e);
      }
    }

    // Si directUrl vino codificado en base64 en vez de URL plana
    if (directUrl && !directUrl.startsWith('http://') && !directUrl.startsWith('https://')) {
      try {
        const decodedDirect = Buffer.from(directUrl.trim(), 'base64').toString('utf-8').trim();
        if (decodedDirect.startsWith('http://') || decodedDirect.startsWith('https://')) {
          directUrl = decodedDirect;
        }
      } catch {}
    }

    if (!format) {
      format = directUrl ? 'image_0' : 'video_hd';
    }

    if (!url && !directUrl) {
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
            const imgData = await fetchImageBuffer(imgItem.url);
            if (imgData) {
              const fileExt = imgData.contentType.includes('png') ? 'png' : 'jpg';
              zip.append(imgData.buffer, { name: `foto_${i + 1}.${fileExt}` });
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

        if (!imageUrl && url) {
          const info = await ytdlpService.getInfo(url);
          const index = photoIndex - 1;
          imageUrl = info.images?.[index]?.url;
        }

        if (!imageUrl) {
          res.status(404).json({ success: false, error: 'URL de imagen no encontrada.' });
          return;
        }

        console.log(`[Download Image] Transmitiendo foto ${photoIndex}...`);
        const imgData = await fetchImageBuffer(imageUrl);

        if (!imgData) {
          res.status(502).json({ success: false, error: 'No se pudo descargar la imagen desde el CDN.' });
          return;
        }

        const ext = imgData.contentType.includes('png') ? 'png' : (imgData.contentType.includes('webp') ? 'webp' : 'jpg');
        const filename = requestedFilename
          ? sanitizeFilename(requestedFilename)
          : `foto_${photoIndex}.${ext}`;

        res.setHeader('Content-Type', imgData.contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(imgData.buffer);
        return;
      } catch (imgErr) {
        console.error(`[Download Image] Error descargando imagen:`, imgErr);
        if (!res.headersSent) {
          res.status(500).json({ success: false, error: 'Error al descargar la imagen.' });
        }
        return;
      }
    }

    // 3. Manejo de descarga de Videos y Audios mediante yt-dlp (Control de Concurrencia y Saturación)
    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '127.0.0.1';
    const slot = downloadControlService.acquireSlot(clientIp);

    if (!slot.allowed) {
      if (slot.retryAfter) {
        res.setHeader('Retry-After', slot.retryAfter.toString());
      }
      res.status(slot.status || 429).json({
        success: false,
        error: slot.error,
        retryAfter: slot.retryAfter,
      });
      return;
    }

    let slotReleased = false;
    const safeRelease = (success = true) => {
      if (!slotReleased) {
        slotReleased = true;
        downloadControlService.releaseSlot(clientIp, success);
      }
    };

    // Validar duración máxima del video antes de iniciar la conversión
    const cachedMedia = downloadControlService.getCachedInfo(url);
    if (cachedMedia?.duration && !downloadControlService.isDurationAllowed(cachedMedia.duration)) {
      safeRelease(false);
      res.status(400).json({
        success: false,
        error: `El video excede la duración máxima permitida (${Math.floor(downloadControlService.MAX_VIDEO_DURATION_SECONDS / 60)} minutos) para proteger el rendimiento del servidor.`,
      });
      return;
    }

    const isAudio = format.startsWith('audio');
    const ext = isAudio ? (format === 'audio_mp3' ? 'mp3' : 'm4a') : 'mp4';

    const downloadId = `down_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const outputTemplate = path.join(ENV.DOWNLOADS_DIR, `${downloadId}.%(ext)s`);

    console.log(`[Download Video] Procesando video con yt-dlp: ${url} (Formato: ${format}, IP: ${clientIp})`);

    try {
      const args = ytdlpService.getDownloadArgs(url, format, outputTemplate);
      const downloadProcess = ytdlpService.executeDownload(args);

      downloadProcess.on('error', (err: any) => {
        console.error(`[Download Video] Error en yt-dlp:`, err);
        safeRelease(false);
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
            safeRelease(false);
            if (!res.headersSent) {
              res.status(500).json({ success: false, error: 'Archivo no encontrado tras la descarga.' });
            }
            return;
          }

          const filePath = path.join(ENV.DOWNLOADS_DIR, matchedFile);
          const downloadFilename = sanitizeFilename(`open_downmedia_${downloadId.split('_')[1]}.${ext}`);

          res.download(filePath, downloadFilename, (downloadErr) => {
            safeRelease(!downloadErr);
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
          safeRelease(false);
          if (!res.headersSent) {
            res.status(500).json({ success: false, error: 'Error procesando el archivo final.' });
          }
        }
      });
    } catch (error: any) {
      console.error(`[Download Video] Error general:`, error);
      safeRelease(false);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: 'Error al iniciar la descarga.' });
      }
    }
  },

  getMetrics(req: Request, res: Response): void {
    const token = (req.headers['x-admin-token'] as string) || (req.query.token as string);
    const expectedToken = process.env.ADMIN_SECRET_KEY || 'opendownmedia_admin_2026';

    if (process.env.NODE_ENV === 'production' && token !== expectedToken) {
      res.status(401).json({ success: false, error: 'Acceso no autorizado a las métricas del sistema.' });
      return;
    }

    const metrics = downloadControlService.getMetrics();
    res.json({ success: true, data: metrics });
  },
};

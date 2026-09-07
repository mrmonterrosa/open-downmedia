import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { ytdlpService } from '../services/ytdlp.service.js';
import { ENV } from '../config/environment.js';

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\-\. ]/g, '_').trim() || 'media_download';
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
        error: 'No se pudo procesar la URL. Asegúrate de que el enlace sea público y válido.',
        details: process.env.NODE_ENV === 'development' ? error?.message : undefined,
      });
    }
  },

  async downloadMedia(req: Request, res: Response): Promise<void> {
    const url = req.query.url as string;
    const format = (req.query.format as string) || 'video_hd';
    const isAudio = format.startsWith('audio');
    const ext = isAudio ? (format === 'audio_mp3' ? 'mp3' : 'm4a') : 'mp4';

    if (!url) {
      res.status(400).json({ success: false, error: 'URL requerida' });
      return;
    }

    const downloadId = `down_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const outputTemplate = path.join(ENV.DOWNLOADS_DIR, `${downloadId}.%(ext)s`);

    console.log(`[Download] Iniciando procesamiento de ${url} (Formato: ${format})`);

    try {
      const args = ytdlpService.getDownloadArgs(url, format, outputTemplate);
      const downloadProcess = ytdlpService.executeDownload(args);

      downloadProcess.on('error', (err: any) => {
        console.error(`[Download] Error en yt-dlp:`, err);
        if (!res.headersSent) {
          res.status(500).json({ success: false, error: 'Error durante la descarga del archivo.' });
        }
      });

      downloadProcess.on('close', () => {
        // Buscar el archivo resultante en el directorio temporal
        try {
          const files = fs.readdirSync(ENV.DOWNLOADS_DIR);
          const matchedFile = files.find((f) => f.startsWith(downloadId));

          if (!matchedFile) {
            console.error(`[Download] Archivo descargado no encontrado con prefijo ${downloadId}`);
            if (!res.headersSent) {
              res.status(500).json({ success: false, error: 'Archivo no encontrado tras la descarga.' });
            }
            return;
          }

          const filePath = path.join(ENV.DOWNLOADS_DIR, matchedFile);
          const downloadFilename = sanitizeFilename(`open_downmedia_${downloadId.split('_')[1]}.${ext}`);

          res.download(filePath, downloadFilename, (downloadErr) => {
            // Limpieza automática del archivo temporal tras finalizar o fallar
            try {
              if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                console.log(`[Download] Archivo temporal eliminado: ${matchedFile}`);
              }
            } catch (cleanupErr) {
              console.warn(`[Download] Error eliminando archivo temporal:`, cleanupErr);
            }

            if (downloadErr && !res.headersSent) {
              console.error(`[Download] Error transmitiendo archivo al cliente:`, downloadErr);
            }
          });
        } catch (readErr) {
          console.error(`[Download] Error buscando archivo:`, readErr);
          if (!res.headersSent) {
            res.status(500).json({ success: false, error: 'Error procesando el archivo final.' });
          }
        }
      });
    } catch (error: any) {
      console.error(`[Download] Error general:`, error);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: 'Error al iniciar la descarga.' });
      }
    }
  },
};

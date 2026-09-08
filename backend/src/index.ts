import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import fs from 'fs';
import path from 'path';
import { ENV } from './config/environment.js';
import { mediaController } from './controllers/media.controller.js';
import {
  urlSecurityMiddleware,
  imageProxySecurityMiddleware,
  infoRateLimiter,
  downloadRateLimiter,
  imageProxyRateLimiter,
  adminRateLimiter,
} from './middleware/security.js';

const app = express();

// Habilitar trust proxy para reverse proxies (Nginx / Docker / Dokploy)
app.set('trust proxy', 1);

// Seguridad con Helmet (protección de cabeceras HTTP)
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// Función auxiliar para parsear orígenes CORS con o sin protocolo (ej: https:// o dominio directo)
function parseAllowedOrigins(corsEnv: string): (string | RegExp)[] | boolean {
  if (!corsEnv || corsEnv.trim() === '*') return true;

  const rawList = corsEnv.split(',').map((o) => o.trim()).filter(Boolean);
  const origins: string[] = ['http://localhost:4200', 'http://localhost:8080'];

  for (const item of rawList) {
    if (item.startsWith('http://') || item.startsWith('https://')) {
      origins.push(item);
    } else {
      // Si se especificó el dominio sin protocolo (ej: open-downmedia.cgmo.net)
      origins.push(`https://${item}`);
      origins.push(`http://${item}`);
    }
  }
  return origins;
}

// CORS configurado para permitir peticiones del frontend y dominio de producción
app.use(
  cors({
    origin: parseAllowedOrigins(ENV.CORS_ORIGIN),
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-token'],
    exposedHeaders: ['Content-Disposition'],
  })
);

// Limitar tamaño del cuerpo para mitigar ataques de denegación de servicio (DoS)
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));

// Endpoints
app.get('/api/health', mediaController.getHealth);

// Extracción de metadatos (POST con rate limiting y validación anti-SSRF)
app.post(
  '/api/media/info',
  infoRateLimiter,
  urlSecurityMiddleware,
  mediaController.extractInfo
);

// Descarga directa del medio (GET con rate limiting y validación anti-SSRF)
app.get(
  '/api/media/download',
  downloadRateLimiter,
  urlSecurityMiddleware,
  mediaController.downloadMedia
);

// Proxy de imágenes para visualización segura de miniaturas en el navegador (protegido contra SSRF y saturación)
app.get(
  '/api/media/image-proxy',
  imageProxyRateLimiter,
  imageProxySecurityMiddleware,
  mediaController.imageProxy
);

// Monitoreo y métricas del servidor en tiempo real (protegido con rate limiting y token)
app.get(
  '/api/admin/metrics',
  adminRateLimiter,
  mediaController.getMetrics
);

// Manejador global de errores
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[Error no controlado]', err);
  res.status(500).json({
    success: false,
    error: 'Error interno del servidor',
  });
});

// Limpiador automático de archivos huérfanos (si una descarga de video fue abortada o interrumpida)
function cleanupTempFiles(): void {
  try {
    if (fs.existsSync(ENV.DOWNLOADS_DIR)) {
      const files = fs.readdirSync(ENV.DOWNLOADS_DIR);
      const now = Date.now();
      const MAX_AGE_MS = 15 * 60 * 1000; // 15 minutos de antigüedad máxima

      for (const file of files) {
        const filePath = path.join(ENV.DOWNLOADS_DIR, file);
        try {
          const stats = fs.statSync(filePath);
          if (now - stats.mtimeMs > MAX_AGE_MS) {
            fs.unlinkSync(filePath);
            console.log(`[Cleaner] Archivo temporal huérfano purgado: ${file}`);
          }
        } catch {}
      }
    }
  } catch (err) {
    console.warn('[Cleaner] Error en rutina de limpieza:', err);
  }
}

// Ejecutar limpieza al iniciar y periódicamente cada 15 minutos
cleanupTempFiles();
setInterval(cleanupTempFiles, 15 * 60 * 1000);

app.listen(ENV.PORT, () => {
  console.log(`=========================================`);
  console.log(`🚀 Open-DownMedia Backend API Activo`);
  console.log(`📡 Puerto: http://localhost:${ENV.PORT}`);
  console.log(`🔒 Entorno: ${ENV.NODE_ENV}`);
  console.log(`🧹 Purgador de temporales activo (Zero-Storage Policy)`);
  console.log(`=========================================`);
});

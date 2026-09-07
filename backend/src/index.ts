import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { ENV } from './config/environment.js';
import { mediaController } from './controllers/media.controller.js';
import {
  urlSecurityMiddleware,
  infoRateLimiter,
  downloadRateLimiter,
} from './middleware/security.js';

const app = express();

// Seguridad con Helmet (protección de cabeceras HTTP)
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// CORS configurado para permitir peticiones del frontend
app.use(
  cors({
    origin: ENV.CORS_ORIGIN === '*' ? true : [ENV.CORS_ORIGIN, 'http://localhost:4200', 'http://localhost:8080'],
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use(express.json());

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

// Proxy de imágenes para visualización segura de miniaturas en el navegador
app.get('/api/media/image-proxy', mediaController.imageProxy);

// Manejador global de errores
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[Error no controlado]', err);
  res.status(500).json({
    success: false,
    error: 'Error interno del servidor',
  });
});

app.listen(ENV.PORT, () => {
  console.log(`=========================================`);
  console.log(`🚀 Open-DownMedia Backend API Activo`);
  console.log(`📡 Puerto: http://localhost:${ENV.PORT}`);
  console.log(`🔒 Entorno: ${ENV.NODE_ENV}`);
  console.log(`=========================================`);
});

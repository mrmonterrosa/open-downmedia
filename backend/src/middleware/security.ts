import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';

// Lista blanca de plataformas y dominios soportados
const ALLOWED_DOMAIN_PATTERNS = [
  /^(.*\.)?tiktok\.com$/i,
  /^(.*\.)?instagram\.com$/i,
  /^(.*\.)?youtube\.com$/i,
  /^youtu\.be$/i,
  /^(.*\.)?twitter\.com$/i,
  /^(.*\.)?x\.com$/i,
  /^(.*\.)?threads\.net$/i,
  /^(.*\.)?facebook\.com$/i,
  /^fb\.watch$/i,
  /^(.*\.)?reddit\.com$/i,
  /^(.*\.)?pinterest\.com$/i,
  /^pin\.it$/i,
  /^(.*\.)?vimeo\.com$/i,
  /^(.*\.)?soundcloud\.com$/i,
  /^(.*\.)?bilibili\.com$/i,
];

// Direcciones IP privadas y reservadas para bloquear (anti-SSRF)
const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\.0\.0\.0/,
  /^localhost$/i,
  /^::1$/,
];

export const urlSchema = z.object({
  url: z.string().url('Debe ser una URL válida (http:// o https://)'),
  format: z.enum(['video_hd', 'video_sd', 'audio', 'default']).optional().default('video_hd'),
});

export function validateSocialUrl(urlString: string): { isValid: boolean; error?: string; hostname?: string } {
  try {
    const parsed = new URL(urlString);

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { isValid: false, error: 'Protocolo no permitido. Solo se acepta HTTP o HTTPS.' };
    }

    const hostname = parsed.hostname;

    // Verificar si apunta a una IP privada o localhost
    for (const ipPattern of PRIVATE_IP_PATTERNS) {
      if (ipPattern.test(hostname)) {
        return { isValid: false, error: 'Acceso a redes internas o localhost bloqueado por seguridad.' };
      }
    }

    // Verificar si coincide con dominios permitidos
    const isAllowed = ALLOWED_DOMAIN_PATTERNS.some((pattern) => pattern.test(hostname));
    if (!isAllowed) {
      return {
        isValid: false,
        error: `El dominio '${hostname}' no está en la lista de redes sociales soportadas (TikTok, Instagram, YouTube, X, Reddit, Facebook, Pinterest, etc.).`,
      };
    }

    return { isValid: true, hostname };
  } catch {
    return { isValid: false, error: 'La URL proporcionada no es válida.' };
  }
}

export function urlSecurityMiddleware(req: Request, res: Response, next: NextFunction): void {
  const urlToCheck = req.method === 'POST' ? req.body?.url : req.query?.url;

  if (!urlToCheck || typeof urlToCheck !== 'string') {
    res.status(400).json({ success: false, error: 'El parámetro URL es requerido.' });
    return;
  }

  const validation = validateSocialUrl(urlToCheck);
  if (!validation.isValid) {
    res.status(400).json({ success: false, error: validation.error });
    return;
  }

  next();
}

// Limitador de tasa para extracción de metadatos (60 peticiones cada 15 minutos)
export const infoRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Demasiadas solicitudes. Por favor, intenta de nuevo en unos minutos.' },
});

// Limitador de tasa para descargas/streams (15 descargas cada 15 minutos por IP)
export const downloadRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Has alcanzado el límite de 15 descargas cada 15 minutos. Por favor, espera un momento para continuar.',
  },
});

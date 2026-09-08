import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';

// Lista blanca de plataformas y dominios soportados (incluyendo sus CDNs de imágenes oficiales)
const ALLOWED_DOMAIN_PATTERNS = [
  /^(.*\.)?tiktok\.com$/i,
  /^(.*\.)?tiktokcdn(-[a-z0-9]+)?\.com$/i,
  /^(.*\.)?instagram\.com$/i,
  /^(.*\.)?cdninstagram\.com$/i,
  /^(.*\.)?youtube\.com$/i,
  /^youtu\.be$/i,
  /^(.*\.)?ytimg\.com$/i,
  /^(.*\.)?googlevideo\.com$/i,
  /^(.*\.)?ggpht\.com$/i,
  /^(.*\.)?twitter\.com$/i,
  /^(.*\.)?x\.com$/i,
  /^(.*\.)?twimg\.com$/i,
  /^(.*\.)?threads\.net$/i,
  /^(.*\.)?facebook\.com$/i,
  /^fb\.watch$/i,
  /^(.*\.)?fbcdn\.net$/i,
  /^(.*\.)?fbsbx\.com$/i,
  /^(.*\.)?reddit\.com$/i,
  /^(.*\.)?redd\.it$/i,
  /^(.*\.)?imgur\.com$/i,
  /^(.*\.)?pinterest\.com$/i,
  /^pin\.it$/i,
  /^(.*\.)?pinimg\.com$/i,
  /^(.*\.)?vimeo\.com$/i,
  /^(.*\.)?soundcloud\.com$/i,
  /^(.*\.)?bilibili\.com$/i,
];

// Direcciones IP privadas, locales y reservadas para bloquear (anti-SSRF estricto)
const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\.0\.0\.0/,
  /^localhost$/i,
  /^::1$/,
  /^::ffff:127\./,
  /^::ffff:10\./,
  /^::ffff:172\./,
  /^::ffff:192\.168\./,
  /^::ffff:169\.254\./,
  /^fc00:/i,
  /^fe80:/i,
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

    // Bloqueo de puertos no estándar para evitar escaneo o bypass de servicios internos
    if (parsed.port && parsed.port !== '80' && parsed.port !== '443') {
      return { isValid: false, error: 'Puerto no permitido por seguridad. Solo se aceptan conexiones estándar HTTP/HTTPS.' };
    }

    const hostname = parsed.hostname;

    // Verificar si apunta a una IP privada, reservada o localhost
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
        error: `El dominio '${hostname}' no está en la lista de redes sociales soportadas (TikTok, Instagram, YouTube, X, Reddit, Facebook, Pinterest, Imgur, etc.).`,
      };
    }

    return { isValid: true, hostname };
  } catch {
    return { isValid: false, error: 'La URL proporcionada no es válida.' };
  }
}

export function urlSecurityMiddleware(req: Request, res: Response, next: NextFunction): void {
  let urlToCheck = req.method === 'POST' ? req.body?.url : req.query?.url;

  // Si no se proporcionó url directo pero sí el parámetro base64 (ej: /download?base64=...)
  const base64Param = (req.query?.base64 || req.query?.b64) as string | undefined;
  if (!urlToCheck && base64Param) {
    try {
      const decoded = Buffer.from(base64Param.trim(), 'base64').toString('utf-8').trim();
      if (decoded.startsWith('{') && decoded.endsWith('}')) {
        const parsed = JSON.parse(decoded);
        urlToCheck = parsed.url || parsed.directUrl;
      } else if (decoded.startsWith('http://') || decoded.startsWith('https://')) {
        urlToCheck = decoded;
      }
    } catch {}
  }

  if (!urlToCheck || typeof urlToCheck !== 'string') {
    res.status(400).json({ success: false, error: 'El parámetro URL o base64 es requerido.' });
    return;
  }

  const validation = validateSocialUrl(urlToCheck);
  if (!validation.isValid) {
    res.status(400).json({ success: false, error: validation.error });
    return;
  }

  next();
}

/**
 * Middleware de seguridad anti-SSRF para el proxy de imágenes
 */
export function imageProxySecurityMiddleware(req: Request, res: Response, next: NextFunction): void {
  const imageUrl = req.query.url as string;
  if (!imageUrl || typeof imageUrl !== 'string') {
    res.status(400).json({ success: false, error: 'El parámetro url es requerido para el proxy de imagen.' });
    return;
  }

  const validation = validateSocialUrl(imageUrl);
  if (!validation.isValid) {
    res.status(400).json({ success: false, error: validation.error });
    return;
  }

  next();
}

// Limitador de tasa para extracción de metadatos (100 peticiones cada 15 minutos)
export const infoRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Demasiadas solicitudes. Por favor, intenta de nuevo en unos minutos.' },
});

// Limitador de tasa para descargas/streams (60 descargas cada 15 minutos por IP)
export const downloadRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Has alcanzado el límite de descargas. Por favor, espera un momento para continuar.',
  },
});

// Limitador de tasa para el proxy de imágenes (150 peticiones cada 15 minutos por IP)
export const imageProxyRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 150,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Demasiadas solicitudes de vista previa de imagen. Por favor, espera un momento.',
  },
});

// Limitador de tasa para consultas administrativas / métricas (30 peticiones cada 15 minutos)
export const adminRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Demasiadas consultas administrativas.',
  },
});

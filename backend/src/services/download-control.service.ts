import { MediaInfo } from './ytdlp.service.js';

interface CacheEntry {
  data: MediaInfo;
  expiresAt: number;
}

export interface SlotAcquisitionResult {
  allowed: boolean;
  status?: number;
  error?: string;
  retryAfter?: number;
}

export interface ServerMetrics {
  status: 'healthy' | 'busy' | 'degraded';
  timestamp: string;
  uptimeSeconds: number;
  uptimeFormatted: string;
  concurrency: {
    maxGlobalSlots: number;
    activeSlots: number;
    availableSlots: number;
    activeIpsCount: number;
    activeIps: string[];
  };
  policy: {
    maxConcurrentPerIp: number;
    maxVideoDurationMinutes: number;
    cacheTtlMinutes: number;
  };
  stats: {
    totalDownloadsStarted: number;
    totalDownloadsCompleted: number;
    totalDownloadsFailed: number;
    totalRejectedConcurrency: number;
    totalRejectedPerIp: number;
    totalRejectedDuration: number;
    cacheHits: number;
    cacheMisses: number;
    cacheHitRatio: string;
    cachedUrlsCount: number;
  };
  system: {
    nodeVersion: string;
    platform: string;
  };
}

export class DownloadControlService {
  public readonly MAX_GLOBAL_CONCURRENT_DOWNLOADS = 3;
  public readonly MAX_ACTIVE_PER_IP = 1;
  public readonly MAX_VIDEO_DURATION_SECONDS = 30 * 60; // 30 minutos
  public readonly CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutos

  private activeSlots = 0;
  private activeIps = new Map<string, number>();
  private cache = new Map<string, CacheEntry>();

  private stats = {
    totalDownloadsStarted: 0,
    totalDownloadsCompleted: 0,
    totalDownloadsFailed: 0,
    totalRejectedConcurrency: 0,
    totalRejectedPerIp: 0,
    totalRejectedDuration: 0,
    cacheHits: 0,
    cacheMisses: 0,
  };

  private readonly serverStartedAt = Date.now();

  constructor() {
    // Limpieza periódica de elementos expirados en caché cada 5 minutos
    setInterval(() => this.purgeExpiredCache(), 5 * 60 * 1000);
  }

  /**
   * Intenta adquirir una ranura de procesamiento para una IP.
   */
  public acquireSlot(ip: string): SlotAcquisitionResult {
    const cleanIp = this.normalizeIp(ip);
    const ipCount = this.activeIps.get(cleanIp) || 0;

    // 1. Validar límite de descarga activa por IP
    if (ipCount >= this.MAX_ACTIVE_PER_IP) {
      this.stats.totalRejectedPerIp++;
      console.warn(`[LIMITER] Rechazada petición de ${cleanIp}: Ya tiene una descarga activa en curso.`);
      return {
        allowed: false,
        status: 429,
        error: 'Ya tienes una descarga en proceso. Por favor, espera a que finalice antes de iniciar otra.',
      };
    }

    // 2. Validar límite global de concurrencia del servidor
    if (this.activeSlots >= this.MAX_GLOBAL_CONCURRENT_DOWNLOADS) {
      this.stats.totalRejectedConcurrency++;
      console.warn(`[LIMITER] Rechazada petición de ${cleanIp}: Servidor ocupado (${this.activeSlots}/${this.MAX_GLOBAL_CONCURRENT_DOWNLOADS} slots).`);
      return {
        allowed: false,
        status: 503,
        retryAfter: 5,
        error: 'Nuestros servidores están procesando el número máximo de descargas simultáneas. Tu solicitud se reintentará en unos segundos.',
      };
    }

    // 3. Asignar slot
    this.activeSlots++;
    this.activeIps.set(cleanIp, ipCount + 1);
    this.stats.totalDownloadsStarted++;

    console.log(`[LIMITER] Slot ${this.activeSlots}/${this.MAX_GLOBAL_CONCURRENT_DOWNLOADS} asignado a IP: ${cleanIp}`);
    return { allowed: true };
  }

  /**
   * Libera una ranura previamente asignada a una IP.
   */
  public releaseSlot(ip: string, success = true): void {
    const cleanIp = this.normalizeIp(ip);
    this.activeSlots = Math.max(0, this.activeSlots - 1);

    const ipCount = this.activeIps.get(cleanIp) || 0;
    if (ipCount <= 1) {
      this.activeIps.delete(cleanIp);
    } else {
      this.activeIps.set(cleanIp, ipCount - 1);
    }

    if (success) {
      this.stats.totalDownloadsCompleted++;
    } else {
      this.stats.totalDownloadsFailed++;
    }

    console.log(`[LIMITER] Slot liberado por IP ${cleanIp}. Slots activos actuales: ${this.activeSlots}/${this.MAX_GLOBAL_CONCURRENT_DOWNLOADS}`);
  }

  /**
   * Valida si la duración del medio está dentro de la política de recursos.
   */
  public isDurationAllowed(durationSeconds?: number): boolean {
    if (!durationSeconds || durationSeconds <= 0) return true;
    if (durationSeconds > this.MAX_VIDEO_DURATION_SECONDS) {
      this.stats.totalRejectedDuration++;
      return false;
    }
    return true;
  }

  /**
   * Obtiene metadatos en caché si aún no han expirado.
   */
  public getCachedInfo(url: string): MediaInfo | null {
    const key = this.normalizeUrl(url);
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.cacheMisses++;
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.cacheMisses++;
      return null;
    }

    this.stats.cacheHits++;
    console.log(`[CACHE] Acierto de caché (Hit) para URL: ${key.slice(0, 60)}...`);
    return JSON.parse(JSON.stringify(entry.data));
  }

  /**
   * Almacena metadatos en caché con TTL de 15 minutos.
   */
  public setCachedInfo(url: string, data: MediaInfo): void {
    const key = this.normalizeUrl(url);
    this.cache.set(key, {
      data: JSON.parse(JSON.stringify(data)),
      expiresAt: Date.now() + this.CACHE_TTL_MS,
    });
  }

  /**
   * Genera el reporte consolidado de métricas en tiempo real.
   */
  public getMetrics(): ServerMetrics {
    const uptimeSec = Math.floor((Date.now() - this.serverStartedAt) / 1000);
    const hours = Math.floor(uptimeSec / 3600);
    const minutes = Math.floor((uptimeSec % 3600) / 60);
    const seconds = uptimeSec % 60;
    const uptimeFormatted = `${hours}h ${minutes}m ${seconds}s`;

    const totalQueries = this.stats.cacheHits + this.stats.cacheMisses;
    const hitRatio = totalQueries > 0 ? `${((this.stats.cacheHits / totalQueries) * 100).toFixed(1)}%` : '0%';

    let status: 'healthy' | 'busy' | 'degraded' = 'healthy';
    if (this.activeSlots >= this.MAX_GLOBAL_CONCURRENT_DOWNLOADS) {
      status = 'busy';
    }

    return {
      status,
      timestamp: new Date().toISOString(),
      uptimeSeconds: uptimeSec,
      uptimeFormatted,
      concurrency: {
        maxGlobalSlots: this.MAX_GLOBAL_CONCURRENT_DOWNLOADS,
        activeSlots: this.activeSlots,
        availableSlots: Math.max(0, this.MAX_GLOBAL_CONCURRENT_DOWNLOADS - this.activeSlots),
        activeIpsCount: this.activeIps.size,
        activeIps: Array.from(this.activeIps.keys()),
      },
      policy: {
        maxConcurrentPerIp: this.MAX_ACTIVE_PER_IP,
        maxVideoDurationMinutes: Math.floor(this.MAX_VIDEO_DURATION_SECONDS / 60),
        cacheTtlMinutes: Math.floor(this.CACHE_TTL_MS / 60000),
      },
      stats: {
        totalDownloadsStarted: this.stats.totalDownloadsStarted,
        totalDownloadsCompleted: this.stats.totalDownloadsCompleted,
        totalDownloadsFailed: this.stats.totalDownloadsFailed,
        totalRejectedConcurrency: this.stats.totalRejectedConcurrency,
        totalRejectedPerIp: this.stats.totalRejectedPerIp,
        totalRejectedDuration: this.stats.totalRejectedDuration,
        cacheHits: this.stats.cacheHits,
        cacheMisses: this.stats.cacheMisses,
        cacheHitRatio: hitRatio,
        cachedUrlsCount: this.cache.size,
      },
      system: {
        nodeVersion: process.version,
        platform: process.platform,
      },
    };
  }

  private normalizeIp(ip: string): string {
    if (!ip) return 'unknown';
    // Limpiar prefijo IPv6 de loopback o mapeo ::ffff:
    return ip.replace(/^::ffff:/, '').trim() || 'unknown';
  }

  private normalizeUrl(url: string): string {
    try {
      const u = new URL(url);
      return `${u.origin}${u.pathname}`.toLowerCase();
    } catch {
      return url.trim().toLowerCase();
    }
  }

  private purgeExpiredCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }
}

export const downloadControlService = new DownloadControlService();

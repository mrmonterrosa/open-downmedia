import { execFile } from 'child_process';
import { MediaInfo, MediaImageItem, FormatOption, extractRealMediaPayload } from './ytdlp.service.js';

function getTwitterToken(id: string): string {
  return ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, '');
}

export function getImageHeaders(imageUrl: string): Record<string, string> {
  const headers: Record<string, string> = {
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
  };

  const u = imageUrl.toLowerCase();
  if (u.includes('lookaside') || u.includes('fbsbx.com')) {
    // lookaside.fbsbx.com exige un bot User-Agent para entregar el binario JPEG en vez de HTML redirect
    headers['user-agent'] = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';
    headers['referer'] = 'https://www.facebook.com/';
  } else if (u.includes('cdninstagram.com') || u.includes('instagram.com')) {
    headers['referer'] = 'https://www.instagram.com/';
  } else if (u.includes('twimg.com') || u.includes('twitter.com') || u.includes('x.com')) {
    headers['referer'] = 'https://twitter.com/';
  } else if (u.includes('pinimg.com') || u.includes('pinterest.com')) {
    headers['referer'] = 'https://www.pinterest.com/';
  } else if (u.includes('tiktokcdn.com') || u.includes('tiktok.com')) {
    headers['referer'] = 'https://www.tiktok.com/';
  } else if (u.includes('fbcdn.net') || u.includes('facebook.com')) {
    headers['referer'] = 'https://www.facebook.com/';
  } else if (u.includes('redd.it') || u.includes('reddit.com')) {
    headers['referer'] = 'https://www.reddit.com/';
  }

  return headers;
}

export class ImageExtractorService {
  /**
   * Ejecuta gallery-dl con la opción -j para volcar metadatos JSON de imágenes
   */
  public async extractWithGalleryDl(url: string): Promise<{ images: string[]; title?: string; uploader?: string } | null> {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return null;
    }

    return new Promise((resolve) => {
      execFile('gallery-dl', ['-j', '--', url], { maxBuffer: 15 * 1024 * 1024, timeout: 25000 }, (err, stdout) => {
        if (err || !stdout) {
          return resolve(null);
        }

        try {
          const data = JSON.parse(stdout);
          if (!Array.isArray(data) || data.length === 0) {
            return resolve(null);
          }

          const foundUrls: string[] = [];
          let extractedTitle = '';
          let extractedUploader = '';

          for (const item of data) {
            if (Array.isArray(item) && item.length >= 2) {
              const candidateUrl = item[1];
              const meta = item[2] || {};

              if (typeof candidateUrl === 'string' && candidateUrl.startsWith('http')) {
                // Verificar que sea una URL de medio o imagen
                if (!foundUrls.includes(candidateUrl)) {
                  foundUrls.push(candidateUrl);
                }
                if (!extractedTitle && (meta.caption || meta.post_text)) {
                  extractedTitle = (meta.caption || meta.post_text).slice(0, 100);
                } else if (!extractedTitle && meta.title && meta.title !== 'Photos') {
                  extractedTitle = meta.title;
                }
                if (!extractedUploader && (meta.username || meta.user || meta.author || meta.pinner)) {
                  extractedUploader = meta.username || meta.user || meta.author || meta.pinner;
                }
              }
            }
          }

          if (foundUrls.length > 0) {
            return resolve({
              images: foundUrls,
              title: extractedTitle,
              uploader: extractedUploader,
            });
          }
        } catch {
          // Ignorar error de parseo
        }
        resolve(null);
      });
    });
  }

  /**
   * Extracción de fotos y álbumes de Instagram
   */
  public async extractInstagram(url: string): Promise<MediaInfo | null> {
    try {
      const { igdl } = await import('btch-downloader');
      const res: any = await igdl(url);

      if (res && res.result && Array.isArray(res.result) && res.result.length > 0) {
        const uniqueItems: { realUrl: string; filename: string }[] = [];
        const seen = new Set<string>();

        for (const item of res.result) {
          if (item && item.url) {
            const payload = extractRealMediaPayload(item.url);
            if (!seen.has(payload.realUrl)) {
              seen.add(payload.realUrl);
              uniqueItems.push({
                realUrl: payload.realUrl,
                filename: payload.filename,
              });
            }
          }
        }

        if (uniqueItems.length > 0) {
          return this.buildMediaResponse({
            id: `ig_${Date.now()}`,
            title: `Instagram (${uniqueItems.length} ${uniqueItems.length > 1 ? 'fotos' : 'foto'})`,
            uploader: 'Instagram User',
            platform: 'Instagram',
            imageUrls: uniqueItems.map((u) => u.realUrl),
          });
        }
      }
    } catch (err) {
      console.warn('[Instagram Extractor] Error:', err);
    }
    return null;
  }

  /**
   * Extracción de pines de Pinterest (foto en máxima resolución)
   */
  public async extractPinterest(url: string): Promise<MediaInfo | null> {
    try {
      const { pinterest } = await import('btch-downloader');
      const res: any = await pinterest(url);

      const pinData = res?.result?.result || res?.result;
      if (pinData) {
        const highResImage = pinData.images?.orig?.url || pinData.image || pinData.images?.['736x']?.url;
        if (highResImage) {
          return this.buildMediaResponse({
            id: `pin_${pinData.id || Date.now()}`,
            title: pinData.title?.trim() || pinData.description?.trim() || 'Pin de Pinterest',
            uploader: pinData.user?.full_name || pinData.user?.username || 'Pinterest',
            platform: 'Pinterest',
            imageUrls: [highResImage],
          });
        }
      }
    } catch (err) {
      console.warn('[Pinterest Extractor] Fallback error:', err);
    }
    return null;
  }

  /**
   * Extracción de fotos de X / Twitter (soporta hasta 4 imágenes por publicación)
   */
  public async extractTwitter(url: string): Promise<MediaInfo | null> {
    try {
      const tweetIdMatch = url.match(/(?:status|statuses)\/(\d+)/i);
      if (!tweetIdMatch) return null;

      const tweetId = tweetIdMatch[1];
      const syndicationUrl = new URL('https://cdn.syndication.twimg.com/tweet-result');
      syndicationUrl.searchParams.set('id', tweetId);
      syndicationUrl.searchParams.set('lang', 'en');
      syndicationUrl.searchParams.set('token', getTwitterToken(tweetId));

      const res = await fetch(syndicationUrl.toString(), {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });

      if (res.ok) {
        const data: any = await res.json();
        const photoUrls: string[] = [];

        if (Array.isArray(data.photos)) {
          for (const p of data.photos) {
            if (p?.url) {
              const origUrl = p.url.includes('?') ? p.url.split('?')[0] + '?name=orig' : `${p.url}?name=orig`;
              photoUrls.push(origUrl);
            }
          }
        } else if (Array.isArray(data.mediaDetails)) {
          for (const m of data.mediaDetails) {
            if (m?.media_url_https) {
              const origUrl = m.media_url_https.includes('?') ? m.media_url_https.split('?')[0] + '?name=orig' : `${m.media_url_https}?name=orig`;
              photoUrls.push(origUrl);
            }
          }
        }

        if (photoUrls.length > 0) {
          return this.buildMediaResponse({
            id: `tw_${tweetId}`,
            title: data.text ? (data.text.length > 100 ? data.text.slice(0, 97) + '...' : data.text) : 'Publicación de X / Twitter',
            uploader: data.user?.name ? `${data.user.name} (@${data.user.screen_name})` : 'Twitter User',
            platform: 'X / Twitter',
            imageUrls: photoUrls,
          });
        }
      }
    } catch (err) {
      console.warn('[Twitter Extractor] Error:', err);
    }
    return null;
  }

  /**
   * Extracción de fotos de Reddit (imágenes individuales, galerías y álbumes sin el banner genérico)
   */
  public async extractReddit(url: string): Promise<MediaInfo | null> {
    try {
      const BOT_UA = 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)';

      // 1. Resolver enlaces cortos de compartir (/s/ o /share/) a la URL canónica del post
      let canonical = url;
      if (url.includes('/s/') || url.includes('/share/')) {
        try {
          const res = await fetch(url, {
            headers: { 'User-Agent': BOT_UA },
            redirect: 'manual',
          });
          if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
            canonical = res.headers.get('location')!;
          } else {
            const followRes = await fetch(url, {
              headers: { 'User-Agent': BOT_UA },
              redirect: 'follow',
            });
            canonical = followRes.url;
          }
        } catch (e) {
          console.warn('[Reddit Extractor] Error resolviendo URL canónica:', e);
        }
      }

      // 2. Extraer el identificador del post
      const match = canonical.match(/comments\/([a-zA-Z0-9]+)/i);
      if (!match) {
        console.warn(`[Reddit Extractor] No se pudo extraer el ID del post desde: ${canonical}`);
        return null;
      }

      const postId = match[1];

      // 3. Consultar el feed Atom/RSS oficial del post en Reddit
      const rssUrl = `https://www.reddit.com/comments/${postId}.rss`;
      const rssRes = await fetch(rssUrl, {
        headers: { 'User-Agent': BOT_UA },
      });

      if (!rssRes.ok) {
        console.warn(`[Reddit Extractor] RSS feed falló con estado: ${rssRes.status}`);
        return null;
      }

      const xml = await rssRes.text();

      // Extraer autor real
      const authorMatch = xml.match(/<author><name>(.*?)<\/name>/i);
      const author = authorMatch ? authorMatch[1].replace(/^\/u\//, 'u/') : 'Reddit User';

      // Extraer título real de la publicación
      const titleMatch = xml.match(/<title>(.*?)<\/title>/i);
      let title = titleMatch ? titleMatch[1].replace(' : reddit.com', '').trim() : 'Publicación de Reddit';
      title = title.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

      // Extraer el contenido del primer <entry>
      const firstEntryMatch = xml.match(/<entry>([\s\S]*?)<\/entry>/i);
      const entryContent = firstEntryMatch ? firstEntryMatch[1] : xml;

      const foundImages: string[] = [];

      // Buscar enlaces directos a i.redd.it
      const directMatches = [...entryContent.matchAll(/https:\/\/i\.redd\.it\/([a-zA-Z0-9_\-\.]+)/gi)];
      for (const m of directMatches) {
        const fullUrl = `https://i.redd.it/${m[1]}`;
        if (!foundImages.includes(fullUrl)) foundImages.push(fullUrl);
      }

      // Buscar miniaturas en preview.redd.it y convertirlas a su versión en resolución original en i.redd.it
      const previewMatches = [...entryContent.matchAll(/https:\/\/preview\.redd\.it\/([a-zA-Z0-9_\-\.]+)\?(?:amp;)?/gi)];
      for (const m of previewMatches) {
        const filename = m[1];
        const originalUrl = `https://i.redd.it/${filename}`;
        if (!foundImages.includes(originalUrl)) foundImages.push(originalUrl);
      }

      // Buscar imágenes de Imgur
      const imgurMatches = [...entryContent.matchAll(/https:\/\/i\.imgur\.com\/([a-zA-Z0-9_\-\.]+)/gi)];
      for (const m of imgurMatches) {
        const fullUrl = `https://i.imgur.com/${m[1]}`;
        if (!foundImages.includes(fullUrl)) foundImages.push(fullUrl);
      }

      // Si encontramos imágenes reales (no banners genéricos), construir la respuesta
      if (foundImages.length > 0) {
        console.log(`[Reddit Extractor] Extraídas ${foundImages.length} fotos reales de Reddit para post ${postId} (Autor: ${author}).`);
        return this.buildMediaResponse({
          id: `reddit_${postId}_${Date.now()}`,
          title,
          uploader: `${author} (Reddit)`,
          platform: 'Reddit',
          imageUrls: foundImages,
        });
      }

      console.log(`[Reddit Extractor] La publicación ${postId} no contiene imágenes ni galerías adjuntas.`);
    } catch (err) {
      console.warn('[Reddit Extractor] Error procesando post de Reddit:', err);
    }
    return null;
  }

  /**
   * Extracción de fotos de Facebook (publicaciones con fotos y álbumes)
   */
  public async extractFacebook(url: string): Promise<MediaInfo | null> {
    // 1. Resolver redirección de enlaces de compartir (ej. /share/p/, /share/r/, fb.watch) a la URL canónica del post
    let canonicalUrl = url;
    try {
      const redirectRes = await fetch(url, {
        headers: {
          'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
          'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
        },
        redirect: 'follow',
      });
      canonicalUrl = redirectRes.url.split('?')[0] || redirectRes.url;
      console.log(`[Facebook Extractor] URL canónica resuelta: ${canonicalUrl}`);
    } catch (e) {
      console.warn('[Facebook Extractor] Error resolviendo URL canónica:', e);
    }

    // 2. Intentar primero con gallery-dl sobre la URL canónica (extrae imágenes en máxima resolución, autor real y álbumes completos)
    const gdlRes = await this.extractWithGalleryDl(canonicalUrl);
    if (gdlRes && gdlRes.images.length > 0) {
      console.log(`[Facebook Extractor] gallery-dl extrajo ${gdlRes.images.length} imágenes exitosamente de Facebook.`);
      return this.buildMediaResponse({
        id: `fb_${Date.now()}`,
        title: gdlRes.title || 'Foto de Facebook',
        uploader: gdlRes.uploader || 'Facebook User',
        platform: 'Facebook',
        imageUrls: gdlRes.images,
      });
    }

    // 3. Fallback con OpenGraph scraper: probar Twitterbot primero (da URLs directas scontent CDN) y luego facebookexternalhit
    const uas = [
      'Twitterbot/1.0',
      'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    ];

    for (const targetUrl of [canonicalUrl, url]) {
      for (const ua of uas) {
        try {
          const res = await fetch(targetUrl, {
            headers: { 'User-Agent': ua, 'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8' },
          });
          const html = await res.text();
          const ogImgMatch =
            html.match(/property="og:image"\s+content="([^"]+)"/i) ||
            html.match(/content="([^"]+)"\s+property="og:image"/i) ||
            html.match(/"image":\s*\{"@type":\s*"ImageObject",\s*"url":\s*"([^"]+)"/i);
          const ogTitleMatch =
            html.match(/property="og:title"\s+content="([^"]+)"/i) ||
            html.match(/content="([^"]+)"\s+property="og:title"/i);

          if (ogImgMatch && ogImgMatch[1]) {
            const rawUrl = ogImgMatch[1].replace(/&amp;/g, '&');
            if (!rawUrl.includes('static.xx.fbcdn.net/rsrc.php')) {
              return this.buildMediaResponse({
                id: `fb_${Date.now()}`,
                title: ogTitleMatch ? ogTitleMatch[1].replace(/&amp;/g, '&') : 'Foto de Facebook',
                uploader: 'Facebook User',
                platform: 'Facebook',
                imageUrls: [rawUrl],
              });
            }
          }
        } catch {}
      }
    }
    return null;
  }

  /**
   * Método orquestador para extraer fotos o carruseles de CUALQUIER red social
   */
  public async extractUniversalImages(url: string, platform: string): Promise<MediaInfo | null> {
    console.log(`[Image Service] Intentando extracción de imágenes para (${platform}): ${url}`);

    // 1. Intentar primero con el extractor especializado de la plataforma
    if (platform === 'Instagram') {
      const igRes = await this.extractInstagram(url);
      if (igRes) return igRes;
    } else if (platform === 'Pinterest') {
      const pinRes = await this.extractPinterest(url);
      if (pinRes) return pinRes;
    } else if (platform === 'X / Twitter') {
      const twRes = await this.extractTwitter(url);
      if (twRes) return twRes;
    } else if (platform === 'Facebook') {
      const fbRes = await this.extractFacebook(url);
      if (fbRes) return fbRes;
    } else if (platform === 'Reddit') {
      const rdRes = await this.extractReddit(url);
      if (rdRes) return rdRes;
    }

    // 2. Intentar con gallery-dl (soporta TikTok photo slideshows, Twitter, Pinterest, Reddit, etc.)
    const gdlRes = await this.extractWithGalleryDl(url);
    if (gdlRes && gdlRes.images.length > 0) {
      console.log(`[Image Service] gallery-dl extrajo ${gdlRes.images.length} imágenes exitosamente.`);
      return this.buildMediaResponse({
        id: `gdl_${Date.now()}`,
        title: gdlRes.title || `${platform} (${gdlRes.images.length} ${gdlRes.images.length > 1 ? 'fotos' : 'foto'})`,
        uploader: gdlRes.uploader || `${platform} User`,
        platform,
        imageUrls: gdlRes.images,
      });
    }

    // 3. Fallbacks secundarios cruzados si gallery-dl no tuvo éxito
    if (platform === 'Pinterest') {
      return await this.extractPinterest(url);
    }
    if (platform === 'X / Twitter') {
      return await this.extractTwitter(url);
    }
    if (platform === 'Facebook') {
      return await this.extractFacebook(url);
    }

    return null;
  }

  /**
   * Helper para construir la estructura uniforme MediaInfo con soporte para ZIP y fotos individuales
   */
  private buildMediaResponse(opts: {
    id: string;
    title: string;
    uploader: string;
    platform: string;
    imageUrls: string[];
  }): MediaInfo {
    const isCarousel = opts.imageUrls.length > 1;

    const imagesList: MediaImageItem[] = opts.imageUrls.map((imgUrl, idx) => {
      const proxyThumb = `/api/media/image-proxy?url=${encodeURIComponent(imgUrl)}`;
      return {
        id: `img_${idx}`,
        url: imgUrl,
        thumbnail: proxyThumb,
        filename: `open_downmedia_${opts.platform.toLowerCase().replace(/[^a-z0-9]/g, '_')}_foto_${idx + 1}.jpg`,
      };
    });

    const formatsList: FormatOption[] = [];

    if (isCarousel) {
      formatsList.push({
        id: 'image_all',
        label: `Descargar Álbum Completo (ZIP - ${opts.imageUrls.length} Fotos)`,
        ext: 'zip',
        isImage: true,
      });
    }

    imagesList.forEach((it, idx) => {
      formatsList.push({
        id: `image_${idx}`,
        label: isCarousel ? `Foto ${idx + 1} en Alta Calidad` : 'Foto en Máxima Resolución (JPG)',
        ext: 'jpg',
        isImage: true,
        directUrl: it.url,
      });
    });

    return {
      id: opts.id,
      title: opts.title,
      thumbnail: imagesList[0].thumbnail,
      uploader: opts.uploader,
      platform: opts.platform,
      mediaType: isCarousel ? 'carousel' : 'image',
      hasAudio: false,
      hasVideo: false,
      hasImages: true,
      images: imagesList,
      formats: formatsList,
    };
  }
}

export const imageExtractorService = new ImageExtractorService();

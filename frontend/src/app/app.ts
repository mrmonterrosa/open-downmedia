import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DownloaderService } from './services/downloader.service';
import { MediaInfo, MediaImageItem } from './models/media.model';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private downloaderService = inject(DownloaderService);

  urlInput = signal<string>('');
  isLoading = signal<boolean>(false);
  isDownloading = signal<boolean>(false);
  errorMessage = signal<string | null>(null);
  mediaResult = signal<MediaInfo | null>(null);
  selectedFormat = signal<string>('video_hd');
  activeFaq = signal<number | null>(null);

  supportedPlatforms = [
    { name: 'TikTok', tag: 'Video & Fotos', icon: 'tiktok' },
    { name: 'Instagram', tag: 'Reels, Fotos & Álbumes', icon: 'instagram' },
    { name: 'YouTube', tag: 'Videos & MP3', icon: 'youtube' },
    { name: 'X / Twitter', tag: 'HD Video & Fotos', icon: 'twitter' },
    { name: 'Facebook', tag: 'Reels & Videos', icon: 'facebook' },
    { name: 'Reddit', tag: 'Video & Galerías', icon: 'reddit' },
    { name: 'Pinterest', tag: 'Pines de Foto & Video', icon: 'pinterest' },
  ];

  faqs = [
    {
      question: '¿Puedo descargar tanto fotos como videos de Instagram y TikTok?',
      answer:
        '¡Sí! Open-DownMedia detecta automáticamente si la publicación contiene videos, una sola imagen o un carrusel/álbum con múltiples fotos. Te permitirá descargar cada foto en alta definición o descargar el álbum completo en un archivo .ZIP.',
    },
    {
      question: '¿Cómo funciona la descarga de TikTok sin marca de agua?',
      answer:
        'Open-DownMedia localiza el flujo de video original alojado en los servidores CDN de TikTok antes de que la aplicación móvil renderice el logotipo y la marca de agua del usuario.',
    },
    {
      question: '¿Es necesario registrarse o pagar alguna suscripción?',
      answer:
        'No. Open-DownMedia es un proyecto 100% libre y de código abierto (Open Source). No requiere registro, no contiene anuncios y puede ser auto-hospedado con Docker.',
    },
    {
      question: '¿Cómo se descarga solo el audio en formato MP3?',
      answer:
        'Una vez analizado el enlace de video, selecciona la opción "Solo Audio (MP3)" en las opciones de formato y pulsa en "Descargar Ahora".',
    },
  ];

  async pasteFromClipboard(): Promise<void> {
    try {
      if (navigator.clipboard) {
        const text = await navigator.clipboard.readText();
        if (text && text.trim().startsWith('http')) {
          this.urlInput.set(text.trim());
          this.fetchMediaInfo();
        }
      }
    } catch {
      // Ignorar rechazo de permisos
    }
  }

  clearInput(): void {
    this.urlInput.set('');
    this.mediaResult.set(null);
    this.errorMessage.set(null);
  }

  fetchMediaInfo(): void {
    const url = this.urlInput().trim();
    if (!url) {
      this.errorMessage.set('Por favor, ingresa o pega un enlace de red social válido.');
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);
    this.mediaResult.set(null);

    this.downloaderService.extractInfo(url).subscribe({
      next: (res) => {
        this.isLoading.set(false);
        if (res.success && res.data) {
          this.mediaResult.set(res.data);
          // Seleccionar por defecto el primer formato disponible (ej. image_all o video_hd)
          if (res.data.formats && res.data.formats.length > 0) {
            this.selectedFormat.set(res.data.formats[0].id);
          }
        } else {
          this.errorMessage.set(res.error || 'No se pudo obtener la información del medio.');
        }
      },
      error: (err) => {
        this.isLoading.set(false);
        const backendError =
          err?.error?.error || 'Error al procesar el enlace. Verifica que la publicación sea pública y válida.';
        this.errorMessage.set(backendError);
      },
    });
  }

  downloadCurrentMedia(): void {
    const media = this.mediaResult();
    const url = this.urlInput().trim();
    const format = this.selectedFormat();

    if (!media || !url) return;

    this.isDownloading.set(true);

    const currentFmt = media.formats.find((f) => f.id === format);
    const downloadUrl = this.downloaderService.getDownloadUrl(url, format, currentFmt?.directUrl);

    const link = document.createElement('a');
    link.href = downloadUrl;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => {
      this.isDownloading.set(false);
    }, 2500);
  }

  downloadSingleImage(imageItem: MediaImageItem, index: number): void {
    const url = this.urlInput().trim();
    const downloadUrl = this.downloaderService.getDownloadUrl(url, `image_${index}`, imageItem.url);

    const link = document.createElement('a');
    link.href = downloadUrl;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  getImageUrl(thumbnail: string): string {
    if (!thumbnail) return '';
    if (thumbnail.startsWith('/api') && typeof window !== 'undefined' && window.location.port === '4200') {
      return 'http://localhost:3001' + thumbnail;
    }
    return thumbnail;
  }

  toggleFaq(index: number): void {
    if (this.activeFaq() === index) {
      this.activeFaq.set(null);
    } else {
      this.activeFaq.set(index);
    }
  }
}

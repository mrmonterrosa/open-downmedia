import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DownloaderService } from './services/downloader.service';
import { MediaInfo, FormatOption } from './models/media.model';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private downloaderService = inject(DownloaderService);

  // Estados con Signals de Angular
  urlInput = signal<string>('');
  isLoading = signal<boolean>(false);
  isDownloading = signal<boolean>(false);
  errorMessage = signal<string | null>(null);
  mediaResult = signal<MediaInfo | null>(null);
  selectedFormat = signal<string>('video_hd');
  activeFaq = signal<number | null>(null);

  // Lista de plataformas soportadas
  supportedPlatforms = [
    { name: 'TikTok', tag: 'Sin Marca de Agua', icon: 'tiktok' },
    { name: 'Instagram', tag: 'Reels & Fotos', icon: 'instagram' },
    { name: 'YouTube', tag: 'Videos & MP3', icon: 'youtube' },
    { name: 'X / Twitter', tag: 'HD Video', icon: 'twitter' },
    { name: 'Facebook', tag: 'Reels & Watch', icon: 'facebook' },
    { name: 'Reddit', tag: 'Video con Audio', icon: 'reddit' },
    { name: 'Pinterest', tag: 'Imágenes & Pins', icon: 'pinterest' },
  ];

  // Preguntas frecuentes para SEO
  faqs = [
    {
      question: '¿Cómo funciona la descarga de TikTok sin marca de agua?',
      answer:
        'Open-DownMedia localiza el flujo de video original alojado en los servidores CDN de TikTok antes de que la aplicación móvil renderice el logotipo y la marca de agua del usuario. Así obtienes el archivo MP4 limpio en máxima resolución.',
    },
    {
      question: '¿Qué tipo de contenidos puedo descargar de Instagram?',
      answer:
        'Puedes descargar Reels, publicaciones individuales con video o imagen, y pistas de audio de publicaciones públicas pegando el enlace correspondiente.',
    },
    {
      question: '¿Es necesario registrarse o pagar alguna suscripción?',
      answer:
        'No. Open-DownMedia es un proyecto 100% libre y de código abierto (Open Source). No requiere registro, no contiene anuncios publicitarios intrusivos y puede ser auto-hospedado con Docker.',
    },
    {
      question: '¿Cómo se descarga solo el audio en formato MP3?',
      answer:
        'Una vez analizado el enlace, selecciona la opción "Solo Audio (MP3)" en las opciones de formato y pulsa en "Descargar Ahora". El motor extraerá y codificará el audio automáticamente.',
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
      // El navegador denegó el permiso del portapapeles
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
          this.selectedFormat.set('video_hd');
        } else {
          this.errorMessage.set(res.error || 'No se pudo obtener la información del medio.');
        }
      },
      error: (err) => {
        this.isLoading.set(false);
        const backendError = err?.error?.error || 'Error al conectar con el servidor. Verifica que el enlace sea público y válido.';
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

    const downloadUrl = this.downloaderService.getDownloadUrl(url, format);

    // Disparar descarga directa
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

  toggleFaq(index: number): void {
    if (this.activeFaq() === index) {
      this.activeFaq.set(null);
    } else {
      this.activeFaq.set(index);
    }
  }
}

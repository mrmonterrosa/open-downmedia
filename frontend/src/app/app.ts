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

  supportedPlatforms = [
    { name: 'TikTok', icon: 'tiktok' },
    { name: 'Instagram', icon: 'instagram' },
    { name: 'YouTube', icon: 'youtube' },
    { name: 'X / Twitter', icon: 'twitter' },
    { name: 'Facebook', icon: 'facebook' },
    { name: 'Reddit', icon: 'reddit' },
    { name: 'Pinterest', icon: 'pinterest' },
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
}

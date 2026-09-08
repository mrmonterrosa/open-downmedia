import { Component, HostListener, inject, signal } from '@angular/core';
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
  currentImageIndex = signal<number>(0);
  isLightboxOpen = signal<boolean>(false);
  downloadCooldown = signal<number>(0);
  isMetricsModalOpen = signal<boolean>(false);
  serverMetrics = signal<any>(null);
  isLoadingMetrics = signal<boolean>(false);

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
    this.currentImageIndex.set(0);
    this.isLightboxOpen.set(false);

    this.downloaderService.extractInfo(url).subscribe({
      next: (res) => {
        this.isLoading.set(false);
        if (res.success && res.data) {
          this.mediaResult.set(res.data);
          this.currentImageIndex.set(0);
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

  selectFormat(fmtId: string): void {
    this.selectedFormat.set(fmtId);
    if (fmtId.startsWith('image_') && fmtId !== 'image_all') {
      const idx = parseInt(fmtId.replace('image_', ''), 10);
      if (!isNaN(idx)) {
        this.currentImageIndex.set(idx);
      }
    }
  }

  getActiveImageUrl(): string {
    const media = this.mediaResult();
    if (!media) return '';
    if (media.images && media.images.length > 0) {
      const idx = this.currentImageIndex();
      const active = media.images[idx] || media.images[0];
      return this.getImageUrl(active.thumbnail || active.url);
    }
    return this.getImageUrl(media.thumbnail);
  }

  prevImage(): void {
    const media = this.mediaResult();
    if (!media?.images || media.images.length <= 1) return;
    const current = this.currentImageIndex();
    const nextIdx = current === 0 ? media.images.length - 1 : current - 1;
    this.goToImage(nextIdx);
  }

  nextImage(): void {
    const media = this.mediaResult();
    if (!media?.images || media.images.length <= 1) return;
    const current = this.currentImageIndex();
    const nextIdx = current === media.images.length - 1 ? 0 : current + 1;
    this.goToImage(nextIdx);
  }

  goToImage(index: number): void {
    const media = this.mediaResult();
    if (!media?.images || index < 0 || index >= media.images.length) return;
    this.currentImageIndex.set(index);

    const fmtId = `image_${index}`;
    if (this.selectedFormat() !== 'image_all' && media.formats.some((f) => f.id === fmtId)) {
      this.selectedFormat.set(fmtId);
    }
  }

  openLightbox(index?: number): void {
    if (typeof index === 'number') {
      this.currentImageIndex.set(index);
    }
    this.isLightboxOpen.set(true);
  }

  closeLightbox(): void {
    this.isLightboxOpen.set(false);
  }

  downloadActiveImage(): void {
    const media = this.mediaResult();
    if (!media?.images) return;
    const idx = this.currentImageIndex();
    const active = media.images[idx];
    if (active) {
      this.downloadSingleImage(active, idx);
    }
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      if (this.isMetricsModalOpen()) {
        this.closeMetricsModal();
        return;
      }
      if (this.isLightboxOpen()) {
        this.closeLightbox();
        return;
      }
    }

    if (this.isLightboxOpen()) {
      if (event.key === 'ArrowLeft') {
        this.prevImage();
      } else if (event.key === 'ArrowRight') {
        this.nextImage();
      }
    }
  }

  openMetricsModal(): void {
    this.isMetricsModalOpen.set(true);
    this.isLoadingMetrics.set(true);
    this.downloaderService.getMetrics().subscribe({
      next: (res) => {
        this.isLoadingMetrics.set(false);
        if (res.success && res.data) {
          this.serverMetrics.set(res.data);
        }
      },
      error: () => {
        this.isLoadingMetrics.set(false);
      },
    });
  }

  closeMetricsModal(): void {
    this.isMetricsModalOpen.set(false);
  }

  downloadCurrentMedia(): void {
    const media = this.mediaResult();
    const url = this.urlInput().trim();
    const format = this.selectedFormat();

    if (!media || !url || this.downloadCooldown() > 0) return;

    this.isDownloading.set(true);
    this.downloadCooldown.set(4);

    const currentFmt = media.formats.find((f) => f.id === format);
    const downloadUrl = this.downloaderService.getDownloadUrl(url, format, currentFmt?.directUrl);

    const link = document.createElement('a');
    link.href = downloadUrl;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    const interval = setInterval(() => {
      const current = this.downloadCooldown();
      if (current <= 1) {
        clearInterval(interval);
        this.downloadCooldown.set(0);
        this.isDownloading.set(false);
      } else {
        this.downloadCooldown.set(current - 1);
      }
    }, 1000);
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

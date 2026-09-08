import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiResponse, MediaInfo } from '../models/media.model';

@Injectable({
  providedIn: 'root',
})
export class DownloaderService {
  private http = inject(HttpClient);

  private get baseUrl(): string {
    if (typeof window !== 'undefined' && window.location.port === '4200') {
      return 'http://localhost:3001/api';
    }
    return '/api';
  }

  checkHealth(): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/health`);
  }

  extractInfo(url: string): Observable<ApiResponse<MediaInfo>> {
    return this.http.post<ApiResponse<MediaInfo>>(`${this.baseUrl}/media/info`, { url });
  }

  toBase64(str: string): string {
    try {
      return btoa(
        encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) => {
          return String.fromCharCode(parseInt(p1, 16));
        })
      );
    } catch {
      return typeof btoa !== 'undefined' ? btoa(str) : str;
    }
  }

  getDownloadUrl(url: string, formatId: string, directUrl?: string, filename?: string): string {
    const encodedUrl = encodeURIComponent(url);
    const encodedFormat = encodeURIComponent(formatId);

    if (directUrl) {
      const b64 = this.toBase64(directUrl);
      let downloadLink = `${this.baseUrl}/media/download?base64=${encodeURIComponent(b64)}&format=${encodedFormat}&url=${encodedUrl}`;
      if (filename) {
        downloadLink += `&filename=${encodeURIComponent(filename)}`;
      }
      return downloadLink;
    }

    let downloadLink = `${this.baseUrl}/media/download?url=${encodedUrl}&format=${encodedFormat}`;
    if (filename) {
      downloadLink += `&filename=${encodeURIComponent(filename)}`;
    }
    return downloadLink;
  }

  getMetrics(): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/admin/metrics?token=opendownmedia_admin_2026`);
  }
}

import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiResponse, MediaInfo } from '../models/media.model';

@Injectable({
  providedIn: 'root',
})
export class DownloaderService {
  private http = inject(HttpClient);

  // En desarrollo local (puerto 4200 de Angular) apunta al puerto 3001 del backend.
  // En producción (Docker/Nginx) se canaliza mediante el proxy inverso a /api.
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

  getDownloadUrl(url: string, formatId: string): string {
    const encodedUrl = encodeURIComponent(url);
    const encodedFormat = encodeURIComponent(formatId);
    return `${this.baseUrl}/media/download?url=${encodedUrl}&format=${encodedFormat}`;
  }
}

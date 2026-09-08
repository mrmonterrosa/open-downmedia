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

  getDownloadUrl(url: string, formatId: string, directUrl?: string): string {
    const encodedUrl = encodeURIComponent(url);
    const encodedFormat = encodeURIComponent(formatId);
    let downloadLink = `${this.baseUrl}/media/download?url=${encodedUrl}&format=${encodedFormat}`;
    if (directUrl) {
      downloadLink += `&directUrl=${encodeURIComponent(directUrl)}`;
    }
    return downloadLink;
  }

  getMetrics(): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/admin/metrics?token=opendownmedia_admin_2026`);
  }
}

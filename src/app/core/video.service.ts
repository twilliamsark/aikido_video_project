import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { ImportResult, ShareInfo, Video, VideoInput } from './models';

/** Teacher-facing video CRUD client (TECHNICAL_SPEC.md §7.3). */
@Injectable({ providedIn: 'root' })
export class VideoService {
  private readonly http = inject(HttpClient);

  list(): Observable<Video[]> {
    return this.http
      .get<{ videos: Video[] }>('/api/videos')
      .pipe(map((r) => r.videos));
  }

  get(id: string): Observable<Video> {
    return this.http
      .get<{ video: Video }>(`/api/videos/${id}`)
      .pipe(map((r) => r.video));
  }

  create(input: VideoInput): Observable<Video> {
    return this.http
      .post<{ video: Video }>('/api/videos', input)
      .pipe(map((r) => r.video));
  }

  update(id: string, input: Partial<VideoInput>): Observable<Video> {
    return this.http
      .patch<{ video: Video }>(`/api/videos/${id}`, input)
      .pipe(map((r) => r.video));
  }

  remove(id: string): Observable<void> {
    return this.http.delete<{ ok: true }>(`/api/videos/${id}`).pipe(map(() => undefined));
  }

  /** Admin-only: import videos from raw CSV text (TECHNICAL_SPEC.md §3.5). */
  importCsv(csvText: string): Observable<ImportResult> {
    return this.http.post<ImportResult>('/api/videos/import', csvText, {
      headers: { 'Content-Type': 'text/csv' },
    });
  }

  /** Admin-only: download all videos as a CSV blob. */
  exportCsv(): Observable<Blob> {
    return this.http.get('/api/videos/export', { responseType: 'blob' });
  }

  /** Share a video (create or reactivate its link). */
  share(id: string): Observable<ShareInfo> {
    return this.http
      .post<{ share: ShareInfo }>(`/api/videos/${id}/share`, {})
      .pipe(map((r) => r.share));
  }

  /** Stop sharing a video (deactivate the link; token preserved). */
  unshare(id: string): Observable<ShareInfo> {
    return this.http
      .post<{ share: ShareInfo }>(`/api/videos/${id}/unshare`, {})
      .pipe(map((r) => r.share));
  }

  /** Takedown: disable (hide everywhere) or re-enable a video. */
  setDisabled(id: string, disabled: boolean): Observable<Video> {
    const action = disabled ? 'disable' : 'enable';
    return this.http
      .post<{ video: Video }>(`/api/videos/${id}/${action}`, {})
      .pipe(map((r) => r.video));
  }
}

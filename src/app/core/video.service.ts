import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { Video, VideoInput } from './models';

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
}

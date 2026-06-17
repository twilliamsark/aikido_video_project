import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { PublicVideo, PublicVideoList } from './models';

/** Guest-facing client for actively-shared videos (TECHNICAL_SPEC.md §7.2). */
@Injectable({ providedIn: 'root' })
export class PublicVideoService {
  private readonly http = inject(HttpClient);

  list(page = 1): Observable<PublicVideoList> {
    return this.http.get<PublicVideoList>('/api/public/videos', {
      params: new HttpParams().set('page', page),
    });
  }

  getByToken(token: string): Observable<PublicVideo> {
    return this.http
      .get<{ video: PublicVideo }>(`/api/public/videos/share/${token}`)
      .pipe(map((r) => r.video));
  }
}

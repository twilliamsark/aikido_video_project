import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { ListVideo, PublicFilterList, PublicVideo, PublicVideoList } from './models';

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

  getList(token: string): Observable<PublicFilterList> {
    return this.http
      .get<{ list: PublicFilterList }>(`/api/public/lists/${token}`)
      .pipe(map((r) => r.list));
  }

  /** A single video reachable through a shared filter list. */
  getListVideo(listToken: string, videoId: string): Observable<ListVideo> {
    return this.http
      .get<{ video: ListVideo }>(`/api/public/lists/${listToken}/videos/${videoId}`)
      .pipe(map((r) => r.video));
  }
}

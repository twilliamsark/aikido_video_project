import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { ListVideo, PublicFilterList, PublicListSummary, PublicVideo, PublicVideoList } from './models';

/** Guest-facing client for actively-shared videos (TECHNICAL_SPEC.md §7.2). */
@Injectable({ providedIn: 'root' })
export class PublicVideoService {
  private readonly http = inject(HttpClient);

  list(opts: { page?: number; q?: string; sort?: string; dir?: string } = {}): Observable<PublicVideoList> {
    let params = new HttpParams().set('page', opts.page ?? 1);
    if (opts.q) params = params.set('q', opts.q);
    if (opts.sort) params = params.set('sort', opts.sort);
    if (opts.dir) params = params.set('dir', opts.dir);
    return this.http.get<PublicVideoList>('/api/public/videos', { params });
  }

  /** Any video by id (the whole library is public). */
  getById(id: string): Observable<ListVideo> {
    return this.http
      .get<{ video: ListVideo }>(`/api/public/videos/${id}`)
      .pipe(map((r) => r.video));
  }

  /** A video by its individual vanity share token (/v/:token). */
  getByToken(token: string): Observable<PublicVideo> {
    return this.http
      .get<{ video: PublicVideo }>(`/api/public/videos/share/${token}`)
      .pipe(map((r) => r.video));
  }

  /** Public index of all actively-shared filter lists. */
  listLists(): Observable<PublicListSummary[]> {
    return this.http.get<{ lists: PublicListSummary[] }>('/api/public/lists').pipe(map((r) => r.lists));
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

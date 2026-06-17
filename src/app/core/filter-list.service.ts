import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { FilterList, FilterListInput, ShareInfo } from './models';

/** Teacher-facing filter-list CRUD + sharing (TECHNICAL_SPEC.md §7.3). */
@Injectable({ providedIn: 'root' })
export class FilterListService {
  private readonly http = inject(HttpClient);

  list(): Observable<FilterList[]> {
    return this.http.get<{ lists: FilterList[] }>('/api/lists').pipe(map((r) => r.lists));
  }

  get(id: string): Observable<FilterList> {
    return this.http.get<{ list: FilterList }>(`/api/lists/${id}`).pipe(map((r) => r.list));
  }

  create(input: FilterListInput): Observable<FilterList> {
    return this.http.post<{ list: FilterList }>('/api/lists', input).pipe(map((r) => r.list));
  }

  update(id: string, input: Partial<FilterListInput>): Observable<FilterList> {
    return this.http.patch<{ list: FilterList }>(`/api/lists/${id}`, input).pipe(map((r) => r.list));
  }

  remove(id: string): Observable<void> {
    return this.http.delete<{ ok: true }>(`/api/lists/${id}`).pipe(map(() => undefined));
  }

  share(id: string): Observable<ShareInfo> {
    return this.http
      .post<{ share: ShareInfo }>(`/api/lists/${id}/share`, {})
      .pipe(map((r) => r.share));
  }

  unshare(id: string): Observable<ShareInfo> {
    return this.http
      .post<{ share: ShareInfo }>(`/api/lists/${id}/unshare`, {})
      .pipe(map((r) => r.share));
  }
}

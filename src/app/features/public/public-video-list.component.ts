import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { PublicVideoService } from '../../core/public-video.service';
import { ListVideo } from '../../core/models';
import { VideoGridComponent } from '../../shared/video-grid.component';
import { PublicHeaderComponent } from '../../shared/public-header.component';

type SortKey = 'newest' | 'oldest' | 'title-asc' | 'title-desc';

const SORTS: Record<SortKey, { sort: string; dir: string }> = {
  newest: { sort: 'createdAt', dir: 'desc' },
  oldest: { sort: 'createdAt', dir: 'asc' },
  'title-asc': { sort: 'title', dir: 'asc' },
  'title-desc': { sort: 'title', dir: 'desc' },
};

/**
 * Public catalog (TECHNICAL_SPEC.md §6): a free-text search across title,
 * keywords, and description plus sort options, paginated. Filter/sort/page are
 * synced to the URL so views are shareable and back/forward works.
 */
@Component({
  selector: 'app-public-video-list',
  imports: [VideoGridComponent, PublicHeaderComponent],
  template: `
    <app-public-header />
    <div class="mx-auto max-w-5xl p-6">
      <div class="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 class="text-2xl font-semibold text-gray-900">All videos</h1>
        <div class="flex items-center gap-2">
          <input
            type="search"
            [value]="query()"
            (input)="onSearch($any($event.target).value)"
            placeholder="Search title, keywords, description…"
            class="w-56 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
          />
          <select
            [value]="sortKey()"
            (change)="onSort($any($event.target).value)"
            class="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="title-asc">Title A–Z</option>
            <option value="title-desc">Title Z–A</option>
          </select>
        </div>
      </div>

      @if (loading()) {
        <p class="text-gray-500">Loading…</p>
      } @else if (videos().length === 0) {
        <div class="rounded-lg border border-dashed border-gray-300 p-10 text-center text-gray-500">
          @if (query()) {
            No videos match “{{ query() }}”.
          } @else {
            No videos yet.
          }
        </div>
      } @else {
        <app-video-grid [videos]="videos()" />

        <div class="mt-8 flex items-center justify-center gap-4 text-sm">
          <button
            (click)="go(page() - 1)"
            [disabled]="page() <= 1"
            class="rounded-md border border-gray-300 px-3 py-1.5 disabled:opacity-40"
          >
            ← Prev
          </button>
          <span class="text-gray-500">Page {{ page() }} of {{ totalPages() }} · {{ total() }} videos</span>
          <button
            (click)="go(page() + 1)"
            [disabled]="page() >= totalPages()"
            class="rounded-md border border-gray-300 px-3 py-1.5 disabled:opacity-40"
          >
            Next →
          </button>
        </div>
      }
    </div>
  `,
})
export class PublicVideoListComponent {
  private readonly service = inject(PublicVideoService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly videos = signal<ListVideo[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly pageSize = signal(24);
  protected readonly loading = signal(true);
  protected readonly query = signal('');
  protected readonly sortKey = signal<SortKey>('newest');

  protected readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.total() / this.pageSize())),
  );

  private searchTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    // The URL is the source of truth; react to query-param changes (incl. back/fwd).
    this.route.queryParamMap.subscribe((params) => {
      this.query.set(params.get('q') ?? '');
      this.sortKey.set((params.get('sort') as SortKey) ?? 'newest');
      this.page.set(Number(params.get('page')) || 1);
      this.load();
    });
  }

  /** Debounced free-text search; resets to page 1. */
  protected onSearch(value: string): void {
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.navigate({ q: value || null, page: null }), 300);
  }

  protected onSort(value: SortKey): void {
    this.navigate({ sort: value === 'newest' ? null : value, page: null });
  }

  protected go(page: number): void {
    if (page < 1 || page > this.totalPages()) return;
    this.navigate({ page: page === 1 ? null : page });
  }

  private navigate(queryParams: Record<string, string | number | null>): void {
    this.router.navigate([], { relativeTo: this.route, queryParams, queryParamsHandling: 'merge' });
  }

  private load(): void {
    this.loading.set(true);
    const { sort, dir } = SORTS[this.sortKey()];
    this.service.list({ page: this.page(), q: this.query(), sort, dir }).subscribe({
      next: (res) => {
        this.videos.set(res.videos);
        this.total.set(res.total);
        this.pageSize.set(res.pageSize);
        this.loading.set(false);
        window.scrollTo({ top: 0 });
      },
      error: () => this.loading.set(false),
    });
  }
}

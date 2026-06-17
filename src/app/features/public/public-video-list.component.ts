import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PublicVideoService } from '../../core/public-video.service';
import { PublicVideo } from '../../core/models';

/**
 * Public catalog of actively-shared videos (TECHNICAL_SPEC.md §5.1, §6).
 * Filtering/sorting controls arrive in milestone 7; this lists newest-first
 * with pagination.
 */
@Component({
  selector: 'app-public-video-list',
  imports: [RouterLink],
  template: `
    <div class="mx-auto max-w-5xl p-6">
      <header class="mb-6 flex items-center justify-between">
        <h1 class="text-2xl font-semibold text-gray-900">Aikido Video Library</h1>
        <a routerLink="/login" class="text-sm text-gray-500 hover:underline">Teacher sign in</a>
      </header>

      @if (loading()) {
        <p class="text-gray-500">Loading…</p>
      } @else if (videos().length === 0) {
        <div class="rounded-lg border border-dashed border-gray-300 p-10 text-center text-gray-500">
          No videos have been shared yet.
        </div>
      } @else {
        <div class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          @for (video of videos(); track video.id) {
            <a
              [routerLink]="['/v', video.shareToken]"
              class="group overflow-hidden rounded-lg border border-gray-200 transition hover:shadow-md"
            >
              <div class="aspect-video w-full overflow-hidden bg-gray-100">
                <img
                  [src]="thumbnail(video)"
                  [alt]="video.title"
                  class="h-full w-full object-cover transition group-hover:scale-105"
                  loading="lazy"
                />
              </div>
              <div class="p-3">
                <h2 class="font-medium text-gray-900">{{ video.title }}</h2>
                @if (video.keywords.length) {
                  <div class="mt-2 flex flex-wrap gap-1">
                    @for (kw of video.keywords.slice(0, 6); track kw) {
                      <span class="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{{ kw }}</span>
                    }
                  </div>
                }
              </div>
            </a>
          }
        </div>

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

  protected readonly videos = signal<PublicVideo[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly pageSize = signal(24);
  protected readonly loading = signal(true);

  protected readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.total() / this.pageSize())),
  );

  constructor() {
    this.load(1);
  }

  protected thumbnail(v: PublicVideo): string {
    return `https://i.ytimg.com/vi/${v.youtubeVideoId}/hqdefault.jpg`;
  }

  protected go(page: number): void {
    if (page < 1 || page > this.totalPages()) return;
    this.load(page);
  }

  private load(page: number): void {
    this.loading.set(true);
    this.service.list(page).subscribe({
      next: (res) => {
        this.videos.set(res.videos);
        this.total.set(res.total);
        this.page.set(res.page);
        this.pageSize.set(res.pageSize);
        this.loading.set(false);
        window.scrollTo({ top: 0 });
      },
      error: () => this.loading.set(false),
    });
  }
}

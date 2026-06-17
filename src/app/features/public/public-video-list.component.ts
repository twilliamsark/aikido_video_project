import { Component, computed, inject, signal } from '@angular/core';
import { PublicVideoService } from '../../core/public-video.service';
import { ListVideo } from '../../core/models';
import { VideoGridComponent } from '../../shared/video-grid.component';
import { PublicHeaderComponent } from '../../shared/public-header.component';

/**
 * Public catalog of actively-shared videos (TECHNICAL_SPEC.md §5.1, §6).
 * Filtering/sorting controls arrive in milestone 7; this lists newest-first
 * with pagination.
 */
@Component({
  selector: 'app-public-video-list',
  imports: [VideoGridComponent, PublicHeaderComponent],
  template: `
    <app-public-header />
    <div class="mx-auto max-w-5xl p-6">
      <h1 class="mb-6 text-2xl font-semibold text-gray-900">All videos</h1>

      @if (loading()) {
        <p class="text-gray-500">Loading…</p>
      } @else if (videos().length === 0) {
        <div class="rounded-lg border border-dashed border-gray-300 p-10 text-center text-gray-500">
          No videos have been shared yet.
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

  protected readonly videos = signal<ListVideo[]>([]);
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

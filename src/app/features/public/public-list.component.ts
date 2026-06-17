import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PublicVideoService } from '../../core/public-video.service';
import { PublicFilterList } from '../../core/models';
import { RichTextViewerComponent } from '../../shared/rich-text-viewer.component';
import { VideoGridComponent } from '../../shared/video-grid.component';
import type { JSONContent } from '@tiptap/core';

/**
 * Public shared filter-list view (TECHNICAL_SPEC.md §5.2): the list name and
 * rich-text description above the videos its criteria resolve to.
 */
@Component({
  selector: 'app-public-list',
  imports: [RouterLink, RichTextViewerComponent, VideoGridComponent],
  template: `
    <div class="mx-auto max-w-5xl p-6">
      <a routerLink="/videos" class="text-sm text-gray-500 hover:underline">← All videos</a>

      @if (loading()) {
        <p class="mt-4 text-gray-500">Loading…</p>
      } @else if (!list()) {
        <div class="mt-8 rounded-lg border border-dashed border-gray-300 p-10 text-center text-gray-500">
          This list isn’t available. The share link may have been turned off.
        </div>
      } @else {
        <h1 class="mb-2 mt-2 text-2xl font-semibold text-gray-900">{{ list()!.name }}</h1>
        @if (list()!.descriptionJson) {
          <div class="mb-6 border-b border-gray-100 pb-4">
            <app-rich-text-viewer [doc]="descriptionDoc()" />
          </div>
        }

        @if (list()!.videos.length === 0) {
          <p class="text-gray-500">No videos match this list right now.</p>
        } @else {
          <app-video-grid [videos]="list()!.videos" [listToken]="token" />
        }
      }
    </div>
  `,
})
export class PublicListComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly service = inject(PublicVideoService);

  protected readonly list = signal<PublicFilterList | null>(null);
  protected readonly loading = signal(true);

  protected readonly token = this.route.snapshot.paramMap.get('token')!;

  protected readonly descriptionDoc = computed(
    () => (this.list()?.descriptionJson as JSONContent | null) ?? null,
  );

  constructor() {
    this.service.getList(this.token).subscribe({
      next: (l) => {
        this.list.set(l);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}

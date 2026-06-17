import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GridVideo } from '../core/models';

/**
 * Reusable card grid of public videos.
 * - On /videos each card links to the watch page by id (`/watch/:id`).
 * - On /list/:token (pass `listToken`) cards link to the list-scoped player
 *   (`/list/:token/v/:id`), so playback stays scoped to that list.
 */
@Component({
  selector: 'app-video-grid',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <div class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      @for (video of videos(); track video.id) {
        <a
          [routerLink]="linkFor(video)"
          class="group overflow-hidden rounded-lg border border-gray-200 transition hover:shadow-md"
        >
          <div class="aspect-video w-full overflow-hidden bg-gray-100">
            <img
              [src]="'https://i.ytimg.com/vi/' + video.youtubeVideoId + '/hqdefault.jpg'"
              [alt]="video.title"
              class="h-full w-full object-cover transition group-hover:scale-105"
              loading="lazy"
            />
          </div>
          <div class="p-3">
            <h2 class="font-medium text-gray-900">{{ video.title }}</h2>
            @if (video.descriptionText) {
              <p class="mt-1 truncate text-sm text-gray-500">{{ video.descriptionText }}</p>
            }
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
  `,
})
export class VideoGridComponent {
  readonly videos = input.required<GridVideo[]>();
  /** When set, cards link to the list-scoped player instead of /watch/:id. */
  readonly listToken = input<string | null>(null);

  protected linkFor(video: GridVideo): unknown[] {
    const token = this.listToken();
    return token ? ['/list', token, 'v', video.id] : ['/watch', video.id];
  }
}

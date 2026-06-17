import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { VideoService } from '../../core/video.service';
import { Video } from '../../core/models';

/** Admin video table: list, edit, delete, new (TECHNICAL_SPEC.md §8.2). */
@Component({
  selector: 'app-video-list',
  imports: [RouterLink, DatePipe],
  template: `
    <div class="mx-auto max-w-4xl p-6">
      <header class="mb-6 flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-semibold text-gray-900">Videos</h1>
          <p class="text-sm text-gray-500">Signed in as {{ auth.user()?.email }}</p>
        </div>
        <div class="flex items-center gap-3">
          <a
            routerLink="/admin/videos/new"
            class="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            + New video
          </a>
          <button
            (click)="signOut()"
            class="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Sign out
          </button>
        </div>
      </header>

      @if (loading()) {
        <p class="text-gray-500">Loading…</p>
      } @else if (videos().length === 0) {
        <div class="rounded-lg border border-dashed border-gray-300 p-10 text-center">
          <p class="text-gray-500">No videos yet.</p>
          <a routerLink="/admin/videos/new" class="mt-2 inline-block text-indigo-600 hover:underline">
            Create the first one
          </a>
        </div>
      } @else {
        <table class="w-full border-collapse text-left text-sm">
          <thead>
            <tr class="border-b border-gray-200 text-gray-500">
              <th class="py-2 pr-4 font-medium">Title</th>
              <th class="py-2 pr-4 font-medium">Keywords</th>
              <th class="py-2 pr-4 font-medium">Added</th>
              <th class="py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            @for (video of videos(); track video.id) {
              <tr class="border-b border-gray-100">
                <td class="py-3 pr-4 font-medium text-gray-900">{{ video.title }}</td>
                <td class="py-3 pr-4">
                  <span class="flex flex-wrap gap-1">
                    @for (kw of video.keywords; track kw) {
                      <span class="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{{ kw }}</span>
                    }
                  </span>
                </td>
                <td class="py-3 pr-4 text-gray-500">{{ video.createdAt | date: 'mediumDate' }}</td>
                <td class="py-3 text-right">
                  <a
                    [routerLink]="['/admin/videos', video.id]"
                    class="text-indigo-600 hover:underline"
                    >Edit</a
                  >
                  <button
                    (click)="remove(video)"
                    class="ml-4 text-red-600 hover:underline"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      }

      @if (errorMsg()) {
        <p class="mt-4 text-sm text-red-600">{{ errorMsg() }}</p>
      }
    </div>
  `,
})
export class VideoListComponent {
  protected readonly auth = inject(AuthService);
  private readonly videoService = inject(VideoService);

  protected readonly videos = signal<Video[]>([]);
  protected readonly loading = signal(true);
  protected readonly errorMsg = signal<string | null>(null);

  constructor() {
    this.reload();
  }

  private reload(): void {
    this.loading.set(true);
    this.videoService.list().subscribe({
      next: (v) => {
        this.videos.set(v);
        this.loading.set(false);
      },
      error: () => {
        this.errorMsg.set('Failed to load videos.');
        this.loading.set(false);
      },
    });
  }

  remove(video: Video): void {
    if (!confirm(`Delete "${video.title}"? This cannot be undone.`)) return;
    this.videoService.remove(video.id).subscribe({
      next: () => this.videos.update((list) => list.filter((v) => v.id !== video.id)),
      error: () => this.errorMsg.set('Failed to delete video.'),
    });
  }

  async signOut(): Promise<void> {
    await this.auth.signOut();
    location.href = '/login';
  }
}

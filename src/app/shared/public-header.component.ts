import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../core/auth.service';

/**
 * Shared header for all public (guest) pages. Provides consistent navigation and
 * an auth-aware action: signed-in teachers get an "Admin" link, guests get
 * "Teacher sign in". Loads the session itself so pages don't have to.
 */
@Component({
  selector: 'app-public-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <header class="border-b border-gray-200">
      <div class="mx-auto flex max-w-5xl items-center justify-between gap-4 p-4">
        <a routerLink="/videos" class="text-lg font-semibold text-gray-900">Aikido Video Library</a>
        <nav class="flex items-center gap-4 text-sm">
          <a
            routerLink="/videos"
            routerLinkActive="text-indigo-600 font-medium"
            [routerLinkActiveOptions]="{ exact: true }"
            class="text-gray-600 hover:underline"
            >All videos</a
          >
          <a
            routerLink="/lists"
            routerLinkActive="text-indigo-600 font-medium"
            class="text-gray-600 hover:underline"
            >Lists</a
          >
          @if (auth.isAuthenticated()) {
            <a routerLink="/admin/videos" class="text-gray-500 hover:underline">Admin</a>
          } @else {
            <a routerLink="/login" class="text-gray-500 hover:underline">Teacher sign in</a>
          }
        </nav>
      </div>
    </header>
  `,
})
export class PublicHeaderComponent {
  protected readonly auth = inject(AuthService);

  constructor() {
    void this.auth.ensureLoaded();
  }
}

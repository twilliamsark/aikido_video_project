import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../core/auth.service';

/**
 * Shared header for all admin pages: navigation between admin sections, a link
 * out to the public site, the signed-in teacher, and sign out.
 */
@Component({
  selector: 'app-admin-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <header class="border-b border-gray-200 bg-gray-50">
      <div class="mx-auto flex max-w-4xl items-center justify-between gap-4 p-4">
        <div class="flex items-center gap-4">
          <span class="text-lg font-semibold text-gray-900">Admin</span>
          <nav class="flex items-center gap-4 text-sm">
            <a
              routerLink="/admin/videos"
              routerLinkActive="text-indigo-600 font-medium"
              class="text-gray-600 hover:underline"
              >Videos</a
            >
            <a
              routerLink="/admin/lists"
              routerLinkActive="text-indigo-600 font-medium"
              class="text-gray-600 hover:underline"
              >Filter lists</a
            >
          </nav>
        </div>
        <div class="flex items-center gap-4 text-sm">
          <a routerLink="/videos" class="text-gray-600 hover:underline">View public site</a>
          @if (auth.user(); as user) {
            <span class="hidden text-gray-400 sm:inline">{{ user.email }}</span>
          }
          <button (click)="signOut()" class="text-gray-600 hover:underline">Sign out</button>
        </div>
      </div>
    </header>
  `,
})
export class AdminHeaderComponent {
  protected readonly auth = inject(AuthService);

  async signOut(): Promise<void> {
    await this.auth.signOut();
    location.href = '/login';
  }
}

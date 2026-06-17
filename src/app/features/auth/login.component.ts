import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';

/** Teacher sign-in / sign-up (email + password; TECHNICAL_SPEC.md §8.2). */
@Component({
  selector: 'app-login',
  imports: [FormsModule, RouterLink],
  template: `
    <div class="mx-auto mt-16 max-w-sm rounded-lg border border-gray-200 p-6 shadow-sm">
      <h1 class="mb-1 text-xl font-semibold text-gray-900">
        {{ mode() === 'signin' ? 'Teacher sign in' : 'Create teacher account' }}
      </h1>
      <p class="mb-6 text-sm text-gray-500">Aikido Video Library</p>

      <form (ngSubmit)="submit()" class="space-y-4">
        @if (mode() === 'signup') {
          <label class="block">
            <span class="text-sm font-medium text-gray-700">Name</span>
            <input
              name="name"
              [(ngModel)]="name"
              required
              class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </label>
        }
        <label class="block">
          <span class="text-sm font-medium text-gray-700">Email</span>
          <input
            name="email"
            type="email"
            [(ngModel)]="email"
            required
            class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
        </label>
        <label class="block">
          <span class="text-sm font-medium text-gray-700">Password</span>
          <input
            name="password"
            type="password"
            [(ngModel)]="password"
            required
            minlength="8"
            class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
        </label>

        @if (errorMsg()) {
          <p class="text-sm text-red-600">{{ errorMsg() }}</p>
        }

        <button
          type="submit"
          [disabled]="busy()"
          class="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {{ busy() ? 'Please wait…' : mode() === 'signin' ? 'Sign in' : 'Create account' }}
        </button>
      </form>

      <button
        (click)="toggleMode()"
        class="mt-4 text-sm text-indigo-600 hover:underline"
      >
        {{ mode() === 'signin' ? 'Need an account? Sign up' : 'Have an account? Sign in' }}
      </button>

      <div class="mt-4 border-t border-gray-100 pt-4">
        <a routerLink="/videos" class="text-sm text-gray-500 hover:underline">← Browse videos</a>
      </div>
    </div>
  `,
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly mode = signal<'signin' | 'signup'>('signin');
  protected readonly busy = signal(false);
  protected readonly errorMsg = signal<string | null>(null);

  protected name = '';
  protected email = 'admin@dojo.test';
  protected password = 'changeme123';

  toggleMode(): void {
    this.mode.set(this.mode() === 'signin' ? 'signup' : 'signin');
    this.errorMsg.set(null);
  }

  async submit(): Promise<void> {
    this.busy.set(true);
    this.errorMsg.set(null);
    try {
      if (this.mode() === 'signin') {
        await this.auth.signIn(this.email, this.password);
      } else {
        await this.auth.signUp(this.name, this.email, this.password);
      }
      await this.router.navigate(['/admin/videos']);
    } catch {
      this.errorMsg.set(
        this.mode() === 'signin'
          ? 'Invalid email or password.'
          : 'Could not create account. The email may already be in use.',
      );
    } finally {
      this.busy.set(false);
    }
  }
}

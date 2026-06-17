import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Teacher } from './models';

interface SessionResponse {
  user: Teacher | null;
}

/**
 * Wraps the better-auth REST endpoints (TECHNICAL_SPEC.md §2, §7.1). Holds the
 * current teacher in a signal; route guards consult `ensureLoaded()`.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  private readonly _user = signal<Teacher | null>(null);
  private loaded = false;

  readonly user = this._user.asReadonly();
  readonly isAuthenticated = computed(() => this._user() !== null);

  /** Loads the session once (cached); returns the current user or null. */
  async ensureLoaded(): Promise<Teacher | null> {
    if (!this.loaded) {
      await this.refresh();
    }
    return this._user();
  }

  async refresh(): Promise<Teacher | null> {
    try {
      const res = await firstValueFrom(
        this.http.get<SessionResponse>('/api/auth/get-session'),
      );
      this._user.set(res?.user ?? null);
    } catch {
      this._user.set(null);
    }
    this.loaded = true;
    return this._user();
  }

  async signIn(email: string, password: string): Promise<void> {
    await firstValueFrom(
      this.http.post('/api/auth/sign-in/email', { email, password }),
    );
    await this.refresh();
  }

  async signUp(name: string, email: string, password: string): Promise<void> {
    await firstValueFrom(
      this.http.post('/api/auth/sign-up/email', { name, email, password }),
    );
    await this.refresh();
  }

  async signOut(): Promise<void> {
    try {
      await firstValueFrom(this.http.post('/api/auth/sign-out', {}));
    } finally {
      this._user.set(null);
    }
  }
}

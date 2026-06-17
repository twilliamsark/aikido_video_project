import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * Protects /admin routes. Server endpoints enforce authorization independently;
 * this guard is UX only (TECHNICAL_SPEC.md §8.1, §9).
 */
export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const user = await auth.ensureLoaded();
  return user ? true : router.createUrlTree(['/login']);
};

import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'admin/videos', pathMatch: 'full' },
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'admin/videos',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/admin/video-list.component').then((m) => m.VideoListComponent),
  },
  {
    path: 'admin/videos/new',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/admin/video-form.component').then((m) => m.VideoFormComponent),
  },
  {
    path: 'admin/videos/:id',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/admin/video-form.component').then((m) => m.VideoFormComponent),
  },
  // Public student-facing routes (/videos, /v/:token, /list/:token) arrive in later milestones.
  { path: '**', redirectTo: 'admin/videos' },
];

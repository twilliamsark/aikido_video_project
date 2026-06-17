import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'videos', pathMatch: 'full' },
  {
    path: 'videos',
    loadComponent: () =>
      import('./features/public/public-video-list.component').then(
        (m) => m.PublicVideoListComponent,
      ),
  },
  {
    path: 'watch/:videoId',
    loadComponent: () =>
      import('./features/public/public-video.component').then((m) => m.PublicVideoComponent),
  },
  {
    path: 'v/:token',
    loadComponent: () =>
      import('./features/public/public-video.component').then((m) => m.PublicVideoComponent),
  },
  {
    path: 'lists',
    loadComponent: () =>
      import('./features/public/public-lists.component').then((m) => m.PublicListsComponent),
  },
  {
    path: 'list/:token',
    loadComponent: () =>
      import('./features/public/public-list.component').then((m) => m.PublicListComponent),
  },
  {
    path: 'list/:listToken/v/:videoId',
    loadComponent: () =>
      import('./features/public/public-video.component').then((m) => m.PublicVideoComponent),
  },
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
  {
    path: 'admin/lists',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/admin/filter-list-list.component').then((m) => m.FilterListListComponent),
  },
  {
    path: 'admin/lists/new',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/admin/filter-list-form.component').then((m) => m.FilterListFormComponent),
  },
  {
    path: 'admin/lists/:id',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/admin/filter-list-form.component').then((m) => m.FilterListFormComponent),
  },
  // Shared filter-list route (/list/:token) arrives in milestone 6.
  { path: '**', redirectTo: 'videos' },
];

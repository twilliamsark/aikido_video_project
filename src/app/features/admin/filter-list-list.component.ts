import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FilterListService } from '../../core/filter-list.service';
import { FilterList } from '../../core/models';
import { AdminHeaderComponent } from '../../shared/admin-header.component';

/** Admin management of filter lists (TECHNICAL_SPEC.md §8.2). */
@Component({
  selector: 'app-filter-list-list',
  imports: [RouterLink, DatePipe, AdminHeaderComponent],
  template: `
    <app-admin-header />
    <div class="mx-auto max-w-4xl p-6">
      <header class="mb-6 flex items-center justify-between">
        <h1 class="text-2xl font-semibold text-gray-900">Filter lists</h1>
        <a
          routerLink="/admin/lists/new"
          class="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          + New list
        </a>
      </header>

      @if (loading()) {
        <p class="text-gray-500">Loading…</p>
      } @else if (lists().length === 0) {
        <div class="rounded-lg border border-dashed border-gray-300 p-10 text-center">
          <p class="text-gray-500">No filter lists yet.</p>
          <a routerLink="/admin/lists/new" class="mt-2 inline-block text-indigo-600 hover:underline">
            Create the first one
          </a>
        </div>
      } @else {
        <table class="w-full border-collapse text-left text-sm">
          <thead>
            <tr class="border-b border-gray-200 text-gray-500">
              <th class="py-2 pr-4 font-medium">Name</th>
              <th class="py-2 pr-4 font-medium">Sharing</th>
              <th class="py-2 pr-4 font-medium">Added</th>
              <th class="py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            @for (list of lists(); track list.id) {
              <tr class="border-b border-gray-100">
                <td class="py-3 pr-4 font-medium text-gray-900">{{ list.name }}</td>
                <td class="py-3 pr-4">
                  @if (list.shared) {
                    <div class="flex items-center gap-2">
                      <span class="inline-flex items-center gap-1 text-xs font-medium text-green-700">
                        <span class="h-1.5 w-1.5 rounded-full bg-green-500"></span> Shared
                      </span>
                      <button (click)="copyLink(list)" class="text-xs text-indigo-600 hover:underline">
                        {{ copiedId() === list.id ? 'Copied!' : 'Copy link' }}
                      </button>
                      <button (click)="toggleShare(list)" class="text-xs text-gray-500 hover:underline">
                        Unshare
                      </button>
                    </div>
                  } @else {
                    <button (click)="toggleShare(list)" class="text-xs text-indigo-600 hover:underline">
                      Share
                    </button>
                  }
                </td>
                <td class="py-3 pr-4 text-gray-500">{{ list.createdAt | date: 'mediumDate' }}</td>
                <td class="py-3 text-right">
                  <a [routerLink]="['/admin/lists', list.id]" class="text-indigo-600 hover:underline">Edit</a>
                  <button (click)="remove(list)" class="ml-4 text-red-600 hover:underline">Delete</button>
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
export class FilterListListComponent {
  private readonly service = inject(FilterListService);

  protected readonly lists = signal<FilterList[]>([]);
  protected readonly loading = signal(true);
  protected readonly errorMsg = signal<string | null>(null);
  protected readonly copiedId = signal<string | null>(null);

  constructor() {
    this.reload();
  }

  private reload(): void {
    this.loading.set(true);
    this.service.list().subscribe({
      next: (l) => {
        this.lists.set(l);
        this.loading.set(false);
      },
      error: () => {
        this.errorMsg.set('Failed to load lists.');
        this.loading.set(false);
      },
    });
  }

  toggleShare(list: FilterList): void {
    const req$ = list.shared ? this.service.unshare(list.id) : this.service.share(list.id);
    req$.subscribe({
      next: (share) =>
        this.lists.update((items) =>
          items.map((l) =>
            l.id === list.id ? { ...l, shared: share.active, shareToken: share.token } : l,
          ),
        ),
      error: () => this.errorMsg.set('Failed to update sharing.'),
    });
  }

  copyLink(list: FilterList): void {
    if (!list.shareToken) return;
    navigator.clipboard?.writeText(`${location.origin}/list/${list.shareToken}`);
    this.copiedId.set(list.id);
    setTimeout(() => this.copiedId.set(null), 1500);
  }

  remove(list: FilterList): void {
    if (!confirm(`Delete "${list.name}"?`)) return;
    this.service.remove(list.id).subscribe({
      next: () => this.lists.update((items) => items.filter((l) => l.id !== list.id)),
      error: () => this.errorMsg.set('Failed to delete list.'),
    });
  }
}

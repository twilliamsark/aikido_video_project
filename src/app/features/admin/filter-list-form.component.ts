import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { JSONContent } from '@tiptap/core';
import { FilterListService } from '../../core/filter-list.service';
import { FilterCriteria, FilterListInput } from '../../core/models';
import { RichTextEditorComponent } from '../../shared/rich-text-editor.component';

/** Create/edit a filter list: name, criteria, and a rich-text description. */
@Component({
  selector: 'app-filter-list-form',
  imports: [FormsModule, RouterLink, RichTextEditorComponent],
  template: `
    <div class="mx-auto max-w-2xl p-6">
      <a routerLink="/admin/lists" class="text-sm text-gray-500 hover:underline">← Back to lists</a>
      <h1 class="mb-6 mt-2 text-2xl font-semibold text-gray-900">
        {{ isNew() ? 'New filter list' : 'Edit filter list' }}
      </h1>

      @if (loading()) {
        <p class="text-gray-500">Loading…</p>
      } @else {
        <form (ngSubmit)="save()" class="space-y-5">
          <label class="block">
            <span class="text-sm font-medium text-gray-700">Name</span>
            <input
              name="name"
              [(ngModel)]="name"
              required
              class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </label>

          <fieldset class="rounded-md border border-gray-200 p-4">
            <legend class="px-1 text-sm font-medium text-gray-700">Criteria</legend>
            <div class="space-y-4">
              <label class="block">
                <span class="text-xs font-medium text-gray-600">Search text</span>
                <input
                  name="query"
                  [(ngModel)]="query"
                  placeholder="e.g. ikkyo omote"
                  class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
                <span class="mt-1 block text-xs text-gray-400">
                  All words must match the title, a keyword, or the description.
                </span>
              </label>

              <label class="block">
                <span class="text-xs font-medium text-gray-600">Required keywords</span>
                <input
                  name="keywords"
                  [(ngModel)]="keywordsCsv"
                  placeholder="ikkyo, omote"
                  class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
                <span class="mt-1 block text-xs text-gray-400">Comma-separated; a video must have all of them.</span>
              </label>

              <div class="flex gap-3">
                <label class="block">
                  <span class="text-xs font-medium text-gray-600">Sort by</span>
                  <select
                    name="sortField"
                    [(ngModel)]="sortField"
                    class="mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="createdAt">Date added</option>
                    <option value="title">Title</option>
                  </select>
                </label>
                <label class="block">
                  <span class="text-xs font-medium text-gray-600">Direction</span>
                  <select
                    name="sortDir"
                    [(ngModel)]="sortDir"
                    class="mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="desc">Descending</option>
                    <option value="asc">Ascending</option>
                  </select>
                </label>
              </div>
            </div>
          </fieldset>

          <div class="block">
            <span class="mb-1 block text-sm font-medium text-gray-700">Description</span>
            <app-rich-text-editor [value]="descriptionDoc()" (valueChange)="descriptionDoc.set($event)" />
          </div>

          @if (errorMsg()) {
            <p class="text-sm text-red-600">{{ errorMsg() }}</p>
          }

          <div class="flex items-center gap-3">
            <button
              type="submit"
              [disabled]="busy()"
              class="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {{ busy() ? 'Saving…' : 'Save' }}
            </button>
            <a routerLink="/admin/lists" class="text-sm text-gray-500 hover:underline">Cancel</a>
          </div>
        </form>
      }
    </div>
  `,
})
export class FilterListFormComponent {
  private readonly service = inject(FilterListService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly isNew = signal(true);
  protected readonly loading = signal(false);
  protected readonly busy = signal(false);
  protected readonly errorMsg = signal<string | null>(null);

  protected name = '';
  protected query = '';
  protected keywordsCsv = '';
  protected sortField: 'title' | 'createdAt' = 'createdAt';
  protected sortDir: 'asc' | 'desc' = 'desc';
  protected readonly descriptionDoc = signal<JSONContent | null>(null);

  private id: string | null = null;

  constructor() {
    const param = this.route.snapshot.paramMap.get('id');
    if (param && param !== 'new') {
      this.id = param;
      this.isNew.set(false);
      this.loadExisting(param);
    }
  }

  private loadExisting(id: string): void {
    this.loading.set(true);
    this.service.get(id).subscribe({
      next: (l) => {
        this.name = l.name;
        this.query = l.criteria.query ?? '';
        this.keywordsCsv = l.criteria.keywords.join(', ');
        this.sortField = l.criteria.sort.field;
        this.sortDir = l.criteria.sort.dir;
        this.descriptionDoc.set((l.descriptionJson as JSONContent | null) ?? null);
        this.loading.set(false);
      },
      error: () => {
        this.errorMsg.set('Failed to load list.');
        this.loading.set(false);
      },
    });
  }

  private docHasContent(node: JSONContent | null): boolean {
    if (!node) return false;
    if (typeof node.text === 'string' && node.text.trim().length > 0) return true;
    if (node.type === 'horizontalRule') return true;
    return Array.isArray(node.content) && node.content.some((c) => this.docHasContent(c));
  }

  save(): void {
    this.busy.set(true);
    this.errorMsg.set(null);

    const criteria: FilterCriteria = {
      query: this.query.trim() || null,
      keywords: this.keywordsCsv
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean),
      sort: { field: this.sortField, dir: this.sortDir },
    };
    const doc = this.descriptionDoc();
    const input: FilterListInput = {
      name: this.name.trim(),
      descriptionJson: this.docHasContent(doc) ? doc : null,
      criteria,
    };

    const request$ = this.isNew()
      ? this.service.create(input)
      : this.service.update(this.id!, input);

    request$.subscribe({
      next: () => this.router.navigate(['/admin/lists']),
      error: (err) => {
        this.errorMsg.set(err?.error?.error?.message ?? 'Failed to save list.');
        this.busy.set(false);
      },
    });
  }
}

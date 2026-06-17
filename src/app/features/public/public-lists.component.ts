import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PublicVideoService } from '../../core/public-video.service';
import { PublicListSummary } from '../../core/models';
import { RichTextViewerComponent } from '../../shared/rich-text-viewer.component';
import { PublicHeaderComponent } from '../../shared/public-header.component';
import type { JSONContent } from '@tiptap/core';

/**
 * Public index of shared filter lists (TECHNICAL_SPEC.md §5.2): list name, a
 * link to the list, and its description.
 */
@Component({
  selector: 'app-public-lists',
  imports: [RouterLink, RichTextViewerComponent, PublicHeaderComponent],
  template: `
    <app-public-header />
    <div class="mx-auto max-w-4xl p-6">
      <h1 class="mb-6 text-2xl font-semibold text-gray-900">Video lists</h1>

      @if (loading()) {
        <p class="text-gray-500">Loading…</p>
      } @else if (lists().length === 0) {
        <div class="rounded-lg border border-dashed border-gray-300 p-10 text-center text-gray-500">
          No lists have been shared yet.
        </div>
      } @else {
        <table class="w-full border-collapse text-left text-sm">
          <thead>
            <tr class="border-b border-gray-200 text-gray-500">
              <th class="py-2 pr-4 font-medium">List name</th>
              <th class="py-2 pr-4 font-medium">Link</th>
              <th class="py-2 font-medium">Description</th>
            </tr>
          </thead>
          <tbody>
            @for (list of lists(); track list.token) {
              <tr class="border-b border-gray-100 align-top">
                <td class="py-3 pr-4 font-medium text-gray-900">
                  <a [routerLink]="['/list', list.token]" class="text-indigo-600 hover:underline">
                    {{ list.name }}
                  </a>
                </td>
                <td class="py-3 pr-4">
                  <a [routerLink]="['/list', list.token]" class="text-gray-500 hover:underline">Open</a>
                </td>
                <td class="py-3 text-gray-700">
                  @if (list.descriptionJson) {
                    <app-rich-text-viewer [doc]="docFor(list)" />
                  } @else {
                    <span class="text-gray-400">—</span>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      }
    </div>
  `,
})
export class PublicListsComponent {
  private readonly service = inject(PublicVideoService);

  protected readonly lists = signal<PublicListSummary[]>([]);
  protected readonly loading = signal(true);

  constructor() {
    this.service.listLists().subscribe({
      next: (l) => {
        this.lists.set(l);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  protected docFor(list: PublicListSummary): JSONContent | null {
    return (list.descriptionJson as JSONContent | null) ?? null;
  }
}

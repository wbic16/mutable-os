import type { ExistingBlockDto } from '../block-tree/types';

/** Shared native tab targets; the application never owns duplicate Documents. */
export function createDocumentApplicationTabs(type: string, documents: readonly {id: string; title: string}[]): ExistingBlockDto {
  return { id: crypto.randomUUID(), type, metadata: {}, children: [{
    id: crypto.randomUUID(), type: 'tab-row-block', children: documents.map(doc => ({
      id: crypto.randomUUID(), type: 'tab-block', metadata: { name: doc.title, documentTarget: { version: 1, documentId: doc.id } },
    })),
  }] };
}

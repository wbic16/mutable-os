import type { ExistingBlockDto } from '../../block-tree/types';
import { createDocumentApplicationTabs } from '../../application/document-application-tabs';

export function createFlintDocumentTabs(documents: readonly { id: string; title: string }[]): ExistingBlockDto {
  return createDocumentApplicationTabs('flint-application-block', documents);
}

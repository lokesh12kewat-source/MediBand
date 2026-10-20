/**
 * providers/mock-recall.ts
 * [SIMULATED PROVIDER] — Mock recall database.
 *
 * Returns no active recalls for any demo GTIN.
 * Architecture placeholder — replace with real recall API provider in production.
 */

import { RecallProvider, RecallResult } from '@/types';

export const mockRecallProvider: RecallProvider = {
  name: 'Mock Recall Database',
  isSimulated: true,
  async check(_gtin: string, _batch: string): Promise<RecallResult> {
    await new Promise(r => setTimeout(r, 30)); // simulated latency
    return { recalled: false };
  },
};

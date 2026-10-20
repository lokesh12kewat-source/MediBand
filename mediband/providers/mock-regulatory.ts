import { RegulatoryProvider, RegulatoryResult, RecallProvider, RecallResult } from '@/types';

/**
 * Mock Regulatory Provider — DEMO DATA / SIMULATED PROVIDER
 *
 * Simulates a regulatory database check.
 * Does NOT represent any real regulatory authority (FDA, EMA, TGA, etc.).
 */
export const mockRegulatoryProvider: RegulatoryProvider = {
  name: 'Demo Regulatory Database',
  isSimulated: true,

  async check(gtin: string, _batch: string): Promise<RegulatoryResult> {
    await new Promise(r => setTimeout(r, 150));
    // Demo: the main demo GTIN is "registered"
    const registered = gtin === '09312345678901';
    return {
      registered,
      registrationNumber: registered ? 'DEMO-REG-2024-001' : undefined,
      notes: 'SIMULATED PROVIDER — not a real regulatory database.',
    };
  },
};

/**
 * Mock Recall Provider — DEMO DATA / SIMULATED PROVIDER
 *
 * Simulates a recall/safety alert database.
 * Does NOT represent any real recall authority.
 */
export const mockRecallProvider: RecallProvider = {
  name: 'Demo Recall Database',
  isSimulated: true,

  async check(_gtin: string, _batch: string): Promise<RecallResult> {
    await new Promise(r => setTimeout(r, 100));
    // Demo: nothing recalled
    return {
      recalled: false,
      notes: 'SIMULATED PROVIDER — not a real recall database.',
    } as RecallResult;
  },
};

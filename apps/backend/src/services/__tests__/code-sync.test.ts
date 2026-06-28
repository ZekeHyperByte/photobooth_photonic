import { describe, it, expect } from 'vitest';
import { toUsageReports, nextUsedWatermark } from '../code-sync-service';
import type { BoothCode } from '../../db/schema';

const mkCode = (over: Partial<BoothCode> = {}): BoothCode =>
  ({
    id: '1234',
    code: '1234',
    status: 'used',
    generatedBy: 'central',
    generatedAt: new Date('2026-06-01T00:00:00Z'),
    usedAt: new Date('2026-06-02T10:00:00Z'),
    usedBySessionId: 'sess-1',
    metadata: null,
    ...over,
  }) as BoothCode;

describe('toUsageReports', () => {
  it('maps used codes to wire reports with ISO usedAt', () => {
    expect(toUsageReports([mkCode()])).toEqual([
      { code: '1234', sessionId: 'sess-1', usedAt: '2026-06-02T10:00:00.000Z' },
    ]);
  });

  it('tolerates null usedAt / session', () => {
    const r = toUsageReports([mkCode({ usedAt: null, usedBySessionId: null })]);
    expect(r[0]).toEqual({ code: '1234', sessionId: null, usedAt: null });
  });
});

describe('nextUsedWatermark', () => {
  it('returns the latest usedAt in the batch', () => {
    const rows = [
      mkCode({ code: 'a', usedAt: new Date('2026-06-02T10:00:00Z') }),
      mkCode({ code: 'b', usedAt: new Date('2026-06-05T12:00:00Z') }),
      mkCode({ code: 'c', usedAt: new Date('2026-06-01T09:00:00Z') }),
    ];
    expect(nextUsedWatermark(rows, new Date(0)).toISOString()).toBe('2026-06-05T12:00:00.000Z');
  });

  it('keeps current when nothing newer', () => {
    const current = new Date('2026-06-10T00:00:00Z');
    expect(nextUsedWatermark([mkCode()], current)).toBe(current);
  });
});

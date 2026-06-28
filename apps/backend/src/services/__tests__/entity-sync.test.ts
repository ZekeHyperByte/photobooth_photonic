import { describe, it, expect } from 'vitest';
import { nextWatermark, sessionDTO, photoDTO } from '../entity-sync-service';
import type { Session, Photo } from '../../db/schema';

const session = (over: Partial<Session> = {}): Session =>
  ({
    id: 's1',
    packageId: 'pkg1',
    boothCodeId: null,
    status: 'completed',
    phoneNumber: null,
    startedAt: new Date('2026-06-01T10:00:00Z'),
    completedAt: new Date('2026-06-01T10:05:00Z'),
    metadata: null,
    ...over,
  }) as Session;

describe('nextWatermark', () => {
  it('returns the latest completedAt in the batch', () => {
    const rows = [
      session({ completedAt: new Date('2026-06-01T10:05:00Z') }),
      session({ id: 's2', completedAt: new Date('2026-06-02T12:00:00Z') }),
      session({ id: 's3', completedAt: new Date('2026-06-01T09:00:00Z') }),
    ];
    expect(nextWatermark(rows, new Date(0)).toISOString()).toBe('2026-06-02T12:00:00.000Z');
  });

  it('keeps the current watermark when no row is newer', () => {
    const current = new Date('2026-06-10T00:00:00Z');
    const rows = [session({ completedAt: new Date('2026-06-01T10:05:00Z') })];
    expect(nextWatermark(rows, current)).toBe(current);
  });

  it('ignores null completedAt', () => {
    const current = new Date('2026-06-05T00:00:00Z');
    expect(nextWatermark([session({ completedAt: null })], current)).toBe(current);
  });
});

describe('mappers serialize dates to ISO and tolerate nulls', () => {
  it('sessionDTO', () => {
    const d = sessionDTO(session({ completedAt: null }));
    expect(d.startedAt).toBe('2026-06-01T10:00:00.000Z');
    expect(d.completedAt).toBeNull();
    expect(d.id).toBe('s1');
  });

  it('photoDTO', () => {
    const p = {
      id: 'ph1',
      sessionId: 's1',
      sequenceNumber: 2,
      version: 1,
      isRetake: false,
      processingStatus: 'completed',
      templateId: null,
      filterId: null,
      captureTime: new Date('2026-06-01T10:01:00Z'),
    } as Photo;
    const d = photoDTO(p);
    expect(d.captureTime).toBe('2026-06-01T10:01:00.000Z');
    expect(d.sequenceNumber).toBe(2);
  });
});

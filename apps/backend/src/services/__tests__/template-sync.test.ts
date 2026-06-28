import { describe, it, expect } from 'vitest';
import path from 'path';
import {
  needsDownload,
  templateLocalPaths,
  templateValues,
  type TemplateDTO,
} from '../template-sync-service';

const dto = (over: Partial<TemplateDTO> = {}): TemplateDTO => ({
  id: 't1',
  name: 'Frame A',
  description: null,
  templateType: 'overlay',
  positionData: [{ x: 0, y: 0 }],
  photoCount: 3,
  canvasWidth: 3508,
  canvasHeight: 4960,
  paperSize: 'A3',
  fileUrl: 'https://central/api/host/file/templates/t1/frame.png',
  thumbnailUrl: null,
  isActive: true,
  displayOrder: 0,
  updatedAt: '2026-06-10T00:00:00.000Z',
  ...over,
});

describe('needsDownload', () => {
  const remote = new Date('2026-06-10T00:00:00Z');

  it('downloads when the frame file is missing', () => {
    expect(needsDownload(false, new Date('2026-06-11T00:00:00Z'), remote)).toBe(true);
  });
  it('downloads when there is no local row yet', () => {
    expect(needsDownload(true, null, remote)).toBe(true);
  });
  it('downloads when central is newer', () => {
    expect(needsDownload(true, new Date('2026-06-09T00:00:00Z'), remote)).toBe(true);
  });
  it('skips when local is up to date', () => {
    expect(needsDownload(true, new Date('2026-06-10T00:00:00Z'), remote)).toBe(false);
  });
});

describe('templateLocalPaths', () => {
  it('nests frame/thumb under <baseDir>/<id>', () => {
    const p = templateLocalPaths('/data/templates', 't1');
    expect(p.framePath).toBe(path.join('/data/templates', 't1', 'frame.png'));
    expect(p.thumbPath).toBe(path.join('/data/templates', 't1', 'thumb.png'));
  });
});

describe('templateValues', () => {
  it('rewrites filePath to local and parses updatedAt', () => {
    const v = templateValues(dto(), '/data/templates/t1/frame.png', null);
    expect(v.filePath).toBe('/data/templates/t1/frame.png'); // local, not the central URL
    expect(v.thumbnailPath).toBeNull();
    expect(v.updatedAt).toEqual(new Date('2026-06-10T00:00:00.000Z'));
    expect(v.positionData).toEqual([{ x: 0, y: 0 }]);
  });
});

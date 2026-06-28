import { describe, it, expect, beforeEach } from 'vitest';
import {
  packageValues,
  upsertPackages,
  type PackageDTO,
} from '../config-sync-service';

const pkg = (over: Partial<PackageDTO> = {}): PackageDTO => ({
  id: 'p1',
  name: 'Basic',
  description: null,
  photoCount: 3,
  price: 25000,
  currency: 'IDR',
  isActive: true,
  displayOrder: 0,
  ...over,
});

// --- pure builder (runs everywhere; no native driver) ----------------------
describe('packageValues', () => {
  it('defaults currency to IDR and coalesces description', () => {
    const v = packageValues(pkg({ currency: undefined, description: undefined }));
    expect(v.currency).toBe('IDR');
    expect(v.description).toBeNull();
  });

  it('passes through provided fields', () => {
    const v = packageValues(pkg({ price: 50000, isActive: false }));
    expect(v.price).toBe(50000);
    expect(v.isActive).toBe(false);
    expect(v.id).toBe('p1');
  });
});

// --- DB integration: needs the better-sqlite3 native addon -----------------
// Self-skips where the prebuilt binary can't load (e.g. bleeding-edge node ABI),
// so the suite stays green; runs on the project's supported node in CI.
let Database: any;
let drizzle: any;
let schema: any;
let nativeOk = false;
try {
  Database = require('better-sqlite3');
  ({ drizzle } = require('drizzle-orm/better-sqlite3'));
  schema = require('../../db/schema');
  new Database(':memory:').close();
  nativeOk = true;
} catch {
  nativeOk = false;
}

function makeDb() {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE packages (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      photo_count INTEGER NOT NULL,
      price INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'IDR',
      is_active INTEGER NOT NULL DEFAULT 1,
      display_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER DEFAULT 0,
      updated_at INTEGER DEFAULT 0
    );
  `);
  return { db: drizzle(sqlite, { schema }), sqlite };
}

describe.skipIf(!nativeOk)('upsertPackages (sqlite)', () => {
  let ctx: ReturnType<typeof makeDb>;
  beforeEach(() => {
    ctx = makeDb();
  });

  it('inserts new rows', () => {
    upsertPackages(ctx.db, [pkg(), pkg({ id: 'p2', name: 'Pro', price: 50000 })]);
    const rows = ctx.sqlite.prepare('SELECT id, name, price FROM packages ORDER BY id').all();
    expect(rows).toEqual([
      { id: 'p1', name: 'Basic', price: 25000 },
      { id: 'p2', name: 'Pro', price: 50000 },
    ]);
  });

  it('updates existing rows on conflict', () => {
    upsertPackages(ctx.db, [pkg()]);
    upsertPackages(ctx.db, [pkg({ price: 30000, isActive: false })]);
    const row = ctx.sqlite.prepare('SELECT price, is_active FROM packages WHERE id = ?').get('p1');
    expect(row).toEqual({ price: 30000, is_active: 0 });
  });

  it('never deletes rows missing from the pull', () => {
    upsertPackages(ctx.db, [pkg(), pkg({ id: 'p2', name: 'Pro' })]);
    upsertPackages(ctx.db, [pkg({ price: 99000 })]); // p2 absent -> must survive
    const ids = ctx.sqlite.prepare('SELECT id FROM packages ORDER BY id').all();
    expect(ids).toEqual([{ id: 'p1' }, { id: 'p2' }]);
  });
});

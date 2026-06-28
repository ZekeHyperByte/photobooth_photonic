import { sql } from './db';

// Phase 2: central is the source of truth for booth config (packages, filters).
// Booths pull these and cache locally. Admin editing UI is a later slice; for
// now rows are managed directly (seed / SQL / dashboard).

export async function initConfigTables(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS config_packages (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      photo_count INTEGER NOT NULL,
      price INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'IDR',
      is_active BOOLEAN NOT NULL DEFAULT true,
      display_order INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS config_filters (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      filter_config JSONB NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT true,
      display_order INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;
}

export interface PackageDTO {
  id: string;
  name: string;
  description: string | null;
  photoCount: number;
  price: number;
  currency: string;
  isActive: boolean;
  displayOrder: number;
}

export interface FilterDTO {
  id: string;
  name: string;
  description: string | null;
  filterConfig: unknown;
  isActive: boolean;
  displayOrder: number;
}

export async function getPackages(): Promise<PackageDTO[]> {
  const rows = await sql<any[]>`
    SELECT id, name, description, photo_count, price, currency, is_active, display_order
    FROM config_packages ORDER BY display_order
  `;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    photoCount: r.photo_count,
    price: r.price,
    currency: r.currency,
    isActive: r.is_active,
    displayOrder: r.display_order,
  }));
}

export async function getFilters(): Promise<FilterDTO[]> {
  const rows = await sql<any[]>`
    SELECT id, name, description, filter_config, is_active, display_order
    FROM config_filters ORDER BY display_order
  `;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    filterConfig: r.filter_config,
    isActive: r.is_active,
    displayOrder: r.display_order,
  }));
}

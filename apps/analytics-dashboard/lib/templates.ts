import { sql } from './db';

// Templates slice: central is source of truth for templates. Rows carry the
// frame/thumbnail as blob URLs (stored via lib/storage). Booths pull the rows
// and download the images to local disk (image-processor reads filePath locally).

export async function initTemplatesTable(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS config_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      template_type TEXT NOT NULL DEFAULT 'overlay',
      position_data JSONB,
      photo_count INTEGER NOT NULL DEFAULT 3,
      canvas_width INTEGER NOT NULL DEFAULT 3508,
      canvas_height INTEGER NOT NULL DEFAULT 4960,
      paper_size TEXT NOT NULL DEFAULT 'A3',
      file_url TEXT NOT NULL,
      thumbnail_url TEXT,
      is_active BOOLEAN NOT NULL DEFAULT true,
      display_order INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;
}

export interface TemplateDTO {
  id: string;
  name: string;
  description: string | null;
  templateType: string;
  positionData: unknown;
  photoCount: number;
  canvasWidth: number;
  canvasHeight: number;
  paperSize: string;
  fileUrl: string;
  thumbnailUrl: string | null;
  isActive: boolean;
  displayOrder: number;
  updatedAt: string;
}

export async function getTemplates(): Promise<TemplateDTO[]> {
  const rows = await sql<any[]>`
    SELECT id, name, description, template_type, position_data, photo_count,
           canvas_width, canvas_height, paper_size, file_url, thumbnail_url,
           is_active, display_order, updated_at
    FROM config_templates ORDER BY display_order
  `;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    templateType: r.template_type,
    positionData: r.position_data,
    photoCount: r.photo_count,
    canvasWidth: r.canvas_width,
    canvasHeight: r.canvas_height,
    paperSize: r.paper_size,
    fileUrl: r.file_url,
    thumbnailUrl: r.thumbnail_url,
    isActive: r.is_active,
    displayOrder: r.display_order,
    updatedAt: (r.updated_at instanceof Date ? r.updated_at : new Date(r.updated_at)).toISOString(),
  }));
}

export interface UpsertTemplateInput {
  id: string;
  name: string;
  description?: string | null;
  templateType?: string;
  positionData?: unknown;
  photoCount?: number;
  canvasWidth?: number;
  canvasHeight?: number;
  paperSize?: string;
  fileUrl: string;
  thumbnailUrl?: string | null;
  displayOrder?: number;
}

export async function upsertTemplate(t: UpsertTemplateInput): Promise<void> {
  await sql`
    INSERT INTO config_templates (
      id, name, description, template_type, position_data, photo_count,
      canvas_width, canvas_height, paper_size, file_url, thumbnail_url,
      display_order, updated_at
    ) VALUES (
      ${t.id}, ${t.name}, ${t.description ?? null}, ${t.templateType ?? 'overlay'},
      ${t.positionData ? sql.json(t.positionData as any) : null}, ${t.photoCount ?? 3},
      ${t.canvasWidth ?? 3508}, ${t.canvasHeight ?? 4960}, ${t.paperSize ?? 'A3'},
      ${t.fileUrl}, ${t.thumbnailUrl ?? null}, ${t.displayOrder ?? 0}, CURRENT_TIMESTAMP
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      description = EXCLUDED.description,
      template_type = EXCLUDED.template_type,
      position_data = EXCLUDED.position_data,
      photo_count = EXCLUDED.photo_count,
      canvas_width = EXCLUDED.canvas_width,
      canvas_height = EXCLUDED.canvas_height,
      paper_size = EXCLUDED.paper_size,
      file_url = EXCLUDED.file_url,
      thumbnail_url = EXCLUDED.thumbnail_url,
      display_order = EXCLUDED.display_order,
      updated_at = CURRENT_TIMESTAMP
  `;
}

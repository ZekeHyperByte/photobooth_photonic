import fs from 'fs/promises';
import path from 'path';

// Phase 3: blob storage for hosted photos.
// - Production: Vercel Blob (set BLOB_READ_WRITE_TOKEN).
// - Dev / no token: local disk under .data/hosted, served by the file route.
// Same interface either way so the upload route doesn't care.

export interface PutResult {
  url: string; // absolute URL the download page / QR can use
  key: string;
}

export interface Storage {
  put(key: string, bytes: Buffer, contentType: string): Promise<PutResult>;
}

const LOCAL_ROOT = path.join(process.cwd(), '.data', 'hosted');

export class LocalDiskStorage implements Storage {
  constructor(private baseUrl: string) {}

  async put(key: string, bytes: Buffer): Promise<PutResult> {
    const full = path.join(LOCAL_ROOT, key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, bytes);
    return { url: `${this.baseUrl}/api/host/file/${key}`, key };
  }
}

/** Resolve a local-stored key back to bytes (used by the file-serving route). */
export async function readLocal(key: string): Promise<Buffer> {
  const full = path.join(LOCAL_ROOT, path.normalize(key));
  if (!full.startsWith(LOCAL_ROOT)) throw new Error('Invalid key'); // path-traversal guard
  return fs.readFile(full);
}

export class VercelBlobStorage implements Storage {
  async put(key: string, bytes: Buffer, contentType: string): Promise<PutResult> {
    const { put } = await import('@vercel/blob');
    const res = await put(key, bytes, { access: 'public', contentType });
    return { url: res.url, key };
  }
}

/** Pick storage by environment. `baseUrl` is the central's own origin (for local URLs). */
export function getStorage(baseUrl: string): Storage {
  return process.env.BLOB_READ_WRITE_TOKEN
    ? new VercelBlobStorage()
    : new LocalDiskStorage(baseUrl);
}

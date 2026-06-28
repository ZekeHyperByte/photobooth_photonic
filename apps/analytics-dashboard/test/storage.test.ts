import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import { LocalDiskStorage, readLocal } from '../lib/storage';

const KEY = `test-${Date.now()}/1.jpg`;
const ROOT = path.join(process.cwd(), '.data', 'hosted');

after(async () => {
  await fs.rm(path.join(ROOT, KEY.split('/')[0]), { recursive: true, force: true });
});

test('LocalDiskStorage put writes bytes and builds a URL', async () => {
  const store = new LocalDiskStorage('https://central.example');
  const bytes = Buffer.from('fake-jpeg-bytes');
  const res = await store.put(KEY, bytes, 'image/jpeg');

  assert.equal(res.url, `https://central.example/api/host/file/${KEY}`);
  assert.equal(res.key, KEY);

  const roundtrip = await readLocal(KEY);
  assert.deepEqual(roundtrip, bytes);
});

test('readLocal rejects path traversal', async () => {
  await assert.rejects(() => readLocal('../../../etc/passwd'), /Invalid key/);
});

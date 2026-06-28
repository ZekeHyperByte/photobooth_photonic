import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatPhoneNumber } from '../lib/whatsapp';

test('formatPhoneNumber normalizes Indonesian numbers to 62…', () => {
  assert.equal(formatPhoneNumber('081234567890'), '6281234567890'); // leading 0
  assert.equal(formatPhoneNumber('6281234567890'), '6281234567890'); // already 62
  assert.equal(formatPhoneNumber('81234567890'), '6281234567890'); // bare
  assert.equal(formatPhoneNumber('+62 812-3456-7890'), '6281234567890'); // punctuation
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { verifySignature, mapMidtransStatus } from '../lib/payment-utils';

const SERVER_KEY = 'SB-Mid-server-TESTKEY';

function sign(orderId: string, statusCode: string, grossAmount: string): string {
  return crypto
    .createHash('sha512')
    .update(`${orderId}${statusCode}${grossAmount}${SERVER_KEY}`)
    .digest('hex');
}

test('verifySignature accepts a correctly signed payload', () => {
  const body = {
    order_id: 'ORDER-1',
    status_code: '200',
    gross_amount: '50000.00',
    signature_key: sign('ORDER-1', '200', '50000.00'),
  };
  assert.equal(verifySignature(body, SERVER_KEY), true);
});

test('verifySignature rejects a tampered amount', () => {
  const body = {
    order_id: 'ORDER-1',
    status_code: '200',
    gross_amount: '50000.00',
    signature_key: sign('ORDER-1', '200', '99999.00'), // signed for a different amount
  };
  assert.equal(verifySignature(body, SERVER_KEY), false);
});

test('verifySignature rejects wrong server key', () => {
  const body = {
    order_id: 'ORDER-1',
    status_code: '200',
    gross_amount: '50000.00',
    signature_key: sign('ORDER-1', '200', '50000.00'),
  };
  assert.equal(verifySignature(body, 'WRONG-KEY'), false);
});

test('verifySignature rejects missing fields', () => {
  assert.equal(verifySignature({ order_id: 'x' }, SERVER_KEY), false);
});

test('mapMidtransStatus maps gateway statuses', () => {
  assert.equal(mapMidtransStatus('settlement'), 'paid');
  assert.equal(mapMidtransStatus('capture'), 'paid');
  assert.equal(mapMidtransStatus('pending'), 'pending');
  assert.equal(mapMidtransStatus('expire'), 'expired');
  assert.equal(mapMidtransStatus('cancel'), 'cancelled');
  assert.equal(mapMidtransStatus('deny'), 'failed');
});

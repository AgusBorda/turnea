import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import test from 'node:test'

import {
  moneyAmountAsNumber,
  paymentAmountAndCurrencyMatch,
  validateMercadoPagoWebhookSignature,
} from './mp-webhook-validation.ts'

test('accepts absorbed and customer-covered snapshot totals exactly', () => {
  assert.equal(paymentAmountAndCurrencyMatch({
    expectedAmount: '1500.00', expectedCurrency: 'ARS', paidAmount: 1500, paidCurrency: 'ARS',
  }), true)
  assert.equal(paymentAmountAndCurrencyMatch({
    expectedAmount: '1562.50', expectedCurrency: 'ARS', paidAmount: 1562.5, paidCurrency: 'ARS',
  }), true)
})

test('rejects deposit-only, one-cent differences and currency mismatch', () => {
  for (const paidAmount of [1500, 1562.49, 1562.51]) {
    assert.equal(paymentAmountAndCurrencyMatch({
      expectedAmount: '1562.50', expectedCurrency: 'ARS', paidAmount, paidCurrency: 'ARS',
    }), false)
  }
  assert.equal(paymentAmountAndCurrencyMatch({
    expectedAmount: '1562.50', expectedCurrency: 'ARS', paidAmount: 1562.5, paidCurrency: 'USD',
  }), false)
})

test('rejects amounts with sub-cent precision', () => {
  assert.equal(paymentAmountAndCurrencyMatch({
    expectedAmount: '1562.50', expectedCurrency: 'ARS', paidAmount: 1562.501, paidCurrency: 'ARS',
  }), false)
})

test('normalizes a validated amount for reconciliation', () => {
  assert.equal(moneyAmountAsNumber('1562.50'), 1562.5)
  assert.equal(moneyAmountAsNumber('1562.501'), null)
})

test('validates the documented HMAC manifest and rejects an invalid signature', () => {
  const secret = 'test-only-secret'
  const dataId = 'ABC123'
  const requestId = 'request-test'
  const timestamp = '1234567890'
  const manifest = 'id:abc123;request-id:request-test;ts:1234567890;'
  const hash = createHmac('sha256', secret).update(manifest).digest('hex')

  assert.equal(validateMercadoPagoWebhookSignature({
    xSignature: `v1=${hash}, ts=${timestamp}`,
    requestId,
    dataId,
    secret,
  }), true)
  assert.equal(validateMercadoPagoWebhookSignature({
    xSignature: `ts=${timestamp},v1=${'0'.repeat(64)}`,
    requestId,
    dataId,
    secret,
  }), false)
})
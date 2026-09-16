import assert from 'node:assert/strict'
import test from 'node:test'

import { validateCheckoutPreference } from './checkout-preference-validation.ts'

const appointmentId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const expiresAt = '2026-09-16T23:00:00.000Z'
const expected = { appointmentId, expectedSellerId: '123', amountCents: 156250,
  currency: 'ARS', expiresAt }
const detail = {
  id: '123-pref', init_point: 'https://www.mercadopago.com/checkout/start?pref_id=123-pref',
  collector_id: 123, external_reference: appointmentId,
  expiration_date_to: expiresAt,
  items: [{ quantity: 1, currency_id: 'ARS', unit_price: '1562.50' }],
}

test('validates documented detail against seller, amount, currency and expiry', () => {
  assert.equal(validateCheckoutPreference(detail, expected, '123-pref')?.id, '123-pref')
  assert.equal(validateCheckoutPreference({ ...detail, collector_id: 999 }, expected), null)
  assert.equal(validateCheckoutPreference({ ...detail, external_reference: 'other' }, expected), null)
  assert.equal(validateCheckoutPreference({ ...detail,
    items: [{ quantity: 1, currency_id: 'ARS', unit_price: '1500.00' }] }, expected), null)
  assert.equal(validateCheckoutPreference({ ...detail,
    items: [{ quantity: 1, currency_id: 'USD', unit_price: '1562.50' }] }, expected), null)
  assert.equal(validateCheckoutPreference({ ...detail, expiration_date_to: '2026-09-17T00:00:00Z' }, expected), null)
  assert.equal(validateCheckoutPreference({ ...detail, init_point: 'https://example.com/steal' }, expected), null)
})

test('manual seller without snapshot needs explicit appointment identity', () => {
  const manual = { ...expected, expectedSellerId: null }
  assert.equal(validateCheckoutPreference(detail, manual)?.id, '123-pref')
  const withoutReference = { ...detail, external_reference: undefined }
  assert.equal(validateCheckoutPreference(withoutReference, manual), null)
})

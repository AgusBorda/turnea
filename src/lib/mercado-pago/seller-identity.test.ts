import assert from 'node:assert/strict'
import test from 'node:test'
import { validateMercadoPagoSellerIdentity as check, webhookSellerIdentityDecision } from './seller-identity.ts'

test('OAuth matches safe numeric and decimal-string collector IDs', () => {
  assert.equal(check('oauth', '123456', 123456).kind, 'match')
  assert.equal(check('oauth', '123456', '123456').kind, 'match')
  assert.equal(check('oauth', ' 00123456 ', '123456').kind, 'match')
})

test('OAuth rejects wrong, absent or malformed collector IDs', () => {
  assert.equal(check('oauth', '123456', 123457).kind, 'mismatch')
  for (const collector of [null, undefined, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '0', '-1', '1.5', 'abc']) {
    assert.equal(check('oauth', '123456', collector).kind, 'missing_collector')
  }
})

test('OAuth rejects malformed stored seller identity', () => {
  for (const seller of ['0', '-1', '1.5', 'abc', '']) {
    assert.equal(check('oauth', seller, 123456).kind, 'invalid_expected_seller')
  }
  assert.equal(check('oauth', null, 123456).kind, 'invalid_expected_seller')
})

test('known manual seller is strict, legacy manual seller remains compatible', () => {
  assert.equal(check('manual', '123456', 123456).kind, 'match')
  assert.equal(check('manual', '123456', 999999).kind, 'mismatch')
  assert.equal(check('manual', null, null).kind, 'legacy_manual_unverified')
})

test('webhook rejects OAuth or known manual mismatch before downstream work', () => {
  for (const [source, userId, collectorId, reason] of [
    ['oauth', '111', 222, 'seller_mismatch'],
    ['oauth', '111', null, 'seller_missing'],
    ['oauth', 'bad', 111, 'seller_invalid'],
    ['manual', '111', 222, 'seller_mismatch'],
  ] as const) {
    const events: string[] = []
    const decision = webhookSellerIdentityDecision(source, userId, collectorId)
    if (decision.proceed) events.push('merchant_order', 'confirm', 'reconcile')
    assert.deepEqual(decision, { proceed: false, reason })
    assert.deepEqual(events, [])
  }
})

test('webhook keeps matching and legacy manual payments on existing path', () => {
  assert.deepEqual(webhookSellerIdentityDecision('oauth', '111', 111), { proceed: true })
  assert.deepEqual(webhookSellerIdentityDecision('manual', null, null), { proceed: true })
})

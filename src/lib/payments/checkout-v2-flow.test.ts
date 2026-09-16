import assert from 'node:assert/strict'
import test from 'node:test'

import { runCheckoutV2, type CheckoutV2Dependencies, type CheckoutV2Intent } from './checkout-v2-flow.ts'
import type { PaymentAppointmentSnapshot } from './checkout-snapshot.ts'

const expiry = new Date(Date.now() + 10 * 60_000).toISOString()
const appointmentId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const snapshot: PaymentAppointmentSnapshot = {
  appointmentId, depositRequired: true, paymentAvailable: true,
  depositAmount: 1500, processingFeeMode: 'customer_covers',
  processingFeeAmount: 62.5, paymentTotalAmount: 1562.5,
  processingFeeRate: 0.04, processingFeeSettlementOption: 'custom', currency: 'ARS',
}
const preference = {
  id: '123-pref',
  init_point: 'https://www.mercadopago.com/checkout/start?pref_id=123-pref',
  collector_id: 123, external_reference: appointmentId,
  expiration_date_to: expiry,
  items: [{ quantity: 1, currency_id: 'ARS', unit_price: '1562.50' }],
}

function fixture(overrides: Partial<CheckoutV2Intent> = {}) {
  const intent: CheckoutV2Intent = {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', appointmentId,
    status: 'reserved', phase: 'no_post', expectedSellerId: '123',
    preferenceId: null, initPoint: null, expiresAt: expiry, ...overrides,
  }
  const calls = { post: 0, search: 0, get: 0, mark: 0, complete: 0, release: 0, unknown: 0 }
  let claimHeld = false
  const deps: CheckoutV2Dependencies = {
    readIntent: async () => ({ ...intent }), readSnapshot: async () => snapshot,
    prePostCheck: async () => true,
    claim: async () => {
      if (claimHeld) return { result: 'busy', claimId: null }
      if (intent.phase === 'post_possible') return { result: 'post_possible', claimId: null }
      claimHeld = true; intent.status = 'creating'
      return { result: 'claimed', claimId: 'claim-1' }
    },
    markPostPossible: async () => { calls.mark++; intent.phase = 'post_possible'; return 'marked' },
    release: async () => { calls.release++; claimHeld = false; intent.status = 'reserved' },
    markUnknown: async () => { calls.unknown++; intent.status = 'unknown'; claimHeld = false },
    complete: async (_id, _claim, value) => {
      calls.complete++; intent.status = 'ready'; intent.preferenceId = value.id
      intent.initPoint = value.initPoint; return 'ready'
    },
    postPreference: async () => { calls.post++; return { id: preference.id } },
    searchPreferences: async () => { calls.search++; return { total: 1, ids: [preference.id] } },
    getPreference: async () => { calls.get++; return preference },
    wait: async () => {},
  }
  return { intent, calls, deps }
}

test('new intent posts once only after durable mark, then ready retry makes no MP calls', async () => {
  const { intent, calls, deps } = fixture()
  deps.postPreference = async () => { assert.equal(intent.phase, 'post_possible'); calls.post++; return { id: preference.id } }
  const first = await runCheckoutV2(intent, '123', deps)
  assert.equal(first.status, 'ready')
  assert.equal(calls.post, 1)
  const second = await runCheckoutV2(intent, '123', deps)
  assert.equal(second.status, 'ready')
  assert.equal(calls.post, 1)
  assert.equal(calls.search, 0)
})

test('two concurrent requests only permit one POST; busy worker recovers later', async () => {
  const { intent, calls, deps } = fixture()
  let finish!: (value: unknown) => void
  deps.postPreference = async () => { calls.post++; return new Promise(resolve => { finish = resolve }) }
  deps.searchPreferences = async () => ({ total: 0, ids: [] })
  const first = runCheckoutV2(intent, '123', deps)
  await new Promise(resolve => setImmediate(resolve))
  const second = await runCheckoutV2(intent, '123', deps)
  assert.equal(second.status, 'recovering')
  finish({ id: preference.id })
  assert.equal((await first).status, 'ready')
  assert.equal(calls.post, 1)
})

test('busy claim returns recovering; changed seller and expired attempt fail closed', async () => {
  const busy = fixture({ status: 'creating' })
  busy.deps.claim = async () => ({ result: 'busy', claimId: null })
  assert.equal((await runCheckoutV2(busy.intent, '123', busy.deps)).status, 'recovering')
  assert.equal(busy.calls.post, 0)
  assert.equal((await runCheckoutV2(busy.intent, '999', busy.deps)).status, 'seller_conflict')
  assert.equal((await runCheckoutV2({ ...busy.intent, status: 'expired' }, '123', busy.deps)).status, 'expired')
})

test('failed or ambiguous post marker never calls POST', async () => {
  for (const mode of ['not_marked', 'throw'] as const) {
    const { intent, calls, deps } = fixture()
    deps.markPostPossible = async () => { calls.mark++; if (mode === 'throw') throw Error('lost response'); return mode }
    assert.equal((await runCheckoutV2(intent, '123', deps)).status, 'recovering')
    assert.equal(calls.post, 0)
  }
})

test('seller changes before durable mark release the no-POST claim', async () => {
  const { intent, calls, deps } = fixture()
  deps.prePostCheck = async () => false
  assert.equal((await runCheckoutV2(intent, '123', deps)).status, 'seller_conflict')
  assert.equal(calls.release, 1)
  assert.equal(calls.mark, 0)
  assert.equal(calls.post, 0)
})

test('timeout, 429 and 500 are ambiguous and never trigger a second POST', async () => {
  for (const outcome of [null, { status: 429 }, { status: 500 }]) {
    const { intent, calls, deps } = fixture()
    deps.postPreference = async () => { calls.post++; return outcome }
    assert.equal((await runCheckoutV2(intent, '123', deps)).status, 'recovering')
    assert.equal(calls.unknown, 1)
    await runCheckoutV2(intent, '123', deps)
    assert.equal(calls.post, 1)
  }
})

test('unknown search zero/multiple/mismatch never posts or completes', async () => {
  for (const result of [{ total: 0, ids: [] }, { total: 2, ids: ['a', 'b'] },
    { total: 1, ids: [preference.id] }]) {
    const { intent, calls, deps } = fixture({ status: 'unknown', phase: 'post_possible' })
    deps.searchPreferences = async () => result
    if (result.total === 1) deps.getPreference = async () => ({ ...preference, collector_id: 999 })
    assert.equal((await runCheckoutV2(intent, '123', deps)).status, 'recovering')
    assert.equal(calls.post, 0)
    assert.equal(calls.complete, 0)
  }
})

test('one verified recovered preference becomes ready without POST', async () => {
  const { intent, calls, deps } = fixture({ status: 'unknown', phase: 'post_possible' })
  assert.equal((await runCheckoutV2(intent, '123', deps)).status, 'ready')
  assert.equal(calls.post, 0)
  assert.equal(calls.complete, 1)
})

test('DB save failure after MP success recovers known preference without second POST', async () => {
  const { intent, calls, deps } = fixture()
  const complete = deps.complete
  deps.complete = async (...args) => {
    if (calls.complete === 0) { calls.complete++; throw Error('DB unavailable') }
    return complete(...args)
  }
  assert.equal((await runCheckoutV2(intent, '123', deps)).status, 'ready')
  assert.equal(calls.post, 1)
  assert.equal(calls.unknown, 1)
})

test('recovered financial mismatch remains unknown', async () => {
  const { intent, calls, deps } = fixture({ status: 'unknown', phase: 'post_possible' })
  deps.getPreference = async () => ({ ...preference,
    items: [{ quantity: 1, currency_id: 'ARS', unit_price: '1500.00' }] })
  assert.equal((await runCheckoutV2(intent, '123', deps)).status, 'recovering')
  assert.equal(calls.complete, 0)
  assert.equal(calls.post, 0)
})

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { webcrypto } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { checkoutAttemptKey, draftIdentity, getOrCreateCheckoutAttempt,
  isSafeMercadoPagoCheckoutUrl, submitCheckoutV2 } from './checkout-v2-client.ts'
import type { BookingDraft } from './checkout-v2-client.ts'
import type { PaymentQuote } from './payment-quote.ts'

Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })

class MemoryStorage {
  values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
  removeItem(key: string) { this.values.delete(key) }
}

const draft: BookingDraft = {
  barbershopId: '11111111-1111-4111-8111-111111111111',
  barberId: '22222222-2222-4222-8222-222222222222',
  serviceId: '33333333-3333-4333-8333-333333333333',
  date: '2026-10-10', startTime: '10:00', clientName: 'Ana Pérez', clientPhone: '11 5555-6666',
}
const quote: PaymentQuote = {
  depositRequired: true, paymentAvailable: true, depositAmount: 1500,
  processingFeeMode: 'barbershop_absorbs', processingFeeAmount: 0,
  paymentTotalAmount: 1500, currency: 'ARS',
}
const response = (status: number, value: object) => ({ status, json: async () => value }) as Response
const fetcher = (status: number, value: object) => async () => response(status, value)

test('browser token is 32-byte base64url, persisted and reused for identical normalized draft', () => {
  const storage = new MemoryStorage()
  const first = getOrCreateCheckoutAttempt(storage, draft)
  assert.match(first, /^[A-Za-z0-9_-]{43}$/)
  assert.equal(getOrCreateCheckoutAttempt(storage, { ...draft, clientName: '  Ana  Pérez  ', clientPhone: '(11) 5555.6666' }), first)
  assert.ok(storage.getItem(checkoutAttemptKey(draft.barbershopId)))
})

test('material draft changes rotate token; normalized name and phone do not', () => {
  for (const patch of [
    { serviceId: '44444444-4444-4444-8444-444444444444' },
    { barberId: '44444444-4444-4444-8444-444444444444' },
    { date: '2026-10-11' }, { startTime: '11:00' },
    { clientName: 'Otra persona' }, { clientPhone: '1199998888' },
  ]) {
    const storage = new MemoryStorage()
    const first = getOrCreateCheckoutAttempt(storage, draft)
    assert.notEqual(getOrCreateCheckoutAttempt(storage, { ...draft, ...patch }), first)
  }
  assert.equal(draftIdentity(draft), draftIdentity({ ...draft, startTime: '10:00:00' }))
})

test('network failure preserves persisted attempt; request is V2 only', async () => {
  const storage = new MemoryStorage()
  const token = getOrCreateCheckoutAttempt(storage, draft)
  const result = await submitCheckoutV2(storage, draft, quote, {
    fetcher: async url => { assert.equal(url, '/api/checkout/v2'); throw new Error('network') },
  })
  assert.equal(result.kind, 'retryable')
  assert.equal(getOrCreateCheckoutAttempt(storage, draft), token)
})

test('202 recovery retries exact body/token and ready returns validated redirect', async () => {
  const storage = new MemoryStorage()
  const requests: string[] = []
  let time = 0
  let progress = 0
  const result = await submitCheckoutV2(storage, draft, quote, {
    fetcher: async (url, init) => {
      assert.equal(url, '/api/checkout/v2')
      requests.push(String(init?.body))
      return requests.length === 1
        ? response(202, { status: 'recovering', retryAfterMs: 1000 })
        : response(200, { status: 'ready', initPoint: 'https://www.mercadopago.com.ar/checkout/v1/redirect' })
    },
    wait: async ms => { time += ms }, now: () => time,
    onRecovering: () => { progress++ },
  })
  assert.deepEqual(result, { kind: 'ready', initPoint: 'https://www.mercadopago.com.ar/checkout/v1/redirect' })
  assert.equal(progress, 1)
  assert.equal(requests.length, 2)
  assert.equal(requests[0], requests[1])
  assert.equal(JSON.parse(requests[0]).attempt_token, getOrCreateCheckoutAttempt(storage, draft))
})

test('recovery is bounded and preserves token', async () => {
  const storage = new MemoryStorage()
  let time = 0
  const result = await submitCheckoutV2(storage, draft, quote, {
    fetcher: fetcher(202, { status: 'recovering', retryAfterMs: 10000 }),
    wait: async ms => { time += ms }, now: () => time,
  })
  assert.equal(result.kind, 'recovering')
  assert.equal(time, 90000)
  assert.ok(storage.getItem(checkoutAttemptKey(draft.barbershopId)))
})

test('expired, slot, seller and intent conflicts clear token', async () => {
  for (const [status, code, kind] of [
    [410, '', 'expired'], [409, 'slot_unavailable', 'slot_unavailable'],
    [409, 'seller_changed', 'seller_changed'], [409, 'intent_conflict', 'intent_conflict'],
  ] as const) {
    const storage = new MemoryStorage()
    const result = await submitCheckoutV2(storage, draft, quote, {
      fetcher: fetcher(status, { status: 'conflict', code }),
    })
    assert.equal(result.kind, kind)
    assert.equal(storage.getItem(checkoutAttemptKey(draft.barbershopId)), null)
  }
})

test('quote change returns visible quote without redirect and preserves attempt', async () => {
  const storage = new MemoryStorage()
  const changed = { ...quote, depositAmount: 1600, paymentTotalAmount: 1600 }
  const result = await submitCheckoutV2(storage, draft, quote, {
    fetcher: fetcher(409, { status: 'conflict', code: 'PAYMENT_QUOTE_CHANGED', payment: changed }),
  })
  assert.deepEqual(result, { kind: 'quote_changed', payment: changed })
  assert.ok(storage.getItem(checkoutAttemptKey(draft.barbershopId)))
})

test('503 preserves token and unsafe redirect is rejected', async () => {
  const storage = new MemoryStorage()
  assert.equal((await submitCheckoutV2(storage, draft, quote, {
    fetcher: fetcher(503, { status: 'error', code: 'payment_unavailable' }),
  })).kind, 'retryable')
  assert.ok(storage.getItem(checkoutAttemptKey(draft.barbershopId)))
  assert.equal((await submitCheckoutV2(storage, draft, quote, {
    fetcher: fetcher(200, { status: 'ready', initPoint: 'https://evil.example/' }),
  })).kind, 'retryable')
  assert.equal(isSafeMercadoPagoCheckoutUrl('http://www.mercadopago.com.ar/checkout'), false)
})

test('public Booking keeps direct no-deposit booking and has no legacy payment fallback', () => {
  const source = readFileSync(new URL('../../app/[slug]/booking-flow.tsx', import.meta.url), 'utf8')
  assert.match(source, /if \(requiresDeposit\) \{[\s\S]*?submitCheckoutV2\(/)
  assert.match(source, /\/\/ Flow without deposit — direct booking[\s\S]*?create_appointment_atomic/)
  assert.doesNotMatch(source, /fetch\(['"]\/api\/checkout['"]|window\.location\.href/)
})

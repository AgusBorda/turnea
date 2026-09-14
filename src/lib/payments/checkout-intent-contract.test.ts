import assert from 'node:assert/strict'
import test from 'node:test'
import {
  canonicalizeCheckoutBooking,
  generateCheckoutAttemptToken,
  hashCheckoutAttemptToken,
  hashCheckoutBookingFingerprint,
  type CheckoutBookingInput,
} from './checkout-intent-contract.ts'

const booking: CheckoutBookingInput = {
  barbershopId: '11111111-1111-4111-8111-111111111111',
  barberId: '22222222-2222-4222-8222-222222222222',
  serviceId: '33333333-3333-4333-8333-333333333333',
  date: '2026-10-20', startTime: '10:00',
  clientName: ' Ana   María ', clientPhone: '+54 (11) 1234-5678',
}

test('32-byte opaque token is validated and hashed deterministically', () => {
  const token = generateCheckoutAttemptToken()
  assert.equal(token.length, 43)
  assert.equal(hashCheckoutAttemptToken(token).length, 32)
  assert.equal(hashCheckoutAttemptToken(token).toString('hex'), hashCheckoutAttemptToken(token).toString('hex'))
  assert.notEqual(token, generateCheckoutAttemptToken())
})

test('invalid or noncanonical token is rejected', () => {
  for (const token of ['', 'abc', '*'.repeat(43), 'x'.repeat(44), 'a'.repeat(42) + '=']) {
    assert.throws(() => hashCheckoutAttemptToken(token), /INVALID_CHECKOUT_ATTEMPT_TOKEN/)
  }
})

test('canonical booking normalizes name, phone, time and UUID case', () => {
  assert.deepEqual(canonicalizeCheckoutBooking(booking), {
    ...booking, startTime: '10:00:00', clientName: 'Ana María', clientPhone: '+541112345678',
  })
  const equivalent = {
    ...booking, startTime: '10:00:00', clientName: 'Ana María', clientPhone: '+54 11 1234 5678',
  }
  assert.equal(
    hashCheckoutBookingFingerprint(booking).toString('hex'),
    hashCheckoutBookingFingerprint(equivalent).toString('hex')
  )
})

test('each material booking field changes the server fingerprint', () => {
  const original = hashCheckoutBookingFingerprint(booking).toString('hex')
  const changed: Partial<CheckoutBookingInput>[] = [
    { barbershopId: '44444444-4444-4444-8444-444444444444' },
    { barberId: '44444444-4444-4444-8444-444444444444' },
    { serviceId: '44444444-4444-4444-8444-444444444444' },
    { date: '2026-10-21' }, { startTime: '10:30' },
    { clientName: 'Otra persona' }, { clientPhone: '+541198765432' },
  ]
  for (const mutation of changed) {
    assert.notEqual(hashCheckoutBookingFingerprint({ ...booking, ...mutation }).toString('hex'), original)
  }
})

test('invalid date, time, name and phone are rejected', () => {
  for (const mutation of [
    { date: '2026-02-30' }, { startTime: '25:00' },
    { clientName: ' ' }, { clientPhone: 'user@example.com' },
  ]) {
    assert.throws(() => hashCheckoutBookingFingerprint({ ...booking, ...mutation }), /INVALID_CHECKOUT_BOOKING/)
  }
})

import assert from 'node:assert/strict'
import test from 'node:test'

import { generateCheckoutAttemptToken } from './checkout-intent-contract.ts'
import { parseCheckoutV2Request } from './checkout-v2-request.ts'

const body = {
  attempt_token: generateCheckoutAttemptToken(),
  barbershop_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  barber_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  service_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  date: '2026-10-15', start_time: '10:00',
  client_name: '  Ana   Pérez  ', client_phone: '+54 11 1234-5678',
  quoted_payment: {
    depositRequired: true, paymentAvailable: true, depositAmount: 1500,
    processingFeeMode: 'customer_covers', processingFeeAmount: 62.5,
    paymentTotalAmount: 1562.5, currency: 'ARS',
  },
}

test('V2 accepts canonical logical booking and a 32-byte attempt token', () => {
  const parsed = parseCheckoutV2Request(body)
  assert.equal(parsed?.booking.clientName, 'Ana Pérez')
  assert.equal(parsed?.booking.clientPhone, '+541112345678')
  assert.equal(parsed?.booking.startTime, '10:00:00')
})

test('forged appointment, seller and prices are not part of the trusted booking', () => {
  const parsed = parseCheckoutV2Request({ ...body,
    appointment_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    preference_id: 'forged', expected_mp_user_id: '999',
    price: 1, deposit_amount: 1, processing_fee_amount: 0,
  })
  assert.ok(parsed)
  assert.equal(Object.hasOwn(parsed.booking, 'appointment_id'), false)
  assert.equal(Object.hasOwn(parsed.booking, 'expected_mp_user_id'), false)
  assert.equal(Object.hasOwn(parsed.booking, 'price'), false)
})

test('invalid token, input and absent quote fail before backend operations', () => {
  assert.equal(parseCheckoutV2Request({ ...body, attempt_token: 'short' }), null)
  assert.equal(parseCheckoutV2Request({ ...body, client_name: '' }), null)
  assert.equal(parseCheckoutV2Request({ ...body, quoted_payment: null }), null)
})

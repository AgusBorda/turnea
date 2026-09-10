import assert from 'node:assert/strict'
import test from 'node:test'

import {
  mercadoPagoUnitPrice,
  parsePaymentAppointmentSnapshot,
  parseQuotedPayment,
  paymentQuoteFromSnapshot,
  quotedPaymentMatchesSnapshot,
  type PaymentAppointmentSnapshot,
} from './checkout-snapshot.ts'

const snapshot: PaymentAppointmentSnapshot = {
  appointmentId: '11111111-1111-4111-8111-111111111111',
  depositRequired: true,
  paymentAvailable: true,
  depositAmount: 1500,
  processingFeeMode: 'customer_covers',
  processingFeeAmount: 62.5,
  paymentTotalAmount: 1562.5,
  processingFeeRate: 0.04,
  processingFeeSettlementOption: 'instant',
  currency: 'ARS',
}

test('uses the persisted snapshot total as the Mercado Pago unit price', () => {
  assert.equal(mercadoPagoUnitPrice(snapshot), 1562.5)
})

test('accepts an unchanged preview', () => {
  assert.equal(quotedPaymentMatchesSnapshot(paymentQuoteFromSnapshot(snapshot), snapshot), true)
})

test('detects a service price change after quote', () => {
  assert.equal(quotedPaymentMatchesSnapshot({
    ...paymentQuoteFromSnapshot(snapshot),
    depositAmount: 1600,
    processingFeeAmount: 66.67,
    paymentTotalAmount: 1666.67,
  }, snapshot), false)
})

test('detects a settings change after quote', () => {
  assert.equal(quotedPaymentMatchesSnapshot({
    ...paymentQuoteFromSnapshot(snapshot),
    processingFeeMode: 'barbershop_absorbs',
    processingFeeAmount: 0,
    paymentTotalAmount: 1500,
  }, snapshot), false)
})

test('parses only a complete two-decimal quote', () => {
  assert.deepEqual(parseQuotedPayment(paymentQuoteFromSnapshot(snapshot)), paymentQuoteFromSnapshot(snapshot))
  assert.equal(parseQuotedPayment({ ...paymentQuoteFromSnapshot(snapshot), paymentTotalAmount: 1562.501 }), null)
  assert.equal(parseQuotedPayment({ ...paymentQuoteFromSnapshot(snapshot), currency: 'invalid' }), null)
})

test('parses the numeric snapshot returned by PostgreSQL', () => {
  assert.deepEqual(parsePaymentAppointmentSnapshot({
    appointment_id: snapshot.appointmentId,
    deposit_amount: '1500.00',
    processing_fee_amount: '62.50',
    payment_total_amount: '1562.50',
    processing_fee_rate: '0.040000',
    processing_fee_mode: 'customer_covers',
    payment_currency: 'ARS',
    processing_fee_settlement_option: 'instant',
  }), snapshot)
})

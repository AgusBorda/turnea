import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildSuccessPaymentSummary,
  formatPaymentCurrency,
} from './success-payment-summary.ts'

test('builds the customer-covered Success breakdown', () => {
  assert.deepEqual(buildSuccessPaymentSummary({
    servicePrice: 15000,
    depositAmount: 1500,
    processingFeeAmount: 62.5,
    paymentTotalAmount: 1562.5,
    processingFeeMode: 'customer_covers',
    paymentCurrency: 'ARS',
  }), {
    servicePrice: 15000,
    depositAmount: 1500,
    processingFeeAmount: 62.5,
    paymentTotalAmount: 1562.5,
    remainingServiceAmount: 13500,
    processingFeeMode: 'customer_covers',
    currency: 'ARS',
    showProcessingBreakdown: true,
  })
})

test('keeps the absorbed flow visually compact', () => {
  const summary = buildSuccessPaymentSummary({
    servicePrice: 15000,
    depositAmount: 1500,
    processingFeeAmount: 0,
    paymentTotalAmount: 1500,
    processingFeeMode: 'barbershop_absorbs',
    paymentCurrency: 'ARS',
  })
  assert.equal(summary.showProcessingBreakdown, false)
  assert.equal(summary.remainingServiceAmount, 13500)
})

test('supports historical appointments without P4 display values', () => {
  const summary = buildSuccessPaymentSummary({
    servicePrice: 15000,
    depositAmount: 1500,
  })
  assert.equal(summary.paymentTotalAmount, 1500)
  assert.equal(summary.processingFeeAmount, 0)
  assert.equal(summary.processingFeeMode, 'barbershop_absorbs')
  assert.equal(summary.showProcessingBreakdown, false)
})

test('formats service and payment amounts with two ARS decimals', () => {
  assert.equal(formatPaymentCurrency(1500, 'ARS'), '$ 1.500,00')
  assert.equal(formatPaymentCurrency(62.5, 'ARS'), '$ 62,50')
  assert.equal(formatPaymentCurrency(1562.5, 'ARS'), '$ 1.562,50')
})
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  calculateEffectiveProcessingRate,
  calculateProcessingFee,
  effectiveRateFromPercentage,
} from './processing-fee.ts'

test('derives the effective rate from Mercado Pago base rate plus VAT', () => {
  assert.equal(calculateEffectiveProcessingRate('0.066', '0.21'), '0.079860')
})

test('accepts comma and dot percentage input', () => {
  assert.equal(effectiveRateFromPercentage('6,60'), '0.066000')
  assert.equal(effectiveRateFromPercentage('6.60'), '0.066000')
})

test('supports zero VAT and zero base rate', () => {
  assert.equal(calculateEffectiveProcessingRate('0.066', '0'), '0.066000')
  assert.equal(calculateEffectiveProcessingRate('0', '0.21'), '0.000000')
})

test('rejects invalid base and VAT rates', () => {
  assert.throws(() => calculateEffectiveProcessingRate('-0.01', '0.21'))
  assert.throws(() => calculateEffectiveProcessingRate('0.10', '1.01'))
  assert.throws(() => calculateEffectiveProcessingRate('0.15', '0.21'))
})

test('grosses up deposits using the base rate plus VAT', () => {
  const effectiveRate = calculateEffectiveProcessingRate('0.066', '0.21')
  const largeDeposit = calculateProcessingFee({
    depositAmount: '1500',
    processingFeeMode: 'customer_covers',
    effectiveRate,
    currency: 'ARS',
  })
  const smallDeposit = calculateProcessingFee({
    depositAmount: '15',
    processingFeeMode: 'customer_covers',
    effectiveRate,
    currency: 'ARS',
  })

  assert.equal(largeDeposit.processingFeeAmount, '130.19')
  assert.equal(largeDeposit.paymentTotalAmount, '1630.19')
  assert.equal(smallDeposit.processingFeeAmount, '1.31')
  assert.equal(smallDeposit.paymentTotalAmount, '16.31')
})

test('barbershop absorbs the processing cost', () => {
  const result = calculateProcessingFee({
    depositAmount: '1500',
    processingFeeMode: 'barbershop_absorbs',
    effectiveRate: '0.04',
    currency: 'ARS',
  })

  assert.equal(result.processingFeeAmount, '0.00')
  assert.equal(result.paymentTotalAmount, '1500.00')
})

test('zero rate does not add a processing fee', () => {
  const result = calculateProcessingFee({
    depositAmount: '1500',
    processingFeeMode: 'customer_covers',
    effectiveRate: '0',
    currency: 'ARS',
  })

  assert.equal(result.processingFeeAmount, '0.00')
  assert.equal(result.paymentTotalAmount, '1500.00')
})

test('grosses up a 1500 deposit at four percent', () => {
  const result = calculateProcessingFee({
    depositAmount: '1500',
    processingFeeMode: 'customer_covers',
    effectiveRate: '0.04',
    currency: 'ARS',
  })

  assert.equal(result.processingFeeAmount, '62.50')
  assert.equal(result.paymentTotalAmount, '1562.50')
})

test('rounds the gross total up to the next cent', () => {
  const result = calculateProcessingFee({
    depositAmount: '0.01',
    processingFeeMode: 'customer_covers',
    effectiveRate: '0.04',
    currency: 'ARS',
  })

  assert.equal(result.processingFeeAmount, '0.01')
  assert.equal(result.paymentTotalAmount, '0.02')
})

test('preserves input cents deterministically', () => {
  const result = calculateProcessingFee({
    depositAmount: '1500.37',
    processingFeeMode: 'customer_covers',
    effectiveRate: '0.04',
    currency: 'ARS',
  })

  assert.equal(result.processingFeeAmount, '62.52')
  assert.equal(result.paymentTotalAmount, '1562.89')
})

test('accepts the maximum MVP rate', () => {
  const result = calculateProcessingFee({
    depositAmount: '1500',
    processingFeeMode: 'customer_covers',
    effectiveRate: '0.15',
    currency: 'ARS',
  })

  assert.equal(result.processingFeeAmount, '264.71')
  assert.equal(result.paymentTotalAmount, '1764.71')
})

test('rejects a negative rate', () => {
  assert.throws(() => calculateProcessingFee({
    depositAmount: '1500',
    processingFeeMode: 'customer_covers',
    effectiveRate: '-0.01',
    currency: 'ARS',
  }), /INVALID_EFFECTIVE_RATE/)
})

test('rejects a rate above the MVP maximum', () => {
  assert.throws(() => calculateProcessingFee({
    depositAmount: '1500',
    processingFeeMode: 'customer_covers',
    effectiveRate: '0.150001',
    currency: 'ARS',
  }), /INVALID_EFFECTIVE_RATE/)
})

test('zero deposit always produces zero amounts', () => {
  const result = calculateProcessingFee({
    depositAmount: '0',
    processingFeeMode: 'customer_covers',
    effectiveRate: '0.15',
    currency: 'ARS',
  })

  assert.equal(result.processingFeeAmount, '0.00')
  assert.equal(result.paymentTotalAmount, '0.00')
})

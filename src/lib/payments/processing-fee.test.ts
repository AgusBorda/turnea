import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateProcessingFee } from './processing-fee.ts'

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
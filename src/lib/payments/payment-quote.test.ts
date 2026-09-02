import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildPaymentQuote,
  parsePaymentQuoteRequest,
  PaymentQuoteError,
} from './payment-quote.ts'

const BARBERSHOP_ID = '11111111-1111-4111-8111-111111111111'
const SERVICE_ID = '22222222-2222-4222-8222-222222222222'

function quote(overrides: {
  depositRequired?: boolean
  mpConfigured?: boolean
  processingFeeMode?: 'barbershop_absorbs' | 'customer_covers'
  effectiveProcessingRate?: string
  serviceBarbershopId?: string
  servicePrice?: string
} = {}) {
  return buildPaymentQuote({
    request: { barbershopId: BARBERSHOP_ID, serviceId: SERVICE_ID },
    barbershop: {
      id: BARBERSHOP_ID,
      active: true,
      currency: 'ARS',
      depositRequired: overrides.depositRequired ?? true,
      depositPercentage: 10,
      mpConfigured: overrides.mpConfigured ?? true,
      processingFeeMode: overrides.processingFeeMode ?? 'customer_covers',
      effectiveProcessingRate: overrides.effectiveProcessingRate ?? '0.04',
    },
    service: {
      id: SERVICE_ID,
      barbershopId: overrides.serviceBarbershopId ?? BARBERSHOP_ID,
      active: true,
      price: overrides.servicePrice ?? '15000.00',
    },
  })
}

test('quotes a customer-covered processing cost', () => {
  assert.deepEqual(quote(), {
    depositRequired: true,
    depositAmount: 1500,
    processingFeeMode: 'customer_covers',
    processingFeeAmount: 62.5,
    paymentTotalAmount: 1562.5,
    currency: 'ARS',
  })
})

test('quotes an absorbed processing cost', () => {
  const result = quote({ processingFeeMode: 'barbershop_absorbs' })
  assert.equal(result.processingFeeAmount, 0)
  assert.equal(result.paymentTotalAmount, 1500)
})

test('quotes a zero effective rate', () => {
  const result = quote({ effectiveProcessingRate: '0' })
  assert.equal(result.processingFeeAmount, 0)
  assert.equal(result.paymentTotalAmount, 1500)
})

test('returns zero amounts when the barbershop does not require a deposit', () => {
  const result = quote({ depositRequired: false })
  assert.equal(result.depositRequired, false)
  assert.equal(result.depositAmount, 0)
  assert.equal(result.paymentTotalAmount, 0)
})

test('returns zero amounts when Mercado Pago is not configured', () => {
  const result = quote({ mpConfigured: false })
  assert.equal(result.depositRequired, false)
  assert.equal(result.depositAmount, 0)
  assert.equal(result.paymentTotalAmount, 0)
})

test('rejects invalid identifiers', () => {
  assert.throws(
    () => parsePaymentQuoteRequest({ barbershop_id: 'invalid', service_id: SERVICE_ID }),
    (error: unknown) => error instanceof PaymentQuoteError && error.code === 'INVALID_QUOTE_REQUEST'
  )
})

test('rejects a service from another barbershop', () => {
  assert.throws(
    () => quote({ serviceBarbershopId: '33333333-3333-4333-8333-333333333333' }),
    (error: unknown) => error instanceof PaymentQuoteError && error.code === 'SERVICE_BARBERSHOP_MISMATCH'
  )
})

test('rejects an invalid rate', () => {
  assert.throws(
    () => quote({ effectiveProcessingRate: '0.150001' }),
    (error: unknown) => error instanceof PaymentQuoteError && error.code === 'INVALID_PAYMENT_CONFIGURATION'
  )
})

test('rejects an invalid payment configuration', () => {
  assert.throws(
    () => quote({ servicePrice: '-1' }),
    (error: unknown) => error instanceof PaymentQuoteError && error.code === 'INVALID_PAYMENT_CONFIGURATION'
  )
})
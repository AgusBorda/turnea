import type { PaymentQuote } from './payment-quote.ts'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SETTLEMENT_OPTIONS = new Set(['instant', '10_days', '18_days', '35_days', 'custom'])

export interface PaymentAppointmentSnapshot extends PaymentQuote {
  appointmentId: string
  processingFeeRate: number
  processingFeeSettlementOption: string
}

function amountToCents(value: number): number | null {
  if (!Number.isFinite(value) || value < 0) return null
  const cents = Math.round(value * 100)
  return Math.abs(value * 100 - cents) < 1e-7 ? cents : null
}

function numericValue(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function parsePaymentAppointmentSnapshot(value: unknown): PaymentAppointmentSnapshot | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  const appointmentId = typeof record.appointment_id === 'string' ? record.appointment_id : ''
  const mode = record.processing_fee_mode
  const currency = typeof record.payment_currency === 'string'
    ? record.payment_currency.trim().toUpperCase()
    : ''
  const settlementOption = typeof record.processing_fee_settlement_option === 'string'
    ? record.processing_fee_settlement_option
    : ''
  const depositAmount = numericValue(record.deposit_amount)
  const processingFeeAmount = numericValue(record.processing_fee_amount)
  const paymentTotalAmount = numericValue(record.payment_total_amount)
  const processingFeeRate = numericValue(record.processing_fee_rate)

  if (
    !UUID_PATTERN.test(appointmentId)
    || (mode !== 'barbershop_absorbs' && mode !== 'customer_covers')
    || !/^[A-Z]{3}$/.test(currency)
    || !SETTLEMENT_OPTIONS.has(settlementOption)
    || depositAmount === null || amountToCents(depositAmount) === null || depositAmount <= 0
    || processingFeeAmount === null || amountToCents(processingFeeAmount) === null
    || paymentTotalAmount === null || amountToCents(paymentTotalAmount) === null
    || processingFeeRate === null || processingFeeRate < 0 || processingFeeRate > 0.15
    || amountToCents(depositAmount)! + amountToCents(processingFeeAmount)! !== amountToCents(paymentTotalAmount)
  ) {
    return null
  }

  return {
    appointmentId,
    depositRequired: true,
    depositAmount,
    processingFeeMode: mode,
    processingFeeAmount,
    paymentTotalAmount,
    processingFeeRate,
    processingFeeSettlementOption: settlementOption,
    currency,
  }
}

export function parseQuotedPayment(value: unknown): PaymentQuote | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  const mode = record.processingFeeMode
  const currency = typeof record.currency === 'string' ? record.currency.trim().toUpperCase() : ''

  if (
    typeof record.depositRequired !== 'boolean'
    || (mode !== 'barbershop_absorbs' && mode !== 'customer_covers')
    || !/^[A-Z]{3}$/.test(currency)
    || typeof record.depositAmount !== 'number'
    || typeof record.processingFeeAmount !== 'number'
    || typeof record.paymentTotalAmount !== 'number'
    || amountToCents(record.depositAmount) === null
    || amountToCents(record.processingFeeAmount) === null
    || amountToCents(record.paymentTotalAmount) === null
  ) {
    return null
  }

  return {
    depositRequired: record.depositRequired,
    depositAmount: record.depositAmount,
    processingFeeMode: mode,
    processingFeeAmount: record.processingFeeAmount,
    paymentTotalAmount: record.paymentTotalAmount,
    currency,
  }
}

export function paymentQuoteFromSnapshot(snapshot: PaymentAppointmentSnapshot): PaymentQuote {
  return {
    depositRequired: true,
    depositAmount: snapshot.depositAmount,
    processingFeeMode: snapshot.processingFeeMode,
    processingFeeAmount: snapshot.processingFeeAmount,
    paymentTotalAmount: snapshot.paymentTotalAmount,
    currency: snapshot.currency,
  }
}

export function quotedPaymentMatchesSnapshot(
  quote: PaymentQuote,
  snapshot: PaymentAppointmentSnapshot
): boolean {
  return quote.depositRequired
    && quote.processingFeeMode === snapshot.processingFeeMode
    && quote.currency === snapshot.currency
    && amountToCents(quote.depositAmount) === amountToCents(snapshot.depositAmount)
    && amountToCents(quote.processingFeeAmount) === amountToCents(snapshot.processingFeeAmount)
    && amountToCents(quote.paymentTotalAmount) === amountToCents(snapshot.paymentTotalAmount)
}

export function mercadoPagoUnitPrice(snapshot: PaymentAppointmentSnapshot): number {
  const cents = amountToCents(snapshot.paymentTotalAmount)
  if (cents === null || cents <= 0) {
    throw new Error('INVALID_PAYMENT_SNAPSHOT')
  }
  return cents / 100
}

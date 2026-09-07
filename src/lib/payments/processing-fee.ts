export type ProcessingFeeMode = 'barbershop_absorbs' | 'customer_covers'
export type MercadoPagoSettlementOption = 'instant' | '10_days' | '18_days' | '35_days' | 'custom'

const ZERO = BigInt(0)
const ONE = BigInt(1)
const FIFTY = BigInt(50)
const HUNDRED = BigInt(100)
const RATE_SCALE = BigInt(1_000_000)
const MAX_EFFECTIVE_RATE_UNITS = BigInt(150_000)
const MAX_MONEY_CENTS = BigInt(9_999_999_999)

interface ProcessingFeeInput {
  depositAmount: string
  processingFeeMode: ProcessingFeeMode
  effectiveRate: string
  currency: string
}

export interface ProcessingFeeResult {
  depositAmountCents: number
  processingFeeAmountCents: number
  paymentTotalAmountCents: number
  depositAmount: string
  processingFeeAmount: string
  paymentTotalAmount: string
  processingFeeRate: string
  processingFeeMode: ProcessingFeeMode
  currency: string
}

function parseUnsignedDecimal(value: string, scale: number, field: string): bigint {
  const normalized = value.trim().replace(',', '.')
  const pattern = new RegExp(`^(?:0|[1-9]\\d*)(?:\\.(\\d{1,${scale}}))?$`)
  const match = normalized.match(pattern)

  if (!match) {
    throw new Error(`INVALID_${field}`)
  }

  const fraction = (match[1] ?? '').padEnd(scale, '0')
  return BigInt(normalized.split('.')[0]) * (BigInt(10) ** BigInt(scale)) + BigInt(fraction || '0')
}

function formatCents(cents: bigint): string {
  const whole = cents / HUNDRED
  const fraction = (cents % HUNDRED).toString().padStart(2, '0')
  return `${whole}.${fraction}`
}

function formatRate(rateUnits: bigint): string {
  const whole = rateUnits / RATE_SCALE
  const fraction = (rateUnits % RATE_SCALE).toString().padStart(6, '0')
  return `${whole}.${fraction}`
}

function ceilDivide(dividend: bigint, divisor: bigint): bigint {
  return (dividend + divisor - ONE) / divisor
}

export function effectiveRateFromPercentage(percentage: string): string {
  const percentageUnits = parseUnsignedDecimal(percentage, 4, 'EFFECTIVE_RATE_PERCENTAGE')
  if (percentageUnits > MAX_EFFECTIVE_RATE_UNITS) {
    throw new Error('INVALID_EFFECTIVE_RATE')
  }

  return formatRate(percentageUnits)
}

export function rateFractionToPercentage(rate: string): string {
  const rateUnits = parseUnsignedDecimal(rate, 6, 'PROCESSING_RATE')
  if (rateUnits > MAX_EFFECTIVE_RATE_UNITS) {
    throw new Error('INVALID_PROCESSING_RATE')
  }

  const whole = rateUnits / BigInt(10_000)
  const fraction = (rateUnits % BigInt(10_000)).toString().padStart(4, '0')
  const trimmedFraction = fraction.replace(/0+$/, '').padEnd(2, '0')

  return `${whole}.${trimmedFraction}`
}

export function calculateEffectiveProcessingRate(
  baseRate: string,
  vatRate: string
): string {
  const baseRateUnits = parseUnsignedDecimal(baseRate, 6, 'BASE_PROCESSING_RATE')
  const vatRateUnits = parseUnsignedDecimal(vatRate, 6, 'PROCESSING_FEE_VAT_RATE')

  if (baseRateUnits > MAX_EFFECTIVE_RATE_UNITS || vatRateUnits > RATE_SCALE) {
    throw new Error('INVALID_PROCESSING_RATE_CONFIGURATION')
  }

  const numerator = baseRateUnits * (RATE_SCALE + vatRateUnits)
  const effectiveRateUnits = (numerator + RATE_SCALE / BigInt(2)) / RATE_SCALE

  if (effectiveRateUnits > MAX_EFFECTIVE_RATE_UNITS) {
    throw new Error('INVALID_EFFECTIVE_RATE')
  }

  return formatRate(effectiveRateUnits)
}

export function calculateDepositAmount(servicePrice: string, depositPercentage: number): string {
  if (!Number.isInteger(depositPercentage) || depositPercentage <= 0 || depositPercentage > 100) {
    throw new Error('INVALID_DEPOSIT_PERCENTAGE')
  }

  const servicePriceCents = parseUnsignedDecimal(servicePrice, 2, 'SERVICE_PRICE')
  if (servicePriceCents > MAX_MONEY_CENTS) {
    throw new Error('INVALID_SERVICE_PRICE')
  }

  const depositCents = (servicePriceCents * BigInt(depositPercentage) + FIFTY) / HUNDRED
  return formatCents(depositCents)
}

/**
 * Calculates the ARS processing fee with exact integer arithmetic.
 *
 * Inputs are decimal strings so binary floating point never becomes a financial
 * authority. PostgreSQL numeric must reproduce this calculation when P4B starts
 * creating paid appointment snapshots atomically.
 */
export function calculateProcessingFee(input: ProcessingFeeInput): ProcessingFeeResult {
  const currency = input.currency.trim().toUpperCase()
  if (currency !== 'ARS') {
    throw new Error('UNSUPPORTED_PROCESSING_FEE_CURRENCY')
  }

  const depositCents = parseUnsignedDecimal(input.depositAmount, 2, 'DEPOSIT_AMOUNT')
  const rateUnits = parseUnsignedDecimal(input.effectiveRate, 6, 'EFFECTIVE_RATE')

  if (depositCents > MAX_MONEY_CENTS) {
    throw new Error('INVALID_DEPOSIT_AMOUNT')
  }
  if (rateUnits > MAX_EFFECTIVE_RATE_UNITS) {
    throw new Error('INVALID_EFFECTIVE_RATE')
  }

  let paymentTotalCents = depositCents
  if (
    depositCents > ZERO
    && input.processingFeeMode === 'customer_covers'
    && rateUnits > ZERO
  ) {
    paymentTotalCents = ceilDivide(depositCents * RATE_SCALE, RATE_SCALE - rateUnits)
  } else if (input.processingFeeMode !== 'barbershop_absorbs' && input.processingFeeMode !== 'customer_covers') {
    throw new Error('INVALID_PROCESSING_FEE_MODE')
  }

  if (paymentTotalCents > MAX_MONEY_CENTS) {
    throw new Error('INVALID_PAYMENT_TOTAL_AMOUNT')
  }

  const processingFeeCents = paymentTotalCents - depositCents

  return {
    depositAmountCents: Number(depositCents),
    processingFeeAmountCents: Number(processingFeeCents),
    paymentTotalAmountCents: Number(paymentTotalCents),
    depositAmount: formatCents(depositCents),
    processingFeeAmount: formatCents(processingFeeCents),
    paymentTotalAmount: formatCents(paymentTotalCents),
    processingFeeRate: formatRate(rateUnits),
    processingFeeMode: input.processingFeeMode,
    currency,
  }
}

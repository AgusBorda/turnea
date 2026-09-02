import type { ProcessingFeeMode } from './processing-fee.ts'

interface SuccessPaymentInput {
  servicePrice: number | null
  depositAmount: number | null
  processingFeeAmount?: number | null
  paymentTotalAmount?: number | null
  processingFeeMode?: ProcessingFeeMode | null
  paymentCurrency?: string | null
}

export interface SuccessPaymentSummary {
  servicePrice: number
  depositAmount: number
  processingFeeAmount: number
  paymentTotalAmount: number
  remainingServiceAmount: number
  processingFeeMode: ProcessingFeeMode
  currency: string
  showProcessingBreakdown: boolean
}

function validMoney(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

export function buildSuccessPaymentSummary(input: SuccessPaymentInput): SuccessPaymentSummary {
  const servicePrice = validMoney(input.servicePrice) ?? 0
  const depositAmount = validMoney(input.depositAmount) ?? 0
  const processingFeeAmount = validMoney(input.processingFeeAmount) ?? 0
  const processingFeeMode = input.processingFeeMode === 'customer_covers'
    ? 'customer_covers'
    : 'barbershop_absorbs'
  const snapshotTotal = validMoney(input.paymentTotalAmount)
  const paymentTotalAmount = snapshotTotal ?? depositAmount + processingFeeAmount
  const currency = typeof input.paymentCurrency === 'string'
    && /^[A-Z]{3}$/.test(input.paymentCurrency.trim().toUpperCase())
    ? input.paymentCurrency.trim().toUpperCase()
    : 'ARS'

  return {
    servicePrice,
    depositAmount,
    processingFeeAmount,
    paymentTotalAmount,
    remainingServiceAmount: Math.max(servicePrice - depositAmount, 0),
    processingFeeMode,
    currency,
    showProcessingBreakdown: processingFeeMode === 'customer_covers' && processingFeeAmount > 0,
  }
}

export function formatPaymentCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}
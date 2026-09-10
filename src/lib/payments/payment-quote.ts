import {
  calculateDepositAmount,
  calculateProcessingFee,
  type ProcessingFeeMode,
} from './processing-fee.ts'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export interface PaymentQuoteRequest {
  barbershopId: string
  serviceId: string
}

export interface PaymentQuote {
  depositRequired: boolean
  paymentAvailable: boolean
  depositAmount: number
  processingFeeMode: ProcessingFeeMode
  processingFeeAmount: number
  paymentTotalAmount: number
  currency: string
}

interface PaymentQuoteBarbershop {
  id: string
  active: boolean
  currency: string
  depositRequired: boolean
  depositPercentage: number
  paymentAvailable: boolean
  processingFeeMode: ProcessingFeeMode
  effectiveProcessingRate: string
}

interface PaymentQuoteService {
  id: string
  barbershopId: string
  active: boolean
  price: string
}

interface BuildPaymentQuoteInput {
  request: PaymentQuoteRequest
  barbershop: PaymentQuoteBarbershop
  service: PaymentQuoteService
}

export class PaymentQuoteError extends Error {
  readonly code: string

  constructor(code: string) {
    super(code)
    this.name = 'PaymentQuoteError'
    this.code = code
  }
}

export function parsePaymentQuoteRequest(body: unknown): PaymentQuoteRequest {
  if (typeof body !== 'object' || body === null) {
    throw new PaymentQuoteError('INVALID_QUOTE_REQUEST')
  }

  const record = body as Record<string, unknown>
  const barbershopId = typeof record.barbershop_id === 'string' ? record.barbershop_id.trim() : ''
  const serviceId = typeof record.service_id === 'string' ? record.service_id.trim() : ''

  if (!UUID_PATTERN.test(barbershopId) || !UUID_PATTERN.test(serviceId)) {
    throw new PaymentQuoteError('INVALID_QUOTE_REQUEST')
  }

  return { barbershopId, serviceId }
}

export function buildPaymentQuote(input: BuildPaymentQuoteInput): PaymentQuote {
  const { request, barbershop, service } = input

  if (!barbershop.active || barbershop.id !== request.barbershopId) {
    throw new PaymentQuoteError('BARBERSHOP_NOT_AVAILABLE')
  }
  if (!service.active || service.id !== request.serviceId) {
    throw new PaymentQuoteError('SERVICE_NOT_AVAILABLE')
  }
  if (service.barbershopId !== barbershop.id) {
    throw new PaymentQuoteError('SERVICE_BARBERSHOP_MISMATCH')
  }

  try {
    const depositAmount = barbershop.depositRequired
      ? calculateDepositAmount(service.price, barbershop.depositPercentage)
      : '0.00'
    const calculation = calculateProcessingFee({
      depositAmount,
      processingFeeMode: barbershop.processingFeeMode,
      effectiveRate: barbershop.effectiveProcessingRate,
      currency: barbershop.currency,
    })
    const depositRequired = barbershop.depositRequired && calculation.depositAmountCents > 0

    return {
      depositRequired,
      paymentAvailable: !depositRequired || barbershop.paymentAvailable,
      depositAmount: calculation.depositAmountCents / 100,
      processingFeeMode: calculation.processingFeeMode,
      processingFeeAmount: calculation.processingFeeAmountCents / 100,
      paymentTotalAmount: calculation.paymentTotalAmountCents / 100,
      currency: calculation.currency,
    }
  } catch {
    throw new PaymentQuoteError('INVALID_PAYMENT_CONFIGURATION')
  }
}

import { canonicalizeCheckoutBooking, hashCheckoutAttemptToken,
  type CanonicalCheckoutBooking } from './checkout-intent-contract.ts'
import { parseQuotedPayment } from './checkout-snapshot.ts'
import type { PaymentQuote } from './payment-quote.ts'

export interface ParsedCheckoutV2Request {
  token: string
  booking: CanonicalCheckoutBooking
  quotedPayment: PaymentQuote
}

// Explicit allowlist: client-supplied price, seller, appointment and preference
// identifiers are never forwarded to the booking or MP APIs.
export function parseCheckoutV2Request(value: unknown): ParsedCheckoutV2Request | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const body = value as Record<string, unknown>
  const quotedPayment = parseQuotedPayment(body.quoted_payment)
  if (!quotedPayment?.depositRequired || !quotedPayment.paymentAvailable
    || typeof body.attempt_token !== 'string') return null
  const fields = ['barbershop_id', 'barber_id', 'service_id', 'date', 'start_time',
    'client_name', 'client_phone'] as const
  if (!fields.every(field => typeof body[field] === 'string')) return null
  try {
    hashCheckoutAttemptToken(body.attempt_token)
    const booking = canonicalizeCheckoutBooking({
      barbershopId: body.barbershop_id as string,
      barberId: body.barber_id as string,
      serviceId: body.service_id as string,
      date: body.date as string,
      startTime: body.start_time as string,
      clientName: body.client_name as string,
      clientPhone: body.client_phone as string,
    })
    return { token: body.attempt_token, booking, quotedPayment }
  } catch { return null }
}

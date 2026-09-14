import { createHash, randomBytes } from 'node:crypto'

export const CHECKOUT_FINGERPRINT_VERSION = 1
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d(?::00)?$/

export interface CheckoutBookingInput {
  barbershopId: string
  barberId: string
  serviceId: string
  date: string
  startTime: string
  clientName: string
  clientPhone: string
}

export interface CanonicalCheckoutBooking extends CheckoutBookingInput {
  startTime: string
}

export function generateCheckoutAttemptToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashCheckoutAttemptToken(token: string): Buffer {
  if (!TOKEN_PATTERN.test(token)) throw new Error('INVALID_CHECKOUT_ATTEMPT_TOKEN')
  const decoded = Buffer.from(token, 'base64url')
  if (decoded.length !== 32 || decoded.toString('base64url') !== token) {
    throw new Error('INVALID_CHECKOUT_ATTEMPT_TOKEN')
  }
  return createHash('sha256').update(decoded).digest()
}

export function canonicalizeCheckoutBooking(input: CheckoutBookingInput): CanonicalCheckoutBooking {
  const barbershopId = input.barbershopId.trim().toLowerCase()
  const barberId = input.barberId.trim().toLowerCase()
  const serviceId = input.serviceId.trim().toLowerCase()
  const clientName = input.clientName.normalize('NFC').trim().replace(/\s+/g, ' ')
  const phoneTrimmed = input.clientPhone.trim()
  const clientPhone = phoneTrimmed.replace(/[\s().-]/g, '')
  const date = input.date.trim()
  const startTime = input.startTime.trim()

  const parsedDate = DATE_PATTERN.test(date) ? new Date(`${date}T00:00:00.000Z`) : null
  if (![barbershopId, barberId, serviceId].every(value => UUID_PATTERN.test(value))
    || !parsedDate || Number.isNaN(parsedDate.getTime())
    || parsedDate.toISOString().slice(0, 10) !== date
    || !TIME_PATTERN.test(startTime)
    || !clientName || clientName.length > 120
    || !/^\+?\d+$/.test(clientPhone) || clientPhone.length > 40) {
    throw new Error('INVALID_CHECKOUT_BOOKING')
  }

  return {
    barbershopId, barberId, serviceId, date,
    startTime: `${startTime.slice(0, 5)}:00`, clientName, clientPhone,
  }
}

export function hashCheckoutBookingFingerprint(input: CheckoutBookingInput): Buffer {
  const booking = canonicalizeCheckoutBooking(input)
  const fields = [
    CHECKOUT_FINGERPRINT_VERSION,
    booking.barbershopId, booking.serviceId, booking.barberId,
    booking.date, booking.startTime, booking.clientName, booking.clientPhone,
  ]
  return createHash('sha256').update(JSON.stringify(fields), 'utf8').digest()
}

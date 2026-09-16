import { parseQuotedPayment } from './checkout-snapshot.ts'
import type { PaymentQuote } from './payment-quote.ts'

export interface BookingDraft {
  barbershopId: string
  serviceId: string
  barberId: string
  date: string
  startTime: string
  clientName: string
  clientPhone: string
}

type AttemptStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/
const POLL_LIMIT_MS = 90_000

export function draftIdentity(draft: BookingDraft): string {
  return JSON.stringify([
    draft.barbershopId.trim().toLowerCase(), draft.serviceId.trim().toLowerCase(),
    draft.barberId.trim().toLowerCase(), draft.date.trim(),
    `${draft.startTime.trim().slice(0, 5)}:00`,
    draft.clientName.normalize('NFC').trim().replace(/\s+/g, ' '),
    draft.clientPhone.trim().replace(/[\s().-]/g, ''),
  ])
}

export function checkoutAttemptKey(barbershopId: string): string {
  return `turnea.checkout_attempt.v1.${barbershopId.trim().toLowerCase()}`
}

export function generateBrowserCheckoutAttemptToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function getOrCreateCheckoutAttempt(storage: AttemptStorage, draft: BookingDraft): string {
  const key = checkoutAttemptKey(draft.barbershopId)
  const identity = draftIdentity(draft)
  try {
    const existing = JSON.parse(storage.getItem(key) || 'null') as unknown
    if (existing && typeof existing === 'object') {
      const record = existing as Record<string, unknown>
      if (record.identity === identity && typeof record.token === 'string'
        && TOKEN_PATTERN.test(record.token)) return record.token
    }
  } catch { /* A malformed previous value is replaced below. */ }
  const token = generateBrowserCheckoutAttemptToken()
  // Persist before the first request. If storage fails, do not create an untracked intent.
  storage.setItem(key, JSON.stringify({ token, identity, createdAt: Date.now() }))
  return token
}

export function discardCheckoutAttempt(storage: AttemptStorage, barbershopId: string): void {
  storage.removeItem(checkoutAttemptKey(barbershopId))
}

export function isSafeMercadoPagoCheckoutUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 4096) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password
      && (url.hostname === 'mercadopago.com' || url.hostname.endsWith('.mercadopago.com')
        || url.hostname === 'mercadopago.com.ar' || url.hostname.endsWith('.mercadopago.com.ar'))
  } catch { return false }
}

export type CheckoutResult =
  | { kind: 'ready'; initPoint: string }
  | { kind: 'quote_changed'; payment: PaymentQuote }
  | { kind: 'expired' | 'slot_unavailable' | 'seller_changed' | 'intent_conflict' | 'retryable' | 'recovering' }

export async function submitCheckoutV2(
  storage: AttemptStorage,
  draft: BookingDraft,
  quotedPayment: PaymentQuote,
  options: {
    fetcher?: typeof fetch
    wait?: (ms: number) => Promise<void>
    now?: () => number
    onRecovering?: () => void
  } = {}
): Promise<CheckoutResult> {
  const token = getOrCreateCheckoutAttempt(storage, draft)
  const body = JSON.stringify({
    attempt_token: token, barbershop_id: draft.barbershopId,
    service_id: draft.serviceId, barber_id: draft.barberId,
    date: draft.date, start_time: draft.startTime,
    client_name: draft.clientName, client_phone: draft.clientPhone,
    quoted_payment: quotedPayment,
  })
  const fetcher = options.fetcher || fetch
  const wait = options.wait || (ms => new Promise<void>(resolve => setTimeout(resolve, ms)))
  const now = options.now || Date.now
  const deadline = now() + POLL_LIMIT_MS
  for (;;) {
    let response: Response
    let data: Record<string, unknown>
    try {
      response = await fetcher('/api/checkout/v2', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
      })
      const parsed: unknown = await response.json()
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { kind: 'retryable' }
      data = parsed as Record<string, unknown>
    } catch { return { kind: 'retryable' } }

    if (response.status === 200 && data.status === 'ready') {
      return isSafeMercadoPagoCheckoutUrl(data.initPoint)
        ? { kind: 'ready', initPoint: data.initPoint }
        : { kind: 'retryable' }
    }
    if (response.status === 202 && data.status === 'recovering') {
      options.onRecovering?.()
      const remaining = deadline - now()
      if (remaining <= 0) return { kind: 'recovering' }
      const retryAfter = typeof data.retryAfterMs === 'number' && Number.isFinite(data.retryAfterMs)
        ? data.retryAfterMs : 2000
      await wait(Math.min(Math.max(retryAfter, 500), 5000, remaining))
      continue
    }
    if (response.status === 410) {
      discardCheckoutAttempt(storage, draft.barbershopId)
      return { kind: 'expired' }
    }
    if (response.status === 409 && data.code === 'PAYMENT_QUOTE_CHANGED') {
      const payment = parseQuotedPayment(data.payment)
      return payment ? { kind: 'quote_changed', payment } : { kind: 'retryable' }
    }
    if (response.status === 409 && (data.code === 'slot_unavailable'
      || data.code === 'seller_changed' || data.code === 'intent_conflict')) {
      discardCheckoutAttempt(storage, draft.barbershopId)
      return { kind: data.code }
    }
    return { kind: 'retryable' }
  }
}

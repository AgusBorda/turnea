import type { PaymentAppointmentSnapshot } from './checkout-snapshot.ts'
import {
  validateCheckoutPreference,
  type ExpectedCheckoutPreference,
  type ValidatedCheckoutPreference,
} from './checkout-preference-validation.ts'

export interface CheckoutV2Intent {
  id: string
  appointmentId: string
  status: 'reserved' | 'creating' | 'unknown' | 'ready' | 'failed' | 'expired'
  phase: 'no_post' | 'post_possible'
  expectedSellerId: string | null
  preferenceId: string | null
  initPoint: string | null
  expiresAt: string
}

export type CheckoutV2Result =
  | { status: 'ready'; initPoint: string; payment: PaymentAppointmentSnapshot }
  | { status: 'recovering'; retryAfterMs: number }
  | { status: 'expired' | 'failed' | 'seller_conflict' | 'error' }

export interface CheckoutV2Dependencies {
  readIntent: (id: string) => Promise<CheckoutV2Intent | null>
  readSnapshot: (id: string, forPost?: boolean) => Promise<PaymentAppointmentSnapshot | null>
  prePostCheck: () => Promise<boolean>
  claim: (id: string) => Promise<{ result: string; claimId: string | null }>
  markPostPossible: (id: string, claimId: string) => Promise<string>
  release: (id: string, claimId: string) => Promise<void>
  markUnknown: (id: string, claimId: string) => Promise<void>
  complete: (id: string, claimId: string | null, preference: ValidatedCheckoutPreference) => Promise<string>
  postPreference: (appointmentId: string, snapshot: PaymentAppointmentSnapshot, expiresAt: string) => Promise<unknown | null>
  searchPreferences: (appointmentId: string) => Promise<{ total: number; ids: string[] } | null>
  getPreference: (id: string) => Promise<unknown | null>
  wait: (ms: number) => Promise<void>
}

function recovering(intent: CheckoutV2Intent): CheckoutV2Result {
  // The intent lifetime is 15 minutes. Guidance is bounded; the server never
  // loops or retries an external POST on its own.
  const ageMs = Math.max(0, Date.now() - (Date.parse(intent.expiresAt) - 15 * 60_000))
  const retryAfterMs = ageMs < 5_000 ? 2_000 : ageMs < 15_000 ? 5_000
    : ageMs < 45_000 ? 15_000 : ageMs < 120_000 ? 30_000 : 60_000
  return { status: 'recovering', retryAfterMs }
}

function sellerMatches(expected: string | null, current: string | null): boolean {
  // The DB also performs this check during get-or-create. This second check
  // protects state reads and prevents recovery under a reconnected seller.
  return expected === current
}

async function readReady(
  intent: CheckoutV2Intent, deps: CheckoutV2Dependencies
): Promise<CheckoutV2Result> {
  if (!intent.initPoint) return { status: 'error' }
  const snapshot = await deps.readSnapshot(intent.appointmentId)
  return snapshot ? { status: 'ready', initPoint: intent.initPoint, payment: snapshot }
    : { status: 'error' }
}

async function recover(
  intent: CheckoutV2Intent, deps: CheckoutV2Dependencies,
  knownPreferenceId?: string
): Promise<CheckoutV2Result> {
  const snapshot = await deps.readSnapshot(intent.appointmentId)
  if (!snapshot) return recovering(intent)
  const expected: ExpectedCheckoutPreference = {
    appointmentId: intent.appointmentId,
    expectedSellerId: intent.expectedSellerId,
    amountCents: Math.round(snapshot.paymentTotalAmount * 100),
    currency: snapshot.currency,
    expiresAt: intent.expiresAt,
  }
  let preferenceId = knownPreferenceId
  if (!preferenceId) {
    const search = await deps.searchPreferences(intent.appointmentId)
    if (!search || search.total !== 1 || search.ids.length !== 1) return recovering(intent)
    preferenceId = search.ids[0]
  }
  const detail = await deps.getPreference(preferenceId)
  const validated = validateCheckoutPreference(detail, expected, preferenceId)
  if (!validated) return recovering(intent)
  // A known response may still be held by its original worker. A search-only
  // retry completes once that worker has released/aged out its claim.
  const result = await deps.complete(intent.id, null, validated)
  if (result === 'ready' || result === 'already_ready') {
    const fresh = await deps.readIntent(intent.id)
    return fresh?.status === 'ready' ? readReady(fresh, deps) : recovering(intent)
  }
  return recovering(intent)
}

export async function runCheckoutV2(
  initial: CheckoutV2Intent, currentSellerId: string | null,
  deps: CheckoutV2Dependencies
): Promise<CheckoutV2Result> {
  if (!sellerMatches(initial.expectedSellerId, currentSellerId)) return { status: 'seller_conflict' }
  if (initial.status === 'expired' || Date.parse(initial.expiresAt) <= Date.now()) return { status: 'expired' }
  if (initial.status === 'failed') return { status: 'failed' }
  if (initial.status === 'ready') return readReady(initial, deps)
  if (initial.phase === 'post_possible' || initial.status === 'unknown') {
    try { return await recover(initial, deps) } catch { return recovering(initial) }
  }

  const claim = await deps.claim(initial.id)
  if (claim.result === 'busy') {
    await deps.wait(250)
    const fresh = await deps.readIntent(initial.id)
    if (fresh && sellerMatches(fresh.expectedSellerId, currentSellerId)
      && fresh.status === 'ready') return readReady(fresh, deps)
    return recovering(initial)
  }
  if (claim.result === 'expired') return { status: 'expired' }
  if (claim.result === 'post_possible') {
    try { return await recover(initial, deps) } catch { return recovering(initial) }
  }
  if (claim.result !== 'claimed' || !claim.claimId) return recovering(initial)

  const claimId = claim.claimId
  // All local checks precede the durable boundary. A failure here releases
  // only the no-post claim; the appointment remains available for retry.
  const snapshot = await deps.readSnapshot(initial.appointmentId, true).catch(() => null)
  if (!snapshot) {
    try { await deps.release(initial.id, claimId) } catch { /* stale no-post lease will recover */ }
    return { status: 'error' }
  }
  let stillSameSeller = false
  try { stillSameSeller = await deps.prePostCheck() } catch { /* fail closed */ }
  if (!stillSameSeller) {
    try { await deps.release(initial.id, claimId) } catch { /* stale no-post lease will recover */ }
    return { status: 'seller_conflict' }
  }
  let marked: string
  try { marked = await deps.markPostPossible(initial.id, claimId) }
  catch { return recovering(initial) } // An ambiguous DB response may already have committed.
  if (marked !== 'marked') return recovering(initial)

  let posted: unknown | null = null
  try { posted = await deps.postPreference(initial.appointmentId, snapshot, initial.expiresAt) }
  catch { /* Request may have reached Mercado Pago. */ }
  const postedRecord = posted && typeof posted === 'object' ? posted as Record<string, unknown> : null
  const preferenceId = typeof postedRecord?.id === 'string' ? postedRecord.id : null
  if (!preferenceId) {
    try { await deps.markUnknown(initial.id, claimId) } catch { /* post_possible remains durable */ }
    return recovering(initial)
  }

  const expected: ExpectedCheckoutPreference = {
    appointmentId: initial.appointmentId, expectedSellerId: initial.expectedSellerId,
    amountCents: Math.round(snapshot.paymentTotalAmount * 100),
    currency: snapshot.currency, expiresAt: initial.expiresAt,
  }
  const detail = await deps.getPreference(preferenceId).catch(() => null)
  const validated = validateCheckoutPreference(detail, expected, preferenceId)
  if (!validated) {
    try { await deps.markUnknown(initial.id, claimId) } catch { /* post_possible remains durable */ }
    return recovering(initial)
  }
  try {
    const completed = await deps.complete(initial.id, claimId, validated)
    if (completed === 'ready' || completed === 'already_ready') {
      return { status: 'ready', initPoint: validated.initPoint, payment: snapshot }
    }
  } catch { /* Persistence may have committed despite a lost response. */ }

  const fresh = await deps.readIntent(initial.id).catch(() => null)
  if (fresh?.status === 'ready') return readReady(fresh, deps)
  try { await deps.markUnknown(initial.id, claimId) } catch { /* still post_possible */ }
  // Known preference ID: GET and validate again, then retry the DB completion;
  // never issue a second preference POST.
  try { return await recover(initial, deps, preferenceId) } catch { return recovering(initial) }
}

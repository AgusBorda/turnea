export type MercadoPagoSellerIdentityResult =
  | { kind: 'match' }
  | { kind: 'mismatch' }
  | { kind: 'missing_collector' }
  | { kind: 'legacy_manual_unverified' }
  | { kind: 'invalid_expected_seller' }

function normalizedDecimalId(value: unknown): string | null {
  const text = typeof value === 'string' ? value.trim()
    : typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : ''
  if (!/^[0-9]+$/.test(text) || !/[1-9]/.test(text)) return null
  return text.replace(/^0+/, '')
}

export function validateMercadoPagoSellerIdentity(
  source: 'manual' | 'oauth',
  userId: string | null,
  collectorId: unknown
): MercadoPagoSellerIdentityResult {
  if (source === 'manual' && userId === null) return { kind: 'legacy_manual_unverified' }
  const expected = normalizedDecimalId(userId)
  if (!expected) return { kind: 'invalid_expected_seller' }
  const collector = normalizedDecimalId(collectorId)
  if (!collector) return { kind: 'missing_collector' }
  return { kind: expected === collector ? 'match' : 'mismatch' }
}

export function webhookSellerIdentityDecision(
  source: 'manual' | 'oauth',
  userId: string | null,
  collectorId: unknown
): { proceed: true } | { proceed: false; reason: 'seller_mismatch' | 'seller_missing' | 'seller_invalid' } {
  const identity = validateMercadoPagoSellerIdentity(source, userId, collectorId)
  if (identity.kind === 'match' || identity.kind === 'legacy_manual_unverified') {
    return { proceed: true }
  }
  return { proceed: false, reason: identity.kind === 'mismatch' ? 'seller_mismatch'
    : identity.kind === 'missing_collector' ? 'seller_missing' : 'seller_invalid' }
}

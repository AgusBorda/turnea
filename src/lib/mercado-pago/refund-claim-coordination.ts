// Keep the external POST behind a durable, acknowledged database transition.
import {
  validateMercadoPagoSellerIdentity,
  type MercadoPagoSellerIdentityResult,
} from './seller-identity.ts'

export async function guardRefundSellerIdentity(input: {
  source: 'manual' | 'oauth'
  userId: string | null
  collectorId: unknown
  canRelease: boolean
  release: (reason: 'seller_mismatch' | 'seller_missing') => Promise<boolean>
}): Promise<
  | { kind: 'continue' }
  | { kind: 'released'; reason: 'seller_mismatch' | 'seller_missing' }
  | { kind: 'blocked'; reason: 'seller_mismatch' | 'seller_missing' }
> {
  const identity: MercadoPagoSellerIdentityResult = validateMercadoPagoSellerIdentity(
    input.source, input.userId, input.collectorId
  )
  if (identity.kind === 'match' || identity.kind === 'legacy_manual_unverified') {
    return { kind: 'continue' }
  }
  const reason = identity.kind === 'mismatch' ? 'seller_mismatch' : 'seller_missing'
  if (!input.canRelease) return { kind: 'blocked', reason }
  try {
    return await input.release(reason) ? { kind: 'released', reason } : { kind: 'blocked', reason }
  } catch {
    return { kind: 'blocked', reason }
  }
}

export async function executeMarkedRefund<T>(
  markPostPossible: () => Promise<boolean>,
  postRefund: () => Promise<T>
): Promise<{ kind: 'mark_failed' } | { kind: 'posted'; result: T }> {
  try {
    if (!await markPostPossible()) return { kind: 'mark_failed' }
  } catch {
    return { kind: 'mark_failed' }
  }
  return { kind: 'posted', result: await postRefund() }
}

export function verificationRecoveryAction(input: {
  activeClaimId: string | null
  claimStartedFromPendingReview: boolean
  postPossible: boolean
  processingEstablished: boolean
}): 'release' | 'mark_verification_required' | 'no_change' {
  if (input.activeClaimId && input.claimStartedFromPendingReview && !input.postPossible) {
    return 'release'
  }
  return input.processingEstablished ? 'mark_verification_required' : 'no_change'
}

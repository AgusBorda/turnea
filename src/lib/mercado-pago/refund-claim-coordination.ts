// Keep the external POST behind a durable, acknowledged database transition.
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

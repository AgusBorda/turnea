import assert from 'node:assert/strict'
import test from 'node:test'
import { executeMarkedRefund, verificationRecoveryAction } from './refund-claim-coordination.ts'

test('marks post possible before issuing the refund POST', async () => {
  const events: string[] = []
  const outcome = await executeMarkedRefund(
    async () => { events.push('marked'); return true },
    async () => { events.push('POST'); return { status: 201 } }
  )
  assert.deepEqual(events, ['marked', 'POST'])
  assert.deepEqual(outcome, { kind: 'posted', result: { status: 201 } })
})

test('never POSTs when marking fails or has an ambiguous response', async () => {
  for (const marker of [async () => false, async () => { throw new Error('timeout') }]) {
    let postCount = 0
    const outcome = await executeMarkedRefund(marker, async () => { postCount += 1 })
    assert.equal(outcome.kind, 'mark_failed')
    assert.equal(postCount, 0)
  }
})

test('POST timeout propagates after the marker; it is never treated as pre-POST', async () => {
  let markerCount = 0
  await assert.rejects(
    executeMarkedRefund(
      async () => { markerCount += 1; return true },
      async () => { throw new Error('POST timeout') }
    ),
    /POST timeout/
  )
  assert.equal(markerCount, 1)
})

test('GET 429 or network failure releases a fresh pre-POST claim', () => {
  for (const failure of ['GET 429', 'GET network failure']) {
    assert.equal(verificationRecoveryAction({
      activeClaimId: 'claim-id', claimStartedFromPendingReview: true,
      postPossible: false, processingEstablished: true,
    }), 'release', failure)
  }
})

test('POST timeout and legacy or retry operations are never released', () => {
  assert.equal(verificationRecoveryAction({
    activeClaimId: 'claim-id', claimStartedFromPendingReview: true,
    postPossible: true, processingEstablished: true,
  }), 'mark_verification_required')
  assert.equal(verificationRecoveryAction({
    activeClaimId: null, claimStartedFromPendingReview: false,
    postPossible: true, processingEstablished: true,
  }), 'mark_verification_required')
  assert.equal(verificationRecoveryAction({
    activeClaimId: 'retry-claim', claimStartedFromPendingReview: false,
    postPossible: false, processingEstablished: true,
  }), 'mark_verification_required')
})

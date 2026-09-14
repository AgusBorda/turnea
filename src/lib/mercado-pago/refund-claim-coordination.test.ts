import assert from 'node:assert/strict'
import test from 'node:test'
import { executeMarkedRefund, guardRefundSellerIdentity, verificationRecoveryAction } from './refund-claim-coordination.ts'

test('matching OAuth and legacy manual sellers may continue to the durable POST boundary', async () => {
  for (const [source, userId, collectorId] of [
    ['oauth', '111', 111], ['manual', null, 999],
  ] as const) {
    let releases = 0
    const result = await guardRefundSellerIdentity({
      source, userId, collectorId, canRelease: true,
      release: async () => { releases += 1; return true },
    })
    assert.equal(result.kind, 'continue')
    assert.equal(releases, 0)
  }
})

test('wrong or absent sellers release a pre-POST V2 claim and never reach marking or POST', async () => {
  for (const [source, userId, collectorId, expectedReason] of [
    ['oauth', '111', 222, 'seller_mismatch'],
    ['oauth', '111', null, 'seller_missing'],
    ['manual', '111', 222, 'seller_mismatch'],
    ['oauth', 'bad', 111, 'seller_missing'],
  ] as const) {
    const events: string[] = []
    const guard = await guardRefundSellerIdentity({
      source, userId, collectorId, canRelease: true,
      release: async reason => { events.push(`release:${reason}`); return true },
    })
    if (guard.kind === 'continue') {
      await executeMarkedRefund(
        async () => { events.push('mark'); return true },
        async () => { events.push('POST') }
      )
    }
    assert.deepEqual(guard, { kind: 'released', reason: expectedReason })
    assert.deepEqual(events, [`release:${expectedReason}`])
  }
})

test('failed release or non-releasable claim blocks without mark or POST', async () => {
  for (const release of [async () => false, async () => { throw new Error('db unavailable') }]) {
    const result = await guardRefundSellerIdentity({
      source: 'oauth', userId: '111', collectorId: 222,
      canRelease: true, release,
    })
    assert.deepEqual(result, { kind: 'blocked', reason: 'seller_mismatch' })
  }
  const result = await guardRefundSellerIdentity({
    source: 'oauth', userId: '111', collectorId: 222,
    canRelease: false,
    release: async () => { throw new Error('must not release') },
  })
  assert.deepEqual(result, { kind: 'blocked', reason: 'seller_mismatch' })
})

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

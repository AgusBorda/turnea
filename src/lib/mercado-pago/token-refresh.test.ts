import assert from 'node:assert/strict'
import test from 'node:test'
import { parseMercadoPagoRefreshResponse, refreshMercadoPagoOAuthToken } from './token-refresh.ts'

const NOW = new Date('2026-09-11T12:00:00.000Z')
const validBody = {
  access_token: 'new-access', refresh_token: 'new-refresh', token_type: 'bearer',
  expires_in: 21600, user_id: 123, scope: 'read write offline_access', live_mode: false,
}

test('validates rotated OAuth tokens and recalculates expiration', () => {
  const parsed = parseMercadoPagoRefreshResponse(validBody, NOW)
  assert.equal(parsed?.refreshToken, 'new-refresh')
  assert.equal(parsed?.userId, '123')
  assert.equal(parsed?.expiresAt.toISOString(), '2026-09-11T18:00:00.000Z')
})

test('rejects insufficient scope and malformed bearer responses', () => {
  assert.equal(parseMercadoPagoRefreshResponse({ ...validBody, scope: 'read write' }, NOW), null)
  assert.equal(parseMercadoPagoRefreshResponse({ ...validBody, token_type: 'mac' }, NOW), null)
})

test('submits refresh server-side and returns the rotated token', async () => {
  let requestBody = ''
  const result = await refreshMercadoPagoOAuthToken({
    clientId: 'client', clientSecret: 'secret', refreshToken: 'old-refresh', now: NOW,
    fetchImpl: async (_url, init) => {
      requestBody = String(init?.body)
      return Response.json(validBody)
    },
  })
  assert.equal(result.kind, 'success')
  assert.equal(result.kind === 'success' && result.accessToken, 'new-access')
  assert.equal(JSON.parse(requestBody).grant_type, 'refresh_token')
})

test('classifies 429, 5xx and network failures as transient', async () => {
  for (const status of [429, 500, 503]) {
    const result = await refreshMercadoPagoOAuthToken({
      clientId: 'c', clientSecret: 's', refreshToken: 'r',
      fetchImpl: async () => new Response(null, { status }),
    })
    assert.equal(result.kind, 'transient')
  }
  const network = await refreshMercadoPagoOAuthToken({
    clientId: 'c', clientSecret: 's', refreshToken: 'r',
    fetchImpl: async () => { throw new Error('network') },
  })
  assert.equal(network.kind, 'transient')
})

test('classifies only confirmed invalid_grant as permanent', async () => {
  const permanent = await refreshMercadoPagoOAuthToken({
    clientId: 'c', clientSecret: 's', refreshToken: 'r',
    fetchImpl: async () => Response.json({ error: 'invalid_grant' }, { status: 400 }),
  })
  const ambiguous = await refreshMercadoPagoOAuthToken({
    clientId: 'c', clientSecret: 's', refreshToken: 'r',
    fetchImpl: async () => Response.json({ error: 'unauthorized' }, { status: 401 }),
  })
  assert.equal(permanent.kind, 'permanent')
  assert.equal(ambiguous.kind, 'invalid')
})

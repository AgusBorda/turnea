import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildMercadoPagoAuthorizationUrl,
  buildOAuthSettingsRedirect,
  createPkceChallenge,
  exchangeMercadoPagoAuthorizationCode,
  generateOAuthState,
  generatePkceVerifier,
  getMercadoPagoOAuthConfig,
  hashOAuthState,
  MercadoPagoOAuthConfigError,
  oauthFailureReasonFromProvider,
  parseMercadoPagoOAuthToken,
  requestHasSameOrigin,
} from './oauth.ts'

const config = {
  clientId: '123456',
  clientSecret: 'private-value',
  redirectUri: 'https://preview.turnea.test/api/mercado-pago/oauth/callback',
}

test('generates URL-safe state with 32 random bytes and hashes it with SHA-256', () => {
  const first = generateOAuthState()
  const second = generateOAuthState()
  assert.match(first, /^[A-Za-z0-9_-]{43}$/)
  assert.notEqual(first, second)
  assert.equal(hashOAuthState(first).byteLength, 32)
  assert.equal(
    hashOAuthState('known-state').toString('hex'),
    '79c397a7cad00d419985e83cb8e3bb2ff444a0f328704b4e9f2ec5750f7af337'
  )
})

test('generates a valid PKCE verifier and deterministic S256 challenge', () => {
  const verifier = generatePkceVerifier()
  assert.match(verifier, /^[A-Za-z0-9_-]{43}$/)
  assert.equal(
    createPkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'),
    'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'
  )
})

test('builds the Mercado Pago authorization URL without secrets', () => {
  const url = new URL(buildMercadoPagoAuthorizationUrl({
    config,
    state: 'safe-state',
    codeChallenge: 'safe-challenge',
  }))
  assert.equal(url.origin, 'https://auth.mercadopago.com')
  assert.equal(url.searchParams.get('client_id'), '123456')
  assert.equal(url.searchParams.get('response_type'), 'code')
  assert.equal(url.searchParams.get('platform_id'), 'mp')
  assert.equal(url.searchParams.get('redirect_uri'), config.redirectUri)
  assert.equal(url.searchParams.get('state'), 'safe-state')
  assert.equal(url.searchParams.get('code_challenge'), 'safe-challenge')
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256')
  assert.equal(url.toString().includes(config.clientSecret), false)
})

test('rejects malformed OAuth configuration', () => {
  const previous = {
    id: process.env.MERCADO_PAGO_CLIENT_ID,
    secret: process.env.MERCADO_PAGO_CLIENT_SECRET,
    redirect: process.env.MERCADO_PAGO_OAUTH_REDIRECT_URI,
  }
  delete process.env.MERCADO_PAGO_CLIENT_ID
  process.env.MERCADO_PAGO_CLIENT_SECRET = 'secret'
  process.env.MERCADO_PAGO_OAUTH_REDIRECT_URI = 'not-a-url'
  assert.throws(() => getMercadoPagoOAuthConfig(), MercadoPagoOAuthConfigError)
  if (previous.id === undefined) delete process.env.MERCADO_PAGO_CLIENT_ID
  else process.env.MERCADO_PAGO_CLIENT_ID = previous.id
  if (previous.secret === undefined) delete process.env.MERCADO_PAGO_CLIENT_SECRET
  else process.env.MERCADO_PAGO_CLIENT_SECRET = previous.secret
  if (previous.redirect === undefined) delete process.env.MERCADO_PAGO_OAUTH_REDIRECT_URI
  else process.env.MERCADO_PAGO_OAUTH_REDIRECT_URI = previous.redirect
})

test('validates the OAuth token response and expiration exactly', () => {
  const now = new Date('2026-09-09T12:00:00.000Z')
  const token = parseMercadoPagoOAuthToken({
    access_token: 'access',
    refresh_token: 'refresh',
    token_type: 'bearer',
    expires_in: 3600,
    user_id: 123456789,
    scope: 'offline_access read write',
    live_mode: false,
  }, now)
  assert.deepEqual(token, {
    accessToken: 'access',
    refreshToken: 'refresh',
    expiresAt: new Date('2026-09-09T13:00:00.000Z'),
    userId: '123456789',
    scope: 'offline_access read write',
    liveMode: false,
  })
  assert.equal(parseMercadoPagoOAuthToken({ access_token: 'access' }, now), null)
})

test('exchanges the code server-side with PKCE and validates the response', async () => {
  let requestBody: Record<string, unknown> | null = null
  const fetchImpl: typeof fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>
    return Response.json({
      access_token: 'access',
      refresh_token: 'refresh',
      token_type: 'bearer',
      expires_in: 60,
      user_id: 123,
      scope: 'read write offline_access',
      live_mode: false,
    })
  }
  const token = await exchangeMercadoPagoAuthorizationCode({
    config,
    code: 'authorization-code',
    codeVerifier: 'pkce-verifier',
    fetchImpl,
    now: new Date('2026-09-09T12:00:00.000Z'),
  })
  assert.equal(token?.expiresAt.toISOString(), '2026-09-09T12:01:00.000Z')
  assert.deepEqual(requestBody, {
    grant_type: 'authorization_code',
    client_id: '123456',
    client_secret: 'private-value',
    code: 'authorization-code',
    redirect_uri: config.redirectUri,
    code_verifier: 'pkce-verifier',
  })
})

test('maps provider errors and builds only fixed safe redirects', () => {
  assert.equal(oauthFailureReasonFromProvider('access_denied'), 'access_denied')
  assert.equal(oauthFailureReasonFromProvider('raw-provider-error'), 'exchange_failed')
  const redirect = buildOAuthSettingsRedirect(config.redirectUri, {
    connected: false,
    reason: 'invalid_state',
  })
  assert.equal(redirect.origin, 'https://preview.turnea.test')
  assert.equal(redirect.pathname, '/dashboard/settings')
  assert.equal(redirect.search, '?tab=mercado-pago&mp=oauth_error&reason=invalid_state')
  assert.equal(redirect.toString().includes(config.clientSecret), false)
})

test('accepts only matching request Origin and Host', () => {
  assert.equal(requestHasSameOrigin(new Headers({
    origin: 'https://preview.turnea.test',
    host: 'preview.turnea.test',
  })), true)
  assert.equal(requestHasSameOrigin(new Headers({
    origin: 'https://attacker.test',
    host: 'preview.turnea.test',
  })), false)
  assert.equal(requestHasSameOrigin(new Headers({ host: 'preview.turnea.test' })), false)
})

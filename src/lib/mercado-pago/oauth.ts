import { createHash, randomBytes } from 'node:crypto'

const MERCADO_PAGO_AUTHORIZE_URL = 'https://auth.mercadopago.com/authorization'
const MERCADO_PAGO_TOKEN_URL = 'https://api.mercadopago.com/oauth/token'
const REQUIRED_SCOPES = ['read', 'write', 'offline_access'] as const

export type MercadoPagoOAuthFailureReason =
  | 'access_denied'
  | 'invalid_state'
  | 'expired'
  | 'unauthorized'
  | 'exchange_failed'
  | 'configuration_error'

export interface MercadoPagoOAuthConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
}

export interface MercadoPagoOAuthToken {
  accessToken: string
  refreshToken: string
  expiresAt: Date
  userId: string
  scope: string
  liveMode: boolean
}

export class MercadoPagoOAuthConfigError extends Error {
  constructor() {
    super('MERCADO_PAGO_OAUTH_CONFIGURATION_ERROR')
    this.name = 'MercadoPagoOAuthConfigError'
  }
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new MercadoPagoOAuthConfigError()
  return value
}

export function getMercadoPagoOAuthConfig(): MercadoPagoOAuthConfig {
  const clientId = requiredEnv('MERCADO_PAGO_CLIENT_ID')
  const clientSecret = requiredEnv('MERCADO_PAGO_CLIENT_SECRET')
  const redirectUri = requiredEnv('MERCADO_PAGO_OAUTH_REDIRECT_URI')

  let parsedRedirect: URL
  try {
    parsedRedirect = new URL(redirectUri)
  } catch {
    throw new MercadoPagoOAuthConfigError()
  }

  if (
    !['http:', 'https:'].includes(parsedRedirect.protocol)
    || parsedRedirect.username
    || parsedRedirect.password
    || parsedRedirect.hash
  ) {
    throw new MercadoPagoOAuthConfigError()
  }

  return { clientId, clientSecret, redirectUri: parsedRedirect.toString() }
}

export function generateOAuthState() {
  return randomBytes(32).toString('base64url')
}

export function hashOAuthState(state: string) {
  return createHash('sha256').update(state, 'utf8').digest()
}

export function stateHashForPostgres(state: string) {
  return `\\x${hashOAuthState(state).toString('hex')}`
}

export function generatePkceVerifier() {
  return randomBytes(32).toString('base64url')
}

export function createPkceChallenge(verifier: string) {
  return createHash('sha256').update(verifier, 'ascii').digest('base64url')
}

export function buildMercadoPagoAuthorizationUrl(args: {
  config: MercadoPagoOAuthConfig
  state: string
  codeChallenge: string
}) {
  const url = new URL(MERCADO_PAGO_AUTHORIZE_URL)
  url.searchParams.set('client_id', args.config.clientId)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('platform_id', 'mp')
  url.searchParams.set('redirect_uri', args.config.redirectUri)
  url.searchParams.set('state', args.state)
  url.searchParams.set('code_challenge', args.codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')
  return url.toString()
}

export function requestMatchesConfiguredOrigin(
  headers: Headers,
  redirectUri: string
) {
  const configuredOrigin = new URL(redirectUri).origin
  const origin = headers.get('origin')
  const forwardedHost = headers.get('x-forwarded-host')
  const host = forwardedHost?.split(',')[0]?.trim() || headers.get('host')

  if (!origin || !host) return false

  try {
    return new URL(origin).origin === configuredOrigin
      && host.toLowerCase() === new URL(configuredOrigin).host.toLowerCase()
  } catch {
    return false
  }
}

export function requestHasSameOrigin(headers: Headers) {
  const origin = headers.get('origin')
  const forwardedHost = headers.get('x-forwarded-host')
  const host = forwardedHost?.split(',')[0]?.trim() || headers.get('host')
  if (!origin || !host) return false

  try {
    return new URL(origin).host.toLowerCase() === host.toLowerCase()
  } catch {
    return false
  }
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function parseMercadoPagoOAuthToken(
  value: unknown,
  now = new Date()
): MercadoPagoOAuthToken | null {
  if (!value || typeof value !== 'object') return null
  const token = value as Record<string, unknown>
  const userId = typeof token.user_id === 'number'
    ? String(token.user_id)
    : nonEmptyString(token.user_id) ? token.user_id.trim() : ''
  const scope = nonEmptyString(token.scope) ? token.scope.trim() : ''
  const scopes = new Set(scope.split(/\s+/).filter(Boolean))

  if (
    !nonEmptyString(token.access_token)
    || !nonEmptyString(token.refresh_token)
    || !nonEmptyString(token.token_type)
    || token.token_type.toLowerCase() !== 'bearer'
    || !Number.isSafeInteger(token.expires_in)
    || (token.expires_in as number) <= 0
    || !userId
    || typeof token.live_mode !== 'boolean'
    || !REQUIRED_SCOPES.every((required) => scopes.has(required))
  ) {
    return null
  }

  const expiresAtMs = now.getTime() + (token.expires_in as number) * 1000
  if (!Number.isSafeInteger(expiresAtMs)) return null

  return {
    accessToken: token.access_token.trim(),
    refreshToken: token.refresh_token.trim(),
    expiresAt: new Date(expiresAtMs),
    userId,
    scope,
    liveMode: token.live_mode,
  }
}

export async function exchangeMercadoPagoAuthorizationCode(args: {
  config: MercadoPagoOAuthConfig
  code: string
  codeVerifier: string
  fetchImpl?: typeof fetch
  now?: Date
}) {
  const fetchImpl = args.fetchImpl ?? fetch
  let response: Response

  try {
    response = await fetchImpl(MERCADO_PAGO_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: args.config.clientId,
        client_secret: args.config.clientSecret,
        code: args.code,
        redirect_uri: args.config.redirectUri,
        code_verifier: args.codeVerifier,
      }),
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    })
  } catch {
    return null
  }

  if (!response.ok) return null

  let body: unknown
  try {
    body = await response.json()
  } catch {
    return null
  }

  return parseMercadoPagoOAuthToken(body, args.now)
}

export function oauthFailureReasonFromProvider(error: string | null) {
  return error === 'access_denied' ? 'access_denied' : 'exchange_failed'
}

export function buildOAuthSettingsRedirect(
  redirectUri: string,
  result: { connected: true } | { connected: false; reason: MercadoPagoOAuthFailureReason }
) {
  const url = new URL('/dashboard/settings', new URL(redirectUri).origin)
  url.searchParams.set('tab', 'mercado-pago')
  if (result.connected) {
    url.searchParams.set('mp', 'connected')
  } else {
    url.searchParams.set('mp', 'oauth_error')
    url.searchParams.set('reason', result.reason)
  }
  return url
}

const TOKEN_URL = 'https://api.mercadopago.com/oauth/token'
const REQUIRED_SCOPES = ['read', 'write', 'offline_access'] as const

export type MercadoPagoRefreshResult =
  | { kind: 'success'; accessToken: string; refreshToken: string; expiresAt: Date; userId: string | null; scope: string | null; liveMode: boolean | null }
  | { kind: 'transient'; httpStatus: number | null }
  | { kind: 'permanent'; httpStatus: number }
  | { kind: 'invalid'; httpStatus: number }

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function parseMercadoPagoRefreshResponse(body: unknown, now = new Date()) {
  if (!body || typeof body !== 'object') return null
  const value = body as Record<string, unknown>
  const accessToken = text(value.access_token)
  const refreshToken = text(value.refresh_token)
  const tokenType = text(value.token_type)
  const userId = typeof value.user_id === 'number' ? String(value.user_id) : text(value.user_id)
  const scope = text(value.scope)
  const liveMode = typeof value.live_mode === 'boolean' ? value.live_mode : null
  if (!accessToken || !refreshToken || tokenType?.toLowerCase() !== 'bearer'
    || !Number.isSafeInteger(value.expires_in) || (value.expires_in as number) <= 0) return null
  if (scope) {
    const scopes = new Set(scope.split(/\s+/))
    if (!REQUIRED_SCOPES.every(required => scopes.has(required))) return null
  }
  return {
    accessToken,
    refreshToken,
    expiresAt: new Date(now.getTime() + (value.expires_in as number) * 1000),
    userId,
    scope,
    liveMode,
  }
}

export async function refreshMercadoPagoOAuthToken(args: {
  clientId: string
  clientSecret: string
  refreshToken: string
  fetchImpl?: typeof fetch
  now?: Date
}): Promise<MercadoPagoRefreshResult> {
  let response: Response
  try {
    response = await (args.fetchImpl ?? fetch)(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        client_id: args.clientId,
        client_secret: args.clientSecret,
        refresh_token: args.refreshToken,
      }),
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    })
  } catch {
    return { kind: 'transient', httpStatus: null }
  }
  if (response.status === 429 || response.status >= 500) {
    return { kind: 'transient', httpStatus: response.status }
  }
  let body: unknown = null
  try { body = await response.json() } catch { /* classified below */ }
  if (!response.ok) {
    const error = body && typeof body === 'object' ? text((body as Record<string, unknown>).error) : null
    return error === 'invalid_grant'
      ? { kind: 'permanent', httpStatus: response.status }
      : { kind: 'invalid', httpStatus: response.status }
  }
  const parsed = parseMercadoPagoRefreshResponse(body, args.now)
  return parsed ? { kind: 'success', ...parsed } : { kind: 'invalid', httpStatus: response.status }
}

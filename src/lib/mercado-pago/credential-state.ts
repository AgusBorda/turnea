export const MERCADO_PAGO_REFRESH_MARGIN_MS = 10 * 60 * 1000

export type MercadoPagoCredentialErrorCode =
  | 'MERCADO_PAGO_CREDENTIAL_UNAVAILABLE'
  | 'MERCADO_PAGO_NOT_CONNECTED'
  | 'MERCADO_PAGO_REAUTH_REQUIRED'
  | 'MERCADO_PAGO_TOKEN_REFRESH_REQUIRED'
  | 'MERCADO_PAGO_REFRESH_TRANSIENT_FAILURE'

export interface MercadoPagoCredentialRow {
  mp_access_token: unknown
  mp_user_id: unknown
  credential_source: unknown
  connection_status: unknown
  mp_token_expires_at: unknown
  mp_live_mode: unknown
}

export interface MercadoPagoCredential {
  accessToken: string
  source: 'manual' | 'oauth'
  userId: string | null
  liveMode: boolean | null
}

export class MercadoPagoCredentialError extends Error {
  readonly code: MercadoPagoCredentialErrorCode

  constructor(code: MercadoPagoCredentialErrorCode) {
    super(code)
    this.name = 'MercadoPagoCredentialError'
    this.code = code
  }
}

function nonEmptyString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function resolveMercadoPagoCredential(
  row: MercadoPagoCredentialRow | null,
  nowMs = Date.now(),
  refreshMarginMs = MERCADO_PAGO_REFRESH_MARGIN_MS
): MercadoPagoCredential {
  if (!row) {
    throw new MercadoPagoCredentialError('MERCADO_PAGO_NOT_CONNECTED')
  }

  if (row.connection_status === 'disconnected') {
    throw new MercadoPagoCredentialError('MERCADO_PAGO_NOT_CONNECTED')
  }

  if (row.connection_status === 'reauth_required') {
    throw new MercadoPagoCredentialError('MERCADO_PAGO_REAUTH_REQUIRED')
  }

  if (row.connection_status !== 'connected') {
    throw new MercadoPagoCredentialError('MERCADO_PAGO_CREDENTIAL_UNAVAILABLE')
  }

  const accessToken = nonEmptyString(row.mp_access_token)
  if (!accessToken) {
    throw new MercadoPagoCredentialError('MERCADO_PAGO_CREDENTIAL_UNAVAILABLE')
  }

  if (row.credential_source === 'manual') {
    return {
      accessToken,
      source: 'manual',
      userId: nonEmptyString(row.mp_user_id),
      liveMode: typeof row.mp_live_mode === 'boolean' ? row.mp_live_mode : null,
    }
  }

  if (row.credential_source !== 'oauth') {
    throw new MercadoPagoCredentialError('MERCADO_PAGO_CREDENTIAL_UNAVAILABLE')
  }

  const userId = nonEmptyString(row.mp_user_id)
  const expiresAt = typeof row.mp_token_expires_at === 'string'
    ? Date.parse(row.mp_token_expires_at)
    : Number.NaN

  if (!userId || !Number.isFinite(expiresAt)) {
    throw new MercadoPagoCredentialError('MERCADO_PAGO_CREDENTIAL_UNAVAILABLE')
  }

  if (expiresAt - nowMs <= refreshMarginMs) {
    throw new MercadoPagoCredentialError('MERCADO_PAGO_TOKEN_REFRESH_REQUIRED')
  }

  return {
    accessToken,
    source: 'oauth',
    userId,
    liveMode: typeof row.mp_live_mode === 'boolean' ? row.mp_live_mode : null,
  }
}

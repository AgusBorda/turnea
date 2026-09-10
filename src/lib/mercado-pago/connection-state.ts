export type MercadoPagoConnectionSource = 'manual' | 'oauth' | null
export type MercadoPagoConnectionStatus = 'connected' | 'disconnected' | 'reauth_required' | null
export type MercadoPagoConnectionUiState = 'not_connected' | 'oauth_connected' | 'manual_legacy' | 'reauth_required'

export interface MercadoPagoConnectionSummary {
  configured: boolean
  source: MercadoPagoConnectionSource
  status: MercadoPagoConnectionStatus
  mpUserId: string | null
  expiresAt: string | null
  connectedAt: string | null
}

export type SettingsSection = 'general' | 'reservations' | 'mercado-pago'

export type MercadoPagoOAuthResult =
  | { tone: 'success'; message: string }
  | { tone: 'error'; message: string }
  | null

export function getMercadoPagoConnectionUiState(
  summary: MercadoPagoConnectionSummary
): MercadoPagoConnectionUiState {
  if (summary.status === 'reauth_required') return 'reauth_required'
  if (summary.status !== 'connected' || !summary.configured) return 'not_connected'
  if (summary.source === 'oauth') return 'oauth_connected'
  if (summary.source === 'manual') return 'manual_legacy'
  return 'not_connected'
}

export function isMercadoPagoConnectionUsable(
  summary: MercadoPagoConnectionSummary,
  nowMs = Date.now()
): boolean {
  if (!summary.configured || summary.status !== 'connected') return false
  if (summary.source === 'manual') return true
  if (summary.source !== 'oauth' || !summary.expiresAt) return false
  const expiresAt = Date.parse(summary.expiresAt)
  return Number.isFinite(expiresAt) && expiresAt - nowMs > 10 * 60 * 1000
}

export function shouldWarnDepositCapability(
  depositRequired: boolean,
  summary: MercadoPagoConnectionSummary,
  nowMs = Date.now()
): boolean {
  return depositRequired && !isMercadoPagoConnectionUsable(summary, nowMs)
}

export function parseSettingsSection(value: unknown): SettingsSection {
  return value === 'reservations' || value === 'mercado-pago' || value === 'general'
    ? value
    : 'general'
}

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  access_denied: 'Cancelaste la autorización de Mercado Pago.',
  invalid_state: 'La conexión ya no es válida. Iniciá el proceso nuevamente.',
  expired: 'La conexión venció. Iniciá el proceso nuevamente.',
  unauthorized: 'Tu sesión no pudo validar esta conexión. Volvé a iniciar sesión e intentá nuevamente.',
  exchange_failed: 'Mercado Pago no pudo completar la conexión. Intentá nuevamente.',
  configuration_error: 'La conexión de Mercado Pago no está disponible en este momento.',
}

export function getMercadoPagoOAuthResult(mp: unknown, reason: unknown): MercadoPagoOAuthResult {
  if (mp === 'connected') {
    return { tone: 'success', message: 'Mercado Pago se conectó correctamente.' }
  }
  if (mp !== 'oauth_error') return null
  return {
    tone: 'error',
    message: typeof reason === 'string' && OAUTH_ERROR_MESSAGES[reason]
      ? OAUTH_ERROR_MESSAGES[reason]
      : 'No se pudo completar la conexión con Mercado Pago.',
  }
}

export const EMPTY_MERCADO_PAGO_CONNECTION_SUMMARY: MercadoPagoConnectionSummary = {
  configured: false,
  source: null,
  status: null,
  mpUserId: null,
  expiresAt: null,
  connectedAt: null,
}

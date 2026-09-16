import { validateMercadoPagoSellerIdentity } from '../mercado-pago/seller-identity.ts'

export interface ExpectedCheckoutPreference {
  appointmentId: string
  expectedSellerId: string | null
  amountCents: number
  currency: string
  expiresAt: string
}

export interface ValidatedCheckoutPreference {
  id: string
  initPoint: string
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null
}

function cents(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null
  const text = String(value)
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(text)) return null
  const [whole, fraction = ''] = text.split('.')
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  return Number.isSafeInteger(result) ? result : null
}

export function isMercadoPagoCheckoutUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 4096) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password
      && (url.hostname === 'mercadopago.com' || url.hostname.endsWith('.mercadopago.com')
        || url.hostname === 'mercadopago.com.ar' || url.hostname.endsWith('.mercadopago.com.ar'))
  } catch { return false }
}

// Only documented preference fields are required. Missing external_reference is
// tolerated for a known seller because the GET example does not promise it.
export function validateCheckoutPreference(
  value: unknown,
  expected: ExpectedCheckoutPreference,
  requiredId?: string
): ValidatedCheckoutPreference | null {
  const preference = record(value)
  if (!preference) return null
  const id = typeof preference.id === 'string' ? preference.id.trim() : ''
  if (!id || id.length > 255 || (requiredId && id !== requiredId)
    || !isMercadoPagoCheckoutUrl(preference.init_point)) return null
  if (preference.external_reference != null
    && preference.external_reference !== expected.appointmentId) return null

  if (expected.expectedSellerId) {
    const identity = validateMercadoPagoSellerIdentity(
      'oauth', expected.expectedSellerId, preference.collector_id
    )
    if (identity.kind !== 'match') return null
  } else if (preference.external_reference !== expected.appointmentId) {
    // An unknown legacy-manual seller needs positive appointment identity.
    return null
  }

  const items = preference.items
  if (!Array.isArray(items) || items.length !== 1) return null
  const item = record(items[0])
  if (!item || item.quantity !== 1 || item.currency_id !== expected.currency
    || cents(item.unit_price) !== expected.amountCents) return null
  const actualExpiry = typeof preference.expiration_date_to === 'string'
    ? Date.parse(preference.expiration_date_to) : NaN
  const expectedExpiry = Date.parse(expected.expiresAt)
  if (!Number.isFinite(actualExpiry) || !Number.isFinite(expectedExpiry)
    || Math.abs(actualExpiry - expectedExpiry) > 2000) return null
  return { id, initPoint: preference.init_point }
}

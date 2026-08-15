import 'server-only'

const MERCADO_PAGO_API_URL = 'https://api.mercadopago.com'
const REQUEST_TIMEOUT_MS = 12_000

export interface MercadoPagoPayment {
  id?: unknown
  status?: unknown
  collector_id?: unknown
  live_mode?: unknown
  external_reference?: unknown
  transaction_amount?: unknown
  currency_id?: unknown
  order?: { id?: unknown } | null
}

export interface MercadoPagoRefund {
  id?: unknown
  payment_id?: unknown
  amount?: unknown
  status?: unknown
}

export interface MercadoPagoMerchantOrder {
  preference_id?: unknown
}

export interface MercadoPagoApiResult<T> {
  responseReceived: boolean
  ok: boolean
  status: number | null
  data: T | null
  errorCode: string | null
}

function extractErrorCode(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) return null
  const candidate = value as { code?: unknown; error?: unknown }
  const code = candidate.code ?? candidate.error
  if (typeof code !== 'string' && typeof code !== 'number') return null
  return String(code).slice(0, 64)
}

async function mercadoPagoRequest<T>(
  accessToken: string,
  path: string,
  init?: RequestInit
): Promise<MercadoPagoApiResult<T>> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(`${MERCADO_PAGO_API_URL}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...init?.headers,
      },
      cache: 'no-store',
      signal: controller.signal,
    })
    const raw: unknown = await response.json().catch(() => null)

    return {
      responseReceived: true,
      ok: response.ok,
      status: response.status,
      data: raw as T | null,
      errorCode: response.ok ? null : extractErrorCode(raw),
    }
  } catch {
    return {
      responseReceived: false,
      ok: false,
      status: null,
      data: null,
      errorCode: null,
    }
  } finally {
    clearTimeout(timeout)
  }
}

export function getMercadoPagoPayment(accessToken: string, paymentId: string) {
  return mercadoPagoRequest<MercadoPagoPayment>(
    accessToken,
    `/v1/payments/${encodeURIComponent(paymentId)}`
  )
}

export function getMercadoPagoMerchantOrder(accessToken: string, merchantOrderId: string) {
  return mercadoPagoRequest<MercadoPagoMerchantOrder>(
    accessToken,
    `/merchant_orders/${encodeURIComponent(merchantOrderId)}`
  )
}

export async function getMercadoPagoRefunds(
  accessToken: string,
  paymentId: string
): Promise<MercadoPagoApiResult<MercadoPagoRefund[]>> {
  const result = await mercadoPagoRequest<unknown>(
    accessToken,
    `/v1/payments/${encodeURIComponent(paymentId)}/refunds`
  )

  return {
    ...result,
    data: Array.isArray(result.data) ? result.data as MercadoPagoRefund[] : null,
  }
}

export function createMercadoPagoFullRefund(
  accessToken: string,
  paymentId: string,
  idempotencyKey: string
) {
  return mercadoPagoRequest<MercadoPagoRefund>(
    accessToken,
    `/v1/payments/${encodeURIComponent(paymentId)}/refunds`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Idempotency-Key': idempotencyKey,
      },
    }
  )
}

import 'server-only'

const BASE = 'https://api.mercadopago.com/checkout/preferences'

async function readJson(response: Response): Promise<unknown> {
  try { return await response.json() } catch { return null }
}

function headers(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
}

export async function createMercadoPagoPreference(
  accessToken: string, body: Record<string, unknown>
): Promise<{ ok: true; data: unknown } | { ok: false }> {
  // Once invoked, any failed or missing response is ambiguous. Never retry POST.
  try {
    const response = await fetch(BASE, {
      method: 'POST', headers: headers(accessToken), body: JSON.stringify(body),
      signal: AbortSignal.timeout(12000), cache: 'no-store',
    })
    if (!response.ok) return { ok: false }
    return { ok: true, data: await readJson(response) }
  } catch { return { ok: false } }
}

export async function searchMercadoPagoPreferences(
  accessToken: string, appointmentId: string
): Promise<{ total: number; ids: string[] } | null> {
  try {
    const url = new URL(`${BASE}/search`)
    url.searchParams.set('external_reference', appointmentId)
    url.searchParams.set('limit', '2')
    const response = await fetch(url, {
      headers: headers(accessToken), signal: AbortSignal.timeout(8000), cache: 'no-store',
    })
    if (!response.ok) return null
    const data: unknown = await readJson(response)
    if (!data || typeof data !== 'object') return null
    const result = data as { total?: unknown; elements?: unknown }
    if (!Number.isSafeInteger(result.total) || (result.total as number) < 0
      || !Array.isArray(result.elements)) return null
    const ids = result.elements.map(element =>
      element && typeof element === 'object' && typeof element.id === 'string' ? element.id : null)
    if (ids.some(id => !id)) return null
    return { total: result.total as number, ids: ids as string[] }
  } catch { return null }
}

export async function getMercadoPagoPreference(
  accessToken: string, preferenceId: string
): Promise<unknown | null> {
  if (!preferenceId || preferenceId.length > 255 || !/^[A-Za-z0-9_-]+$/.test(preferenceId)) return null
  try {
    const response = await fetch(`${BASE}/${encodeURIComponent(preferenceId)}`, {
      headers: headers(accessToken), signal: AbortSignal.timeout(8000), cache: 'no-store',
    })
    return response.ok ? readJson(response) : null
  } catch { return null }
}

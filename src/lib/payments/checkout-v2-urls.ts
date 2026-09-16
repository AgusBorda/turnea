export function resolveCheckoutAppUrl(
  configuredUrl: string | undefined,
  requestOrigin: string,
  requestHostname: string
): string | null {
  if (!configuredUrl && requestHostname !== 'localhost') return null

  try {
    const url = new URL(configuredUrl || requestOrigin)
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && url.hostname === 'localhost')) {
      return null
    }
    return url.origin
  } catch {
    return null
  }
}

export function buildCheckoutNotificationUrl(
  appUrl: string,
  barbershopId: string,
  vercelEnv: string | undefined,
  bypassSecret: string | undefined
): { url: string | null } | null {
  try {
    const base = new URL(appUrl)
    if (base.protocol !== 'https:' && !(base.protocol === 'http:' && base.hostname === 'localhost')) {
      return null
    }
    if (base.hostname === 'localhost') return { url: null }

    const url = new URL('/api/webhooks/mp', base)
    url.searchParams.set('barbershop_id', barbershopId)
    url.searchParams.set('source_news', 'webhooks')

    // A public Preview needs the ordinary webhook URL. Deployment-protection
    // bypass is opt-in only when the secret is actually configured.
    const bypass = bypassSecret?.trim()
    if (vercelEnv === 'preview' && bypass) {
      url.searchParams.set('x-vercel-protection-bypass', bypass)
    }

    return { url: url.toString() }
  } catch {
    return null
  }
}

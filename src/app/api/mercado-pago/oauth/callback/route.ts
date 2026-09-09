import { NextResponse } from 'next/server'

import {
  buildOAuthSettingsRedirect,
  exchangeMercadoPagoAuthorizationCode,
  getMercadoPagoOAuthConfig,
  MercadoPagoOAuthConfigError,
  oauthFailureReasonFromProvider,
  stateHashForPostgres,
  type MercadoPagoOAuthFailureReason,
} from '@/lib/mercado-pago/oauth'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

interface OAuthAttempt {
  barbershop_id: string
  initiated_by: string
  code_verifier_secret: string
  expires_at: string
  consumed_at: string | null
}

function failureRedirect(redirectUri: string, reason: MercadoPagoOAuthFailureReason) {
  return NextResponse.redirect(buildOAuthSettingsRedirect(redirectUri, { connected: false, reason }))
}

export async function GET(request: Request) {
  let config
  try {
    config = getMercadoPagoOAuthConfig()
  } catch (error) {
    if (error instanceof MercadoPagoOAuthConfigError) {
      return NextResponse.json({ error: 'OAuth no está configurado.' }, { status: 503 })
    }
    throw error
  }

  const query = new URL(request.url).searchParams
  const providerError = query.get('error')
  if (providerError) {
    return failureRedirect(config.redirectUri, oauthFailureReasonFromProvider(providerError))
  }

  const code = query.get('code')?.trim() ?? ''
  const state = query.get('state')?.trim() ?? ''
  if (!code || !state || code.length > 2048 || state.length > 512) {
    return failureRedirect(config.redirectUri, 'invalid_state')
  }

  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return failureRedirect(config.redirectUri, 'unauthorized')

  const admin = createAdminClient()
  const stateHash = stateHashForPostgres(state)
  const { data, error: attemptError } = await admin
    .from('mercado_pago_oauth_attempts')
    .select('barbershop_id, initiated_by, code_verifier_secret, expires_at, consumed_at')
    .eq('state_hash', stateHash)
    .maybeSingle()

  const attempt = data as OAuthAttempt | null
  if (attemptError || !attempt || attempt.consumed_at) {
    return failureRedirect(config.redirectUri, 'invalid_state')
  }
  if (new Date(attempt.expires_at).getTime() <= Date.now()) {
    return failureRedirect(config.redirectUri, 'expired')
  }
  if (attempt.initiated_by !== user.id) {
    return failureRedirect(config.redirectUri, 'unauthorized')
  }

  const { data: ownedBarbershop, error: ownershipError } = await supabase
    .from('barbershops')
    .select('id')
    .eq('id', attempt.barbershop_id)
    .eq('owner_id', user.id)
    .maybeSingle()

  if (ownershipError || !ownedBarbershop) {
    return failureRedirect(config.redirectUri, 'unauthorized')
  }

  const token = await exchangeMercadoPagoAuthorizationCode({
    config,
    code,
    codeVerifier: attempt.code_verifier_secret,
  })
  if (!token) return failureRedirect(config.redirectUri, 'exchange_failed')

  const { data: completion, error: completionError } = await admin.rpc(
    'complete_mercado_pago_oauth_connection',
    {
      p_state_hash: stateHash,
      p_initiated_by: user.id,
      p_access_token: token.accessToken,
      p_refresh_token: token.refreshToken,
      p_token_expires_at: token.expiresAt.toISOString(),
      p_mp_user_id: token.userId,
      p_scope: token.scope,
      p_live_mode: token.liveMode,
      p_application_id: config.clientId,
    }
  )

  if (completionError || completion !== 'connected') {
    return failureRedirect(config.redirectUri, 'invalid_state')
  }

  return NextResponse.redirect(buildOAuthSettingsRedirect(config.redirectUri, { connected: true }))
}

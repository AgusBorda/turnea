import { NextResponse } from 'next/server'

import {
  buildMercadoPagoAuthorizationUrl,
  createPkceChallenge,
  generateOAuthState,
  generatePkceVerifier,
  getMercadoPagoOAuthConfig,
  MercadoPagoOAuthConfigError,
  requestMatchesConfiguredOrigin,
  stateHashForPostgres,
} from '@/lib/mercado-pago/oauth'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

interface OAuthStartRequest {
  barbershopId?: unknown
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(request: Request) {
  let config
  try {
    config = getMercadoPagoOAuthConfig()
  } catch (error) {
    if (error instanceof MercadoPagoOAuthConfigError) {
      return NextResponse.json({ error: 'OAuth no está configurado.' }, { status: 503 })
    }
    throw error
  }

  if (!requestMatchesConfiguredOrigin(request.headers, config.redirectUri)) {
    return NextResponse.json({ error: 'Origen no autorizado.' }, { status: 403 })
  }

  let body: OAuthStartRequest
  try {
    body = await request.json() as OAuthStartRequest
  } catch {
    return NextResponse.json({ error: 'Solicitud inválida.' }, { status: 400 })
  }

  const barbershopId = typeof body.barbershopId === 'string' ? body.barbershopId.trim() : ''
  if (!UUID_PATTERN.test(barbershopId)) {
    return NextResponse.json({ error: 'Barbería inválida.' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
  }

  const { data: ownedBarbershop, error: ownershipError } = await supabase
    .from('barbershops')
    .select('id')
    .eq('id', barbershopId)
    .eq('owner_id', user.id)
    .maybeSingle()

  if (ownershipError) {
    return NextResponse.json({ error: 'No se pudo verificar la barbería.' }, { status: 500 })
  }
  if (!ownedBarbershop) {
    return NextResponse.json({ error: 'No tenés permiso para modificar esta barbería.' }, { status: 403 })
  }

  const state = generateOAuthState()
  const codeVerifier = generatePkceVerifier()
  const admin = createAdminClient()
  const { error: insertError } = await admin
    .from('mercado_pago_oauth_attempts')
    .insert({
      state_hash: stateHashForPostgres(state),
      barbershop_id: barbershopId,
      initiated_by: user.id,
      code_verifier_secret: codeVerifier,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    })

  if (insertError) {
    return NextResponse.json({ error: 'No se pudo iniciar la conexión.' }, { status: 500 })
  }

  return NextResponse.json({
    authorizationUrl: buildMercadoPagoAuthorizationUrl({
      config,
      state,
      codeChallenge: createPkceChallenge(codeVerifier),
    }),
  })
}

import { NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

interface CredentialRequest {
  barbershopId?: unknown
  accessToken?: unknown
}

export async function POST(request: Request) {
  let body: CredentialRequest

  try {
    body = await request.json() as CredentialRequest
  } catch {
    return NextResponse.json({ error: 'Solicitud inválida.' }, { status: 400 })
  }

  const barbershopId = typeof body.barbershopId === 'string' ? body.barbershopId.trim() : ''
  const accessToken = typeof body.accessToken === 'string' ? body.accessToken.trim() : ''

  if (!barbershopId || !accessToken || accessToken.length > 4096) {
    return NextResponse.json({ error: 'Los datos de la credencial son inválidos.' }, { status: 400 })
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

  const admin = createAdminClient()
  const { error: credentialError } = await admin
    .from('barbershop_payment_credentials')
    .upsert(
      { barbershop_id: barbershopId, mp_access_token: accessToken },
      { onConflict: 'barbershop_id' }
    )

  if (credentialError) {
    return NextResponse.json({ error: 'No se pudo guardar la credencial de Mercado Pago.' }, { status: 500 })
  }

  const { error: configuredError } = await admin
    .from('barbershops')
    .update({ mp_configured: true })
    .eq('id', barbershopId)

  if (configuredError) {
    return NextResponse.json({ error: 'La credencial se guardó, pero no se pudo actualizar su estado.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

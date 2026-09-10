import { NextResponse } from 'next/server'

import { requestHasSameOrigin } from '@/lib/mercado-pago/oauth'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

interface DisconnectRequest {
  barbershopId?: unknown
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(request: Request) {
  if (!requestHasSameOrigin(request.headers)) {
    return NextResponse.json({ error: 'Origen no autorizado.' }, { status: 403 })
  }

  let body: DisconnectRequest
  try {
    body = await request.json() as DisconnectRequest
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

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('disconnect_mercado_pago_oauth_connection', {
    p_barbershop_id: barbershopId,
    p_owner_id: user.id,
  })

  if (error) {
    if (error.message.includes('MP_OAUTH_OWNERSHIP_MISMATCH')) {
      return NextResponse.json({ error: 'No tenés permiso para modificar esta barbería.' }, { status: 403 })
    }
    if (error.message.includes('MP_OAUTH_CONNECTION_NOT_FOUND')) {
      return NextResponse.json({ error: 'No hay una conexión OAuth activa para desconectar.' }, { status: 409 })
    }
    return NextResponse.json({ error: 'No se pudo desconectar Mercado Pago.' }, { status: 500 })
  }

  if (data !== 'disconnected') {
    return NextResponse.json({ error: 'No se pudo desconectar Mercado Pago.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

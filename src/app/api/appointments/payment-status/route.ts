import { NextRequest, NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store, no-cache, max-age=0, must-revalidate',
  'CDN-Cache-Control': 'no-store',
  'Vercel-CDN-Cache-Control': 'no-store',
}

interface PaymentStatusView {
  status: string
  deposit_status: string | null
}

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS })
}

export async function GET(request: NextRequest) {
  const appointmentId = request.nextUrl.searchParams.get('appointment_id')?.trim() || ''
  const slug = request.nextUrl.searchParams.get('slug')?.trim() || ''

  if (!UUID_PATTERN.test(appointmentId) || !SLUG_PATTERN.test(slug)) {
    return json({ error: 'Solicitud inválida' }, 400)
  }

  const supabase = await createClient()
  const { data: barbershop, error: barbershopError } = await supabase
    .from('barbershops')
    .select('id')
    .eq('slug', slug)
    .maybeSingle()

  if (barbershopError) {
    return json({ error: 'No se pudo consultar el estado' }, 500)
  }

  if (!barbershop) {
    return json({ error: 'Reserva no encontrada' }, 404)
  }

  const { data: appointmentData, error: appointmentError } = await supabase
    .rpc('get_public_appointment_payment_status', {
      p_appointment_id: appointmentId,
      p_barbershop_id: barbershop.id,
    })
    .maybeSingle()
  const appointment = appointmentData as PaymentStatusView | null

  if (appointmentError) {
    return json({ error: 'No se pudo consultar el estado' }, 500)
  }

  if (!appointment) {
    return json({ error: 'Reserva no encontrada' }, 404)
  }

  return json({
    status: appointment.status,
    deposit_status: appointment.deposit_status,
  })
}

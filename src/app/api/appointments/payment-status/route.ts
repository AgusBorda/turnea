import { NextRequest, NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

interface PaymentStatusView {
  status: string
  deposit_status: string | null
}

export async function GET(request: NextRequest) {
  const appointmentId = request.nextUrl.searchParams.get('appointment_id')?.trim() || ''
  const slug = request.nextUrl.searchParams.get('slug')?.trim() || ''

  if (!UUID_PATTERN.test(appointmentId) || !SLUG_PATTERN.test(slug)) {
    return NextResponse.json({ error: 'Solicitud inválida' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: barbershop, error: barbershopError } = await supabase
    .from('barbershops')
    .select('id')
    .eq('slug', slug)
    .maybeSingle()

  if (barbershopError) {
    return NextResponse.json({ error: 'No se pudo consultar el estado' }, { status: 500 })
  }

  if (!barbershop) {
    return NextResponse.json({ error: 'Reserva no encontrada' }, { status: 404 })
  }

  const { data: appointmentData, error: appointmentError } = await supabase
    .rpc('get_public_appointment_payment_status', {
      p_appointment_id: appointmentId,
      p_barbershop_id: barbershop.id,
    })
    .maybeSingle()
  const appointment = appointmentData as PaymentStatusView | null

  if (appointmentError) {
    return NextResponse.json({ error: 'No se pudo consultar el estado' }, { status: 500 })
  }

  if (!appointment) {
    return NextResponse.json({ error: 'Reserva no encontrada' }, { status: 404 })
  }

  return NextResponse.json({
    status: appointment.status,
    deposit_status: appointment.deposit_status,
  })
}

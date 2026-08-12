import { NextRequest, NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d(?::00)?$/

interface CheckoutRequest {
  barbershop_id?: unknown
  barber_id?: unknown
  service_id?: unknown
  date?: unknown
  start_time?: unknown
  client_name?: unknown
  client_phone?: unknown
}

function getAppUrl(req: NextRequest): string {
  if (process.env.NEXT_PUBLIC_APP_URL && !process.env.NEXT_PUBLIC_APP_URL.includes('localhost')) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')
  }

  const origin = req.headers.get('origin') || req.headers.get('x-forwarded-host')
  if (origin) {
    const proto = req.headers.get('x-forwarded-proto') || 'https'
    return origin.startsWith('http') ? origin.replace(/\/$/, '') : `${proto}://${origin}`.replace(/\/$/, '')
  }

  return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
}

function isValidDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false

  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export async function POST(req: NextRequest) {
  let body: CheckoutRequest

  try {
    body = await req.json() as CheckoutRequest
  } catch {
    return NextResponse.json({ error: 'Solicitud inválida' }, { status: 400 })
  }

  const barbershopId = typeof body.barbershop_id === 'string' ? body.barbershop_id.trim() : ''
  const barberId = typeof body.barber_id === 'string' ? body.barber_id.trim() : ''
  const serviceId = typeof body.service_id === 'string' ? body.service_id.trim() : ''
  const date = typeof body.date === 'string' ? body.date.trim() : ''
  const startTime = typeof body.start_time === 'string' ? body.start_time.trim() : ''
  const clientName = typeof body.client_name === 'string' ? body.client_name.trim() : ''
  const clientPhone = typeof body.client_phone === 'string' ? body.client_phone.trim() : ''

  if (
    !UUID_PATTERN.test(barbershopId) ||
    !UUID_PATTERN.test(barberId) ||
    !UUID_PATTERN.test(serviceId) ||
    !isValidDate(date) ||
    !TIME_PATTERN.test(startTime) ||
    !clientName ||
    !clientPhone ||
    clientName.length > 120 ||
    clientPhone.length > 40
  ) {
    return NextResponse.json({ error: 'Datos de reserva inválidos' }, { status: 400 })
  }

  const supabase = await createClient()

  const { data: barbershop, error: barbershopError } = await supabase
    .from('barbershops')
    .select('id, slug, name, currency, deposit_required, deposit_percentage, mp_configured, active')
    .eq('id', barbershopId)
    .eq('active', true)
    .maybeSingle()

  if (barbershopError) {
    return NextResponse.json({ error: 'No se pudo validar la barbería' }, { status: 500 })
  }

  if (!barbershop) {
    return NextResponse.json({ error: 'Barbería no encontrada o inactiva' }, { status: 404 })
  }

  if (!barbershop.deposit_required || !barbershop.mp_configured) {
    return NextResponse.json({ error: 'Mercado Pago no está habilitado para esta barbería' }, { status: 400 })
  }

  const { data: service, error: serviceError } = await supabase
    .from('services')
    .select('id, name, price, duration, active')
    .eq('id', serviceId)
    .eq('barbershop_id', barbershopId)
    .eq('active', true)
    .maybeSingle()

  if (serviceError) {
    return NextResponse.json({ error: 'No se pudo validar el servicio' }, { status: 500 })
  }

  if (!service) {
    return NextResponse.json({ error: 'Servicio no encontrado, inactivo o inválido' }, { status: 404 })
  }

  const { data: barber, error: barberError } = await supabase
    .from('barbers')
    .select('id, active')
    .eq('id', barberId)
    .eq('barbershop_id', barbershopId)
    .eq('active', true)
    .maybeSingle()

  if (barberError) {
    return NextResponse.json({ error: 'No se pudo validar el barbero' }, { status: 500 })
  }

  if (!barber) {
    return NextResponse.json({ error: 'Barbero no encontrado, inactivo o inválido' }, { status: 404 })
  }

  const servicePrice = Number(service.price)
  const depositPercentage = Number(barbershop.deposit_percentage)
  const currency = typeof barbershop.currency === 'string' ? barbershop.currency.trim().toUpperCase() : ''

  if (
    !Number.isFinite(servicePrice) ||
    servicePrice <= 0 ||
    !Number.isInteger(service.duration) ||
    service.duration <= 0 ||
    !Number.isFinite(depositPercentage) ||
    depositPercentage <= 0 ||
    depositPercentage > 100 ||
    !/^[A-Z]{3}$/.test(currency)
  ) {
    return NextResponse.json({ error: 'La configuración de pago es inválida' }, { status: 400 })
  }

  const [hours, minutes] = startTime.slice(0, 5).split(':').map(Number)
  const startMinutes = hours * 60 + minutes
  const endMinutes = startMinutes + service.duration

  if (endMinutes >= 24 * 60) {
    return NextResponse.json({ error: 'El horario del turno es inválido' }, { status: 400 })
  }

  const normalizedStartTime = `${startTime.slice(0, 5)}:00`
  const endHours = Math.floor(endMinutes / 60)
  const endMins = endMinutes % 60
  const endTime = `${String(endHours).padStart(2, '0')}:${String(endMins).padStart(2, '0')}:00`
  const depositAmount = Math.round(servicePrice * depositPercentage) / 100

  if (!Number.isFinite(depositAmount) || depositAmount <= 0) {
    return NextResponse.json({ error: 'Monto de seña inválido' }, { status: 400 })
  }

  let admin: ReturnType<typeof createAdminClient>

  try {
    admin = createAdminClient()
  } catch {
    return NextResponse.json({ error: 'El servicio de pagos no está disponible' }, { status: 500 })
  }

  const { data: credential, error: credentialError } = await admin
    .from('barbershop_payment_credentials')
    .select('mp_access_token')
    .eq('barbershop_id', barbershopId)
    .maybeSingle()

  if (credentialError) {
    return NextResponse.json({ error: 'No se pudo validar la configuración de Mercado Pago' }, { status: 500 })
  }

  if (!credential?.mp_access_token?.trim()) {
    return NextResponse.json({ error: 'Mercado Pago figura configurado pero no tiene una credencial disponible' }, { status: 503 })
  }

  const { data: appointment, error: appointmentError } = await admin
    .from('appointments')
    .insert({
      barbershop_id: barbershopId,
      barber_id: barberId,
      service_id: serviceId,
      date,
      start_time: normalizedStartTime,
      end_time: endTime,
      status: 'pending_payment',
      deposit_amount: depositAmount,
      deposit_status: 'pending',
      client_name: clientName,
      client_phone: clientPhone,
    })
    .select('id')
    .single()

  if (appointmentError || !appointment) {
    return NextResponse.json({ error: 'Error al crear turno' }, { status: 500 })
  }

  const appointmentId = appointment.id

  async function deletePendingAppointment(): Promise<boolean> {
    const { data, error } = await admin
      .from('appointments')
      .delete()
      .eq('id', appointmentId)
      .eq('status', 'pending_payment')
      .select('id')
      .maybeSingle()

    return !error && Boolean(data)
  }

  const appUrl = getAppUrl(req)
  const isLocalhost = appUrl.includes('localhost') || appUrl.includes('127.0.0.1')
  const preferenceBody: Record<string, unknown> = {
    items: [
      {
        title: `Seña - ${service.name} en ${barbershop.name}`,
        quantity: 1,
        currency_id: currency,
        unit_price: depositAmount,
      },
    ],
    back_urls: {
      success: `${appUrl}/${barbershop.slug}/success`,
      failure: `${appUrl}/${barbershop.slug}/cancel`,
      pending: `${appUrl}/${barbershop.slug}/success`,
    },
    ...(!isLocalhost && { auto_return: 'approved' }),
    external_reference: appointmentId,
  }

  let mercadoPagoResponse: Response

  try {
    mercadoPagoResponse = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${credential.mp_access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(preferenceBody),
    })
  } catch {
    const cleanedUp = await deletePendingAppointment()
    return NextResponse.json(
      { error: cleanedUp ? 'No se pudo conectar con Mercado Pago' : 'No se pudo conectar con Mercado Pago ni revertir el turno pendiente' },
      { status: cleanedUp ? 502 : 500 }
    )
  }

  if (!mercadoPagoResponse.ok) {
    const cleanedUp = await deletePendingAppointment()
    return NextResponse.json(
      { error: cleanedUp ? 'Mercado Pago rechazó la creación del checkout' : 'Mercado Pago rechazó el checkout y no se pudo revertir el turno pendiente' },
      { status: cleanedUp ? 502 : 500 }
    )
  }

  const preference: unknown = await mercadoPagoResponse.json().catch(() => null)
  const preferenceId = isRecord(preference) && typeof preference.id === 'string' ? preference.id : ''
  const initPoint = isRecord(preference) && typeof preference.init_point === 'string' ? preference.init_point : ''

  if (!preferenceId || !initPoint) {
    const cleanedUp = await deletePendingAppointment()
    return NextResponse.json(
      { error: cleanedUp ? 'Mercado Pago devolvió una respuesta inválida' : 'Mercado Pago devolvió una respuesta inválida y no se pudo revertir el turno pendiente' },
      { status: cleanedUp ? 502 : 500 }
    )
  }

  const { data: updatedAppointment, error: preferenceUpdateError } = await admin
    .from('appointments')
    .update({ mp_preference_id: preferenceId })
    .eq('id', appointmentId)
    .eq('status', 'pending_payment')
    .select('id')
    .maybeSingle()

  if (preferenceUpdateError || !updatedAppointment) {
    const cleanedUp = await deletePendingAppointment()
    return NextResponse.json(
      { error: cleanedUp ? 'No se pudo finalizar la creación del checkout' : 'No se pudo guardar el checkout ni revertir el turno pendiente' },
      { status: 500 }
    )
  }

  return NextResponse.json({ init_point: initPoint })
}

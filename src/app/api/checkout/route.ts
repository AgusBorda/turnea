import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      barbershop_id,
      barber_id,
      service_id,
      date,
      start_time,
      client_name,
      client_phone,
    } = body

    if (!barbershop_id || !barber_id || !service_id || !date || !start_time || !client_name) {
      return NextResponse.json({ error: 'Faltan datos requeridos' }, { status: 400 })
    }

    const supabase = await createClient()

    // Fetch barbershop (server-side only, no client exposure)
    const { data: barbershop, error: bsError } = await supabase
      .from('barbershops')
      .select('id, slug, name, deposit_required, deposit_percentage, mp_access_token')
      .eq('id', barbershop_id)
      .single()

    if (bsError || !barbershop) {
      return NextResponse.json({ error: 'Barbería no encontrada' }, { status: 404 })
    }

    if (!barbershop.mp_access_token) {
      return NextResponse.json({ error: 'Mercado Pago no configurado' }, { status: 400 })
    }

    // Fetch service
    const { data: service, error: svcError } = await supabase
      .from('services')
      .select('id, name, price, duration')
      .eq('id', service_id)
      .single()

    if (svcError || !service) {
      return NextResponse.json({ error: 'Servicio no encontrado' }, { status: 404 })
    }

    // Calculate end time
    const [hours, minutes] = start_time.split(':').map(Number)
    const startMinutes = hours * 60 + minutes
    const endMinutes = startMinutes + service.duration
    const endHours = Math.floor(endMinutes / 60)
    const endMins = endMinutes % 60
    const end_time = `${String(endHours).padStart(2, '0')}:${String(endMins).padStart(2, '0')}:00`

    // Calculate deposit amount — MP requires a positive float
    const depositAmount = Math.round(
      (Number(service.price) * barbershop.deposit_percentage) / 100
    )
    const depositAmountFloat = parseFloat(depositAmount.toFixed(2))

    if (depositAmount <= 0) {
      return NextResponse.json({ error: 'Monto de seña inválido' }, { status: 400 })
    }


    // Create appointment in pending_payment status
    const { data: appointment, error: aptError } = await supabase
      .from('appointments')
      .insert({
        barbershop_id,
        barber_id,
        service_id,
        date,
        start_time: start_time.includes(':') && start_time.split(':').length === 2
          ? `${start_time}:00`
          : start_time,
        end_time,
        status: 'pending_payment',
        deposit_amount: depositAmountFloat,
        deposit_status: 'pending',
        client_name: client_name.trim(),
        client_phone: client_phone?.trim() || null,
      })
      .select('id')
      .single()

    if (aptError || !appointment) {
      return NextResponse.json({ error: 'Error al crear turno' }, { status: 500 })
    }

    // Create Mercado Pago preference
    const isLocalhost = APP_URL.includes('localhost') || APP_URL.includes('127.0.0.1')

    const preferenceBody: Record<string, unknown> = {
      items: [
        {
          title: `Seña - ${service.name} en ${barbershop.name}`,
          quantity: 1,
          currency_id: 'ARS',
          unit_price: depositAmountFloat,
        },
      ],
      payer: {
        name: client_name.trim(),
        ...(client_phone ? { phone: { number: client_phone.trim() } } : {}),
      },
      back_urls: {
        success: `${APP_URL}/${barbershop.slug}/success`,
        failure: `${APP_URL}/${barbershop.slug}/cancel`,
        pending: `${APP_URL}/${barbershop.slug}/success`,
      },
      // auto_return requires HTTPS back_urls — only set in production
      ...(!isLocalhost && { auto_return: 'approved' }),
      // notification_url also requires HTTPS
      ...(!isLocalhost && { notification_url: `${APP_URL}/api/webhooks/mp` }),
      external_reference: appointment.id,
      statement_descriptor: 'TURNEA',
    }

    const mpRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${barbershop.mp_access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(preferenceBody),
    })

    if (!mpRes.ok) {
      const mpErr = await mpRes.json().catch(() => ({}))
      // Clean up appointment if MP failed
      await supabase.from('appointments').delete().eq('id', appointment.id)
      return NextResponse.json(
        { error: 'Error al conectar con Mercado Pago', detail: mpErr },
        { status: 502 }
      )
    }

    const preference = await mpRes.json()

    // Store preference_id in appointment
    await supabase
      .from('appointments')
      .update({ mp_preference_id: preference.id })
      .eq('id', appointment.id)

    return NextResponse.json({
      appointment_id: appointment.id,
      init_point: preference.init_point,
      sandbox_init_point: preference.sandbox_init_point,
    })
  } catch (err) {
    console.error('[checkout] error:', err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

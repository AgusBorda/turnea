import { NextRequest, NextResponse } from 'next/server'

import {
  buildPaymentQuote,
  parsePaymentQuoteRequest,
  PaymentQuoteError,
} from '@/lib/payments/payment-quote'
import type { PaymentQuoteRequest } from '@/lib/payments/payment-quote'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ProcessingFeeMode } from '@/lib/types'

export async function POST(req: NextRequest) {
  let request: PaymentQuoteRequest

  try {
    request = parsePaymentQuoteRequest(await req.json())
  } catch {
    return NextResponse.json({ error: 'Solicitud de cotización inválida' }, { status: 400 })
  }

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return NextResponse.json({ error: 'El servicio de cotización no está disponible' }, { status: 500 })
  }

  const [barbershopResult, serviceResult] = await Promise.all([
    admin
      .from('barbershops')
      .select(`
        id,
        active,
        currency,
        deposit_required,
        deposit_percentage,
        mp_configured,
        processing_fee_mode,
        effective_processing_rate
      `)
      .eq('id', request.barbershopId)
      .eq('active', true)
      .maybeSingle(),
    admin
      .from('services')
      .select('id, barbershop_id, active, price')
      .eq('id', request.serviceId)
      .eq('active', true)
      .maybeSingle(),
  ])

  if (barbershopResult.error || serviceResult.error) {
    return NextResponse.json({ error: 'No se pudo calcular el pago' }, { status: 500 })
  }
  if (!barbershopResult.data) {
    return NextResponse.json({ error: 'Barbería no encontrada o inactiva' }, { status: 404 })
  }
  if (!serviceResult.data) {
    return NextResponse.json({ error: 'Servicio no encontrado o inactivo' }, { status: 404 })
  }

  try {
    const quote = buildPaymentQuote({
      request,
      barbershop: {
        id: barbershopResult.data.id,
        active: barbershopResult.data.active === true,
        currency: String(barbershopResult.data.currency ?? ''),
        depositRequired: barbershopResult.data.deposit_required === true,
        depositPercentage: Number(barbershopResult.data.deposit_percentage),
        mpConfigured: barbershopResult.data.mp_configured === true,
        processingFeeMode: barbershopResult.data.processing_fee_mode as ProcessingFeeMode,
        effectiveProcessingRate: String(barbershopResult.data.effective_processing_rate ?? ''),
      },
      service: {
        id: serviceResult.data.id,
        barbershopId: serviceResult.data.barbershop_id,
        active: serviceResult.data.active === true,
        price: String(serviceResult.data.price ?? ''),
      },
    })

    return NextResponse.json(quote, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    if (
      error instanceof PaymentQuoteError
      && ['SERVICE_BARBERSHOP_MISMATCH', 'SERVICE_NOT_AVAILABLE'].includes(error.code)
    ) {
      return NextResponse.json({ error: 'Servicio no encontrado o inactivo' }, { status: 404 })
    }

    return NextResponse.json({ error: 'La configuración de pago es inválida' }, { status: 400 })
  }
}

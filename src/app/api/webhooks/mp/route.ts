import { createHmac, timingSafeEqual } from 'node:crypto'

import { NextRequest, NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const PAYMENT_ID_PATTERN = /^\d+$/
const AMOUNT_TOLERANCE = 0.005

interface WebhookBody {
  type?: unknown
  topic?: unknown
  data?: { id?: unknown } | null
}

interface MercadoPagoPayment {
  id?: unknown
  status?: unknown
  external_reference?: unknown
  transaction_amount?: unknown
  currency_id?: unknown
  order?: { id?: unknown } | null
}

interface MercadoPagoMerchantOrder {
  preference_id?: unknown
}

function okResponse() {
  return NextResponse.json({ ok: true })
}

function asPaymentId(value: unknown): string {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) {
    return String(value)
  }

  if (typeof value === 'string' && PAYMENT_ID_PATTERN.test(value)) {
    return value
  }

  return ''
}

async function readJson(response: Response): Promise<unknown> {
  return response.json().catch(() => null)
}

function isPayment(value: unknown): value is MercadoPagoPayment {
  return typeof value === 'object' && value !== null
}

function isMerchantOrder(value: unknown): value is MercadoPagoMerchantOrder {
  return typeof value === 'object' && value !== null
}

function validateWebhookSignature(req: NextRequest, secret: string): boolean {
  const xSignature = req.headers.get('x-signature')
  let timestamp = ''
  let receivedHash = ''

  for (const part of xSignature?.split(',') || []) {
    const separatorIndex = part.indexOf('=')
    if (separatorIndex === -1) continue

    const key = part.slice(0, separatorIndex).trim()
    const value = part.slice(separatorIndex + 1).trim()

    if (key === 'ts') timestamp = value
    if (key === 'v1') receivedHash = value.toLowerCase()
  }

  const dataId = req.nextUrl.searchParams.get('data.id')?.toLowerCase() || ''
  const requestId = req.headers.get('x-request-id') || ''
  const manifest = [
    dataId ? `id:${dataId};` : '',
    requestId ? `request-id:${requestId};` : '',
    timestamp ? `ts:${timestamp};` : '',
  ].join('')

  if (!/^[0-9a-f]{64}$/.test(receivedHash)) {
    return false
  }

  const expectedHash = createHmac('sha256', secret).update(manifest).digest()
  const receivedHashBuffer = Buffer.from(receivedHash, 'hex')

  return receivedHashBuffer.length === expectedHash.length && timingSafeEqual(receivedHashBuffer, expectedHash)
}

export async function POST(req: NextRequest) {
  let body: WebhookBody

  try {
    body = await req.json() as WebhookBody
  } catch {
    return NextResponse.json({ error: 'Solicitud inválida' }, { status: 400 })
  }

  const bodyType = typeof body.type === 'string' ? body.type : ''
  const queryType = req.nextUrl.searchParams.get('type') || ''
  const bodyTopic = typeof body.topic === 'string' ? body.topic : ''
  const queryTopic = req.nextUrl.searchParams.get('topic') || ''
  const hasModernPaymentDataId = Boolean(
    req.nextUrl.searchParams.get('data.id') || body.data?.id
  )
  const isLegacyMerchantOrderIpn = (
    !bodyType &&
    !queryType &&
    !hasModernPaymentDataId &&
    (bodyTopic === 'merchant_order' || queryTopic === 'merchant_order')
  )

  // Legacy IPN uses topic=merchant_order and id=merchantOrderId. It is
  // acknowledged only to stop retries and is never a source of payment truth.
  // Modern Webhooks use type=payment and data.id=paymentId, and remain signed.
  if (isLegacyMerchantOrderIpn) {
    return okResponse()
  }

  const webhookSecret = process.env.MERCADO_PAGO_WEBHOOK_SECRET?.trim()
  if (!webhookSecret) {
    return NextResponse.json({ error: 'Webhook no configurado' }, { status: 500 })
  }

  if (!validateWebhookSignature(req, webhookSecret)) {
    return NextResponse.json({ error: 'Firma inválida' }, { status: 401 })
  }

  const notificationType = bodyType
    ? bodyType
    : typeof body.topic === 'string'
      ? body.topic
      : queryType || queryTopic

  if (notificationType !== 'payment') {
    return okResponse()
  }

  const queryPaymentId = asPaymentId(req.nextUrl.searchParams.get('data.id'))
  const bodyPaymentId = asPaymentId(body.data?.id)
  const paymentId = queryPaymentId || bodyPaymentId
  const barbershopId = req.nextUrl.searchParams.get('barbershop_id')?.trim() || ''

  if (
    !paymentId ||
    (queryPaymentId && bodyPaymentId && queryPaymentId !== bodyPaymentId) ||
    !UUID_PATTERN.test(barbershopId)
  ) {
    return NextResponse.json({ error: 'Notificación inválida' }, { status: 400 })
  }

  let admin: ReturnType<typeof createAdminClient>

  try {
    admin = createAdminClient()
  } catch {
    return NextResponse.json({ error: 'Servicio no disponible' }, { status: 500 })
  }

  const { data: credential, error: credentialError } = await admin
    .from('barbershop_payment_credentials')
    .select('mp_access_token')
    .eq('barbershop_id', barbershopId)
    .maybeSingle()

  if (credentialError) {
    return NextResponse.json({ error: 'No se pudo validar la configuración' }, { status: 500 })
  }

  const accessToken = credential?.mp_access_token?.trim()
  if (!accessToken) {
    return NextResponse.json({ error: 'Configuración no disponible' }, { status: 503 })
  }

  let paymentResponse: Response

  try {
    paymentResponse = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    })
  } catch {
    return NextResponse.json({ error: 'No se pudo consultar el pago' }, { status: 502 })
  }

  if (paymentResponse.status === 404) {
    return okResponse()
  }

  if (!paymentResponse.ok) {
    return NextResponse.json({ error: 'No se pudo verificar el pago' }, { status: 502 })
  }

  const payment: unknown = await readJson(paymentResponse)
  if (!isPayment(payment)) {
    return NextResponse.json({ error: 'Respuesta de pago inválida' }, { status: 502 })
  }

  const verifiedPaymentId = asPaymentId(payment.id)
  const externalReference = typeof payment.external_reference === 'string'
    ? payment.external_reference.trim()
    : ''

  if (verifiedPaymentId !== paymentId || !UUID_PATTERN.test(externalReference)) {
    return okResponse()
  }

  const { data: appointment, error: appointmentError } = await admin
    .from('appointments')
    .select('id, barbershop_id, status, deposit_status, deposit_amount, expires_at, mp_preference_id, mp_payment_id')
    .eq('id', externalReference)
    .maybeSingle()

  if (appointmentError) {
    return NextResponse.json({ error: 'No se pudo validar el turno' }, { status: 500 })
  }

  if (!appointment || appointment.barbershop_id !== barbershopId) {
    return okResponse()
  }

  if (
    appointment.status === 'confirmed' &&
    appointment.deposit_status === 'paid' &&
    appointment.mp_payment_id === verifiedPaymentId
  ) {
    return okResponse()
  }

  if (appointment.mp_payment_id && appointment.mp_payment_id !== verifiedPaymentId) {
    return okResponse()
  }

  if (payment.status !== 'approved') {
    return okResponse()
  }

  if (!appointment.expires_at || new Date(appointment.expires_at).getTime() <= Date.now()) {
    return okResponse()
  }

  const { data: barbershop, error: barbershopError } = await admin
    .from('barbershops')
    .select('id, currency')
    .eq('id', barbershopId)
    .maybeSingle()

  if (barbershopError) {
    return NextResponse.json({ error: 'No se pudo validar la barbería' }, { status: 500 })
  }

  if (!barbershop) {
    return okResponse()
  }

  const expectedAmount = Number(appointment.deposit_amount)
  const paidAmount = Number(payment.transaction_amount)
  const expectedCurrency = typeof barbershop.currency === 'string' ? barbershop.currency.trim().toUpperCase() : ''
  const paidCurrency = typeof payment.currency_id === 'string' ? payment.currency_id.trim().toUpperCase() : ''

  if (
    !Number.isFinite(expectedAmount) ||
    !Number.isFinite(paidAmount) ||
    Math.abs(expectedAmount - paidAmount) > AMOUNT_TOLERANCE ||
    !expectedCurrency ||
    paidCurrency !== expectedCurrency
  ) {
    return okResponse()
  }

  const merchantOrderId = asPaymentId(payment.order?.id)
  if (!merchantOrderId || !appointment.mp_preference_id) {
    return okResponse()
  }

  let merchantOrderResponse: Response

  try {
    merchantOrderResponse = await fetch(
      `https://api.mercadopago.com/merchant_orders/${encodeURIComponent(merchantOrderId)}`,
      { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' }
    )
  } catch {
    return NextResponse.json({ error: 'No se pudo validar la preference' }, { status: 502 })
  }

  if (!merchantOrderResponse.ok) {
    return NextResponse.json({ error: 'No se pudo validar la preference' }, { status: 502 })
  }

  const merchantOrder: unknown = await readJson(merchantOrderResponse)
  const preferenceId = isMerchantOrder(merchantOrder) && typeof merchantOrder.preference_id === 'string'
    ? merchantOrder.preference_id
    : ''

  if (!preferenceId || preferenceId !== appointment.mp_preference_id) {
    return okResponse()
  }

  const { data: confirmedAppointment, error: updateError } = await admin.rpc(
    'confirm_paid_appointment_atomic',
    {
      p_appointment_id: appointment.id,
      p_barbershop_id: barbershopId,
      p_payment_id: verifiedPaymentId,
    }
  )

  if (updateError) {
    return NextResponse.json({ error: 'No se pudo confirmar el turno' }, { status: 500 })
  }

  if (!confirmedAppointment) {
    const { data: currentAppointment, error: currentAppointmentError } = await admin
      .from('appointments')
      .select('status, deposit_status, expires_at, mp_payment_id')
      .eq('id', appointment.id)
      .maybeSingle()

    if (currentAppointmentError) {
      return NextResponse.json({ error: 'No se pudo verificar la confirmación' }, { status: 500 })
    }

    if (
      currentAppointment?.status === 'pending_payment' &&
      currentAppointment.deposit_status === 'pending' &&
      currentAppointment.expires_at &&
      new Date(currentAppointment.expires_at).getTime() <= Date.now()
    ) {
      return okResponse()
    }

    if (
      currentAppointment?.status !== 'confirmed' ||
      currentAppointment.deposit_status !== 'paid' ||
      currentAppointment.mp_payment_id !== verifiedPaymentId
    ) {
      return NextResponse.json({ error: 'El turno no pudo confirmarse' }, { status: 409 })
    }
  }

  return okResponse()
}

import { NextRequest, NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'
import {
  moneyAmountAsNumber,
  paymentAmountAndCurrencyMatch,
  validateMercadoPagoWebhookSignature,
} from '@/lib/payments/mp-webhook-validation'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const PAYMENT_ID_PATTERN = /^\d+$/

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

  if (!validateMercadoPagoWebhookSignature({
    xSignature: req.headers.get('x-signature'),
    requestId: req.headers.get('x-request-id'),
    dataId: req.nextUrl.searchParams.get('data.id'),
    secret: webhookSecret,
  })) {
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
    .select('id, barbershop_id, status, deposit_status, deposit_amount, processing_fee_amount, payment_total_amount, payment_currency, expires_at, mp_preference_id, mp_payment_id')
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

  if (!paymentAmountAndCurrencyMatch({
    expectedAmount: appointment.payment_total_amount,
    expectedCurrency: appointment.payment_currency,
    paidAmount: payment.transaction_amount,
    paidCurrency: payment.currency_id,
  })) {
    return okResponse()
  }

  const paidAmount = moneyAmountAsNumber(payment.transaction_amount)
  const expectedCurrency = typeof appointment.payment_currency === 'string'
    ? appointment.payment_currency.trim().toUpperCase()
    : ''
  if (paidAmount === null) return okResponse()

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

  const reconciliationAppointmentId = appointment.id
  const reconciliationPreferenceId = appointment.mp_preference_id

  async function registerReconciliation(
    reason: 'appointment_expired' | 'confirmation_conflict'
  ): Promise<boolean> {
    const { data: reconciliationId, error: reconciliationError } = await admin.rpc(
      'register_payment_reconciliation',
      {
        p_barbershop_id: barbershopId,
        p_appointment_id: reconciliationAppointmentId,
        p_mp_payment_id: verifiedPaymentId,
        p_mp_preference_id: reconciliationPreferenceId,
        p_amount: paidAmount,
        p_currency: expectedCurrency,
        p_mp_payment_status: 'approved',
        p_reason: reason,
      }
    )

    return !reconciliationError && typeof reconciliationId === 'string' && UUID_PATTERN.test(reconciliationId)
  }

  const { data: confirmationResult, error: confirmationError } = await admin.rpc(
    'confirm_paid_appointment_atomic_v2',
    {
      p_appointment_id: appointment.id,
      p_barbershop_id: barbershopId,
      p_payment_id: verifiedPaymentId,
    }
  )

  if (confirmationError) {
    return NextResponse.json({ error: 'No se pudo confirmar el turno' }, { status: 500 })
  }

  if (confirmationResult === 'confirmed' || confirmationResult === 'already_confirmed') {
    return okResponse()
  }

  const reconciliationReason = confirmationResult === 'appointment_expired'
    ? 'appointment_expired'
    : confirmationResult === 'slot_conflict'
      ? 'confirmation_conflict'
      : null

  if (reconciliationReason) {
    const reconciliationRegistered = await registerReconciliation(reconciliationReason)

    if (!reconciliationRegistered) {
      return NextResponse.json({ error: 'No se pudo registrar la conciliación' }, { status: 500 })
    }

    return okResponse()
  }

  if (
    confirmationResult === 'invalid_state' ||
    confirmationResult === 'payment_conflict' ||
    confirmationResult === 'not_found'
  ) {
    return NextResponse.json({ error: 'El turno no pudo confirmarse' }, { status: 409 })
  }

  return NextResponse.json({ error: 'Respuesta de confirmación inválida' }, { status: 500 })
}

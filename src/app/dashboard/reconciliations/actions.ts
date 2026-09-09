'use server'

import { revalidatePath } from 'next/cache'

import {
  createMercadoPagoFullRefund,
  getMercadoPagoMerchantOrder,
  getMercadoPagoPayment,
  getMercadoPagoRefunds,
  type MercadoPagoRefund,
} from '@/lib/mercado-pago/refunds'
import { getValidMercadoPagoAccessToken } from '@/lib/mercado-pago/credentials'
import { getRefundErrorMessage, isRefundErrorRetryable } from '@/lib/reconciliations'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export interface ResolveReconciliationState {
  success: boolean
  message: string
}

export interface RefundReconciliationState {
  success: boolean
  message: string
}

interface RefundClaim {
  result: 'claimed' | 'already_processing' | 'failed_existing' | 'already_refunded'
  reconciliation_id: string
  barbershop_id: string
  appointment_id: string
  mp_payment_id: string
  mp_preference_id: string | null
  amount: number
  currency: string
  refund_idempotency_key: string
  status: string
  last_error_code: string | null
}

type RefundErrorCode =
  | 'payment_not_refundable'
  | 'payment_too_old'
  | 'insufficient_balance'
  | 'credential_error'
  | 'financial_mismatch'
  | 'partial_refund_detected'
  | 'temporary_error'
  | 'unknown_error'

const AMOUNT_TOLERANCE = 0.005

function asNumericId(value: unknown): string {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return String(value)
  if (typeof value === 'string' && /^\d+$/.test(value)) return value
  return ''
}

function asExternalId(value: unknown): string {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return String(value)
  if (typeof value === 'string' && value.trim() && value.trim().length <= 255) return value.trim()
  return ''
}

function amountsMatch(left: unknown, right: unknown): boolean {
  const leftAmount = Number(left)
  const rightAmount = Number(right)
  return Number.isFinite(leftAmount)
    && Number.isFinite(rightAmount)
    && Math.abs(leftAmount - rightAmount) <= AMOUNT_TOLERANCE
}

function classifyMercadoPagoRefundError(status: number | null, code: string | null): RefundErrorCode | null {
  if (status === 401 || status === 403) return 'credential_error'
  if (status === 429 || (status !== null && status >= 500)) return null
  if (status === 404) return 'payment_not_refundable'
  if (code === '2024' || code === '15016') return 'payment_too_old'
  if (code === '2063' || code === '4293' || code === '4294' || code === '4295') {
    return 'payment_not_refundable'
  }
  if (code === 'insufficient_balance') return 'insufficient_balance'
  if (status !== null && status >= 400 && status < 500) return 'unknown_error'
  return null
}

async function getRefundClaim(
  reconciliationId: string
): Promise<{
  supabase: Awaited<ReturnType<typeof createClient>>
  claim: RefundClaim | null
  response: RefundReconciliationState | null
}> {
  if (!UUID_PATTERN.test(reconciliationId)) {
    return {
      supabase: await createClient(),
      claim: null,
      response: { success: false, message: 'La conciliación no es válida.' },
    }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return {
      supabase,
      claim: null,
      response: { success: false, message: 'Tu sesión venció. Volvé a iniciar sesión.' },
    }
  }

  const { data, error } = await supabase.rpc('claim_payment_reconciliation_refund', {
    p_reconciliation_id: reconciliationId,
  })

  if (error) {
    const inaccessible = error.message.includes('RECONCILIATION_NOT_FOUND_OR_NOT_OWNED')
    return {
      supabase,
      claim: null,
      response: {
        success: false,
        message: inaccessible
          ? 'No se encontró una conciliación accesible.'
          : 'Esta conciliación no admite un reembolso.',
      },
    }
  }

  const claim = Array.isArray(data) ? data[0] as RefundClaim | undefined : undefined
  if (!claim || !UUID_PATTERN.test(claim.refund_idempotency_key || '')) {
    return {
      supabase,
      claim: null,
      response: { success: false, message: 'No se pudo preparar el reembolso.' },
    }
  }

  return { supabase, claim, response: null }
}

async function processRefundClaim(
  supabase: Awaited<ReturnType<typeof createClient>>,
  claim: RefundClaim,
  allowNewRefund: boolean
): Promise<RefundReconciliationState> {
  let processingEstablished = claim.status !== 'refund_failed'
  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return { success: false, message: 'El servicio de pagos no está disponible.' }
  }

  async function markVerificationRequired(): Promise<RefundReconciliationState> {
    if (!processingEstablished) {
      return {
        success: false,
        message: 'No se pudo verificar el estado actual. El intento anterior permanece registrado sin emitir un nuevo reembolso.',
      }
    }
    const { error } = await admin.rpc('mark_payment_reconciliation_refund_verification_required', {
      p_reconciliation_id: claim.reconciliation_id,
      p_idempotency_key: claim.refund_idempotency_key,
    })
    if (error) {
      return {
        success: false,
        message: 'No se pudo guardar el estado pendiente de verificación.',
      }
    }
    return {
      success: false,
      message: 'El resultado del reembolso está pendiente de verificación. No se enviará una nueva solicitud con otra clave.',
    }
  }

  async function failRefund(code: RefundErrorCode): Promise<RefundReconciliationState> {
    const { error } = await admin.rpc('fail_payment_reconciliation_refund', {
      p_reconciliation_id: claim.reconciliation_id,
      p_idempotency_key: claim.refund_idempotency_key,
      p_error_code: code,
    })
    return {
      success: false,
      message: error ? 'No se pudo guardar el resultado del reembolso.' : getRefundErrorMessage(code),
    }
  }

  async function ensureProcessing(): Promise<boolean> {
    if (claim.status !== 'refund_failed') return true
    const { data, error } = await supabase.rpc('retry_payment_reconciliation_refund', {
      p_reconciliation_id: claim.reconciliation_id,
    })
    const ready = !error && (data === 'retried' || data === 'already_processing')
    if (ready) processingEstablished = true
    return ready
  }

  async function completeRefund(refund: MercadoPagoRefund): Promise<RefundReconciliationState> {
    const refundId = asExternalId(refund.id)
    if (
      !refundId
      || asNumericId(refund.payment_id) !== claim.mp_payment_id
      || !amountsMatch(refund.amount, claim.amount)
      || refund.status !== 'approved'
    ) {
      return markVerificationRequired()
    }

    if (!await ensureProcessing()) {
      return { success: false, message: 'No se pudo preparar la confirmación local del reembolso.' }
    }

    const { data, error } = await admin.rpc('complete_payment_reconciliation_refund', {
      p_reconciliation_id: claim.reconciliation_id,
      p_refund_id: refundId,
      p_refund_amount: claim.amount,
      p_idempotency_key: claim.refund_idempotency_key,
    })

    if (error || (data !== 'refunded' && data !== 'already_refunded')) {
      return { success: false, message: 'Mercado Pago confirmó la devolución, pero Turnea aún debe verificar su registro local.' }
    }

    return { success: true, message: 'Mercado Pago confirmó el reembolso total.' }
  }

  const [credentialResult, appointmentResult] = await Promise.all([
    getValidMercadoPagoAccessToken(claim.barbershop_id)
      .then(accessToken => ({ accessToken, error: false }))
      .catch(() => ({ accessToken: null, error: true })),
    admin
      .from('appointments')
      .select('id, barbershop_id, deposit_amount, mp_preference_id')
      .eq('id', claim.appointment_id)
      .eq('barbershop_id', claim.barbershop_id)
      .maybeSingle(),
  ])

  const accessToken = credentialResult.accessToken
  if (credentialResult.error || !accessToken) {
    return failRefund('credential_error')
  }

  const appointment = appointmentResult.data
  if (
    appointmentResult.error
    || !appointment
    || !amountsMatch(appointment.deposit_amount, claim.amount)
    || appointment.mp_preference_id !== claim.mp_preference_id
  ) {
    return failRefund('financial_mismatch')
  }

  const paymentResult = await getMercadoPagoPayment(accessToken, claim.mp_payment_id)
  if (!paymentResult.responseReceived || paymentResult.status === null || paymentResult.status >= 500) {
    return markVerificationRequired()
  }
  if (!paymentResult.ok || !paymentResult.data) {
    const errorCode = classifyMercadoPagoRefundError(paymentResult.status, paymentResult.errorCode)
    return errorCode ? failRefund(errorCode) : markVerificationRequired()
  }

  const payment = paymentResult.data
  const paymentStatus = typeof payment.status === 'string' ? payment.status : ''
  const externalReference = typeof payment.external_reference === 'string'
    ? payment.external_reference.trim()
    : ''
  const paidCurrency = typeof payment.currency_id === 'string'
    ? payment.currency_id.trim().toUpperCase()
    : ''

  if (
    asNumericId(payment.id) !== claim.mp_payment_id
    || externalReference !== claim.appointment_id
    || !amountsMatch(payment.transaction_amount, claim.amount)
    || paidCurrency !== claim.currency
    || (paymentStatus !== 'approved' && paymentStatus !== 'refunded')
  ) {
    return failRefund('financial_mismatch')
  }

  const merchantOrderId = asNumericId(payment.order?.id)
  if (!merchantOrderId) {
    return failRefund('financial_mismatch')
  }
  if (!claim.mp_preference_id) {
    return failRefund('financial_mismatch')
  }

  const merchantOrderResult = await getMercadoPagoMerchantOrder(accessToken, merchantOrderId)
  if (!merchantOrderResult.responseReceived || merchantOrderResult.status === null || merchantOrderResult.status >= 500) {
    return markVerificationRequired()
  }
  if (!merchantOrderResult.ok || !merchantOrderResult.data) {
    const errorCode = classifyMercadoPagoRefundError(
      merchantOrderResult.status,
      merchantOrderResult.errorCode
    )
    return errorCode ? failRefund(errorCode) : markVerificationRequired()
  }
  if (merchantOrderResult.data.preference_id !== claim.mp_preference_id) {
    return failRefund('financial_mismatch')
  }

  const refundsResult = await getMercadoPagoRefunds(accessToken, claim.mp_payment_id)
  if (!refundsResult.responseReceived || refundsResult.status === null || refundsResult.status >= 500) {
    return markVerificationRequired()
  }
  if (!refundsResult.ok || !refundsResult.data) {
    const errorCode = classifyMercadoPagoRefundError(refundsResult.status, refundsResult.errorCode)
    return errorCode ? failRefund(errorCode) : markVerificationRequired()
  }

  const approvedRefunds = refundsResult.data.filter(refund => refund.status === 'approved')
  const existingFullRefund = approvedRefunds.find(refund =>
    asNumericId(refund.payment_id) === claim.mp_payment_id
    && amountsMatch(refund.amount, claim.amount)
  )
  if (existingFullRefund) return completeRefund(existingFullRefund)
  if (approvedRefunds.length > 0) {
    return failRefund('partial_refund_detected')
  }
  if (paymentStatus === 'refunded') {
    return markVerificationRequired()
  }

  if (!allowNewRefund) {
    return markVerificationRequired()
  }

  if (!await ensureProcessing()) {
    return { success: false, message: 'No se pudo preparar el reintento seguro.' }
  }

  const refundResult = await createMercadoPagoFullRefund(
    accessToken,
    claim.mp_payment_id,
    claim.refund_idempotency_key
  )

  if (!refundResult.responseReceived || refundResult.status === null || refundResult.status >= 500) {
    return markVerificationRequired()
  }
  if (!refundResult.ok || !refundResult.data) {
    if (refundResult.errorCode === '4296') {
      return markVerificationRequired()
    }
    const errorCode = classifyMercadoPagoRefundError(refundResult.status, refundResult.errorCode)
    return errorCode ? failRefund(errorCode) : markVerificationRequired()
  }

  return completeRefund(refundResult.data)
}

function revalidateReconciliation(reconciliationId: string) {
  revalidatePath('/dashboard', 'layout')
  revalidatePath(`/dashboard/reconciliations/${reconciliationId}`)
}

export async function requestPaymentReconciliationRefund(
  reconciliationId: string,
  _previousState: RefundReconciliationState,
  formData: FormData
): Promise<RefundReconciliationState> {
  void _previousState
  if (formData.get('confirmRefund') !== 'yes') {
    return { success: false, message: 'Confirmá explícitamente que querés solicitar el reembolso total.' }
  }

  const prepared = await getRefundClaim(reconciliationId)
  if (prepared.response || !prepared.claim) return prepared.response!

  if (prepared.claim.result === 'already_refunded') {
    return { success: true, message: 'La conciliación ya figura reembolsada.' }
  }
  if (prepared.claim.result === 'failed_existing') {
    return { success: false, message: 'El intento anterior falló. Usá la acción de reintentar o verificar.' }
  }

  const result = await processRefundClaim(
    prepared.supabase,
    prepared.claim,
    prepared.claim.result === 'claimed'
  )
  revalidateReconciliation(reconciliationId)
  return result
}

export async function verifyOrRetryPaymentReconciliationRefund(
  reconciliationId: string,
  _previousState: RefundReconciliationState
): Promise<RefundReconciliationState> {
  void _previousState
  const prepared = await getRefundClaim(reconciliationId)
  if (prepared.response || !prepared.claim) return prepared.response!

  if (prepared.claim.result === 'already_refunded') {
    return { success: true, message: 'La conciliación ya figura reembolsada.' }
  }

  const retryable = prepared.claim.result === 'failed_existing'
    && isRefundErrorRetryable(prepared.claim.last_error_code)
  const result = await processRefundClaim(prepared.supabase, prepared.claim, retryable)
  revalidateReconciliation(reconciliationId)
  return result
}

export async function resolveReconciliationRetained(
  reconciliationId: string,
  _previousState: ResolveReconciliationState,
  formData: FormData
): Promise<ResolveReconciliationState> {
  const notesValue = formData.get('resolutionNotes')
  const resolutionNotes = typeof notesValue === 'string' ? notesValue.trim() : ''

  if (!UUID_PATTERN.test(reconciliationId)) {
    return { success: false, message: 'La conciliación no es válida.' }
  }

  if (!resolutionNotes || resolutionNotes.length > 2000) {
    return {
      success: false,
      message: 'Ingresá una nota de resolución de hasta 2000 caracteres.',
    }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, message: 'Tu sesión venció. Volvé a iniciar sesión.' }
  }

  const { data: result, error } = await supabase.rpc(
    'resolve_payment_reconciliation_retained',
    {
      p_reconciliation_id: reconciliationId,
      p_resolution_notes: resolutionNotes,
    }
  )

  if (error) {
    if (error.message.includes('INVALID_RECONCILIATION_TRANSITION')) {
      return { success: false, message: 'Esta conciliación ya no admite esa acción.' }
    }
    if (error.message.includes('RECONCILIATION_NOT_FOUND_OR_NOT_OWNED')) {
      return { success: false, message: 'No se encontró una conciliación accesible.' }
    }
    if (error.message.includes('INVALID_RESOLUTION_DATA')) {
      return { success: false, message: 'La nota de resolución no es válida.' }
    }
    return { success: false, message: 'No se pudo resolver la conciliación.' }
  }

  if (result !== 'resolved' && result !== 'already_resolved') {
    return { success: false, message: 'La conciliación devolvió un estado inesperado.' }
  }

  revalidatePath('/dashboard', 'layout')
  revalidatePath(`/dashboard/reconciliations/${reconciliationId}`)

  return {
    success: true,
    message: result === 'already_resolved'
      ? 'La conciliación ya estaba resuelta.'
      : 'Conciliación marcada como resuelta.',
  }
}

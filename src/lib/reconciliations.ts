export const RECONCILIATION_REASON_LABELS: Record<string, string> = {
  appointment_expired: 'Pago recibido después de vencer el turno',
  confirmation_conflict: 'Pago recibido pero el horario ya no estaba disponible',
}

export const RECONCILIATION_STATUS_LABELS: Record<string, string> = {
  pending_review: 'Pendiente de revisión',
  refund_processing: 'Reembolso en proceso',
  refunded: 'Reembolsado',
  resolved_retained: 'Resuelto — pago conservado',
  refund_failed: 'Error al reembolsar',
}

const APPOINTMENT_STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  pending_payment: 'Esperando pago',
  confirmed: 'Confirmado',
  completed: 'Completado',
  cancelled: 'Cancelado',
  no_show: 'No asistió',
}

const DEPOSIT_STATUS_LABELS: Record<string, string> = {
  none: 'Sin seña',
  pending: 'Seña pendiente',
  paid: 'Seña pagada',
  refunded: 'Seña reembolsada',
}

const REFUND_ERROR_MESSAGES: Record<string, string> = {
  payment_not_refundable: 'Mercado Pago indicó que este pago no puede reembolsarse.',
  payment_too_old: 'El pago está fuera del plazo permitido para reembolsos.',
  insufficient_balance: 'La cuenta no tiene saldo suficiente para realizar el reembolso.',
  credential_error: 'La configuración de Mercado Pago debe revisarse.',
  financial_mismatch: 'Los datos del pago no coinciden con la conciliación.',
  partial_refund_detected: 'El pago tiene un reembolso parcial y requiere revisión manual.',
  verification_required: 'El resultado del reembolso está pendiente de verificación.',
  temporary_error: 'Mercado Pago informó un error temporal.',
  unknown_error: 'Mercado Pago rechazó el reembolso y el caso requiere revisión.',
}

const RETRYABLE_REFUND_ERROR_CODES = new Set([
  'insufficient_balance',
  'temporary_error',
  'credential_error',
])

export function getReconciliationReasonLabel(reason: string): string {
  return RECONCILIATION_REASON_LABELS[reason] || 'Pago que requiere revisión'
}

export function getReconciliationStatusLabel(status: string): string {
  return RECONCILIATION_STATUS_LABELS[status] || 'Estado desconocido'
}

export function getAppointmentStatusLabel(status: string): string {
  return APPOINTMENT_STATUS_LABELS[status] || 'Estado desconocido'
}

export function getDepositStatusLabel(status: string): string {
  return DEPOSIT_STATUS_LABELS[status] || 'Estado desconocido'
}

export function getRefundErrorMessage(code: string | null): string {
  return code
    ? REFUND_ERROR_MESSAGES[code] || 'No se pudo completar el reembolso.'
    : 'No se pudo completar el reembolso.'
}

export function isRefundErrorRetryable(code: string | null): boolean {
  return Boolean(code && RETRYABLE_REFUND_ERROR_CODES.has(code))
}

export function getReconciliationStatusClass(status: string): string {
  if (status === 'pending_review') return 'bg-amber-50 text-amber-700'
  if (status === 'refund_failed') return 'bg-red-50 text-red-700'
  if (status === 'refunded') return 'bg-green-50 text-green-700'
  if (status === 'resolved_retained') return 'bg-blue-50 text-blue-700'
  return 'bg-gray-50 text-gray-700'
}

export function formatReconciliationAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function maskPaymentId(paymentId: string): string {
  return paymentId.length <= 6 ? paymentId : `••••${paymentId.slice(-6)}`
}

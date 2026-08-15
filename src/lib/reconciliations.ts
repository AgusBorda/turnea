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

export function getReconciliationReasonLabel(reason: string): string {
  return RECONCILIATION_REASON_LABELS[reason] || 'Pago que requiere revisión'
}

export function getReconciliationStatusLabel(status: string): string {
  return RECONCILIATION_STATUS_LABELS[status] || 'Estado desconocido'
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

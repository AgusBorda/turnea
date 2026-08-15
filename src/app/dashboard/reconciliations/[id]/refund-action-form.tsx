'use client'

import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import {
  diagnosePaymentReconciliationIdentity,
  requestPaymentReconciliationRefund,
  verifyOrRetryPaymentReconciliationRefund,
  type RefundIdentityDiagnosticState,
  type RefundReconciliationState,
} from '../actions'

const INITIAL_STATE: RefundReconciliationState = { success: false, message: '' }
const INITIAL_DIAGNOSTIC_STATE: RefundIdentityDiagnosticState = { success: false, message: '' }

export function RequestRefundForm({
  reconciliationId,
  formattedAmount,
}: {
  reconciliationId: string
  formattedAmount: string
}) {
  const router = useRouter()
  const [confirmed, setConfirmed] = useState(false)
  const action = requestPaymentReconciliationRefund.bind(null, reconciliationId)
  const [state, formAction, pending] = useActionState(action, INITIAL_STATE)

  useEffect(() => {
    if (state.success) router.refresh()
  }, [router, state.success])

  return (
    <form action={formAction} className="space-y-4 rounded-lg border border-red-200 bg-red-50 p-4">
      <div>
        <h3 className="font-semibold text-red-800">Reembolsar pago</h3>
        <p className="mt-1 text-sm text-red-700">
          Vas a devolver {formattedAmount} al cliente mediante Mercado Pago. Esta acción puede no ser reversible desde Turnea.
        </p>
      </div>

      <label className="flex items-start gap-2 text-sm text-red-800">
        <input
          type="checkbox"
          name="confirmRefund"
          value="yes"
          checked={confirmed}
          onChange={event => setConfirmed(event.target.checked)}
          className="mt-1"
        />
        <span>Confirmo que revisé el caso y quiero solicitar el reembolso total.</span>
      </label>

      <ActionMessage state={state} />

      <button
        type="submit"
        disabled={pending || !confirmed || state.success}
        className="w-full rounded-lg bg-red-600 px-4 py-2.5 font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? 'Procesando...' : 'Reembolsar pago'}
      </button>
    </form>
  )
}

export function VerifyRefundForm({
  reconciliationId,
  allowRetry,
}: {
  reconciliationId: string
  allowRetry: boolean
}) {
  const router = useRouter()
  const action = verifyOrRetryPaymentReconciliationRefund.bind(null, reconciliationId)
  const [state, formAction, pending] = useActionState(action, INITIAL_STATE)

  useEffect(() => {
    if (state.success) router.refresh()
  }, [router, state.success])

  return (
    <form action={formAction} className="space-y-3">
      <ActionMessage state={state} />
      <button
        type="submit"
        disabled={pending || state.success}
        className="w-full rounded-lg border border-[var(--primary)] px-4 py-2.5 font-semibold text-[var(--primary)] hover:bg-[var(--primary)] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? 'Verificando...' : allowRetry ? 'Reintentar y verificar' : 'Verificar estado'}
      </button>
    </form>
  )
}

export function RefundIdentityDiagnosticForm({
  reconciliationId,
}: {
  reconciliationId: string
}) {
  const action = diagnosePaymentReconciliationIdentity.bind(null, reconciliationId)
  const [state, formAction, pending] = useActionState(action, INITIAL_DIAGNOSTIC_STATE)

  return (
    <form action={formAction} className="mt-3 space-y-3">
      <ActionMessage state={state} />
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg border border-slate-400 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? 'Comparando identidad...' : 'Diagnosticar identidad (sólo lectura)'}
      </button>
    </form>
  )
}

function ActionMessage({ state }: { state: RefundReconciliationState | RefundIdentityDiagnosticState }) {
  if (!state.message) return null
  return (
    <p
      aria-live="polite"
      className={`rounded-lg p-3 text-sm ${state.success ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-800'}`}
    >
      {state.message}
    </p>
  )
}

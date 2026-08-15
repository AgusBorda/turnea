'use client'

import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import {
  resolveReconciliationRetained,
  type ResolveReconciliationState,
} from '../actions'

const INITIAL_STATE: ResolveReconciliationState = { success: false, message: '' }

export default function ResolveRetainedForm({ reconciliationId }: { reconciliationId: string }) {
  const router = useRouter()
  const [confirmed, setConfirmed] = useState(false)
  const action = resolveReconciliationRetained.bind(null, reconciliationId)
  const [state, formAction, pending] = useActionState(action, INITIAL_STATE)

  useEffect(() => {
    if (state.success) router.refresh()
  }, [router, state.success])

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="resolutionNotes" className="mb-1 block text-sm font-medium">
          Nota de resolución <span className="text-red-500">*</span>
        </label>
        <textarea
          id="resolutionNotes"
          name="resolutionNotes"
          required
          maxLength={2000}
          rows={4}
          placeholder="Ej: Cliente reprogramado manualmente para el 22/08"
          className="w-full rounded-lg border border-[var(--border)] px-3 py-2 focus:border-[var(--primary)] focus:outline-none"
        />
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={event => setConfirmed(event.target.checked)}
          className="mt-1"
        />
        <span>Confirmo que revisé el caso y decidí conservar este pago.</span>
      </label>

      {state.message && (
        <p
          aria-live="polite"
          className={`rounded-lg p-3 text-sm ${state.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}
        >
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || !confirmed || state.success}
        className="w-full rounded-lg bg-[var(--primary)] px-4 py-2.5 font-semibold text-white hover:bg-[var(--primary-dark)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? 'Guardando...' : 'Marcar como resuelto y conservar pago'}
      </button>
    </form>
  )
}

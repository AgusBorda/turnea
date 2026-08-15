'use server'

import { revalidatePath } from 'next/cache'

import { createClient } from '@/lib/supabase/server'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export interface ResolveReconciliationState {
  success: boolean
  message: string
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

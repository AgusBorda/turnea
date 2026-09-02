'use server'

import { revalidatePath } from 'next/cache'

import { createClient } from '@/lib/supabase/server'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

export interface BlockedSlotActionState {
  success: boolean
  message: string
  feedback: 'inline' | 'toast'
  tone: 'success' | 'error' | 'warning'
}

function getString(formData: FormData, field: string): string {
  const value = formData.get(field)
  return typeof value === 'string' ? value.trim() : ''
}

function mapBlockedSlotError(message: string): Pick<BlockedSlotActionState, 'message' | 'tone'> {
  if (message.includes('BLOCKED_SLOT_OVERLAP')) {
    return { message: 'Ya existe un bloqueo en ese horario.', tone: 'warning' }
  }
  if (message.includes('BLOCK_CONFLICTS_WITH_APPOINTMENTS')) {
    return {
      message: 'No podés bloquear este horario porque ya existen turnos reservados.',
      tone: 'error',
    }
  }
  if (message.includes('BLOCKED_SLOT_IN_PAST')) {
    return { message: 'No podés bloquear una fecha pasada.', tone: 'error' }
  }
  if (message.includes('VACATION_RANGE_TOO_LARGE')) {
    return { message: 'El período de vacaciones supera el máximo permitido.', tone: 'error' }
  }
  if (message.includes('VACATION_RANGE_INVALID')) {
    return { message: 'El rango de vacaciones no es válido.', tone: 'error' }
  }
  if (message.includes('BLOCKED_SLOT_INVALID_RANGE')) {
    return { message: 'El rango horario no es válido.', tone: 'error' }
  }
  if (message.includes('BLOCKED_SLOT_INVALID_REASON')) {
    return { message: 'El motivo es demasiado largo.', tone: 'error' }
  }
  if (message.includes('BARBER_NOT_FOUND_OR_NOT_OWNED')) {
    return { message: 'No se encontró el barbero.', tone: 'error' }
  }
  if (message.includes('BLOCKED_SLOT_NOT_FOUND_OR_NOT_OWNED')) {
    return { message: 'El bloqueo ya no existe o no está disponible.', tone: 'error' }
  }
  return { message: 'No se pudo completar la acción. Intentá nuevamente.', tone: 'error' }
}

function inlineError(message: string): BlockedSlotActionState {
  return { success: false, message, feedback: 'inline', tone: 'error' }
}

function toastResult(
  success: boolean,
  message: string,
  tone: BlockedSlotActionState['tone']
): BlockedSlotActionState {
  return { success, message, feedback: 'toast', tone }
}

function mappedToastError(message: string): BlockedSlotActionState {
  const mapped = mapBlockedSlotError(message)
  return toastResult(false, mapped.message, mapped.tone)
}

async function getAuthenticatedClient() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return { supabase, user }
}

function revalidateSchedule(barberId: string) {
  revalidatePath(`/dashboard/barbers/${barberId}/schedule`)
}

export async function createFullDayBlock(
  barberId: string,
  _previousState: BlockedSlotActionState,
  formData: FormData
): Promise<BlockedSlotActionState> {
  void _previousState
  const date = getString(formData, 'date')
  const reason = getString(formData, 'reason')

  if (!UUID_PATTERN.test(barberId) || !DATE_PATTERN.test(date)) {
    return inlineError('Elegí una fecha válida.')
  }

  const { supabase, user } = await getAuthenticatedClient()
  if (!user) return toastResult(false, 'Tu sesión venció. Volvé a iniciar sesión.', 'error')

  const { error } = await supabase.rpc('create_barber_blocked_slot', {
    p_barber_id: barberId,
    p_date: date,
    p_all_day: true,
    p_start_time: null,
    p_end_time: null,
    p_reason: reason || null,
  })

  if (error) return mappedToastError(error.message)
  revalidateSchedule(barberId)
  return toastResult(true, 'Bloqueo agregado', 'success')
}

export async function createPartialBlock(
  barberId: string,
  _previousState: BlockedSlotActionState,
  formData: FormData
): Promise<BlockedSlotActionState> {
  void _previousState
  const date = getString(formData, 'date')
  const startTime = getString(formData, 'startTime')
  const endTime = getString(formData, 'endTime')
  const reason = getString(formData, 'reason')

  if (
    !UUID_PATTERN.test(barberId)
    || !DATE_PATTERN.test(date)
    || !TIME_PATTERN.test(startTime)
    || !TIME_PATTERN.test(endTime)
    || startTime >= endTime
  ) {
    return inlineError('Elegí una fecha y una franja horaria válidas.')
  }

  const { supabase, user } = await getAuthenticatedClient()
  if (!user) return toastResult(false, 'Tu sesión venció. Volvé a iniciar sesión.', 'error')

  const { error } = await supabase.rpc('create_barber_blocked_slot', {
    p_barber_id: barberId,
    p_date: date,
    p_all_day: false,
    p_start_time: startTime,
    p_end_time: endTime,
    p_reason: reason || null,
  })

  if (error) return mappedToastError(error.message)
  revalidateSchedule(barberId)
  return toastResult(true, 'Bloqueo agregado', 'success')
}

export async function createVacation(
  barberId: string,
  _previousState: BlockedSlotActionState,
  formData: FormData
): Promise<BlockedSlotActionState> {
  void _previousState
  const dateFrom = getString(formData, 'dateFrom')
  const dateTo = getString(formData, 'dateTo')
  const reason = getString(formData, 'reason')

  if (
    !UUID_PATTERN.test(barberId)
    || !DATE_PATTERN.test(dateFrom)
    || !DATE_PATTERN.test(dateTo)
    || dateTo < dateFrom
  ) {
    return inlineError('Elegí un rango de vacaciones válido.')
  }

  const { supabase, user } = await getAuthenticatedClient()
  if (!user) return toastResult(false, 'Tu sesión venció. Volvé a iniciar sesión.', 'error')

  const { error } = await supabase.rpc('create_barber_vacation', {
    p_barber_id: barberId,
    p_date_from: dateFrom,
    p_date_to: dateTo,
    p_reason: reason || null,
  })

  if (error) return mappedToastError(error.message)
  revalidateSchedule(barberId)
  return toastResult(true, 'Vacaciones cargadas', 'success')
}

export async function deleteBlockedSlot(
  barberId: string,
  blockedSlotId: string,
  _previousState: BlockedSlotActionState
): Promise<BlockedSlotActionState> {
  void _previousState
  if (!UUID_PATTERN.test(barberId) || !UUID_PATTERN.test(blockedSlotId)) {
    return toastResult(false, 'El bloqueo no es válido.', 'error')
  }

  const { supabase, user } = await getAuthenticatedClient()
  if (!user) return toastResult(false, 'Tu sesión venció. Volvé a iniciar sesión.', 'error')

  const { data, error } = await supabase.rpc('delete_barber_blocked_slot', {
    p_blocked_slot_id: blockedSlotId,
  })

  if (error) return mappedToastError(error.message)
  if (data !== true) return toastResult(false, 'No se pudo eliminar el bloqueo.', 'error')

  revalidateSchedule(barberId)
  return toastResult(true, 'Bloqueo eliminado', 'success')
}

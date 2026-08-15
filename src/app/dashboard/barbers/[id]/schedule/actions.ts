'use server'

import { revalidatePath } from 'next/cache'

import { createClient } from '@/lib/supabase/server'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

export interface BlockedSlotActionState {
  success: boolean
  message: string
}

function getString(formData: FormData, field: string): string {
  const value = formData.get(field)
  return typeof value === 'string' ? value.trim() : ''
}

function mapBlockedSlotError(message: string): string {
  if (message.includes('BLOCKED_SLOT_OVERLAP')) {
    return 'Ya existe un bloqueo en ese horario.'
  }
  if (message.includes('BLOCK_CONFLICTS_WITH_APPOINTMENTS')) {
    return 'No podés bloquear este horario porque ya existen turnos reservados.'
  }
  if (message.includes('BLOCKED_SLOT_IN_PAST')) {
    return 'No podés bloquear una fecha pasada.'
  }
  if (message.includes('VACATION_RANGE_TOO_LARGE')) {
    return 'El período de vacaciones supera el máximo permitido.'
  }
  if (message.includes('VACATION_RANGE_INVALID')) {
    return 'El rango de vacaciones no es válido.'
  }
  if (message.includes('BLOCKED_SLOT_INVALID_RANGE')) {
    return 'El rango horario no es válido.'
  }
  if (message.includes('BLOCKED_SLOT_INVALID_REASON')) {
    return 'El motivo es demasiado largo.'
  }
  if (message.includes('BARBER_NOT_FOUND_OR_NOT_OWNED')) {
    return 'No se encontró el barbero.'
  }
  if (message.includes('BLOCKED_SLOT_NOT_FOUND_OR_NOT_OWNED')) {
    return 'El bloqueo ya no existe o no está disponible.'
  }
  return 'No se pudo completar la acción. Intentá nuevamente.'
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
    return { success: false, message: 'Elegí una fecha válida.' }
  }

  const { supabase, user } = await getAuthenticatedClient()
  if (!user) return { success: false, message: 'Tu sesión venció. Volvé a iniciar sesión.' }

  const { error } = await supabase.rpc('create_barber_blocked_slot', {
    p_barber_id: barberId,
    p_date: date,
    p_all_day: true,
    p_start_time: null,
    p_end_time: null,
    p_reason: reason || null,
  })

  if (error) return { success: false, message: mapBlockedSlotError(error.message) }
  revalidateSchedule(barberId)
  return { success: true, message: 'Día completo bloqueado.' }
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
    return { success: false, message: 'Elegí una fecha y una franja horaria válidas.' }
  }

  const { supabase, user } = await getAuthenticatedClient()
  if (!user) return { success: false, message: 'Tu sesión venció. Volvé a iniciar sesión.' }

  const { error } = await supabase.rpc('create_barber_blocked_slot', {
    p_barber_id: barberId,
    p_date: date,
    p_all_day: false,
    p_start_time: startTime,
    p_end_time: endTime,
    p_reason: reason || null,
  })

  if (error) return { success: false, message: mapBlockedSlotError(error.message) }
  revalidateSchedule(barberId)
  return { success: true, message: 'Franja horaria bloqueada.' }
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
    return { success: false, message: 'Elegí un rango de vacaciones válido.' }
  }

  const { supabase, user } = await getAuthenticatedClient()
  if (!user) return { success: false, message: 'Tu sesión venció. Volvé a iniciar sesión.' }

  const { data, error } = await supabase.rpc('create_barber_vacation', {
    p_barber_id: barberId,
    p_date_from: dateFrom,
    p_date_to: dateTo,
    p_reason: reason || null,
  })

  if (error) return { success: false, message: mapBlockedSlotError(error.message) }
  revalidateSchedule(barberId)
  return {
    success: true,
    message: `Vacaciones cargadas: ${Number(data) || 0} día(s) bloqueado(s).`,
  }
}

export async function deleteBlockedSlot(
  barberId: string,
  blockedSlotId: string,
  _previousState: BlockedSlotActionState
): Promise<BlockedSlotActionState> {
  void _previousState
  if (!UUID_PATTERN.test(barberId) || !UUID_PATTERN.test(blockedSlotId)) {
    return { success: false, message: 'El bloqueo no es válido.' }
  }

  const { supabase, user } = await getAuthenticatedClient()
  if (!user) return { success: false, message: 'Tu sesión venció. Volvé a iniciar sesión.' }

  const { data, error } = await supabase.rpc('delete_barber_blocked_slot', {
    p_blocked_slot_id: blockedSlotId,
  })

  if (error) return { success: false, message: mapBlockedSlotError(error.message) }
  if (data !== true) return { success: false, message: 'No se pudo eliminar el bloqueo.' }

  revalidateSchedule(barberId)
  return { success: true, message: 'Bloqueo eliminado.' }
}

import { format, addMinutes, parse, isBefore, isEqual } from 'date-fns'
import { BarberSchedule, BlockedSlot, Appointment, TimeSlot } from './types'

/**
 * Genera los time slots disponibles para un barbero en una fecha dada
 */
export function generateTimeSlots(
  date: Date,
  schedules: BarberSchedule[],
  appointments: Appointment[],
  blockedSlots: BlockedSlot[],
  slotDuration: number = 30,
  serviceDuration: number = 30
): TimeSlot[] {
  const dayOfWeek = date.getDay()
  const schedule = schedules.find(s => s.day_of_week === dayOfWeek && s.is_working)

  if (!schedule) return []

  const slots: TimeSlot[] = []
  const startTime = parse(schedule.start_time, 'HH:mm:ss', date)
  const endTime = parse(schedule.end_time, 'HH:mm:ss', date)

  let current = startTime

  while (isBefore(current, endTime) || isEqual(current, endTime)) {
    const slotEnd = addMinutes(current, serviceDuration)

    // No generar slot si se pasa del horario de fin
    if (!isBefore(slotEnd, endTime) && !isEqual(slotEnd, endTime)) {
      break
    }

    const timeStr = format(current, 'HH:mm')
    const timeStrFull = format(current, 'HH:mm:ss')

    // Verificar si está bloqueado
    const isBlocked = blockedSlots.some(block => {
      if (block.all_day) return true
      if (!block.start_time || !block.end_time) return false
      return timeStrFull >= block.start_time && timeStrFull < block.end_time
    })

    // Verificar si hay turno existente
    const hasAppointment = appointments.some(apt => {
      if (apt.status === 'cancelled') return false
      return timeStrFull >= apt.start_time && timeStrFull < apt.end_time
    })

    slots.push({
      time: timeStr,
      available: !isBlocked && !hasAppointment,
    })

    current = addMinutes(current, slotDuration)
  }

  return slots
}

/**
 * Formatea precio en pesos argentinos
 */
export function formatPrice(price: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
  }).format(price)
}

/**
 * Formatea duración en minutos a texto legible
 */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`
}

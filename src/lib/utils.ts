import { BarberSchedule, BusySlot, PublicBlockedSlot, TimeSlot } from './types'
import { getLocalDateDayOfWeek, isLocalSlotInPast, LocalDate } from './datetime'

/**
 * Genera los time slots disponibles para un barbero en una fecha dada
 */
export function generateTimeSlots(
  date: LocalDate,
  schedules: BarberSchedule[],
  busySlots: BusySlot[],
  blockedSlots: PublicBlockedSlot[],
  timeZone: string,
  slotDuration: number = 30,
  serviceDuration: number = 30
): TimeSlot[] {
  const dayOfWeek = getLocalDateDayOfWeek(date)
  const schedule = schedules.find(s => s.day_of_week === dayOfWeek && s.is_working)

  if (!schedule) return []

  const slots: TimeSlot[] = []
  const startTime = timeToMinutes(schedule.start_time)
  const endTime = timeToMinutes(schedule.end_time)

  let current = startTime

  while (current <= endTime) {
    const slotEnd = current + serviceDuration

    // No generar slot si se pasa del horario de fin
    if (slotEnd > endTime) {
      break
    }

    const timeStr = minutesToTime(current, false)
    const timeStrFull = minutesToTime(current, true)

    if (isLocalSlotInPast(date, timeStrFull, timeZone)) {
      current += slotDuration
      continue
    }

    // Verificar si está bloqueado
    const isBlocked = blockedSlots.some(block => {
      if (block.all_day) return true
      if (!block.start_time || !block.end_time) return false
      return timeStrFull >= block.start_time && timeStrFull < block.end_time
    })

    const hasAppointment = busySlots.some(slot =>
      timeStrFull >= slot.start_time && timeStrFull < slot.end_time
    )

    slots.push({
      time: timeStr,
      available: !isBlocked && !hasAppointment,
    })

    current += slotDuration
  }

  return slots
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

function minutesToTime(minutes: number, includeSeconds: boolean): string {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  const value = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
  return includeSeconds ? `${value}:00` : value
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

export type LocalDate = string
export type LocalTime = string

const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const LOCAL_TIME_PATTERN = /^(\d{2}):(\d{2})(?::(\d{2}))?$/

export function getBarbershopToday(timeZone: string, now: Date = new Date()): LocalDate {
  const parts = getZonedParts(timeZone, now)
  return `${parts.year}-${parts.month}-${parts.day}`
}

export function getBarbershopCurrentTime(timeZone: string, now: Date = new Date()): LocalTime {
  const parts = getZonedParts(timeZone, now)
  return `${parts.hour}:${parts.minute}:${parts.second}`
}

export function getBarbershopCurrentMinutes(timeZone: string, now: Date = new Date()): number {
  const parts = getZonedParts(timeZone, now)
  return Number(parts.hour) * 60 + Number(parts.minute)
}

export function addCalendarDays(localDate: LocalDate, days: number): LocalDate {
  const { year, month, day } = parseLocalDate(localDate)
  const result = new Date(Date.UTC(year, month - 1, day + days))
  return formatDateParts(result.getUTCFullYear(), result.getUTCMonth() + 1, result.getUTCDate())
}

export function getLocalDateDayOfWeek(localDate: LocalDate): number {
  const { year, month, day } = parseLocalDate(localDate)
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

export function getWeekStartLocalDate(
  localDate: LocalDate,
  weekStartsOn: 0 | 1 = 1
): LocalDate {
  const dayOfWeek = getLocalDateDayOfWeek(localDate)
  const daysSinceStart = (dayOfWeek - weekStartsOn + 7) % 7
  return addCalendarDays(localDate, -daysSinceStart)
}

export function getWeekEndLocalDate(
  localDate: LocalDate,
  weekStartsOn: 0 | 1 = 1
): LocalDate {
  return addCalendarDays(getWeekStartLocalDate(localDate, weekStartsOn), 6)
}

export function getMonthStartLocalDate(localDate: LocalDate): LocalDate {
  const { year, month } = parseLocalDate(localDate)
  return formatDateParts(year, month, 1)
}

export function getMonthEndLocalDate(localDate: LocalDate): LocalDate {
  return addCalendarDays(addCalendarMonths(getMonthStartLocalDate(localDate), 1), -1)
}

export function addCalendarMonths(localDate: LocalDate, months: number): LocalDate {
  const { year, month, day } = parseLocalDate(localDate)
  const targetMonth = new Date(Date.UTC(year, month - 1 + months, 1))
  const targetYear = targetMonth.getUTCFullYear()
  const targetMonthNumber = targetMonth.getUTCMonth() + 1
  const lastDay = parseLocalDate(getMonthEndFromParts(targetYear, targetMonthNumber)).day
  return formatDateParts(targetYear, targetMonthNumber, Math.min(day, lastDay))
}

export function isLocalDateToday(
  localDate: LocalDate,
  timeZone: string,
  now: Date = new Date()
): boolean {
  return localDate === getBarbershopToday(timeZone, now)
}

export function isLocalSlotInPast(
  localDate: LocalDate,
  localTime: LocalTime,
  timeZone: string,
  now: Date = new Date()
): boolean {
  const today = getBarbershopToday(timeZone, now)
  if (localDate < today) return true
  if (localDate > today) return false
  return timeToSeconds(localTime) <= timeToSeconds(getBarbershopCurrentTime(timeZone, now))
}

export function formatLocalDate(
  localDate: LocalDate,
  options: Intl.DateTimeFormatOptions
): string {
  const { year, month, day } = parseLocalDate(localDate)
  return new Intl.DateTimeFormat('es-AR', { ...options, timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, day, 12)))
}

function getZonedParts(timeZone: string, instant: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant)

  const value = (type: Intl.DateTimeFormatPartTypes) => {
    const part = parts.find(item => item.type === type)?.value
    if (!part) throw new RangeError(`Missing ${type} for timezone ${timeZone}`)
    return part
  }

  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour'),
    minute: value('minute'),
    second: value('second'),
  }
}

function parseLocalDate(localDate: LocalDate) {
  const match = LOCAL_DATE_PATTERN.exec(localDate)
  if (!match) throw new RangeError(`Invalid local date: ${localDate}`)

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const check = new Date(Date.UTC(year, month - 1, day))

  if (
    check.getUTCFullYear() !== year
    || check.getUTCMonth() + 1 !== month
    || check.getUTCDate() !== day
  ) {
    throw new RangeError(`Invalid local date: ${localDate}`)
  }

  return { year, month, day }
}

function timeToSeconds(localTime: LocalTime): number {
  const match = LOCAL_TIME_PATTERN.exec(localTime)
  if (!match) throw new RangeError(`Invalid local time: ${localTime}`)

  const hours = Number(match[1])
  const minutes = Number(match[2])
  const seconds = Number(match[3] ?? 0)
  if (hours > 23 || minutes > 59 || seconds > 59) {
    throw new RangeError(`Invalid local time: ${localTime}`)
  }

  return hours * 3600 + minutes * 60 + seconds
}

function formatDateParts(year: number, month: number, day: number): LocalDate {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function getMonthEndFromParts(year: number, month: number): LocalDate {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return formatDateParts(year, month, lastDay)
}

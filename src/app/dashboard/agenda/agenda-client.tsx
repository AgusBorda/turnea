'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, X, Check, Ban, Phone, ChevronLeft, ChevronRight, CalendarOff, AlertCircle } from 'lucide-react'
import { formatPrice } from '@/lib/utils'
import { useMinuteNow } from '@/hooks/use-minute-now'
import Button from '@/components/ui/button'
import {
  addCalendarDays,
  addCalendarMonths,
  formatLocalDate,
  getBarbershopCurrentMinutes,
  getBarbershopToday,
  getLocalDateDayOfWeek,
  getMonthEndLocalDate,
  getMonthStartLocalDate,
  getWeekEndLocalDate,
  getWeekStartLocalDate,
  isLocalDateToday,
  LocalDate,
} from '@/lib/datetime'

type View = 'day' | 'week' | 'month'

interface AppointmentData {
  id: string
  barber_id: string
  service_id: string | null
  date: string
  start_time: string
  end_time: string
  status: string
  deposit_status: string
  expires_at: string | null
  client_name: string | null
  client_phone: string | null
  barbers: { name: string } | null
  services: { name: string; price: number; duration: number } | null
}

export interface BlockedSlotData {
  id: string
  barber_id: string
  date: string
  start_time: string | null
  end_time: string | null
  all_day: boolean
  reason: string | null
}

export interface BarberScheduleData {
  barber_id: string
  day_of_week: number
  start_time: string
  end_time: string
  is_working: boolean
}

export interface AgendaBarber {
  id: string
  name: string
  active: boolean
}

export interface AgendaService {
  id: string
  name: string
  price: number
  duration: number
  active: boolean
}

interface Props {
  barbershopId: string
  timezone: string
  barbers: AgendaBarber[]
  services: AgendaService[]
  barberSchedules: BarberScheduleData[]
}

const DAY_START = 8
const DAY_END = 22
const HOUR_PX = 64

function toMin(t: string) {
  const parts = t.split(':').map(Number)
  return parts[0] * 60 + (parts[1] || 0)
}

type AgendaDayItem =
  | { type: 'appointment'; appointment: AppointmentData }
  | { type: 'blocked-slot'; blockedSlot: BlockedSlotData }

type AgendaSummaryItem =
  | AgendaDayItem
  | { type: 'all-day-block'; blockedSlot: BlockedSlotData }

function getItemStartTime(item: AgendaDayItem) {
  return item.type === 'appointment' ? item.appointment.start_time : item.blockedSlot.start_time!
}

function getItemEndTime(item: AgendaDayItem) {
  return item.type === 'appointment' ? item.appointment.end_time : item.blockedSlot.end_time!
}

function getCombinedDayItems(
  appointments: AppointmentData[],
  blockedSlots: BlockedSlotData[],
  date: LocalDate
): AgendaDayItem[] {
  return [
    ...appointments
      .filter(appointment => appointment.date === date && appointment.status !== 'cancelled')
      .map(appointment => ({ type: 'appointment' as const, appointment })),
    ...blockedSlots
      .filter(block => block.date === date && !block.all_day && block.start_time && block.end_time)
      .map(blockedSlot => ({ type: 'blocked-slot' as const, blockedSlot })),
  ].sort((a, b) => toMin(getItemStartTime(a)) - toMin(getItemStartTime(b)))
}

function getAllDayBlocksForDate(blockedSlots: BlockedSlotData[], date: LocalDate) {
  return blockedSlots.filter(block => block.date === date && block.all_day)
}

function getSummaryDayItems(
  appointments: AppointmentData[],
  blockedSlots: BlockedSlotData[],
  date: LocalDate
): AgendaSummaryItem[] {
  return [
    ...getAllDayBlocksForDate(blockedSlots, date)
      .map(blockedSlot => ({ type: 'all-day-block' as const, blockedSlot })),
    ...getCombinedDayItems(appointments, blockedSlots, date),
  ]
}

function layoutDayItems(items: AgendaDayItem[]) {
  if (items.length === 0) return []
  const sorted = [...items].sort((a, b) => toMin(getItemStartTime(a)) - toMin(getItemStartTime(b)))
  const colEnds: number[] = []
  const colOf: number[] = new Array(sorted.length).fill(0)
  for (let i = 0; i < sorted.length; i++) {
    const start = toMin(getItemStartTime(sorted[i]))
    let col = colEnds.findIndex(end => end <= start)
    if (col === -1) col = colEnds.length
    colOf[i] = col
    colEnds[col] = toMin(getItemEndTime(sorted[i]))
  }
  return sorted.map((item, i) => {
    const start = toMin(getItemStartTime(item))
    const end = toMin(getItemEndTime(item))
    let maxCol = colOf[i]
    for (let j = 0; j < sorted.length; j++) {
      if (j === i) continue
      const oStart = toMin(getItemStartTime(sorted[j]))
      const oEnd = toMin(getItemEndTime(sorted[j]))
      if (start < oEnd && end > oStart) maxCol = Math.max(maxCol, colOf[j])
    }
    return { item, col: colOf[i], maxCols: maxCol + 1 }
  })
}

function getBlockedSlotReason(blockedSlot: BlockedSlotData) {
  return blockedSlot.reason?.trim() || null
}

function getBlockedSlotLabel(
  blockedSlot: BlockedSlotData,
  barberName: string | undefined,
  showBarberName: boolean
) {
  const reason = getBlockedSlotReason(blockedSlot)
  const barber = showBarberName && barberName ? ` Barbero ${barberName}.` : ''
  return `Bloqueado de ${blockedSlot.start_time!.slice(0, 5)} a ${blockedSlot.end_time!.slice(0, 5)}.${reason ? ` ${reason}.` : ''}${barber}`
}

function getAllDayBlockLabel(
  blockedSlot: BlockedSlotData,
  barberName: string | undefined,
  showBarberName: boolean
) {
  const reason = getBlockedSlotReason(blockedSlot)
  const subject = showBarberName && barberName ? `${barberName} no disponible` : 'No disponible'
  return `${subject} todo el día.${reason ? ` ${reason}.` : ''}`
}

type PendingPaymentState = 'active' | 'expired' | null

function getPendingPaymentState(appointment: AppointmentData, now: Date | null): PendingPaymentState {
  if (appointment.status !== 'pending_payment' || appointment.deposit_status !== 'pending') {
    return null
  }
  if (!appointment.expires_at || !now) return 'active'
  return Date.parse(appointment.expires_at) <= now.getTime() ? 'expired' : 'active'
}

function statusColor(appointment: AppointmentData, now: Date | null) {
  if (getPendingPaymentState(appointment, now) === 'expired') {
    return 'bg-gray-100 border-dashed border-gray-300 text-gray-500'
  }

  const { status } = appointment
  switch (status) {
    case 'completed': return 'bg-green-100 border-green-200 text-green-800'
    case 'no_show': return 'bg-red-100 border-red-200 text-red-800'
    case 'pending_payment': return 'bg-yellow-100 border-yellow-200 text-yellow-800'
    case 'cancelled': return 'bg-gray-100 border-gray-200 text-gray-400'
    default: return 'bg-purple-100 border-purple-200 text-purple-800'
  }
}

function statusLabel(appointment: AppointmentData, now: Date | null) {
  if (getPendingPaymentState(appointment, now) === 'expired') return 'Pago vencido'

  const { status } = appointment
  const map: Record<string, string> = {
    confirmed: 'Confirmado', completed: 'Completado', pending: 'Pendiente',
    pending_payment: 'Pago pendiente', no_show: 'No se presentó', cancelled: 'Cancelado',
  }
  return map[status] || status
}

function getVisibleDateRange(view: View, currentDate: LocalDate) {
  if (view === 'day') return { from: currentDate, to: currentDate }
  if (view === 'week') {
    return {
      from: getWeekStartLocalDate(currentDate, 1),
      to: getWeekEndLocalDate(currentDate, 1),
    }
  }

  return {
    from: getWeekStartLocalDate(getMonthStartLocalDate(currentDate), 1),
    to: getWeekEndLocalDate(getMonthEndLocalDate(currentDate), 1),
  }
}

function filterAgendaData(
  appointments: AppointmentData[],
  blockedSlots: BlockedSlotData[],
  barberSchedules: BarberScheduleData[],
  selectedBarberId: string
) {
  if (selectedBarberId === 'all') {
    return { appointments, blockedSlots, barberSchedules }
  }

  return {
    appointments: appointments.filter(appointment => appointment.barber_id === selectedBarberId),
    blockedSlots: blockedSlots.filter(block => block.barber_id === selectedBarberId),
    barberSchedules: barberSchedules.filter(schedule => schedule.barber_id === selectedBarberId),
  }
}

function DayView({ appointments, blockedSlots, date, timezone, now, barberNames, showBarberName, onSelect }: {
  appointments: AppointmentData[]
  blockedSlots: BlockedSlotData[]
  date: LocalDate
  timezone: string
  now: Date | null
  barberNames: Record<string, string>
  showBarberName: boolean
  onSelect: (apt: AppointmentData) => void
}) {
  const isCurrentDay = now ? isLocalDateToday(date, timezone, now) : false
  const currentMin = now ? getBarbershopCurrentMinutes(timezone, now) : null
  const startMin = DAY_START * 60
  const totalHours = DAY_END - DAY_START
  const allDayBlocks = getAllDayBlocksForDate(blockedSlots, date)
  const dayItems = getCombinedDayItems(appointments, blockedSlots, date)
  const dayApts = dayItems.filter(item => item.type === 'appointment')
  const partialBlocksCount = dayItems.length - dayApts.length
  const totalBlocksCount = allDayBlocks.length + partialBlocksCount
  const laid = layoutDayItems(dayItems)

  return (
    <div className="bg-white rounded-xl border border-[var(--border)] overflow-hidden">
      <div className={`border-b px-3 py-2 sm:px-4 sm:py-3 ${isCurrentDay ? 'border-purple-50 bg-purple-50/30' : 'border-[var(--border)]'}`}>
        <div className="flex min-w-0 items-center gap-2">
          <p className={`min-w-0 truncate text-xs font-medium sm:text-base sm:font-semibold sm:capitalize ${isCurrentDay ? 'text-purple-700/80' : 'text-gray-500 sm:text-gray-800'}`}>
            <span className="sm:hidden">Resumen del día</span>
            <span className="hidden sm:inline">{formatLocalDate(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
          </p>
          {isCurrentDay && (
            <span className="hidden rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700 sm:inline-flex">Hoy</span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-[var(--muted)] sm:text-sm">
          {dayApts.length > 0
            ? `${dayApts.length} turno${dayApts.length !== 1 ? 's' : ''}${totalBlocksCount > 0 ? ` · ${totalBlocksCount} bloqueo${totalBlocksCount !== 1 ? 's' : ''}` : ''}`
            : totalBlocksCount > 0
              ? `Sin turnos · ${totalBlocksCount} bloqueo${totalBlocksCount !== 1 ? 's' : ''} de disponibilidad`
              : 'No hay turnos para este día. Los nuevos turnos aparecerán acá.'}
        </p>
      </div>
      {allDayBlocks.length > 0 && (
        <div className="space-y-1.5 border-b border-stone-100 bg-stone-50/50 px-3 py-1.5">
          {allDayBlocks.map(block => {
            const reason = getBlockedSlotReason(block)
            const barberName = barberNames[block.barber_id]
            return (
              <div
                key={block.id}
                role="note"
                aria-label={getAllDayBlockLabel(block, barberName, showBarberName)}
                title={reason || undefined}
                className="flex min-w-0 items-start gap-2 border-l-[3px] border-amber-400 bg-white/70 px-2.5 py-1.5 text-gray-800"
              >
                <CalendarOff className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {showBarberName && barberName ? `${barberName} no disponible todo el día` : 'Día no disponible'}
                  </p>
                  {reason && <p className="mt-0.5 truncate text-xs text-gray-500">{reason}</p>}
                </div>
              </div>
            )
          })}
        </div>
      )}
      <div className="overflow-y-auto" style={{ maxHeight: '620px' }}>
        <div className="flex">
          <div className="relative w-10 flex-shrink-0 select-none sm:w-12" style={{ height: `${totalHours * HOUR_PX}px` }}>
            {Array.from({ length: totalHours + 1 }, (_, i) => (
              <div key={i} className="absolute right-0 flex items-center pr-1.5 sm:pr-2"
                style={{ top: `${i * HOUR_PX - 8}px`, height: '16px' }}>
                <span className="text-[11px] leading-none text-gray-500 sm:text-xs">
                  {(DAY_START + i).toString().padStart(2, '0')}:00
                </span>
              </div>
            ))}
          </div>
          <div className={`relative flex-1 border-l border-gray-100 ${allDayBlocks.length > 0 && !showBarberName ? 'bg-amber-50/10' : ''}`} style={{ height: `${totalHours * HOUR_PX}px` }}>
            {Array.from({ length: totalHours + 1 }, (_, i) => (
              <div key={i} className="absolute left-0 right-0 border-t border-gray-100" style={{ top: `${i * HOUR_PX}px` }} />
            ))}
            {Array.from({ length: totalHours }, (_, i) => (
              <div key={`h${i}`} className="absolute left-0 right-0 border-t border-gray-50" style={{ top: `${(i + 0.5) * HOUR_PX}px` }} />
            ))}
            {isCurrentDay && currentMin !== null && currentMin >= startMin && currentMin < DAY_END * 60 && (
              <div className="absolute left-0 right-0 z-20 pointer-events-none flex items-center"
                style={{ top: `${((currentMin - startMin) / 60) * HOUR_PX}px` }}>
                <div className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0 -ml-1" />
                <div className="flex-1 border-t-2 border-red-400" />
              </div>
            )}
            {laid.map(({ item, col, maxCols }) => {
              const startTime = getItemStartTime(item)
              const endTime = getItemEndTime(item)
              const itemStart = toMin(startTime)
              const itemEnd = toMin(endTime)
              const visibleStart = Math.max(itemStart, startMin)
              const visibleEnd = Math.min(itemEnd, DAY_END * 60)
              if (visibleStart >= visibleEnd) return null

              const top = ((visibleStart - startMin) / 60) * HOUR_PX
              const timelineHeight = ((visibleEnd - visibleStart) / 60) * HOUR_PX

              if (item.type === 'blocked-slot') {
                const block = item.blockedSlot
                const reason = getBlockedSlotReason(block)
                const barberName = barberNames[block.barber_id]
                return (
                  <div
                    key={`block-${block.id}`}
                    role="note"
                    aria-label={getBlockedSlotLabel(block, barberName, showBarberName)}
                    title={reason || undefined}
                    className="absolute overflow-hidden rounded-md border border-dashed border-amber-300 bg-amber-50/90 px-1.5 py-1 text-left text-[11px] text-amber-900 shadow-sm sm:rounded-lg sm:px-2 sm:text-xs"
                    style={{
                      top: `${top}px`,
                      height: `${timelineHeight}px`,
                      left: `${(col / maxCols) * 100}%`,
                      width: `calc(${(1 / maxCols) * 100}% - 4px)`,
                      marginLeft: '2px',
                    }}
                  >
                    <p className="flex items-center gap-1 font-bold leading-tight">
                      <CalendarOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span className="truncate">Bloqueado{showBarberName && barberName ? ` · ${barberName}` : ''}</span>
                    </p>
                    {timelineHeight > 30 && (
                      <p className="mt-0.5 truncate font-semibold tabular-nums">
                        {startTime.slice(0, 5)} — {endTime.slice(0, 5)}
                      </p>
                    )}
                    {reason && timelineHeight > 48 && <p className="mt-0.5 truncate opacity-80">{reason}</p>}
                  </div>
                )
              }

              const apt = item.appointment
              const height = Math.max(timelineHeight - 2, 28)
              const pendingPaymentState = getPendingPaymentState(apt, now)
              return (
                <button key={apt.id} onClick={() => onSelect(apt)}
                  className={`absolute overflow-hidden rounded-md border px-1.5 py-1 text-left text-[11px] shadow-sm transition-all hover:brightness-95 active:scale-[0.99] sm:rounded-lg sm:px-2 sm:text-xs ${statusColor(apt, now)}`}
                  style={{
                    top: `${top}px`, height: `${height}px`,
                    left: `${(col / maxCols) * 100}%`,
                    width: `calc(${(1 / maxCols) * 100}% - 4px)`,
                    marginLeft: '2px',
                  }}>
                  <p className="font-bold leading-tight">{apt.start_time.slice(0, 5)} - {apt.end_time.slice(0, 5)}</p>
                  {height > 32 && <p className="truncate leading-tight mt-0.5">{pendingPaymentState === 'expired' ? 'Pago vencido' : apt.client_name || 'Sin nombre'}</p>}
                  {height > 50 && <p className="truncate leading-tight opacity-70">{apt.services?.name} · {apt.barbers?.name}</p>}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function WeekView({ appointments, blockedSlots, currentDate, timezone, now, barberNames, showBarberName, onSelect, onDayClick }: {
  appointments: AppointmentData[]
  blockedSlots: BlockedSlotData[]
  currentDate: LocalDate
  timezone: string
  now: Date | null
  barberNames: Record<string, string>
  showBarberName: boolean
  onSelect: (apt: AppointmentData) => void
  onDayClick: (d: LocalDate) => void
}) {
  const weekStart = getWeekStartLocalDate(currentDate, 1)
  const days = Array.from({ length: 7 }, (_, i) => addCalendarDays(weekStart, i))
  return (
    <div className="-mx-1 overflow-x-auto overscroll-x-contain px-1 pb-2" tabIndex={0} aria-label="Agenda semanal; desplazá horizontalmente para ver todos los días">
      <div className="grid min-w-[680px] grid-cols-7 gap-1.5 sm:gap-2">
        {days.map(day => {
          const dateStr = day
          const dayItems = getSummaryDayItems(appointments, blockedSlots, dateStr)
          const isCurrentDay = now ? isLocalDateToday(day, timezone, now) : false
          return (
            <div key={dateStr} className={`bg-white rounded-xl border min-h-[160px] ${isCurrentDay ? 'border-purple-400 ring-1 ring-purple-200/50' : 'border-[var(--border)]'}`}>
              <button onClick={() => onDayClick(day)}
                className={`flex min-h-11 w-full flex-col items-center gap-0.5 rounded-t-xl border-b px-2 py-2 text-center transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--primary)] ${isCurrentDay ? 'border-purple-100' : 'border-[var(--border)]'}`}>
                <span className={`text-xs font-medium capitalize ${isCurrentDay ? 'text-purple-600' : 'text-[var(--muted)]'}`}>
                  {formatLocalDate(day, { weekday: 'short' })}
                </span>
                <span className={`w-8 h-8 flex items-center justify-center rounded-full text-sm font-bold ${isCurrentDay ? 'bg-purple-600 text-white' : 'text-gray-700 hover:bg-gray-100'}`}>
                  {formatLocalDate(day, { day: 'numeric' })}
                </span>
              </button>
              <div className="p-1.5 space-y-1">
                {dayItems.length === 0 ? (
                  <p className="text-xs text-center text-gray-300 py-4">-</p>
                ) : (
                  <>
                    {dayItems.slice(0, 7).map(item => {
                      if (item.type === 'appointment') {
                        return (
                          <button key={item.appointment.id} onClick={() => onSelect(item.appointment)}
                            className={`w-full text-left text-xs px-2 py-1.5 rounded-lg border transition-all hover:brightness-95 ${statusColor(item.appointment, now)}`}>
                            <span className="font-bold">{item.appointment.start_time.slice(0, 5)}</span>
                            <span className="ml-1 truncate block leading-tight">
                              {getPendingPaymentState(item.appointment, now) === 'expired' ? 'Pago vencido' : item.appointment.client_name || '?'}
                            </span>
                          </button>
                        )
                      }

                      const block = item.blockedSlot
                      const barberName = barberNames[block.barber_id]
                      const reason = getBlockedSlotReason(block)

                      if (item.type === 'all-day-block') {
                        return (
                          <div
                            key={`all-day-${block.id}`}
                            role="note"
                            aria-label={getAllDayBlockLabel(block, barberName, showBarberName)}
                            title={reason || undefined}
                            className="border-l-2 border-amber-400 px-2 py-0.5 text-xs text-gray-800"
                          >
                            <p className="flex items-center gap-1 truncate font-semibold">
                              <CalendarOff className="h-3 w-3 shrink-0 text-amber-600" aria-hidden="true" />
                              {showBarberName && barberName ? `${barberName} · ` : ''}No disponible
                            </p>
                            {reason && <p className="truncate text-[11px] text-gray-500">{reason}</p>}
                          </div>
                        )
                      }

                      return (
                        <div
                          key={`block-${block.id}`}
                          role="note"
                          aria-label={getBlockedSlotLabel(block, barberName, showBarberName)}
                          title={reason || undefined}
                          className="rounded-lg border border-dashed border-amber-300 bg-amber-50 px-2 py-1.5 text-xs text-amber-900"
                        >
                          <p className="flex items-center gap-1 truncate font-bold tabular-nums">
                            <CalendarOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            {block.start_time!.slice(0, 5)}–{block.end_time!.slice(0, 5)}
                          </p>
                          <p className="mt-0.5 truncate leading-tight">
                            Bloqueado{showBarberName && barberName ? ` · ${barberName}` : ''}
                          </p>
                          {reason && <p className="mt-0.5 truncate opacity-75">{reason}</p>}
                        </div>
                      )
                    })}
                    {dayItems.length > 7 && (
                      <button onClick={() => onDayClick(day)} className="w-full text-xs text-center text-purple-500 hover:text-purple-700 py-1 font-medium">
                        +{dayItems.length - 7} mas
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function MonthView({ appointments, blockedSlots, currentDate, timezone, now, barberNames, showBarberName, onDayClick }: {
  appointments: AppointmentData[]
  blockedSlots: BlockedSlotData[]
  currentDate: LocalDate
  timezone: string
  now: Date | null
  barberNames: Record<string, string>
  showBarberName: boolean
  onDayClick: (d: LocalDate) => void
}) {
  const monthStart = getMonthStartLocalDate(currentDate)
  const monthEnd = getMonthEndLocalDate(currentDate)
  const calStart = getWeekStartLocalDate(monthStart, 1)
  const calEnd = getWeekEndLocalDate(monthEnd, 1)
  const allDays: LocalDate[] = []
  for (let day = calStart; day <= calEnd; day = addCalendarDays(day, 1)) {
    allDays.push(day)
  }
  const dayNames = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom']
  return (
    <div className="bg-white rounded-xl border border-[var(--border)] overflow-hidden">
      <div className="grid grid-cols-7 border-b border-[var(--border)]">
        {dayNames.map((d, i) => (
          <div key={d} className={`py-2 text-center text-[10px] font-semibold uppercase tracking-wide sm:py-2.5 sm:text-xs ${i >= 5 ? 'text-purple-400' : 'text-[var(--muted)]'}`}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {allDays.map(day => {
          const dateStr = day
          const dayItems = getSummaryDayItems(appointments, blockedSlots, dateStr)
          const inMonth = day.slice(0, 7) === currentDate.slice(0, 7)
          const isCurrentDay = now ? isLocalDateToday(day, timezone, now) : false
          const dow = getLocalDateDayOfWeek(day)
          const isWeekend = dow === 0 || dow === 6
          return (
            <button key={dateStr} onClick={() => onDayClick(day)}
              className={`min-h-[72px] border-b border-r border-gray-50 p-1 text-left transition-colors hover:bg-purple-50/50 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--primary)] sm:min-h-[90px] sm:p-2 ${!inMonth ? 'opacity-30' : ''} ${isCurrentDay ? 'bg-purple-50/30' : ''}`}>
              <span className={`mb-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold sm:mb-1 sm:h-7 sm:w-7 sm:text-sm ${isCurrentDay ? 'bg-purple-600 text-white' : isWeekend && inMonth ? 'text-purple-500' : 'text-gray-700'}`}>
                {formatLocalDate(day, { day: 'numeric' })}
              </span>
              {dayItems.length > 0 && (
                <div className="space-y-0.5">
                  {dayItems.slice(0, 3).map(item => {
                    if (item.type === 'appointment') {
                      return (
                        <div key={item.appointment.id} className={`truncate rounded border px-1 py-0.5 text-[11px] sm:px-1.5 sm:text-xs ${statusColor(item.appointment, now)}`}>
                          {item.appointment.start_time.slice(0, 5)} <span className="hidden sm:inline">{getPendingPaymentState(item.appointment, now) === 'expired' ? 'Vencido' : item.appointment.client_name || '?'}</span>
                        </div>
                      )
                    }

                    const block = item.blockedSlot
                    const barberName = barberNames[block.barber_id]

                    if (item.type === 'all-day-block') {
                      return (
                        <div
                          key={`all-day-${block.id}`}
                          role="note"
                          aria-label={getAllDayBlockLabel(block, barberName, showBarberName)}
                          title={getAllDayBlockLabel(block, barberName, showBarberName)}
                          className="flex items-center justify-center gap-0.5 truncate px-0.5 py-0.5 text-[11px] font-medium text-gray-600 sm:justify-start sm:gap-1 sm:px-1 sm:text-xs"
                        >
                          <CalendarOff className="h-3 w-3 shrink-0 text-amber-600" aria-hidden="true" />
                          <span className="sr-only sm:not-sr-only sm:truncate">{showBarberName && barberName ? `${barberName} · No disponible` : 'No disponible'}</span>
                        </div>
                      )
                    }

                    return (
                      <div
                        key={`block-${block.id}`}
                        role="note"
                        aria-label={getBlockedSlotLabel(block, barberName, showBarberName)}
                        title={getBlockedSlotLabel(block, barberName, showBarberName)}
                        className="flex items-center justify-center gap-0.5 truncate rounded border border-dashed border-amber-300 bg-amber-50 px-0.5 py-0.5 text-[11px] font-semibold text-amber-900 sm:justify-start sm:gap-1 sm:px-1.5 sm:text-xs"
                      >
                        <CalendarOff className="h-3 w-3 shrink-0" aria-hidden="true" />
                        <span className="truncate tabular-nums">
                          {block.start_time!.slice(0, 5)}<span className="hidden sm:inline"> Bloqueado{showBarberName && barberName ? ` · ${barberName}` : ''}</span>
                        </span>
                      </div>
                    )
                  })}
                  {dayItems.length > 3 && <div className="pl-0.5 text-xs text-gray-400 sm:pl-1">+{dayItems.length - 3} más</div>}
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function AgendaClient({ barbershopId, timezone, barbers, services, barberSchedules }: Props) {
  const now = useMinuteNow()
  const [view, setView] = useState<View>('day')
  const [currentDate, setCurrentDate] = useState<LocalDate>(() => getBarbershopToday(timezone))
  const [appointments, setAppointments] = useState<AppointmentData[]>([])
  const [blockedSlots, setBlockedSlots] = useState<BlockedSlotData[]>([])
  const [selectedBarberId, setSelectedBarberId] = useState(() => (
    barbers.length === 1 ? barbers[0].id : 'all'
  ))
  const [loadingData, setLoadingData] = useState(true)
  const [dataError, setDataError] = useState(false)
  const [selectedApt, setSelectedApt] = useState<AppointmentData | null>(null)
  const [showNewForm, setShowNewForm] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [newDate, setNewDate] = useState('')
  const [newTime, setNewTime] = useState('09:00')
  const [newBarberId, setNewBarberId] = useState(barbers[0]?.id || '')
  const [newServiceId, setNewServiceId] = useState(services[0]?.id || '')
  const [newClientName, setNewClientName] = useState('')
  const [newClientPhone, setNewClientPhone] = useState('')

  const fetchAgendaData = useCallback(async () => {
    setLoadingData(true)
    setDataError(false)
    const supabase = createClient()
    const { from, to } = getVisibleDateRange(view, currentDate)
    const barberIds = barbers.map(barber => barber.id)
    const appointmentsQuery = supabase
      .from('appointments')
      .select('id, barber_id, service_id, date, start_time, end_time, status, deposit_status, expires_at, client_name, client_phone, barbers(name), services(name, price, duration)')
      .eq('barbershop_id', barbershopId)
      .gte('date', from)
      .lte('date', to)
      .order('date').order('start_time')

    const blockedSlotsQuery = barberIds.length > 0
      ? supabase
        .from('blocked_slots')
        .select('id, barber_id, date, start_time, end_time, all_day, reason')
        .in('barber_id', barberIds)
        .gte('date', from)
        .lte('date', to)
        .order('date').order('start_time')
      : Promise.resolve({ data: [] as BlockedSlotData[], error: null })

    try {
      const [appointmentsResult, blockedSlotsResult] = await Promise.all([
        appointmentsQuery,
        blockedSlotsQuery,
      ])

      if (appointmentsResult.error || blockedSlotsResult.error) {
        setDataError(true)
        return
      }

      // The project does not yet have generated Supabase relationship types.
      // Runtime many-to-one embeds are objects, although the inferred type is an array.
      setAppointments((appointmentsResult.data || []) as unknown as AppointmentData[])
      setBlockedSlots((blockedSlotsResult.data || []) as BlockedSlotData[])
    } catch {
      setDataError(true)
    } finally {
      setLoadingData(false)
    }
  }, [view, currentDate, barbershopId, barbers])

  useEffect(() => {
    const timeoutId = window.setTimeout(fetchAgendaData, 0)
    return () => window.clearTimeout(timeoutId)
  }, [fetchAgendaData])

  const filteredAgendaData = filterAgendaData(
    appointments,
    blockedSlots,
    barberSchedules,
    selectedBarberId
  )
  const barberNames = Object.fromEntries(barbers.map(barber => [barber.id, barber.name]))
  const showBarberName = selectedBarberId === 'all'

  function navigate(dir: 1 | -1) {
    if (view === 'day') setCurrentDate(d => addCalendarDays(d, dir))
    else if (view === 'week') setCurrentDate(d => addCalendarDays(d, dir * 7))
    else setCurrentDate(d => addCalendarMonths(d, dir))
  }

  function goToday() { setCurrentDate(getBarbershopToday(timezone, now ?? new Date())) }

  function getNavLabel() {
    if (view === 'day') return formatLocalDate(currentDate, { weekday: 'long', day: 'numeric', month: 'long' })
    if (view === 'week') {
      const ws = getWeekStartLocalDate(currentDate, 1)
      const we = getWeekEndLocalDate(currentDate, 1)
      return `${formatLocalDate(ws, { day: 'numeric', month: 'short' })} - ${formatLocalDate(we, { day: 'numeric', month: 'short', year: 'numeric' })}`
    }
    return formatLocalDate(currentDate, { month: 'long', year: 'numeric' })
  }

  async function createAppointment() {
    if (!newDate || !newTime || !newBarberId || !newServiceId || !newClientName.trim()) return
    setActionLoading(true)
    const service = services.find(s => s.id === newServiceId)
    if (!service) { setActionLoading(false); return }
    const supabase = createClient()
    const { error } = await supabase.rpc('create_appointment_atomic', {
      p_barbershop_id: barbershopId,
      p_barber_id: newBarberId,
      p_service_id: newServiceId,
      p_date: newDate,
      p_start_time: `${newTime}:00`,
      p_client_name: newClientName.trim(),
      p_client_phone: newClientPhone.trim() || null,
    })
    if (error?.message.includes('SLOT_')) {
      window.alert('Ese horario acaba de ser reservado. ElegÃ­ otro disponible.')
    } else if (error?.message.includes('DST_')) {
      window.alert('Ese horario no está disponible por un cambio de hora. Elegí otro horario.')
    } else if (error) {
      window.alert('No se pudo crear el turno. RevisÃ¡ los datos e intentÃ¡ nuevamente.')
    } else if (!error) {
      setShowNewForm(false); setNewClientName(''); setNewClientPhone(''); fetchAgendaData()
    }
    setActionLoading(false)
  }

  async function updateStatus(id: string, status: string) {
    setActionLoading(true)
    const supabase = createClient()
    const { data: updated, error } = await supabase.rpc('update_appointment_status_owner', {
      p_appointment_id: id,
      p_status: status,
    })
    if (error || !updated) {
      window.alert('No se pudo actualizar el turno. IntentÃ¡ nuevamente.')
    } else {
      setSelectedApt(null)
      fetchAgendaData()
    }
    setActionLoading(false)
  }

  return (
    <div>
      <div className="mb-4 space-y-3 sm:mb-5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-3xl">Agenda</h1>
            <p className="mt-0.5 hidden text-sm text-[var(--muted)] sm:block">Turnos y disponibilidad de tu equipo</p>
          </div>
          <Button
            type="button"
            onClick={() => { setNewDate(currentDate); setShowNewForm(true) }}
            className="min-h-10 shrink-0 px-3 sm:min-h-11 sm:px-4"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span className="sm:hidden">Nuevo</span>
            <span className="hidden sm:inline">Nuevo turno</span>
          </Button>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="grid w-full grid-cols-3 rounded-xl bg-gray-100 p-1 text-sm sm:w-auto sm:min-w-[270px]" role="group" aria-label="Vista de agenda">
            {(['day', 'week', 'month'] as View[]).map(v => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                aria-pressed={view === v}
                className={`min-h-10 rounded-lg px-3 font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-1 ${view === v ? 'bg-white text-[var(--primary)] shadow-sm' : 'text-gray-500 hover:bg-white/60 hover:text-gray-700'}`}
              >
                {v === 'day' ? 'Día' : v === 'week' ? 'Semana' : 'Mes'}
              </button>
            ))}
          </div>

          <div className="flex min-w-0 items-center gap-1.5 sm:flex-1 sm:justify-end">
            <div className="flex shrink-0 items-center rounded-lg border border-[var(--border)] bg-white p-0.5">
              <button
                type="button"
                onClick={() => navigate(-1)}
                aria-label="Período anterior"
                className="flex h-10 w-10 items-center justify-center rounded-md text-gray-600 transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => navigate(1)}
                aria-label="Período siguiente"
                className="flex h-10 w-10 items-center justify-center rounded-md text-gray-600 transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
              >
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <span className="min-w-0 flex-1 truncate px-1 text-sm font-semibold capitalize text-gray-800 sm:max-w-md sm:text-center sm:text-base">{getNavLabel()}</span>
            {loadingData && <span className="sr-only" aria-live="polite">Cargando agenda</span>}
            <button
              type="button"
              onClick={goToday}
              className={`min-h-10 shrink-0 rounded-lg border px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 ${now && isLocalDateToday(currentDate, timezone, now) && view === 'day' ? 'border-purple-200 bg-purple-50 text-purple-700' : 'border-[var(--border)] bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              Hoy
            </button>
          </div>
        </div>
      </div>

      {barbers.length >= 2 && (
        <div className="-mx-1 mb-4 overflow-x-auto overscroll-x-contain px-1 pb-1" aria-label="Filtrar agenda por barbero" tabIndex={0}>
          <div className="flex min-w-max gap-1.5" role="group">
            <button
              type="button"
              onClick={() => setSelectedBarberId('all')}
              aria-pressed={selectedBarberId === 'all'}
              className={`min-h-10 rounded-full border px-3.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 ${selectedBarberId === 'all' ? 'border-[var(--primary)] bg-[var(--primary)] text-white' : 'border-[var(--border)] bg-white text-[var(--muted)] hover:bg-[var(--secondary)] hover:text-[var(--foreground)]'}`}
            >
              Todos
            </button>
            {barbers.map(barber => (
              <button
                key={barber.id}
                type="button"
                onClick={() => setSelectedBarberId(barber.id)}
                aria-pressed={selectedBarberId === barber.id}
                className={`min-h-10 rounded-full border px-3.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 ${selectedBarberId === barber.id ? 'border-[var(--primary)] bg-[var(--primary)] text-white' : 'border-[var(--border)] bg-white text-[var(--muted)] hover:bg-[var(--secondary)] hover:text-[var(--foreground)]'}`}
              >
                {barber.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {dataError && (
        <div role="alert" className="mb-4 flex items-start gap-3 rounded-xl border border-red-100 bg-red-50/70 p-4 text-sm text-red-900">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">No pudimos cargar la agenda</p>
            <p className="mt-0.5 text-red-700">Revisá tu conexión e intentá nuevamente.</p>
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={fetchAgendaData}
            className="min-h-10 shrink-0 border-red-200 px-3 text-red-700 hover:bg-red-100"
          >
            Reintentar
          </Button>
        </div>
      )}

      {!dataError && view === 'day' && <DayView appointments={filteredAgendaData.appointments} blockedSlots={filteredAgendaData.blockedSlots} date={currentDate} timezone={timezone} now={now} barberNames={barberNames} showBarberName={showBarberName} onSelect={setSelectedApt} />}
      {!dataError && view === 'week' && <WeekView appointments={filteredAgendaData.appointments} blockedSlots={filteredAgendaData.blockedSlots} currentDate={currentDate} timezone={timezone} now={now} barberNames={barberNames} showBarberName={showBarberName} onSelect={setSelectedApt} onDayClick={d => { setCurrentDate(d); setView('day') }} />}
      {!dataError && view === 'month' && <MonthView appointments={filteredAgendaData.appointments} blockedSlots={filteredAgendaData.blockedSlots} currentDate={currentDate} timezone={timezone} now={now} barberNames={barberNames} showBarberName={showBarberName} onDayClick={d => { setCurrentDate(d); setView('day') }} />}

      {showNewForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-xl w-full sm:max-w-md p-5 sm:p-6 max-h-[92dvh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Nuevo turno manual</h3>
              <button onClick={() => setShowNewForm(false)} className="p-1 rounded-lg hover:bg-gray-100 transition-colors"><X className="w-5 h-5 text-[var(--muted)]" /></button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1.5">Fecha *</label>
                  <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg border border-[var(--border)] focus:outline-none focus:border-[var(--primary)] text-sm bg-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Hora *</label>
                  <input type="time" value={newTime} onChange={e => setNewTime(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg border border-[var(--border)] focus:outline-none focus:border-[var(--primary)] text-sm bg-white" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Barbero *</label>
                <select value={newBarberId} onChange={e => setNewBarberId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-[var(--border)] text-sm bg-white">
                  {barbers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Servicio *</label>
                <select value={newServiceId} onChange={e => setNewServiceId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-[var(--border)] text-sm bg-white">
                  {services.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.duration}min - {formatPrice(s.price)})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Nombre del cliente *</label>
                <input type="text" value={newClientName} onChange={e => setNewClientName(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-[var(--border)] focus:outline-none focus:border-[var(--primary)] text-sm bg-white"
                  placeholder="Ej: Juan Perez" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">WhatsApp (opcional)</label>
                <input type="tel" value={newClientPhone} onChange={e => setNewClientPhone(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-[var(--border)] focus:outline-none focus:border-[var(--primary)] text-sm bg-white"
                  placeholder="1155667788" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowNewForm(false)}
                className="flex-1 py-2.5 border border-[var(--border)] rounded-lg font-medium hover:bg-gray-50 transition-colors text-sm">Cancelar</button>
              <button onClick={createAppointment}
                disabled={actionLoading || !newDate || !newTime || !newBarberId || !newServiceId || !newClientName.trim()}
                className="flex-1 py-2.5 bg-[var(--primary)] text-white rounded-lg font-medium hover:bg-[var(--primary-dark)] transition-colors disabled:opacity-50 text-sm">
                {actionLoading ? 'Creando...' : 'Crear turno'}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedApt && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-xl w-full sm:max-w-sm p-5 sm:p-6 max-h-[90dvh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Detalle del turno</h3>
              <button onClick={() => setSelectedApt(null)}><X className="w-5 h-5 text-[var(--muted)]" /></button>
            </div>
            <div className="space-y-3 text-sm">
              {([
                ['Cliente', selectedApt.client_name || 'Sin nombre'],
                ['Servicio', selectedApt.services?.name || '-'],
                ['Barbero', selectedApt.barbers?.name || '-'],
                ['Horario', `${selectedApt.start_time.slice(0, 5)} - ${selectedApt.end_time.slice(0, 5)}`],
              ] as [string, string][]).map(([label, value]) => (
                <div key={label} className="flex justify-between">
                  <span className="text-[var(--muted)]">{label}</span>
                  <span className="font-medium">{value}</span>
                </div>
              ))}
              {selectedApt.client_phone && (
                <div className="flex justify-between items-center">
                  <span className="text-[var(--muted)]">WhatsApp</span>
                  <a href={`https://wa.me/549${selectedApt.client_phone}`} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[var(--primary)] hover:underline font-medium">
                    <Phone className="w-3 h-3" />{selectedApt.client_phone}
                  </a>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-[var(--muted)]">Estado</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${statusColor(selectedApt, now)}`}>
                  {statusLabel(selectedApt, now)}
                </span>
              </div>
            </div>
            {(selectedApt.status === 'confirmed' || selectedApt.status === 'pending' || selectedApt.status === 'pending_payment') && (
              <div className="mt-6 space-y-2">
                <button onClick={() => updateStatus(selectedApt.id, 'completed')} disabled={actionLoading}
                  className="w-full flex items-center justify-center gap-2 py-2 bg-green-500 text-white rounded-lg font-medium hover:bg-green-600 transition-colors disabled:opacity-50">
                  <Check className="w-4 h-4" /> Marcar como completado
                </button>
                <button onClick={() => updateStatus(selectedApt.id, 'no_show')} disabled={actionLoading}
                  className="w-full flex items-center justify-center gap-2 py-2 bg-orange-500 text-white rounded-lg font-medium hover:bg-orange-600 transition-colors disabled:opacity-50">
                  <Ban className="w-4 h-4" /> No se presento
                </button>
                <button onClick={() => updateStatus(selectedApt.id, 'cancelled')} disabled={actionLoading}
                  className="w-full flex items-center justify-center gap-2 py-2 border border-red-300 text-red-600 rounded-lg font-medium hover:bg-red-50 transition-colors disabled:opacity-50">
                  <X className="w-4 h-4" /> Cancelar turno
                </button>
              </div>
            )}
            {selectedApt.status === 'completed' && (
              <p className="mt-4 text-center text-sm text-green-600 font-medium">Turno completado</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

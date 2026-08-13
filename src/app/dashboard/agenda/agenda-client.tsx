'use client'

import { useState, useEffect, useCallback } from 'react'
import { Barber, Service } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { Plus, X, Check, Ban, Phone, ChevronLeft, ChevronRight } from 'lucide-react'
import { formatPrice } from '@/lib/utils'
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
  date: string
  start_time: string
  end_time: string
  status: string
  client_name: string | null
  client_phone: string | null
  barbers: { name: string } | null
  services: { name: string; price: number; duration: number } | null
}

interface Props {
  barbershopId: string
  timezone: string
  barbers: Barber[]
  services: Service[]
}

const DAY_START = 8
const DAY_END = 22
const HOUR_PX = 64

function toMin(t: string) {
  const parts = t.split(':').map(Number)
  return parts[0] * 60 + (parts[1] || 0)
}

function layoutDayAppointments(apts: AppointmentData[]) {
  if (apts.length === 0) return []
  const sorted = [...apts].sort((a, b) => toMin(a.start_time) - toMin(b.start_time))
  const colEnds: number[] = []
  const colOf: number[] = new Array(sorted.length).fill(0)
  for (let i = 0; i < sorted.length; i++) {
    const start = toMin(sorted[i].start_time)
    let col = colEnds.findIndex(end => end <= start)
    if (col === -1) col = colEnds.length
    colOf[i] = col
    colEnds[col] = toMin(sorted[i].end_time)
  }
  return sorted.map((apt, i) => {
    const start = toMin(apt.start_time)
    const end = toMin(apt.end_time)
    let maxCol = colOf[i]
    for (let j = 0; j < sorted.length; j++) {
      if (j === i) continue
      const oStart = toMin(sorted[j].start_time)
      const oEnd = toMin(sorted[j].end_time)
      if (start < oEnd && end > oStart) maxCol = Math.max(maxCol, colOf[j])
    }
    return { apt, col: colOf[i], maxCols: maxCol + 1 }
  })
}

function statusColor(status: string) {
  switch (status) {
    case 'completed': return 'bg-green-100 border-green-200 text-green-800'
    case 'no_show': return 'bg-red-100 border-red-200 text-red-800'
    case 'pending_payment': return 'bg-yellow-100 border-yellow-200 text-yellow-800'
    case 'cancelled': return 'bg-gray-100 border-gray-200 text-gray-400'
    default: return 'bg-purple-100 border-purple-200 text-purple-800'
  }
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    confirmed: 'Confirmado', completed: 'Completado', pending: 'Pendiente',
    pending_payment: 'Pago pendiente', no_show: 'No se presentó', cancelled: 'Cancelado',
  }
  return map[status] || status
}

function DayView({ appointments, date, timezone, onSelect }: {
  appointments: AppointmentData[]
  date: LocalDate
  timezone: string
  onSelect: (apt: AppointmentData) => void
}) {
  const isCurrentDay = isLocalDateToday(date, timezone)
  const currentMin = getBarbershopCurrentMinutes(timezone)
  const startMin = DAY_START * 60
  const totalHours = DAY_END - DAY_START
  const dayApts = appointments.filter(
    a => a.date === date && a.status !== 'cancelled'
  )
  const laid = layoutDayAppointments(dayApts)

  return (
    <div className="bg-white rounded-xl border border-[var(--border)] overflow-hidden">
      <div className={`px-4 py-3 border-b ${isCurrentDay ? 'bg-purple-50 border-purple-100' : 'border-[var(--border)]'}`}>
        <div className="flex items-center gap-2">
          <p className={`font-semibold capitalize ${isCurrentDay ? 'text-purple-700' : 'text-gray-800'}`}>
            {formatLocalDate(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
          {isCurrentDay && (
            <span className="text-xs bg-purple-600 text-white px-2 py-0.5 rounded-full font-medium">Hoy</span>
          )}
        </div>
        <p className="text-sm text-[var(--muted)] mt-0.5">
          {dayApts.length === 0 ? 'Sin turnos' : `${dayApts.length} turno${dayApts.length !== 1 ? 's' : ''}`}
        </p>
      </div>
      <div className="overflow-y-auto" style={{ maxHeight: '620px' }}>
        <div className="flex">
          <div className="w-12 flex-shrink-0 relative select-none" style={{ height: `${totalHours * HOUR_PX}px` }}>
            {Array.from({ length: totalHours + 1 }, (_, i) => (
              <div key={i} className="absolute right-0 pr-2 flex items-center"
                style={{ top: `${i * HOUR_PX - 8}px`, height: '16px' }}>
                <span className="text-xs text-gray-400 leading-none">
                  {(DAY_START + i).toString().padStart(2, '0')}:00
                </span>
              </div>
            ))}
          </div>
          <div className="relative flex-1 border-l border-gray-100" style={{ height: `${totalHours * HOUR_PX}px` }}>
            {Array.from({ length: totalHours + 1 }, (_, i) => (
              <div key={i} className="absolute left-0 right-0 border-t border-gray-100" style={{ top: `${i * HOUR_PX}px` }} />
            ))}
            {Array.from({ length: totalHours }, (_, i) => (
              <div key={`h${i}`} className="absolute left-0 right-0 border-t border-gray-50" style={{ top: `${(i + 0.5) * HOUR_PX}px` }} />
            ))}
            {isCurrentDay && currentMin >= startMin && currentMin < DAY_END * 60 && (
              <div className="absolute left-0 right-0 z-20 pointer-events-none flex items-center"
                style={{ top: `${((currentMin - startMin) / 60) * HOUR_PX}px` }}>
                <div className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0 -ml-1" />
                <div className="flex-1 border-t-2 border-red-400" />
              </div>
            )}
            {laid.map(({ apt, col, maxCols }) => {
              const aptStart = toMin(apt.start_time)
              const aptEnd = toMin(apt.end_time)
              const top = ((aptStart - startMin) / 60) * HOUR_PX
              const height = Math.max(((aptEnd - aptStart) / 60) * HOUR_PX - 2, 28)
              return (
                <button key={apt.id} onClick={() => onSelect(apt)}
                  className={`absolute rounded-lg px-2 py-1 text-left text-xs overflow-hidden border transition-all hover:brightness-95 active:scale-[0.99] shadow-sm ${statusColor(apt.status)}`}
                  style={{
                    top: `${top}px`, height: `${height}px`,
                    left: `${(col / maxCols) * 100}%`,
                    width: `calc(${(1 / maxCols) * 100}% - 4px)`,
                    marginLeft: '2px',
                  }}>
                  <p className="font-bold leading-tight">{apt.start_time.slice(0, 5)} - {apt.end_time.slice(0, 5)}</p>
                  {height > 32 && <p className="truncate leading-tight mt-0.5">{apt.client_name || 'Sin nombre'}</p>}
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

function WeekView({ appointments, currentDate, timezone, onSelect, onDayClick }: {
  appointments: AppointmentData[]
  currentDate: LocalDate
  timezone: string
  onSelect: (apt: AppointmentData) => void
  onDayClick: (d: LocalDate) => void
}) {
  const weekStart = getWeekStartLocalDate(currentDate, 1)
  const days = Array.from({ length: 7 }, (_, i) => addCalendarDays(weekStart, i))
  return (
    <div className="overflow-x-auto">
      <div className="grid grid-cols-7 gap-2 min-w-[700px]">
        {days.map(day => {
          const dateStr = day
          const dayApts = appointments.filter(a => a.date === dateStr && a.status !== 'cancelled')
          const isCurrentDay = isLocalDateToday(day, timezone)
          return (
            <div key={dateStr} className={`bg-white rounded-xl border min-h-[160px] ${isCurrentDay ? 'border-purple-400 ring-1 ring-purple-200/50' : 'border-[var(--border)]'}`}>
              <button onClick={() => onDayClick(day)}
                className={`w-full py-2.5 px-2 text-center border-b flex flex-col items-center gap-0.5 hover:bg-gray-50 transition-colors rounded-t-xl ${isCurrentDay ? 'border-purple-100' : 'border-[var(--border)]'}`}>
                <span className={`text-xs font-medium capitalize ${isCurrentDay ? 'text-purple-600' : 'text-[var(--muted)]'}`}>
                  {formatLocalDate(day, { weekday: 'short' })}
                </span>
                <span className={`w-8 h-8 flex items-center justify-center rounded-full text-sm font-bold ${isCurrentDay ? 'bg-purple-600 text-white' : 'text-gray-700 hover:bg-gray-100'}`}>
                  {formatLocalDate(day, { day: 'numeric' })}
                </span>
              </button>
              <div className="p-1.5 space-y-1">
                {dayApts.length === 0 ? (
                  <p className="text-xs text-center text-gray-300 py-4">-</p>
                ) : (
                  <>
                    {dayApts.slice(0, 7).map(apt => (
                      <button key={apt.id} onClick={() => onSelect(apt)}
                        className={`w-full text-left text-xs px-2 py-1.5 rounded-lg border transition-all hover:brightness-95 ${statusColor(apt.status)}`}>
                        <span className="font-bold">{apt.start_time.slice(0, 5)}</span>
                        <span className="ml-1 truncate block leading-tight">{apt.client_name || '?'}</span>
                      </button>
                    ))}
                    {dayApts.length > 7 && (
                      <button onClick={() => onDayClick(day)} className="w-full text-xs text-center text-purple-500 hover:text-purple-700 py-1 font-medium">
                        +{dayApts.length - 7} mas
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

function MonthView({ appointments, currentDate, timezone, onDayClick }: {
  appointments: AppointmentData[]
  currentDate: LocalDate
  timezone: string
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
          <div key={d} className={`py-2.5 text-center text-xs font-semibold uppercase tracking-wide ${i >= 5 ? 'text-purple-400' : 'text-[var(--muted)]'}`}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {allDays.map(day => {
          const dateStr = day
          const dayApts = appointments.filter(a => a.date === dateStr && a.status !== 'cancelled')
          const inMonth = day.slice(0, 7) === currentDate.slice(0, 7)
          const isCurrentDay = isLocalDateToday(day, timezone)
          const dow = getLocalDateDayOfWeek(day)
          const isWeekend = dow === 0 || dow === 6
          return (
            <button key={dateStr} onClick={() => onDayClick(day)}
              className={`min-h-[90px] p-2 border-b border-r border-gray-50 text-left transition-colors hover:bg-purple-50/50 ${!inMonth ? 'opacity-30' : ''} ${isCurrentDay ? 'bg-purple-50/30' : ''}`}>
              <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-semibold mb-1 ${isCurrentDay ? 'bg-purple-600 text-white' : isWeekend && inMonth ? 'text-purple-500' : 'text-gray-700'}`}>
                {formatLocalDate(day, { day: 'numeric' })}
              </span>
              {dayApts.length > 0 && (
                <div className="space-y-0.5">
                  {dayApts.slice(0, 3).map(apt => (
                    <div key={apt.id} className={`text-xs px-1.5 py-0.5 rounded truncate ${apt.status === 'completed' ? 'bg-green-100 text-green-700' : apt.status === 'no_show' ? 'bg-red-100 text-red-700' : 'bg-purple-100 text-purple-700'}`}>
                      {apt.start_time.slice(0, 5)} {apt.client_name || '?'}
                    </div>
                  ))}
                  {dayApts.length > 3 && <div className="text-xs text-gray-400 pl-1">+{dayApts.length - 3} mas</div>}
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function AgendaClient({ barbershopId, timezone, barbers, services }: Props) {
  const [view, setView] = useState<View>('day')
  const [currentDate, setCurrentDate] = useState<LocalDate>(() => getBarbershopToday(timezone))
  const [appointments, setAppointments] = useState<AppointmentData[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [selectedApt, setSelectedApt] = useState<AppointmentData | null>(null)
  const [showNewForm, setShowNewForm] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [newDate, setNewDate] = useState('')
  const [newTime, setNewTime] = useState('09:00')
  const [newBarberId, setNewBarberId] = useState(barbers[0]?.id || '')
  const [newServiceId, setNewServiceId] = useState(services[0]?.id || '')
  const [newClientName, setNewClientName] = useState('')
  const [newClientPhone, setNewClientPhone] = useState('')

  const fetchAppointments = useCallback(async () => {
    setLoadingData(true)
    const supabase = createClient()
    let from: LocalDate, to: LocalDate
    if (view === 'day') { from = currentDate; to = currentDate }
    else if (view === 'week') { from = getWeekStartLocalDate(currentDate, 1); to = getWeekEndLocalDate(currentDate, 1) }
    else { from = getMonthStartLocalDate(currentDate); to = getMonthEndLocalDate(currentDate) }
    const { data } = await supabase
      .from('appointments')
      .select('*, barbers(name), services(name, price, duration)')
      .eq('barbershop_id', barbershopId)
      .gte('date', from)
      .lte('date', to)
      .order('date').order('start_time')
    setAppointments(data || [])
    setLoadingData(false)
  }, [view, currentDate, barbershopId])

  useEffect(() => {
    const timeoutId = window.setTimeout(fetchAppointments, 0)
    return () => window.clearTimeout(timeoutId)
  }, [fetchAppointments])

  function navigate(dir: 1 | -1) {
    if (view === 'day') setCurrentDate(d => addCalendarDays(d, dir))
    else if (view === 'week') setCurrentDate(d => addCalendarDays(d, dir * 7))
    else setCurrentDate(d => addCalendarMonths(d, dir))
  }

  function goToday() { setCurrentDate(getBarbershopToday(timezone)) }

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
    } else if (error) {
      window.alert('No se pudo crear el turno. RevisÃ¡ los datos e intentÃ¡ nuevamente.')
    } else if (!error) {
      setShowNewForm(false); setNewClientName(''); setNewClientPhone(''); fetchAppointments()
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
      fetchAppointments()
    }
    setActionLoading(false)
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Agenda</h1>
        <div className="flex items-center gap-2">
          <div className="flex bg-gray-100 rounded-lg p-1 text-sm">
            {(['day', 'week', 'month'] as View[]).map(v => (
              <button key={v} onClick={() => setView(v)}
                className={`px-3 py-1.5 rounded-md font-medium transition-all ${view === v ? 'bg-white shadow-sm text-[var(--primary)]' : 'text-gray-500 hover:text-gray-700'}`}>
                {v === 'day' ? 'Dia' : v === 'week' ? 'Semana' : 'Mes'}
              </button>
            ))}
          </div>
          <button onClick={() => { setNewDate(currentDate); setShowNewForm(true) }}
            className="flex items-center gap-2 px-4 py-2 bg-[var(--primary)] text-white rounded-lg font-medium hover:bg-[var(--primary-dark)] transition-colors">
            <Plus className="w-4 h-4" /> Nuevo turno
          </button>
        </div>
      </div>

      <div className="mb-4 flex items-center gap-2">
        <button onClick={() => navigate(-1)} className="p-2 rounded-lg border border-[var(--border)] hover:bg-gray-50 transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button onClick={() => navigate(1)} className="p-2 rounded-lg border border-[var(--border)] hover:bg-gray-50 transition-colors">
          <ChevronRight className="w-4 h-4" />
        </button>
        <span className="font-semibold capitalize text-gray-800 flex-1 ml-1">{getNavLabel()}</span>
        {loadingData && <span className="text-xs text-[var(--muted)] animate-pulse">Cargando...</span>}
        <button onClick={goToday}
          className={`px-3 py-1.5 text-sm border rounded-lg font-medium transition-colors ${isLocalDateToday(currentDate, timezone) && view === 'day' ? 'border-purple-300 text-purple-600 bg-purple-50' : 'border-[var(--border)] text-gray-600 hover:bg-gray-50'}`}>
          Hoy
        </button>
      </div>

      {view === 'day' && <DayView appointments={appointments} date={currentDate} timezone={timezone} onSelect={setSelectedApt} />}
      {view === 'week' && <WeekView appointments={appointments} currentDate={currentDate} timezone={timezone} onSelect={setSelectedApt} onDayClick={d => { setCurrentDate(d); setView('day') }} />}
      {view === 'month' && <MonthView appointments={appointments} currentDate={currentDate} timezone={timezone} onDayClick={d => { setCurrentDate(d); setView('day') }} />}

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
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${statusColor(selectedApt.status)}`}>
                  {statusLabel(selectedApt.status)}
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

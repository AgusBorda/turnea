'use client'

import { useState } from 'react'
import { Barber, Service } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Plus, X, Check, Ban, Phone } from 'lucide-react'
import { formatPrice } from '@/lib/utils'

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

interface DayData {
  date: string
  label: string
  isToday: boolean
  appointments: AppointmentData[]
}

interface Props {
  barbershopId: string
  days: DayData[]
  barbers: Barber[]
  services: Service[]
  weekLabel: string
}

export default function AgendaClient({ barbershopId, days, barbers, services, weekLabel }: Props) {
  const router = useRouter()
  const [showNewForm, setShowNewForm] = useState(false)
  const [selectedApt, setSelectedApt] = useState<AppointmentData | null>(null)
  const [loading, setLoading] = useState(false)

  // New appointment form state
  const [newDate, setNewDate] = useState('')
  const [newTime, setNewTime] = useState('09:00')
  const [newBarberId, setNewBarberId] = useState(barbers[0]?.id || '')
  const [newServiceId, setNewServiceId] = useState(services[0]?.id || '')
  const [newClientName, setNewClientName] = useState('')
  const [newClientPhone, setNewClientPhone] = useState('')

  async function createAppointment() {
    if (!newDate || !newTime || !newBarberId || !newServiceId || !newClientName.trim()) return
    setLoading(true)

    const service = services.find(s => s.id === newServiceId)
    if (!service) return

    const [hours, minutes] = newTime.split(':').map(Number)
    const startMinutes = hours * 60 + minutes
    const endMinutes = startMinutes + service.duration
    const endHours = Math.floor(endMinutes / 60)
    const endMins = endMinutes % 60
    const endTime = `${String(endHours).padStart(2, '0')}:${String(endMins).padStart(2, '0')}:00`

    const supabase = createClient()
    const { error } = await supabase
      .from('appointments')
      .insert({
        barbershop_id: barbershopId,
        barber_id: newBarberId,
        service_id: newServiceId,
        date: newDate,
        start_time: `${newTime}:00`,
        end_time: endTime,
        status: 'confirmed',
        client_name: newClientName.trim(),
        client_phone: newClientPhone.trim() || null,
      })

    if (!error) {
      setShowNewForm(false)
      setNewClientName('')
      setNewClientPhone('')
      router.refresh()
    }

    setLoading(false)
  }

  async function updateStatus(id: string, status: string) {
    setLoading(true)
    const supabase = createClient()

    const updateData: Record<string, unknown> = { status }
    if (status === 'cancelled') {
      updateData.cancelled_at = new Date().toISOString()
      updateData.cancelled_by = 'owner'
    }

    await supabase
      .from('appointments')
      .update(updateData)
      .eq('id', id)

    setSelectedApt(null)
    setLoading(false)
    router.refresh()
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Agenda</h1>
          <p className="text-[var(--muted)]">Semana del {weekLabel}</p>
        </div>
        <button
          onClick={() => setShowNewForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-[var(--primary)] text-white rounded-lg font-medium hover:bg-[var(--primary-dark)] transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nuevo turno
        </button>
      </div>

      {/* Weekly grid */}
      <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
        {days.map(day => (
          <div
            key={day.date}
            className={`bg-white rounded-xl border p-3 ${
              day.isToday ? 'border-[var(--primary)] ring-1 ring-[var(--primary)]/20' : 'border-[var(--border)]'
            }`}
          >
            <p className={`text-sm font-medium text-center capitalize mb-2 ${
              day.isToday ? 'text-[var(--primary)]' : 'text-[var(--muted)]'
            }`}>
              {day.label}
            </p>
            {day.appointments.filter(a => a.status !== 'cancelled').length === 0 ? (
              <p className="text-xs text-center text-gray-400 py-2">Sin turnos</p>
            ) : (
              <div className="space-y-1.5">
                {day.appointments
                  .filter(a => a.status !== 'cancelled')
                  .map(apt => (
                  <button
                    key={apt.id}
                    onClick={() => setSelectedApt(apt)}
                    className={`w-full text-left text-xs p-2 rounded-lg transition-all hover:ring-1 hover:ring-[var(--primary)]/30 ${
                      apt.status === 'completed'
                        ? 'bg-green-50 border border-green-100'
                        : apt.status === 'no_show'
                        ? 'bg-red-50 border border-red-100'
                        : 'bg-blue-50 border border-blue-100'
                    }`}
                  >
                    <p className="font-medium">{apt.start_time.slice(0, 5)}</p>
                    <p className="text-gray-600 truncate">{apt.client_name || 'Sin nombre'}</p>
                    <p className="text-gray-400 truncate">{apt.services?.name}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* New appointment modal */}
      {showNewForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Nuevo turno manual</h3>
              <button onClick={() => setShowNewForm(false)}>
                <X className="w-5 h-5 text-[var(--muted)]" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Fecha *</label>
                  <input
                    type="date"
                    value={newDate}
                    onChange={e => setNewDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] focus:outline-none focus:border-[var(--primary)]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Hora *</label>
                  <input
                    type="time"
                    value={newTime}
                    onChange={e => setNewTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] focus:outline-none focus:border-[var(--primary)]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Barbero *</label>
                <select
                  value={newBarberId}
                  onChange={e => setNewBarberId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border)] focus:outline-none focus:border-[var(--primary)]"
                >
                  {barbers.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Servicio *</label>
                <select
                  value={newServiceId}
                  onChange={e => setNewServiceId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border)] focus:outline-none focus:border-[var(--primary)]"
                >
                  {services.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.duration}min - {formatPrice(s.price)})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Nombre del cliente *</label>
                <input
                  type="text"
                  value={newClientName}
                  onChange={e => setNewClientName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border)] focus:outline-none focus:border-[var(--primary)]"
                  placeholder="Ej: Juan Pérez"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">WhatsApp (opcional)</label>
                <input
                  type="tel"
                  value={newClientPhone}
                  onChange={e => setNewClientPhone(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border)] focus:outline-none focus:border-[var(--primary)]"
                  placeholder="1155667788"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowNewForm(false)}
                className="flex-1 py-2 border border-[var(--border)] rounded-lg font-medium hover:bg-[var(--secondary)] transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={createAppointment}
                disabled={loading || !newDate || !newTime || !newBarberId || !newServiceId || !newClientName.trim()}
                className="flex-1 py-2 bg-[var(--primary)] text-white rounded-lg font-medium hover:bg-[var(--primary-dark)] transition-colors disabled:opacity-50"
              >
                {loading ? 'Creando...' : 'Crear turno'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Appointment detail modal */}
      {selectedApt && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Detalle del turno</h3>
              <button onClick={() => setSelectedApt(null)}>
                <X className="w-5 h-5 text-[var(--muted)]" />
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-[var(--muted)]">Cliente</span>
                <span className="font-medium">{selectedApt.client_name || 'Sin nombre'}</span>
              </div>
              {selectedApt.client_phone && (
                <div className="flex justify-between items-center">
                  <span className="text-[var(--muted)]">WhatsApp</span>
                  <a
                    href={`https://wa.me/549${selectedApt.client_phone}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[var(--primary)] hover:underline font-medium"
                  >
                    <Phone className="w-3 h-3" />
                    {selectedApt.client_phone}
                  </a>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-[var(--muted)]">Servicio</span>
                <span className="font-medium">{selectedApt.services?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--muted)]">Barbero</span>
                <span className="font-medium">{selectedApt.barbers?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--muted)]">Horario</span>
                <span className="font-medium">{selectedApt.start_time.slice(0, 5)} - {selectedApt.end_time.slice(0, 5)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--muted)]">Estado</span>
                <span className={`font-medium ${
                  selectedApt.status === 'completed' ? 'text-green-600' :
                  selectedApt.status === 'confirmed' ? 'text-blue-600' :
                  selectedApt.status === 'no_show' ? 'text-red-600' :
                  'text-yellow-600'
                }`}>
                  {selectedApt.status === 'confirmed' ? 'Confirmado' :
                   selectedApt.status === 'completed' ? 'Completado' :
                   selectedApt.status === 'pending' ? 'Pendiente' :
                   selectedApt.status === 'no_show' ? 'No se presentó' :
                   selectedApt.status}
                </span>
              </div>
            </div>

            {/* Actions */}
            {(selectedApt.status === 'confirmed' || selectedApt.status === 'pending') && (
              <div className="mt-6 space-y-2">
                <button
                  onClick={() => updateStatus(selectedApt.id, 'completed')}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-2 bg-green-500 text-white rounded-lg font-medium hover:bg-green-600 transition-colors disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  Marcar como completado
                </button>
                <button
                  onClick={() => updateStatus(selectedApt.id, 'no_show')}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-2 bg-orange-500 text-white rounded-lg font-medium hover:bg-orange-600 transition-colors disabled:opacity-50"
                >
                  <Ban className="w-4 h-4" />
                  No se presentó
                </button>
                <button
                  onClick={() => updateStatus(selectedApt.id, 'cancelled')}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-2 border border-red-300 text-red-600 rounded-lg font-medium hover:bg-red-50 transition-colors disabled:opacity-50"
                >
                  <X className="w-4 h-4" />
                  Cancelar turno
                </button>
              </div>
            )}

            {selectedApt.status === 'completed' && (
              <p className="mt-4 text-center text-sm text-green-600 font-medium">
                ✓ Turno completado
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

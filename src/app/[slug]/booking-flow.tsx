'use client'

import { useState } from 'react'
import { Barbershop, Barber, Service, TimeSlot } from '@/lib/types'
import { formatPrice, formatDuration } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { format, addDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { Check, ChevronLeft, Clock, User, Scissors, Calendar, CreditCard, Wallet } from 'lucide-react'

interface Props {
  barbershop: Barbershop
  barbers: Barber[]
  services: Service[]
  mpConfigured: boolean
}

type Step = 'service' | 'barber' | 'date' | 'time' | 'confirm'

export default function BookingFlow({ barbershop, barbers, services, mpConfigured }: Props) {
  const [step, setStep] = useState<Step>('service')
  const [selectedService, setSelectedService] = useState<Service | null>(null)
  const [selectedBarber, setSelectedBarber] = useState<Barber | null>(null)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedTime, setSelectedTime] = useState<string | null>(null)
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([])
  const [loading, setLoading] = useState(false)
  const [clientName, setClientName] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  const steps: Step[] = ['service', 'barber', 'date', 'time', 'confirm']
  const currentIndex = steps.indexOf(step)

  function goBack() {
    if (currentIndex > 0) {
      setStep(steps[currentIndex - 1])
    }
  }

  function selectService(service: Service) {
    setSelectedService(service)
    if (barbers.length === 1) {
      setSelectedBarber(barbers[0])
      setStep('date')
    } else {
      setStep('barber')
    }
  }

  function selectBarber(barber: Barber) {
    setSelectedBarber(barber)
    setStep('date')
  }

  async function selectDate(date: Date) {
    setSelectedDate(date)
    setLoading(true)
    setError('')

    try {
      const supabase = createClient()
      const dateStr = format(date, 'yyyy-MM-dd')

      // Fetch schedules for barber
      const { data: schedules } = await supabase
        .from('barber_schedules')
        .select('*')
        .eq('barber_id', selectedBarber!.id)

      // Fetch existing appointments for that date
      const { data: appointments } = await supabase
        .from('appointments')
        .select('*')
        .eq('barber_id', selectedBarber!.id)
        .eq('date', dateStr)
        .neq('status', 'cancelled')

      // Fetch blocked slots
      const { data: blockedSlots } = await supabase
        .from('blocked_slots')
        .select('*')
        .eq('barber_id', selectedBarber!.id)
        .eq('date', dateStr)

      // Generate available slots
      const { generateTimeSlots } = await import('@/lib/utils')
      const slots = generateTimeSlots(
        date,
        schedules || [],
        appointments || [],
        blockedSlots || [],
        barbershop.slot_duration,
        selectedService!.duration
      )

      setTimeSlots(slots)
      setStep('time')
    } catch {
      setError('Error al cargar horarios. Intentá de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  function selectTime(time: string) {
    setSelectedTime(time)
    setStep('confirm')
  }

  const requiresDeposit = barbershop.deposit_required && mpConfigured
  const depositAmount = requiresDeposit
    ? Math.round((selectedService?.price || 0) * barbershop.deposit_percentage / 100)
    : 0

  async function confirmBooking() {
    if (!clientName.trim() || !clientPhone.trim()) {
      setError('Completá tu nombre y WhatsApp.')
      return
    }

    setLoading(true)
    setError('')

    try {
      const dateStr = format(selectedDate!, 'yyyy-MM-dd')

      if (requiresDeposit) {
        // Flow with Mercado Pago deposit
        const res = await fetch('/api/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            barbershop_id: barbershop.id,
            barber_id: selectedBarber!.id,
            service_id: selectedService!.id,
            date: dateStr,
            start_time: selectedTime,
            client_name: clientName.trim(),
            client_phone: clientPhone.trim(),
          }),
        })

        const data = await res.json()
        if (!res.ok) {
          throw new Error(data.error || 'Error al procesar seña')
        }

        // Redirect to Mercado Pago
        window.location.href = data.init_point
        return
      }

      // Flow without deposit — direct booking
      const supabase = createClient()
      const [hours, minutes] = selectedTime!.split(':').map(Number)
      const startMinutes = hours * 60 + minutes
      const endMinutes = startMinutes + selectedService!.duration
      const endHours = Math.floor(endMinutes / 60)
      const endMins = endMinutes % 60
      const endTime = `${String(endHours).padStart(2, '0')}:${String(endMins).padStart(2, '0')}:00`

      const { error: aptError } = await supabase
        .from('appointments')
        .insert({
          barbershop_id: barbershop.id,
          barber_id: selectedBarber!.id,
          service_id: selectedService!.id,
          date: dateStr,
          start_time: `${selectedTime}:00`,
          end_time: endTime,
          status: 'confirmed',
          client_name: clientName.trim(),
          client_phone: clientPhone.trim(),
        })

      if (aptError) throw aptError

      setSuccess(true)
    } catch (err: any) {
      console.error('Booking error:', err)
      setError(err.message || 'Error al reservar. Intentá de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="bg-white rounded-xl p-8 text-center border border-[var(--border)]">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Check className="w-8 h-8 text-green-600" />
        </div>
        <h2 className="text-xl font-bold mb-2">¡Turno confirmado!</h2>
        <p className="text-[var(--muted)] mb-4">
          {selectedService?.name} con {selectedBarber?.name}
        </p>
        <div className="bg-[var(--secondary)] rounded-lg p-4 text-sm">
          <p className="font-medium">
            {selectedDate && format(selectedDate, "EEEE d 'de' MMMM", { locale: es })}
          </p>
          <p className="text-[var(--muted)]">{selectedTime} hs</p>
        </div>
        <p className="mt-4 text-sm text-[var(--muted)]">
          ¡Te esperamos, {clientName}!
        </p>
      </div>
    )
  }

  return (
    <div>
      {/* Progress */}
      <div className="flex items-center gap-1 mb-6">
        {steps.map((s, i) => (
          <div
            key={s}
            className={`h-1 flex-1 rounded-full transition-colors ${
              i <= currentIndex ? 'bg-[var(--primary)]' : 'bg-[var(--border)]'
            }`}
          />
        ))}
      </div>

      {/* Back button */}
      {currentIndex > 0 && (
        <button
          onClick={goBack}
          className="flex items-center gap-1 text-sm text-[var(--muted)] mb-4 hover:text-[var(--foreground)] transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Volver
        </button>
      )}

      {error && (
        <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3 mb-4">
          {error}
        </div>
      )}

      {/* Step: Service */}
      {step === 'service' && (
        <div>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Scissors className="w-5 h-5 text-[var(--primary)]" />
            Elegí un servicio
          </h2>
          <div className="space-y-3">
            {services.map(service => (
              <button
                key={service.id}
                onClick={() => selectService(service)}
                className="w-full text-left bg-white p-4 rounded-xl border border-[var(--border)] hover:border-[var(--primary)] hover:shadow-sm transition-all"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium">{service.name}</p>
                    {service.description && (
                      <p className="text-sm text-[var(--muted)] mt-0.5">{service.description}</p>
                    )}
                    <p className="text-xs text-[var(--muted)] mt-1 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDuration(service.duration)}
                    </p>
                  </div>
                  <span className="font-semibold text-[var(--primary)]">
                    {formatPrice(service.price)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step: Barber */}
      {step === 'barber' && (
        <div>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <User className="w-5 h-5 text-[var(--primary)]" />
            Elegí un barbero
          </h2>
          <div className="space-y-3">
            {barbers.map(barber => (
              <button
                key={barber.id}
                onClick={() => selectBarber(barber)}
                className="w-full text-left bg-white p-4 rounded-xl border border-[var(--border)] hover:border-[var(--primary)] hover:shadow-sm transition-all flex items-center gap-4"
              >
                {barber.photo_url ? (
                  <img src={barber.photo_url} alt={barber.name} className="w-12 h-12 rounded-full object-cover" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-[var(--primary)]/10 flex items-center justify-center">
                    <User className="w-6 h-6 text-[var(--primary)]" />
                  </div>
                )}
                <div>
                  <p className="font-medium">{barber.name}</p>
                  {barber.bio && <p className="text-sm text-[var(--muted)]">{barber.bio}</p>}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step: Date */}
      {step === 'date' && (
        <div>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-[var(--primary)]" />
            Elegí un día
          </h2>
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: barbershop.advance_booking_days }, (_, i) => {
              const date = addDays(new Date(), i + 1)
              return (
                <button
                  key={i}
                  onClick={() => selectDate(date)}
                  disabled={loading}
                  className="bg-white p-3 rounded-xl border border-[var(--border)] hover:border-[var(--primary)] hover:shadow-sm transition-all text-center disabled:opacity-50"
                >
                  <p className="text-xs text-[var(--muted)] capitalize">
                    {format(date, 'EEE', { locale: es })}
                  </p>
                  <p className="font-semibold text-lg">{format(date, 'd')}</p>
                  <p className="text-xs text-[var(--muted)]">
                    {format(date, 'MMM', { locale: es })}
                  </p>
                </button>
              )
            }).slice(0, barbershop.advance_booking_days)}
          </div>
          {loading && (
            <p className="text-center text-sm text-[var(--muted)] mt-4">Cargando horarios...</p>
          )}
        </div>
      )}

      {/* Step: Time */}
      {step === 'time' && (
        <div>
          <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
            <Clock className="w-5 h-5 text-[var(--primary)]" />
            Elegí un horario
          </h2>
          <p className="text-sm text-[var(--muted)] mb-4">
            {selectedDate && format(selectedDate, "EEEE d 'de' MMMM", { locale: es })}
          </p>
          {timeSlots.length === 0 ? (
            <div className="bg-white rounded-xl p-6 text-center border border-[var(--border)]">
              <p className="text-[var(--muted)]">No hay horarios disponibles este día.</p>
              <button
                onClick={goBack}
                className="mt-3 text-sm text-[var(--primary)] font-medium hover:underline"
              >
                Elegir otro día
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {timeSlots.map(slot => (
                <button
                  key={slot.time}
                  onClick={() => slot.available && selectTime(slot.time)}
                  disabled={!slot.available}
                  className={`p-2.5 rounded-lg text-sm font-medium transition-all ${
                    slot.available
                      ? 'bg-white border border-[var(--border)] hover:border-[var(--primary)] hover:bg-[var(--primary)]/5'
                      : 'bg-gray-100 text-gray-400 cursor-not-allowed line-through'
                  }`}
                >
                  {slot.time}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Step: Confirm */}
      {step === 'confirm' && (
        <div>
          <h2 className="text-lg font-semibold mb-4">Confirmá tu turno</h2>

          {/* Resumen */}
          <div className="bg-white rounded-xl p-4 border border-[var(--border)] mb-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-[var(--muted)]">Servicio</span>
              <span className="font-medium">{selectedService?.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--muted)]">Barbero</span>
              <span className="font-medium">{selectedBarber?.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--muted)]">Día</span>
              <span className="font-medium capitalize">
                {selectedDate && format(selectedDate, "EEE d MMM", { locale: es })}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--muted)]">Hora</span>
              <span className="font-medium">{selectedTime} hs</span>
            </div>
            <div className="flex justify-between border-t border-[var(--border)] pt-2 mt-2">
              <span className="text-[var(--muted)]">Precio total</span>
              <span className="font-bold text-[var(--primary)]">
                {selectedService && formatPrice(selectedService.price)}
              </span>
            </div>
            {requiresDeposit && (
              <div className="flex justify-between bg-[var(--primary)]/5 -mx-4 px-4 py-2 rounded-b-xl">
                <span className="text-[var(--primary)] font-medium flex items-center gap-1">
                  <CreditCard className="w-3.5 h-3.5" />
                  Seña requerida ({barbershop.deposit_percentage}%)
                </span>
                <span className="font-bold text-[var(--primary)]">
                  {formatPrice(depositAmount)}
                </span>
              </div>
            )}
          </div>

          {/* Datos del cliente */}
          <div className="space-y-3 mb-4">
            <input
              type="text"
              placeholder="Tu nombre *"
              value={clientName}
              onChange={e => setClientName(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-[var(--border)] focus:outline-none focus:border-[var(--primary)] transition-colors"
            />
            <input
              type="tel"
              placeholder="Tu WhatsApp (ej: 1155667788) *"
              value={clientPhone}
              onChange={e => setClientPhone(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-[var(--border)] focus:outline-none focus:border-[var(--primary)] transition-colors"
            />
          </div>

          {requiresDeposit ? (
            <div className="space-y-3">
              <button
                onClick={confirmBooking}
                disabled={loading || !clientName.trim() || !clientPhone.trim()}
                className="w-full py-3.5 bg-[var(--primary)] text-white font-semibold rounded-xl hover:bg-[var(--primary-dark)] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <CreditCard className="w-4 h-4" />
                {loading ? 'Procesando...' : `Señar con Mercado Pago — ${formatPrice(depositAmount)}`}
              </button>
              <p className="text-xs text-center text-[var(--muted)]">
                La dirección del local se muestra tras confirmar el pago.
              </p>
            </div>
          ) : (
            <button
              onClick={confirmBooking}
              disabled={loading || !clientName.trim() || !clientPhone.trim()}
              className="w-full py-3 bg-[var(--primary)] text-white font-semibold rounded-xl hover:bg-[var(--primary-dark)] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Wallet className="w-4 h-4" />
              {loading ? 'Reservando...' : 'Confirmar turno'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

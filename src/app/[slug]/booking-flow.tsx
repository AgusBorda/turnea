'use client'

import { useCallback, useRef, useState } from 'react'
import { Barbershop, PublicBarber, PublicService, TimeSlot } from '@/lib/types'
import { formatPrice, formatDuration } from '@/lib/utils'
import {
  addCalendarDays,
  formatLocalDate,
  getBarbershopToday,
  isLocalSlotInPast,
  LocalDate,
} from '@/lib/datetime'
import { useMinuteNow } from '@/hooks/use-minute-now'
import { createClient } from '@/lib/supabase/client'
import { Check, ChevronLeft, Clock, User, Scissors, Calendar, CreditCard, Wallet } from 'lucide-react'
import type { PaymentQuote } from '@/lib/payments/payment-quote'

type BookingBarbershop = Pick<
  Barbershop,
  'id' | 'slot_duration' | 'deposit_required' | 'deposit_percentage' | 'advance_booking_days' | 'timezone'
>

interface Props {
  barbershop: BookingBarbershop
  barbers: PublicBarber[]
  services: PublicService[]
}

type Step = 'service' | 'barber' | 'date' | 'time' | 'confirm'

export default function BookingFlow({ barbershop, barbers, services }: Props) {
  const [step, setStep] = useState<Step>('service')
  const [selectedService, setSelectedService] = useState<PublicService | null>(null)
  const [selectedBarber, setSelectedBarber] = useState<PublicBarber | null>(null)
  const [selectedDate, setSelectedDate] = useState<LocalDate | null>(null)
  const [selectedTime, setSelectedTime] = useState<string | null>(null)
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([])
  const [loading, setLoading] = useState(false)
  const [clientName, setClientName] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const [paymentQuote, setPaymentQuote] = useState<PaymentQuote | null>(null)
  const [quoteLoading, setQuoteLoading] = useState(false)
  const [quoteError, setQuoteError] = useState('')
  const quoteRequestId = useRef(0)

  const synchronizeSelection = useCallback((currentNow: Date) => {
    if (!selectedDate) return

    const currentToday = getBarbershopToday(barbershop.timezone, currentNow)
    if (selectedDate < currentToday) {
      setSelectedDate(currentToday)
      setSelectedTime(null)
      setTimeSlots([])
      setStep('date')
      setError('El día seleccionado ya pasó. Elegí una nueva fecha.')
      return
    }

    if (
      selectedTime
      && isLocalSlotInPast(
        selectedDate,
        `${selectedTime}:00`,
        barbershop.timezone,
        currentNow
      )
    ) {
      setSelectedTime(null)
      setStep('time')
      setError('El horario seleccionado ya pasó. Elegí otro disponible.')
    }
  }, [barbershop.timezone, selectedDate, selectedTime])

  const now = useMinuteNow(synchronizeSelection)

  const steps: Step[] = ['service', 'barber', 'date', 'time', 'confirm']
  const currentIndex = steps.indexOf(step)
  const today = now ? getBarbershopToday(barbershop.timezone, now) : null
  const visibleTimeSlots = selectedDate && now
    ? timeSlots.filter(slot => !isLocalSlotInPast(
        selectedDate,
        `${slot.time}:00`,
        barbershop.timezone,
        now
      ))
    : timeSlots

  function goBack() {
    if (currentIndex > 0) {
      setStep(steps[currentIndex - 1])
    }
  }

  async function loadPaymentQuote(serviceId: string) {
    const requestId = ++quoteRequestId.current
    setQuoteLoading(true)
    setQuoteError('')
    setPaymentQuote(null)

    try {
      const response = await fetch('/api/checkout/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          barbershop_id: barbershop.id,
          service_id: serviceId,
        }),
      })
      const result: PaymentQuote | { error?: string } = await response.json()

      if (!response.ok || !('depositRequired' in result)) {
        throw new Error(
          'error' in result && result.error
            ? result.error
            : 'No se pudo calcular el resumen de pago.'
        )
      }
      if (requestId === quoteRequestId.current) {
        setPaymentQuote(result)
      }
    } catch (quoteFailure) {
      if (requestId === quoteRequestId.current) {
        setQuoteError(
          quoteFailure instanceof Error
            ? quoteFailure.message
            : 'No pudimos calcular el pago. Intentá nuevamente.'
        )
      }
    } finally {
      if (requestId === quoteRequestId.current) {
        setQuoteLoading(false)
      }
    }
  }

  function selectService(service: PublicService) {
    setSelectedService(service)
    void loadPaymentQuote(service.id)
    if (barbers.length === 1) {
      setSelectedBarber(barbers[0])
      setStep('date')
    } else {
      setStep('barber')
    }
  }

  function selectBarber(barber: PublicBarber) {
    setSelectedBarber(barber)
    setStep('date')
  }

  async function selectDate(date: LocalDate) {
    setSelectedDate(date)
    setLoading(true)
    setError('')

    try {
      const supabase = createClient()
      // Fetch schedules for barber
      const { data: schedules } = await supabase
        .from('barber_schedules')
        .select('day_of_week, start_time, end_time, is_working')
        .eq('barber_id', selectedBarber!.id)

      // Fetch existing appointments for that date
      const { data: busySlots, error: busySlotsError } = await supabase.rpc(
        'get_public_busy_slots',
        {
          p_barbershop_id: barbershop.id,
          p_barber_id: selectedBarber!.id,
          p_date_from: date,
          p_date_to: date,
        }
      )

      if (busySlotsError) throw busySlotsError

      // Fetch blocked slots
      const { data: blockedSlots, error: blockedSlotsError } = await supabase.rpc(
        'get_public_blocked_slots',
        {
          p_barbershop_id: barbershop.id,
          p_barber_id: selectedBarber!.id,
          p_date_from: date,
          p_date_to: date,
        }
      )

      if (blockedSlotsError) throw blockedSlotsError

      // Generate available slots
      const { generateTimeSlots } = await import('@/lib/utils')
      const slots = generateTimeSlots(
        date,
        schedules || [],
        busySlots || [],
        blockedSlots || [],
        barbershop.timezone,
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

  const requiresDeposit = barbershop.deposit_required
  const paymentQuoteUnavailable = requiresDeposit && (
    quoteLoading || Boolean(quoteError) || paymentQuote === null
  )
  const formatPaymentAmount = (amount: number, currency: string) => new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)

  async function confirmBooking() {
    if (!clientName.trim() || !clientPhone.trim()) {
      setError('Completá tu nombre y WhatsApp.')
      return
    }

    setLoading(true)
    setError('')

    try {
      const dateStr = selectedDate!

      if (requiresDeposit) {
        if (!paymentQuote) {
          throw new Error('No se pudo verificar el importe del pago. Intentá nuevamente.')
        }
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
            // Consent snapshot only. Checkout/PostgreSQL recalculate every amount.
            quoted_payment: paymentQuote,
          }),
        })

        const data: {
          init_point?: string
          error?: string
          code?: string
          payment?: PaymentQuote
        } = await res.json()
        if (
          res.status === 409
          && data.code === 'PAYMENT_QUOTE_CHANGED'
          && data.payment
        ) {
          setPaymentQuote(data.payment)
          throw new Error('El importe cambió. Revisá el nuevo resumen y confirmá nuevamente.')
        }
        if (!res.ok) {
          throw new Error(data.error || 'Error al procesar seña')
        }
        if (!data.init_point) {
          throw new Error('Mercado Pago devolvió una respuesta inválida')
        }

        // Redirect to Mercado Pago
        window.location.href = data.init_point
        return
      }

      // Flow without deposit — direct booking
      const supabase = createClient()
      const { error: aptError } = await supabase.rpc('create_appointment_atomic', {
        p_barbershop_id: barbershop.id,
        p_barber_id: selectedBarber!.id,
        p_service_id: selectedService!.id,
        p_date: dateStr,
        p_start_time: `${selectedTime}:00`,
        p_client_name: clientName.trim(),
        p_client_phone: clientPhone.trim(),
      })

      if (aptError?.message.includes('SLOT_')) {
        throw new Error('Ese horario acaba de ser reservado. ElegÃ­ otro disponible.')
      }

      if (aptError?.message.includes('DST_')) {
        throw new Error('Ese horario no está disponible por un cambio de hora. Elegí otro horario.')
      }

      if (aptError) throw aptError

      setSuccess(true)
    } catch (err: unknown) {
      console.error('Booking error:', err)
      setError(err instanceof Error ? err.message : 'Error al reservar. Intentá de nuevo.')
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
            {selectedDate && formatLocalDate(selectedDate, {
              weekday: 'long', day: 'numeric', month: 'long',
            })}
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
            {today && Array.from({ length: barbershop.advance_booking_days }, (_, i) => {
              const date = addCalendarDays(today, i)
              return (
                <button
                  key={date}
                  onClick={() => selectDate(date)}
                  disabled={loading}
                  className="bg-white p-3 rounded-xl border border-[var(--border)] hover:border-[var(--primary)] hover:shadow-sm transition-all text-center disabled:opacity-50"
                >
                  <p className="text-xs text-[var(--muted)] capitalize">
                    {formatLocalDate(date, { weekday: 'short' })}
                  </p>
                  <p className="font-semibold text-lg">{formatLocalDate(date, { day: 'numeric' })}</p>
                  <p className="text-xs text-[var(--muted)]">
                    {formatLocalDate(date, { month: 'short' })}
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
            {selectedDate && formatLocalDate(selectedDate, {
              weekday: 'long', day: 'numeric', month: 'long',
            })}
          </p>
          {visibleTimeSlots.length === 0 ? (
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
              {visibleTimeSlots.map(slot => (
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
                {selectedDate && formatLocalDate(selectedDate, {
                  weekday: 'short', day: 'numeric', month: 'short',
                })}
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
          </div>

          {(requiresDeposit || quoteLoading || quoteError) && (
            <div className="mb-4 rounded-xl border border-[var(--border)] bg-white p-4">
              <div className="flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-[var(--primary)]" />
                <h3 className="text-sm font-semibold">Resumen de pago</h3>
              </div>
              {quoteLoading ? (
                <p className="mt-3 text-sm text-[var(--muted)]">Calculando importe seguro...</p>
              ) : quoteError ? (
                <div className="mt-3 text-sm">
                  <p className="text-red-600">{quoteError}</p>
                  <button
                    type="button"
                    onClick={() => selectedService && void loadPaymentQuote(selectedService.id)}
                    className="mt-2 font-medium text-[var(--primary)] hover:underline"
                  >
                    Reintentar cálculo
                  </button>
                </div>
              ) : paymentQuote?.depositRequired ? (
                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between gap-4">
                    <span className="text-[var(--muted)]">Seña</span>
                    <span>{formatPaymentAmount(paymentQuote.depositAmount, paymentQuote.currency)}</span>
                  </div>
                  {paymentQuote.processingFeeMode === 'customer_covers' && (
                    <div className="flex justify-between gap-4">
                      <span className="text-[var(--muted)]">Costo de procesamiento</span>
                      <span>{formatPaymentAmount(paymentQuote.processingFeeAmount, paymentQuote.currency)}</span>
                    </div>
                  )}
                  <div className="flex justify-between gap-4 border-t border-[var(--border)] pt-2 font-semibold">
                    <span>Total a pagar ahora</span>
                    <span className="text-[var(--primary)]">
                      {formatPaymentAmount(paymentQuote.paymentTotalAmount, paymentQuote.currency)}
                    </span>
                  </div>
                  {paymentQuote.processingFeeMode === 'customer_covers' && (
                    <p className="pt-1 text-xs text-[var(--muted)]">
                      El costo de procesamiento busca compensar aproximadamente los cargos asociados al pago online.
                    </p>
                  )}
                </div>
              ) : null}
            </div>
          )}

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
                disabled={
                  loading
                  || paymentQuoteUnavailable
                  || !clientName.trim()
                  || !clientPhone.trim()
                }
                className="w-full py-3.5 bg-[var(--primary)] text-white font-semibold rounded-xl hover:bg-[var(--primary-dark)] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <CreditCard className="w-4 h-4" />
                {loading
                  ? 'Procesando...'
                  : paymentQuote
                    ? `Pagar ${formatPaymentAmount(paymentQuote.paymentTotalAmount, paymentQuote.currency)} con Mercado Pago`
                    : 'Calculando pago...'}
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

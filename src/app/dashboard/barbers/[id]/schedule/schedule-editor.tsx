'use client'

import { useState } from 'react'
import { BarberSchedule } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Minus, Save } from 'lucide-react'
import Button from '@/components/ui/button'
import FormField from '@/components/ui/form-field'
import TimePicker from '@/components/ui/time-picker'
import { ToastViewport, useToast } from '@/components/ui/toast'

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const DAY_LABELS = ['D', 'L', 'M', 'X', 'J', 'V', 'S']

interface DaySchedule {
  day_of_week: number
  is_working: boolean
  start_time: string
  end_time: string
}

interface Props {
  barberId: string
  initialSchedules: BarberSchedule[]
}

export default function ScheduleEditor({ barberId, initialSchedules }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [selectedDay, setSelectedDay] = useState(1)
  const { toasts, showToast, dismissToast } = useToast()

  // Initialize schedule for all 7 days
  const [schedule, setSchedule] = useState<DaySchedule[]>(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const existing = initialSchedules.find(s => s.day_of_week === i)
      return {
        day_of_week: i,
        is_working: existing?.is_working ?? (i >= 1 && i <= 6), // default Mon-Sat
        start_time: existing?.start_time?.slice(0, 5) || '09:00',
        end_time: existing?.end_time?.slice(0, 5) || '20:00',
      }
    })
  })

  function updateDay(dayIndex: number, field: keyof DaySchedule, value: string | boolean) {
    setSchedule(prev =>
      prev.map(d => d.day_of_week === dayIndex ? { ...d, [field]: value } : d)
    )
    setSaved(false)
  }

  async function handleSave() {
    setLoading(true)
    setSaved(false)
    setErrorMessage(null)

    try {
      const invalidDay = schedule.find(day => (
        day.is_working && (!day.start_time || !day.end_time || day.start_time >= day.end_time)
      ))

      if (invalidDay) {
        setSelectedDay(invalidDay.day_of_week)
        setErrorMessage('El horario de inicio debe ser anterior al horario de fin.')
        return
      }

      const supabase = createClient()
      const { data, error } = await supabase.rpc('replace_barber_weekly_schedule', {
        p_barber_id: barberId,
        p_schedule: schedule.map(day => ({
          day_of_week: day.day_of_week,
          is_working: day.is_working,
          start_time: day.is_working ? day.start_time : null,
          end_time: day.is_working ? day.end_time : null,
        })),
      })

      if (error || data !== 7) {
        throw new Error(error?.message || 'WEEKLY_SCHEDULE_REPLACE_FAILED')
      }

      setSaved(true)
      showToast({ message: 'Horarios guardados', tone: 'success' })
      router.refresh()
    } catch {
      const message = 'No pudimos guardar los horarios. Revisalos e intentá nuevamente.'
      setErrorMessage(message)
      showToast({ message, tone: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const selectedSchedule = schedule.find(day => day.day_of_week === selectedDay)!

  return (
    <div>
      {saved && (
        <div className="bg-green-50 text-green-600 text-sm rounded-lg p-3 mb-4">
          ¡Horarios guardados!
        </div>
      )}

      <div className="grid grid-cols-7 gap-1.5" aria-label="Días de la semana">
        {schedule.map(day => (
          <button
            type="button"
            key={day.day_of_week}
            onClick={() => setSelectedDay(day.day_of_week)}
            aria-pressed={selectedDay === day.day_of_week}
            aria-label={`${DAY_NAMES[day.day_of_week]}, ${day.is_working ? 'atiende' : 'no atiende'}`}
            className={`relative flex min-h-10 min-w-0 flex-col items-center justify-center rounded-xl border text-sm font-bold transition-[border-color,background-color,color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 ${
              selectedDay === day.day_of_week
                ? 'border-[var(--primary)] bg-[var(--primary)] text-white shadow-sm'
                : day.is_working
                  ? 'border-purple-200 bg-purple-50/60 text-[var(--foreground)] hover:border-[var(--primary)]'
                  : 'border-[var(--border)] bg-white text-[var(--muted)] hover:bg-[var(--secondary)]'
            }`}
          >
            <span>{DAY_LABELS[day.day_of_week]}</span>
            <span className="mt-0.5 flex h-2 items-center justify-center" aria-hidden="true">
              {day.is_working
                ? <span className={`h-1.5 w-1.5 rounded-full ${selectedDay === day.day_of_week ? 'bg-white' : 'bg-[var(--primary)]'}`} />
                : <Minus className="h-2.5 w-2.5" />}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--secondary)]/60 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold">{DAY_NAMES[selectedDay]}</h3>
            <p className="mt-0.5 text-sm text-[var(--muted)]">Atiende este día</p>
          </div>

          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2">
            <span className="text-xs font-semibold text-[var(--muted)]">
              {selectedSchedule.is_working ? 'ON' : 'OFF'}
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={selectedSchedule.is_working}
              onChange={event => updateDay(selectedDay, 'is_working', event.target.checked)}
              className="peer sr-only"
              aria-label={`Atiende los ${DAY_NAMES[selectedDay].toLowerCase()}`}
            />
            <span
              aria-hidden="true"
              className="relative h-7 w-12 rounded-full bg-gray-300 transition-colors after:absolute after:left-1 after:top-1 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:bg-[var(--primary)] peer-checked:after:translate-x-5 peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--primary)] peer-focus-visible:ring-offset-2"
            />
          </label>
        </div>

        {selectedSchedule.is_working ? (
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <FormField label="Desde" htmlFor={`schedule-start-${selectedDay}`}>
              <TimePicker
                id={`schedule-start-${selectedDay}`}
                value={selectedSchedule.start_time}
                onChange={value => value && updateDay(selectedDay, 'start_time', value)}
                stepMinutes={15}
                required
                ariaLabel={`Horario de inicio del ${DAY_NAMES[selectedDay].toLowerCase()}`}
              />
            </FormField>
            <FormField label="Hasta" htmlFor={`schedule-end-${selectedDay}`}>
              <TimePicker
                id={`schedule-end-${selectedDay}`}
                value={selectedSchedule.end_time}
                onChange={value => value && updateDay(selectedDay, 'end_time', value)}
                stepMinutes={15}
                required
                ariaLabel={`Horario de fin del ${DAY_NAMES[selectedDay].toLowerCase()}`}
              />
            </FormField>
          </div>
        ) : (
          <p className="mt-5 rounded-lg border border-dashed border-[var(--border)] bg-white/70 p-4 text-sm text-[var(--muted)]">
            No atiende este día.
          </p>
        )}
      </div>

      <Button
        onClick={handleSave}
        disabled={loading}
        className="mt-6 w-full"
      >
        <Save className="h-4 w-4" aria-hidden="true" />
        {loading ? 'Guardando...' : 'Guardar horarios'}
      </Button>
      {errorMessage && (
        <p className="mt-3 text-sm font-medium text-red-600" role="alert">
          {errorMessage}
        </p>
      )}
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}

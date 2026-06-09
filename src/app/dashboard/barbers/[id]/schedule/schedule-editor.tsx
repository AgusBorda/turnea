'use client'

import { useState } from 'react'
import { BarberSchedule } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Save, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

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

    const supabase = createClient()

    // Delete all existing schedules for this barber
    await supabase
      .from('barber_schedules')
      .delete()
      .eq('barber_id', barberId)

    // Insert new schedules
    const schedulesToInsert = schedule.map(s => ({
      barber_id: barberId,
      day_of_week: s.day_of_week,
      is_working: s.is_working,
      start_time: `${s.start_time}:00`,
      end_time: `${s.end_time}:00`,
    }))

    const { error } = await supabase
      .from('barber_schedules')
      .insert(schedulesToInsert)

    if (!error) {
      setSaved(true)
      router.refresh()
    }

    setLoading(false)
  }

  return (
    <div className="max-w-xl">
      <Link
        href="/dashboard/barbers"
        className="inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--foreground)] mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Volver a barberos
      </Link>

      {saved && (
        <div className="bg-green-50 text-green-600 text-sm rounded-lg p-3 mb-4">
          ¡Horarios guardados!
        </div>
      )}

      <div className="space-y-3">
        {schedule.map(day => (
          <div
            key={day.day_of_week}
            className={`bg-white rounded-xl border p-4 transition-opacity ${
              day.is_working ? 'border-[var(--border)]' : 'border-[var(--border)] opacity-60'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={day.is_working}
                  onChange={e => updateDay(day.day_of_week, 'is_working', e.target.checked)}
                  className="w-4 h-4 rounded border-[var(--border)] text-[var(--primary)] focus:ring-[var(--primary)]"
                />
                <span className={`font-medium ${day.is_working ? '' : 'text-[var(--muted)]'}`}>
                  {DAY_NAMES[day.day_of_week]}
                </span>
              </div>

              {day.is_working && (
                <div className="flex items-center gap-2 text-sm">
                  <input
                    type="time"
                    value={day.start_time}
                    onChange={e => updateDay(day.day_of_week, 'start_time', e.target.value)}
                    className="px-2 py-1 rounded-lg border border-[var(--border)] focus:outline-none focus:border-[var(--primary)]"
                  />
                  <span className="text-[var(--muted)]">a</span>
                  <input
                    type="time"
                    value={day.end_time}
                    onChange={e => updateDay(day.day_of_week, 'end_time', e.target.value)}
                    className="px-2 py-1 rounded-lg border border-[var(--border)] focus:outline-none focus:border-[var(--primary)]"
                  />
                </div>
              )}

              {!day.is_working && (
                <span className="text-sm text-[var(--muted)]">No atiende</span>
              )}
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={handleSave}
        disabled={loading}
        className="mt-6 w-full flex items-center justify-center gap-2 py-3 bg-[var(--primary)] text-white font-semibold rounded-xl hover:bg-[var(--primary-dark)] transition-colors disabled:opacity-50"
      >
        <Save className="w-4 h-4" />
        {loading ? 'Guardando...' : 'Guardar horarios'}
      </button>
    </div>
  )
}

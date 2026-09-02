import { createClient } from '@/lib/supabase/server'
import { getBarbershopToday } from '@/lib/datetime'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import Card from '@/components/ui/card'
import SectionHeader from '@/components/ui/section-header'
import AvailabilityManager, { type UpcomingBlockedSlot } from './availability-manager'
import ScheduleEditor from './schedule-editor'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function BarberSchedulePage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Verify ownership
  const { data: barber } = await supabase
    .from('barbers')
    .select('id, name, barbershops!inner(owner_id, timezone)')
    .eq('id', id)
    .single()

  const barbershop = barber?.barbershops as unknown as {
    owner_id: string
    timezone: string
  } | null

  if (!barber || !barbershop || barbershop.owner_id !== user.id) {
    redirect('/dashboard/barbers')
  }

  const today = getBarbershopToday(barbershop.timezone)

  // Fetch existing schedules
  const [schedulesResult, blockedSlotsResult] = await Promise.all([
    supabase
      .from('barber_schedules')
      .select('*')
      .eq('barber_id', id)
      .order('day_of_week'),
    supabase
      .from('blocked_slots')
      .select('id, date, start_time, end_time, all_day, reason')
      .eq('barber_id', id)
      .gte('date', today)
      .order('date')
      .order('start_time', { nullsFirst: true }),
  ])

  if (schedulesResult.error || blockedSlotsResult.error) {
    throw new Error('No se pudo cargar la disponibilidad del barbero.')
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <Link
        href="/dashboard/barbers"
        className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-medium text-[var(--muted)] transition-colors hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Barberos
      </Link>

      <header className="mt-3">
        <h1 className="text-2xl font-bold tracking-tight">Disponibilidad de {barber.name}</h1>
        <p className="mt-2 text-sm text-[var(--muted)] sm:text-base">
          Definí su horario semanal y las ausencias programadas.
        </p>
      </header>

      <div className="mt-8 space-y-10">
        <section className="space-y-4">
          <SectionHeader
            title="Horario semanal"
            description="Configurá los días y horarios habituales de atención."
          />
          <Card>
            <ScheduleEditor barberId={id} initialSchedules={schedulesResult.data || []} />
          </Card>
        </section>

        <section className="space-y-4">
          <SectionHeader
            title="Ausencias y bloqueos"
            description="Bloqueá fechas u horarios en los que el barbero no estará disponible."
          />
          <Card>
            <AvailabilityManager
              barberId={id}
              today={today}
              initialBlockedSlots={(blockedSlotsResult.data || []) as UpcomingBlockedSlot[]}
            />
          </Card>
        </section>
      </div>
    </div>
  )
}

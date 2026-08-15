import { createClient } from '@/lib/supabase/server'
import { getBarbershopToday } from '@/lib/datetime'
import { redirect } from 'next/navigation'
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
    <div>
      <h1 className="text-2xl font-bold mb-2">Horarios de {barber.name}</h1>
      <p className="text-[var(--muted)] mb-6">Configurá los días y horarios de atención.</p>
      <ScheduleEditor barberId={id} initialSchedules={schedulesResult.data || []} />
      <AvailabilityManager
        barberId={id}
        today={today}
        initialBlockedSlots={(blockedSlotsResult.data || []) as UpcomingBlockedSlot[]}
      />
    </div>
  )
}

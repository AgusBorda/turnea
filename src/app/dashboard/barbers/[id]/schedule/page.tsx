import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
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
    .select('*, barbershops!inner(owner_id)')
    .eq('id', id)
    .single()

  if (!barber || (barber as any).barbershops?.owner_id !== user.id) {
    redirect('/dashboard/barbers')
  }

  // Fetch existing schedules
  const { data: schedules } = await supabase
    .from('barber_schedules')
    .select('*')
    .eq('barber_id', id)
    .order('day_of_week')

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Horarios de {barber.name}</h1>
      <p className="text-[var(--muted)] mb-6">Configurá los días y horarios de atención.</p>
      <ScheduleEditor barberId={id} initialSchedules={schedules || []} />
    </div>
  )
}

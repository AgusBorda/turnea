import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AgendaClient, {
  type AgendaBarber,
  type AgendaService,
  type BarberScheduleData,
} from './agenda-client'

export default async function AgendaPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: barbershop } = await supabase
    .from('barbershops')
    .select('id, timezone')
    .eq('owner_id', user.id)
    .single()

  if (!barbershop) redirect('/dashboard')

  const [barbersResult, servicesResult] = await Promise.all([
    supabase
      .from('barbers')
      .select('id, name, active')
      .eq('barbershop_id', barbershop.id)
      .eq('active', true)
      .order('sort_order'),

    supabase
      .from('services')
      .select('id, name, price, duration, active')
      .eq('barbershop_id', barbershop.id)
      .eq('active', true)
      .order('sort_order'),
  ])

  if (barbersResult.error || servicesResult.error) {
    throw new Error('Failed to load agenda configuration')
  }

  const barbers = (barbersResult.data || []) as AgendaBarber[]
  const services = (servicesResult.data || []) as AgendaService[]
  const barberIds = barbers.map(barber => barber.id)
  let barberSchedules: BarberScheduleData[] = []

  if (barberIds.length > 0) {
    const schedulesResult = await supabase
      .from('barber_schedules')
      .select('barber_id, day_of_week, start_time, end_time, is_working')
      .in('barber_id', barberIds)
      .order('day_of_week')

    if (schedulesResult.error) {
      throw new Error('Failed to load barber schedules')
    }

    barberSchedules = (schedulesResult.data || []) as BarberScheduleData[]
  }

  return (
    <AgendaClient
      barbershopId={barbershop.id}
      timezone={barbershop.timezone}
      barbers={barbers}
      services={services}
      barberSchedules={barberSchedules}
    />
  )
}

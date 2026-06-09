import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { format, startOfWeek, addDays } from 'date-fns'
import { es } from 'date-fns/locale'
import AgendaClient from './agenda-client'

export default async function AgendaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: barbershop } = await supabase
    .from('barbershops')
    .select('*')
    .eq('owner_id', user.id)
    .single()

  if (!barbershop) redirect('/dashboard')

  // Obtener turnos de la semana actual
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 })
  const weekEnd = addDays(weekStart, 6)

  const { data: appointments } = await supabase
    .from('appointments')
    .select('*, barbers(name), services(name, price, duration)')
    .eq('barbershop_id', barbershop.id)
    .gte('date', format(weekStart, 'yyyy-MM-dd'))
    .lte('date', format(weekEnd, 'yyyy-MM-dd'))
    .order('date')
    .order('start_time')

  // Fetch barbers and services for the new appointment form
  const { data: barbers } = await supabase
    .from('barbers')
    .select('*')
    .eq('barbershop_id', barbershop.id)
    .eq('active', true)
    .order('sort_order')

  const { data: services } = await supabase
    .from('services')
    .select('*')
    .eq('barbershop_id', barbershop.id)
    .eq('active', true)
    .order('sort_order')

  // Group by day
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekStart, i)
    const dateStr = format(date, 'yyyy-MM-dd')
    return {
      date: dateStr,
      label: format(date, 'EEE d', { locale: es }),
      isToday: dateStr === format(new Date(), 'yyyy-MM-dd'),
      appointments: (appointments || []).filter(a => a.date === dateStr),
    }
  })

  return (
    <AgendaClient
      barbershopId={barbershop.id}
      days={days}
      barbers={barbers || []}
      services={services || []}
      weekLabel={format(weekStart, "d 'de' MMMM", { locale: es })}
    />
  )
}

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { format, startOfWeek, startOfMonth, addDays } from 'date-fns'
import { es } from 'date-fns/locale'
import Link from 'next/link'
import DashboardStats from './dashboard-stats'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: barbershop } = await supabase
    .from('barbershops')
    .select('*')
    .eq('owner_id', user.id)
    .single()

  if (!barbershop) {
    return <SetupPrompt />
  }

  const today       = format(new Date(), 'yyyy-MM-dd')
  const weekStart   = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')
  const monthStart  = format(startOfMonth(new Date()), 'yyyy-MM-dd')
  const tomorrow    = format(addDays(new Date(), 1), 'yyyy-MM-dd')
  const nextWeekEnd = format(addDays(new Date(), 7), 'yyyy-MM-dd')

  // Fetch todo en paralelo
  const [
    { data: todayAppts },
    { data: weekAppts },
    { data: monthAppts },
    { data: upcomingAppts },
  ] = await Promise.all([
    supabase
      .from('appointments')
      .select('*, barbers(name), services(name, price)')
      .eq('barbershop_id', barbershop.id)
      .eq('date', today)
      .order('start_time'),
    supabase
      .from('appointments')
      .select('*, services(name, price)')
      .eq('barbershop_id', barbershop.id)
      .gte('date', weekStart)
      .lte('date', today),
    supabase
      .from('appointments')
      .select('*, services(name, price)')
      .eq('barbershop_id', barbershop.id)
      .gte('date', monthStart)
      .lte('date', today),
    supabase
      .from('appointments')
      .select('*, barbers(name), services(name, price)')
      .eq('barbershop_id', barbershop.id)
      .gte('date', tomorrow)
      .lte('date', nextWeekEnd)
      .neq('status', 'cancelled')
      .order('date')
      .order('start_time')
      .limit(6),
  ])

  function computeStats(appts: any[]) {
    const nonCancelled = appts.filter(a => a.status !== 'cancelled')
    const completed    = appts.filter(a => a.status === 'completed')
    return {
      total:     nonCancelled.length,
      completed: completed.length,
      revenue:   completed.reduce((s: number, a: any) => s + (a.services?.price || 0), 0),
      noShows:   appts.filter(a => a.status === 'no_show').length,
      cancelled: appts.filter(a => a.status === 'cancelled').length,
    }
  }

  const todayStats = computeStats(todayAppts  || [])
  const weekStats  = computeStats(weekAppts   || [])
  const monthStats = computeStats(monthAppts  || [])

  // Servicio más pedido del mes
  const serviceCount: Record<string, { count: number; name: string }> = {}
  ;(monthAppts || [])
    .filter((a: any) => a.services && a.status !== 'cancelled')
    .forEach((a: any) => {
      const key = a.service_id || a.services.name
      if (!serviceCount[key]) serviceCount[key] = { count: 0, name: a.services.name }
      serviceCount[key].count++
    })
  const topService =
    Object.values(serviceCount).sort((a, b) => b.count - a.count)[0] || null

  const dayOfMonth = new Date().getDate()
  const avgPerDay  = dayOfMonth > 0 ? Math.round(monthStats.total / dayOfMonth) : 0

  const now    = format(new Date(), 'HH:mm:ss')
  const nextApt =
    (todayAppts || []).find(
      (a: any) => a.start_time >= now && a.status !== 'cancelled'
    ) || null

  return (
    <DashboardStats
      barbershop={{ name: barbershop.name, slug: barbershop.slug }}
      todayLabel={format(new Date(), "EEEE d 'de' MMMM", { locale: es })}
      today={{ ...todayStats, appointments: todayAppts || [], nextApt }}
      week={weekStats}
      month={{ ...monthStats, topService, avgPerDay }}
      upcoming={upcomingAppts || []}
    />
  )
}

function SetupPrompt() {
  return (
    <div className="max-w-md mx-auto text-center py-16">
      <h1 className="text-2xl font-bold mb-4">Configurá tu barbería</h1>
      <p className="text-[var(--muted)] mb-6">
        Todavía no tenés una barbería configurada. Vamos a crear una para que
        puedas empezar a recibir turnos.
      </p>
      <Link
        href="/dashboard/settings"
        className="inline-block px-6 py-3 bg-[var(--primary)] text-white font-semibold rounded-lg hover:bg-[var(--primary-dark)] transition-colors"
      >
        Crear mi barbería
      </Link>
    </div>
  )
}

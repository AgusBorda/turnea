import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AgendaClient from './agenda-client'

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

  const [{ data: barbers }, { data: services }] = await Promise.all([
    supabase
      .from('barbers')
      .select('*')
      .eq('barbershop_id', barbershop.id)
      .eq('active', true)
      .order('sort_order'),

    supabase
      .from('services')
      .select('*')
      .eq('barbershop_id', barbershop.id)
      .eq('active', true)
      .order('sort_order'),
  ])

  return (
    <AgendaClient
      barbershopId={barbershop.id}
      timezone={barbershop.timezone}
      barbers={barbers || []}
      services={services || []}
    />
  )
}

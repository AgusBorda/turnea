import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import BarbersManager from './barbers-manager'

export default async function BarbersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: barbershop } = await supabase
    .from('barbershops')
    .select('*')
    .eq('owner_id', user.id)
    .single()

  if (!barbershop) redirect('/dashboard')

  const { data: barbers } = await supabase
    .from('barbers')
    .select('*')
    .eq('barbershop_id', barbershop.id)
    .eq('active', true)
    .order('sort_order')

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Barberos</h1>
      <BarbersManager barbershopId={barbershop.id} initialBarbers={barbers || []} />
    </div>
  )
}

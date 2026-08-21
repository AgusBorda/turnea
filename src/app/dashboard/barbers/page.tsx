import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import BarbersManager from './barbers-manager'

export default async function BarbersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: barbershop } = await supabase
    .from('barbershops')
    .select('id')
    .eq('owner_id', user.id)
    .single()

  if (!barbershop) redirect('/dashboard')

  const { data: barbers, error: barbersError } = await supabase
    .from('barbers')
    .select('id, barbershop_id, name, photo_url, bio, sort_order, active, created_at, updated_at')
    .eq('barbershop_id', barbershop.id)
    .order('sort_order', { nullsFirst: false })
    .order('name')
    .order('id')

  if (barbersError) {
    throw new Error('Failed to load barbers')
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Barberos</h1>
      <BarbersManager
        barbershopId={barbershop.id}
        initialBarbers={(barbers || []).filter(barber => barber.active)}
      />
    </div>
  )
}

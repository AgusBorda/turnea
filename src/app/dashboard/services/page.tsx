import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ServicesManager from './services-manager'

export default async function ServicesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: barbershop } = await supabase
    .from('barbershops')
    .select('*')
    .eq('owner_id', user.id)
    .single()

  if (!barbershop) redirect('/dashboard')

  const { data: services } = await supabase
    .from('services')
    .select('*')
    .eq('barbershop_id', barbershop.id)
    .order('sort_order')

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Servicios</h1>
      <ServicesManager barbershopId={barbershop.id} initialServices={services || []} />
    </div>
  )
}

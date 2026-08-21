import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ServicesManager from './services-manager'

export default async function ServicesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: barbershop } = await supabase
    .from('barbershops')
    .select('id')
    .eq('owner_id', user.id)
    .single()

  if (!barbershop) redirect('/dashboard')

  const { data: services, error: servicesError } = await supabase
    .from('services')
    .select('id, barbershop_id, name, description, duration, price, active, sort_order, created_at, updated_at')
    .eq('barbershop_id', barbershop.id)
    .order('sort_order')

  if (servicesError) {
    throw new Error('Failed to load services')
  }

  return (
    <div className="mx-auto w-full max-w-4xl">
      <ServicesManager barbershopId={barbershop.id} initialServices={services || []} />
    </div>
  )
}

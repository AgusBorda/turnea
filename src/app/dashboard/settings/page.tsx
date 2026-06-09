import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SettingsForm from './settings-form'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: barbershop } = await supabase
    .from('barbershops')
    .select('*')
    .eq('owner_id', user.id)
    .single()

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Configuración</h1>
      <SettingsForm barbershop={barbershop} userId={user.id} />
    </div>
  )
}

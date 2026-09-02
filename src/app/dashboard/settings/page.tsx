import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SettingsForm from './settings-form'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: barbershop }, { data: processingRatePresets }] = await Promise.all([
    supabase
      .from('barbershops')
      .select(`
      id,
      name,
      slug,
      description,
      address,
      phone,
      instagram,
      timezone,
      slot_duration,
      deposit_required,
      deposit_percentage,
      advance_booking_days,
      mp_configured,
      processing_fee_mode,
      mp_settlement_option,
      effective_processing_rate
    `)
      .eq('owner_id', user.id)
      .single(),
    supabase
      .from('payment_processing_rate_presets')
      .select('settlement_option, label, suggested_effective_rate')
      .eq('active', true)
      .order('sort_order'),
  ])

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Configuración</h1>
      <SettingsForm
        barbershop={barbershop}
        processingRatePresets={processingRatePresets ?? []}
        userId={user.id}
      />
    </div>
  )
}

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getMercadoPagoConnectionSummary } from '@/lib/mercado-pago/connection-summary'
import {
  EMPTY_MERCADO_PAGO_CONNECTION_SUMMARY,
  getMercadoPagoOAuthResult,
  parseSettingsSection,
} from '@/lib/mercado-pago/connection-state'
import SettingsForm from './settings-form'

interface SettingsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function firstQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const query = await searchParams

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
      mp_base_processing_rate,
      processing_fee_vat_rate,
      effective_processing_rate
    `)
      .eq('owner_id', user.id)
      .single(),
    supabase
      .from('payment_processing_rate_presets')
      .select('settlement_option, label, suggested_base_rate')
      .eq('active', true)
      .order('sort_order'),
  ])

  const connectionSummary = barbershop
    ? await getMercadoPagoConnectionSummary(barbershop.id, barbershop.mp_configured)
    : EMPTY_MERCADO_PAGO_CONNECTION_SUMMARY

  return (
    <SettingsForm
      barbershop={barbershop}
      processingRatePresets={processingRatePresets ?? []}
      userId={user.id}
      initialSection={parseSettingsSection(firstQueryValue(query.tab))}
      initialOAuthResult={getMercadoPagoOAuthResult(
        firstQueryValue(query.mp),
        firstQueryValue(query.reason)
      )}
      initialConnectionSummary={connectionSummary}
    />
  )
}

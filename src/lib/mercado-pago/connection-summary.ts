import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import {
  EMPTY_MERCADO_PAGO_CONNECTION_SUMMARY,
  type MercadoPagoConnectionSource,
  type MercadoPagoConnectionStatus,
  type MercadoPagoConnectionSummary,
} from './connection-state'

interface ConnectionRow {
  credential_source: unknown
  connection_status: unknown
  mp_user_id: unknown
  mp_token_expires_at: unknown
  oauth_connected_at: unknown
}

export async function getMercadoPagoConnectionSummary(
  barbershopId: string,
  configured: boolean
): Promise<MercadoPagoConnectionSummary> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('barbershop_payment_credentials')
    .select('credential_source, connection_status, mp_user_id, mp_token_expires_at, oauth_connected_at')
    .eq('barbershop_id', barbershopId)
    .maybeSingle()

  if (error) throw new Error('MERCADO_PAGO_CONNECTION_SUMMARY_UNAVAILABLE')
  if (!data) return { ...EMPTY_MERCADO_PAGO_CONNECTION_SUMMARY, configured: false }

  const row = data as ConnectionRow
  const source: MercadoPagoConnectionSource = row.credential_source === 'manual' || row.credential_source === 'oauth'
    ? row.credential_source
    : null
  const status: MercadoPagoConnectionStatus = row.connection_status === 'connected'
    || row.connection_status === 'disconnected'
    || row.connection_status === 'reauth_required'
    ? row.connection_status
    : null

  return {
    configured: configured && status === 'connected',
    source,
    status,
    mpUserId: typeof row.mp_user_id === 'string' && row.mp_user_id.trim() ? row.mp_user_id.trim() : null,
    expiresAt: typeof row.mp_token_expires_at === 'string' ? row.mp_token_expires_at : null,
    connectedAt: typeof row.oauth_connected_at === 'string' ? row.oauth_connected_at : null,
  }
}

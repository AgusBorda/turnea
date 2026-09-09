import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import {
  MercadoPagoCredentialError,
  resolveMercadoPagoCredential,
  type MercadoPagoCredential,
  type MercadoPagoCredentialRow,
} from './credential-state'

const CREDENTIAL_COLUMNS = [
  'mp_access_token',
  'mp_user_id',
  'credential_source',
  'connection_status',
  'mp_token_expires_at',
  'mp_live_mode',
].join(', ')

export async function getMercadoPagoCredential(
  barbershopId: string
): Promise<MercadoPagoCredential> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('barbershop_payment_credentials')
    .select(CREDENTIAL_COLUMNS)
    .eq('barbershop_id', barbershopId)
    .maybeSingle()

  if (error) {
    throw new MercadoPagoCredentialError('MERCADO_PAGO_CREDENTIAL_UNAVAILABLE')
  }

  return resolveMercadoPagoCredential(data as unknown as MercadoPagoCredentialRow | null)
}

export async function getValidMercadoPagoAccessToken(barbershopId: string) {
  const credential = await getMercadoPagoCredential(barbershopId)
  return credential.accessToken
}

export async function storeManualMercadoPagoCredential(
  barbershopId: string,
  accessToken: string
) {
  const admin = createAdminClient()
  const { error } = await admin.rpc('store_manual_mercado_pago_credential', {
    p_barbershop_id: barbershopId,
    p_access_token: accessToken,
  })

  if (error) {
    throw new MercadoPagoCredentialError('MERCADO_PAGO_CREDENTIAL_UNAVAILABLE')
  }
}

export { MercadoPagoCredentialError }

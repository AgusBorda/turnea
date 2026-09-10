import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import {
  MercadoPagoCredentialError,
  resolveMercadoPagoCredential,
  type MercadoPagoCredential,
  type MercadoPagoCredentialRow,
} from './credential-state'
import { randomUUID } from 'node:crypto'
import { refreshMercadoPagoOAuthToken } from './token-refresh'

const CREDENTIAL_COLUMNS = [
  'mp_access_token',
  'mp_user_id',
  'credential_source',
  'connection_status',
  'mp_token_expires_at',
  'mp_live_mode',
  'mp_refresh_token',
  'mp_scope',
  'updated_at',
  'refresh_claim_id',
  'refresh_claimed_at',
].join(', ')

interface PrivateCredentialRow extends MercadoPagoCredentialRow {
  mp_refresh_token: unknown
  mp_scope: unknown
  updated_at: unknown
  refresh_claim_id: unknown
  refresh_claimed_at: unknown
}

function requiredSecret(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new MercadoPagoCredentialError('MERCADO_PAGO_CREDENTIAL_UNAVAILABLE')
  return value
}

async function loadCredentialRow(barbershopId: string): Promise<PrivateCredentialRow | null> {
  const admin = createAdminClient()
  const { data, error } = await admin.from('barbershop_payment_credentials')
    .select(CREDENTIAL_COLUMNS).eq('barbershop_id', barbershopId).maybeSingle()
  if (error) throw new MercadoPagoCredentialError('MERCADO_PAGO_CREDENTIAL_UNAVAILABLE')
  return data as unknown as PrivateCredentialRow | null
}

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
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const row = await loadCredentialRow(barbershopId)
    try {
      return resolveMercadoPagoCredential(row).accessToken
    } catch (error) {
      if (!(error instanceof MercadoPagoCredentialError)
        || error.code !== 'MERCADO_PAGO_TOKEN_REFRESH_REQUIRED') throw error
    }

    const refreshToken = typeof row?.mp_refresh_token === 'string' ? row.mp_refresh_token.trim() : ''
    const updatedAt = typeof row?.updated_at === 'string' ? row.updated_at : ''
    const clientId = requiredSecret('MERCADO_PAGO_CLIENT_ID')
    const clientSecret = requiredSecret('MERCADO_PAGO_CLIENT_SECRET')
    const claimId = randomUUID()
    if (!refreshToken || !updatedAt) throw new MercadoPagoCredentialError('MERCADO_PAGO_CREDENTIAL_UNAVAILABLE')
    const admin = createAdminClient()
    const { data: claim, error: claimError } = await admin.rpc('claim_mercado_pago_oauth_refresh', {
      p_barbershop_id: barbershopId,
      p_claim_id: claimId,
      p_expected_updated_at: updatedAt,
    })
    if (claimError) throw new MercadoPagoCredentialError('MERCADO_PAGO_CREDENTIAL_UNAVAILABLE')
    if (claim !== 'claimed') {
      await new Promise(resolve => setTimeout(resolve, 150 * (attempt + 1)))
      continue
    }

    console.info('[mp-oauth] token refresh', { barbershopId, stage: 'refresh_start' })
    const result = await refreshMercadoPagoOAuthToken({
      clientId,
      clientSecret,
      refreshToken,
    })
    if (result.kind === 'success') {
      const storedUserId = typeof row?.mp_user_id === 'string' ? row.mp_user_id.trim() : ''
      if (result.userId && result.userId !== storedUserId) {
        await admin.rpc('release_mercado_pago_oauth_refresh', { p_barbershop_id: barbershopId, p_claim_id: claimId })
        throw new MercadoPagoCredentialError('MERCADO_PAGO_CREDENTIAL_UNAVAILABLE')
      }
      const scope = result.scope ?? (typeof row?.mp_scope === 'string' ? row.mp_scope : '')
      const liveMode = result.liveMode ?? (typeof row?.mp_live_mode === 'boolean' ? row.mp_live_mode : null)
      const { error: completeError } = await admin.rpc('complete_mercado_pago_oauth_refresh', {
        p_barbershop_id: barbershopId, p_claim_id: claimId,
        p_access_token: result.accessToken, p_refresh_token: result.refreshToken,
        p_token_expires_at: result.expiresAt.toISOString(), p_scope: scope, p_live_mode: liveMode,
      })
      if (completeError) throw new MercadoPagoCredentialError('MERCADO_PAGO_CREDENTIAL_UNAVAILABLE')
      console.info('[mp-oauth] token refresh', { barbershopId, stage: 'refresh_success', httpStatus: 200 })
      continue
    }
    if (result.kind === 'permanent') {
      await admin.rpc('mark_mercado_pago_oauth_reauth_required', { p_barbershop_id: barbershopId, p_claim_id: claimId })
      console.warn('[mp-oauth] token refresh', { barbershopId, stage: 'refresh_failed', httpStatus: result.httpStatus, classification: 'permanent', reauthRequired: true })
      throw new MercadoPagoCredentialError('MERCADO_PAGO_REAUTH_REQUIRED')
    }
    await admin.rpc('release_mercado_pago_oauth_refresh', { p_barbershop_id: barbershopId, p_claim_id: claimId })
    console.warn('[mp-oauth] token refresh', { barbershopId, stage: 'refresh_failed', httpStatus: result.httpStatus, classification: result.kind, reauthRequired: false })
    throw new MercadoPagoCredentialError('MERCADO_PAGO_REFRESH_TRANSIENT_FAILURE')
  }
  throw new MercadoPagoCredentialError('MERCADO_PAGO_REFRESH_TRANSIENT_FAILURE')
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

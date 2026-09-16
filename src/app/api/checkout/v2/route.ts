import { NextRequest, NextResponse } from 'next/server'

import { isLocalSlotInPast } from '@/lib/datetime'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getValidMercadoPagoCredential } from '@/lib/mercado-pago/credentials'
import { buildCheckoutIntentRpcArgs, type CheckoutIntentRpcRow,
  type CheckoutIntentPrivateRow } from '@/lib/payments/checkout-intent-server'
import { parseCheckoutV2Request } from '@/lib/payments/checkout-v2-request'
import { parsePaymentAppointmentSnapshot, paymentQuoteFromSnapshot,
  quotedPaymentMatchesSnapshot, mercadoPagoUnitPrice } from '@/lib/payments/checkout-snapshot'
import { runCheckoutV2, type CheckoutV2Dependencies, type CheckoutV2Intent } from '@/lib/payments/checkout-v2-flow'
import { isMercadoPagoCheckoutUrl } from '@/lib/payments/checkout-preference-validation'
import { createMercadoPagoPreference, getMercadoPagoPreference,
  searchMercadoPagoPreferences } from '@/lib/mercado-pago/preferences'
import type { PublicBarbershopCheckoutConfig, PublicServiceCheckoutConfig } from '@/lib/types'

const TTL_MS = 15 * 60 * 1000
const INVALID_REQUEST = { status: 'error', code: 'invalid_request' }

function publicUrl(req: NextRequest): string | null {
  const configured = process.env.NEXT_PUBLIC_APP_URL
  if (!configured && req.nextUrl.hostname !== 'localhost') return null
  try {
    const url = new URL(configured || req.nextUrl.origin)
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && url.hostname === 'localhost')) return null
    return url.origin
  } catch { return null }
}

function notificationUrl(appUrl: string, shopId: string): string | null | undefined {
  if (appUrl.includes('localhost')) return null
  const url = new URL('/api/webhooks/mp', appUrl)
  url.searchParams.set('barbershop_id', shopId)
  url.searchParams.set('source_news', 'webhooks')
  if (process.env.VERCEL_ENV === 'preview') {
    const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim()
    if (!bypass) return undefined
    url.searchParams.set('x-vercel-protection-bypass', bypass)
  }
  return url.toString()
}

export async function POST(req: NextRequest) {
  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json(INVALID_REQUEST, { status: 400 })
  }
  const parsed = parseCheckoutV2Request(body)
  if (!parsed) return NextResponse.json(INVALID_REQUEST, { status: 400 })
  const { token, booking: bookingInput, quotedPayment } = parsed
  const expiresAt = new Date(Date.now() + TTL_MS).toISOString()
  let prepared: Awaited<ReturnType<typeof buildCheckoutIntentRpcArgs>>
  try { prepared = await buildCheckoutIntentRpcArgs(token, bookingInput, expiresAt) }
  catch { return NextResponse.json({ status: 'error', code: 'payment_unavailable' }, { status: 503 }) }
  const { args, credential, booking } = prepared

  let admin: ReturnType<typeof createAdminClient>
  try { admin = createAdminClient() } catch {
    return NextResponse.json({ status: 'error' }, { status: 503 })
  }
  const { data: intentData, error: intentError } = await admin.rpc(
    'get_or_create_checkout_intent_v1', args
  ).single()
  if (intentError) {
    const message = intentError.message
    if (message.includes('CHECKOUT_INTENT_CONFLICT')) {
      return NextResponse.json({ status: 'conflict', code: 'intent_conflict' }, { status: 409 })
    }
    if (message.includes('CHECKOUT_SELLER_CHANGED')) {
      return NextResponse.json({ status: 'conflict', code: 'seller_changed' }, { status: 409 })
    }
    if (message.includes('SLOT_CONFLICT') || message.includes('SLOT_')) {
      return NextResponse.json({ status: 'conflict', code: 'slot_unavailable' }, { status: 409 })
    }
    return NextResponse.json({ status: 'error' }, { status: 503 })
  }
  const rpcRow = intentData as CheckoutIntentRpcRow
  if (!rpcRow?.intent_id || !rpcRow.appointment_id) {
    return NextResponse.json({ status: 'error' }, { status: 503 })
  }

  const readIntent: CheckoutV2Dependencies['readIntent'] = async id => {
    const { data, error } = await admin.from('checkout_intents')
      .select('id, appointment_id, barbershop_id, expected_mp_user_id, status, preference_phase, preference_id, init_point, expires_at')
      .eq('id', id).eq('barbershop_id', booking.barbershopId).maybeSingle()
    if (error || !data) return null
    const intent = data as CheckoutIntentPrivateRow
    return {
      id: intent.id, appointmentId: intent.appointment_id,
      status: intent.status, phase: intent.preference_phase,
      expectedSellerId: intent.expected_mp_user_id,
      preferenceId: intent.preference_id, initPoint: intent.init_point,
      expiresAt: intent.expires_at,
    } as CheckoutV2Intent
  }
  const initial = await readIntent(rpcRow.intent_id)
  if (!initial || initial.appointmentId !== rpcRow.appointment_id) {
    return NextResponse.json({ status: 'error' }, { status: 503 })
  }
  if (initial.expectedSellerId !== credential.userId) {
    return NextResponse.json({ status: 'conflict', code: 'seller_changed' }, { status: 409 })
  }
  const currentAccessToken = async (): Promise<string | null> => {
    try {
      const current = await getValidMercadoPagoCredential(booking.barbershopId)
      return current.userId === initial.expectedSellerId ? current.accessToken : null
    } catch { return null }
  }

  let shop: PublicBarbershopCheckoutConfig | null = null
  let service: PublicServiceCheckoutConfig | null = null
  let appUrl: string | null = null
  let webhookUrl: string | null | undefined
  if (initial.phase === 'no_post' && (initial.status === 'reserved' || initial.status === 'creating')) {
    const publicClient = await createClient()
    const [{ data: shopData, error: shopError }, { data: serviceData, error: serviceError }] = await Promise.all([
      publicClient.rpc('get_public_barbershop_checkout_config', { p_barbershop_id: booking.barbershopId }).maybeSingle(),
      publicClient.rpc('get_public_service_checkout_config', {
        p_barbershop_id: booking.barbershopId, p_service_id: booking.serviceId,
      }).maybeSingle(),
    ])
    shop = shopData as PublicBarbershopCheckoutConfig | null
    service = serviceData as PublicServiceCheckoutConfig | null
    if (shopError || serviceError) return NextResponse.json({ status: 'error' }, { status: 503 })
    if (!shop || !service || !shop.deposit_required || !shop.mp_configured) {
      return NextResponse.json({ status: 'error', code: 'payment_unavailable' }, { status: 400 })
    }
    if (isLocalSlotInPast(booking.date, booking.startTime, shop.timezone)) {
      return NextResponse.json({ status: 'error', code: 'APPOINTMENT_IN_PAST' }, { status: 400 })
    }
    appUrl = publicUrl(req)
    webhookUrl = appUrl ? notificationUrl(appUrl, booking.barbershopId) : undefined
    if (!appUrl || webhookUrl === undefined) return NextResponse.json({ status: 'error' }, { status: 503 })
  }

  const readSnapshot: CheckoutV2Dependencies['readSnapshot'] = async (appointmentId, forPost) => {
    const { data, error } = await admin.from('appointments')
      .select('id, barbershop_id, status, deposit_status, expires_at, deposit_amount, processing_fee_amount, payment_total_amount, processing_fee_rate, processing_fee_mode, processing_fee_settlement_option, payment_currency')
      .eq('id', appointmentId).eq('barbershop_id', booking.barbershopId).maybeSingle()
    if (error || !data || (forPost && (data.status !== 'pending_payment'
      || data.deposit_status !== 'pending' || Date.parse(data.expires_at) <= Date.now()))) return null
    return parsePaymentAppointmentSnapshot({ ...data, appointment_id: data.id })
  }

  // A stale client quote never controls the preference amount. It may update
  // its displayed quote and retry the same token; no second appointment exists.
  const snapshot = await readSnapshot(initial.appointmentId)
  if (!snapshot) return NextResponse.json({ status: 'error' }, { status: 503 })
  if (initial.status === 'reserved' && !quotedPaymentMatchesSnapshot(quotedPayment, snapshot)) {
    return NextResponse.json({ status: 'conflict', code: 'PAYMENT_QUOTE_CHANGED',
      payment: paymentQuoteFromSnapshot(snapshot) }, { status: 409 })
  }

  const deps: CheckoutV2Dependencies = {
    readIntent, readSnapshot,
    prePostCheck: async () => Boolean(await currentAccessToken()),
    claim: async id => {
      const { data, error } = await admin.rpc('claim_checkout_preference_v1', { p_intent_id: id }).single()
      if (error || !data) throw new Error('CLAIM_UNAVAILABLE')
      const claim = data as { result: string; claim_id: string | null }
      return { result: claim.result, claimId: claim.claim_id }
    },
    markPostPossible: async (id, claimId) => {
      const { data, error } = await admin.rpc('mark_checkout_preference_post_possible_v1',
        { p_intent_id: id, p_claim_id: claimId })
      if (error) throw new Error('POST_MARK_UNAVAILABLE')
      return data
    },
    release: async (id, claimId) => {
      await admin.rpc('release_checkout_preference_claim_v1', { p_intent_id: id, p_claim_id: claimId })
    },
    markUnknown: async (id, claimId) => {
      const { error } = await admin.rpc('mark_checkout_preference_unknown_v1',
        { p_intent_id: id, p_claim_id: claimId })
      if (error) throw new Error('UNKNOWN_MARK_UNAVAILABLE')
    },
    complete: async (id, claimId, preference) => {
      const { data, error } = await admin.rpc('complete_checkout_preference_v1', {
        p_intent_id: id, p_claim_id: claimId,
        p_preference_id: preference.id, p_init_point: preference.initPoint,
      })
      if (error) throw new Error('COMPLETE_UNAVAILABLE')
      return data
    },
    postPreference: async (appointmentId, paymentSnapshot, intentExpiry) => {
      if (!shop || !service || !appUrl || webhookUrl === undefined) throw new Error('PREFERENCE_CONTEXT_UNAVAILABLE')
      const preferenceBody: Record<string, unknown> = {
        items: [{ title: `Seña - ${service.name} en ${shop.name}`,
          quantity: 1, currency_id: paymentSnapshot.currency,
          unit_price: mercadoPagoUnitPrice(paymentSnapshot) }],
        back_urls: {
          success: `${appUrl}/${shop.slug}/success`,
          failure: `${appUrl}/${shop.slug}/cancel`,
          pending: `${appUrl}/${shop.slug}/success`,
        },
        ...(webhookUrl && { auto_return: 'approved', notification_url: webhookUrl }),
        external_reference: appointmentId,
        expires: true, expiration_date_from: new Date().toISOString(),
        expiration_date_to: intentExpiry,
      }
      const accessToken = await currentAccessToken()
      if (!accessToken) return null
      const result = await createMercadoPagoPreference(accessToken, preferenceBody)
      return result.ok ? result.data : null
    },
    searchPreferences: async appointmentId => {
      const accessToken = await currentAccessToken()
      return accessToken ? searchMercadoPagoPreferences(accessToken, appointmentId) : null
    },
    getPreference: async id => {
      const accessToken = await currentAccessToken()
      return accessToken ? getMercadoPagoPreference(accessToken, id) : null
    },
    wait: ms => new Promise(resolve => setTimeout(resolve, ms)),
  }

  let result: Awaited<ReturnType<typeof runCheckoutV2>>
  try { result = await runCheckoutV2(initial, credential.userId, deps) }
  catch { return NextResponse.json({ status: 'recovering', retryAfterMs: 2000 }, { status: 202 }) }
  if (result.status === 'ready') {
    if (!isMercadoPagoCheckoutUrl(result.initPoint)) {
      return NextResponse.json({ status: 'error' }, { status: 503 })
    }
    return NextResponse.json({ status: 'ready', initPoint: result.initPoint,
      payment: paymentQuoteFromSnapshot(result.payment) })
  }
  if (result.status === 'recovering') return NextResponse.json(result, { status: 202 })
  if (result.status === 'expired') return NextResponse.json(result, { status: 410 })
  if (result.status === 'seller_conflict') {
    return NextResponse.json({ status: 'conflict', code: 'seller_changed' }, { status: 409 })
  }
  return NextResponse.json(result, { status: result.status === 'failed' ? 409 : 503 })
}

import 'server-only'

import { getValidMercadoPagoCredential } from '@/lib/mercado-pago/credentials'
import {
  canonicalizeCheckoutBooking,
  CHECKOUT_FINGERPRINT_VERSION,
  hashCheckoutAttemptToken,
  hashCheckoutBookingFingerprint,
  type CheckoutBookingInput,
} from './checkout-intent-contract'

export type CheckoutIntentStatus = 'reserved' | 'creating' | 'unknown' | 'ready' | 'failed' | 'expired'
export type CheckoutPreferencePhase = 'no_post' | 'post_possible'

export interface CheckoutIntentRpcRow {
  intent_id: string
  appointment_id: string
  intent_status: CheckoutIntentStatus
  preference_phase: CheckoutPreferencePhase
  preference_id: string | null
  init_point: string | null
  expires_at: string
}

export async function buildCheckoutIntentRpcArgs(
  token: string,
  input: CheckoutBookingInput,
  expiresAt: string
) {
  const booking = canonicalizeCheckoutBooking(input)
  const tokenHash = hashCheckoutAttemptToken(token)
  const fingerprintHash = hashCheckoutBookingFingerprint(booking)
  const credential = await getValidMercadoPagoCredential(booking.barbershopId)

  return {
    p_token_hash: `\\x${tokenHash.toString('hex')}`,
    p_fingerprint_hash: `\\x${fingerprintHash.toString('hex')}`,
    p_fingerprint_version: CHECKOUT_FINGERPRINT_VERSION,
    p_barbershop_id: booking.barbershopId,
    p_barber_id: booking.barberId,
    p_service_id: booking.serviceId,
    p_date: booking.date,
    p_start_time: booking.startTime,
    p_client_name: booking.clientName,
    p_client_phone: booking.clientPhone,
    p_expires_at: expiresAt,
    p_expected_mp_user_id: credential.userId,
  }
}

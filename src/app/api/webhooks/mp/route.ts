import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // MP sends: { type: "payment", action: "payment.created", data: { id: "12345" } }
    if (body.type !== 'payment') {
      return NextResponse.json({ ok: true })
    }

    const paymentId = String(body.data?.id)
    if (!paymentId) {
      return NextResponse.json({ error: 'No payment id' }, { status: 400 })
    }

    const supabase = await createClient()

    // Find appointment by mp_preference_id is not possible here since we only have payment_id.
    // We use the external_reference which MP includes in the payment object.
    // But to call MP API we need the barbershop's access token.
    // Strategy: search our appointments for mp_payment_id, if already processed skip.
    // Otherwise, look up all barbershops and try to match — not scalable.
    // For MVP: we accept the webhook call and use it as a signal to trigger verification.
    // The actual confirmation happens via the success redirect page.

    // Try to find an appointment that might match by looking at pending_payment ones
    // and checking if this payment ID confirms one.
    // This requires knowing the access token. We'll try a different approach:
    // Store mp_payment_id when we receive it, then mark for review if we can't auto-confirm.

    // Log the event for manual processing if needed
    console.log('[mp webhook] payment event received:', paymentId)

    // Attempt to find appointment by scanning pending_payment appointments
    // and calling each barbershop's MP to check — too expensive for scale.
    // For now, mark as received and rely on back_url flow for confirmation.

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[mp webhook] error:', err)
    return NextResponse.json({ ok: true }) // Always return 200 to MP
  }
}

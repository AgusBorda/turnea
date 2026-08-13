'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

const REFRESH_INTERVAL_MS = 3000
const MAX_REFRESH_ATTEMPTS = 10

interface Props {
  appointmentId: string
  slug: string
}

interface PaymentStatusResponse {
  status?: string
  deposit_status?: string | null
}

export default function PaymentStatusPolling({ appointmentId, slug }: Props) {
  const router = useRouter()

  useEffect(() => {
    let attempts = 0
    let requestInFlight = false
    let stopped = false

    const interval = window.setInterval(async () => {
      if (requestInFlight || stopped) return

      attempts += 1
      requestInFlight = true

      try {
        const query = new URLSearchParams({ appointment_id: appointmentId, slug })
        const response = await fetch(`/api/appointments/payment-status?${query}`, {
          cache: 'no-store',
        })

        if (response.ok) {
          const paymentStatus = await response.json() as PaymentStatusResponse

          if (paymentStatus.status === 'confirmed' && paymentStatus.deposit_status === 'paid') {
            stopped = true
            window.clearInterval(interval)
            router.refresh()
          }
        }
      } catch {
        // Keep the pending screen stable and allow the next polling attempt.
      } finally {
        requestInFlight = false
      }

      if (attempts >= MAX_REFRESH_ATTEMPTS) {
        stopped = true
        window.clearInterval(interval)
      }
    }, REFRESH_INTERVAL_MS)

    return () => window.clearInterval(interval)
  }, [appointmentId, router, slug])

  return null
}

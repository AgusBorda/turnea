import { Check, X } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

interface PageProps {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ external_reference?: string }>
}

interface StatusCardProps {
  slug: string
  confirmed?: boolean
  title: string
  message: string
}

interface PaymentStatusView {
  status: string
  deposit_status: string | null
}

export default async function CancelPage({ params, searchParams }: PageProps) {
  const { slug } = await params
  const { external_reference: appointmentId } = await searchParams
  const supabase = await createClient()

  const { data: barbershop, error: barbershopError } = await supabase
    .from('barbershops')
    .select('id, slug')
    .eq('slug', slug)
    .maybeSingle()

  if (barbershopError) {
    return <GenericCard slug={slug} />
  }

  if (!barbershop) notFound()

  if (!appointmentId || !UUID_PATTERN.test(appointmentId)) {
    return <GenericCard slug={barbershop.slug} />
  }

  const { data: appointmentData, error: appointmentError } = await supabase
    .rpc('get_public_appointment_payment_status', {
      p_appointment_id: appointmentId,
      p_barbershop_id: barbershop.id,
    })
    .maybeSingle()
  const appointment = appointmentData as PaymentStatusView | null

  if (appointmentError || !appointment) {
    return <GenericCard slug={barbershop.slug} />
  }

  if (appointment.status === 'confirmed' && appointment.deposit_status === 'paid') {
    return (
      <StatusCard
        slug={barbershop.slug}
        confirmed
        title="Tu turno ya está confirmado"
        message="El pago figura acreditado y tu turno continúa reservado."
      />
    )
  }

  if (appointment.status === 'pending_payment' && appointment.deposit_status === 'pending') {
    return (
      <StatusCard
        slug={barbershop.slug}
        title="El pago no se completó"
        message="Tu turno todavía no está confirmado. Podés volver a la barbería para intentarlo nuevamente."
      />
    )
  }

  return <GenericCard slug={barbershop.slug} />
}

function GenericCard({ slug }: { slug: string }) {
  return (
    <StatusCard
      slug={slug}
      title="No pudimos consultar esa reserva"
      message="Volvé a la página de la barbería para continuar."
    />
  )
}

function StatusCard({ slug, confirmed = false, title, message }: StatusCardProps) {
  const Icon = confirmed ? Check : X

  return (
    <main className="min-h-screen bg-[var(--secondary)] flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <div
          className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 ${
            confirmed ? 'bg-green-100' : 'bg-gray-100'
          }`}
        >
          <Icon className={`w-10 h-10 ${confirmed ? 'text-green-600' : 'text-gray-500'}`} />
        </div>
        <h1 className="text-2xl font-bold mb-2">{title}</h1>
        <p className="text-[var(--muted)] mb-8">{message}</p>
        <Link
          href={`/${slug}`}
          className="inline-block px-8 py-3 bg-[var(--primary)] text-white font-semibold rounded-xl hover:bg-[var(--primary-dark)] transition-colors"
        >
          Volver a la barbería
        </Link>
      </div>
    </main>
  )
}

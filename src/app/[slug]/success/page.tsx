import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { Check, MapPin, Calendar, Clock, Phone, AlertCircle } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import Link from 'next/link'

interface PageProps {
  params: Promise<{ slug: string }>
  searchParams: Promise<{
    collection_id?: string
    collection_status?: string
    external_reference?: string
    preference_id?: string
    payment_id?: string
  }>
}

export default async function SuccessPage({ params, searchParams }: PageProps) {
  const { slug } = await params
  const sp = await searchParams

  const appointmentId = sp.external_reference
  const paymentId = sp.collection_id || sp.payment_id
  const collectionStatus = sp.collection_status

  if (!appointmentId) {
    return <ErrorCard slug={slug} message="No encontramos tu reserva. Contactá a la barbería." />
  }

  const supabase = await createClient()

  // Fetch barbershop (server-side, includes mp_access_token)
  const { data: barbershop } = await supabase
    .from('barbershops')
    .select('*')
    .eq('slug', slug)
    .single()

  if (!barbershop) notFound()

  // Fetch appointment
  const { data: appointment } = await supabase
    .from('appointments')
    .select('*, barbers(name), services(name, price, duration)')
    .eq('id', appointmentId)
    .single()

  if (!appointment) {
    return <ErrorCard slug={slug} message="No encontramos tu turno. Contactá a la barbería." />
  }

  // If already confirmed (webhook processed it before redirect), just show success
  if (appointment.status === 'confirmed') {
    return <SuccessCard barbershop={barbershop} appointment={appointment} />
  }

  // Verify payment with MP API
  let paymentVerified = false
  let verifyError = ''

  if (collectionStatus === 'approved' && paymentId && barbershop.mp_access_token) {
    try {
      const mpRes = await fetch(
        `https://api.mercadopago.com/v1/payments/${paymentId}`,
        {
          headers: { Authorization: `Bearer ${barbershop.mp_access_token}` },
          cache: 'no-store',
        }
      )

      if (mpRes.ok) {
        const payment = await mpRes.json()
        if (
          payment.status === 'approved' &&
          payment.external_reference === appointmentId
        ) {
          // Confirm appointment
          await supabase
            .from('appointments')
            .update({
              status: 'confirmed',
              deposit_status: 'paid',
              mp_payment_id: String(paymentId),
            })
            .eq('id', appointmentId)

          paymentVerified = true
        } else {
          verifyError = `Estado del pago: ${payment.status}`
        }
      } else {
        verifyError = 'No se pudo verificar el pago con Mercado Pago.'
      }
    } catch {
      verifyError = 'Error al verificar el pago.'
    }
  } else if (collectionStatus === 'pending') {
    // Pago pendiente (ej: transferencia bancaria)
    await supabase
      .from('appointments')
      .update({ deposit_status: 'pending' })
      .eq('id', appointmentId)

    return <PendingCard barbershop={barbershop} appointment={appointment} />
  } else {
    verifyError = 'El pago no fue aprobado.'
  }

  if (!paymentVerified) {
    // Cancel the appointment
    await supabase
      .from('appointments')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancelled_by: 'payment_failed' })
      .eq('id', appointmentId)

    return (
      <ErrorCard
        slug={slug}
        message={verifyError || 'El pago no fue procesado correctamente.'}
        showRetry
      />
    )
  }

  return <SuccessCard barbershop={barbershop} appointment={appointment} />
}

function SuccessCard({ barbershop, appointment }: { barbershop: any; appointment: any }) {
  const apt = appointment
  const depositAmt = apt.deposit_amount ?? 0
  const servicePrice = apt.services?.price ?? 0
  const remaining = servicePrice - depositAmt

  return (
    <main className="min-h-screen bg-[var(--secondary)] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Success icon */}
        <div className="text-center mb-6">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-10 h-10 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-green-700">¡Seña confirmada!</h1>
          <p className="text-[var(--muted)] mt-1">Tu turno quedó reservado</p>
        </div>

        {/* Appointment details */}
        <div className="bg-white rounded-2xl border border-[var(--border)] p-6 space-y-4 mb-4">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
            <span className="font-semibold text-lg">{barbershop.name}</span>
            <span className="text-xs px-2 py-1 bg-green-50 text-green-600 rounded-full font-medium">
              Confirmado ✓
            </span>
          </div>

          <div className="space-y-3 text-sm">
            <InfoRow icon={<Calendar className="w-4 h-4" />} label="Fecha">
              <span className="font-medium capitalize">
                {format(new Date(apt.date + 'T00:00:00'), "EEEE d 'de' MMMM", { locale: es })}
              </span>
            </InfoRow>
            <InfoRow icon={<Clock className="w-4 h-4" />} label="Horario">
              <span className="font-medium">{apt.start_time.slice(0, 5)} hs</span>
            </InfoRow>
            <InfoRow icon={null} label="Servicio">
              <span className="font-medium">{apt.services?.name}</span>
            </InfoRow>
            <InfoRow icon={null} label="Barbero">
              <span className="font-medium">{apt.barbers?.name}</span>
            </InfoRow>

            {/* Dirección — solo visible después del pago */}
            {barbershop.address && (
              <InfoRow icon={<MapPin className="w-4 h-4 text-[var(--primary)]" />} label="Dirección">
                <span className="font-medium text-[var(--primary)]">{barbershop.address}</span>
              </InfoRow>
            )}

            {barbershop.phone && (
              <InfoRow icon={<Phone className="w-4 h-4" />} label="Contacto">
                <a
                  href={`https://wa.me/549${barbershop.phone}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-[var(--primary)] hover:underline"
                >
                  WhatsApp
                </a>
              </InfoRow>
            )}
          </div>

          <div className="border-t border-[var(--border)] pt-3 space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-[var(--muted)]">Seña pagada</span>
              <span className="font-bold text-green-600">
                ${depositAmt.toLocaleString('es-AR')} ✓
              </span>
            </div>
            {remaining > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-[var(--muted)]">Resto a pagar el día</span>
                <span className="font-medium">${remaining.toLocaleString('es-AR')}</span>
              </div>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-[var(--muted)]">
          Guardá esta página como comprobante. ¡Te esperamos, {apt.client_name}!
        </p>

        <div className="mt-6 text-center">
          <Link
            href={`/${barbershop.slug}`}
            className="text-sm text-[var(--primary)] hover:underline"
          >
            ← Volver a {barbershop.name}
          </Link>
        </div>
      </div>
    </main>
  )
}

function PendingCard({ barbershop, appointment }: { barbershop: any; appointment: any }) {
  return (
    <main className="min-h-screen bg-[var(--secondary)] flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <div className="w-20 h-20 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Clock className="w-10 h-10 text-yellow-600" />
        </div>
        <h1 className="text-2xl font-bold text-yellow-700">Pago pendiente</h1>
        <p className="text-[var(--muted)] mt-2 mb-6">
          Tu pago está siendo procesado. Una vez acreditado, recibirás la confirmación.
        </p>
        <div className="bg-white rounded-xl border border-[var(--border)] p-4 text-sm mb-4">
          <p className="font-medium">{appointment.services?.name}</p>
          <p className="text-[var(--muted)]">
            {format(new Date(appointment.date + 'T00:00:00'), "EEEE d 'de' MMMM", { locale: es })}
            {' — '}
            {appointment.start_time.slice(0, 5)} hs
          </p>
        </div>
        {barbershop.phone && (
          <p className="text-sm text-[var(--muted)]">
            Dudas:{' '}
            <a
              href={`https://wa.me/549${barbershop.phone}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--primary)] hover:underline"
            >
              WhatsApp
            </a>
          </p>
        )}
      </div>
    </main>
  )
}

function ErrorCard({ slug, message, showRetry }: { slug: string; message: string; showRetry?: boolean }) {
  return (
    <main className="min-h-screen bg-[var(--secondary)] flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-10 h-10 text-red-600" />
        </div>
        <h1 className="text-2xl font-bold text-red-700">Pago no procesado</h1>
        <p className="text-[var(--muted)] mt-2 mb-6">{message}</p>
        {showRetry && (
          <Link
            href={`/${slug}`}
            className="inline-block px-6 py-3 bg-[var(--primary)] text-white font-semibold rounded-xl hover:bg-[var(--primary-dark)] transition-colors"
          >
            Intentar de nuevo
          </Link>
        )}
      </div>
    </main>
  )
}

function InfoRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-1.5 text-[var(--muted)]">
        {icon}
        <span>{label}</span>
      </div>
      {children}
    </div>
  )
}

import { AlertCircle, Calendar, Check, Clock, MapPin, Phone } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { formatLocalDate } from '@/lib/datetime'
import { createClient } from '@/lib/supabase/server'
import PaymentStatusPolling from './payment-status-polling'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

interface PageProps {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ external_reference?: string }>
}

interface BarbershopView {
  id: string
  name: string
  slug: string
  address: string | null
  phone: string | null
}

interface AppointmentView {
  date: string
  start_time: string
  status: string
  deposit_status: string | null
  deposit_amount: number | null
  barber_name: string
  service_name: string | null
  service_price: number | null
}

export default async function SuccessPage({ params, searchParams }: PageProps) {
  const { slug } = await params
  const { external_reference: appointmentId } = await searchParams

  if (!appointmentId || !UUID_PATTERN.test(appointmentId)) {
    return <ErrorCard slug={slug} message="No encontramos esa reserva." />
  }

  const supabase = await createClient()
  const { data: barbershop, error: barbershopError } = await supabase
    .from('barbershops')
    .select('id, name, slug, address, phone')
    .eq('slug', slug)
    .maybeSingle()

  if (barbershopError) {
    return <ErrorCard slug={slug} message="No pudimos consultar el estado de tu reserva." />
  }

  if (!barbershop) notFound()

  const { data: appointmentData, error: appointmentError } = await supabase
    .rpc('get_public_appointment_result', {
      p_appointment_id: appointmentId,
      p_barbershop_id: barbershop.id,
    })
    .maybeSingle()
  const appointment = appointmentData as AppointmentView | null

  if (appointmentError || !appointment) {
    return <ErrorCard slug={slug} message="No encontramos esa reserva." />
  }

  if (appointment.status === 'confirmed' && appointment.deposit_status === 'paid') {
    return (
      <SuccessCard
        barbershop={barbershop}
        appointment={appointment}
      />
    )
  }

  if (appointment.status === 'pending_payment' && appointment.deposit_status === 'pending') {
    return (
      <PendingCard
        barbershop={barbershop}
        appointment={appointment}
        appointmentId={appointmentId}
      />
    )
  }

  return (
    <ErrorCard
      slug={slug}
      message="El pago no figura confirmado. Si ya pagaste, contactá a la barbería."
    />
  )
}

function SuccessCard({
  barbershop,
  appointment,
}: {
  barbershop: BarbershopView
  appointment: AppointmentView
}) {
  const depositAmount = Number(appointment.deposit_amount) || 0
  const servicePrice = Number(appointment.service_price) || 0
  const remaining = Math.max(servicePrice - depositAmount, 0)

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-10 h-10 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-green-700">¡Pago confirmado!</h1>
          <p className="text-gray-500 mt-1">Tu turno quedó reservado.</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4 mb-4">
          <div className="flex items-center justify-between pb-3 border-b border-gray-200">
            <span className="font-semibold text-lg">{barbershop.name}</span>
            <span className="text-xs px-2 py-1 bg-green-50 text-green-600 rounded-full font-medium">
              Confirmado ✓
            </span>
          </div>

          <AppointmentDetails barbershop={barbershop} appointment={appointment} />

          <div className="border-t border-gray-200 pt-3 space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Seña pagada</span>
              <span className="font-bold text-green-600">
                ${depositAmount.toLocaleString('es-AR')} ✓
              </span>
            </div>
            {remaining > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Resto a pagar el día</span>
                <span className="font-medium">${remaining.toLocaleString('es-AR')}</span>
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 text-center">
          <Link href={`/${barbershop.slug}`} className="text-sm text-purple-600 hover:underline">
            ← Volver a {barbershop.name}
          </Link>
        </div>
      </div>
    </main>
  )
}

function PendingCard({
  barbershop,
  appointment,
  appointmentId,
}: {
  barbershop: BarbershopView
  appointment: AppointmentView
  appointmentId: string
}) {
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <PaymentStatusPolling appointmentId={appointmentId} slug={barbershop.slug} />
      <div className="w-full max-w-md text-center">
        <div className="w-20 h-20 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Clock className="w-10 h-10 text-yellow-600" />
        </div>
        <h1 className="text-2xl font-bold text-yellow-700">Estamos verificando tu pago</h1>
        <p className="text-gray-500 mt-2 mb-6">
          Puede tardar unos segundos. Esta pantalla se actualizará automáticamente cuando recibamos la confirmación.
        </p>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-sm mb-4">
          <p className="font-medium">{appointment.service_name}</p>
          <p className="text-gray-500">
            {formatLocalDate(appointment.date, { weekday: 'long', day: 'numeric', month: 'long' })}
            {' — '}
            {appointment.start_time.slice(0, 5)} hs
          </p>
        </div>
        {barbershop.phone && (
          <p className="text-sm text-gray-500">
            Dudas:{' '}
            <a
              href={`https://wa.me/549${barbershop.phone}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-purple-600 hover:underline"
            >
              WhatsApp
            </a>
          </p>
        )}
      </div>
    </main>
  )
}

function AppointmentDetails({
  barbershop,
  appointment,
}: {
  barbershop: BarbershopView
  appointment: AppointmentView
}) {
  return (
    <div className="space-y-3 text-sm">
      <InfoRow icon={<Calendar className="w-4 h-4" />} label="Fecha">
        <span className="font-medium capitalize">
          {formatLocalDate(appointment.date, { weekday: 'long', day: 'numeric', month: 'long' })}
        </span>
      </InfoRow>
      <InfoRow icon={<Clock className="w-4 h-4" />} label="Horario">
        <span className="font-medium">{appointment.start_time.slice(0, 5)} hs</span>
      </InfoRow>
      <InfoRow icon={null} label="Servicio">
        <span className="font-medium">{appointment.service_name}</span>
      </InfoRow>
      <InfoRow icon={null} label="Barbero">
        <span className="font-medium">{appointment.barber_name}</span>
      </InfoRow>
      {barbershop.address && (
        <InfoRow icon={<MapPin className="w-4 h-4 text-purple-600" />} label="Dirección">
          <span className="font-medium text-purple-600">{barbershop.address}</span>
        </InfoRow>
      )}
      {barbershop.phone && (
        <InfoRow icon={<Phone className="w-4 h-4" />} label="Contacto">
          <a
            href={`https://wa.me/549${barbershop.phone}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-purple-600 hover:underline"
          >
            WhatsApp
          </a>
        </InfoRow>
      )}
    </div>
  )
}

function ErrorCard({ slug, message }: { slug: string; message: string }) {
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-10 h-10 text-red-600" />
        </div>
        <h1 className="text-2xl font-bold text-red-700">No pudimos mostrar la reserva</h1>
        <p className="text-[var(--muted)] mt-2 mb-6">{message}</p>
        <Link
          href={`/${slug}`}
          className="inline-block px-6 py-3 bg-[var(--primary)] text-white font-semibold rounded-xl hover:bg-[var(--primary-dark)] transition-colors"
        >
          Volver a la barbería
        </Link>
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

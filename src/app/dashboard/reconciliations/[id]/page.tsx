import { ArrowLeft, Calendar, CircleDollarSign, Info, UserRound } from 'lucide-react'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { formatLocalDate } from '@/lib/datetime'
import {
  formatReconciliationAmount,
  getAppointmentStatusLabel,
  getDepositStatusLabel,
  getReconciliationReasonLabel,
  getReconciliationStatusClass,
  getReconciliationStatusLabel,
} from '@/lib/reconciliations'
import { createClient } from '@/lib/supabase/server'

import ResolveRetainedForm from './resolve-retained-form'

interface ReconciliationDetail {
  id: string
  amount: number
  currency: string
  reason: string
  status: string
  detected_at: string
  mp_payment_id: string
  mp_preference_id: string | null
  resolution_notes: string | null
  resolved_at: string | null
  appointments: {
    id: string
    date: string
    start_time: string
    end_time: string
    status: string
    deposit_status: string
    client_name: string | null
    client_phone: string | null
    barbers: { name: string } | null
    services: { name: string } | null
  } | null
}

export default async function ReconciliationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: barbershop } = await supabase
    .from('barbershops')
    .select('id, timezone')
    .eq('owner_id', user.id)
    .single()

  if (!barbershop) redirect('/dashboard')

  const { data } = await supabase
    .from('payment_reconciliations')
    .select(`
      id,
      amount,
      currency,
      reason,
      status,
      detected_at,
      mp_payment_id,
      mp_preference_id,
      resolution_notes,
      resolved_at,
      appointments!inner(
        id,
        date,
        start_time,
        end_time,
        status,
        deposit_status,
        client_name,
        client_phone,
        barbers(name),
        services(name)
      )
    `)
    .eq('id', id)
    .eq('barbershop_id', barbershop.id)
    .maybeSingle()

  if (!data) notFound()

  const reconciliation = data as unknown as ReconciliationDetail
  const appointment = reconciliation.appointments

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/dashboard/reconciliations"
        className="mb-5 inline-flex items-center gap-2 text-sm text-[var(--muted)] hover:text-[var(--primary)]"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a conciliaciones
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Detalle de conciliación</h1>
          <p className="mt-1 text-[var(--muted)]">{getReconciliationReasonLabel(reconciliation.reason)}</p>
        </div>
        <span className={`rounded-full px-3 py-1.5 text-sm font-medium ${getReconciliationStatusClass(reconciliation.status)}`}>
          {getReconciliationStatusLabel(reconciliation.status)}
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="rounded-xl border border-[var(--border)] bg-white p-5">
            <div className="mb-3 flex items-center gap-2">
              <Info className="h-5 w-5 text-amber-600" />
              <h2 className="font-semibold">Qué pasó</h2>
            </div>
            <p className="text-sm text-[var(--muted)]">
              {getReconciliationReasonLabel(reconciliation.reason)}. El turno no fue confirmado y el pago requiere una decisión manual.
            </p>
          </section>

          <section className="rounded-xl border border-[var(--border)] bg-white p-5">
            <div className="mb-4 flex items-center gap-2">
              <Calendar className="h-5 w-5 text-[var(--primary)]" />
              <h2 className="font-semibold">Turno original</h2>
            </div>
            {appointment ? (
              <dl className="grid gap-4 text-sm sm:grid-cols-2">
                <Detail label="Fecha" value={formatLocalDate(appointment.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} />
                <Detail label="Horario" value={`${appointment.start_time.slice(0, 5)} – ${appointment.end_time.slice(0, 5)}`} />
                <Detail label="Barbero" value={appointment.barbers?.name || 'No disponible'} />
                <Detail label="Servicio" value={appointment.services?.name || 'No disponible'} />
                <Detail label="Estado del turno" value={getAppointmentStatusLabel(appointment.status)} />
                <Detail label="Estado de seña" value={getDepositStatusLabel(appointment.deposit_status)} />
              </dl>
            ) : (
              <p className="text-sm text-[var(--muted)]">El turno original no está disponible.</p>
            )}
          </section>

          <section className="rounded-xl border border-[var(--border)] bg-white p-5">
            <div className="mb-4 flex items-center gap-2">
              <UserRound className="h-5 w-5 text-[var(--primary)]" />
              <h2 className="font-semibold">Cliente</h2>
            </div>
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <Detail label="Nombre" value={appointment?.client_name || 'No disponible'} />
              <Detail label="Teléfono" value={appointment?.client_phone || 'No disponible'} />
            </dl>
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-xl border border-[var(--border)] bg-white p-5">
            <div className="mb-4 flex items-center gap-2">
              <CircleDollarSign className="h-5 w-5 text-green-600" />
              <h2 className="font-semibold">Pago</h2>
            </div>
            <dl className="space-y-4 text-sm">
              <Detail label="Monto" value={formatReconciliationAmount(Number(reconciliation.amount), reconciliation.currency)} />
              <Detail label="Payment ID" value={reconciliation.mp_payment_id} mono />
              <Detail label="Preference ID" value={reconciliation.mp_preference_id || 'No disponible'} mono />
              <Detail
                label="Detectado"
                value={new Intl.DateTimeFormat('es-AR', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                  timeZone: barbershop.timezone,
                }).format(new Date(reconciliation.detected_at))}
              />
            </dl>
          </section>

          {reconciliation.status === 'pending_review' ? (
            <section className="rounded-xl border border-[var(--border)] bg-white p-5">
              <h2 className="mb-2 font-semibold">Qué podés hacer</h2>
              <p className="mb-4 text-sm text-[var(--muted)]">
                Podés cerrar la revisión si acordaste conservar el pago, por ejemplo después de reprogramar al cliente.
              </p>
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                Esto no realiza un reembolso en Mercado Pago.
              </div>
              <ResolveRetainedForm reconciliationId={reconciliation.id} />
            </section>
          ) : reconciliation.resolution_notes ? (
            <section className="rounded-xl border border-[var(--border)] bg-white p-5">
              <h2 className="mb-2 font-semibold">Resolución</h2>
              <p className="whitespace-pre-wrap text-sm text-[var(--muted)]">{reconciliation.resolution_notes}</p>
              {reconciliation.resolved_at && (
                <p className="mt-3 text-xs text-[var(--muted)]">
                  Resuelto {new Intl.DateTimeFormat('es-AR', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                    timeZone: barbershop.timezone,
                  }).format(new Date(reconciliation.resolved_at))}
                </p>
              )}
            </section>
          ) : (
            <section className="rounded-xl border border-[var(--border)] bg-white p-5">
              <h2 className="mb-2 font-semibold">Estado de la revisión</h2>
              <p className="text-sm text-[var(--muted)]">
                Este estado no admite acciones manuales en esta etapa.
              </p>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}

function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</dt>
      <dd className={`mt-1 break-words font-medium ${mono ? 'font-mono text-xs' : ''}`}>{value}</dd>
    </div>
  )
}

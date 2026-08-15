import Link from 'next/link'
import { AlertTriangle, ArrowRight, CheckCircle2 } from 'lucide-react'
import { redirect } from 'next/navigation'

import { formatLocalDate } from '@/lib/datetime'
import {
  formatReconciliationAmount,
  getReconciliationReasonLabel,
  getReconciliationStatusClass,
  getReconciliationStatusLabel,
  maskPaymentId,
} from '@/lib/reconciliations'
import { createClient } from '@/lib/supabase/server'

type Filter = 'pending' | 'resolved' | 'all'

interface ReconciliationRow {
  id: string
  amount: number
  currency: string
  reason: string
  status: string
  detected_at: string
  mp_payment_id: string
  appointments: {
    date: string
    start_time: string
    client_name: string | null
    client_phone: string | null
    barbers: { name: string } | null
    services: { name: string } | null
  } | null
}

export default async function ReconciliationsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: barbershop } = await supabase
    .from('barbershops')
    .select('id, name, timezone')
    .eq('owner_id', user.id)
    .single()

  if (!barbershop) redirect('/dashboard')

  const requestedFilter = (await searchParams).filter
  const filter: Filter = requestedFilter === 'resolved' || requestedFilter === 'all'
    ? requestedFilter
    : 'pending'

  let query = supabase
    .from('payment_reconciliations')
    .select(`
      id,
      amount,
      currency,
      reason,
      status,
      detected_at,
      mp_payment_id,
      appointments!inner(
        date,
        start_time,
        client_name,
        client_phone,
        barbers(name),
        services(name)
      )
    `)
    .eq('barbershop_id', barbershop.id)
    .order('detected_at', { ascending: false })

  if (filter === 'pending') query = query.in('status', ['pending_review', 'refund_failed'])
  if (filter === 'resolved') query = query.in('status', ['refunded', 'resolved_retained'])

  const { data, error } = await query
  const reconciliations = (data || []) as unknown as ReconciliationRow[]

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Conciliaciones</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Pagos acreditados que requieren una revisión manual en {barbershop.name}.
        </p>
      </div>

      <div className="mb-6 flex w-fit gap-1 rounded-xl border border-[var(--border)] bg-[var(--secondary)] p-1">
        {([
          ['pending', 'Pendientes'],
          ['resolved', 'Resueltas'],
          ['all', 'Todas'],
        ] as const).map(([value, label]) => (
          <Link
            key={value}
            href={`/dashboard/reconciliations?filter=${value}`}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              filter === value
                ? 'bg-white text-[var(--primary)] shadow-sm'
                : 'text-[var(--muted)] hover:text-[var(--foreground)]'
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          No se pudieron cargar las conciliaciones. Intentá nuevamente.
        </div>
      ) : reconciliations.length === 0 ? (
        <div className="rounded-xl border border-[var(--border)] bg-white p-10 text-center text-[var(--muted)]">
          <CheckCircle2 className="mx-auto mb-3 h-10 w-10 opacity-30" />
          <p className="font-medium">No hay conciliaciones en esta vista</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reconciliations.map(reconciliation => {
            const appointment = reconciliation.appointments
            return (
              <article key={reconciliation.id} className="rounded-xl border border-[var(--border)] bg-white p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                  <div className="flex min-w-0 flex-1 gap-3">
                    <div className="mt-0.5 rounded-lg bg-amber-50 p-2 text-amber-600">
                      <AlertTriangle className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold">{getReconciliationReasonLabel(reconciliation.reason)}</p>
                      <p className="mt-1 text-sm text-[var(--muted)]">
                        {appointment?.client_name || 'Cliente sin nombre'}
                        {appointment?.client_phone ? ` · ${appointment.client_phone}` : ''}
                      </p>
                      {appointment && (
                        <p className="text-sm text-[var(--muted)]">
                          {formatLocalDate(appointment.date, { day: 'numeric', month: 'long', year: 'numeric' })}
                          {' · '}{appointment.start_time.slice(0, 5)}
                          {' · '}{appointment.barbers?.name || 'Barbero no disponible'}
                          {' · '}{appointment.services?.name || 'Servicio no disponible'}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        Detectado {new Intl.DateTimeFormat('es-AR', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                          timeZone: barbershop.timezone,
                        }).format(new Date(reconciliation.detected_at))}
                        {' · '}Pago {maskPaymentId(reconciliation.mp_payment_id)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 lg:justify-end">
                    <div className="text-right">
                      <p className="font-bold">
                        {formatReconciliationAmount(Number(reconciliation.amount), reconciliation.currency)}
                      </p>
                      <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${getReconciliationStatusClass(reconciliation.status)}`}>
                        {getReconciliationStatusLabel(reconciliation.status)}
                      </span>
                    </div>
                    <Link
                      href={`/dashboard/reconciliations/${reconciliation.id}`}
                      className="flex items-center gap-1 rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium hover:border-[var(--primary)] hover:text-[var(--primary)]"
                    >
                      Ver detalle <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}

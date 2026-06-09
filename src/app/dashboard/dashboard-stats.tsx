'use client'

import { useState } from 'react'
import {
  Calendar, DollarSign, Users, Clock,
  Check, Ban, ArrowRight, Scissors, Settings,
  TrendingUp, X
} from 'lucide-react'
import Link from 'next/link'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

type Period = 'today' | 'week' | 'month'

interface PeriodStats {
  total: number
  completed: number
  revenue: number
  noShows: number
  cancelled: number
}

interface Appointment {
  id: string
  date: string
  start_time: string
  end_time: string
  status: string
  client_name: string | null
  client_phone: string | null
  barbers: { name: string } | null
  services: { name: string; price: number } | null
}

interface Props {
  barbershop: { name: string; slug: string }
  todayLabel: string
  today: PeriodStats & { appointments: Appointment[]; nextApt: Appointment | null }
  week: PeriodStats
  month: PeriodStats & { topService: { name: string; count: number } | null; avgPerDay: number }
  upcoming: Appointment[]
}

export default function DashboardStats({
  barbershop,
  todayLabel,
  today,
  week,
  month,
  upcoming,
}: Props) {
  const [period, setPeriod] = useState<Period>('today')

  const stats = period === 'today' ? today : period === 'week' ? week : month

  const completionRate =
    stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0
  const noShowRate =
    stats.total > 0 ? Math.round((stats.noShows / stats.total) * 100) : 0

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold capitalize">{todayLabel}</h1>
          <p className="text-[var(--muted)]">{barbershop.name}</p>
        </div>
        <Link
          href={`/${barbershop.slug}`}
          target="_blank"
          className="flex items-center gap-2 px-4 py-2 bg-[var(--secondary)] border border-[var(--border)] rounded-lg text-sm font-medium hover:bg-[var(--primary)] hover:text-white hover:border-[var(--primary)] transition-all"
        >
          Ver mi página
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      {/* Period tabs */}
      <div className="flex gap-1 p-1 bg-[var(--secondary)] rounded-xl w-fit mb-6 border border-[var(--border)]">
        {(['today', 'week', 'month'] as Period[]).map(p => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
              period === p
                ? 'bg-white text-[var(--primary)] shadow-sm'
                : 'text-[var(--muted)] hover:text-[var(--foreground)]'
            }`}
          >
            {p === 'today' ? 'Hoy' : p === 'week' ? 'Esta semana' : 'Este mes'}
          </button>
        ))}
      </div>

      {/* Main stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          icon={<Calendar className="w-5 h-5" />}
          label="Turnos"
          value={String(stats.total)}
          sub={stats.cancelled > 0 ? `${stats.cancelled} cancelado${stats.cancelled > 1 ? 's' : ''}` : undefined}
          colorClass="text-blue-500 bg-blue-50"
        />
        <StatCard
          icon={<DollarSign className="w-5 h-5" />}
          label="Facturado"
          value={`$${stats.revenue.toLocaleString('es-AR')}`}
          sub={stats.completed > 0 ? `${stats.completed} cobrado${stats.completed > 1 ? 's' : ''}` : undefined}
          colorClass="text-green-500 bg-green-50"
        />
        <StatCard
          icon={<Check className="w-5 h-5" />}
          label="Completados"
          value={String(stats.completed)}
          sub={stats.total > 0 ? `${completionRate}% del total` : undefined}
          colorClass="text-[var(--primary)] bg-purple-50"
        />
        <StatCard
          icon={<Ban className="w-5 h-5" />}
          label="No asistieron"
          value={String(stats.noShows)}
          sub={stats.total > 0 ? `${noShowRate}% del total` : undefined}
          colorClass="text-red-500 bg-red-50"
        />
      </div>

      {/* Extra info per period */}
      {period === 'today' && today.nextApt && (
        <div className="bg-gradient-to-r from-[var(--primary)] to-[var(--primary-light)] text-white rounded-xl p-4 mb-6">
          <p className="text-white/70 text-xs font-medium uppercase tracking-wide mb-1">Próximo turno</p>
          <p className="text-xl font-bold">
            {today.nextApt.start_time.slice(0, 5)} — {today.nextApt.client_name || 'Sin nombre'}
          </p>
          <p className="text-white/80 text-sm mt-0.5">
            {today.nextApt.services?.name} · {today.nextApt.barbers?.name}
          </p>
        </div>
      )}

      {period === 'week' && (
        <div className="grid sm:grid-cols-2 gap-4 mb-6">
          <div className="bg-white border border-[var(--border)] rounded-xl p-4">
            <p className="text-xs text-[var(--muted)] uppercase tracking-wide mb-1">Promedio diario</p>
            <p className="text-2xl font-bold">{Math.round(week.total / 7)} turnos</p>
            <p className="text-sm text-[var(--muted)] mt-1">
              ${Math.round(week.revenue / 7).toLocaleString('es-AR')} promedio facturado/día
            </p>
          </div>
          <div className="bg-white border border-[var(--border)] rounded-xl p-4">
            <p className="text-xs text-[var(--muted)] uppercase tracking-wide mb-1">Eficiencia</p>
            <p className="text-2xl font-bold">{completionRate}%</p>
            <p className="text-sm text-[var(--muted)] mt-1">
              turnos completados de {week.total} tomados
            </p>
          </div>
        </div>
      )}

      {period === 'month' && (
        <div className="grid sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-white border border-[var(--border)] rounded-xl p-4">
            <p className="text-xs text-[var(--muted)] uppercase tracking-wide mb-1">Promedio por día</p>
            <p className="text-2xl font-bold">{month.avgPerDay}</p>
            <p className="text-sm text-[var(--muted)] mt-1">turnos por día este mes</p>
          </div>
          {month.topService && (
            <div className="bg-white border border-[var(--border)] rounded-xl p-4">
              <p className="text-xs text-[var(--muted)] uppercase tracking-wide mb-1">Servicio más pedido</p>
              <p className="text-xl font-bold truncate">{month.topService.name}</p>
              <p className="text-sm text-[var(--muted)] mt-1">{month.topService.count} veces este mes</p>
            </div>
          )}
          <div className="bg-white border border-[var(--border)] rounded-xl p-4">
            <p className="text-xs text-[var(--muted)] uppercase tracking-wide mb-1">Tasa de presentación</p>
            <p className="text-2xl font-bold text-green-600">{completionRate}%</p>
            <p className="text-sm text-[var(--muted)] mt-1">
              {month.noShows > 0 ? `${month.noShows} no asistieron` : 'Sin plantones ✓'}
            </p>
          </div>
        </div>
      )}

      {/* Main content grid */}
      <div className="grid lg:grid-cols-3 gap-6">

        {/* Today's appointments */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-[var(--border)]">
          <div className="p-4 border-b border-[var(--border)] flex items-center justify-between">
            <h2 className="font-semibold">Turnos de hoy</h2>
            <Link
              href="/dashboard/agenda"
              className="text-sm text-[var(--primary)] hover:underline flex items-center gap-1"
            >
              Ver agenda <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {today.appointments.filter(a => a.status !== 'cancelled').length === 0 ? (
            <div className="p-10 text-center text-[var(--muted)]">
              <Calendar className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Sin turnos para hoy</p>
              <Link
                href="/dashboard/agenda"
                className="text-sm text-[var(--primary)] hover:underline mt-2 inline-block"
              >
                Crear turno manual
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {today.appointments
                .filter(a => a.status !== 'cancelled')
                .map(apt => (
                <div key={apt.id} className="p-4 flex items-center gap-4">
                  <div className="text-center min-w-[52px]">
                    <p className="font-bold text-sm">{apt.start_time.slice(0, 5)}</p>
                    <p className="text-xs text-[var(--muted)]">{apt.end_time.slice(0, 5)}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{apt.client_name || 'Sin nombre'}</p>
                    <p className="text-sm text-[var(--muted)] truncate">
                      {apt.services?.name} · {apt.barbers?.name}
                    </p>
                  </div>
                  <StatusBadge status={apt.status} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-4">

          {/* Upcoming 7 days */}
          {upcoming.length > 0 && (
            <div className="bg-white rounded-xl border border-[var(--border)]">
              <div className="p-4 border-b border-[var(--border)] flex items-center gap-2">
                <Clock className="w-4 h-4 text-[var(--primary)]" />
                <h2 className="font-semibold text-sm">Próximos 7 días</h2>
              </div>
              <div className="divide-y divide-[var(--border)]">
                {upcoming.map(apt => (
                  <div key={apt.id} className="p-3 flex items-center gap-3">
                    <div className="min-w-[72px]">
                      <p className="text-xs font-semibold text-[var(--primary)] capitalize">
                        {format(new Date(apt.date + 'T00:00:00'), 'EEE d/M', { locale: es })}
                      </p>
                      <p className="text-xs text-[var(--muted)]">{apt.start_time.slice(0, 5)}</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{apt.client_name || 'Sin nombre'}</p>
                      <p className="text-xs text-[var(--muted)] truncate">{apt.services?.name}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick links */}
          <div className="bg-white rounded-xl border border-[var(--border)] p-4">
            <h2 className="font-semibold text-sm mb-3">Accesos rápidos</h2>
            <div className="space-y-1">
              <QuickLink href="/dashboard/agenda" icon={<Calendar className="w-4 h-4" />} label="Agenda" />
              <QuickLink href="/dashboard/services" icon={<Scissors className="w-4 h-4" />} label="Servicios" />
              <QuickLink href="/dashboard/barbers" icon={<Users className="w-4 h-4" />} label="Barberos" />
              <QuickLink href="/dashboard/settings" icon={<Settings className="w-4 h-4" />} label="Configuración" />
            </div>
          </div>

          {/* Revenue summary card */}
          {month.revenue > 0 && (
            <div className="bg-gradient-to-br from-[var(--primary)] to-[var(--primary-dark)] text-white rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-yellow-300" />
                <p className="text-white/70 text-xs font-medium uppercase tracking-wide">Mes actual</p>
              </div>
              <p className="text-2xl font-bold">${month.revenue.toLocaleString('es-AR')}</p>
              <p className="text-white/70 text-sm mt-1">{month.total} turno{month.total !== 1 ? 's' : ''} tomados</p>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
  sub,
  colorClass,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
  colorClass: string
}) {
  return (
    <div className="bg-white p-4 rounded-xl border border-[var(--border)] hover:shadow-sm transition-shadow">
      <div className={`inline-flex p-2 rounded-lg ${colorClass} mb-3`}>
        {icon}
      </div>
      <p className="text-2xl font-bold leading-none">{value}</p>
      <p className="text-xs text-[var(--muted)] mt-1">{label}</p>
      {sub && <p className="text-xs text-[var(--muted)] mt-0.5 opacity-70">{sub}</p>}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    confirmed: { label: 'Confirmado', className: 'bg-blue-50 text-blue-600' },
    completed: { label: 'Completado', className: 'bg-green-50 text-green-600' },
    pending:   { label: 'Pendiente',  className: 'bg-yellow-50 text-yellow-600' },
    no_show:   { label: 'No asistió', className: 'bg-red-50 text-red-600' },
  }
  const s = map[status] || { label: status, className: 'bg-gray-50 text-gray-600' }
  return (
    <span className={`text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap ${s.className}`}>
      {s.label}
    </span>
  )
}

function QuickLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 p-2 rounded-lg hover:bg-[var(--secondary)] transition-colors text-sm group"
    >
      <span className="text-[var(--muted)] group-hover:text-[var(--primary)] transition-colors">{icon}</span>
      <span className="font-medium flex-1">{label}</span>
      <ArrowRight className="w-3 h-3 text-[var(--muted)] opacity-0 group-hover:opacity-100 transition-opacity" />
    </Link>
  )
}

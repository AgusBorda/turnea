'use client'

import { useEffect, useState } from 'react'
import { DashboardBarber } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { CalendarClock, CircleAlert, MoreHorizontal, Pencil, Plus, PowerOff, RotateCcw, UserRound, UsersRound, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button as AriaButton, Menu, MenuItem, MenuTrigger, Popover } from 'react-aria-components'
import Button from '@/components/ui/button'
import FormField from '@/components/ui/form-field'
import { inputClassName } from '@/components/ui/input-styles'
import SectionHeader from '@/components/ui/section-header'
import { ToastViewport, useToast } from '@/components/ui/toast'

interface Props {
  barbershopId: string
  initialBarbers: DashboardBarber[]
}

export default function BarbersManager({ barbershopId, initialBarbers }: Props) {
  const barbers = initialBarbers
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<DashboardBarber | null>(null)
  const [loading, setLoading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [pendingDeactivation, setPendingDeactivation] = useState<DashboardBarber | null>(null)
  const [lifecycleLoadingId, setLifecycleLoadingId] = useState<string | null>(null)
  const [deactivationError, setDeactivationError] = useState<string | null>(null)
  const router = useRouter()
  const { toasts, showToast, dismissToast } = useToast()

  const [name, setName] = useState('')
  const [bio, setBio] = useState('')

  useEffect(() => {
    if (!showForm && !pendingDeactivation) return
    function handleEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape' || loading || lifecycleLoadingId) return
      setShowForm(false)
      setPendingDeactivation(null)
      setDeactivationError(null)
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [showForm, pendingDeactivation, loading, lifecycleLoadingId])

  function openNew() {
    setEditing(null)
    setName('')
    setBio('')
    setFormError(null)
    setShowForm(true)
  }

  function openEdit(barber: DashboardBarber) {
    setEditing(barber)
    setName(barber.name)
    setBio(barber.bio || '')
    setFormError(null)
    setShowForm(true)
  }

  async function handleSave() {
    const normalizedName = name.trim()
    const normalizedBio = bio.trim()
    if (loading || !normalizedName) return
    if (normalizedName.length > 120) {
      setFormError('El nombre no puede superar los 120 caracteres.')
      return
    }
    if (normalizedBio.length > 500) {
      setFormError('La bio no puede superar los 500 caracteres.')
      return
    }
    setLoading(true)
    setFormError(null)

    const supabase = createClient()

    if (editing) {
      const { error } = await supabase
        .from('barbers')
        .update({ name: normalizedName, bio: normalizedBio || null })
        .eq('id', editing.id)
        .eq('barbershop_id', barbershopId)
        .select('id')
        .single()

      if (error) {
        setFormError('No pudimos guardar el barbero. Intentá nuevamente.')
        setLoading(false)
        return
      }
      showToast({ message: 'Barbero actualizado', tone: 'success' })
    } else {
      const { data, error } = await supabase
        .rpc('create_barber_with_default_schedule', {
          p_barbershop_id: barbershopId,
          p_name: normalizedName,
          p_bio: normalizedBio || null,
        })
        .single()

      if (error || !data) {
        setFormError(
          error?.message.includes('INVALID_BARBER_NAME')
            ? 'Ingresá un nombre válido de hasta 120 caracteres.'
            : error?.message.includes('INVALID_BARBER_BIO')
              ? 'La bio no puede superar los 500 caracteres.'
              : 'No se pudo crear el barbero. Revisá los datos o recargá para comprobar si ya fue creado.'
        )
        setLoading(false)
        return
      }

      showToast({ message: 'Barbero creado', tone: 'success' })
    }

    setShowForm(false)
    setLoading(false)
    router.refresh()
  }

  async function handleDeactivate() {
    if (!pendingDeactivation || lifecycleLoadingId) return
    setLifecycleLoadingId(pendingDeactivation.id)
    setDeactivationError(null)
    const { data, error } = await createClient().from('barbers')
      .update({ active: false })
      .eq('id', pendingDeactivation.id)
      .eq('barbershop_id', barbershopId)
      .select('id').single()
    setLifecycleLoadingId(null)
    if (error || !data) {
      setDeactivationError('No pudimos desactivar el barbero. Intentá nuevamente.')
      return
    }
    setPendingDeactivation(null)
    showToast({ message: 'Barbero desactivado', tone: 'success' })
    router.refresh()
  }

  async function handleReactivate(barber: DashboardBarber) {
    if (lifecycleLoadingId) return
    setLifecycleLoadingId(barber.id)
    const { data, error } = await createClient().from('barbers')
      .update({ active: true })
      .eq('id', barber.id)
      .eq('barbershop_id', barbershopId)
      .select('id').single()
    setLifecycleLoadingId(null)
    if (error || !data) {
      showToast({ message: 'No pudimos reactivar el barbero. Intentá nuevamente.', tone: 'error' })
      return
    }
    showToast({ message: 'Barbero reactivado', tone: 'success' })
    router.refresh()
  }

  return (
    <div className="space-y-8">
      <SectionHeader
        title="Barberos"
        description="Administrá tu equipo y configurá la disponibilidad de cada profesional."
        action={(
          <Button type="button" onClick={openNew} className="w-full sm:w-auto">
            <Plus className="h-4 w-4" aria-hidden="true" />
            Nuevo barbero
          </Button>
        )}
      />

      <div className="space-y-8">
        {barbers.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--border)] bg-white px-5 py-12 text-center">
            <UsersRound className="mx-auto h-7 w-7 text-[var(--primary)]" aria-hidden="true" />
            <h2 className="mt-3 font-semibold text-[var(--foreground)]">Todavía no hay barberos</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">Agregá el primero para configurar sus horarios y recibir turnos.</p>
          </div>
        ) : (
          <>
            <BarberGroup
              title="Activos"
              description="Disponibles para Booking, Agenda y nuevas reservas."
              barbers={barbers.filter(barber => barber.active)}
              lifecycleLoadingId={lifecycleLoadingId}
              onEdit={openEdit}
              onDeactivate={setPendingDeactivation}
              onReactivate={handleReactivate}
            />
            {barbers.some(barber => !barber.active) && (
              <BarberGroup
                title="Inactivos"
                description="No aparecen en Booking ni pueden recibir nuevas reservas."
                barbers={barbers.filter(barber => !barber.active)}
                lifecycleLoadingId={lifecycleLoadingId}
                onEdit={openEdit}
                onDeactivate={setPendingDeactivation}
                onReactivate={handleReactivate}
              />
            )}
          </>
        )}
      </div>

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex min-h-dvh items-center justify-center overflow-y-auto bg-slate-950/45 p-4 backdrop-blur-[2px]" role="presentation">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl sm:p-6" role="dialog" aria-modal="true" aria-labelledby="barber-form-title">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h3 id="barber-form-title" className="text-lg font-semibold">{editing ? 'Editar barbero' : 'Nuevo barbero'}</h3>
                <p className="mt-1 text-sm text-[var(--muted)]">{editing ? 'Actualizá la información del profesional.' : 'Al crearlo tendrá horarios iniciales de lunes a sábado.'}</p>
              </div>
              <button onClick={() => setShowForm(false)} disabled={loading} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[var(--muted)] hover:bg-[var(--secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]" aria-label="Cerrar formulario">
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="space-y-5">
              <FormField label="Nombre" htmlFor="barber-name">
                <input
                  id="barber-name"
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className={`${inputClassName} w-full`}
                  placeholder="Ej: Martín"
                  maxLength={121}
                  autoFocus
                />
              </FormField>
              <FormField label="Bio / especialidad" htmlFor="barber-bio" help={`${bio.length}/500 caracteres`}>
                <textarea
                  id="barber-bio"
                  value={bio}
                  onChange={e => setBio(e.target.value)}
                  className={`${inputClassName} min-h-24 w-full resize-y`}
                  placeholder="Ej: Especialista en fades"
                  maxLength={501}
                />
              </FormField>
            </div>

            {formError && (
              <div role="alert" className="mt-4 flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {formError}
              </div>
            )}

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowForm(false)}
                disabled={loading}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={handleSave}
                disabled={loading || !name.trim()}
              >
                {loading ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear barbero'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {pendingDeactivation && (
        <div className="fixed inset-0 z-50 flex min-h-dvh items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[2px]" role="presentation">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl sm:p-6" role="dialog" aria-modal="true" aria-labelledby="deactivate-barber-title">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-50 text-red-600">
              <PowerOff className="h-5 w-5" aria-hidden="true" />
            </div>
            <h2 id="deactivate-barber-title" className="mt-4 text-lg font-semibold">¿Desactivar barbero?</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              {pendingDeactivation.name} dejará de aparecer en Booking y no podrá recibir nuevas reservas. Sus turnos e historial no se eliminan.
            </p>
            {deactivationError && <p role="alert" className="mt-3 text-sm text-red-600">{deactivationError}</p>}
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="secondary" disabled={Boolean(lifecycleLoadingId)} onClick={() => { setPendingDeactivation(null); setDeactivationError(null) }}>
                Cancelar
              </Button>
              <Button type="button" variant="destructive" disabled={Boolean(lifecycleLoadingId)} onClick={handleDeactivate}>
                {lifecycleLoadingId ? 'Desactivando…' : 'Desactivar barbero'}
              </Button>
            </div>
          </div>
        </div>
      )}
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}

function BarberGroup({ title, description, barbers, lifecycleLoadingId, onEdit, onDeactivate, onReactivate }: {
  title: string
  description: string
  barbers: DashboardBarber[]
  lifecycleLoadingId: string | null
  onEdit: (barber: DashboardBarber) => void
  onDeactivate: (barber: DashboardBarber) => void
  onReactivate: (barber: DashboardBarber) => void
}) {
  return (
    <section className="space-y-3" aria-labelledby={`barbers-${title.toLowerCase()}`}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 id={`barbers-${title.toLowerCase()}`} className="font-semibold">{title}</h2>
          <p className="mt-0.5 text-sm text-[var(--muted)]">{description}</p>
        </div>
        <span className="text-sm tabular-nums text-[var(--muted)]">{barbers.length}</span>
      </div>
      {barbers.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--border)] bg-white px-4 py-6 text-sm text-[var(--muted)]">
          No hay barberos activos. Podés reactivar uno desde la sección de inactivos.
        </p>
      ) : (
        <div className="divide-y divide-[var(--border)] rounded-2xl border border-[var(--border)] bg-white shadow-sm">
          {barbers.map(barber => (
            <article key={barber.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3 py-3 sm:gap-4 sm:px-4">
              <div className={`flex h-10 w-10 items-center justify-center rounded-full ${barber.active ? 'bg-[var(--primary)]/10 text-[var(--primary)]' : 'bg-[var(--secondary)] text-[var(--muted)]'}`}>
                <UserRound className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <h3 className="truncate font-semibold">{barber.name}</h3>
                  <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${barber.active ? 'text-emerald-700' : 'text-[var(--muted)]'}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${barber.active ? 'bg-emerald-500' : 'bg-slate-400'}`} aria-hidden="true" />
                    {barber.active ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
                <p className="mt-0.5 line-clamp-2 text-sm text-[var(--muted)]">{barber.bio || 'Sin descripción'}</p>
                <Link href={`/dashboard/barbers/${barber.id}/schedule`} className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-[var(--primary)] hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]">
                  <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" /> Ver disponibilidad
                </Link>
              </div>
              <MenuTrigger>
                <AriaButton className="flex h-10 w-10 items-center justify-center rounded-lg text-[var(--muted)] hover:bg-[var(--secondary)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]" aria-label={`Acciones de ${barber.name}`}>
                  <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
                </AriaButton>
                <Popover placement="bottom end" offset={6} className="z-[60] min-w-48 rounded-xl border border-[var(--border)] bg-white p-1.5 shadow-xl outline-none">
                  <Menu aria-label={`Acciones de ${barber.name}`} className="outline-none">
                  <MenuItem href={`/dashboard/barbers/${barber.id}/schedule`} className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none hover:bg-[var(--secondary)] focus:bg-[var(--secondary)]">
                    <CalendarClock className="h-4 w-4" aria-hidden="true" /> Disponibilidad
                  </MenuItem>
                  <MenuItem onAction={() => onEdit(barber)} className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none hover:bg-[var(--secondary)] focus:bg-[var(--secondary)]">
                    <Pencil className="h-4 w-4" aria-hidden="true" /> Editar
                  </MenuItem>
                  {barber.active ? (
                    <MenuItem onAction={() => onDeactivate(barber)} className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 outline-none hover:bg-red-50 focus:bg-red-50">
                      <PowerOff className="h-4 w-4" aria-hidden="true" /> Desactivar
                    </MenuItem>
                  ) : (
                    <MenuItem isDisabled={lifecycleLoadingId === barber.id} onAction={() => onReactivate(barber)} className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-emerald-700 outline-none hover:bg-emerald-50 focus:bg-emerald-50 disabled:opacity-50">
                      <RotateCcw className="h-4 w-4" aria-hidden="true" /> Reactivar
                    </MenuItem>
                  )}
                  </Menu>
                </Popover>
              </MenuTrigger>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

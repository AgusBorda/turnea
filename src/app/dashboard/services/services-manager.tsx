'use client'

import { useState } from 'react'
import { Service } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { formatPrice, formatDuration } from '@/lib/utils'
import { CircleAlert, MoreHorizontal, Pencil, Plus, PowerOff, RotateCcw, Scissors, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import {
  Button as AriaButton,
  Dialog,
  Heading,
  Menu,
  MenuItem,
  MenuTrigger,
  Modal,
  ModalOverlay,
  Popover,
} from 'react-aria-components'
import Button from '@/components/ui/button'
import FormField from '@/components/ui/form-field'
import { inputClassName } from '@/components/ui/input-styles'
import SectionHeader from '@/components/ui/section-header'
import { ToastViewport, useToast } from '@/components/ui/toast'

interface Props {
  barbershopId: string
  initialServices: Service[]
}

interface ServiceFormErrors {
  name?: string
  duration?: string
  price?: string
}

export default function ServicesManager({ barbershopId, initialServices }: Props) {
  const services = initialServices
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Service | null>(null)
  const [loading, setLoading] = useState(false)
  const [formErrors, setFormErrors] = useState<ServiceFormErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [pendingDeactivation, setPendingDeactivation] = useState<Service | null>(null)
  const [deactivationError, setDeactivationError] = useState<string | null>(null)
  const [lifecycleLoadingId, setLifecycleLoadingId] = useState<string | null>(null)
  const { toasts, showToast, dismissToast } = useToast()
  const router = useRouter()

  // Form state
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [duration, setDuration] = useState<number | ''>(30)
  const [price, setPrice] = useState<number | ''>(0)

  const activeServices = services.filter(service => service.active)
  const inactiveServices = services.filter(service => !service.active)

  function openNew() {
    setEditing(null)
    setName('')
    setDescription('')
    setDuration(30)
    setPrice(0)
    setFormErrors({})
    setFormError(null)
    setShowForm(true)
  }

  function openEdit(service: Service) {
    setEditing(service)
    setName(service.name)
    setDescription(service.description || '')
    setDuration(service.duration)
    setPrice(service.price)
    setFormErrors({})
    setFormError(null)
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditing(null)
    setName('')
    setDescription('')
    setDuration(30)
    setPrice(0)
    setFormErrors({})
    setFormError(null)
  }

  function validateForm() {
    const nextErrors: ServiceFormErrors = {}
    const normalizedName = name.trim()
    const normalizedDuration = Number(duration)
    const normalizedPrice = Number(price)

    if (!normalizedName) nextErrors.name = 'Ingresá un nombre para el servicio.'
    if (duration === '' || !Number.isFinite(normalizedDuration) || !Number.isInteger(normalizedDuration) || normalizedDuration <= 0) {
      nextErrors.duration = 'La duración debe ser mayor a 0 minutos.'
    }
    if (price === '' || !Number.isFinite(normalizedPrice) || normalizedPrice < 0) {
      nextErrors.price = 'El precio no puede ser negativo.'
    }

    setFormErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
      ? { name: normalizedName, duration: normalizedDuration, price: normalizedPrice }
      : null
  }

  async function handleSave() {
    if (loading) return

    setFormError(null)
    const values = validateForm()
    if (!values) return

    setLoading(true)

    const supabase = createClient()

    try {
      if (editing) {
        const { error } = await supabase
          .from('services')
          .update({
            name: values.name,
            description: description.trim() || null,
            duration: values.duration,
            price: values.price,
          })
          .eq('id', editing.id)

        if (error) {
          setFormError('No pudimos guardar el servicio. Intentá nuevamente.')
          return
        }

        closeForm()
        showToast({ message: 'Servicio actualizado', tone: 'success' })
      } else {
        const { data, error } = await supabase
          .from('services')
          .insert({
            barbershop_id: barbershopId,
            name: values.name,
            description: description.trim() || null,
            duration: values.duration,
            price: values.price,
            sort_order: services.length,
          })
          .select()
          .single()

        if (error || !data) {
          setFormError('No pudimos guardar el servicio. Intentá nuevamente.')
          return
        }

        closeForm()
        showToast({ message: 'Servicio creado', tone: 'success' })
      }
      router.refresh()
    } catch {
      setFormError('No pudimos guardar el servicio. Intentá nuevamente.')
    } finally {
      setLoading(false)
    }
  }

  function requestDeactivation(service: Service) {
    setPendingDeactivation(service)
    setDeactivationError(null)
  }

  function closeDeactivationDialog() {
    if (lifecycleLoadingId) return
    setPendingDeactivation(null)
    setDeactivationError(null)
  }

  async function handleDeactivate() {
    if (!pendingDeactivation || lifecycleLoadingId) return

    setDeactivationError(null)
    setLifecycleLoadingId(pendingDeactivation.id)
    const supabase = createClient()

    try {
      const { data, error } = await supabase
        .from('services')
        .update({ active: false })
        .eq('id', pendingDeactivation.id)
        .eq('barbershop_id', barbershopId)
        .select('id')
        .single()

      if (error || !data) {
        setDeactivationError('No pudimos desactivar el servicio. Intentá nuevamente.')
        return
      }

      setPendingDeactivation(null)
      showToast({ message: 'Servicio desactivado', tone: 'success' })
      router.refresh()
    } catch {
      setDeactivationError('No pudimos desactivar el servicio. Intentá nuevamente.')
    } finally {
      setLifecycleLoadingId(null)
    }
  }

  async function handleReactivate(service: Service) {
    if (lifecycleLoadingId) return

    setLifecycleLoadingId(service.id)
    const supabase = createClient()

    try {
      const { data, error } = await supabase
        .from('services')
        .update({ active: true })
        .eq('id', service.id)
        .eq('barbershop_id', barbershopId)
        .select('id')
        .single()

      if (error || !data) {
        showToast({ message: 'No pudimos reactivar el servicio. Intentá nuevamente.', tone: 'error' })
        return
      }

      showToast({ message: 'Servicio reactivado', tone: 'success' })
      router.refresh()
    } catch {
      showToast({ message: 'No pudimos reactivar el servicio. Intentá nuevamente.', tone: 'error' })
    } finally {
      setLifecycleLoadingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Servicios"
        description="Administrá lo que ofrecés, su duración y precio."
        action={(
          <Button type="button" onClick={openNew} className="w-full sm:w-auto">
            <Plus className="h-4 w-4" aria-hidden="true" />
            Nuevo servicio
          </Button>
        )}
      />

      {services.length === 0 ? (
        <div className="rounded-xl border border-[var(--border)] bg-white px-5 py-8 text-center sm:px-8">
          <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-purple-50 text-[var(--primary)]">
            <Scissors className="h-5 w-5" aria-hidden="true" />
          </span>
          <h2 className="mt-3 text-base font-semibold text-[var(--foreground)]">No tenés servicios todavía</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-[var(--muted)]">
            Creá tu primer servicio para empezar a recibir turnos.
          </p>
          <Button type="button" onClick={openNew} className="mt-4">
            <Plus className="h-4 w-4" aria-hidden="true" />
            Crear primer servicio
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          <section aria-labelledby="active-services-title">
            <div className="mb-2 flex items-end justify-between gap-3">
              <h2 id="active-services-title" className="text-sm font-semibold text-[var(--foreground)]">Servicios activos</h2>
              <span className="text-xs text-[var(--muted)]">{activeServices.length} {activeServices.length === 1 ? 'servicio' : 'servicios'}</span>
            </div>
            <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-white">
              {activeServices.length > 0 ? (
                <ServiceList
                  services={activeServices}
                  onEdit={openEdit}
                  onRequestDeactivate={requestDeactivation}
                  lifecycleLoadingId={lifecycleLoadingId}
                />
              ) : (
                <p className="px-4 py-5 text-sm text-[var(--muted)] sm:px-5">No tenés servicios activos.</p>
              )}
            </div>
          </section>

          {inactiveServices.length > 0 && (
            <section aria-labelledby="inactive-services-title">
              <div className="mb-2 flex items-end justify-between gap-3">
                <div>
                  <h2 id="inactive-services-title" className="text-sm font-semibold text-[var(--foreground)]">Servicios inactivos</h2>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">No están disponibles para nuevas reservas.</p>
                </div>
                <span className="shrink-0 text-xs text-[var(--muted)]">{inactiveServices.length} {inactiveServices.length === 1 ? 'servicio' : 'servicios'}</span>
              </div>
              <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-white">
                <ServiceList
                  services={inactiveServices}
                  onEdit={openEdit}
                  onReactivate={handleReactivate}
                  lifecycleLoadingId={lifecycleLoadingId}
                />
              </div>
            </section>
          )}
        </div>
      )}

      <ModalOverlay
        isOpen={showForm}
        isDismissable={!loading}
        onOpenChange={isOpen => {
          if (!isOpen && !loading) closeForm()
        }}
        className="fixed inset-0 z-[80] flex items-center justify-center bg-black/35 p-3 backdrop-blur-[1px] sm:p-4"
      >
        <Modal className="relative z-10 flex max-h-[calc(100dvh-1.5rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl outline-none sm:max-h-[90dvh]">
          <Dialog className="flex min-h-0 flex-1 flex-col outline-none">
            <form
              noValidate
              className="flex min-h-0 flex-1 flex-col"
              onSubmit={event => {
                event.preventDefault()
                void handleSave()
              }}
            >
              <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[var(--border)] bg-white px-4 py-4 sm:px-6">
                <div className="min-w-0">
                  <Heading slot="title" className="text-lg font-bold text-[var(--foreground)]">
                    {editing ? 'Editar servicio' : 'Nuevo servicio'}
                  </Heading>
                  <p className="mt-0.5 text-sm text-[var(--muted)]">
                    {editing ? 'Actualizá la información del servicio.' : 'Agregá un nuevo servicio a tu catálogo.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeForm}
                  disabled={loading}
                  aria-label={editing ? 'Cerrar edición de servicio' : 'Cerrar nuevo servicio'}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[var(--muted)] transition-colors hover:bg-[var(--secondary)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] disabled:opacity-50"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>

              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-5 [-ms-overflow-style:none] [scrollbar-width:none] sm:px-6 [&::-webkit-scrollbar]:hidden">
                <FormField label="Nombre *" htmlFor="service-name" error={formErrors.name}>
                  <input
                    id="service-name"
                    type="text"
                    value={name}
                    onChange={event => {
                      setName(event.target.value)
                      if (formErrors.name) setFormErrors(current => ({ ...current, name: undefined }))
                    }}
                    className={`w-full ${inputClassName}`}
                    placeholder="Ej. Corte clásico"
                    autoComplete="off"
                    disabled={loading}
                    aria-invalid={Boolean(formErrors.name)}
                    required
                    autoFocus
                  />
                </FormField>

                <FormField label="Descripción" htmlFor="service-description" help="Opcional.">
                  <input
                    id="service-description"
                    type="text"
                    value={description}
                    onChange={event => setDescription(event.target.value)}
                    className={`w-full ${inputClassName}`}
                    placeholder="Ej. Incluye lavado"
                    disabled={loading}
                  />
                </FormField>

                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Duración (min) *" htmlFor="service-duration" error={formErrors.duration}>
                    <input
                      id="service-duration"
                      type="number"
                      value={duration}
                      onChange={event => {
                        setDuration(event.target.value === '' ? '' : Number(event.target.value))
                        if (formErrors.duration) setFormErrors(current => ({ ...current, duration: undefined }))
                      }}
                      min={1}
                      step={1}
                      inputMode="numeric"
                      className={`w-full ${inputClassName}`}
                      disabled={loading}
                      aria-invalid={Boolean(formErrors.duration)}
                      required
                    />
                  </FormField>

                  <FormField label="Precio ($) *" htmlFor="service-price" error={formErrors.price}>
                    <input
                      id="service-price"
                      type="number"
                      value={price}
                      onChange={event => {
                        setPrice(event.target.value === '' ? '' : Number(event.target.value))
                        if (formErrors.price) setFormErrors(current => ({ ...current, price: undefined }))
                      }}
                      min={0}
                      step="0.01"
                      inputMode="decimal"
                      className={`w-full ${inputClassName}`}
                      disabled={loading}
                      aria-invalid={Boolean(formErrors.price)}
                      required
                    />
                  </FormField>
                </div>

                {formError && (
                  <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50/70 p-3 text-sm text-red-800">
                    <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <p>{formError}</p>
                  </div>
                )}
              </div>

              <div
                className="flex shrink-0 gap-3 border-t border-[var(--border)] bg-white px-4 pt-4 sm:justify-end sm:px-6"
                style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
              >
                <Button type="button" variant="secondary" onClick={closeForm} disabled={loading} className="flex-1 sm:flex-none">
                  Cancelar
                </Button>
                <Button type="submit" disabled={loading} className="flex-1 sm:min-w-36 sm:flex-none">
                  {loading ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear servicio'}
                </Button>
              </div>
            </form>
          </Dialog>
        </Modal>
      </ModalOverlay>

      <ModalOverlay
        isOpen={Boolean(pendingDeactivation)}
        isDismissable={!lifecycleLoadingId}
        onOpenChange={isOpen => {
          if (!isOpen) closeDeactivationDialog()
        }}
        className="fixed inset-0 z-[80] flex items-center justify-center bg-black/35 p-3 backdrop-blur-[1px] sm:p-4"
      >
        <Modal className="relative z-10 flex max-h-[calc(100dvh-1.5rem)] w-full max-w-sm flex-col overflow-hidden rounded-2xl bg-white shadow-2xl outline-none sm:max-h-[90dvh]">
          <Dialog className="flex min-h-0 flex-1 flex-col outline-none">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-4 py-4 sm:px-6">
              <Heading slot="title" className="min-w-0 text-lg font-bold text-[var(--foreground)]">
                Desactivar servicio
              </Heading>
              <button
                type="button"
                onClick={closeDeactivationDialog}
                disabled={Boolean(lifecycleLoadingId)}
                aria-label="Cerrar confirmación de desactivación"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[var(--muted)] transition-colors hover:bg-[var(--secondary)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] disabled:opacity-50"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
              <p slot="description" className="break-words text-sm text-[var(--muted)]">
                <span className="font-medium text-[var(--foreground)]">{pendingDeactivation?.name}</span> dejará de estar disponible para nuevas reservas. Los turnos existentes no se modificarán.
              </p>
              {deactivationError && (
                <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50/70 p-3 text-sm text-red-800">
                  <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <p>{deactivationError}</p>
                </div>
              )}
            </div>

            <div
              className="flex flex-col-reverse gap-3 border-t border-[var(--border)] bg-white px-4 pt-4 sm:flex-row sm:justify-end sm:px-6"
              style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
            >
              <Button
                type="button"
                variant="secondary"
                onClick={closeDeactivationDialog}
                disabled={Boolean(lifecycleLoadingId)}
                autoFocus
                className="w-full sm:w-auto"
              >
                Cancelar
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => void handleDeactivate()}
                disabled={Boolean(lifecycleLoadingId)}
                className="w-full sm:min-w-44 sm:w-auto"
              >
                {lifecycleLoadingId ? 'Desactivando…' : 'Desactivar servicio'}
              </Button>
            </div>
          </Dialog>
        </Modal>
      </ModalOverlay>

      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}

function ServiceList({ services, onEdit, onRequestDeactivate, onReactivate, lifecycleLoadingId }: {
  services: Service[]
  onEdit: (service: Service) => void
  onRequestDeactivate?: (service: Service) => void
  onReactivate?: (service: Service) => void
  lifecycleLoadingId: string | null
}) {
  return (
    <ul className="divide-y divide-[var(--border)]" role="list">
      {services.map(service => (
        <li
          key={service.id}
          className={`grid min-w-0 grid-cols-[minmax(0,1fr)_2.75rem] items-center gap-3 px-4 py-3.5 sm:grid-cols-[minmax(0,1fr)_6.5rem_8rem_5rem_2.75rem] sm:px-5 ${service.active ? '' : 'bg-gray-50/60'}`}
        >
          <div className="min-w-0">
            <p className={`line-clamp-2 break-words text-sm font-semibold sm:line-clamp-1 ${service.active ? 'text-[var(--foreground)]' : 'text-gray-600'}`}>
              {service.name}
            </p>
            {service.description && (
              <p className="mt-0.5 line-clamp-2 text-xs text-[var(--muted)] sm:line-clamp-1">{service.description}</p>
            )}
            <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-[var(--muted)] sm:hidden">
              <span>{formatDuration(service.duration)}</span>
              <span aria-hidden="true">·</span>
              <span>{formatPrice(service.price)}</span>
              <span aria-hidden="true">·</span>
              <ServiceStatus active={service.active} />
            </p>
          </div>

          <span className="hidden text-sm text-[var(--muted)] sm:block">{formatDuration(service.duration)}</span>
          <span className="hidden min-w-0 truncate text-sm font-semibold tabular-nums text-[var(--foreground)] sm:block">{formatPrice(service.price)}</span>
          <span className="hidden sm:block"><ServiceStatus active={service.active} /></span>

          <ServiceActions
            service={service}
            onEdit={onEdit}
            onRequestDeactivate={onRequestDeactivate}
            onReactivate={onReactivate}
            isLoading={lifecycleLoadingId === service.id}
          />
        </li>
      ))}
    </ul>
  )
}

function ServiceStatus({ active }: { active: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-normal ${active ? 'text-emerald-700' : 'text-[var(--muted)]'}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-emerald-500' : 'bg-gray-400'}`} aria-hidden="true" />
      {active ? 'Activo' : 'Inactivo'}
    </span>
  )
}

function ServiceActions({ service, onEdit, onRequestDeactivate, onReactivate, isLoading }: {
  service: Service
  onEdit: (service: Service) => void
  onRequestDeactivate?: (service: Service) => void
  onReactivate?: (service: Service) => void
  isLoading: boolean
}) {
  return (
    <MenuTrigger>
      <AriaButton
        aria-label={`Acciones de ${service.name}`}
        isDisabled={isLoading}
        className="flex h-11 w-11 items-center justify-center rounded-lg text-[var(--muted)] transition-colors hover:bg-[var(--secondary)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
      </AriaButton>
      <Popover
        placement="bottom end"
        offset={6}
        className="z-[60] min-w-44 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border border-[var(--border)] bg-white p-1 shadow-xl outline-none"
      >
        <Menu
          aria-label={`Acciones de ${service.name}`}
          onAction={key => {
            if (key === 'edit') onEdit(service)
            if (key === 'deactivate' && onRequestDeactivate) onRequestDeactivate(service)
            if (key === 'reactivate' && onReactivate) void onReactivate(service)
          }}
          className="outline-none"
        >
          <MenuItem
            id="edit"
            className="flex min-h-11 cursor-default items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-[var(--foreground)] outline-none data-[focused]:bg-[var(--secondary)] data-[focus-visible]:ring-2 data-[focus-visible]:ring-[var(--primary)]"
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
            Editar
          </MenuItem>
          {service.active && onRequestDeactivate && (
            <MenuItem
              id="deactivate"
              className="flex min-h-11 cursor-default items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-red-700 outline-none data-[focused]:bg-red-50 data-[focus-visible]:ring-2 data-[focus-visible]:ring-red-600"
            >
              <PowerOff className="h-4 w-4" aria-hidden="true" />
              Desactivar
            </MenuItem>
          )}
          {!service.active && onReactivate && (
            <MenuItem
              id="reactivate"
              className="flex min-h-11 cursor-default items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-emerald-700 outline-none data-[focused]:bg-emerald-50 data-[focus-visible]:ring-2 data-[focus-visible]:ring-emerald-600"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Reactivar
            </MenuItem>
          )}
        </Menu>
      </Popover>
    </MenuTrigger>
  )
}

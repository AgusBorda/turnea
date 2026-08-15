'use client'

import { useActionState, useCallback, useEffect, useState, useTransition } from 'react'
import { CalendarOff, Clock3, Palmtree, Trash2 } from 'lucide-react'

import { ToastViewport, useToast, type ToastTone } from '@/components/ui/toast'
import { formatLocalDate } from '@/lib/datetime'
import {
  createFullDayBlock,
  createPartialBlock,
  createVacation,
  deleteBlockedSlot,
  type BlockedSlotActionState,
} from './actions'

export interface UpcomingBlockedSlot {
  id: string
  date: string
  start_time: string | null
  end_time: string | null
  all_day: boolean
  reason: string | null
}

interface Props {
  barberId: string
  today: string
  initialBlockedSlots: UpcomingBlockedSlot[]
}

type FormMode = 'full-day' | 'partial' | 'vacation'

const INITIAL_STATE: BlockedSlotActionState = {
  success: false,
  message: '',
  feedback: 'inline',
  tone: 'error',
}
const INPUT_CLASS = 'w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none'

function Feedback({ state }: { state: BlockedSlotActionState }) {
  if (!state.message || state.feedback !== 'inline') return null
  return (
    <p
      aria-live="polite"
      className={`rounded-lg p-3 text-sm ${state.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}
    >
      {state.message}
    </p>
  )
}

function DeleteBlockButton({
  barberId,
  block,
  onToast,
}: {
  barberId: string
  block: UpcomingBlockedSlot
  onToast: (message: string, tone: ToastTone) => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [state, setState] = useState(INITIAL_STATE)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (!isOpen) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !pending) setIsOpen(false)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, pending])

  const blockDetails = block.all_day
    ? formatLocalDate(block.date, { day: 'numeric', month: 'long', year: 'numeric' })
    : `${formatLocalDate(block.date, { day: 'numeric', month: 'long', year: 'numeric' })}, ${block.start_time?.slice(0, 5)} a ${block.end_time?.slice(0, 5)}`

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteBlockedSlot(barberId, block.id, INITIAL_STATE)
      if (result.feedback === 'toast') onToast(result.message, result.tone)
      else setState(result)
      if (result.success) setIsOpen(false)
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center justify-center gap-1 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
      >
        <Trash2 className="h-4 w-4" />
        Eliminar
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`delete-block-title-${block.id}`}
            aria-describedby={`delete-block-description-${block.id}`}
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl sm:p-6"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-red-50 text-red-600">
              <Trash2 className="h-5 w-5" />
            </div>
            <h3 id={`delete-block-title-${block.id}`} className="mt-4 text-lg font-bold">
              ¿Eliminar bloqueo?
            </h3>
            <p id={`delete-block-description-${block.id}`} className="mt-2 text-sm text-[var(--muted)]">
              {block.all_day
                ? 'Este día volverá a quedar disponible para recibir turnos.'
                : 'Este horario volverá a quedar disponible para recibir turnos.'}
            </p>
            <p className="mt-2 text-sm font-medium">{blockDetails}</p>

            {state.message && !state.success && (
              <p aria-live="polite" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                {state.message}
              </p>
            )}

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                disabled={pending}
                className="rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-semibold hover:bg-gray-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={pending}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                {pending ? 'Eliminando...' : 'Eliminar bloqueo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default function AvailabilityManager({ barberId, today, initialBlockedSlots }: Props) {
  const [mode, setMode] = useState<FormMode>('full-day')
  const { toasts, showToast, dismissToast } = useToast()

  const notify = useCallback((message: string, tone: ToastTone) => {
    showToast({ message, tone })
  }, [showToast])

  const fullDayClientAction = useCallback(async (
    previousState: BlockedSlotActionState,
    formData: FormData
  ) => {
    const result = await createFullDayBlock(barberId, previousState, formData)
    if (result.feedback === 'toast') {
      notify(result.message, result.tone)
      return INITIAL_STATE
    }
    return result
  }, [barberId, notify])

  const partialClientAction = useCallback(async (
    previousState: BlockedSlotActionState,
    formData: FormData
  ) => {
    const result = await createPartialBlock(barberId, previousState, formData)
    if (result.feedback === 'toast') {
      notify(result.message, result.tone)
      return INITIAL_STATE
    }
    return result
  }, [barberId, notify])

  const vacationClientAction = useCallback(async (
    previousState: BlockedSlotActionState,
    formData: FormData
  ) => {
    const result = await createVacation(barberId, previousState, formData)
    if (result.feedback === 'toast') {
      notify(result.message, result.tone)
      return INITIAL_STATE
    }
    return result
  }, [barberId, notify])

  const [fullDayState, fullDayAction, fullDayPending] = useActionState(
    fullDayClientAction,
    INITIAL_STATE
  )
  const [partialState, partialAction, partialPending] = useActionState(
    partialClientAction,
    INITIAL_STATE
  )
  const [vacationState, vacationAction, vacationPending] = useActionState(
    vacationClientAction,
    INITIAL_STATE
  )

  const modes: Array<{ id: FormMode; label: string; icon: typeof CalendarOff }> = [
    { id: 'full-day', label: 'Bloquear día', icon: CalendarOff },
    { id: 'partial', label: 'Bloquear horario', icon: Clock3 },
    { id: 'vacation', label: 'Cargar vacaciones', icon: Palmtree },
  ]

  return (
    <section className="mt-10 max-w-3xl border-t border-[var(--border)] pt-8">
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
      <h2 className="text-xl font-bold">Ausencias y bloqueos</h2>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Bloqueá fechas u horarios en los que el barbero no estará disponible.
      </p>

      <div className="mt-5 grid gap-2 sm:grid-cols-3">
        {modes.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setMode(id)}
            className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-semibold transition-colors ${
              mode === id
                ? 'border-[var(--primary)] bg-[var(--primary)] text-white'
                : 'border-[var(--border)] bg-white hover:border-[var(--primary)]'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4 rounded-xl border border-[var(--border)] bg-white p-4 sm:p-5">
        {mode === 'full-day' && (
          <form action={fullDayAction} className="space-y-4">
            <h3 className="font-semibold">Bloquear un día completo</h3>
            <label className="block text-sm font-medium">
              Fecha
              <input className={`${INPUT_CLASS} mt-1`} type="date" name="date" min={today} required />
            </label>
            <ReasonField />
            <Feedback state={fullDayState} />
            <SubmitButton pending={fullDayPending} label="Bloquear día" />
          </form>
        )}

        {mode === 'partial' && (
          <form action={partialAction} className="space-y-4">
            <h3 className="font-semibold">Bloquear una franja horaria</h3>
            <label className="block text-sm font-medium">
              Fecha
              <input className={`${INPUT_CLASS} mt-1`} type="date" name="date" min={today} required />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-medium">
                Desde
                <input className={`${INPUT_CLASS} mt-1`} type="time" name="startTime" required />
              </label>
              <label className="block text-sm font-medium">
                Hasta
                <input className={`${INPUT_CLASS} mt-1`} type="time" name="endTime" required />
              </label>
            </div>
            <ReasonField />
            <Feedback state={partialState} />
            <SubmitButton pending={partialPending} label="Bloquear horario" />
          </form>
        )}

        {mode === 'vacation' && (
          <form action={vacationAction} className="space-y-4">
            <h3 className="font-semibold">Cargar vacaciones</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-medium">
                Desde
                <input className={`${INPUT_CLASS} mt-1`} type="date" name="dateFrom" min={today} required />
              </label>
              <label className="block text-sm font-medium">
                Hasta
                <input className={`${INPUT_CLASS} mt-1`} type="date" name="dateTo" min={today} required />
              </label>
            </div>
            <ReasonField />
            <Feedback state={vacationState} />
            <SubmitButton pending={vacationPending} label="Cargar vacaciones" />
          </form>
        )}
      </div>

      <div className="mt-8">
        <h3 className="font-semibold">Próximos bloqueos</h3>
        {initialBlockedSlots.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-[var(--border)] p-5 text-center text-sm text-[var(--muted)]">
            No hay bloqueos próximos para este barbero.
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            {initialBlockedSlots.map(block => (
              <article
                key={block.id}
                className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 gap-3">
                  <div className={`mt-0.5 rounded-lg p-2 ${block.all_day ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'}`}>
                    {block.all_day
                      ? <CalendarOff className="h-4 w-4" />
                      : <Clock3 className="h-4 w-4" />}
                  </div>
                  <div>
                  <p className="font-medium">
                    {formatLocalDate(block.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    {block.all_day
                      ? 'Día completo'
                      : `${block.start_time?.slice(0, 5)} a ${block.end_time?.slice(0, 5)}`}
                  </p>
                  {block.reason && <p className="mt-1 text-sm">Motivo: {block.reason}</p>}
                  </div>
                </div>
                <DeleteBlockButton
                  barberId={barberId}
                  block={block}
                  onToast={notify}
                />
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function ReasonField() {
  return (
    <label className="block text-sm font-medium">
      Motivo <span className="font-normal text-[var(--muted)]">(opcional)</span>
      <input
        className={`${INPUT_CLASS} mt-1`}
        type="text"
        name="reason"
        maxLength={500}
        placeholder="Ej.: trámite personal"
      />
    </label>
  )
}

function SubmitButton({ pending, label }: { pending: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-xl bg-[var(--primary)] px-4 py-3 font-semibold text-white transition-colors hover:bg-[var(--primary-dark)] disabled:opacity-50"
    >
      {pending ? 'Guardando...' : label}
    </button>
  )
}

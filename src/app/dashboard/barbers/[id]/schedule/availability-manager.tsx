'use client'

import { useActionState, useState } from 'react'
import { CalendarOff, Clock3, Palmtree, Trash2 } from 'lucide-react'

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

const INITIAL_STATE: BlockedSlotActionState = { success: false, message: '' }
const INPUT_CLASS = 'w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none'

function Feedback({ state }: { state: BlockedSlotActionState }) {
  if (!state.message) return null
  return (
    <p
      aria-live="polite"
      className={`rounded-lg p-3 text-sm ${state.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}
    >
      {state.message}
    </p>
  )
}

function DeleteBlockButton({ barberId, blockedSlotId }: { barberId: string; blockedSlotId: string }) {
  const action = deleteBlockedSlot.bind(null, barberId, blockedSlotId)
  const [state, formAction, pending] = useActionState(action, INITIAL_STATE)

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!window.confirm('¿Eliminar este bloqueo?')) event.preventDefault()
      }}
      className="flex flex-col items-end gap-1"
    >
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
      >
        <Trash2 className="h-4 w-4" />
        {pending ? 'Eliminando...' : 'Eliminar'}
      </button>
      {state.message && !state.success && <span className="max-w-52 text-right text-xs text-red-600">{state.message}</span>}
    </form>
  )
}

export default function AvailabilityManager({ barberId, today, initialBlockedSlots }: Props) {
  const [mode, setMode] = useState<FormMode>('full-day')
  const [fullDayState, fullDayAction, fullDayPending] = useActionState(
    createFullDayBlock.bind(null, barberId),
    INITIAL_STATE
  )
  const [partialState, partialAction, partialPending] = useActionState(
    createPartialBlock.bind(null, barberId),
    INITIAL_STATE
  )
  const [vacationState, vacationAction, vacationPending] = useActionState(
    createVacation.bind(null, barberId),
    INITIAL_STATE
  )

  const modes: Array<{ id: FormMode; label: string; icon: typeof CalendarOff }> = [
    { id: 'full-day', label: 'Bloquear día', icon: CalendarOff },
    { id: 'partial', label: 'Bloquear horario', icon: Clock3 },
    { id: 'vacation', label: 'Cargar vacaciones', icon: Palmtree },
  ]

  return (
    <section className="mt-10 max-w-3xl border-t border-[var(--border)] pt-8">
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
                <DeleteBlockButton barberId={barberId} blockedSlotId={block.id} />
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

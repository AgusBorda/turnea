'use client'

import { useActionState, useCallback, useEffect, useState, useTransition } from 'react'
import { CalendarOff, ChevronDown, Clock3, MoreHorizontal, Palmtree, Trash2 } from 'lucide-react'
import {
  Button as AriaButton,
  Menu,
  MenuItem,
  MenuTrigger,
  Popover,
} from 'react-aria-components'

import Button from '@/components/ui/button'
import DatePicker from '@/components/ui/date-picker'
import FormField from '@/components/ui/form-field'
import { inputClassName } from '@/components/ui/input-styles'
import TimePicker from '@/components/ui/time-picker'
import { ToastViewport, useToast, type ToastTone } from '@/components/ui/toast'
import { addCalendarDays, formatLocalDate } from '@/lib/datetime'
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
      <MenuTrigger>
        <AriaButton
          aria-label="Opciones del bloqueo"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[var(--muted)] transition-colors hover:bg-[var(--secondary)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2"
        >
          <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
        </AriaButton>
        <Popover
          placement="bottom end"
          offset={8}
          className="z-[60] rounded-xl border border-[var(--border)] bg-white p-1.5 shadow-[0_14px_36px_rgba(15,23,42,0.2)] outline-none"
        >
          <Menu
            aria-label="Opciones del bloqueo"
            onAction={key => {
              if (key === 'delete') setIsOpen(true)
            }}
            className="outline-none"
          >
            <MenuItem
              id="delete"
              className="flex min-h-10 cursor-default items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-red-600 outline-none transition-colors data-[focused]:bg-red-50"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Eliminar bloqueo
            </MenuItem>
          </Menu>
        </Popover>
      </MenuTrigger>

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

interface BlockedSlotGroup {
  id: string
  blocks: UpcomingBlockedSlot[]
}

function normalizeReason(reason: string | null) {
  return (reason ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('es-AR')
}

function groupBlockedSlots(blockedSlots: UpcomingBlockedSlot[]): BlockedSlotGroup[] {
  const sorted = [...blockedSlots].sort((a, b) => (
    a.date.localeCompare(b.date)
    || (a.start_time ?? '').localeCompare(b.start_time ?? '')
  ))
  const groups: BlockedSlotGroup[] = []

  for (const block of sorted) {
    const previousGroup = groups.at(-1)
    const previousBlock = previousGroup?.blocks.at(-1)
    const continuesVacation = Boolean(
      block.all_day
      && previousBlock?.all_day
      && block.date === addCalendarDays(previousBlock.date, 1)
      && normalizeReason(block.reason) === normalizeReason(previousBlock.reason)
    )

    if (continuesVacation && previousGroup) previousGroup.blocks.push(block)
    else groups.push({ id: block.id, blocks: [block] })
  }

  return groups
}

function getDateBadge(date: string, endDate?: string) {
  const day = String(Number(date.slice(8, 10)))
  const month = formatLocalDate(date, { month: 'short' }).replace('.', '').toLocaleUpperCase('es-AR')
  const sameMonth = endDate?.slice(0, 7) === date.slice(0, 7)
  const endDay = endDate && sameMonth ? String(Number(endDate.slice(8, 10))) : null
  return { day: endDay ? `${day}–${endDay}` : day, month }
}

function DateBadge({ date, endDate }: { date: string; endDate?: string }) {
  const badge = getDateBadge(date, endDate)
  const fullLabel = endDate
    ? `${formatLocalDate(date, { day: 'numeric', month: 'long' })} al ${formatLocalDate(endDate, { day: 'numeric', month: 'long', year: 'numeric' })}`
    : formatLocalDate(date, { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div
      aria-label={fullLabel}
      className={`flex h-13 shrink-0 flex-col items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--secondary)] text-center ${endDate ? 'w-14' : 'w-12'}`}
    >
      <span className={`${endDate ? 'text-sm' : 'text-lg'} font-bold leading-none tabular-nums`}>{badge.day}</span>
      <span className="mt-1 text-[10px] font-bold leading-none tracking-wide text-[var(--muted)]">{badge.month}</span>
    </div>
  )
}

function BlockedSlotRow({
  barberId,
  block,
  onToast,
  nested = false,
}: {
  barberId: string
  block: UpcomingBlockedSlot
  onToast: (message: string, tone: ToastTone) => void
  nested?: boolean
}) {
  return (
    <div className={`flex min-w-0 items-center gap-3 ${nested ? 'py-2.5' : 'p-3 sm:p-4'}`}>
      {nested ? (
        <div className="w-12 shrink-0 text-center text-xs font-semibold text-[var(--muted)]">
          {formatLocalDate(block.date, { day: 'numeric', month: 'short' })}
        </div>
      ) : (
        <DateBadge date={block.date} />
      )}

      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-sm font-semibold leading-5">
          {block.all_day ? (
            <CalendarOff className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
          ) : (
            <Clock3 className="h-4 w-4 shrink-0 text-blue-600" aria-hidden="true" />
          )}
          {block.all_day
            ? 'Día completo'
            : `${block.start_time?.slice(0, 5)} — ${block.end_time?.slice(0, 5)}`}
        </p>
        {block.reason && (
          <p className="mt-0.5 truncate text-sm text-[var(--muted)]" title={block.reason}>
            {block.reason}
          </p>
        )}
      </div>

      <DeleteBlockButton barberId={barberId} block={block} onToast={onToast} />
    </div>
  )
}

function UpcomingBlockedSlots({
  barberId,
  blockedSlots,
  onToast,
}: {
  barberId: string
  blockedSlots: UpcomingBlockedSlot[]
  onToast: (message: string, tone: ToastTone) => void
}) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set())
  const groups = groupBlockedSlots(blockedSlots)

  if (groups.length === 0) {
    return (
      <div className="mt-3 rounded-xl border border-dashed border-[var(--border)] px-4 py-6 text-center">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-amber-50 text-amber-600">
          <CalendarOff className="h-5 w-5" aria-hidden="true" />
        </div>
        <p className="mt-3 text-sm font-semibold">No hay ausencias programadas</p>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Cuando agregues un bloqueo o vacaciones, aparecerán acá.
        </p>
      </div>
    )
  }

  function toggleGroup(groupId: string) {
    setExpandedGroups(previous => {
      const next = new Set(previous)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }

  return (
    <ul className="mt-3 divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-white">
      {groups.map(group => {
        const first = group.blocks[0]
        const last = group.blocks.at(-1)!
        const isGroup = group.blocks.length > 1
        const isExpanded = expandedGroups.has(group.id)

        return (
          <li key={group.id}>
            {isGroup ? (
              <div className="p-3 sm:p-4">
                <div className="flex min-w-0 items-center gap-3">
                  <DateBadge date={first.date} endDate={last.date} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-sm font-semibold">
                      <CalendarOff className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
                      {group.blocks.length} días · Día completo
                    </p>
                    {first.reason && (
                      <p className="mt-0.5 truncate text-sm text-[var(--muted)]" title={first.reason}>
                        {first.reason}
                      </p>
                    )}
                    {first.date.slice(0, 7) !== last.date.slice(0, 7) && (
                      <p className="mt-0.5 text-xs text-[var(--muted)]">
                        Hasta {formatLocalDate(last.date, { day: 'numeric', month: 'short' })}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.id)}
                    aria-expanded={isExpanded}
                    aria-controls={`blocked-group-${group.id}`}
                    aria-label={isExpanded ? 'Ocultar días de las vacaciones' : `Ver ${group.blocks.length} días de las vacaciones`}
                    className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-[var(--primary)] transition-colors hover:bg-purple-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
                  >
                    <span className="hidden sm:inline">{isExpanded ? 'Ocultar' : `Ver ${group.blocks.length} días`}</span>
                    <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} aria-hidden="true" />
                  </button>
                </div>

                {isExpanded && (
                  <div id={`blocked-group-${group.id}`} className="mt-3 divide-y divide-[var(--border)] rounded-lg bg-[var(--secondary)]/60 px-2">
                    {group.blocks.map(block => (
                      <BlockedSlotRow
                        key={block.id}
                        barberId={barberId}
                        block={block}
                        onToast={onToast}
                        nested
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <BlockedSlotRow barberId={barberId} block={first} onToast={onToast} />
            )}
          </li>
        )
      })}
    </ul>
  )
}

export default function AvailabilityManager({ barberId, today, initialBlockedSlots }: Props) {
  const [mode, setMode] = useState<FormMode>('full-day')
  const [fullDayDate, setFullDayDate] = useState<string | null>(null)
  const [partialDate, setPartialDate] = useState<string | null>(null)
  const [partialStartTime, setPartialStartTime] = useState<string | null>(null)
  const [partialEndTime, setPartialEndTime] = useState<string | null>(null)
  const [vacationDateFrom, setVacationDateFrom] = useState<string | null>(null)
  const [vacationDateTo, setVacationDateTo] = useState<string | null>(null)
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
      if (result.success) setFullDayDate(null)
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
      if (result.success) {
        setPartialDate(null)
        setPartialStartTime(null)
        setPartialEndTime(null)
      }
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
      if (result.success) {
        setVacationDateFrom(null)
        setVacationDateTo(null)
      }
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
    <div>
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
      <div className="grid gap-2 sm:grid-cols-3">
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

      <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--secondary)] p-4 sm:p-5">
        {mode === 'full-day' && (
          <form action={fullDayAction} className="space-y-4">
            <h3 className="font-semibold">Bloquear un día completo</h3>
            <FormField label="Fecha" htmlFor="full-day-date">
              <DatePicker
                id="full-day-date"
                name="date"
                value={fullDayDate}
                onChange={setFullDayDate}
                minDate={today}
                required
                ariaLabel="Fecha del bloqueo de día completo"
              />
            </FormField>
            <ReasonField id="full-day-reason" />
            <Feedback state={fullDayState} />
            <SubmitButton pending={fullDayPending} disabled={!fullDayDate} label="Bloquear día" />
          </form>
        )}

        {mode === 'partial' && (
          <form action={partialAction} className="space-y-4">
            <h3 className="font-semibold">Bloquear una franja horaria</h3>
            <FormField label="Fecha" htmlFor="partial-date">
              <DatePicker
                id="partial-date"
                name="date"
                value={partialDate}
                onChange={setPartialDate}
                minDate={today}
                required
                ariaLabel="Fecha del bloqueo horario"
              />
            </FormField>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Desde" htmlFor="partial-start-time">
                <TimePicker
                  id="partial-start-time"
                  name="startTime"
                  value={partialStartTime}
                  onChange={setPartialStartTime}
                  stepMinutes={1}
                  required
                  ariaLabel="Hora de inicio del bloqueo"
                />
              </FormField>
              <FormField label="Hasta" htmlFor="partial-end-time">
                <TimePicker
                  id="partial-end-time"
                  name="endTime"
                  value={partialEndTime}
                  onChange={setPartialEndTime}
                  stepMinutes={1}
                  required
                  ariaLabel="Hora de fin del bloqueo"
                />
              </FormField>
            </div>
            <ReasonField id="partial-reason" />
            <Feedback state={partialState} />
            <SubmitButton
              pending={partialPending}
              disabled={!partialDate || !partialStartTime || !partialEndTime}
              label="Bloquear horario"
            />
          </form>
        )}

        {mode === 'vacation' && (
          <form action={vacationAction} className="space-y-4">
            <h3 className="font-semibold">Cargar vacaciones</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Desde" htmlFor="vacation-date-from">
                <DatePicker
                  id="vacation-date-from"
                  name="dateFrom"
                  value={vacationDateFrom}
                  onChange={setVacationDateFrom}
                  minDate={today}
                  required
                  ariaLabel="Fecha de inicio de vacaciones"
                />
              </FormField>
              <FormField label="Hasta" htmlFor="vacation-date-to">
                <DatePicker
                  id="vacation-date-to"
                  name="dateTo"
                  value={vacationDateTo}
                  onChange={setVacationDateTo}
                  minDate={today}
                  required
                  ariaLabel="Fecha de fin de vacaciones"
                />
              </FormField>
            </div>
            <ReasonField id="vacation-reason" />
            <Feedback state={vacationState} />
            <SubmitButton
              pending={vacationPending}
              disabled={!vacationDateFrom || !vacationDateTo}
              label="Cargar vacaciones"
            />
          </form>
        )}
      </div>

      <div className="mt-8">
        <h3 className="font-semibold">Próximos bloqueos</h3>
        <UpcomingBlockedSlots
          barberId={barberId}
          blockedSlots={initialBlockedSlots}
          onToast={notify}
        />
      </div>
    </div>
  )
}

function ReasonField({ id }: { id: string }) {
  return (
    <FormField label="Motivo" htmlFor={id} help="Opcional, hasta 500 caracteres.">
      <input
        id={id}
        className={`${inputClassName} w-full`}
        type="text"
        name="reason"
        maxLength={500}
        placeholder="Ej.: trámite personal"
      />
    </FormField>
  )
}

function SubmitButton({
  pending,
  disabled = false,
  label,
}: {
  pending: boolean
  disabled?: boolean
  label: string
}) {
  return (
    <Button
      type="submit"
      disabled={pending || disabled}
      className="w-full"
    >
      {pending ? 'Guardando...' : label}
    </Button>
  )
}

'use client'

import { parseDate, type CalendarDate } from '@internationalized/date'
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import {
  Button as AriaButton,
  Calendar,
  CalendarCell,
  CalendarGrid,
  CalendarGridBody,
  CalendarGridHeader,
  CalendarHeaderCell,
  CalendarHeading,
  Dialog,
  DialogTrigger,
  I18nProvider,
  Popover,
} from 'react-aria-components'

interface DatePickerProps {
  id?: string
  name?: string
  value: string | null
  onChange?: (value: string | null) => void
  minDate?: string
  maxDate?: string
  disabled?: boolean
  required?: boolean
  ariaLabel?: string
}

function parseCivilDate(value: string | null | undefined) {
  if (!value) return null
  try {
    return parseDate(value)
  } catch {
    return null
  }
}

function formatCivilDate(value: string | null) {
  if (!value) return 'Seleccionar fecha'
  const date = parseCivilDate(value)
  if (!date) return 'Seleccionar fecha'
  return `${String(date.day).padStart(2, '0')}/${String(date.month).padStart(2, '0')}/${date.year}`
}

function weekdayLabel(day: string) {
  const normalized = day.toLocaleLowerCase('es-AR').replace('.', '')
  if (normalized.startsWith('do')) return 'D'
  if (normalized.startsWith('lu')) return 'L'
  if (normalized.startsWith('ma')) return 'M'
  if (normalized.startsWith('mi')) return 'X'
  if (normalized.startsWith('ju')) return 'J'
  if (normalized.startsWith('vi')) return 'V'
  return 'S'
}

export default function DatePicker({
  id,
  name,
  value,
  onChange,
  minDate,
  maxDate,
  disabled = false,
  required = false,
  ariaLabel = 'Seleccionar fecha',
}: DatePickerProps) {
  const selectedDate = parseCivilDate(value)
  const minimumDate = parseCivilDate(minDate)
  const maximumDate = parseCivilDate(maxDate)

  function handleChange(date: CalendarDate, close: () => void) {
    onChange?.(date.toString())
    close()
  }

  return (
    <I18nProvider locale="es-AR">
      <DialogTrigger>
        <AriaButton
          id={id}
          aria-label={ariaLabel}
          isDisabled={disabled}
          className="group flex min-h-11 w-full items-center gap-3 rounded-lg border border-[var(--border)] bg-white px-3 py-2.5 text-left text-sm font-medium tabular-nums text-[var(--foreground)] transition-[border-color,box-shadow,background-color] hover:border-gray-300 focus-visible:border-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]/20 disabled:cursor-not-allowed disabled:bg-[var(--secondary)] disabled:opacity-60"
        >
          <CalendarDays className="h-4 w-4 shrink-0 text-[var(--primary)]" aria-hidden="true" />
          <span className={`min-w-0 flex-1 ${selectedDate ? '' : 'text-[var(--muted)]'}`}>
            {formatCivilDate(value)}
          </span>
          <ChevronDown
            className="h-4 w-4 shrink-0 text-[var(--muted)] transition-transform group-aria-expanded:rotate-180"
            aria-hidden="true"
          />
        </AriaButton>

        <Popover
          placement="bottom start"
          offset={6}
          className="z-50 w-[calc(100vw-2rem)] max-w-80 overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-xl outline-none"
        >
          <Dialog className="p-4 outline-none">
            {({ close }) => (
              <Calendar
                aria-label={ariaLabel}
                value={selectedDate}
                onChange={date => handleChange(date, close)}
                minValue={minimumDate ?? undefined}
                maxValue={maximumDate ?? undefined}
                firstDayOfWeek="sun"
                className="w-full"
              >
                <header className="mb-3 flex items-center justify-between gap-3">
                  <AriaButton
                    slot="previous"
                    aria-label="Mes anterior"
                    className="flex h-10 w-10 items-center justify-center rounded-lg text-[var(--muted)] transition-colors hover:bg-[var(--secondary)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
                  >
                    <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                  </AriaButton>
                  <CalendarHeading className="text-center text-sm font-bold capitalize" />
                  <AriaButton
                    slot="next"
                    aria-label="Mes siguiente"
                    className="flex h-10 w-10 items-center justify-center rounded-lg text-[var(--muted)] transition-colors hover:bg-[var(--secondary)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
                  >
                    <ChevronRight className="h-5 w-5" aria-hidden="true" />
                  </AriaButton>
                </header>

                <CalendarGrid weekdayStyle="short" className="w-full table-fixed border-separate border-spacing-y-1">
                  <CalendarGridHeader>
                    {day => (
                      <CalendarHeaderCell className="pb-1 text-center text-xs font-semibold text-[var(--muted)]">
                        {weekdayLabel(day)}
                      </CalendarHeaderCell>
                    )}
                  </CalendarGridHeader>
                  <CalendarGridBody>
                    {date => (
                      <CalendarCell
                        date={date}
                        className="mx-auto flex h-9 w-9 items-center justify-center rounded-full text-center text-sm leading-none tabular-nums outline-none transition-[background-color,color,box-shadow] data-[outside-month]:text-gray-300 data-[hovered]:bg-[var(--secondary)] data-[focus-visible]:ring-2 data-[focus-visible]:ring-[var(--primary)] data-[focus-visible]:ring-offset-1 data-[today]:font-bold data-[today]:text-[var(--primary)] data-[selected]:bg-[var(--primary)] data-[selected]:font-semibold data-[selected]:text-white data-[disabled]:cursor-not-allowed data-[disabled]:text-gray-300 data-[disabled]:line-through data-[selected]:data-[today]:text-white"
                      />
                    )}
                  </CalendarGridBody>
                </CalendarGrid>
              </Calendar>
            )}
          </Dialog>
        </Popover>
      </DialogTrigger>

      {name && <input type="hidden" name={name} value={value ?? ''} required={required} />}
    </I18nProvider>
  )
}

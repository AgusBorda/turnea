'use client'

import { Check, ChevronDown, Clock3 } from 'lucide-react'
import {
  Button as AriaButton,
  Dialog,
  DialogTrigger,
  ListBox,
  ListBoxItem,
  Popover,
} from 'react-aria-components'

type TimeStep = 1 | 5 | 10 | 15 | 30

interface TimePickerProps {
  id?: string
  name?: string
  value: string | null
  onChange: (value: string | null) => void
  stepMinutes?: TimeStep
  minTime?: string
  maxTime?: string
  disabled?: boolean
  required?: boolean
  ariaLabel?: string
}

const TIME_PATTERN = /^(\d{2}):(\d{2})$/

function parseTime(value: string | undefined, fallback: number) {
  if (!value) return fallback
  const match = TIME_PATTERN.exec(value)
  if (!match) return fallback

  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return fallback
  return hours * 60 + minutes
}

function getTimeParts(value: string | null) {
  const match = value ? TIME_PATTERN.exec(value) : null
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) {
    return { hour: null, minute: null }
  }
  return { hour: match[1], minute: match[2] }
}

function buildMinuteOptions(stepMinutes: TimeStep, currentMinute: string | null) {
  const minutes = Array.from(
    { length: Math.ceil(60 / stepMinutes) },
    (_, index) => String(index * stepMinutes).padStart(2, '0')
  ).filter(minute => Number(minute) < 60)

  if (currentMinute && !minutes.includes(currentMinute)) {
    minutes.push(currentMinute)
    minutes.sort((a, b) => Number(a) - Number(b))
  }

  return minutes
}

export default function TimePicker({
  id,
  name,
  value,
  onChange,
  stepMinutes = 15,
  minTime,
  maxTime,
  disabled = false,
  required = false,
  ariaLabel = 'Seleccionar horario',
}: TimePickerProps) {
  const { hour, minute } = getTimeParts(value)
  const hourOptions = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, '0'))
  const minuteOptions = buildMinuteOptions(stepMinutes, minute)
  const minMinutes = parseTime(minTime, 0)
  const maxMinutes = parseTime(maxTime, 23 * 60 + 59)

  function isAllowed(nextHour: string, nextMinute: string) {
    const nextValue = `${nextHour}:${nextMinute}`
    if (nextValue === value) return true
    const total = Number(nextHour) * 60 + Number(nextMinute)
    return total >= minMinutes && total <= maxMinutes
  }

  function handleHourChange(keys: Set<React.Key> | 'all') {
    if (keys === 'all') return
    const nextHour = String(Array.from(keys)[0] ?? '')
    if (!nextHour) return
    const nextMinute = minute && isAllowed(nextHour, minute)
      ? minute
      : minuteOptions.find(option => isAllowed(nextHour, option))
    if (nextMinute) onChange(`${nextHour}:${nextMinute}`)
  }

  function handleMinuteChange(keys: Set<React.Key> | 'all') {
    if (keys === 'all') return
    const nextMinute = String(Array.from(keys)[0] ?? '')
    if (!nextMinute) return
    const nextHour = hour && isAllowed(hour, nextMinute)
      ? hour
      : hourOptions.find(option => isAllowed(option, nextMinute))
    if (nextHour) onChange(`${nextHour}:${nextMinute}`)
  }

  function centerSelectedOption(element: HTMLElement | null) {
    if (!element) return
    window.requestAnimationFrame(() => {
      const list = element.parentElement
      if (!list) return
      list.scrollTop = element.offsetTop - list.clientHeight / 2 + element.clientHeight / 2
    })
  }

  return (
    <>
      <DialogTrigger>
        <AriaButton
          id={id}
          aria-label={ariaLabel}
          isDisabled={disabled}
          className="group flex min-h-11 w-full items-center gap-3 rounded-lg border border-[var(--border)] bg-white px-3 py-2.5 text-left text-sm font-medium tabular-nums text-[var(--foreground)] transition-[border-color,box-shadow,background-color] hover:border-gray-300 focus-visible:border-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]/20 disabled:cursor-not-allowed disabled:bg-[var(--secondary)] disabled:opacity-60"
        >
          <Clock3 className="h-4 w-4 shrink-0 text-[var(--primary)]" aria-hidden="true" />
          <span className={`min-w-0 flex-1 ${value ? '' : 'text-[var(--muted)]'}`}>
            {value ?? 'Seleccionar hora'}
          </span>
          <ChevronDown
            className="h-4 w-4 shrink-0 text-[var(--muted)] transition-transform group-aria-expanded:rotate-180"
            aria-hidden="true"
          />
        </AriaButton>

        <Popover
          placement="bottom start"
          offset={6}
          className="z-50 w-[var(--trigger-width)] min-w-64 max-w-80 overflow-hidden rounded-xl border border-[var(--border)] bg-white shadow-xl outline-none"
        >
          <Dialog aria-label={ariaLabel} className="p-3 outline-none">
            <div className="grid grid-cols-2 gap-3">
              <TimeColumn
                label="Hora"
                options={hourOptions}
                selectedValue={hour}
                onSelectionChange={handleHourChange}
                isOptionDisabled={option => !minuteOptions.some(nextMinute => isAllowed(option, nextMinute))}
                centerSelectedOption={centerSelectedOption}
              />
              <TimeColumn
                label="Minuto"
                options={minuteOptions}
                selectedValue={minute}
                onSelectionChange={handleMinuteChange}
                isOptionDisabled={option => hour ? !isAllowed(hour, option) : false}
                centerSelectedOption={centerSelectedOption}
              />
            </div>
          </Dialog>
        </Popover>
      </DialogTrigger>

      {name && <input type="hidden" name={name} value={value ?? ''} required={required} />}
    </>
  )
}

function TimeColumn({
  label,
  options,
  selectedValue,
  onSelectionChange,
  isOptionDisabled,
  centerSelectedOption,
}: {
  label: string
  options: string[]
  selectedValue: string | null
  onSelectionChange: (keys: Set<React.Key> | 'all') => void
  isOptionDisabled: (option: string) => boolean
  centerSelectedOption: (element: HTMLElement | null) => void
}) {
  return (
    <div className="min-w-0">
      <p className="mb-2 text-center text-xs font-semibold text-[var(--muted)]">{label}</p>
      <ListBox
        aria-label={label}
        selectionMode="single"
        selectedKeys={selectedValue ? [selectedValue] : []}
        onSelectionChange={onSelectionChange}
        className="h-52 snap-y snap-mandatory overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--secondary)]/60 p-1 outline-none"
      >
        {options.map(option => (
          <ListBoxItem
            key={option}
            id={option}
            textValue={option}
            isDisabled={isOptionDisabled(option)}
            ref={selectedValue === option ? centerSelectedOption : undefined}
            className="flex min-h-10 snap-center cursor-default items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold tabular-nums outline-none transition-colors data-[disabled]:opacity-30 data-[focused]:bg-white data-[focus-visible]:ring-2 data-[focus-visible]:ring-[var(--primary)] data-[hovered]:bg-white data-[selected]:bg-purple-100 data-[selected]:text-[var(--primary)]"
          >
            {({ isSelected }) => (
              <>
                <span>{option}</span>
                {isSelected && <Check className="h-4 w-4" aria-hidden="true" />}
              </>
            )}
          </ListBoxItem>
        ))}
      </ListBox>
    </div>
  )
}

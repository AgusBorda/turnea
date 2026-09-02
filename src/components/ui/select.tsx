'use client'

import type { ReactNode } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import {
  Button as AriaButton,
  ListBox,
  ListBoxItem,
  Popover,
  Select as AriaSelect,
  SelectValue,
} from 'react-aria-components'

export interface TurneaSelectOption {
  id: string
  label: string
  description?: string
}

interface TurneaSelectProps {
  id?: string
  value: string
  onChange: (value: string) => void
  options: TurneaSelectOption[]
  ariaLabel: string
  placeholder?: string
  leadingIcon?: ReactNode
  disabled?: boolean
}

export default function TurneaSelect({
  id,
  value,
  onChange,
  options,
  ariaLabel,
  placeholder = 'Seleccionar',
  leadingIcon,
  disabled = false,
}: TurneaSelectProps) {
  const selectedOption = options.find(option => option.id === value)

  return (
    <AriaSelect
      aria-label={ariaLabel}
      selectedKey={value || null}
      onSelectionChange={key => onChange(String(key))}
      isDisabled={disabled}
      className="w-full"
    >
      <AriaButton
        id={id}
        className="group flex min-h-11 w-full items-center gap-3 rounded-lg border border-[var(--border)] bg-white px-3 py-2.5 text-left text-sm font-medium text-[var(--foreground)] transition-[border-color,box-shadow,background-color] hover:border-gray-300 focus-visible:border-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]/20 disabled:cursor-not-allowed disabled:bg-[var(--secondary)] disabled:opacity-60"
      >
        {leadingIcon}
        <SelectValue className={`min-w-0 flex-1 truncate ${selectedOption ? '' : 'text-[var(--muted)]'}`}>
          {selectedOption?.label ?? placeholder}
        </SelectValue>
        <ChevronDown
          className="h-4 w-4 shrink-0 text-[var(--muted)] transition-transform group-aria-expanded:rotate-180"
          aria-hidden="true"
        />
      </AriaButton>

      <Popover
        placement="bottom start"
        offset={6}
        className="z-[60] w-[var(--trigger-width)] min-w-64 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-[var(--border)] bg-white p-1 shadow-xl outline-none"
      >
        <ListBox
          items={options}
          className="max-h-64 overflow-y-auto outline-none"
          aria-label={ariaLabel}
        >
          {option => (
            <ListBoxItem
              id={option.id}
              textValue={option.label}
              className="flex min-h-11 cursor-default items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm outline-none transition-colors data-[focused]:bg-[var(--secondary)] data-[focus-visible]:ring-2 data-[focus-visible]:ring-[var(--primary)] data-[hovered]:bg-[var(--secondary)] data-[selected]:bg-purple-50 data-[selected]:text-[var(--primary)]"
            >
              {({ isSelected }) => (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{option.label}</span>
                    {option.description && (
                      <span className="mt-0.5 block truncate text-xs font-normal text-[var(--muted)]">
                        {option.description}
                      </span>
                    )}
                  </span>
                  {isSelected && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
                </>
              )}
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
    </AriaSelect>
  )
}

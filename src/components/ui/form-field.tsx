import type { ReactNode } from 'react'

interface FormFieldProps {
  label: string
  htmlFor?: string
  help?: string
  error?: string
  children: ReactNode
  className?: string
}

export default function FormField({
  label,
  htmlFor,
  help,
  error,
  children,
  className,
}: FormFieldProps) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="block text-sm font-medium">
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
      {help && !error && <p className="mt-1.5 text-xs text-[var(--muted)]">{help}</p>}
      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
    </div>
  )
}

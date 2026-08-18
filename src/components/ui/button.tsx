import type { ButtonHTMLAttributes } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
}

const BASE_CLASS = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50'

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-[var(--primary)] text-white hover:bg-[var(--primary-dark)]',
  secondary: 'border border-[var(--border)] bg-white text-[var(--foreground)] hover:bg-[var(--secondary)]',
  ghost: 'text-[var(--muted)] hover:bg-[var(--secondary)] hover:text-[var(--foreground)]',
  destructive: 'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-600',
}

export default function Button({
  variant = 'primary',
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      className={[BASE_CLASS, VARIANT_CLASSES[variant], className].filter(Boolean).join(' ')}
      {...props}
    />
  )
}

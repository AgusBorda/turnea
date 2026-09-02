import type { HTMLAttributes } from 'react'

export default function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={[
        'rounded-xl border border-[var(--border)] bg-white p-4 sm:p-6',
        className,
      ].filter(Boolean).join(' ')}
      {...props}
    />
  )
}

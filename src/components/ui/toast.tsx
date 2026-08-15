'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, CircleAlert, Info, X } from 'lucide-react'

export type ToastTone = 'success' | 'error' | 'warning' | 'info'

export interface ToastMessage {
  id: number
  message: string
  tone: ToastTone
}

interface ShowToastOptions {
  message: string
  tone?: ToastTone
}

const TOAST_DURATION_MS = 5000
const EXIT_DURATION_MS = 200

export function useToast() {
  const nextId = useRef(0)
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const showToast = useCallback(({ message, tone = 'info' }: ShowToastOptions) => {
    const id = ++nextId.current
    setToasts(current => [...current, { id, message, tone }])
  }, [])

  const dismissToast = useCallback((id: number) => {
    setToasts(current => current.filter(toast => toast.id !== id))
  }, [])

  return { toasts, showToast, dismissToast }
}

export function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: ToastMessage[]
  onDismiss: (id: number) => void
}) {
  return (
    <div
      aria-label="Notificaciones"
      className="pointer-events-none fixed inset-x-4 top-4 z-[70] flex flex-col items-end gap-2 sm:left-auto sm:w-full sm:max-w-sm"
    >
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  )
}

function ToastItem({ toast, onDismiss }: { toast: ToastMessage; onDismiss: (id: number) => void }) {
  const [visible, setVisible] = useState(false)

  const close = useCallback(() => {
    setVisible(false)
    window.setTimeout(() => onDismiss(toast.id), EXIT_DURATION_MS)
  }, [onDismiss, toast.id])

  useEffect(() => {
    const enterTimer = window.setTimeout(() => setVisible(true), 10)
    const dismissTimer = window.setTimeout(close, TOAST_DURATION_MS)
    return () => {
      window.clearTimeout(enterTimer)
      window.clearTimeout(dismissTimer)
    }
  }, [close])

  const styles = {
    success: 'border-green-200 bg-green-50 text-green-800',
    error: 'border-red-200 bg-red-50 text-red-800',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
    info: 'border-blue-200 bg-blue-50 text-blue-800',
  }[toast.tone]
  const Icon = {
    success: CheckCircle2,
    error: CircleAlert,
    warning: AlertTriangle,
    info: Info,
  }[toast.tone]

  return (
    <div
      role={toast.tone === 'error' || toast.tone === 'warning' ? 'alert' : 'status'}
      className={`pointer-events-auto flex w-full items-start gap-3 rounded-xl border p-4 shadow-lg transition-all duration-200 ${styles} ${
        visible ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0'
      }`}
    >
      <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-sm font-medium">{toast.message}</p>
      <button
        type="button"
        onClick={close}
        className="rounded-md p-0.5 opacity-70 hover:bg-black/5 hover:opacity-100"
        aria-label="Cerrar notificación"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  )
}

'use client'

import { useEffect, useRef, useState } from 'react'

const MINUTE_MS = 60_000

export function useMinuteNow(onSynchronize?: (now: Date) => void): Date | null {
  const [now, setNow] = useState<Date | null>(null)
  const onSynchronizeRef = useRef(onSynchronize)

  useEffect(() => {
    onSynchronizeRef.current = onSynchronize
  }, [onSynchronize])

  useEffect(() => {
    let timerId: number | undefined

    function scheduleNextMinute() {
      if (timerId !== undefined) window.clearTimeout(timerId)

      const delay = MINUTE_MS - (Date.now() % MINUTE_MS) + 50
      timerId = window.setTimeout(() => {
        const currentNow = new Date()
        setNow(currentNow)
        onSynchronizeRef.current?.(currentNow)
        scheduleNextMinute()
      }, delay)
    }

    function synchronize() {
      const currentNow = new Date()
      setNow(currentNow)
      onSynchronizeRef.current?.(currentNow)
      scheduleNextMinute()
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') synchronize()
    }

    const initialSyncId = window.setTimeout(synchronize, 0)
    window.addEventListener('focus', synchronize)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.clearTimeout(initialSyncId)
      if (timerId !== undefined) window.clearTimeout(timerId)
      window.removeEventListener('focus', synchronize)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  return now
}

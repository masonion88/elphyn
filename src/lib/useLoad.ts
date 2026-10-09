import { useCallback, useEffect, useRef, useState } from 'react'
import { errorMessage } from './api'

type LoadState<T> = { data: T | undefined; error: string | null; loading: boolean }

// Loads data on mount, again whenever the tab comes back into view (agents
// return from FaceTime), and every pollMs while the page is visible.
export function useLoad<T>(load: () => Promise<T>, pollMs: number | null = null) {
  const [state, setState] = useState<LoadState<T>>({ data: undefined, error: null, loading: true })
  const loadRef = useRef(load)
  useEffect(() => {
    loadRef.current = load
  })

  // Only the most recently started load may update the screen. Otherwise a slow
  // poll that started before a debrief could land after it and show stale state.
  const latest = useRef(0)
  const reload = useCallback(async () => {
    const request = ++latest.current
    try {
      const data = await loadRef.current()
      if (request === latest.current) setState({ data, error: null, loading: false })
    } catch (e) {
      if (request === latest.current) setState((s) => ({ ...s, error: errorMessage(e), loading: false }))
    }
  }, [])

  useEffect(() => {
    reload()
    const onVisible = () => document.visibilityState === 'visible' && reload()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [reload])

  useEffect(() => {
    if (!pollMs) return
    const timer = setInterval(() => document.visibilityState === 'visible' && reload(), pollMs)
    return () => clearInterval(timer)
  }, [pollMs, reload])

  return { ...state, reload }
}

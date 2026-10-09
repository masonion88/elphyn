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

  const reload = useCallback(async () => {
    try {
      const data = await loadRef.current()
      setState({ data, error: null, loading: false })
    } catch (e) {
      setState((s) => ({ ...s, error: errorMessage(e), loading: false }))
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

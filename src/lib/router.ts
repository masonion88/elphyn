import { useSyncExternalStore } from 'react'

// A tiny history router: the app has a handful of routes, so no dependency.

const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  window.addEventListener('popstate', listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('popstate', listener)
  }
}

export function navigate(to: string, { replace = false } = {}) {
  if (replace) history.replaceState(null, '', to)
  else history.pushState(null, '', to)
  window.scrollTo(0, 0)
  listeners.forEach((listener) => listener())
}

export function usePath() {
  return useSyncExternalStore(subscribe, () => window.location.pathname)
}

// match('/c/:circleId', '/c/123') → { circleId: '123' }
export function match(pattern: string, path: string): Record<string, string> | null {
  const want = pattern.split('/').filter(Boolean)
  const got = path.split('/').filter(Boolean)
  if (want.length !== got.length) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < want.length; i++) {
    if (want[i].startsWith(':')) params[want[i].slice(1)] = decodeURIComponent(got[i])
    else if (want[i] !== got[i]) return null
  }
  return params
}

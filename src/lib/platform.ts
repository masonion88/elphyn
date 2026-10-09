export function isIPhone(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

// True when opened from the Home Screen rather than in Safari.
export function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
}

// A short, stable label for an anonymous identity, e.g. "6C48". Used for the
// Safari vs Home Screen check: same number means same agent.
export function agentNumber(uid: string): string {
  return uid.slice(0, 4).toUpperCase()
}

export const TIER_NAMES: Record<number, string> = { 1: 'Easy', 2: 'Spicy', 3: 'Legendary' }

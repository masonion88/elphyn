export function isIOS(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) // iPadOS reports itself as a Mac
}

// True when opened from the Home Screen (or installed on desktop) rather than in a browser tab.
export function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
}

// A short label for the devices list, e.g. "iPhone · iOS 26.1".
export function deviceLabel(): string {
  const ua = navigator.userAgent
  const ios = ua.match(/OS (\d+)_(\d+)/)
  if (/iPhone/.test(ua)) return `iPhone${ios ? ` · iOS ${ios[1]}.${ios[2]}` : ''}`
  if (isIOS()) return `iPad${ios ? ` · iPadOS ${ios[1]}.${ios[2]}` : ''}`
  if (/Edg\//.test(ua)) return 'Edge'
  if (/Chrome\//.test(ua)) return 'Chrome'
  if (/Firefox\//.test(ua)) return 'Firefox'
  if (/Safari\//.test(ua)) return 'Safari'
  return 'Browser'
}

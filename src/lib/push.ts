import { deletePushSubscription, HQError, savePushSubscription } from './api'
import { deviceLabel, isIOS, isStandalone } from './platform'

const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY

export type PushSupport = 'ok' | 'needs-home-screen' | 'unsupported' | 'not-configured'

export function pushSupport(): PushSupport {
  if (!vapidPublicKey) return 'not-configured'
  const hasApis = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  if (hasApis) return 'ok'
  // On iPhone and iPad these APIs only exist inside the Home Screen app.
  return isIOS() && !isStandalone() ? 'needs-home-screen' : 'unsupported'
}

export function permissionState(): NotificationPermission | 'unsupported' {
  return 'Notification' in window ? Notification.permission : 'unsupported'
}

export function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch((e) => console.error('service worker', e))
  }
}

// Must run straight from a tap: iOS only shows the permission prompt for a direct action.
export async function enablePush(): Promise<void> {
  if (pushSupport() !== 'ok') throw new HQError('Notifications only work when Elphyn is opened from your Home Screen.')
  const result = await Notification.requestPermission()
  if (result !== 'granted') {
    throw new HQError(result === 'denied'
      ? 'Notifications are blocked for Elphyn. Turn them on in Settings → Notifications → Elphyn.'
      : 'Notifications stayed off.')
  }
  await subscribeAndSave()
}

// On every launch: keep the server's copy fresh, and quietly subscribe again if
// the system dropped the old subscription.
export async function syncPush(): Promise<void> {
  if (pushSupport() !== 'ok' || Notification.permission !== 'granted') return
  try {
    await subscribeAndSave()
  } catch (e) {
    console.warn('push sync', e)
  }
}

export async function currentEndpoint(): Promise<string | null> {
  if (pushSupport() !== 'ok') return null
  const registration = await navigator.serviceWorker.ready
  return (await registration.pushManager.getSubscription())?.endpoint ?? null
}

export async function disablePushHere(): Promise<void> {
  if (pushSupport() !== 'ok') return
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return
  await deletePushSubscription(subscription.endpoint)
  await subscription.unsubscribe()
}

async function subscribeAndSave(): Promise<void> {
  const registration = await navigator.serviceWorker.ready
  const subscription = (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true, // iOS revokes subscriptions that receive a push without showing a notification
      applicationServerKey: base64UrlToBytes(vapidPublicKey),
    }))
  const json = subscription.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new HQError('This device gave Elphyn an incomplete subscription. Try again.')
  }
  await savePushSubscription(json.endpoint, json.keys.p256dh, json.keys.auth, deviceLabel())
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = (value + '='.repeat((4 - (value.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

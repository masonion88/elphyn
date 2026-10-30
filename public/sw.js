// Elphyn's service worker: notifications only. No caching, so the app is always fresh.
//
// Pushes arrive in the Declarative Web Push format ({ web_push: 8030, notification: {...} }).
// iOS 18.4 and later can show those on its own; this handler shows the same
// notification on older systems and other browsers. Every push shows a notification:
// iOS revokes the subscription of apps that receive a push silently.

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let message = {}
  try {
    message = event.data ? event.data.json() : {}
  } catch {
    message = {}
  }
  const n = message.notification || {}
  event.waitUntil(
    self.registration.showNotification(n.title || 'Elphyn', {
      body: n.body || 'Something new in Elphyn.',
      icon: '/icons/icon-192.png',
      data: { navigate: n.navigate || '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL((event.notification.data && event.notification.data.navigate) || '/', self.location.origin).href
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of windows) {
      if ('focus' in client) {
        if ('navigate' in client) await client.navigate(target).catch(() => {})
        return client.focus()
      }
    }
    return self.clients.openWindow(target)
  })())
})

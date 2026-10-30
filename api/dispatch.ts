// Sends due Elphyn notifications. Only the database calls this (pg_net, from
// private.kick_dispatch), with the shared secret DISPATCH_SECRET. Never a browser.
//
// Server-only environment: DISPATCH_SECRET, SUPABASE_SECRET_KEY, VAPID_PRIVATE_KEY,
// VAPID_SUBJECT. Shared with the app: VITE_SUPABASE_URL, VITE_VAPID_PUBLIC_KEY.

import { createClient } from '@supabase/supabase-js'
import { timingSafeEqual } from 'node:crypto'
import webpush from 'web-push'

type Subscription = { endpoint: string; p256dh: string; auth: string }
type Group = { ids: number[]; type: string; title: string; body: string; navigate: string; subscriptions: Subscription[] }
type Outcome = { endpoint: string; status: number; error?: string }

function authorized(request: Request, secret: string | undefined): boolean {
  if (!secret) return false
  const given = Buffer.from(request.headers.get('authorization') ?? '')
  const expected = Buffer.from(`Bearer ${secret}`)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

export async function POST(request: Request): Promise<Response> {
  const env = process.env
  if (!authorized(request, env.DISPATCH_SECRET)) return new Response('Unauthorized', { status: 401 })

  const url = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL
  const publicKey = env.VAPID_PUBLIC_KEY ?? env.VITE_VAPID_PUBLIC_KEY
  const missing = Object.entries({
    VITE_SUPABASE_URL: url, SUPABASE_SECRET_KEY: env.SUPABASE_SECRET_KEY, VITE_VAPID_PUBLIC_KEY: publicKey,
    VAPID_PRIVATE_KEY: env.VAPID_PRIVATE_KEY, VAPID_SUBJECT: env.VAPID_SUBJECT,
  }).filter(([, value]) => !value).map(([name]) => name)
  if (missing.length) return Response.json({ error: `missing ${missing.join(', ')}` }, { status: 500 })

  webpush.setVapidDetails(env.VAPID_SUBJECT!, publicKey!, env.VAPID_PRIVATE_KEY!)
  const db = createClient(url!, env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
  const origin = env.APP_URL ?? new URL(request.url).origin

  let groupsSent = 0
  for (let round = 0; round < 4; round++) {
    const { data, error } = await db.rpc('dispatch_claim', { p_limit: 50 })
    if (error) return Response.json({ error: error.message }, { status: 500 })
    const groups = (data ?? []) as Group[]
    if (groups.length === 0) break

    const results = await Promise.all(groups.map(async (group) => ({
      ids: group.ids,
      outcomes: await Promise.all(group.subscriptions.map((s) => send(s, group, origin))),
    })))
    const { error: finishError } = await db.rpc('dispatch_finish', { p_results: results })
    if (finishError) return Response.json({ error: finishError.message }, { status: 500 })
    groupsSent += groups.length
  }
  return Response.json({ groups: groupsSent })
}

export function GET(): Response {
  return new Response('Method not allowed', { status: 405 })
}

async function send(subscription: Subscription, group: Group, origin: string): Promise<Outcome> {
  // Declarative Web Push: iOS 18.4+ can show this even without the service worker.
  // public/sw.js reads the same shape everywhere else.
  const payload = JSON.stringify({
    web_push: 8030,
    notification: {
      title: group.title,
      body: group.body,
      navigate: new URL(group.navigate, origin).href,
      lang: 'en-US',
      silent: false,
    },
  })
  try {
    const result = await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
      payload,
      { TTL: 24 * 60 * 60, urgency: group.type === 'bid' ? 'high' : 'normal' },
    )
    return { endpoint: subscription.endpoint, status: result.statusCode }
  } catch (e) {
    const err = e as { statusCode?: number; body?: string; message?: string }
    return { endpoint: subscription.endpoint, status: err.statusCode ?? 0, error: String(err.body || err.message || 'send failed').slice(0, 200) }
  }
}

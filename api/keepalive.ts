// Once a day (Vercel cron, see vercel.json): one real database request so a quiet
// week doesn't get the free Supabase project paused, then cleanup of recordings
// that nothing refers to anymore (unsent notes, abandoned uploads).
//
// Vercel sends CRON_SECRET as a Bearer token on cron calls; anything else gets a 401.

import { createClient } from '@supabase/supabase-js'
import { timingSafeEqual } from 'node:crypto'

function authorized(request: Request, secret: string | undefined): boolean {
  if (!secret) return false
  const given = Buffer.from(request.headers.get('authorization') ?? '')
  const expected = Buffer.from(`Bearer ${secret}`)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

export async function GET(request: Request): Promise<Response> {
  const env = process.env
  if (!authorized(request, env.CRON_SECRET)) return new Response('Unauthorized', { status: 401 })
  const url = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL
  if (!url || !env.SUPABASE_SECRET_KEY) return Response.json({ error: 'missing Supabase settings' }, { status: 500 })

  const db = createClient(url, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: ping, error } = await db.rpc('keepalive')
  if (error) return Response.json({ error: error.message }, { status: 500 })

  let orphansRemoved = 0
  const { data: orphans, error: orphanError } = await db.rpc('voice_orphans')
  if (!orphanError && Array.isArray(orphans) && orphans.length > 0) {
    const { data: removed } = await db.storage.from('voice').remove(orphans as string[])
    orphansRemoved = removed?.length ?? 0
  }
  return Response.json({ ok: true, ping, orphansRemoved })
}

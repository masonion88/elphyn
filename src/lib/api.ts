import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { Couple, Device, NotificationPrefs, Profile, VoiceCheck } from './types'

// Errors raised by our database functions (SQLSTATE P0001) carry a message written
// for people. Anything else gets a generic line.
export class HQError extends Error {
  hint: string | null = null
}

export function errorMessage(e: unknown): string {
  return e instanceof HQError ? e.message : "Couldn't reach Elphyn. Check your signal and try again."
}

async function run<T>(request: PromiseLike<{ data: unknown; error: PostgrestError | null }>): Promise<T> {
  const { data, error } = await request
  if (error) {
    console.error(error)
    const e = new HQError(error.code === 'P0001' ? error.message : "Couldn't reach Elphyn. Check your signal and try again.")
    e.hint = error.hint ?? null
    throw e
  }
  return data as T
}

// Profile and settings ----------------------------------------------------------

export const getProfile = (uid: string) =>
  run<Profile | null>(supabase.from('profiles').select('id, display_name, home_animal, timezone').eq('id', uid).maybeSingle())

export const updateProfile = (name: string, animal: string | null, timezone: string) =>
  run<null>(supabase.rpc('update_profile', { p_display_name: name, p_home_animal: animal, p_timezone: timezone }))

export const getNotificationPrefs = async (uid: string): Promise<NotificationPrefs> =>
  (await run<NotificationPrefs | null>(supabase.from('notification_prefs')
    .select('quiet_start, quiet_end, disabled_types, read_receipts').eq('user_id', uid).maybeSingle()))
  ?? { quiet_start: '00:00:00', quiet_end: '08:00:00', disabled_types: [], read_receipts: false }

export const setNotificationPrefs = (prefs: NotificationPrefs) =>
  run<null>(supabase.rpc('set_notification_prefs', {
    p_quiet_start: prefs.quiet_start, p_quiet_end: prefs.quiet_end,
    p_disabled_types: prefs.disabled_types, p_read_receipts: prefs.read_receipts,
  }))

// The couple ------------------------------------------------------------------------

export async function getMyCouple(): Promise<Couple | null> {
  const circle = await run<{ id: string; name: string } | null>(
    supabase.from('circles').select('id, name').eq('kind', 'couple').maybeSingle())
  if (!circle) return null
  const rows = await run<{ profiles: Profile }[]>(supabase.from('circle_members')
    .select('profiles(id, display_name, home_animal, timezone)').eq('circle_id', circle.id).order('joined_at'))
  return { ...circle, members: rows.map((r) => r.profiles) }
}

export const createCouple = () => run<string>(supabase.rpc('create_couple_circle', { p_name: null }))

export const createInvite = (circleId: string) =>
  run<string>(supabase.rpc('create_couple_invite', { p_circle_id: circleId }))

// Returns the couple's id, or null for a wrong, used or expired code.
export const acceptInvite = (code: string) =>
  run<string | null>(supabase.rpc('accept_couple_invite', { p_code: code }))

// Push ---------------------------------------------------------------------------------

export const listMyDevices = (uid: string) =>
  run<Device[]>(supabase.from('push_subscriptions').select('endpoint, device, created_at, last_ok_at')
    .eq('user_id', uid).order('created_at', { ascending: false }))

export const savePushSubscription = (endpoint: string, p256dh: string, auth: string, device: string) =>
  run<null>(supabase.rpc('save_push_subscription', { p_endpoint: endpoint, p_p256dh: p256dh, p_auth: auth, p_device: device }))

export const deletePushSubscription = (endpoint: string) =>
  run<null>(supabase.rpc('delete_push_subscription', { p_endpoint: endpoint }))

export const sendTestPush = (toPartner: boolean, count = 1) =>
  run<null>(supabase.rpc('send_test_push', { p_to_partner: toPartner, p_count: count }))

// Voice ----------------------------------------------------------------------------------

export const listVoiceChecks = (circleId: string) =>
  run<VoiceCheck[]>(supabase.from('voice_checks').select('id, from_id, path, mime, duration_ms, created_at')
    .eq('circle_id', circleId).order('created_at', { ascending: false }))

export const addVoiceCheck = (circleId: string, path: string, mime: string, durationMs: number | null) =>
  run<string>(supabase.rpc('add_voice_check', { p_circle_id: circleId, p_path: path, p_mime: mime, p_duration_ms: durationMs }))

export async function uploadVoice(circleId: string, uid: string, blob: Blob, mime: string): Promise<string> {
  const path = `${circleId}/${uid}/${crypto.randomUUID()}.${extensionFor(mime)}`
  // The bucket allows plain types like audio/mp4, so drop any ";codecs=…" part.
  const contentType = mime.split(';')[0].trim() || 'audio/mp4'
  const { error } = await supabase.storage.from('voice').upload(path, blob, { contentType, upsert: false })
  if (error) {
    console.error(error)
    throw new HQError(`The recording didn't upload (${error.message}). Try again.`)
  }
  return path
}

// Playback links last five minutes. Storage refuses to make one for a recording
// you aren't allowed to hear yet.
export async function voiceUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from('voice').createSignedUrl(path, 300)
  if (error || !data) throw new HQError("That recording can't be played.")
  return data.signedUrl
}

export function extensionFor(mime: string): string {
  const type = mime.split(';')[0].trim().toLowerCase()
  if (type === 'audio/webm') return 'webm'
  if (type === 'audio/ogg') return 'ogg'
  if (type === 'audio/mpeg') return 'mp3'
  if (type === 'audio/aac') return 'aac'
  if (type === 'audio/wav' || type === 'audio/x-wav') return 'wav'
  return 'm4a' // audio/mp4, audio/x-m4a, audio/m4a: what iPhones record
}

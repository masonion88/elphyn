import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { Award, Card, Circle, Deck, Member, Mission, Operation, Profile, Rules, Standing } from './types'

// Errors raised by our database functions (SQLSTATE P0001) carry a message
// written for agents. Anything else gets a generic line.
export class HQError extends Error {
  hint: string | null = null
}

export function errorMessage(e: unknown): string {
  return e instanceof HQError ? e.message : 'The line to HQ went dead. Try again.'
}

async function run<T>(request: PromiseLike<{ data: unknown; error: PostgrestError | null }>): Promise<T> {
  const { data, error } = await request
  if (error) {
    console.error(error)
    const e = new HQError(error.code === 'P0001' ? error.message : 'The line to HQ went dead. Try again.')
    e.hint = error.hint ?? null
    throw e
  }
  return data as T
}

const CARD_COLUMNS = '*, missions(id, text, tier, author_id)'

// Agents ----------------------------------------------------------------------

export const getProfile = (uid: string) =>
  run<Profile | null>(supabase.from('profiles').select('id, display_name').eq('id', uid).maybeSingle())

export const getProfiles = async (ids: string[]) =>
  new Map((await run<Profile[]>(supabase.from('profiles').select('id, display_name').in('id', ids)))
    .map((p) => [p.id, p.display_name]))

export const setDisplayName = (name: string) => run<null>(supabase.rpc('set_display_name', { p_name: name }))

// Circles ---------------------------------------------------------------------

export const listMyCircles = () =>
  run<Circle[]>(supabase.from('circles').select('*').order('created_at', { ascending: false }))

export const getCircle = (id: string) =>
  run<Circle | null>(supabase.from('circles').select('*').eq('id', id).maybeSingle())

export const createCircle = (name: string, deck: Deck) =>
  run<Circle>(supabase.rpc('create_circle', { p_name: name, p_deck: deck }))

// Returns the circle id, or null for a wrong code.
export const joinCircle = (code: string) => run<string | null>(supabase.rpc('join_circle', { p_code: code }))

export async function getRoster(circleId: string): Promise<Member[]> {
  const rows = await run<{ user_id: string; profiles: { display_name: string } }[]>(
    supabase.from('circle_members').select('user_id, profiles(display_name)').eq('circle_id', circleId)
      .order('joined_at'),
  )
  return rows.map((r) => ({ user_id: r.user_id, display_name: r.profiles.display_name }))
}

export const getLeaderboard = (circleId: string) =>
  run<Standing[]>(supabase.from('leaderboard').select('user_id, points').eq('circle_id', circleId))

export const sweepWentDark = (circleId: string) =>
  run<number>(supabase.rpc('sweep_went_dark', { p_circle_id: circleId }))

// Missions --------------------------------------------------------------------

export const createMission = (circleId: string, text: string, tier: number) =>
  run<string>(supabase.rpc('create_mission', { p_circle_id: circleId, p_text: text, p_tier: tier }))

export const listMyMissions = (circleId: string, uid: string) =>
  run<Mission[]>(supabase.from('missions').select('id, text, tier, author_id')
    .eq('circle_id', circleId).eq('author_id', uid).order('created_at', { ascending: false }))

// Operations ------------------------------------------------------------------

export const listOperations = (circleId: string) =>
  run<Operation[]>(supabase.from('operations').select('*').eq('circle_id', circleId)
    .order('created_at', { ascending: false }))

export const getOperation = (id: string) =>
  run<Operation | null>(supabase.from('operations').select('*').eq('id', id).maybeSingle())

export const startOperation = (circleId: string, partnerId: string, callBy: string | null) =>
  run<string>(supabase.rpc('start_operation', { p_circle_id: circleId, p_partner_id: partnerId, p_call_by: callBy }))

// Before the reveal this only ever returns the caller's own card.
export const getCards = (operationId: string) =>
  run<Card[]>(supabase.from('assignments').select(CARD_COLUMNS).eq('operation_id', operationId))

// The caller's cards across a circle's operations, for "your move" labels.
export const getMyCardStates = (uid: string, operationIds: string[]) =>
  run<{ operation_id: string; submitted_at: string | null }[]>(
    supabase.from('assignments').select('operation_id, submitted_at').eq('agent_id', uid).in('operation_id', operationIds),
  )

export const rerollMission = (operationId: string) =>
  run<null>(supabase.rpc('reroll_mission', { p_operation_id: operationId }))

export const submitDebrief = (operationId: string, completed: boolean, accusedDecoy: boolean, accusation: string | null) =>
  run<string>(supabase.rpc('submit_debrief', {
    p_operation_id: operationId, p_completed: completed, p_accused_decoy: accusedDecoy, p_accusation: accusation,
  }))

export const judgeAccusation = (operationId: string, caught: boolean) =>
  run<null>(supabase.rpc('judge_accusation', { p_operation_id: operationId, p_caught: caught }))

export const writeCaseFile = (operationId: string, text: string) =>
  run<null>(supabase.rpc('write_case_file', { p_operation_id: operationId, p_text: text }))

export const getAwards = (operationId: string) =>
  run<Award[]>(supabase.from('assignment_points').select('operation_id, user_id, points, reason')
    .eq('operation_id', operationId))

export const getRules = () => run<Rules>(supabase.rpc('game_rules'))

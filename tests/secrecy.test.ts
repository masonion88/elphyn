// Secrecy acceptance test.
//
// Plays an operation between two throwaway agents and tries every way to peek at
// the other agent's card through the client library, using only the publishable
// key, exactly like a nosy friend with devtools would.
//
//   npm run test:secrecy
//
// Run it sparingly: each run signs up 4 anonymous agents, and Supabase allows
// 30 anonymous sign-ups per hour per IP. A run that hits that limit fails with
// "RATE LIMITED, NOT A LEAK".

import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { before, describe, it } from 'node:test'
import { createClient, type PostgrestError, type SupabaseClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL ?? ''
const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? ''
if (!url || !publishableKey) {
  throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env.local')
}

type Agent = { name: string; id: string; client: SupabaseClient }

const newClient = () =>
  createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } })

async function signUpAgent(name: string): Promise<Agent> {
  const client = newClient()
  const { data, error } = await client.auth.signInAnonymously()
  if (error) {
    if (error.status === 429 || error.code === 'over_request_rate_limit' || /rate limit/i.test(error.message)) {
      throw new Error(
        'RATE LIMITED, NOT A LEAK: Supabase refused an anonymous sign-up (limit: 30 per hour per IP). ' +
          'Nothing about secrecy was tested. Wait up to an hour and run again.',
      )
    }
    if (error.code === 'anonymous_provider_disabled') {
      throw new Error(
        'SETUP, NOT A LEAK: anonymous sign-ins are off for this project. Turn on ' +
          'Authentication > Sign In / Providers > "Allow anonymous sign-ins" in the Supabase dashboard.',
      )
    }
    throw new Error(`Anonymous sign-up failed (${error.code ?? error.status}): ${error.message}`)
  }
  await ok(client.rpc('set_display_name', { p_name: name }))
  return { name, id: data.user!.id, client }
}

// There are no generated database types, so rows come back loose.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any

async function ok(request: PromiseLike<{ data: unknown; error: PostgrestError | null }>): Promise<Loose> {
  const { data, error } = await request
  if (error) assert.fail(`Unexpected error: ${error.code} ${error.message}${error.hint ? ` [${error.hint}]` : ''}`)
  return data
}

async function refused(
  request: PromiseLike<{ error: PostgrestError | null }>,
  expected: { code?: string; hint?: string },
  what: string,
) {
  const { error } = await request
  assert.ok(error, `${what}: expected a refusal, but it went through`)
  if (expected.code) assert.equal(error.code, expected.code, `${what}: got ${error.code} ${error.message}`)
  if (expected.hint) assert.equal(error.hint, expected.hint, `${what}: got ${error.hint} ${error.message}`)
}

async function myCard(agent: Agent, operationId: string) {
  const rows = await ok(
    agent.client
      .from('assignments')
      .select('*, missions(id, text, tier, author_id)')
      .eq('operation_id', operationId)
      .eq('agent_id', agent.id),
  )
  assert.equal(rows.length, 1, `${agent.name} should see their own card`)
  return rows[0]
}

async function writeMissions(agent: Agent, circleId: string, count: number) {
  await Promise.all(
    Array.from({ length: count }, (_, i) =>
      ok(agent.client.rpc('create_mission', {
        p_circle_id: circleId,
        p_text: `${agent.name} test mission #${i + 1}`,
        p_tier: 1 + (i % 3),
      })),
    ),
  )
}

// Every function created in schema public by any migration, with its parameter names.
function publicFunctions(): Map<string, string[]> {
  const dir = 'supabase/migrations'
  const sql = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => readFileSync(join(dir, f), 'utf8'))
    .join('\n')
  const found = new Map<string, string[]>()
  for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+public\.(\w+)\s*\(([^)]*)\)/gi)) {
    found.set(m[1], m[2].split(',').map((p) => p.trim().split(/\s+/)[0]).filter(Boolean))
  }
  return found
}

const TABLES_AND_VIEWS = [
  'profiles', 'circles', 'circle_members', 'missions',
  'operations', 'assignments', 'assignment_points', 'leaderboard',
]

describe('secrecy', () => {
  const nobody = newClient() // publishable key, never signs in
  let A: Agent // on the operation
  let B: Agent // on the operation
  let C: Agent // in the circle, not on the operation
  let D: Agent // outsider
  let circleId: string
  let pairCircleId: string
  let operationId: string
  let bFirstMissionId: string

  before(async () => {
    A = await signUpAgent('Test Agent A')
    B = await signUpAgent('Test Agent B')
    C = await signUpAgent('Test Agent C')
    D = await signUpAgent('Test Agent D')
    const stamp = new Date().toISOString().slice(0, 16)

    const circle = await ok(A.client.rpc('create_circle', { p_name: `Secrecy test ${stamp}`, p_deck: 'chaos' }))
    circleId = circle.id
    const sloppyCode = circle.join_code.toLowerCase().replace('-', ' ') // "otter 4821"
    assert.equal(await ok(B.client.rpc('join_circle', { p_code: sloppyCode })), circleId)
    assert.equal(await ok(C.client.rpc('join_circle', { p_code: circle.join_code })), circleId)

    const pair = await ok(A.client.rpc('create_circle', { p_name: `Pair test ${stamp}`, p_deck: 'tender' }))
    pairCircleId = pair.id
    assert.equal(await ok(B.client.rpc('join_circle', { p_code: pair.join_code })), pairCircleId)

    // Stack both decks with missions written by A and B, so a broken author
    // filter would almost certainly show up in the draws below.
    await writeMissions(A, circleId, 30)
    await writeMissions(B, circleId, 30)
    await writeMissions(A, pairCircleId, 50)
    await writeMissions(B, pairCircleId, 50)
  })

  it('a visitor with no session can read no table or view', async () => {
    for (const relation of TABLES_AND_VIEWS) {
      await refused(nobody.from(relation).select('*').limit(1), { code: '42501' }, `anon select ${relation}`)
    }
  })

  it('a visitor with no session can execute no public function', async () => {
    const functions = publicFunctions()
    assert.ok(functions.size >= 11, `expected at least 11 public functions, found ${functions.size}`)
    for (const [name, params] of functions) {
      const args = Object.fromEntries(params.map((p) => [p, null]))
      await refused(nobody.rpc(name, args), { code: '42501' }, `anon rpc ${name}`)
    }
  })

  it('starting an operation hands back only an id', async () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    operationId = await ok(A.client.rpc('start_operation', {
      p_circle_id: circleId, p_partner_id: B.id, p_call_by: tomorrow,
    }))
    assert.match(operationId, /^[0-9a-f-]{36}$/)
  })

  it('before the reveal, an agent sees only their own card', async () => {
    const all = await ok(A.client.from('assignments').select('*').eq('operation_id', operationId))
    assert.equal(all.length, 1)
    assert.equal(all[0].agent_id, A.id)

    const theirs = await ok(A.client.from('assignments').select('*').eq('agent_id', B.id))
    assert.equal(theirs.length, 0, "A can see B's card")

    const aimedAtMe = await ok(A.client.from('assignments').select('*').eq('target_id', A.id))
    assert.equal(aimedAtMe.length, 0, 'A can see the card aimed at A')
  })

  it("before the reveal, an agent cannot read the other agent's mission text", async () => {
    const bCard = await myCard(B, operationId)
    bFirstMissionId = bCard.mission_id

    const peek = await ok(A.client.from('missions').select('*').eq('id', bFirstMissionId))
    assert.equal(peek.length, 0, "A can read B's mission")

    // A's whole view of the missions table: missions A wrote, plus the one on A's card.
    const aCard = await myCard(A, operationId)
    const visible = await ok(A.client.from('missions').select('id, author_id'))
    for (const m of visible) {
      assert.ok(m.author_id === A.id || m.id === aCard.mission_id, `A can see mission ${m.id}`)
    }
  })

  it("agents can't browse each other's custom missions", async () => {
    const aMissions = await ok(B.client.from('missions').select('id').eq('author_id', A.id))
    assert.equal(aMissions.length, 0, "B can browse A's missions")
  })

  it('no card is written by either agent, before or after the veto, and the veto works once', async () => {
    const draws = [await myCard(A, operationId), await myCard(B, operationId)]
    await ok(A.client.rpc('reroll_mission', { p_operation_id: operationId }))
    await ok(B.client.rpc('reroll_mission', { p_operation_id: operationId }))
    const aNew = await myCard(A, operationId)
    const bNew = await myCard(B, operationId)
    draws.push(aNew, bNew)

    assert.notEqual(aNew.mission_id, draws[0].mission_id, 'the veto handed A the same card')
    assert.notEqual(aNew.mission_id, bNew.mission_id, 'both agents hold the same card')
    for (const card of draws) {
      assert.notEqual(card.missions.author_id, A.id, `a card in A↔B was written by A: ${card.missions.text}`)
      assert.notEqual(card.missions.author_id, B.id, `a card in A↔B was written by B: ${card.missions.text}`)
    }

    await refused(A.client.rpc('reroll_mission', { p_operation_id: operationId }), { hint: 'veto_used' }, 'second veto')
    await refused(C.client.rpc('reroll_mission', { p_operation_id: operationId }), { hint: 'not_your_op' }, 'C vetoes')
  })

  it("agents can't write cards, operations, missions or rosters directly", async () => {
    const denied = { code: '42501' }
    await refused(A.client.from('assignments').update({ completed: true }).eq('operation_id', operationId), denied, 'update cards')
    await refused(A.client.from('assignments').delete().eq('operation_id', operationId), denied, 'delete cards')
    await refused(A.client.from('assignments').insert({
      operation_id: operationId, agent_id: A.id, target_id: B.id, mission_id: bFirstMissionId,
    }), denied, 'insert a card')
    await refused(A.client.from('operations').update({ status: 'revealed' }).eq('id', operationId), denied, 'force a reveal')
    await refused(A.client.from('missions').insert({ deck: 'chaos', text: 'sneaky', tier: 1 }), denied, 'insert a built-in')
    await refused(D.client.from('circle_members').insert({ circle_id: circleId, user_id: D.id }), denied, 'self-join')
  })

  it('a circle member who is not on the operation sees it, but no cards', async () => {
    const ops = await ok(C.client.from('operations').select('*').eq('id', operationId))
    assert.equal(ops.length, 1)
    const cards = await ok(C.client.from('assignments').select('*').eq('operation_id', operationId))
    assert.equal(cards.length, 0, 'C can see cards before the reveal')
  })

  it("an outsider sees nothing and can't guess their way in", async () => {
    for (const relation of TABLES_AND_VIEWS.filter((r) => r !== 'profiles')) {
      const rows = await ok(D.client.from(relation).select('*'))
      assert.equal(rows.length, 0, `outsider can see ${relation}`)
    }
    const profiles = await ok(D.client.from('profiles').select('id'))
    assert.deepEqual(profiles.map((p: Loose) => p.id), [D.id])

    for (let i = 0; i < 10; i++) {
      assert.equal(await ok(D.client.rpc('join_circle', { p_code: 'NOPE-0000' })), null)
    }
    await refused(D.client.rpc('join_circle', { p_code: 'NOPE-0000' }), { hint: 'too_many_codes' }, '11th wrong code')
  })

  it('verdicts and case files wait for the reveal', async () => {
    await refused(A.client.rpc('judge_accusation', { p_operation_id: operationId, p_caught: true }), { hint: 'not_revealed' }, 'early verdict')
    await refused(A.client.rpc('write_case_file', { p_operation_id: operationId, p_text: 'Too soon' }), { hint: 'not_revealed' }, 'early case file')
  })

  it("after one agent debriefs, the other still sees nothing of it", async () => {
    const status = await ok(B.client.rpc('submit_debrief', {
      p_operation_id: operationId, p_completed: true, p_accused_decoy: false,
      p_accusation: 'Trying to make me say pineapple',
    }))
    assert.equal(status, 'debrief')

    const theirs = await ok(A.client.from('assignments')
      .select('completed, accusation_text, accused_decoy, is_decoy')
      .eq('operation_id', operationId).eq('agent_id', B.id))
    assert.equal(theirs.length, 0, "A can see B's debrief")

    const [op] = await ok(A.client.from('operations').select('status').eq('id', operationId))
    assert.equal(op.status, 'debrief')

    await refused(B.client.rpc('submit_debrief', {
      p_operation_id: operationId, p_completed: false, p_accused_decoy: true,
    }), { hint: 'already_filed' }, 'second debrief')
  })

  it('once both debrief, the circle sees everything and outsiders still see nothing', async () => {
    const status = await ok(A.client.rpc('submit_debrief', {
      p_operation_id: operationId, p_completed: true, p_accused_decoy: false,
      p_accusation: 'Narrating me like a nature documentary',
    }))
    assert.equal(status, 'revealed')

    for (const viewer of [A, B, C]) {
      const cards = await ok(viewer.client.from('assignments')
        .select('agent_id, completed, accusation_text, accused_decoy, is_decoy, missions(text, tier)')
        .eq('operation_id', operationId))
      assert.equal(cards.length, 2, `${viewer.name} should see both cards`)
      for (const card of cards) {
        assert.ok(card.missions?.text, `${viewer.name} can't read a revealed mission`)
        assert.ok(card.accusation_text, `${viewer.name} can't read a revealed accusation`)
      }
    }
    const outsider = await ok(D.client.from('assignments').select('*').eq('operation_id', operationId))
    assert.equal(outsider.length, 0, 'outsider can see revealed cards')
  })

  it('verdicts score by the rules and case files reach the circle', async () => {
    await ok(A.client.rpc('judge_accusation', { p_operation_id: operationId, p_caught: true }))  // B caught A
    await ok(B.client.rpc('judge_accusation', { p_operation_id: operationId, p_caught: false })) // A missed B

    const rules = await ok(C.client.rpc('game_rules'))
    const bTier = (await myCard(B, operationId)).missions.tier
    const board = await ok(C.client.from('leaderboard').select('user_id, points').eq('circle_id', circleId))
    assert.deepEqual(
      Object.fromEntries(board.map((r: Loose) => [r.user_id, r.points])),
      { [A.id]: 0, [B.id]: rules.tier_points[bTier] + rules.catch_points, [C.id]: 0 },
    )

    await ok(A.client.rpc('write_case_file', { p_operation_id: operationId, p_text: 'Said moist twice. Got made on the third.' }))
    const [card] = await ok(C.client.from('assignments').select('case_file').eq('operation_id', operationId).eq('agent_id', A.id))
    assert.equal(card.case_file, 'Said moist twice. Got made on the third.')
  })

  it("in a two-person circle, the target's missions can be drawn but never your own", async () => {
    const pairOp = await ok(A.client.rpc('start_operation', { p_circle_id: pairCircleId, p_partner_id: B.id }))
    const draws: [Agent, Agent, Loose][] =[[A, B, await myCard(A, pairOp)], [B, A, await myCard(B, pairOp)]]
    await ok(A.client.rpc('reroll_mission', { p_operation_id: pairOp }))
    await ok(B.client.rpc('reroll_mission', { p_operation_id: pairOp }))
    draws.push([A, B, await myCard(A, pairOp)], [B, A, await myCard(B, pairOp)])

    for (const [agent, , card] of draws) {
      assert.notEqual(card.missions.author_id, agent.id, `${agent.name} drew their own mission`)
    }
    // Each draw has a 50-in-59 chance of being target-written, so all four
    // missing is about 1 in 3,000: a failure here is almost certainly real.
    assert.ok(
      draws.some(([, target, card]) => card.missions.author_id === target.id),
      'no target-written card was drawn in a two-person circle',
    )
  })
})

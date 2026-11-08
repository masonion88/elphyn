// Elphyn secrecy and authorization tests, Phase A.
//
// Everything runs through the publishable-key client as real (throwaway) users, the
// way a curious person with devtools would try it. The only exceptions are a few
// read-only checks of things the API deliberately hides (the private outbox), and
// expiring one test invite, which go through the Supabase CLI as the project owner.
//
//   npm run test:elphyn
//
// Needs SUPABASE_SECRET_KEY in .env.local (see tests/support.ts) and a linked CLI.

import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { before, describe, it } from 'node:test'
import { makeAgent, newClient, ok, refused, sql, sqlReport, type Agent, type Loose } from './support.ts'

const APP = process.env.ELPHYN_URL ?? 'https://elphyn.vercel.app'
const CODE_FORMAT = /^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){4}$/

async function setUp(name: string, animal = 'otter', timezone = 'America/New_York'): Promise<Agent> {
  const agent = await makeAgent(name)
  await ok(agent.client.rpc('update_profile', { p_display_name: name, p_home_animal: animal, p_timezone: timezone }))
  return agent
}

// A random, well-formed code that almost certainly isn't anyone's invite.
function randomCode(): string {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
  const chars = Array.from(randomBytes(20), (b) => alphabet[b % 32]).join('')
  return chars.match(/.{4}/g)!.join('-')
}

// A tiny stand-in recording. Storage only checks the declared type, not the audio.
const fakeAudio = () => new Blob([randomBytes(2048)], { type: 'audio/mp4' })

describe('elphyn', () => {
  const nobody = newClient()
  let A: Agent // starts the couple
  let B: Agent // joins A
  let C: Agent // outsider
  let E: Agent // starts a second, one-person couple, so there's a live invite to attack
  let F: Agent // tries E's expired and cancelled invites
  let G: Agent // guesses codes
  let couple: string

  before(async () => {
    A = await setUp('Test A', 'turtle', 'America/New_York')
    B = await setUp('Test B', 'chicken', 'America/Los_Angeles')
    C = await setUp('Test C')
    E = await setUp('Test E')
    F = await setUp('Test F')
    G = await setUp('Test G')
  })

  it('anonymous sign-ins are switched off', async () => {
    const { error } = await newClient().auth.signInAnonymously()
    assert.equal(error?.code, 'anonymous_provider_disabled',
      'SETUP: turn off Authentication > Sign In / Providers > "Allow anonymous sign-ins" in Supabase')
  })

  it('every Elphyn function refuses an anonymous session', () => {
    const results: { fn: string; outcome: string }[] = JSON.parse(sqlReport('tests/sql/anonymous-guard.sql', 'ANON_GUARD_RESULT'))
    assert.ok(results.length >= 13, `expected at least 13 Elphyn functions, found ${results.length}`)
    const allowed = results.filter((r) => !['not_permanent', '42501'].includes(r.outcome))
    assert.deepEqual(allowed, [], 'these functions accepted an anonymous session')
  })

  it('a signed-in person cannot call the sender-side functions', async () => {
    await refused(A.client.rpc('dispatch_claim', { p_limit: 1 }), { code: '42501' }, 'dispatch_claim')
    await refused(A.client.rpc('dispatch_finish', { p_results: [] }), { code: '42501' }, 'dispatch_finish')
    await refused(A.client.rpc('keepalive'), { code: '42501' }, 'keepalive')
    await refused(A.client.rpc('voice_orphans'), { code: '42501' }, 'voice_orphans')
  })

  it('a couple is two people, joined only with a single-use invite', async () => {
    couple = await ok(A.client.rpc('create_couple_circle', { p_name: null }))
    const code: string = await ok(A.client.rpc('create_couple_invite', { p_circle_id: couple }))
    assert.match(code, CODE_FORMAT)

    await refused(A.client.rpc('accept_couple_invite', { p_code: code }), { hint: 'own_invite' }, 'accepting your own invite')

    // Typed sloppily: lowercase, spaces instead of dashes, and the letter O for a zero.
    const sloppy = code.toLowerCase().replace(/-/g, ' ').replace(/0/g, 'o')
    assert.equal(await ok(B.client.rpc('accept_couple_invite', { p_code: sloppy })), couple)

    assert.equal(await ok(C.client.rpc('accept_couple_invite', { p_code: code })), null, 'a used code let a third person in')
    await refused(A.client.rpc('create_couple_invite', { p_circle_id: couple }), { hint: 'couple_full' }, 'invite for a full couple')

    const members = await ok(A.client.from('circle_members').select('user_id').eq('circle_id', couple))
    assert.deepEqual(members.map((m: Loose) => m.user_id).sort(), [A.id, B.id].sort())

    const joined = sql(`select count(*)::int as n from private.outbox
                        where recipient_id = '${A.id}' and type = 'partner_joined'`)
    assert.equal(joined[0].n, 1, 'A was not notified that B joined')
  })

  it("guessing codes can't get anyone into a couple", async () => {
    const eCouple: string = await ok(E.client.rpc('create_couple_circle', { p_name: null }))
    const realCode: string = await ok(E.client.rpc('create_couple_invite', { p_circle_id: eCouple }))

    // Five wrong guesses get the same quiet "no"...
    for (let i = 0; i < 5; i++) {
      assert.equal(await ok(G.client.rpc('accept_couple_invite', { p_code: randomCode() })), null)
    }
    // ...and then even the real code is refused for the rest of the hour.
    await refused(G.client.rpc('accept_couple_invite', { p_code: realCode }), { hint: 'too_many_codes' }, '6th guess')
    const gMembership = await ok(G.client.from('circle_members').select('circle_id'))
    assert.equal(gMembership.length, 0, 'the guesser got into a circle')

    // Someone already paired can't take another couple's invite.
    await refused(B.client.rpc('accept_couple_invite', { p_code: realCode }), { hint: 'already_paired' }, 'B joining E')
  })

  it('cancelled and expired invites stop working', async () => {
    const eCouple: string = (await ok(E.client.from('circles').select('id').eq('kind', 'couple').single())).id
    const first: string = await ok(E.client.rpc('create_couple_invite', { p_circle_id: eCouple }))
    const second: string = await ok(E.client.rpc('create_couple_invite', { p_circle_id: eCouple })) // cancels the first

    assert.equal(await ok(F.client.rpc('accept_couple_invite', { p_code: first })), null, 'a cancelled code still worked')

    sql(`update private.couple_invites set expires_at = now() - interval '1 second'
         where circle_id = '${eCouple}' and used_at is null and revoked_at is null`)
    assert.equal(await ok(F.client.rpc('accept_couple_invite', { p_code: second })), null, 'an expired code still worked')
    const fMembership = await ok(F.client.from('circle_members').select('circle_id'))
    assert.equal(fMembership.length, 0)
  })

  it('partners see each other’s profile; outsiders and settings stay private', async () => {
    const seen = await ok(B.client.from('profiles').select('display_name, home_animal, timezone').eq('id', A.id))
    assert.deepEqual(seen, [{ display_name: 'Test A', home_animal: 'turtle', timezone: 'America/New_York' }])

    assert.equal((await ok(C.client.from('profiles').select('id').eq('id', A.id))).length, 0, 'an outsider saw A')
    await refused(nobody.from('profiles').select('id').eq('id', A.id), { code: '42501' }, 'no session reading profiles')

    await ok(A.client.rpc('set_notification_prefs', {
      p_quiet_start: '23:00', p_quiet_end: '07:30', p_disabled_types: ['countdown'], p_read_receipts: false,
    }))
    assert.equal((await ok(A.client.from('notification_prefs').select('user_id').eq('user_id', A.id))).length, 1)
    assert.equal((await ok(B.client.from('notification_prefs').select('user_id').eq('user_id', A.id))).length, 0,
      "B can read A's notification settings")
    await refused(A.client.rpc('set_notification_prefs', {
      p_quiet_start: '23:00', p_quiet_end: '07:30', p_disabled_types: ['not-a-type'], p_read_receipts: false,
    }), { hint: 'bad_prefs' }, 'unknown notification type')
  })

  it('devices are private, and only real push services are accepted', async () => {
    const endpoint = `https://web.push.apple.com/elphyn-test-${randomUUID()}`
    const keys = { p_p256dh: randomBytes(65).toString('base64url'), p_auth: randomBytes(16).toString('base64url') }

    await refused(A.client.rpc('save_push_subscription', { p_endpoint: 'https://evil.example.com/collect', ...keys, p_device: 'x' }),
      { hint: 'bad_endpoint' }, 'a non-push endpoint')
    await ok(A.client.rpc('save_push_subscription', { p_endpoint: endpoint, ...keys, p_device: 'Test iPhone' }))

    assert.equal((await ok(A.client.from('push_subscriptions').select('endpoint').eq('endpoint', endpoint))).length, 1)
    assert.equal((await ok(B.client.from('push_subscriptions').select('endpoint').eq('user_id', A.id))).length, 0,
      "B can see A's devices")
    assert.equal((await ok(C.client.from('push_subscriptions').select('endpoint'))).length, 0)

    await ok(B.client.rpc('delete_push_subscription', { p_endpoint: endpoint })) // someone else's: quietly nothing
    assert.equal((await ok(A.client.from('push_subscriptions').select('endpoint').eq('endpoint', endpoint))).length, 1,
      "B removed A's device")
    await ok(A.client.rpc('delete_push_subscription', { p_endpoint: endpoint }))
    assert.equal((await ok(A.client.from('push_subscriptions').select('endpoint').eq('endpoint', endpoint))).length, 0)
  })

  it('recordings: your own folder only, and your partner hears one only once it’s shared', async () => {
    const voice = (agent: Agent) => agent.client.storage.from('voice')
    const path = `${couple}/${A.id}/${randomUUID()}.m4a`

    // Each upload declares an audio type, so a refusal can only come from the access rules.
    const audio = { contentType: 'audio/mp4' }
    assert.equal((await voice(C).upload(`${couple}/${C.id}/${randomUUID()}.m4a`, fakeAudio(), audio)).error !== null, true,
      "an outsider uploaded into the couple's folder")
    assert.equal((await voice(B).upload(`${couple}/${A.id}/${randomUUID()}.m4a`, fakeAudio(), audio)).error !== null, true,
      "B uploaded into A's folder")
    assert.equal((await voice(A).upload(path, fakeAudio(), audio)).error, null)

    // Uploaded but not shared yet: only A can make a playback link.
    assert.ok((await voice(A).createSignedUrl(path, 60)).data?.signedUrl, 'A cannot play their own recording')
    assert.ok((await voice(B).createSignedUrl(path, 60)).error, 'B got a link to an unshared recording')
    assert.ok((await voice(C).createSignedUrl(path, 60)).error, 'an outsider got a link')

    await refused(B.client.rpc('add_voice_check', { p_circle_id: couple, p_path: path, p_mime: 'audio/mp4', p_duration_ms: 1000 }),
      { hint: 'bad_voice_path' }, "B sharing A's recording")
    await ok(A.client.rpc('add_voice_check', { p_circle_id: couple, p_path: path, p_mime: 'audio/mp4', p_duration_ms: 1000 }))

    const link = (await voice(B).createSignedUrl(path, 60)).data?.signedUrl
    assert.ok(link, 'B cannot play a shared recording')
    assert.equal((await fetch(link)).status, 200)
    assert.ok((await voice(C).createSignedUrl(path, 60)).error, 'an outsider got a link to a shared recording')

    // In use, so even its owner can't delete it; an unused one can be deleted.
    await voice(A).remove([path])
    assert.ok((await voice(A).createSignedUrl(path, 60)).data?.signedUrl, 'a recording in use was deleted')
    const spare = `${couple}/${A.id}/${randomUUID()}.m4a`
    assert.equal((await voice(A).upload(spare, fakeAudio(), audio)).error, null)
    assert.equal((await voice(A).remove([spare])).data?.length, 1, 'an unused recording could not be deleted')
  })

  it('the sender and the keep-alive refuse callers without the secret', async (t) => {
    const probe = await fetch(`${APP}/api/dispatch`, { method: 'POST' }).catch(() => null)
    // The old app answers every path with its HTML page; that means not deployed yet.
    if (!probe || probe.status === 404 || probe.headers.get('content-type')?.includes('text/html')) {
      t.skip(`${APP} isn't deployed with the /api functions yet`)
      return
    }
    assert.equal(probe.status, 401, 'dispatch without a secret')
    const wrong = await fetch(`${APP}/api/dispatch`, { method: 'POST', headers: { authorization: 'Bearer nope' } })
    assert.equal(wrong.status, 401, 'dispatch with a wrong secret')
    assert.equal((await fetch(`${APP}/api/keepalive`)).status, 401, 'keep-alive without the cron secret')
  })
})

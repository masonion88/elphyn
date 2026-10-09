import { useState } from 'react'
import { Button, Card, Link, LinkButton, Loading, Notice, Screen, Section, Stamp } from '../components/ui'
import {
  getCircle, getLeaderboard, getMyCardStates, getRoster, listOperations, sweepWentDark,
} from '../lib/api'
import { useAgent } from '../lib/session'
import { formatDay } from '../lib/time'
import type { Operation } from '../lib/types'
import { useLoad } from '../lib/useLoad'

async function loadCircle(circleId: string, uid: string) {
  // Mark anything overdue as went_dark first, so the shame is current.
  await sweepWentDark(circleId).catch(() => 0)
  const [circle, roster, operations, standings] = await Promise.all([
    getCircle(circleId), getRoster(circleId), listOperations(circleId), getLeaderboard(circleId),
  ])
  const open = operations.filter((o) => o.status !== 'revealed').map((o) => o.id)
  const myCards = open.length ? await getMyCardStates(uid, open) : []
  return { circle, roster, operations, standings, myCards }
}

export function CirclePage({ circleId }: { circleId: string }) {
  const { uid } = useAgent()
  const { data, error, loading } = useLoad(() => loadCircle(circleId, uid), 15000)

  if (loading) return <Screen><Loading /></Screen>
  if (error && !data) return <Screen back={{ to: '/', label: 'HQ' }}><Notice tone="error">{error}</Notice></Screen>
  if (!data?.circle) {
    return (
      <Screen back={{ to: '/', label: 'HQ' }}>
        <Notice tone="error">This circle is above your clearance. If a friend invited you, ask them for the join code.</Notice>
      </Screen>
    )
  }

  const { circle, roster, operations, standings, myCards } = data
  const name = (id: string) => (id === uid ? 'You' : roster.find((m) => m.user_id === id)?.display_name ?? 'A former agent')
  const pair = (o: Operation) => `${name(o.created_by)} vs ${name(o.partner_id)}`
  const live = operations.filter((o) => o.status === 'briefing' || o.status === 'debrief')
  const dark = operations.filter((o) => o.status === 'went_dark')
  const revealed = operations.filter((o) => o.status === 'revealed').slice(0, 10)
  const ranked = roster
    .map((m) => ({ ...m, points: standings.find((s) => s.user_id === m.user_id)?.points ?? 0 }))
    .sort((a, b) => b.points - a.points || a.display_name.localeCompare(b.display_name))

  function moveLabel(o: Operation) {
    const mine = myCards.find((c) => c.operation_id === o.id)
    if (!mine) return o.status === 'debrief' ? 'Debriefing' : 'In the field'
    if (mine.submitted_at) return `Waiting on ${name(o.created_by === uid ? o.partner_id : o.created_by)}`
    return o.status === 'debrief' ? 'Your move: they filed. Debrief now' : 'Your move'
  }

  return (
    <Screen deck={circle.deck} back={{ to: '/', label: 'HQ' }}>
      <header className="mb-6">
        <p className="font-type text-xs font-bold tracking-[0.3em] text-stamp uppercase">
          {circle.deck === 'chaos' ? 'Classified dossier' : 'Field notes'}
        </p>
        <h1 className="mt-1 text-3xl font-black">{circle.name}</h1>
      </header>

      {roster.length < 2 ? (
        <Card>
          <p className="text-lg font-bold">It's just you in here, agent.</p>
          <p className="mt-1 text-muted">Operations need two. Send your friends the code below.</p>
          <div className="mt-4"><InviteButton code={circle.join_code} /></div>
        </Card>
      ) : (
        <LinkButton to={`/c/${circle.id}/operations/new`}>Start an operation</LinkButton>
      )}

      {live.length > 0 && (
        <Section title="Live operations">
          <ul className="space-y-3">
            {live.map((o) => (
              <li key={o.id}>
                <Link to={`/op/${o.id}`} className="block rounded-3xl border-2 border-line bg-card p-4 active:scale-[0.98]">
                  <p className="font-bold">{pair(o)}</p>
                  <p className="mt-1 text-sm text-muted">
                    {moveLabel(o)}{o.call_by ? ` · call by ${formatDay(o.call_by)}` : ''}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {dark.length > 0 && (
        <Section title="Went dark">
          <ul className="space-y-3">
            {dark.map((o) => (
              <li key={o.id}>
                <Link to={`/op/${o.id}`} className="block rounded-3xl border-2 border-dashed border-stamp/50 bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-bold">{pair(o)}</p>
                    <Stamp tone="muted">Dark</Stamp>
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    The call-by date ({o.call_by ? formatDay(o.call_by) : 'unknown'}) came and went. No debrief. The
                    pigeons are disappointed.
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Leaderboard">
        <Card className="p-2">
          <ol>
            {ranked.map((m, i) => (
              <li key={m.user_id} className={`flex items-center gap-3 rounded-2xl px-3 py-3 ${m.user_id === uid ? 'bg-paper' : ''}`}>
                <span className="w-6 font-type text-muted">{i + 1}</span>
                <span className="flex-1 font-bold">{m.display_name}{m.user_id === uid ? ' (you)' : ''}</span>
                <span className="font-type text-lg font-black">{m.points}</span>
              </li>
            ))}
          </ol>
          {ranked.every((m) => m.points === 0) && (
            <p className="px-3 pb-2 text-sm text-muted">Nobody's scored yet. Somebody start an operation.</p>
          )}
        </Card>
      </Section>

      {revealed.length > 0 && (
        <Section title="Recent reveals">
          <ul className="space-y-2">
            {revealed.map((o) => (
              <li key={o.id}>
                <Link to={`/op/${o.id}`} className="flex min-h-12 items-center justify-between rounded-2xl border-2 border-line bg-card px-4 py-3">
                  <span className="font-bold">{pair(o)}</span>
                  <span className="text-sm text-muted">{o.revealed_at ? formatDay(o.revealed_at) : ''}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="The deck">
        <LinkButton to={`/c/${circle.id}/missions`} variant="secondary">Write a mission</LinkButton>
      </Section>

      <Section title={`Agents (${roster.length})`}>
        <Card>
          <p className="text-lg font-bold">{roster.map((m) => m.display_name).join(', ')}</p>
          <p className="mt-4 text-sm text-muted">Recruit with this code:</p>
          <p className="font-type text-2xl font-black tracking-widest">{circle.join_code}</p>
          {roster.length >= 2 && <div className="mt-4"><InviteButton code={circle.join_code} /></div>}
        </Card>
      </Section>
    </Screen>
  )
}

function InviteButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  const url = `${window.location.origin}/join/${code}`

  async function share() {
    const text = `You've been recruited to Pigeon Ops. Join code: ${code}`
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Pigeon Ops', text, url })
        return
      } catch {
        // Cancelled or unsupported: fall through to copying.
      }
    }
    await navigator.clipboard?.writeText(`${text}\n${url}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  return <Button variant="secondary" onClick={share}>{copied ? 'Invite link copied' : 'Share invite link'}</Button>
}

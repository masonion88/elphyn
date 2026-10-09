import { useState } from 'react'
import { MissionCard } from '../components/MissionCard'
import { Button, Card, Choice, LinkButton, Loading, Notice, Screen, Section, Stamp, TextArea, Title } from '../components/ui'
import {
  errorMessage, getAwards, getCards, getCircle, getOperation, getProfiles, judgeAccusation, rerollMission,
  submitDebrief, writeCaseFile,
} from '../lib/api'
import { TIER_NAMES } from '../lib/platform'
import { useAgent } from '../lib/session'
import { formatDay } from '../lib/time'
import type { Award, Card as CardRow, Operation } from '../lib/types'
import { useLoad } from '../lib/useLoad'

async function loadOperation(operationId: string) {
  const operation = await getOperation(operationId)
  if (!operation) return null
  const [circle, names, cards] = await Promise.all([
    getCircle(operation.circle_id),
    getProfiles([operation.created_by, operation.partner_id]),
    getCards(operationId), // only your own card until the reveal
  ])
  const awards = operation.status === 'revealed' ? await getAwards(operationId) : []
  return { operation, circle, names, cards, awards }
}

type NameOf = (id: string) => string
const possessive = (name: string) => (name === 'You' ? 'Your' : `${name}'s`)

export function OperationPage({ operationId }: { operationId: string }) {
  const { uid } = useAgent()
  // Polls so "waiting for the other agent" turns into the reveal on its own.
  const { data, error, loading, reload } = useLoad(() => loadOperation(operationId), 4000)

  if (loading) return <Screen><Loading /></Screen>
  if (!data?.circle) {
    return (
      <Screen back={{ to: '/', label: 'HQ' }}>
        <Notice tone="error">{error ?? 'This operation is above your clearance.'}</Notice>
      </Screen>
    )
  }

  const { operation: op, circle, names, cards, awards } = data
  const nameOf: NameOf = (id) => (id === uid ? 'You' : names.get(id) ?? 'A former agent')
  const isAgent = uid === op.created_by || uid === op.partner_id
  const myCard = cards.find((c) => c.agent_id === uid) ?? null
  const targetName = names.get(uid === op.created_by ? op.partner_id : op.created_by) ?? 'your target'

  let body
  if (op.status === 'revealed') {
    body = <Reveal op={op} cards={cards} awards={awards} uid={uid} nameOf={nameOf} onChange={reload} />
  } else if (isAgent && myCard && !myCard.submitted_at) {
    body = <Briefing op={op} card={myCard} targetName={targetName} onChange={reload} />
  } else if (isAgent && myCard) {
    body = <Waiting op={op} card={myCard} targetName={targetName} />
  } else {
    body = <Classified op={op} nameOf={nameOf} />
  }

  return (
    <Screen deck={circle.deck} back={{ to: `/c/${circle.id}`, label: circle.name }}>
      {error && <div className="mb-4"><Notice tone="error">{error}</Notice></div>}
      {body}
    </Screen>
  )
}

// Briefing: your card, your one veto, and the way into the debrief ---------------

function Briefing({ op, card, targetName, onChange }: { op: Operation; card: CardRow; targetName: string; onChange: () => Promise<void> }) {
  const [debriefing, setDebriefing] = useState(false)
  const [confirmVeto, setConfirmVeto] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [vetoed, setVetoed] = useState(false)

  async function veto() {
    setBusy(true)
    setError(null)
    try {
      await rerollMission(op.id)
      await onChange()
      setVetoed(true)
      setConfirmVeto(false)
    } catch (err) {
      setError(errorMessage(err))
    }
    setBusy(false)
  }

  if (debriefing) {
    return <DebriefForm op={op} targetName={targetName} onFiled={onChange} onBack={() => setDebriefing(false)} />
  }

  return (
    <>
      <Title kicker={`Operation vs ${targetName}`}>Your orders.</Title>
      {op.status === 'went_dark' && (
        <div className="mb-4">
          <Notice tone="error">This operation went dark: the call-by date passed with no debrief. You can still file late.</Notice>
        </div>
      )}
      {op.status === 'debrief' && <div className="mb-4"><Notice>{targetName} already filed their debrief. Your turn.</Notice></div>}
      {op.call_by && op.status !== 'went_dark' && (
        <p className="mb-4 font-type text-sm text-muted">Call by {formatDay(op.call_by)}</p>
      )}

      {card.missions ? (
        <MissionCard targetName={targetName} text={card.missions.text} tier={card.missions.tier} />
      ) : (
        <Notice>Your orders are still being decrypted. Check back in a moment.</Notice>
      )}

      <div className="mt-4 text-center">
        {vetoed && <p className="mb-2 font-bold text-good">New orders received. Hold the card to read them.</p>}
        {op.status === 'briefing' && !card.rerolled && !confirmVeto && (
          <Button variant="quiet" onClick={() => setConfirmVeto(true)}>Veto this mission</Button>
        )}
        {confirmVeto && (
          <Card>
            <p className="font-bold">Burn this mission and draw another? You get one veto per operation.</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Button variant="danger" onClick={veto} disabled={busy}>{busy ? 'Burning…' : 'Burn it'}</Button>
              <Button variant="secondary" onClick={() => setConfirmVeto(false)} disabled={busy}>Keep it</Button>
            </div>
          </Card>
        )}
        {card.rerolled && !vetoed && <p className="text-sm text-muted">Veto used. These orders are final.</p>}
        {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
      </div>

      <Section title="After the call">
        <p className="mb-4 text-muted">
          Run your mission on FaceTime. Then come back and file your debrief: did you pull it off, and what was {targetName} up to?
        </p>
        <Button onClick={() => setDebriefing(true)}>The call happened. Debrief me.</Button>
      </Section>
    </>
  )
}

function DebriefForm({ op, targetName, onFiled, onBack }: { op: Operation; targetName: string; onFiled: () => Promise<void>; onBack: () => void }) {
  const [completed, setCompleted] = useState<boolean | null>(null)
  const [accusation, setAccusation] = useState('')
  const [noMission, setNoMission] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function file() {
    if (completed === null) return setError('Did you pull it off? Pick one.')
    if (!noMission && !accusation.trim()) return setError(`Accuse ${targetName} of something, or say they had no mission.`)
    setBusy(true)
    setError(null)
    try {
      await submitDebrief(op.id, completed, noMission, noMission ? null : accusation)
      await onFiled()
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <>
      <Title kicker={`Operation vs ${targetName}`}>Debrief.</Title>
      <div className="space-y-8">
        <div>
          <p className="mb-3 text-lg font-bold">Did you pull off your mission?</p>
          <Choice value={completed} onChange={setCompleted} options={[
            { value: true, label: 'Mission accomplished' },
            { value: false, label: "Didn't happen" },
          ]} />
        </div>
        <div>
          <p className="mb-1 text-lg font-bold">What was {targetName}'s mission against you?</p>
          <p className="mb-3 text-sm text-muted">Your accusation. If it nails their mission, you catch them.</p>
          <TextArea value={accusation} onChange={setAccusation} max={280} disabled={noMission}
            placeholder="They kept asking oddly specific questions about my sock drawer." aria-label="Your accusation" />
          <button
            type="button"
            aria-pressed={noMission}
            onClick={() => setNoMission(!noMission)}
            className={`mt-2 min-h-12 w-full rounded-2xl border-2 px-4 font-bold ${noMission ? 'border-ink bg-accent text-accent-ink' : 'border-line bg-card'}`}
          >
            {noMission ? '✓ ' : ''}I think they had no mission
          </button>
        </div>
        <Notice>No take-backs once it's filed. The reveal happens the moment you've both filed.</Notice>
        {error && <Notice tone="error">{error}</Notice>}
        <div className="grid gap-2">
          <Button onClick={file} disabled={busy}>{busy ? 'Filing…' : 'File debrief'}</Button>
          <Button variant="quiet" onClick={onBack} disabled={busy}>Back to my orders</Button>
        </div>
      </div>
    </>
  )
}

function Waiting({ op, card, targetName }: { op: Operation; card: CardRow; targetName: string }) {
  return (
    <>
      <Title kicker={`Operation vs ${targetName}`}>Debrief filed.</Title>
      <Card className="text-center">
        <Stamp tone="good" animate>Filed</Stamp>
        <p className="mt-5 text-lg font-bold">Waiting on {targetName} to file theirs.</p>
        <p className="mt-1 text-muted">The reveal happens the moment they do. This page checks every few seconds. Feel free to nag.</p>
        {op.status === 'went_dark' && <p className="mt-3 text-sm text-stamp">This operation went dark, but a late debrief still counts.</p>}
      </Card>
      {card.missions && (
        <Section title="Your orders, for reference">
          <MissionCard targetName={targetName} text={card.missions.text} tier={card.missions.tier} />
        </Section>
      )}
    </>
  )
}

// What everyone else in the circle sees before the reveal.
function Classified({ op, nameOf }: { op: Operation; nameOf: NameOf }) {
  const status = { briefing: 'In the field', debrief: 'Debriefing', went_dark: 'Went dark', revealed: 'Revealed' }[op.status]
  return (
    <>
      <Title kicker="Operation">{nameOf(op.created_by)} vs {nameOf(op.partner_id)}</Title>
      <Card className="text-center">
        <Stamp>Classified</Stamp>
        <p className="mt-5 text-lg font-bold">Only the two agents know what's going on.</p>
        <p className="mt-1 text-muted">You'll see everything at the reveal.</p>
        <p className="mt-4 font-type text-sm text-muted">
          Status: {status}{op.call_by ? ` · call by ${formatDay(op.call_by)}` : ''}
        </p>
      </Card>
    </>
  )
}

// The reveal: both cards, both accusations, verdicts, points, case file -----------

function Reveal({ op, cards, awards, uid, nameOf, onChange }: {
  op: Operation; cards: CardRow[]; awards: Award[]; uid: string; nameOf: NameOf; onChange: () => Promise<void>
}) {
  const rank = (c: CardRow) => (c.agent_id === uid ? 0 : c.agent_id === op.created_by ? 1 : 2)
  const ordered = [...cards].sort((a, b) => rank(a) - rank(b))
  const accusationAgainst = (card: CardRow) => cards.find((c) => c.agent_id === card.target_id) ?? null
  const pendingVerdicts = cards.some((c) => c.caught === null)

  return (
    <>
      <header className="mb-2 text-center">
        <Stamp animate>Revealed</Stamp>
        <h1 className="mt-4 text-3xl font-black">{nameOf(op.created_by)} vs {nameOf(op.partner_id)}</h1>
      </header>

      {ordered.map((card) => (
        <RevealedCard key={card.id} op={op} card={card} accuser={accusationAgainst(card)} uid={uid} nameOf={nameOf} onChange={onChange} />
      ))}

      <Section title="Points">
        <Card>
          {awards.length > 0 ? (
            <ul className="space-y-2">
              {awards.map((a, i) => (
                <li key={i} className="flex items-baseline gap-3">
                  <span className="font-type text-xl font-black text-good">+{a.points}</span>
                  <span>{awardLine(a, cards, nameOf)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted">
              {pendingVerdicts ? 'Points land once both verdicts are in.' : 'Nobody scored. A clean draw. Suspicious.'}
            </p>
          )}
        </Card>
      </Section>

      <CaseFile op={op} cards={ordered} uid={uid} nameOf={nameOf} onChange={onChange} />
    </>
  )
}

function awardLine(award: Award, cards: CardRow[], nameOf: NameOf): string {
  const who = nameOf(award.user_id)
  if (award.reason === 'mission') {
    const tier = cards.find((c) => c.agent_id === award.user_id)?.missions?.tier ?? 1
    return `${who}: ${TIER_NAMES[tier].toLowerCase()} mission, never caught`
  }
  const caught = cards.find((c) => c.agent_id !== award.user_id)
  const victim = caught ? nameOf(caught.agent_id) : 'them'
  return `${who}: caught ${victim === 'You' ? 'you' : victim} in the act`
}

function RevealedCard({ op, card, accuser, uid, nameOf, onChange }: {
  op: Operation; card: CardRow; accuser: CardRow | null; uid: string; nameOf: NameOf; onChange: () => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const agent = nameOf(card.agent_id)
  const target = nameOf(card.target_id)
  const mine = card.agent_id === uid
  const accusedNothing = accuser?.accused_decoy === true
  const askVerdict = mine && !accusedNothing && (card.caught === null || editing)

  async function judge(caught: boolean) {
    setBusy(true)
    setError(null)
    try {
      await judgeAccusation(op.id, caught)
      await onChange()
      setEditing(false)
    } catch (err) {
      setError(errorMessage(err))
    }
    setBusy(false)
  }

  return (
    <Card className="mt-6">
      <p className="font-type text-xs font-bold tracking-[0.2em] text-muted uppercase">{possessive(agent)} mission on {target === 'You' ? 'you' : target}</p>
      <p className="mt-2 text-xl leading-snug font-bold">{card.missions?.text ?? 'No mission on file.'}</p>
      <p className="mt-2 text-sm text-muted">
        {card.missions ? `${TIER_NAMES[card.missions.tier]} · ` : ''}
        {card.completed ? `${agent} pulled it off.` : `${agent} didn't pull it off.`}
      </p>

      <div className="mt-4 rounded-2xl bg-paper p-4">
        <p className="text-sm text-muted">{possessive(target)} accusation</p>
        <p className="mt-1 text-lg">
          {accusedNothing ? '“I think they had no mission.”' : `“${accuser?.accusation_text ?? '…'}”`}
        </p>
      </div>

      <div className="mt-4">
        {askVerdict ? (
          <>
            <p className="mb-3 font-bold">Did that catch your mission?</p>
            <Choice value={null} onChange={judge} options={[
              { value: true, label: 'They got me' },
              { value: false, label: 'Never suspected a thing' },
            ]} />
            {busy && <p className="mt-2 text-sm text-muted">Filing your verdict…</p>}
          </>
        ) : card.caught === null ? (
          <p className="text-muted">Waiting on {possessive(agent)} verdict: did that accusation catch them?</p>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <Stamp tone={card.caught ? 'stamp' : 'good'} animate>{card.caught ? 'Caught' : 'Uncaught'}</Stamp>
            {mine && !accusedNothing && (
              <Button variant="quiet" className="w-auto!" onClick={() => setEditing(true)}>Change verdict</Button>
            )}
          </div>
        )}
        {accusedNothing && card.caught === false && (
          <p className="mt-2 text-sm text-muted">{target} guessed “no mission,” so {agent === 'You' ? 'you' : agent} got away clean.</p>
        )}
        {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
      </div>
    </Card>
  )
}

function CaseFile({ op, cards, uid, nameOf, onChange }: {
  op: Operation; cards: CardRow[]; uid: string; nameOf: NameOf; onChange: () => Promise<void>
}) {
  const mine = cards.find((c) => c.agent_id === uid)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const filed = cards.filter((c) => c.case_file)

  async function save() {
    if (!text.trim()) return setError('One line. How you pulled it off, or how you got made.')
    setBusy(true)
    setError(null)
    try {
      await writeCaseFile(op.id, text)
      await onChange()
    } catch (err) {
      setError(errorMessage(err))
    }
    setBusy(false)
  }

  return (
    <Section title="Case file">
      {filed.length > 0 && (
        <ul className="mb-4 space-y-3">
          {filed.map((c) => (
            <li key={c.id} className="rounded-2xl border-2 border-line bg-card p-4">
              <p className="font-type text-xs font-bold tracking-widest text-muted uppercase">{nameOf(c.agent_id)}</p>
              <p className="mt-1 text-lg">“{c.case_file}”</p>
            </li>
          ))}
        </ul>
      )}
      {mine && !mine.case_file && (
        <div className="space-y-3">
          <p className="text-muted">One line for the circle's archive: how you pulled it off, or how you got made.</p>
          <TextArea value={text} onChange={setText} max={200} rows={2}
            placeholder="Got made in under a minute. Never attempting a British accent again." aria-label="Your case file line" />
          {error && <Notice tone="error">{error}</Notice>}
          <Button onClick={save} disabled={busy}>{busy ? 'Filing…' : 'Add to the case file'}</Button>
        </div>
      )}
      {!mine && filed.length === 0 && <p className="text-muted">The agents haven't written their case files yet.</p>}
      <div className="mt-8">
        <LinkButton to={`/c/${op.circle_id}`} variant="secondary">Back to the circle</LinkButton>
      </div>
    </Section>
  )
}

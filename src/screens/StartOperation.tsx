import { useState } from 'react'
import { Button, Loading, Notice, Screen, Title } from '../components/ui'
import { errorMessage, getCircle, getRoster, startOperation } from '../lib/api'
import { navigate } from '../lib/router'
import { useAgent } from '../lib/session'
import { endOfLocalDay, todayInput } from '../lib/time'
import { useLoad } from '../lib/useLoad'

export function StartOperation({ circleId }: { circleId: string }) {
  const { uid } = useAgent()
  const { data, error: loadError, loading } = useLoad(async () => {
    const [circle, roster] = await Promise.all([getCircle(circleId), getRoster(circleId)])
    return { circle, roster }
  })
  const [partnerId, setPartnerId] = useState<string | null>(null)
  const [callBy, setCallBy] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (loading) return <Screen><Loading /></Screen>
  if (!data?.circle) return <Screen back={{ to: '/', label: 'HQ' }}><Notice tone="error">{loadError ?? 'This circle is above your clearance.'}</Notice></Screen>

  const others = data.roster.filter((m) => m.user_id !== uid)

  async function start() {
    if (!partnerId) return setError('Pick a target first.')
    setBusy(true)
    setError(null)
    try {
      const operationId = await startOperation(circleId, partnerId, callBy ? endOfLocalDay(callBy) : null)
      navigate(`/op/${operationId}`, { replace: true })
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <Screen deck={data.circle.deck} back={{ to: `/c/${circleId}`, label: data.circle.name }}>
      <Title kicker="New operation">Pick your target.</Title>
      <p className="mb-6 text-lg text-muted">
        You'll each get a secret mission to pull off on the other during your next call. Neither of you will know the
        other's.
      </p>

      <div className="grid gap-3">
        {others.map((m) => (
          <button
            key={m.user_id}
            type="button"
            aria-pressed={partnerId === m.user_id}
            onClick={() => setPartnerId(m.user_id)}
            className={`min-h-16 rounded-2xl border-2 px-5 text-left text-xl font-black transition active:scale-[0.98] ${
              partnerId === m.user_id ? 'border-ink bg-accent text-accent-ink' : 'border-line bg-card'
            }`}
          >
            {m.display_name}
          </button>
        ))}
      </div>

      <div className="mt-8">
        <label htmlFor="call-by" className="block font-bold">Call by <span className="font-normal text-muted">(optional)</span></label>
        <p className="mb-2 text-sm text-muted">
          If this date passes with no debrief, the operation goes dark and the whole circle sees it.
        </p>
        <input
          id="call-by"
          type="date"
          min={todayInput()}
          value={callBy}
          onChange={(e) => setCallBy(e.target.value)}
          className="min-h-14 w-full rounded-2xl border-2 border-line bg-card px-4 text-lg"
        />
      </div>

      {error && <div className="mt-6"><Notice tone="error">{error}</Notice></div>}
      <div className="mt-8">
        <Button onClick={start} disabled={busy || !partnerId}>{busy ? 'Briefing the agents…' : 'Brief the agents'}</Button>
      </div>
    </Screen>
  )
}

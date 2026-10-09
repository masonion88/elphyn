import { useState, type FormEvent } from 'react'
import { Button, Card, Choice, Loading, Notice, Screen, Section, TextArea, Title } from '../components/ui'
import { createMission, errorMessage, getCircle, getRoster, listMyMissions } from '../lib/api'
import { TIER_NAMES } from '../lib/platform'
import { useAgent } from '../lib/session'
import { useLoad } from '../lib/useLoad'

export function WriteMission({ circleId }: { circleId: string }) {
  const { uid } = useAgent()
  const { data, error: loadError, loading, reload } = useLoad(async () => {
    const [circle, roster, mine] = await Promise.all([getCircle(circleId), getRoster(circleId), listMyMissions(circleId, uid)])
    return { circle, roster, mine }
  })
  const [text, setText] = useState('')
  const [tier, setTier] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filed, setFiled] = useState(false)

  if (loading) return <Screen><Loading /></Screen>
  if (!data?.circle) return <Screen back={{ to: '/', label: 'HQ' }}><Notice tone="error">{loadError ?? 'This circle is above your clearance.'}</Notice></Screen>

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!text.trim()) return setError('A blank mission is just a phone call.')
    if (!tier) return setError('How hard is it? Pick a tier.')
    setBusy(true)
    setError(null)
    try {
      await createMission(circleId, text, tier)
      setText('')
      setTier(null)
      setFiled(true)
      await reload()
    } catch (err) {
      setError(errorMessage(err))
    }
    setBusy(false)
  }

  const pairCircle = data.roster.length === 2

  return (
    <Screen deck={data.circle.deck} back={{ to: `/c/${circleId}`, label: data.circle.name }}>
      <Title kicker="The deck">Write a mission.</Title>

      <Card>
        <p className="font-black">House rules</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
          <li>Stupid, never dangerous. No fire, no trespassing, nothing illegal, nothing involving cars or heights.</li>
          <li>Nothing that targets someone's real insecurities. It's ragebait between people who love each other.</li>
          <li>Doable on a FaceTime call (or a call plus a short walk).</li>
        </ul>
      </Card>

      <form onSubmit={submit} className="mt-6 space-y-4">
        <TextArea value={text} onChange={(v) => { setText(v); setFiled(false) }} max={280} rows={4}
          placeholder="Get them to say the word “spatula” without asking them to." aria-label="Mission" />
        <Choice value={tier} onChange={setTier} options={[1, 2, 3].map((t) => ({ value: t, label: TIER_NAMES[t] }))} />
        <p className="text-sm text-muted">
          Easy, spicy and legendary missions are worth 1, 2 and 3 points when pulled off without getting caught.
        </p>
        {error && <Notice tone="error">{error}</Notice>}
        {filed && <Notice tone="good">Mission filed. It's in the deck now.</Notice>}
        <Button type="submit" disabled={busy}>{busy ? 'Filing…' : 'Add to the deck'}</Button>
      </form>

      <p className="mt-4 text-sm text-muted">
        {pairCircle
          ? "In a circle of two, your missions go to your partner, to run on you. Write ones you'd still fall for."
          : "Your missions only go to operations you're not part of, so nobody runs your own mission on you."}
        {' '}Nobody else can browse your missions.
      </p>

      {data.mine.length > 0 && (
        <Section title={`Your missions in this circle (${data.mine.length})`}>
          <ul className="space-y-2">
            {data.mine.map((m) => (
              <li key={m.id} className="rounded-2xl border-2 border-line bg-card px-4 py-3">
                <p>{m.text}</p>
                <p className="mt-1 font-type text-xs text-muted uppercase">{TIER_NAMES[m.tier]}</p>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </Screen>
  )
}

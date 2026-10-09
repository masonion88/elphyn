import { Card, Link, LinkButton, Loading, Notice, Screen, Stamp } from '../components/ui'
import { listMyCircles } from '../lib/api'
import { agentNumber } from '../lib/platform'
import { useAgent } from '../lib/session'
import { useLoad } from '../lib/useLoad'

const DECK_LABEL = { chaos: 'Chaos · classified dossier', tender: 'Tender · field notes' }

export function Home() {
  const { uid, profile } = useAgent()
  const circles = useLoad(listMyCircles)

  return (
    <Screen>
      <header className="mb-8 pt-4 text-center">
        <Stamp>Classified</Stamp>
        <h1 className="mt-4 text-4xl font-black">Pigeon Ops</h1>
        <p className="mt-2 text-lg text-muted">Welcome back, Agent {profile.display_name}.</p>
      </header>

      {circles.loading && <Loading />}
      {circles.error && <Notice tone="error">{circles.error}</Notice>}
      {circles.data && circles.data.length === 0 && (
        <Card className="text-center">
          <p className="text-lg font-bold">No circles yet.</p>
          <p className="mt-1 text-muted">
            Every great spy ring starts with one pigeon and a group chat. Start one, or join with the code a friend sent you.
          </p>
        </Card>
      )}
      {circles.data && circles.data.length > 0 && (
        <ul className="space-y-3">
          {circles.data.map((c) => (
            <li key={c.id} data-deck={c.deck}>
              <Link to={`/c/${c.id}`} className="block rounded-3xl border-2 border-line bg-card p-5 active:scale-[0.98]">
                <p className="text-xl font-black">{c.name}</p>
                <p className="mt-1 font-type text-sm text-muted">{DECK_LABEL[c.deck]}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-8 grid gap-3">
        <LinkButton to="/new">Start a circle</LinkButton>
        <LinkButton to="/join" variant="secondary">Join with a code</LinkButton>
      </div>

      <footer className="mt-12 text-center font-type text-sm text-muted">
        <p>
          Agent #{agentNumber(uid)} · {profile.display_name}
        </p>
        <Link to="/me" className="mt-1 inline-block min-h-11 underline underline-offset-4">Change codename</Link>
      </footer>
    </Screen>
  )
}

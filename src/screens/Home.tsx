import { Card, Link, Screen } from '../components/ui'
import { animalEmoji } from '../lib/content'
import { useMe } from '../lib/sessionContext'
import type { Couple } from '../lib/types'

function localTime(timezone: string): string {
  return new Date().toLocaleTimeString(undefined, { timeZone: timezone, hour: 'numeric', minute: '2-digit' })
}

// Phase A home: just the two of you and the setup screens. The real rooms
// (Today, hypotheticals, the jar, letters) arrive in Phase B.
export function Home({ couple }: { couple: Couple }) {
  const { uid } = useMe()
  const me = couple.members.find((m) => m.id === uid)
  const partner = couple.members.find((m) => m.id !== uid)

  return (
    <Screen>
      <header className="pt-6 pb-8 text-center">
        <img src="/icons/turtlephant.svg" alt="" className="mx-auto h-24 w-24" />
        <h1 className="mt-3 text-4xl font-black">Elphyn</h1>
      </header>

      <div className="grid grid-cols-2 gap-3">
        {[me, partner].map((person) => person && (
          <Card key={person.id} className="text-center">
            <p className="text-4xl" aria-hidden>{animalEmoji(person.home_animal)}</p>
            <p className="mt-2 font-black">{person.id === uid ? 'You' : person.display_name}</p>
            <p className="font-type text-sm text-muted">{localTime(person.timezone)}</p>
          </Card>
        ))}
      </div>

      <section className="mt-10 space-y-2">
        <h2 className="font-type text-xs font-bold tracking-[0.25em] text-muted uppercase">Setup</h2>
        <Link to="/settings/notifications" className="block rounded-2xl border-2 border-line bg-card px-5 py-4 font-bold">
          Notifications
        </Link>
        <Link to="/settings/voice" className="block rounded-2xl border-2 border-line bg-card px-5 py-4 font-bold">
          Voice check
        </Link>
        <Link to="/me" className="block rounded-2xl border-2 border-line bg-card px-5 py-4 font-bold">
          You
        </Link>
      </section>
    </Screen>
  )
}

import { useMemo, useState, type FormEvent } from 'react'
import { Button, Notice, Screen, TextInput, Title } from '../components/ui'
import { errorMessage } from '../lib/api'
import { ANIMALS } from '../lib/content'
import { navigate } from '../lib/router'
import { useSession } from '../lib/sessionContext'

// Elephant and chicken first: the defaults offered in the plan.
const FEATURED = ['elephant', 'chicken', 'turtle', 'dog']

function timeZones(): string[] {
  const zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []
  return zones.length ? zones : ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles']
}

export function ProfileSetup({ mode }: { mode: 'setup' | 'edit' }) {
  const { state, saveProfile, signOut } = useSession()
  const current = state.status === 'ready' ? state.profile : null
  const [name, setName] = useState(current?.display_name ?? '')
  const [animal, setAnimal] = useState<string | null>(current?.home_animal ?? null)
  const [timezone, setTimezone] = useState(current?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const zones = useMemo(() => timeZones(), [])
  const ordered = useMemo(
    () => [...ANIMALS].sort((a, b) => {
      const fa = FEATURED.indexOf(a.name), fb = FEATURED.indexOf(b.name)
      return (fa < 0 ? 99 : fa) - (fb < 0 ? 99 : fb)
    }),
    [],
  )

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return setError('What should Elphyn call you?')
    if (!animal) return setError('Pick your animal.')
    setBusy(true)
    setError(null)
    try {
      await saveProfile(name, animal, timezone)
      if (mode === 'edit') navigate('/')
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <Screen back={mode === 'edit' ? { to: '/', label: 'Home' } : undefined}>
      <Title kicker="Elphyn">{mode === 'setup' ? 'Hello. Who are you?' : 'You'}</Title>
      <form onSubmit={save} className="space-y-8">
        <div>
          <label className="mb-2 block font-bold" htmlFor="name">Your name</label>
          <TextInput id="name" value={name} onChange={setName} max={24} placeholder="Claire" autoComplete="given-name" />
        </div>

        <fieldset>
          <legend className="mb-2 font-bold">Your animal</legend>
          <div className="grid grid-cols-4 gap-2">
            {ordered.map((a) => (
              <button
                key={a.name}
                type="button"
                aria-pressed={animal === a.name}
                onClick={() => setAnimal(a.name)}
                className={`flex min-h-20 flex-col items-center justify-center rounded-2xl border-2 text-xs font-bold ${
                  animal === a.name ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-card'
                }`}
              >
                <span className="text-3xl" aria-hidden>{a.emoji}</span>
                {a.name}
              </button>
            ))}
          </div>
        </fieldset>

        <div>
          <label className="mb-2 block font-bold" htmlFor="tz">Your time zone</label>
          <select
            id="tz"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="min-h-14 w-full rounded-2xl border-2 border-line bg-card px-4 text-lg"
          >
            {zones.map((z) => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}
          </select>
          <p className="mt-1 text-sm text-muted">Quiet hours and the clocks use this.</p>
        </div>

        {error && <Notice tone="error">{error}</Notice>}
        <Button type="submit" disabled={busy}>{busy ? 'Saving…' : mode === 'setup' ? 'Continue' : 'Save'}</Button>
      </form>
      {mode === 'edit' && (
        <div className="mt-10 text-center">
          <Button variant="quiet" onClick={signOut}>Sign out on this device</Button>
        </div>
      )}
    </Screen>
  )
}

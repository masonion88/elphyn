import { useState, type FormEvent } from 'react'
import { Button, Notice, Screen, TextInput, Title } from '../components/ui'
import { createCircle, errorMessage } from '../lib/api'
import { navigate } from '../lib/router'
import type { Deck } from '../lib/types'

const DECKS: { deck: Deck; name: string; blurb: string }[] = [
  { deck: 'chaos', name: 'Chaos', blurb: 'Classified dossier. For friends who show love through psychological warfare.' },
  { deck: 'tender', name: 'Tender', blurb: "Field notes. For people who'd rather be whimsical than win. (They'll still want to win.)" },
]

export function NewCircle() {
  const [name, setName] = useState('')
  const [deck, setDeck] = useState<Deck | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return setError('Your circle needs a name. "The boys" is a classic.')
    if (!deck) return setError('Pick a deck: chaos or tender.')
    setBusy(true)
    setError(null)
    try {
      const circle = await createCircle(name, deck)
      navigate(`/c/${circle.id}`, { replace: true })
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <Screen deck={deck ?? 'chaos'} back={{ to: '/', label: 'HQ' }}>
      <Title kicker="New circle">Assemble your spy ring.</Title>
      <form onSubmit={submit} className="space-y-6">
        <div>
          <label className="mb-2 block font-bold">Circle name</label>
          <TextInput value={name} onChange={setName} max={40} placeholder="the boys" aria-label="Circle name" />
        </div>
        <fieldset>
          <legend className="mb-2 font-bold">Deck</legend>
          <div className="grid gap-3">
            {DECKS.map((d) => (
              <button
                key={d.deck}
                type="button"
                aria-pressed={deck === d.deck}
                onClick={() => setDeck(d.deck)}
                data-deck={d.deck}
                className={`rounded-3xl border-2 bg-card p-5 text-left transition active:scale-[0.98] ${
                  deck === d.deck ? 'border-ink ring-4 ring-accent/30' : 'border-line'
                }`}
              >
                <p className="text-xl font-black">{d.name}</p>
                <p className="mt-1 text-muted">{d.blurb}</p>
              </button>
            ))}
          </div>
        </fieldset>
        {error && <Notice tone="error">{error}</Notice>}
        <Button type="submit" disabled={busy}>{busy ? 'Printing dossiers…' : 'Create circle'}</Button>
      </form>
    </Screen>
  )
}

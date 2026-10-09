import { useState, type FormEvent } from 'react'
import { Button, Notice, Screen, TextInput, Title } from '../components/ui'
import { errorMessage } from '../lib/api'
import { agentNumber, isIPhone, isStandalone } from '../lib/platform'
import { navigate, usePath } from '../lib/router'
import { useSession } from '../lib/sessionContext'

// Shown on the /join screen to iPhone users still in Safari, before they create
// an identity. Safari and the Home Screen app keep separate storage, so an
// agent created in Safari doesn't exist in the Home Screen app.
export function IPhoneFirstNote() {
  return (
    <Notice>
      <p className="font-black">On iPhone? Add to Home Screen first, then pick your codename.</p>
      <p className="mt-2 font-normal">
        Tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>, then open Pigeon Ops from your Home
        Screen and pick your codename there. Safari and the Home Screen app keep separate memories: an agent created
        here in Safari stays stuck in Safari.
      </p>
    </Notice>
  )
}

export function Codename({ mode }: { mode: 'enlist' | 'rename' }) {
  const session = useSession()
  const path = usePath()
  const current = session.state.status === 'ready' ? session.state : null
  const [name, setName] = useState(current?.profile.display_name ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const showIPhoneNote = mode === 'enlist' && path.startsWith('/join') && isIPhone() && !isStandalone()

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return setError('Even spies need a name. Type one in.')
    setBusy(true)
    setError(null)
    try {
      if (mode === 'enlist') {
        await session.enlist(name)
      } else {
        await session.rename(name)
        navigate('/')
      }
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <Screen back={mode === 'rename' ? { to: '/', label: 'HQ' } : undefined}>
      {mode === 'enlist' ? (
        <Title kicker="Pigeon Ops · Recruitment">Every agent needs a codename.</Title>
      ) : (
        <Title kicker={`Agent #${current ? agentNumber(current.uid) : ''}`}>Change your codename</Title>
      )}
      {showIPhoneNote && <div className="mb-6"><IPhoneFirstNote /></div>}
      <p className="mb-6 text-lg text-muted">
        {mode === 'enlist'
          ? 'Pick something your friends will recognize. No email, no password: HQ remembers you on this device.'
          : 'Your missions, points and case files stay with you. Only the name on the dossier changes.'}
      </p>
      <form onSubmit={submit} className="space-y-4">
        <TextInput value={name} onChange={setName} max={24} placeholder="e.g. UCI" autoFocus aria-label="Codename" />
        {error && <Notice tone="error">{error}</Notice>}
        <Button type="submit" disabled={busy}>
          {busy ? 'Issuing credentials…' : mode === 'enlist' ? 'Report for duty' : 'Update the dossier'}
        </Button>
      </form>
    </Screen>
  )
}

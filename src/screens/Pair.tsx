import { useState, type FormEvent } from 'react'
import { Button, Card, Notice, Screen, TextInput, Title } from '../components/ui'
import { acceptInvite, createCouple, createInvite, errorMessage } from '../lib/api'
import type { Couple } from '../lib/types'

// Shown until there are two of you. You either start your space and send an invite
// code, or type the code you were sent. Codes are typed inside the installed app,
// because a link wouldn't carry over from Safari to the Home Screen app.
export function Pair({ couple, onChange }: { couple: Couple | null; onChange: () => Promise<void> }) {
  const [code, setCode] = useState('')
  const [invite, setInvite] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function start() {
    setBusy(true)
    setError(null)
    try {
      const circleId = couple?.id ?? (await createCouple())
      setInvite(await createInvite(circleId))
      await onChange()
    } catch (err) {
      setError(errorMessage(err))
    }
    setBusy(false)
  }

  async function join(e: FormEvent) {
    e.preventDefault()
    if (code.replace(/[^A-Za-z0-9]/g, '').length < 20) return setError('Invite codes are 20 letters and numbers.')
    setBusy(true)
    setError(null)
    try {
      const circleId = await acceptInvite(code)
      if (!circleId) {
        setError("That code didn't work. It may be mistyped, used, or older than 7 days. Ask for a new one.")
      } else {
        await onChange()
      }
    } catch (err) {
      setError(errorMessage(err))
    }
    setBusy(false)
  }

  async function share() {
    if (!invite) return
    const text = `Your Elphyn invite code: ${invite}\nOpen Elphyn from your Home Screen and enter it. It works once and lasts 7 days.`
    if (navigator.share) {
      try {
        await navigator.share({ text })
        return
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return
      }
    }
    await navigator.clipboard?.writeText(invite)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  const waiting = couple !== null // started, but only one of you so far

  return (
    <Screen>
      <Title kicker="Elphyn">{waiting ? 'Waiting for your person.' : 'Two of you, one Elphyn.'}</Title>

      {invite ? (
        <Card>
          <p className="font-bold">Send them this code:</p>
          <p className="mt-3 font-type text-2xl leading-snug font-black tracking-wider break-all">{invite}</p>
          <p className="mt-3 text-sm text-muted">
            It works once and lasts 7 days. Elphyn only shows it now, so send it before you leave this screen.
          </p>
          <div className="mt-4">
            <Button variant="secondary" onClick={share}>{copied ? 'Copied' : 'Share the code'}</Button>
          </div>
        </Card>
      ) : waiting ? (
        <Card>
          <p className="text-lg">Your space is ready. Once your person enters your code, you’ll get a notification.</p>
          <p className="mt-2 text-sm text-muted">Lost the code, or it expired? Make a new one. The old one stops working.</p>
          <div className="mt-4"><Button onClick={start} disabled={busy}>{busy ? 'Making…' : 'Make a new code'}</Button></div>
        </Card>
      ) : (
        <>
          <Card>
            <p className="text-lg font-bold">Starting Elphyn?</p>
            <p className="mt-1 text-muted">Make your space, then send your person a one-time code.</p>
            <div className="mt-4"><Button onClick={start} disabled={busy}>{busy ? 'Making…' : 'Start our space'}</Button></div>
          </Card>

          <form onSubmit={join} className="mt-6 space-y-3">
            <p className="text-lg font-bold">Got a code?</p>
            <TextInput value={code} onChange={(v) => setCode(v.toUpperCase())} max={40} autoCapitalize="characters"
              autoComplete="off" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX" aria-label="Invite code" />
            <Button type="submit" variant="secondary" disabled={busy}>{busy ? 'Checking…' : 'Join'}</Button>
          </form>
        </>
      )}

      {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}
    </Screen>
  )
}

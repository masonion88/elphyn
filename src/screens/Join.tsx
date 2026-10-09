import { useState, type FormEvent } from 'react'
import { Button, Notice, Screen, TextInput, Title } from '../components/ui'
import { errorMessage, joinCircle } from '../lib/api'
import { isIPhone, isStandalone } from '../lib/platform'
import { navigate } from '../lib/router'

export function Join({ code: initialCode }: { code?: string }) {
  const [code, setCode] = useState((initialCode ?? '').toUpperCase())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!code.trim()) return setError('Type the code your friend sent you. Looks like OTTER-4821.')
    setBusy(true)
    setError(null)
    try {
      const circleId = await joinCircle(code)
      if (!circleId) {
        setError("That code doesn't match any circle. Check it with whoever sent it.")
        setBusy(false)
        return
      }
      navigate(`/c/${circleId}`, { replace: true })
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <Screen back={{ to: '/', label: 'HQ' }}>
      <Title kicker="Recruitment">You've been summoned.</Title>
      {isIPhone() && !isStandalone() && (
        <div className="mb-6">
          <Notice>
            <p className="font-black">On iPhone? Add to Home Screen first, then pick your codename.</p>
            <p className="mt-2 font-normal">
              Pigeon Ops works best from your Home Screen, and Safari and the Home Screen app don't share memory. If you
              haven't joined any circles here in Safari yet, tap <strong>Share → Add to Home Screen</strong> and join
              from there instead.
            </p>
          </Notice>
        </div>
      )}
      <form onSubmit={submit} className="space-y-4">
        <label className="block font-bold" htmlFor="join-code">Join code</label>
        <TextInput
          id="join-code"
          value={code}
          onChange={(v) => setCode(v.toUpperCase())}
          max={20}
          placeholder="OTTER-4821"
          autoCapitalize="characters"
          aria-label="Join code"
        />
        {error && <Notice tone="error">{error}</Notice>}
        <Button type="submit" disabled={busy}>{busy ? 'Checking credentials…' : 'Join the circle'}</Button>
      </form>
    </Screen>
  )
}

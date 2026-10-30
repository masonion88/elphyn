import { useState, type FormEvent } from 'react'
import { Button, Notice, Screen, TextInput } from '../components/ui'
import { errorMessage } from '../lib/api'
import { isIOS, isStandalone } from '../lib/platform'
import { useSession } from '../lib/sessionContext'

export function SignIn() {
  const { requestCode, verifyCode } = useSession()
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resent, setResent] = useState(false)

  async function send(e?: FormEvent) {
    e?.preventDefault()
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('That doesn’t look like an email address.')
    setBusy(true)
    setError(null)
    try {
      await requestCode(email)
      setStep('code')
      setResent(step === 'code')
    } catch (err) {
      setError(errorMessage(err))
    }
    setBusy(false)
  }

  async function verify(e: FormEvent) {
    e.preventDefault()
    if (code.replace(/\D/g, '').length < 6) return setError('The code is at least 6 digits.')
    setBusy(true)
    setError(null)
    try {
      await verifyCode(email, code)
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <Screen>
      <header className="pt-8 pb-6 text-center">
        <img src="/icons/turtlephant.svg" alt="" className="mx-auto h-28 w-28" />
        <h1 className="mt-4 text-4xl font-black">Elphyn</h1>
      </header>

      {isIOS() && !isStandalone() && (
        <div className="mb-6">
          <Notice>
            <p className="font-black">On iPhone or iPad? Add Elphyn to your Home Screen first.</p>
            <p className="mt-2 font-normal">
              Tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>, then open Elphyn from its icon and sign
              in there. Safari and the Home Screen app don’t share a sign-in.
            </p>
          </Notice>
        </div>
      )}

      {step === 'email' ? (
        <form onSubmit={send} className="space-y-4">
          <p className="text-lg text-muted">Sign in with your email. Elphyn sends you a code, no password needed.</p>
          <TextInput value={email} onChange={setEmail} max={200} type="email" inputMode="email" autoComplete="email"
            autoCapitalize="none" placeholder="you@example.com" aria-label="Email" />
          {error && <Notice tone="error">{error}</Notice>}
          <Button type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send me a code'}</Button>
        </form>
      ) : (
        <form onSubmit={verify} className="space-y-4">
          <p className="text-lg text-muted">
            A code is on its way to <strong className="text-ink">{email.trim()}</strong>. It can take a minute.
          </p>
          <TextInput value={code} onChange={setCode} max={12} inputMode="numeric" autoComplete="one-time-code"
            placeholder="123456" aria-label="Code from the email" />
          {resent && !error && <Notice tone="good">New code sent. Use the newest email.</Notice>}
          {error && <Notice tone="error">{error}</Notice>}
          <Button type="submit" disabled={busy}>{busy ? 'Checking…' : 'Sign in'}</Button>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="quiet" onClick={() => send()} disabled={busy}>Send a new code</Button>
            <Button type="button" variant="quiet" onClick={() => { setStep('email'); setCode(''); setError(null) }} disabled={busy}>
              Different email
            </Button>
          </div>
        </form>
      )}
    </Screen>
  )
}

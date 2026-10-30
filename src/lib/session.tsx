import { isAuthRetryableFetchError } from '@supabase/supabase-js'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { errorMessage, getProfile, HQError, updateProfile } from './api'
import { SessionContext, type SessionState } from './sessionContext'
import { supabase } from './supabase'

const NO_SIGNAL = "No signal. You're still signed in on this device. Try again when you're back online."

async function boot(): Promise<SessionState> {
  const { data, error } = await supabase.auth.getSession()
  // An expired token that can't refresh offline comes back as "no session", but the
  // credentials are still saved. Don't ask them to sign in again over that.
  if (error && isAuthRetryableFetchError(error)) return { status: 'error', message: NO_SIGNAL }

  const user = data.session?.user
  if (!user) return { status: 'signed-out' }
  // A leftover anonymous Pigeon Ops session: Elphyn needs a real account.
  if (user.is_anonymous) {
    await supabase.auth.signOut({ scope: 'local' })
    return { status: 'signed-out' }
  }

  const profile = await getProfile(user.id)
  if (profile?.home_animal) return { status: 'ready', uid: user.id, email: user.email ?? null, profile }

  // No profile yet: make sure the account still exists before asking for one.
  const { error: userError } = await supabase.auth.getUser()
  if (userError && isAuthRetryableFetchError(userError)) return { status: 'error', message: NO_SIGNAL }
  if (userError) {
    await supabase.auth.signOut({ scope: 'local' })
    return { status: 'signed-out' }
  }
  return { status: 'needs-profile', uid: user.id, email: user.email ?? null }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: 'loading' })

  const reboot = useCallback(async () => {
    try {
      setState(await boot())
    } catch (e) {
      setState({ status: 'error', message: errorMessage(e) })
    }
  }, [])

  useEffect(() => {
    boot().then(setState, (e) => setState({ status: 'error', message: errorMessage(e) }))
  }, [])

  const requestCode = useCallback(async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } })
    if (!error) return
    console.error(error)
    if (error.status === 429) throw new HQError('Too many codes asked for. Wait a minute, then try again.')
    if (/signups? not allowed/i.test(error.message)) throw new HQError("That email doesn't have an Elphyn account.")
    if (isAuthRetryableFetchError(error)) throw new HQError(NO_SIGNAL)
    throw new HQError("Couldn't send a code to that email. Check it and try again.")
  }, [])

  const verifyCode = useCallback(async (email: string, code: string) => {
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.replace(/\D/g, ''), type: 'email' })
    if (error) {
      console.error(error)
      if (isAuthRetryableFetchError(error)) throw new HQError(NO_SIGNAL)
      throw new HQError("That code didn't work. Check the newest email, or ask for a new code.")
    }
    await reboot()
  }, [reboot])

  const saveProfile = useCallback(async (name: string, animal: string | null, timezone: string) => {
    await updateProfile(name, animal, timezone)
    await reboot()
  }, [reboot])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut({ scope: 'local' })
    setState({ status: 'signed-out' })
  }, [])

  return (
    <SessionContext.Provider value={{ state, requestCode, verifyCode, saveProfile, signOut }}>
      {children}
    </SessionContext.Provider>
  )
}

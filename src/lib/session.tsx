import { isAuthRetryableFetchError } from '@supabase/supabase-js'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { errorMessage, getProfile, HQError, setDisplayName } from './api'
import { SessionContext, type SessionState } from './sessionContext'
import { supabase } from './supabase'

const NO_SIGNAL = "No signal. Your agent is safe on this phone. Try again when you're back online."

async function boot(): Promise<SessionState> {
  const { data, error } = await supabase.auth.getSession()
  // An expired token that can't refresh offline comes back as "no session", but
  // the agent's credentials are still saved. Never offer a new codename then:
  // that would create a new agent over the real one.
  if (error && isAuthRetryableFetchError(error)) return { status: 'error', message: NO_SIGNAL }

  const uid = data.session?.user.id ?? null
  if (!uid) return { status: 'needs-codename', uid: null }

  const profile = await getProfile(uid)
  if (profile) return { status: 'ready', uid, profile }

  // Signed in but never named. Make sure the account still exists before reusing it.
  const { error: userError } = await supabase.auth.getUser()
  if (userError && isAuthRetryableFetchError(userError)) return { status: 'error', message: NO_SIGNAL }
  if (userError) {
    await supabase.auth.signOut({ scope: 'local' })
    return { status: 'needs-codename', uid: null }
  }
  return { status: 'needs-codename', uid }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: 'loading' })

  useEffect(() => {
    boot().then(setState, (e) => setState({ status: 'error', message: errorMessage(e) }))
  }, [])

  // Signs in anonymously only now, when someone actually picks a codename, so
  // passing visitors never create users.
  const enlist = useCallback(async (name: string) => {
    let uid = state.status === 'needs-codename' ? state.uid : null
    if (!uid) {
      const { data, error } = await supabase.auth.signInAnonymously()
      if (error || !data.user) {
        throw new HQError(error?.status === 429
          ? 'Too many new agents from this network. HQ needs a breather. Try again in an hour.'
          : 'HQ couldn\'t issue you credentials. Try again.')
      }
      uid = data.user.id
      // Remember the new identity before naming it, so a failed name retries
      // on the same agent instead of creating another one.
      setState({ status: 'needs-codename', uid })
    }
    await setDisplayName(name)
    setState({ status: 'ready', uid, profile: { id: uid, display_name: name.trim() } })
  }, [state])

  const rename = useCallback(async (name: string) => {
    if (state.status !== 'ready') return
    await setDisplayName(name)
    setState({ ...state, profile: { ...state.profile, display_name: name.trim() } })
  }, [state])

  return <SessionContext.Provider value={{ state, enlist, rename }}>{children}</SessionContext.Provider>
}

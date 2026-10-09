import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { errorMessage, getProfile, HQError, setDisplayName } from './api'
import { supabase } from './supabase'
import type { Profile } from './types'

type SessionState =
  | { status: 'loading' }
  | { status: 'needs-codename'; uid: string | null }
  | { status: 'ready'; uid: string; profile: Profile }
  | { status: 'error'; message: string }

type SessionValue = {
  state: SessionState
  enlist: (name: string) => Promise<void>
  rename: (name: string) => Promise<void>
}

const SessionContext = createContext<SessionValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: 'loading' })

  useEffect(() => {
    ;(async () => {
      try {
        const { data } = await supabase.auth.getSession()
        const uid = data.session?.user.id ?? null
        const profile = uid ? await getProfile(uid) : null
        setState(uid && profile ? { status: 'ready', uid, profile } : { status: 'needs-codename', uid })
      } catch (e) {
        setState({ status: 'error', message: errorMessage(e) })
      }
    })()
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

export function useSession(): SessionValue {
  const value = useContext(SessionContext)
  if (!value) throw new Error('useSession outside SessionProvider')
  return value
}

// For screens behind the codename gate.
export function useAgent(): { uid: string; profile: Profile } {
  const { state } = useSession()
  if (state.status !== 'ready') throw new Error('useAgent before the agent is ready')
  return { uid: state.uid, profile: state.profile }
}

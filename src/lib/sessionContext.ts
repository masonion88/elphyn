import { createContext, useContext } from 'react'
import type { Profile } from './types'

export type SessionState =
  | { status: 'loading' }
  | { status: 'needs-codename'; uid: string | null }
  | { status: 'ready'; uid: string; profile: Profile }
  | { status: 'error'; message: string }

export type SessionValue = {
  state: SessionState
  enlist: (name: string) => Promise<void>
  rename: (name: string) => Promise<void>
}

export const SessionContext = createContext<SessionValue | null>(null)

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

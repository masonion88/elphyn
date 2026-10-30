import { createContext, useContext } from 'react'
import type { Profile } from './types'

export type SessionState =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'needs-profile'; uid: string; email: string | null }
  | { status: 'ready'; uid: string; email: string | null; profile: Profile }
  | { status: 'error'; message: string }

export type SessionValue = {
  state: SessionState
  requestCode: (email: string) => Promise<void>
  verifyCode: (email: string, code: string) => Promise<void>
  saveProfile: (name: string, animal: string | null, timezone: string) => Promise<void>
  signOut: () => Promise<void>
}

export const SessionContext = createContext<SessionValue | null>(null)

export function useSession(): SessionValue {
  const value = useContext(SessionContext)
  if (!value) throw new Error('useSession outside SessionProvider')
  return value
}

// For screens behind the sign-in and profile gates.
export function useMe(): { uid: string; email: string | null; profile: Profile } {
  const { state } = useSession()
  if (state.status !== 'ready') throw new Error('useMe before the profile is ready')
  return { uid: state.uid, email: state.email, profile: state.profile }
}

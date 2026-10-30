import { useEffect } from 'react'
import { Button, LinkButton, Loading, Notice, Screen, Title } from './components/ui'
import { getMyCouple } from './lib/api'
import { syncPush } from './lib/push'
import { usePath } from './lib/router'
import { SessionProvider } from './lib/session'
import { useSession } from './lib/sessionContext'
import { configError } from './lib/supabase'
import { useLoad } from './lib/useLoad'
import { Home } from './screens/Home'
import { NotificationSettings } from './screens/NotificationSettings'
import { Pair } from './screens/Pair'
import { ProfileSetup } from './screens/ProfileSetup'
import { SignIn } from './screens/SignIn'
import { VoiceCheck } from './screens/VoiceCheck'

export default function App() {
  if (configError) {
    return (
      <Screen>
        <Title kicker="Elphyn">Something’s unplugged.</Title>
        <Notice tone="error">{configError}</Notice>
      </Screen>
    )
  }
  return (
    <SessionProvider>
      <Gate />
    </SessionProvider>
  )
}

// Signed in with a real account, then a profile, then the app.
function Gate() {
  const { state } = useSession()

  if (state.status === 'loading') return <Screen><Loading label="Opening Elphyn…" /></Screen>
  if (state.status === 'error') {
    return (
      <Screen>
        <Title kicker="Elphyn">Can’t reach Elphyn right now.</Title>
        <Notice tone="error">{state.message}</Notice>
        <div className="mt-6"><Button onClick={() => window.location.reload()}>Try again</Button></div>
      </Screen>
    )
  }
  if (state.status === 'signed-out') return <SignIn />
  if (state.status === 'needs-profile') return <ProfileSetup mode="setup" />
  return <Signed />
}

function Signed() {
  const path = usePath()
  const couple = useLoad(getMyCouple)

  useEffect(() => {
    syncPush()
  }, [])

  if (path === '/me') return <ProfileSetup mode="edit" />
  if (path === '/settings/notifications') return <NotificationSettings />
  if (path === '/settings/voice') return <VoiceCheck />

  if (couple.loading) return <Screen><Loading label="Opening Elphyn…" /></Screen>
  if (couple.error && !couple.data) return <Screen><Notice tone="error">{couple.error}</Notice></Screen>
  if (path === '/') {
    const c = couple.data ?? null
    return c && c.members.length === 2 ? <Home couple={c} /> : <Pair couple={c} onChange={couple.reload} />
  }
  return (
    <Screen>
      <Title kicker="Elphyn">Nothing lives here.</Title>
      <LinkButton to="/">Home</LinkButton>
    </Screen>
  )
}

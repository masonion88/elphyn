import { Button, LinkButton, Loading, Notice, Screen, Title } from './components/ui'
import { match, usePath } from './lib/router'
import { SessionProvider, useSession } from './lib/session'
import { configError } from './lib/supabase'
import { CirclePage } from './screens/CirclePage'
import { Codename } from './screens/Codename'
import { Home } from './screens/Home'
import { Join } from './screens/Join'
import { NewCircle } from './screens/NewCircle'
import { OperationPage } from './screens/OperationPage'
import { StartOperation } from './screens/StartOperation'
import { WriteMission } from './screens/WriteMission'

export default function App() {
  if (configError) {
    return (
      <Screen>
        <Title kicker="HQ is offline">The wires are crossed.</Title>
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

// Nobody gets past the front desk without a codename. The URL is kept, so a
// /join/OTTER-4821 link still lands on the join screen afterwards.
function Gate() {
  const { state } = useSession()
  const path = usePath()

  if (state.status === 'loading') return <Screen><Loading label="Checking credentials…" /></Screen>
  if (state.status === 'error') {
    return (
      <Screen>
        <Title kicker="HQ is unreachable">Static on the line.</Title>
        <Notice tone="error">{state.message}</Notice>
        <div className="mt-6"><Button onClick={() => window.location.reload()}>Try again</Button></div>
      </Screen>
    )
  }
  if (state.status === 'needs-codename') return <Codename mode="enlist" />
  return <Routes path={path} />
}

function Routes({ path }: { path: string }) {
  let m: Record<string, string> | null
  if (path === '/') return <Home />
  if (path === '/me') return <Codename mode="rename" />
  if (path === '/new') return <NewCircle />
  if (path === '/join') return <Join />
  if ((m = match('/join/:code', path))) return <Join key={m.code} code={m.code} />
  if ((m = match('/c/:circleId', path))) return <CirclePage key={m.circleId} circleId={m.circleId} />
  if ((m = match('/c/:circleId/operations/new', path))) return <StartOperation key={m.circleId} circleId={m.circleId} />
  if ((m = match('/c/:circleId/missions', path))) return <WriteMission key={m.circleId} circleId={m.circleId} />
  if ((m = match('/op/:operationId', path))) return <OperationPage key={m.operationId} operationId={m.operationId} />
  return (
    <Screen>
      <Title kicker="404">This page is above everyone's clearance.</Title>
      <p className="mb-6 text-lg text-muted">Mostly because it doesn't exist.</p>
      <LinkButton to="/">Back to HQ</LinkButton>
    </Screen>
  )
}

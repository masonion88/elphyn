import { useState } from 'react'
import { supabase } from './lib/supabase'

// Phase 0 stub: proves the deploy can reach Supabase. Replaced by the real app in Phase 1.
type Wire = { state: 'idle' } | { state: 'checking' } | { state: 'live'; agent: string } | { state: 'down'; reason: string }

export default function App() {
  const [wire, setWire] = useState<Wire>({ state: 'idle' })

  async function testTheWire() {
    setWire({ state: 'checking' })
    const { data: session } = await supabase.auth.getSession()
    if (!session.session) {
      const { error } = await supabase.auth.signInAnonymously()
      if (error) return setWire({ state: 'down', reason: error.message })
    }
    const { error } = await supabase.rpc('game_rules')
    if (error) return setWire({ state: 'down', reason: error.message })
    const { data } = await supabase.auth.getUser()
    setWire({ state: 'live', agent: data.user?.id.slice(0, 4).toUpperCase() ?? '????' })
  }

  return (
    <main className="min-h-dvh bg-amber-50 px-6 py-16 text-stone-900">
      <div className="mx-auto max-w-sm text-center">
        <p className="text-xs font-bold tracking-[0.3em] text-red-700">CLASSIFIED</p>
        <h1 className="mt-2 text-4xl font-black">Pigeon Ops</h1>
        <p className="mt-4 text-stone-700">
          HQ is under construction. The pigeons are being fitted for trench coats.
        </p>
        <button
          onClick={testTheWire}
          disabled={wire.state === 'checking'}
          className="mt-10 w-full rounded-2xl bg-stone-900 px-6 py-4 text-lg font-bold text-amber-50 active:scale-95 disabled:opacity-60"
        >
          {wire.state === 'checking' ? 'Dialing HQ…' : 'Test the wire'}
        </button>
        {wire.state === 'live' && (
          <p className="mt-6 font-semibold text-emerald-700">Wire is live. You are agent #{wire.agent}.</p>
        )}
        {wire.state === 'down' && (
          <p className="mt-6 font-semibold text-red-700">The line is dead: {wire.reason}</p>
        )}
      </div>
    </main>
  )
}

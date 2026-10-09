import { useState } from 'react'
import { TIER_NAMES } from '../lib/platform'
import { Stamp } from './ui'

// Press and hold to read; let go and it's gone again. The mission text is only
// in the page while it's held, so a glance over your shoulder gets nothing.
export function MissionCard({ targetName, text, tier }: { targetName: string; text: string; tier: number }) {
  const [open, setOpen] = useState(false)
  const show = () => setOpen(true)
  const hide = () => setOpen(false)

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={open ? undefined : 'Press and hold to read your mission'}
      onPointerDown={(e) => {
        show()
        try {
          // Keeps the card open while a thumb drifts off its edge.
          e.currentTarget.setPointerCapture(e.pointerId)
        } catch {
          // Not every browser allows capture; the card still works without it.
        }
      }}
      onPointerUp={hide}
      onPointerCancel={hide}
      onLostPointerCapture={hide}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault()
          show()
        }
      }}
      onKeyUp={hide}
      onBlur={hide}
      className="relative flex min-h-64 touch-none flex-col justify-center rounded-3xl border-2 border-ink bg-card p-6 shadow-[0_6px_0_rgba(0,0,0,0.2)] outline-none select-none [-webkit-touch-callout:none] focus-visible:ring-4 focus-visible:ring-stamp/40"
    >
      {open ? (
        <div className="font-type">
          <p className="text-sm font-bold tracking-widest text-muted uppercase">Agent.</p>
          <p className="mt-2 text-lg">
            Your target: <strong>{targetName}</strong>.
          </p>
          <p className="mt-3 text-2xl leading-snug font-bold">Objective: {text}</p>
          <p className="mt-4 text-sm text-muted">
            Tier: {TIER_NAMES[tier] ?? tier}. This message will not self-destruct, but act like it will.
          </p>
        </div>
      ) : (
        <div className="text-center">
          <Stamp>Classified</Stamp>
          <p className="mt-6 text-lg font-bold">Press and hold to read your orders.</p>
          <p className="mt-1 text-muted">Let go to burn them. Check nobody's looking.</p>
        </div>
      )}
    </div>
  )
}

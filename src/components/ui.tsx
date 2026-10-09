import type { AnchorHTMLAttributes, ButtonHTMLAttributes, MouseEvent, ReactNode } from 'react'
import { navigate } from '../lib/router'
import type { Deck } from '../lib/types'

export function Screen({ deck, back, children }: { deck?: Deck; back?: { to: string; label: string }; children: ReactNode }) {
  return (
    <div data-deck={deck ?? 'chaos'} className="min-h-dvh bg-paper text-ink">
      <main className="mx-auto w-full max-w-md px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-16">
        {back && (
          <Link to={back.to} className="mb-4 inline-flex min-h-11 items-center gap-1 font-semibold text-muted">
            ← {back.label}
          </Link>
        )}
        {children}
      </main>
    </div>
  )
}

export function Link({ to, onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  function handle(e: MouseEvent<HTMLAnchorElement>) {
    onClick?.(e)
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    navigate(to)
  }
  return <a href={to} onClick={handle} {...props} />
}

const BUTTON_BASE =
  'inline-flex min-h-14 w-full items-center justify-center rounded-2xl px-5 text-lg font-bold transition active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100'

const BUTTON_VARIANTS = {
  primary: 'bg-accent text-accent-ink shadow-[0_4px_0_rgba(0,0,0,0.25)]',
  secondary: 'border-2 border-ink/80 bg-card text-ink',
  danger: 'bg-stamp text-white shadow-[0_4px_0_rgba(0,0,0,0.2)]',
  quiet: 'min-h-11 text-base font-semibold text-muted underline underline-offset-4',
}

type Variant = keyof typeof BUTTON_VARIANTS

export function Button({ variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button className={`${BUTTON_BASE} ${BUTTON_VARIANTS[variant]} ${className}`} {...props} />
}

export function LinkButton({ to, variant = 'primary', children }: { to: string; variant?: Variant; children: ReactNode }) {
  return <Link to={to} className={`${BUTTON_BASE} ${BUTTON_VARIANTS[variant]}`}>{children}</Link>
}

export function Stamp({ children, tone = 'stamp', animate = false }: { children: ReactNode; tone?: 'stamp' | 'good' | 'muted'; animate?: boolean }) {
  const color = { stamp: 'border-stamp text-stamp', good: 'border-good text-good', muted: 'border-muted text-muted' }[tone]
  return (
    <span className={`inline-block -rotate-[8deg] rounded-md border-[3px] px-2 py-0.5 font-type text-sm font-black tracking-[0.2em] uppercase ${color} ${animate ? 'animate-stamp' : ''}`}>
      {children}
    </span>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-3xl border-2 border-line bg-card p-5 ${className}`}>{children}</div>
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 font-type text-xs font-bold tracking-[0.25em] text-muted uppercase">{title}</h2>
      {children}
    </section>
  )
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'error' | 'good'; children: ReactNode }) {
  const style = {
    info: 'border-line bg-card text-ink',
    error: 'border-stamp/60 bg-stamp/10 text-stamp',
    good: 'border-good/50 bg-good/10 text-good',
  }[tone]
  return <div role={tone === 'error' ? 'alert' : undefined} className={`rounded-2xl border-2 px-4 py-3 font-semibold ${style}`}>{children}</div>
}

export function Loading({ label = 'Decrypting…' }: { label?: string }) {
  return <p className="py-16 text-center font-type text-muted">{label}</p>
}

export function Title({ kicker, children }: { kicker?: string; children: ReactNode }) {
  return (
    <header className="mb-6">
      {kicker && <p className="font-type text-xs font-bold tracking-[0.3em] text-stamp uppercase">{kicker}</p>}
      <h1 className="mt-1 text-3xl leading-tight font-black">{children}</h1>
    </header>
  )
}

export function TextArea({ value, onChange, max, ...props }: {
  value: string
  onChange: (value: string) => void
  max: number
  placeholder?: string
  disabled?: boolean
  rows?: number
  'aria-label'?: string
}) {
  return (
    <div>
      <textarea
        value={value}
        maxLength={max}
        onChange={(e) => onChange(e.target.value)}
        rows={props.rows ?? 3}
        className="w-full rounded-2xl border-2 border-line bg-card p-4 text-lg outline-none focus:border-ink disabled:opacity-50"
        {...props}
      />
      <p className="mt-1 text-right font-type text-xs text-muted">{value.length}/{max}</p>
    </div>
  )
}

export function TextInput({ value, onChange, max, ...props }: {
  value: string
  onChange: (value: string) => void
  max: number
  placeholder?: string
  autoFocus?: boolean
  autoCapitalize?: string
  id?: string
  'aria-label'?: string
}) {
  return (
    <input
      value={value}
      maxLength={max}
      onChange={(e) => onChange(e.target.value)}
      className="min-h-14 w-full rounded-2xl border-2 border-line bg-card px-4 text-lg outline-none focus:border-ink"
      {...props}
    />
  )
}

// A big two-way (or more) choice, used for yes/no questions and deck/tier pickers.
export function Choice<T extends string | number | boolean>({ value, options, onChange }: {
  value: T | null
  options: { value: T; label: ReactNode }[]
  onChange: (value: T) => void
}) {
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(options.length, 3)}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`min-h-14 rounded-2xl border-2 px-3 py-3 text-base font-bold transition active:scale-[0.97] ${
            value === o.value ? 'border-ink bg-accent text-accent-ink' : 'border-line bg-card text-ink'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

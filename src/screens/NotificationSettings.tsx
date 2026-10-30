import { useState } from 'react'
import { Button, Card, Loading, Notice, Screen, Section, Title } from '../components/ui'
import { errorMessage, getMyCouple, getNotificationPrefs, listMyDevices, sendTestPush, setNotificationPrefs } from '../lib/api'
import { deviceLabel, isStandalone } from '../lib/platform'
import { currentEndpoint, disablePushHere, enablePush, permissionState, pushSupport } from '../lib/push'
import { useMe } from '../lib/sessionContext'
import type { NotificationPrefs } from '../lib/types'
import { useLoad } from '../lib/useLoad'

const TYPE_LABELS: [string, string][] = [
  ['bid', 'Thinking of you, good morning, goodnight'],
  ['jar', 'Notes in your jar'],
  ['letter', 'Sealed letters arriving'],
  ['letter_unlock', 'A dated letter unlocking'],
  ['moment', 'The same-moment question'],
  ['moment_answered', 'They answered the same-moment question'],
  ['hypothetical', 'A new hypothetical'],
  ['hypothetical_answered', 'They answered your hypothetical'],
  ['countdown', 'Countdown milestones'],
  ['partner_joined', 'Your person joining'],
  ['test', 'Tests'],
]

export function NotificationSettings() {
  const { uid } = useMe()
  const { data, error: loadError, loading, reload } = useLoad(async () => {
    const [prefs, devices, couple, endpoint] = await Promise.all([
      getNotificationPrefs(uid), listMyDevices(uid), getMyCouple(), currentEndpoint(),
    ])
    return { prefs, devices, couple, endpoint }
  })
  // Your unsaved edits, on top of what's saved.
  const [edited, setEdited] = useState<NotificationPrefs | null>(null)
  const prefs = edited ?? data?.prefs ?? null
  const setPrefs = setEdited
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<{ tone: 'good' | 'error'; text: string } | null>(null)
  const support = pushSupport()
  const testTag = new URLSearchParams(window.location.search).get('test')

  async function act(label: string, fn: () => Promise<unknown>, done: string) {
    setBusy(label)
    setMessage(null)
    try {
      await fn()
      setMessage({ tone: 'good', text: done })
      await reload()
    } catch (err) {
      setMessage({ tone: 'error', text: errorMessage(err) })
    }
    setBusy(null)
  }

  if (loading || !data || !prefs) return <Screen><Loading label="Loading…" /></Screen>

  const partner = data.couple?.members.find((m) => m.id !== uid)
  const hereIsSubscribed = !!data.endpoint && data.devices.some((d) => d.endpoint === data.endpoint)

  return (
    <Screen back={{ to: '/', label: 'Home' }}>
      <Title kicker="Setup">Notifications</Title>
      {testTag && <div className="mb-4"><Notice tone="good">You opened Elphyn from test notification {testTag}. Tapping works.</Notice></div>}
      {loadError && <div className="mb-4"><Notice tone="error">{loadError}</Notice></div>}

      <Card>
        <p className="font-bold">This device: {deviceLabel()}</p>
        <ul className="mt-2 space-y-1 font-type text-sm text-muted">
          <li>Opened from Home Screen: {isStandalone() ? 'yes' : 'no'}</li>
          <li>Push available here: {support}</li>
          <li>Permission: {permissionState()}</li>
          <li>Subscribed: {hereIsSubscribed ? 'yes' : 'no'}</li>
          <li>Declarative push (iOS 18.4+): {'pushManager' in window ? 'yes' : 'no'}</li>
        </ul>
        <div className="mt-4">
          {support === 'needs-home-screen' && (
            <Notice>Open Elphyn from its Home Screen icon to turn on notifications. They don’t work in Safari.</Notice>
          )}
          {support === 'not-configured' && <Notice tone="error">This build has no push key yet (VITE_VAPID_PUBLIC_KEY).</Notice>}
          {support === 'ok' && !hereIsSubscribed && (
            <Button onClick={() => act('enable', enablePush, 'Notifications are on for this device.')} disabled={busy !== null}>
              {busy === 'enable' ? 'Asking…' : 'Turn on notifications'}
            </Button>
          )}
          {support === 'ok' && hereIsSubscribed && (
            <Button variant="quiet" onClick={() => act('disable', disablePushHere, 'Notifications are off for this device.')} disabled={busy !== null}>
              Turn off for this device
            </Button>
          )}
        </div>
      </Card>

      {message && <div className="mt-4"><Notice tone={message.tone}>{message.text}</Notice></div>}

      <Section title="Tests">
        <div className="grid gap-3">
          <Button variant="secondary" disabled={busy !== null}
            onClick={() => act('self', () => sendTestPush(false, 1), 'Test sent. Lock your phone; it should arrive in a few seconds.')}>
            Send me a test
          </Button>
          <Button variant="secondary" disabled={busy !== null}
            onClick={() => act('burst', () => sendTestPush(false, 5), 'Five tests sent. They should arrive as one notification.')}>
            Send me five at once
          </Button>
          {partner && (
            <Button variant="secondary" disabled={busy !== null}
              onClick={() => act('partner', () => sendTestPush(true, 1), `Test sent to ${partner.display_name}.`)}>
              Send {partner.display_name} a test
            </Button>
          )}
        </div>
      </Section>

      <Section title="Your devices">
        {data.devices.length === 0 ? (
          <p className="text-muted">No devices yet.</p>
        ) : (
          <ul className="space-y-2">
            {data.devices.map((d) => (
              <li key={d.endpoint} className="rounded-2xl border-2 border-line bg-card px-4 py-3">
                <p className="font-bold">{d.device ?? 'Device'}{d.endpoint === data.endpoint ? ' (this one)' : ''}</p>
                <p className="text-sm text-muted">
                  Added {new Date(d.created_at).toLocaleDateString()}
                  {d.last_ok_at ? ` · last delivered ${new Date(d.last_ok_at).toLocaleString()}` : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Quiet hours">
        <p className="mb-3 text-muted">Notifications that arrive during quiet hours wait until they end. Same start and end means no quiet hours.</p>
        <div className="grid grid-cols-2 gap-3">
          {(['quiet_start', 'quiet_end'] as const).map((key) => (
            <label key={key} className="block">
              <span className="mb-1 block text-sm font-bold">{key === 'quiet_start' ? 'From' : 'Until'}</span>
              <input
                type="time"
                value={prefs[key].slice(0, 5)}
                onChange={(e) => setPrefs({ ...prefs, [key]: e.target.value })}
                className="min-h-14 w-full rounded-2xl border-2 border-line bg-card px-4 text-lg"
              />
            </label>
          ))}
        </div>
      </Section>

      <Section title="What to send">
        <ul className="space-y-2">
          {TYPE_LABELS.map(([type, label]) => {
            const on = !prefs.disabled_types.includes(type)
            return (
              <li key={type}>
                <label className="flex min-h-12 items-center justify-between gap-3 rounded-2xl border-2 border-line bg-card px-4 py-2">
                  <span>{label}</span>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => setPrefs({
                      ...prefs,
                      disabled_types: on ? [...prefs.disabled_types, type] : prefs.disabled_types.filter((t) => t !== type),
                    })}
                    className="h-6 w-6 accent-(--color-accent)"
                  />
                </label>
              </li>
            )
          })}
        </ul>
        <label className="mt-4 flex min-h-12 items-center justify-between gap-3 rounded-2xl border-2 border-line bg-card px-4 py-2">
          <span>Let {partner?.display_name ?? 'them'} see when you’ve opened a note or letter</span>
          <input type="checkbox" checked={prefs.read_receipts}
            onChange={() => setPrefs({ ...prefs, read_receipts: !prefs.read_receipts })} className="h-6 w-6 accent-(--color-accent)" />
        </label>
        <div className="mt-4">
          <Button onClick={() => act('save', () => setNotificationPrefs(prefs), 'Saved.')} disabled={busy !== null}>
            {busy === 'save' ? 'Saving…' : 'Save settings'}
          </Button>
        </div>
      </Section>
    </Screen>
  )
}

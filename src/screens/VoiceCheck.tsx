import { useRef, useState, type ChangeEvent } from 'react'
import { Button, Card, Loading, Notice, Screen, Section, Title } from '../components/ui'
import { addVoiceCheck, errorMessage, getMyCouple, listVoiceChecks, uploadVoice, voiceUrl } from '../lib/api'
import { deviceLabel, isStandalone } from '../lib/platform'
import { recordingSupport, startRecording, type ActiveRecording, type Recording } from '../lib/recorder'
import { useMe } from '../lib/sessionContext'
import { useLoad } from '../lib/useLoad'

// Counts recordings since this launch, so the relaunch bug is easy to spot.
let recordingsThisLaunch = 0

export function VoiceCheck() {
  const { uid } = useMe()
  const { data, loading, reload } = useLoad(async () => {
    const couple = await getMyCouple()
    return { couple, checks: couple ? await listVoiceChecks(couple.id) : [] }
  })
  const [active, setActive] = useState<ActiveRecording | null>(null)
  const [recording, setRecording] = useState<Recording | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [playing, setPlaying] = useState<{ id: string; url: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const fileInput = useRef<HTMLInputElement>(null)
  const support = recordingSupport()

  const note = (line: string) => setLog((l) => [`${new Date().toLocaleTimeString()} ${line}`, ...l].slice(0, 12))

  async function start() {
    setRecording(null)
    setPreview(null)
    try {
      const rec = await startRecording()
      recordingsThisLaunch += 1
      note(`recording #${recordingsThisLaunch} this launch started (${rec.mime})`)
      setActive(rec)
    } catch (err) {
      const e = err as { name?: string; message?: string }
      note(`couldn't start: ${e.name ?? 'Error'} ${e.message ?? ''}`)
    }
  }

  async function stop() {
    if (!active) return
    try {
      const result = await active.stop()
      note(`stopped: ${(result.blob.size / 1024).toFixed(0)} KB, ${(result.durationMs / 1000).toFixed(1)} s, ${result.mime}`)
      if (result.blob.size === 0) note('the recording is empty')
      setRecording(result)
      setPreview(URL.createObjectURL(result.blob))
    } catch (err) {
      note(`stop failed: ${(err as Error).message}`)
    }
    setActive(null)
  }

  async function upload(blob: Blob, mime: string, durationMs: number | null) {
    if (!data?.couple) return
    setBusy(true)
    try {
      const path = await uploadVoice(data.couple.id, uid, blob, mime)
      await addVoiceCheck(data.couple.id, path, mime, durationMs)
      note('uploaded')
      setRecording(null)
      setPreview(null)
      await reload()
    } catch (err) {
      note(`upload failed: ${errorMessage(err)}`)
    }
    setBusy(false)
  }

  function attach(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    note(`attached ${file.name}: ${(file.size / 1024).toFixed(0)} KB, ${file.type || 'no type'}`)
    upload(file, file.type || 'audio/mp4', null)
  }

  async function play(id: string, path: string) {
    try {
      setPlaying({ id, url: await voiceUrl(path) })
    } catch (err) {
      note(`can't play: ${errorMessage(err)}`)
    }
  }

  if (loading || !data) return <Screen><Loading label="Loading…" /></Screen>
  if (!data.couple) return <Screen back={{ to: '/', label: 'Home' }}><Notice>Pair up first.</Notice></Screen>
  const names = new Map(data.couple.members.map((m) => [m.id, m.id === uid ? 'You' : m.display_name]))

  return (
    <Screen back={{ to: '/', label: 'Home' }}>
      <Title kicker="Setup">Voice check</Title>

      <Card>
        <p className="font-bold">{deviceLabel()} · {isStandalone() ? 'Home Screen app' : 'browser tab'}</p>
        <ul className="mt-2 space-y-1 font-type text-xs text-muted">
          <li>MediaRecorder: {support.mediaRecorder ? 'yes' : 'no'} · microphone API: {support.getUserMedia ? 'yes' : 'no'}</li>
          {Object.entries(support.types).map(([type, ok]) => <li key={type}>{type}: {ok ? 'yes' : 'no'}</li>)}
          <li>Recordings this launch: {recordingsThisLaunch}</li>
        </ul>
      </Card>

      <Section title="Record">
        {active ? (
          <Button variant="danger" onClick={stop}>Stop recording</Button>
        ) : (
          <Button onClick={start} disabled={busy || !support.mediaRecorder}>Record a voice check</Button>
        )}
        {preview && recording && (
          <div className="mt-4 space-y-3">
            <audio controls src={preview} className="w-full" />
            <Button onClick={() => upload(recording.blob, recording.mime, recording.durationMs)} disabled={busy}>
              {busy ? 'Uploading…' : 'Send it'}
            </Button>
          </div>
        )}
        <div className="mt-3">
          <Button variant="secondary" onClick={() => fileInput.current?.click()} disabled={busy}>Attach a voice memo instead</Button>
          <input ref={fileInput} type="file" accept="audio/*" onChange={attach} className="hidden" />
        </div>
      </Section>

      <Section title="Sent between you">
        {data.checks.length === 0 ? (
          <p className="text-muted">Nothing yet.</p>
        ) : (
          <ul className="space-y-2">
            {data.checks.map((c) => (
              <li key={c.id} className="rounded-2xl border-2 border-line bg-card p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-bold">{names.get(c.from_id) ?? 'Someone'}</p>
                    <p className="font-type text-xs text-muted">
                      {c.mime}{c.duration_ms ? ` · ${(c.duration_ms / 1000).toFixed(1)} s` : ''} · {new Date(c.created_at).toLocaleString()}
                    </p>
                  </div>
                  <Button variant="secondary" className="w-auto! min-h-11 px-4 text-base" onClick={() => play(c.id, c.path)}>Play</Button>
                </div>
                {playing?.id === c.id && (
                  <audio controls autoPlay src={playing.url} className="mt-3 w-full"
                    onError={() => note(`playback failed for ${c.mime}`)} />
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {log.length > 0 && (
        <Section title="Log">
          <ul className="space-y-1 font-type text-xs text-muted">{log.map((l, i) => <li key={i}>{l}</li>)}</ul>
        </Section>
      )}
    </Screen>
  )
}

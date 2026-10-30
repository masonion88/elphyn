// Voice recording for the spike and, later, every voice note.
//
// Each recording asks for a fresh microphone stream and stops every track when it
// ends. There's a public report of MediaRecorder working on the first launch of an
// iPhone Home Screen app and failing after a relaunch; reusing streams is the first
// suspect, so we never reuse one.

export const CANDIDATE_TYPES = [
  'audio/mp4',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/aac',
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
]

export function recordingSupport(): { mediaRecorder: boolean; getUserMedia: boolean; types: Record<string, boolean> } {
  const mediaRecorder = typeof window.MediaRecorder !== 'undefined'
  const types: Record<string, boolean> = {}
  for (const type of CANDIDATE_TYPES) {
    types[type] = mediaRecorder && typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(type)
  }
  return { mediaRecorder, getUserMedia: !!navigator.mediaDevices?.getUserMedia, types }
}

// iPhones record AAC in MP4, which plays everywhere we care about; prefer it.
function pickMimeType(): string | undefined {
  const { types } = recordingSupport()
  return ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find((t) => types[t])
}

export type Recording = { blob: Blob; mime: string; durationMs: number }

export type ActiveRecording = {
  mime: string
  stop: () => Promise<Recording>
  cancel: () => void
}

export async function startRecording(): Promise<ActiveRecording> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const preferred = pickMimeType()
  let recorder: MediaRecorder
  try {
    recorder = preferred ? new MediaRecorder(stream, { mimeType: preferred }) : new MediaRecorder(stream)
  } catch (e) {
    stream.getTracks().forEach((t) => t.stop())
    throw e
  }
  const chunks: Blob[] = []
  const started = performance.now()
  const releaseMic = () => stream.getTracks().forEach((t) => t.stop())

  const finished = new Promise<Recording>((resolve, reject) => {
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data)
    }
    recorder.onstop = () => {
      releaseMic()
      const mime = recorder.mimeType || preferred || 'audio/mp4'
      resolve({ blob: new Blob(chunks, { type: mime }), mime, durationMs: Math.round(performance.now() - started) })
    }
    recorder.onerror = (e) => {
      releaseMic()
      reject((e as Event & { error?: unknown }).error ?? new Error('The recorder stopped with an error.'))
    }
  })

  recorder.start()
  return {
    mime: recorder.mimeType || preferred || 'audio/mp4',
    stop: () => {
      if (recorder.state !== 'inactive') recorder.stop()
      return finished
    },
    cancel: () => {
      recorder.ondataavailable = null
      if (recorder.state !== 'inactive') recorder.stop()
      releaseMic()
    },
  }
}

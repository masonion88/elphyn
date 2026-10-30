export type Profile = {
  id: string
  display_name: string
  home_animal: string | null
  timezone: string
}

export type Couple = {
  id: string
  name: string
  members: Profile[]
}

export type NotificationPrefs = {
  quiet_start: string // "HH:MM:SS"
  quiet_end: string
  disabled_types: string[]
  read_receipts: boolean
}

export type Device = {
  endpoint: string
  device: string | null
  created_at: string
  last_ok_at: string | null
}

export type VoiceCheck = {
  id: string
  from_id: string
  path: string
  mime: string
  duration_ms: number | null
  created_at: string
}

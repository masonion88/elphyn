export type Deck = 'chaos' | 'tender'
export type OperationStatus = 'briefing' | 'debrief' | 'revealed' | 'went_dark'

export type Profile = { id: string; display_name: string }

export type Circle = {
  id: string
  name: string
  deck: Deck
  join_code: string
  created_by: string
  created_at: string
}

export type Member = { user_id: string; display_name: string }

export type Operation = {
  id: string
  circle_id: string
  created_by: string
  partner_id: string
  status: OperationStatus
  call_by: string | null
  created_at: string
  revealed_at: string | null
}

export type Mission = { id: string; text: string; tier: number; author_id: string | null }

// One agent's card in an operation. Row level security only returns your own
// card until the reveal.
export type Card = {
  id: string
  operation_id: string
  agent_id: string
  target_id: string
  mission_id: string | null
  is_decoy: boolean
  rerolled: boolean
  completed: boolean | null
  accusation_text: string | null
  accused_decoy: boolean | null
  submitted_at: string | null
  caught: boolean | null
  case_file: string | null
  missions: Mission | null
}

export type Award = { operation_id: string; user_id: string; points: number; reason: 'mission' | 'catch' }

export type Standing = { user_id: string; points: number }

export type Rules = {
  tier_points: Record<string, number>
  catch_points: number
}

import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

// Shown on screen instead of a blank page if the build is missing its settings.
export const configError =
  !url || !publishableKey ? 'This build is missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY.' : null

// Only the publishable key ever ships to the browser. Row level security decides what it can see.
export const supabase = createClient(url || 'https://missing.supabase.co', publishableKey || 'missing')

// Shared helpers for the secrecy tests.
//
// Anonymous sign-ins are off, so test users are created through the admin API with
// the secret key (SUPABASE_SECRET_KEY in .env.local, never in git), then sign in
// with a throwaway password through the ordinary publishable-key client. Every
// check after that runs exactly as a real person's phone would.
//
// Test users are named elphyn-test-…@example.com so they're easy to find and
// clean up later.

import assert from 'node:assert/strict'
import { execSync } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient, type PostgrestError, type SupabaseClient } from '@supabase/supabase-js'

export const url = process.env.VITE_SUPABASE_URL ?? ''
const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? ''
const secretKey = process.env.SUPABASE_SECRET_KEY ?? ''
if (!url || !publishableKey) throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env.local')
if (!secretKey) {
  throw new Error('SETUP, NOT A LEAK: add SUPABASE_SECRET_KEY to .env.local. The tests create their throwaway users with it.')
}

// There are no generated database types, so rows come back loose.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Loose = any

export type Agent = { name: string; id: string; email: string; client: SupabaseClient }

const quiet = { auth: { persistSession: false, autoRefreshToken: false } }

export const newClient = () => createClient(url, publishableKey, quiet)
const admin = createClient(url, secretKey, quiet)

export async function makeAgent(name: string): Promise<Agent> {
  const email = `elphyn-test-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${randomUUID().slice(0, 8)}@example.com`
  const password = randomBytes(24).toString('base64url')
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error || !data.user) throw new Error(`Couldn't create test user ${name}: ${error?.message}`)

  const client = newClient()
  const { error: signInError } = await client.auth.signInWithPassword({ email, password })
  if (signInError) throw new Error(`Test user ${name} couldn't sign in: ${signInError.message}`)
  return { name, id: data.user.id, email, client }
}

export async function ok(request: PromiseLike<{ data: unknown; error: PostgrestError | null }>): Promise<Loose> {
  const { data, error } = await request
  if (error) assert.fail(`Unexpected error: ${error.code} ${error.message}${error.hint ? ` [${error.hint}]` : ''}`)
  return data
}

export async function refused(
  request: PromiseLike<{ error: PostgrestError | null }>,
  expected: { code?: string; hint?: string },
  what: string,
) {
  const { error } = await request
  assert.ok(error, `${what}: expected a refusal, but it went through`)
  if (expected.code) assert.equal(error.code, expected.code, `${what}: got ${error.code} ${error.message}`)
  if (expected.hint) assert.equal(error.hint, expected.hint, `${what}: got ${error.hint} ${error.message}`)
}

// Runs SQL against the linked project through the Supabase CLI (as the project owner)
// and returns the result rows. Used only to inspect things the API deliberately
// hides, such as the private outbox, and to expire an invite.
export function sql(query: string): Loose[] {
  const file = join(mkdtempSync(join(tmpdir(), 'elphyn-test-')), 'query.sql')
  writeFileSync(file, query)
  const out = execSync(`npx supabase db query --linked -f "${file}"`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  const json = out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1)
  return JSON.parse(json).rows
}

// Runs a SQL file that reports by raising an exception, and returns the text after
// `marker` in the error message.
export function sqlReport(file: string, marker: string): string {
  let out = ''
  try {
    out = execSync(`npx supabase db query --linked -f "${file}"`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (e) {
    out = String((e as { stdout?: string }).stdout ?? '') + String((e as { stderr?: string }).stderr ?? '')
  }
  const line = out.split(/\r?\n/).find((l) => l.startsWith('{"_tag"'))
  assert.ok(line, `no report from ${file}:\n${out.slice(0, 500)}`)
  const apiBody = JSON.parse(JSON.parse(line).error.message.replace(/^unexpected status \d+: /, ''))
  const match = apiBody.message.match(new RegExp(`${marker} (.*)$`, 's'))
  assert.ok(match, `marker ${marker} not found in: ${apiBody.message.slice(0, 300)}`)
  return match[1]
}

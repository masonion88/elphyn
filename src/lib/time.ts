// "Call by" is a date. It ends at 23:59:59 that day in the starter's own timezone.
export function endOfLocalDay(dateInput: string): string {
  const [y, m, d] = dateInput.split('-').map(Number)
  return new Date(y, m - 1, d, 23, 59, 59, 999).toISOString()
}

export function todayInput(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

export function isPast(iso: string | null): boolean {
  return iso !== null && new Date(iso).getTime() < Date.now()
}

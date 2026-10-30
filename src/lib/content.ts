// Animals and moods come from the one plain content file. Named imports keep the
// rest of that file (missions, hypotheticals, questions) out of the app bundle.
import { animals as animalsFile, moods as moodsFile } from '../../elphyn-seed-content.json'

export type Animal = { name: string; emoji: string }

export const ANIMALS: Animal[] = animalsFile.items
export const MOODS: string[] = moodsFile.items

export function animalEmoji(name: string | null | undefined): string {
  return ANIMALS.find((a) => a.name === name)?.emoji ?? '🐾'
}

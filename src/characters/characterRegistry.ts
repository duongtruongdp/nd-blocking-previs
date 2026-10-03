import type { CharacterType } from '../domain/types'

export type RigProfileId = 'humanoid-v1'

export type CharacterDefinition = {
  id: string
  label: string
  type: CharacterType
  assetPath: string
  rigProfile: RigProfileId
  referenceHeightM: number
}

export const DEFAULT_CHARACTER_ID = 'male-01'

/**
 * The registry is the only source of character choices exposed to the UI and
 * runtime. Asset paths intentionally point at repository-owned public slots;
 * no third-party character is downloaded or bundled implicitly.
 */
export const CHARACTER_REGISTRY: readonly CharacterDefinition[] = [
  {
    id: 'male-01',
    label: 'Male 01',
    type: 'male',
    assetPath: '/assets/characters/male-01.glb',
    rigProfile: 'humanoid-v1',
    referenceHeightM: 1,
  },
  {
    id: 'female-01',
    label: 'Female 01',
    type: 'female',
    assetPath: '/assets/characters/female-01.glb',
    rigProfile: 'humanoid-v1',
    referenceHeightM: 1,
  },
]

export function getCharacterDefinition(characterId: string): CharacterDefinition | undefined {
  return CHARACTER_REGISTRY.find((character) => character.id === characterId)
}

export function resolveCharacterDefinition(characterId: string): CharacterDefinition {
  return getCharacterDefinition(characterId) ?? getCharacterDefinition(DEFAULT_CHARACTER_ID)!
}

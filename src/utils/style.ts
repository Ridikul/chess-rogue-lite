export const FONT = '"Cinzel", "Times New Roman", serif'

const RARITY_LABELS: Record<string, string> = {
  common: 'COMMUN',
  uncommon: 'SPÉCIAL',
  rare: 'RARE',
  legendary: 'LÉGENDAIRE',
}

export function rarityLabel(rarity: string): string {
  return RARITY_LABELS[rarity] ?? rarity.toUpperCase()
}

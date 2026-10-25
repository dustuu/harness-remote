import type { TranslationKey } from "./i18n"

/**
 * Visual skins the app ships. To contribute one: add an entry here (a unique `id`), translation keys
 * for its name and description, and a stylesheet whose rules are all scoped to
 * `:root[data-skin="<id>"]`, imported from main.tsx. It then appears in Settings → Visual and in
 * About → Skins with its author's credit.
 */
export type SkinDefinition = {
  id: string
  nameKey: TranslationKey
  descriptionKey: TranslationKey
  author: string
  github: string
}

export const SKINS: SkinDefinition[] = [
  {
    id: "classic",
    nameKey: "settings.skinClassic",
    descriptionKey: "settings.skinClassicDescription",
    author: "Giulio Ardoino",
    github: "giuliastro"
  },
  {
    // The id stays "compact" so preferences saved before the skin was named keep working.
    id: "compact",
    nameKey: "settings.skinCompact",
    descriptionKey: "settings.skinCompactDescription",
    author: "Vitor Camillo",
    github: "vitorcamillo"
  }
]

export const DEFAULT_SKIN_ID = "compact"

export function isKnownSkin(value: unknown): value is string {
  return typeof value === "string" && SKINS.some((skin) => skin.id === value)
}

import { normalizeLanguage, type LanguageCode } from "./i18n"
import { DEFAULT_SKIN_ID, isKnownSkin, SKINS } from "./skins"

/**
 * Appearance and language are one product preference, not one per shell. Classic 2.x already owned
 * these two keys, so TaskDesk reads and writes exactly the same storage instead of introducing a
 * second set that would silently disagree with Classic after a switch.
 */
export const LANGUAGE_STORAGE_KEY = "opencode.remote.language"
export const THEME_STORAGE_KEY = "opencode.remote.theme"
export const SKIN_STORAGE_KEY = "harness-remote.skin"

/** Fired after a preference is persisted so every mounted shell can follow without a reload. */
export const APP_PREFERENCES_CHANGED_EVENT = "harness-remote:preferences-changed"

export type ThemePreference = "system" | "light" | "dark"
export type ResolvedTheme = "light" | "dark"

export const themePreferences: ThemePreference[] = ["system", "light", "dark"]

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark"
}

export function loadThemePreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY)
    return isThemePreference(saved) ? saved : "system"
  } catch {
    return "system"
  }
}

/**
 * Skin is layout chrome, independent of the light/dark theme: "compact" is the phone layout with a
 * floating one-row header and the model/effort card; "classic" is the original layout.
 */
/** A skin id from the registry in skins.ts. */
export type SkinPreference = string

export const skinPreferences: SkinPreference[] = SKINS.map((skin) => skin.id)

export function isSkinPreference(value: unknown): value is SkinPreference {
  return isKnownSkin(value)
}

export function loadSkinPreference(): SkinPreference {
  try {
    const saved = localStorage.getItem(SKIN_STORAGE_KEY)
    return isSkinPreference(saved) ? saved : DEFAULT_SKIN_ID
  } catch {
    return DEFAULT_SKIN_ID
  }
}

/**
 * Mahurley is a phone layout: its rules target widths up to 780px. On a wider window it would be a
 * half-applied mix of both skins, so there the app renders Classic while keeping the saved choice;
 * narrowing the window (or a phone) brings Mahurley back.
 */
const PHONE_WIDTH_QUERY = "(max-width: 780px)"

function phoneWidth(): boolean {
  return typeof window === "undefined" || typeof window.matchMedia !== "function" || window.matchMedia(PHONE_WIDTH_QUERY).matches
}

/** The skin actually rendered: the saved one, except Mahurley on a wide window renders Classic. */
export function activeSkin(skin: SkinPreference = loadSkinPreference()): SkinPreference {
  return skin === "compact" && !phoneWidth() ? "classic" : skin
}

export function applySkin(skin: SkinPreference): void {
  if (typeof document !== "undefined") document.documentElement.dataset.skin = activeSkin(skin)
}

export function persistSkinPreference(skin: SkinPreference): void {
  try {
    localStorage.setItem(SKIN_STORAGE_KEY, skin)
  } catch {
    /* a private-mode browser still gets the applied skin for this session */
  }
  applySkin(skin)
  notifyPreferencesChanged()
}

export const HIDE_RULES_STORAGE_KEY = "harness-remote.hide-titles.v3"

/**
 * Sessions whose title contains one of these texts are hidden from the compact Session list:
 * prompts that helper agents, reviewers and bots open on the user's behalf. Nothing is deleted.
 * Matching is "contains", ignoring case and accents.
 */
export type HideRules = { enabled: boolean; rules: string[] }

/** No title is hidden until the user writes a rule: what counts as "automatic" differs per workflow. */
export const DEFAULT_HIDE_RULES: string[] = []

/** Lower case, accents stripped, spaces collapsed: "Revisão  Independente" -> "revisao independente". */
export function normalizeForMatch(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim()
}

export function titleMatchesHideRules(title: string, rules: string[]): boolean {
  const normalized = normalizeForMatch(title)
  return rules.some((rule) => {
    const needle = normalizeForMatch(rule)
    return Boolean(needle) && normalized.includes(needle)
  })
}

export function loadHideRules(): HideRules {
  try {
    const saved = JSON.parse(localStorage.getItem(HIDE_RULES_STORAGE_KEY) || "null")
    if (saved && typeof saved.enabled === "boolean" && Array.isArray(saved.rules)) {
      return { enabled: saved.enabled, rules: saved.rules.filter((rule: unknown) => typeof rule === "string") }
    }
  } catch {
    /* fall back to the defaults */
  }
  return { enabled: false, rules: [...DEFAULT_HIDE_RULES] }
}

export function persistHideRules(rules: HideRules): void {
  try {
    localStorage.setItem(HIDE_RULES_STORAGE_KEY, JSON.stringify(rules))
  } catch {
    /* keep the in-memory choice */
  }
  notifyPreferencesChanged()
}

export const RECENTS_STORAGE_KEY = "harness-remote.recents"

/** Whether each machine opens with a "Recent" group of the Sessions used last, across Projects. */
export function loadRecentsEnabled(): boolean {
  try {
    return localStorage.getItem(RECENTS_STORAGE_KEY) !== "off"
  } catch {
    return true
  }
}

export function persistRecentsEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(RECENTS_STORAGE_KEY, enabled ? "on" : "off")
  } catch {
    /* keep the in-memory choice */
  }
  notifyPreferencesChanged()
}

export function loadLanguage(): LanguageCode {
  try {
    return normalizeLanguage(localStorage.getItem(LANGUAGE_STORAGE_KEY) || navigator.language)
  } catch {
    return "en"
  }
}

export function prefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === "dark") return "dark"
  if (preference === "light") return "light"
  return prefersDark() ? "dark" : "light"
}

/**
 * The single place that writes the theme onto the document. `color-scheme` matters as much as the
 * data attribute: it is what makes native scrollbars, form controls and the canvas behind a
 * rubber-band scroll follow the chosen theme instead of staying light.
 */
export function applyTheme(preference: ThemePreference): ResolvedTheme {
  const resolved = resolveTheme(preference)
  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme = resolved
    document.documentElement.style.colorScheme = resolved
  }
  return resolved
}

export function persistThemePreference(preference: ThemePreference): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference)
  } catch {
    /* a private-mode browser still gets the applied theme for this session */
  }
  applyTheme(preference)
  notifyPreferencesChanged()
}

export function persistLanguage(language: LanguageCode): void {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language)
  } catch {
    /* keep the in-memory choice */
  }
  if (typeof document !== "undefined") document.documentElement.lang = language
  notifyPreferencesChanged()
}

export function notifyPreferencesChanged(): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(new Event(APP_PREFERENCES_CHANGED_EVENT))
}

/**
 * Called once at startup. Classic used to apply the theme from inside its own component tree, which
 * meant TaskDesk — the shell that now boots first — never applied one at all and stayed on the
 * stylesheet default regardless of the saved preference.
 */
export function installAppPreferences(): () => void {
  const preference = loadThemePreference()
  applyTheme(preference)
  applySkin(loadSkinPreference())
  if (typeof document !== "undefined") document.documentElement.lang = loadLanguage()

  if (typeof window === "undefined") return () => undefined
  const media = window.matchMedia("(prefers-color-scheme: dark)")
  const followSystem = () => {
    if (loadThemePreference() === "system") applyTheme("system")
  }
  media.addEventListener("change", followSystem)
  const width = typeof window.matchMedia === "function" ? window.matchMedia(PHONE_WIDTH_QUERY) : null
  const followWidth = () => {
    if (loadSkinPreference() !== "compact") return
    applySkin("compact")
    notifyPreferencesChanged()
  }
  width?.addEventListener("change", followWidth)
  return () => {
    media.removeEventListener("change", followSystem)
    width?.removeEventListener("change", followWidth)
  }
}

/** Only user-facing web and email links may leave the desktop renderer. */
export function externalLinkUrl(value: string): string | null {
  try {
    const url = new URL(value)
    return url.protocol === "https:" || url.protocol === "http:" || url.protocol === "mailto:"
      ? url.toString()
      : null
  } catch {
    return null
  }
}

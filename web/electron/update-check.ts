export const RELEASE_API = "https://api.github.com/repos/giuliastro/harness-remote/releases/latest"

export type UpdateStatus =
  | { status: "current"; currentVersion: string }
  | { status: "available"; currentVersion: string; latestVersion: string; releaseUrl: string }
  | { status: "error"; currentVersion: string }

function versionParts(value: string): number[] | null {
  const match = /^v?(\d{1,9})\.(\d{1,9})\.(\d{1,9})$/.exec(value)
  return match ? match.slice(1).map(Number) : null
}

export function isNewerVersion(latest: string, current: string): boolean {
  const next = versionParts(latest)
  const installed = versionParts(current)
  if (!next || !installed) return false
  for (let index = 0; index < 3; index += 1) {
    if (next[index] !== installed[index]) return next[index] > installed[index]
  }
  return false
}

export async function checkForUpdate(currentVersion: string, fetcher: typeof fetch = fetch): Promise<UpdateStatus> {
  try {
    const response = await fetcher(RELEASE_API, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "Harness-Remote" },
      signal: AbortSignal.timeout(8_000)
    })
    if (!response.ok) return { status: "error", currentVersion }
    const release = await response.json() as { tag_name?: unknown; html_url?: unknown }
    const latestVersion = typeof release.tag_name === "string" ? release.tag_name : ""
    if (!versionParts(latestVersion)) return { status: "error", currentVersion }
    if (!isNewerVersion(latestVersion, currentVersion)) return { status: "current", currentVersion }
    const releaseUrl = typeof release.html_url === "string" ? release.html_url : ""
    if (releaseUrl !== `https://github.com/giuliastro/harness-remote/releases/tag/v${latestVersion.replace(/^v/, "")}`) {
      return { status: "error", currentVersion }
    }
    return { status: "available", currentVersion, latestVersion: latestVersion.replace(/^v/, ""), releaseUrl }
  } catch {
    return { status: "error", currentVersion }
  }
}

import assert from "node:assert/strict"
import { test } from "node:test"
import { checkForUpdate, isNewerVersion, RELEASE_API } from "./update-check.ts"

test("numeric versions are compared by component", () => {
  assert.equal(isNewerVersion("v3.10.0", "3.9.9"), true)
  assert.equal(isNewerVersion("v3.3.0", "3.3.0"), false)
  assert.equal(isNewerVersion("v3.2.9", "3.3.0"), false)
  assert.equal(isNewerVersion("v3.4.0-rc.1", "3.3.0"), false)
})

test("a newer official release becomes available", async () => {
  const fetcher = async (url) => {
    assert.equal(url, RELEASE_API)
    return { ok: true, json: async () => ({
      tag_name: "v3.4.0",
      html_url: "https://github.com/giuliastro/harness-remote/releases/tag/v3.4.0"
    }) }
  }
  assert.deepEqual(await checkForUpdate("3.3.0", fetcher), {
    status: "available", currentVersion: "3.3.0", latestVersion: "3.4.0",
    releaseUrl: "https://github.com/giuliastro/harness-remote/releases/tag/v3.4.0"
  })
})

test("a release URL outside the official repository is rejected", async () => {
  const fetcher = async () => ({ ok: true, json: async () => ({
    tag_name: "v3.4.0", html_url: "https://example.com/fake-installer"
  }) })
  assert.deepEqual(await checkForUpdate("3.3.0", fetcher), { status: "error", currentVersion: "3.3.0" })
})

test("network failures do not interrupt startup", async () => {
  const fetcher = async () => { throw new Error("offline") }
  assert.deepEqual(await checkForUpdate("3.3.0", fetcher), { status: "error", currentVersion: "3.3.0" })
})

#!/usr/bin/env node
import { runAcpProviderRealSmoke } from "./acp-provider-real-smoke-lib.mjs"

await runAcpProviderRealSmoke("deepseek", {
  displayName: "DeepSeek Harness",
  executable: "dsh-acp",
  marker: "DEEPSEEK-HR-SMOKE",
  temporaryPrefix: "harness-deepseek-smoke-",
  // Exercise the native `provider::model` value rather than only the harness default.
  defaultModel: "deepseek-official::deepseek-flash",
  checkCommands: false,
  checkModels: true
})

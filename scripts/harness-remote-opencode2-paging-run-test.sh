#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
CHECK_ONLY=0
if [[ "${1:-}" == "--check" ]]; then
  CHECK_ONLY=1
  shift
fi
if (($#)); then
  echo "Usage: $0 [--check]" >&2
  exit 2
fi

for required in node npm git curl setsid rg; do
  command -v "$required" >/dev/null || { echo "Missing required command: $required" >&2; exit 1; }
done
OPENCODE2="$(command -v opencode2 || true)"
if [[ -z "$OPENCODE2" && -x "$HOME/.opencode/bin/opencode2" ]]; then
  OPENCODE2="$HOME/.opencode/bin/opencode2"
fi
[[ -n "$OPENCODE2" ]] || { echo "OpenCode 2 CLI (opencode2) is not installed or not on PATH." >&2; exit 1; }
[[ -x "$ROOT_DIR/web/node_modules/.bin/electron" ]] || { echo "Web dependencies are missing; install them before running this script." >&2; exit 1; }

TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/harness-remote-opencode2-paging.XXXXXX")"
STATE_DIR="$TMP_ROOT/state"
SANDBOX="$TMP_ROOT/harness-remote-opencode2-paging-sandbox"
LOG_DIR="$TMP_ROOT/logs"
XDG_DATA_HOME="$TMP_ROOT/xdg-data"
XDG_CONFIG_HOME="$TMP_ROOT/xdg-config"
XDG_CACHE_HOME="$TMP_ROOT/xdg-cache"
ELECTRON_USER_DATA="$TMP_ROOT/electron-user-data"
mkdir -p "$STATE_DIR" "$SANDBOX" "$LOG_DIR" "$XDG_DATA_HOME" "$XDG_CONFIG_HOME/opencode" "$XDG_CACHE_HOME" "$ELECTRON_USER_DATA"
git -C "$SANDBOX" init -q
git -C "$SANDBOX" -c user.name='Harness Remote Test' -c user.email='test@example.invalid' commit --allow-empty -qm 'Initialize isolated OpenCode 2 paging project'

# OpenCode2 imports and exports using this private XDG tree. The provider is also available if the
# tester continues one of the imported Sessions; fixture generation and paging checks make no LLM calls.
cat >"$XDG_CONFIG_HOME/opencode/opencode.json" <<'JSON'
{
  "$schema": "https://opencode.ai/config.json",
  "model": "ollama-local/qwen2.5:1.5b",
  "provider": {
    "ollama-local": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Ollama Local",
      "options": { "baseURL": "http://127.0.0.1:11434/v1" },
      "models": {
        "qwen2.5:1.5b": { "name": "Qwen2.5 1.5B" }
      }
    }
  }
}
JSON

APP_PID=""
APP_LAUNCH_PID=""
LAST_PID=""
PRESERVE_TMP=0
start_group() {
  local logfile="$1"; shift
  local pidfile="$TMP_ROOT/process-group-${RANDOM}.pid"
  setsid bash -c 'echo "$$" > "$1"; shift; exec "$@"' bash "$pidfile" "$@" >"$logfile" 2>&1 &
  APP_LAUNCH_PID=$!
  for _ in {1..50}; do
    [[ -s "$pidfile" ]] && break
    sleep 0.02
  done
  [[ -s "$pidfile" ]] || { echo "Could not identify the test process group." >&2; return 1; }
  LAST_PID="$(<"$pidfile")"
}
cleanup() {
  local status=$?
  trap - EXIT INT TERM HUP
  if [[ -n "$APP_PID" ]] && kill -0 -- "-$APP_PID" 2>/dev/null; then
    kill -TERM -- "-$APP_PID" 2>/dev/null || true
  fi
  if [[ -n "$APP_PID" ]]; then
    for _ in {1..50}; do
      kill -0 -- "-$APP_PID" 2>/dev/null || break
      sleep 0.1
    done
    kill -KILL -- "-$APP_PID" 2>/dev/null || true
    [[ -z "$APP_LAUNCH_PID" ]] || wait "$APP_LAUNCH_PID" 2>/dev/null || true
  fi
  if ((status != 0 || PRESERVE_TMP)); then
    echo "Test artifacts retained at: $TMP_ROOT" >&2
  else
    rm -rf -- "$TMP_ROOT"
  fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM HUP

export XDG_DATA_HOME XDG_CONFIG_HOME XDG_CACHE_HOME
export OPENCODE2
export PATH="$(dirname -- "$OPENCODE2"):$(dirname -- "$(command -v node)"):$PATH"

MODEL_CATALOG="$TMP_ROOT/opencode2-models.txt"
"$OPENCODE2" models --standalone >"$MODEL_CATALOG" 2>"$LOG_DIR/models.log" || {
  cat "$LOG_DIR/models.log" >&2
  echo "OpenCode 2 could not read its isolated model catalog." >&2
  exit 1
}
if ! rg -Fq 'ollama-local/qwen2.5:1.5b' "$MODEL_CATALOG"; then
  echo "Required continuation model ollama-local/qwen2.5:1.5b is missing from the isolated OpenCode 2 catalog." >&2
  cat "$MODEL_CATALOG" >&2
  exit 1
fi

npm --prefix "$ROOT_DIR/web" run build:desktop

node --input-type=module - "$TMP_ROOT" "$SANDBOX" <<'NODE'
import { randomBytes } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'

const [tmpRoot, sandbox] = process.argv.slice(2)
const hex26 = () => randomBytes(13).toString('hex')
const sessionID = () => `ses_${hex26()}`
const messageID = () => `msg_${hex26()}`
const model = { providerID: 'ollama-local', id: 'qwen2.5:1.5b', variant: 'default' }
const now = Date.now()
const fixtures = [
  { title: 'HR Paging — 1 prompt, 250 assistant envelopes', prompts: 1, steps: 250 },
  { title: 'HR Paging — 3 prompts, 110 assistant envelopes each', prompts: 3, steps: 110 },
  { title: 'HR Paging — 5 prompts, 90 assistant envelopes each', prompts: 5, steps: 90 },
  { title: 'HR Paging — 30 prompts, 90 assistant envelopes each', prompts: 30, steps: 90 }
]
const records = []
for (let fixtureIndex = 0; fixtureIndex < fixtures.length; fixtureIndex += 1) {
  const fixture = fixtures[fixtureIndex]
  const id = sessionID()
  const created = now + fixtureIndex * 10_000
  const info = {
    id,
    projectID: 'global',
    title: fixture.title,
    version: '2.1.4',
    agent: 'build',
    model,
    cost: 0,
    tokens: { input: 1, output: 1, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created, updated: created + fixture.prompts * (fixture.steps + 1) },
    subpath: '',
    location: { directory: sandbox }
  }
  const messages = []
  for (let turn = 0; turn < fixture.prompts; turn += 1) {
    const userCreated = created + turn * (fixture.steps + 1)
    messages.push({ id: messageID(), type: 'user', time: { created: userCreated }, text: `Paging fixture ${fixtureIndex + 1}, prompt ${turn + 1}` })
    for (let step = 0; step < fixture.steps; step += 1) {
      const assistantCreated = userCreated + step + 1
      messages.push({
        id: messageID(), type: 'assistant', time: { created: assistantCreated, completed: assistantCreated },
        agent: 'build', model,
        tokens: { input: 0, output: 1, reasoning: 0, cache: { read: 0, write: 0 } },
        cost: 0, finish: step === fixture.steps - 1 ? 'stop' : 'tool-calls',
        snapshot: { start: '', end: '' },
        content: [{ type: 'text', text: `Assistant envelope ${step + 1}`, time: { created: assistantCreated, completed: assistantCreated } }]
      })
    }
  }
  const exportData = { info, messages }
  const file = path.join(tmpRoot, `fixture-${fixtureIndex + 1}.json`)
  await writeFile(file, JSON.stringify(exportData))
  records.push({ id, title: fixture.title, prompts: fixture.prompts, steps: fixture.steps, file })
}
await writeFile(path.join(tmpRoot, 'fixtures.json'), JSON.stringify(records, null, 2))
NODE

mapfile -t FIXTURE_ROWS < <(node --input-type=module - "$TMP_ROOT/fixtures.json" <<'NODE'
import fs from 'node:fs'
for (const fixture of JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))) {
  console.log([fixture.id, fixture.file].join('\t'))
}
NODE
)
for row in "${FIXTURE_ROWS[@]}"; do
  IFS=$'\t' read -r session_id fixture_file <<<"$row"
  "$OPENCODE2" session import --standalone --directory "$SANDBOX" "$fixture_file" >"$LOG_DIR/import-${session_id}.log" 2>&1 || {
    cat "$LOG_DIR/import-${session_id}.log" >&2
    echo "OpenCode 2 could not import fixture $session_id." >&2
    exit 1
  }
done

(cd "$SANDBOX" && "$OPENCODE2" session list --standalone --format json) >"$TMP_ROOT/sessions.json"
node --input-type=module - "$TMP_ROOT/fixtures.json" "$TMP_ROOT/sessions.json" <<'NODE'
import assert from 'node:assert/strict'
import fs from 'node:fs'
const fixtures = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
const listed = new Set(JSON.parse(fs.readFileSync(process.argv[3], 'utf8')).map((session) => session.id))
for (const fixture of fixtures) assert.ok(listed.has(fixture.id), `${fixture.title} is missing from the native Session list`)
NODE

node --input-type=module - "$ROOT_DIR" "$TMP_ROOT/fixtures.json" <<'NODE'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const records = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'))
const { createOpenCode2HistoryLoader } = await import(pathToFileURL(path.join(process.argv[2], 'bridge/src/opencode2-session-history.js')).href)
const loader = createOpenCode2HistoryLoader({ command: process.env.OPENCODE2 })
const expectedNewest = [1, 3, 5, 20]
const expectedHasMore = [false, false, false, true]
for (let index = 0; index < records.length; index += 1) {
  const fixture = records[index]
  const newest = await loader.page(fixture.id, { limit: 200 })
  const prompts = newest.messages.filter((message) => message.info.role === 'user')
  if (expectedNewest[index] !== null) assert.equal(prompts.length, expectedNewest[index], `${fixture.title}: newest prompt count`)
  assert.equal(newest.hasMore, expectedHasMore[index], `${fixture.title}: newest hasMore`)
  assert.equal(newest.messages[0]?.info.role, 'user', `${fixture.title}: page starts at a prompt`)
  if (index === 3) {
    const allPromptIDs = prompts.map((message) => message.info.id)
    const older = await loader.page(fixture.id, { limit: 200, before: newest.before })
    const olderPrompts = older.messages.filter((message) => message.info.role === 'user')
    allPromptIDs.push(...olderPrompts.map((message) => message.info.id))
    assert.equal(olderPrompts.length, 10, `${fixture.title}: older page contains prompts 1–10`)
    assert.equal(older.hasMore, false, `${fixture.title}: older page hasMore`)
    assert.equal(older.before, null, `${fixture.title}: older cursor`)
    assert.equal(new Set(allPromptIDs).size, 30, `${fixture.title}: every prompt appears exactly once across pages`)
    assert.equal(allPromptIDs.length, 30, `${fixture.title}: every prompt appears across pages`)
  }
  console.log(`PASS ${fixture.title}: ${prompts.length} newest prompt(s), hasMore=${newest.hasMore}${index === 3 ? '; older page has remaining 10 prompts and no more history' : ''}`)
}
NODE

if ((CHECK_ONLY)); then
  if command -v xvfb-run >/dev/null 2>&1; then
    start_group "$LOG_DIR/electron-check.log" xvfb-run -a env -u ELECTRON_RUN_AS_NODE \
      HARNESS_REMOTE_ROOT="$SANDBOX" HARNESS_REMOTE_BACKEND=opencode2 \
      ELECTRON_DISABLE_SECURITY_WARNINGS=1 \
      "$ROOT_DIR/web/node_modules/.bin/electron" "$ROOT_DIR/web" --user-data-dir="$ELECTRON_USER_DATA"
    APP_PID=$LAST_PID
    electron_ready=1
    for _ in {1..80}; do
      kill -0 -- "-$APP_PID" 2>/dev/null || { electron_ready=0; break; }
      sleep 0.1
    done
    if ((electron_ready)); then
      daemon_ready="$(node --input-type=module - "$APP_PID" "$ROOT_DIR/bridge/src/daemon-cli.js" <<'NODE'
import fs from 'node:fs'
import path from 'node:path'
const rootPID = Number(process.argv[2])
const expected = process.argv[3]
const processes = new Map()
for (const entry of fs.readdirSync('/proc')) {
  if (!/^\d+$/.test(entry)) continue
  try {
    const stat = fs.readFileSync(path.join('/proc', entry, 'stat'), 'utf8')
    const end = stat.lastIndexOf(')')
    const ppid = Number(stat.slice(end + 2).split(' ')[1])
    const cmd = fs.readFileSync(path.join('/proc', entry, 'cmdline'), 'utf8').replaceAll('\0', ' ')
    processes.set(Number(entry), { ppid, cmd })
  } catch {}
}
const children = new Map()
for (const [pid, entry] of processes) {
  const siblings = children.get(entry.ppid) ?? []
  siblings.push(pid)
  children.set(entry.ppid, siblings)
}
const pending = [rootPID]
const seen = new Set()
while (pending.length) {
  const pid = pending.pop()
  if (seen.has(pid)) continue
  seen.add(pid)
  const entry = processes.get(pid)
  if (entry?.cmd.includes(expected)) { console.log('yes'); break }
  pending.push(...(children.get(pid) ?? []))
}
NODE
      )"
      if [[ "$daemon_ready" == yes ]]; then
        echo "Headless Electron and its integrated daemon stayed running for 8 seconds."
      else
        cat "$LOG_DIR/electron-check.log" >&2
        echo "Electron stayed open, but its integrated daemon was not found under the test process." >&2
        exit 1
      fi
    else
      cat "$LOG_DIR/electron-check.log" >&2
      echo "Headless Electron exited before the 8 second startup check completed." >&2
      exit 1
    fi
    kill -TERM -- "-$APP_PID" 2>/dev/null || true
    for _ in {1..50}; do
      kill -0 -- "-$APP_PID" 2>/dev/null || break
      sleep 0.1
    done
    kill -KILL -- "-$APP_PID" 2>/dev/null || true
    [[ -z "$APP_LAUNCH_PID" ]] || wait "$APP_LAUNCH_PID" 2>/dev/null || true
    APP_PID=""
    APP_LAUNCH_PID=""
  else
    echo "xvfb-run is unavailable; skipping the optional headless Electron launch."
  fi
  echo "--check passed: desktop build, four native OpenCode 2 imports, model catalog, bridge paging assertions, and headless Electron startup completed."
  exit 0
fi

cat <<EOF
Test della cronologia OpenCode 2 nella vera app desktop Electron.

Progetto sandbox: harness-remote-opencode2-paging-sandbox
Percorso: $SANDBOX
Modello locale per continuare: ollama-local/qwen2.5:1.5b (Ollama su http://127.0.0.1:11434/v1)

Sessioni native importate:
$(node --input-type=module - "$TMP_ROOT/fixtures.json" <<'NODE'
import fs from 'node:fs'
for (const fixture of JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))) console.log(`- ${fixture.title} — ${fixture.id}`)
NODE
)

Checklist:
1. Apri This computer → OpenCode 2 e trova il progetto sandbox. Apri le Sessioni da 1, 3 e 5 prompt: devono mostrare tutti i prompt e nessun pulsante «Earlier messages».
2. Apri la Sessione da 30 prompt: inizialmente deve mostrare i prompt 11–30 e il pulsante «Earlier messages». Premilo: devono comparire i prompt 1–10, senza duplicati, e il pulsante deve sparire.
3. Per provare la continuazione scegli il modello locale sopra, invia un prompt breve e verifica la risposta. Prova Stop e poi continua.
4. Cambia Sessione e torna a quella da 5 prompt: la cronologia deve restare completa.

Chiudendo Electron o premendo Ctrl+C lo script ferma solo i propri processi ed elimina il profilo, il database e il progetto di prova.
EOF

cd "$SANDBOX"
start_group "$LOG_DIR/electron.log" env -u ELECTRON_RUN_AS_NODE \
  HARNESS_REMOTE_ROOT="$SANDBOX" HARNESS_REMOTE_BACKEND=opencode2 \
  ELECTRON_DISABLE_SECURITY_WARNINGS=1 \
  "$ROOT_DIR/web/node_modules/.bin/electron" "$ROOT_DIR/web" --user-data-dir="$ELECTRON_USER_DATA"
APP_PID=$LAST_PID
wait "$APP_LAUNCH_PID"

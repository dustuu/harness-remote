import assert from 'node:assert/strict'
import test from 'node:test'

const { api } = await import('./api.ts')
const { registerNativeSessionV3Adapter } = await import('./native-session-v3-adapter.ts')
const { buildConversationTimeline } = await import('./work-thread-timeline.ts')

const originalLoadMessagePage = api.loadMessagePage
const originalListStatuses = api.listStatuses
const config = { backend: 'codex', host: '127.0.0.1', port: 4097, agentId: 'codex' }
const sessionID = 'codex-desktop-tail-sync'
const target = {
  key: `machine:codex:${sessionID}`,
  ref: { machineID: 'machine', agentID: 'codex', sessionID, directory: '/repo' },
  machineID: 'machine', agentID: 'codex', agentLabel: 'Codex', backend: 'codex',
  transport: 'acp', sessionID, directory: '/repo', title: 'Desktop Session',
  external: true, modelsSupported: true, model: null, requiresExplicitClaim: true,
  canStop: false, config
}

function message(id, role, text, created) {
  return {
    info: { id, role, sessionID, time: { created } },
    parts: [{ id: `${id}:text`, messageID: id, type: 'text', text }]
  }
}

test('an open Codex Session shows later desktop turns and their final replies', async () => {
  let messages = [message('user-1', 'user', 'first', 1000), message('answer-1', 'assistant', 'one', 1001)]
  let status = 'idle'
  api.loadMessagePage = async () => ({ messages, hasMore: false })
  api.listStatuses = async () => ({ [sessionID]: { type: status } })
  const updates = []
  const registration = registerNativeSessionV3Adapter(target, (conversation) => updates.push(conversation))
  try {
    await registration.controller.loadMessagePage(config, sessionID, '/repo')
    let conversation = await registration.controller.refreshConversation(config, registration.conversation.id)
    assert.deepEqual(conversation.turns.map((turn) => turn.prompt), ['first'])

    messages = [...messages, message('user-2', 'user', 'second', 2000), message('progress-2', 'assistant', 'working', 2001)]
    status = 'busy'
    await registration.controller.loadMessagePage(config, sessionID, '/repo')
    conversation = await registration.controller.refreshConversation(config, registration.conversation.id)
    assert.deepEqual(conversation.turns.map((turn) => turn.prompt), ['first', 'second'])
    assert.equal(conversation.status, 'running')
    assert.equal(buildConversationTimeline(conversation, { [sessionID]: messages }, {}).at(-1).parts[0].text, 'working')

    messages = [...messages, message('answer-2', 'assistant', 'two', 2002), message('user-3', 'user', 'third', 3000)]
    await registration.controller.loadMessagePage(config, sessionID, '/repo')
    conversation = await registration.controller.refreshConversation(config, registration.conversation.id)
    assert.deepEqual(conversation.turns.map((turn) => turn.prompt), ['first', 'second', 'third'])

    messages = [...messages, message('answer-3', 'assistant', 'final result', 3001)]
    status = 'idle'
    await registration.controller.loadMessagePage(config, sessionID, '/repo')
    conversation = await registration.controller.refreshConversation(config, registration.conversation.id)
    assert.equal(conversation.status, 'completed')
    assert.equal(buildConversationTimeline(conversation, { [sessionID]: messages }, {}).at(-1).parts[0].text, 'final result')
    assert.ok(updates.some((update) => update.turns.length === 3))
  } finally {
    registration.dispose()
    api.loadMessagePage = originalLoadMessagePage
    api.listStatuses = originalListStatuses
  }
})

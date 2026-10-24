import assert from 'node:assert/strict'
import test from 'node:test'
import { externalLinkUrl } from './external-link.ts'

test('external links open only browser and mail schemes', () => {
  assert.equal(externalLinkUrl('https://example.com/a?b=1'), 'https://example.com/a?b=1')
  assert.equal(externalLinkUrl('http://example.com'), 'http://example.com/')
  assert.equal(externalLinkUrl('mailto:hello@example.com'), 'mailto:hello@example.com')
  for (const value of ['file:///secret', 'javascript:alert(1)', 'data:text/html,hello', './relative', '']) {
    assert.equal(externalLinkUrl(value), null)
  }
})

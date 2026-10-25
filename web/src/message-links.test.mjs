import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Markdown } from './components/message-markdown.tsx'

test('session Markdown links request an external browser tab', () => {
  const html = renderToStaticMarkup(createElement(Markdown, { text: '[Open the result](https://example.com/result)' }))
  assert.match(html, /href="https:\/\/example\.com\/result"/)
  assert.match(html, /target="_blank"/)
  assert.match(html, /rel="noopener noreferrer"/)
})

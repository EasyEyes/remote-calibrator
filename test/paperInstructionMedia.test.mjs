import { test } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { loadPhrases } from '../src/i18n/loadPhrases.js'
import { phrases } from '../src/i18n/schema.js'
import { collectInstructionMediaUrls } from '../src/distance/instructionMediaManifest.js'
import { parseInstructions } from '../src/distance/instructionParserAdapter.js'
import { renderStepInstructions } from '../src/distance/stepByStepInstructionHelps.js'

const url = 'https://media.example/Roll%20up%20paper%20tiny.mp4?alt=media'
const text = `Roll the paper into a tube using the long edge, so the tube is as long as the paper.\n\n![Roll paper](${url})`

test('paper video is preloaded and rendered from cache after real phrase initialization', async () => {
  await loadPhrases({ RC_UseLongEdge: { en: text } })
  const manifest = collectInstructionMediaUrls(
    { RC_UseLongEdge: phrases.RC_UseLongEdge },
    {},
    'en',
    [{ name: 'trackDistance', options: { useObjectTestData: 'paper' } }],
  )
  assert.deepEqual(manifest, [url])
  const cached = new Map(
    manifest.map(value => [value, 'blob:https://study.example/paper-video']),
  )
  const dom = new JSDOM(
    '<div id="left"></div><div id="right"></div><div id="media"></div>',
  )
  const previousDocument = globalThis.document
  const previousWindow = globalThis.window
  globalThis.document = dom.window.document
  globalThis.window = dom.window
  try {
    const elements = {
      leftText: document.getElementById('left'),
      rightText: document.getElementById('right'),
      mediaContainer: document.getElementById('media'),
    }
    renderStepInstructions({
      model: parseInstructions(phrases.RC_UseLongEdge.en),
      elements,
      options: {
        resolveMediaUrl(value) {
          assert.ok(cached.has(value), 'renderer must only use preloaded media')
          return cached.get(value)
        },
      },
    })
    assert.equal(
      elements.mediaContainer.querySelector('video')?.getAttribute('src'),
      cached.get(url),
    )
    assert.match(elements.leftText.textContent, /Roll the paper into a tube/)
    assert.ok(!elements.leftText.textContent.includes('![Roll paper]'))
    assert.ok(!elements.leftText.textContent.includes(url))
  } finally {
    globalThis.document = previousDocument
    globalThis.window = previousWindow
    dom.window.close()
  }
})

test('media-only links and prose with video links need no headings or list markers', () => {
  for (const value of [
    `![Roll paper](${url})`,
    `Watch this video: [Roll paper](${url})`,
  ]) {
    const model = parseInstructions(value)
    assert.ok(JSON.stringify(model).includes(url))
  }
})

test('legacy tokens still take precedence over inline Markdown media', () => {
  const model = parseInstructions(
    '[[TT1]] Setup\n[[SS1]] Roll paper\n[[LL1]]',
    { assetMap: { LL1: url } },
  )
  assert.ok(JSON.stringify(model).includes(url))
})

test('paper video is skipped in an object calibration with no paper step', () => {
  assert.deepEqual(
    collectInstructionMediaUrls({ RC_UseLongEdge: { en: text } }, {}, 'en', [
      { name: 'trackDistance', options: { useObjectTestData: true } },
    ]),
    [],
  )
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { processInlineFormatting } from '../src/distance/markdownInstructionParser.js'
import { loadPhrases } from '../src/i18n/loadPhrases.js'
import { phrases } from '../src/i18n/schema.js'
import { collectInstructionMediaUrls } from '../src/distance/instructionMediaManifest.js'

const urls = [
  'https://media.example/Instructions%2FRevis2%2FImage_1.1.png?alt=media&token=image_token',
  'https://media.example/Instructions%2FRevis2%2FInstruction_1.5.mp4?alt=media&token=video_token',
  'https://media.example/Instructions%2FRevis2%2FInstruction_1.6.mp4?alt=media&token=another_token',
  'https://media.example/Instruction%20(Revis%202)_1.4.mp4?alt=media',
  './media/local_image_1.png',
]

test('real phrase initialization preserves media URLs before manifest collection', async () => {
  const text =
    '# Instructions\n1. Use **bold**, _italic_, and ~~old~~ text.\n' +
    urls.map((url, i) => `${i + 2}. Watch\n![Demo](${url})`).join('\n')
  await loadPhrases({
    RC_UseObjectToSetViewingDistanceRulerStepperPage1: { en: text },
  })
  const formatted = phrases.RC_UseObjectToSetViewingDistanceRulerStepperPage1.en
  assert.match(formatted, /<strong>bold<\/strong>/)
  assert.match(formatted, /<em>italic<\/em>/)
  assert.match(formatted, /<del>old<\/del>/)
  for (const url of urls) assert.ok(formatted.includes(url), url)
  assert.deepEqual(
    collectInstructionMediaUrls(
      { RC_UseObjectToSetViewingDistanceRulerStepperPage1: { en: formatted } },
      {},
      'en',
      [{ name: 'trackDistance', options: { useObjectTestData: true } }],
    ),
    urls,
  )
  await loadPhrases({
    RC_UseObjectToSetViewingDistanceRulerStepperPage1: { en: formatted },
  })
  assert.equal(
    phrases.RC_UseObjectToSetViewingDistanceRulerStepperPage1.en,
    formatted,
  )
})

test('bare URLs and HTML attributes retain underscores while nearby text formats', () => {
  const url = 'https://media.example/file_name_1.mp4?token=some_token'
  const text = `**Watch** ${url}\n<a href="${url}">_Open_</a>\n<img src="./image_name_1.png">`
  assert.equal(
    processInlineFormatting(text),
    `<strong>Watch</strong> ${url}\n<a href="${url}"><em>Open</em></a>\n<img src="./image_name_1.png">`,
  )
})

test('relative link destinations survive formatting and link labels still format', () => {
  assert.equal(
    processInlineFormatting('[**Watch**](../clips/first_video_1.mp4)'),
    '[<strong>Watch</strong>](../clips/first_video_1.mp4)',
  )
})

test('existing HTML line-break normalization is preserved', () => {
  assert.equal(
    processInlineFormatting('First<br/>Second<br />Third'),
    'First<br>Second<br>Third',
  )
})

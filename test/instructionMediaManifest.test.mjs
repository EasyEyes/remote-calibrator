import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getInstructionMediaDownloadUrl } from '../src/distance/instructionMediaDownloadUrl.js'
import { collectInstructionMediaUrls } from '../src/distance/instructionMediaManifest.js'

const video = name => `https://example.com/${name}.mp4`
const step = url => `1. Watch\n![Demo](${url})`
const task = (options = {}) => [
  { name: 'trackDistance', options: { useObjectTestData: true, ...options } },
]
const ruler = 'RC_UseObjectToSetViewingDistanceRulerStepperPage1'
const measurement = 'RC_UseObjectToSetViewingDistanceToLocationFirstPage'

test('selects the visible attachment and resolves only referenced legacy tokens', () => {
  const phrases = {
    [ruler]: {
      en: `${step(video('original'))}\n![Compressed](${video('compressed')})`,
    },
    RC_UseObjectToSetViewingDistanceRulerStepperPage2: {
      en: '[[TT1]] Remeasure\n[[SS1]] Watch\n[[LL1]]',
    },
    RC_UseObjectToSetViewingDistanceTapeStepperPage1: {
      en: step(video('unused-tape')),
    },
  }
  const assetMap = { LL1: video('legacy'), LL2: video('unused-legacy') }
  assert.deepEqual(
    collectInstructionMediaUrls(phrases, assetMap, 'en', task()),
    [video('compressed'), video('legacy')],
  )
})

test('expands the active location phrase for both hand choices at the configured locations', () => {
  const phrases = {
    [measurement]: { en: '1. Measure\n[[DISTANCEOBJECTLOCATIONEYE]]' },
    RC_MovieDistanceTubeCenterRightEye: {
      en: `![Right](${video('center-right')})`,
    },
    RC_MovieDistanceTubeCenterLeftEye: {
      en: `![Left](${video('center-left')})`,
    },
    RC_MovieDistanceTubeCameraRightEye: {
      en: `![Unused camera](${video('camera-right')})`,
    },
    RC_UseObjectToSetViewingDistancePage3: { en: step(video('fallback')) },
    RC_produceDistanceLocation: { en: step(video('check')) },
  }
  assert.deepEqual(
    collectInstructionMediaUrls(
      phrases,
      {},
      'en',
      task({ calibrateDistanceLocations: 'center' }),
    ),
    [video('center-right'), video('center-left')],
  )
  assert.deepEqual(
    collectInstructionMediaUrls(
      phrases,
      {},
      'en',
      task({ useObjectTestData: 'typical', calibrateDistanceCheckBool: true }),
    ),
    [video('check')],
  )
  assert.deepEqual(
    collectInstructionMediaUrls(phrases, {}, 'en', [
      { name: 'measureDistance', options: { check: true } },
    ]),
    [video('check')],
  )
  delete phrases[measurement]
  assert.deepEqual(collectInstructionMediaUrls(phrases, {}, 'en', task()), [
    video('fallback'),
  ])
})

test('preloads only the matching credit-card flow and required repeat page', () => {
  const phrases = {
    RC_UseObjectToSetViewingDistanceCreditCardPage3: {
      en: step(video('known-card')),
    },
    RC_UseObjectToSetViewingDistanceRepeatCreditCardPage4: {
      en: step(video('known-repeat')),
    },
    RC_UseCreditCardBelowToCalibrateCameraPage3: { en: step(video('card')) },
    RC_UseCreditCardBelowToCalibrateCameraRepeatPage4: {
      en: step(video('card-repeat')),
    },
    RC_UseLongEdge: { en: step(video('paper')) },
  }
  assert.deepEqual(
    collectInstructionMediaUrls(
      phrases,
      {},
      'en',
      task({ useObjectTestData: 'creditCard', objectMeasurementCount: 1 }),
    ),
    [video('known-card')],
  )
  assert.deepEqual(
    collectInstructionMediaUrls(
      phrases,
      {},
      'en',
      task({ useObjectTestData: 'autoCreditCard' }),
    ),
    [video('card'), video('card-repeat')],
  )
})

test('ignores unused languages and identifies malformed selected media', () => {
  const phrases = {
    [ruler]: {
      en: step(video('original')),
      'zh-CN': step('https://example. com/video.mp4'),
    },
  }
  assert.deepEqual(collectInstructionMediaUrls(phrases, {}, 'en', task()), [
    video('original'),
  ])
  assert.throws(
    () => collectInstructionMediaUrls(phrases, {}, 'zh-CN', task()),
    /Invalid instruction media URL.*zh-CN/,
  )
})

test('direct Firebase instructions use the proxy in both comparison modes', () => {
  const direct =
    'https://firebasestorage.googleapis.com/v0/b/speaker-calibration.firebasestorage.app/o/Instructions%2FLEFT%2Fdemo.mp4?alt=media&token=fixture'
  const proxied =
    'https://easyeyes-cors-proxy-1cf4742aef20.herokuapp.com/' + direct
  assert.equal(getInstructionMediaDownloadUrl(direct, false), proxied)
  assert.equal(getInstructionMediaDownloadUrl(direct, true), proxied)
  assert.equal(getInstructionMediaDownloadUrl(proxied, true), proxied)
  assert.equal(
    getInstructionMediaDownloadUrl(video('other'), true),
    video('other'),
  )
})

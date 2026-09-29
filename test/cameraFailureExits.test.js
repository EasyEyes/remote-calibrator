const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

// ─────────────────────────────────────────────────────────────────────────────
// Camera-failure exits (field bug, EasyEyes Acuity24FontsAddSloan3 2026-09-25:
// 12 sessions closed at the Choose Camera page; Prolific feedback "Kept
// saying my camera wasn't there. it was.", "wouldnt connect to camera and
// then it froze"). Three defects, each strandable forever:
//
//  R1  The camera-startup error popup (gazeTracker _promptCameraRetry) shows
//      ONLY "Try again" — a deterministic failure (permission denied, no
//      device, camera busy) loops forever with no exit.
//  R2  When cameras WERE found but every one was excluded by the study's
//      camera policy (externals hidden by default), the no-camera page
//      claims "No cameras detected" — a lie that sends participants (and
//      Prolific support) hunting for a phantom driver problem.
//  R3  Virtual cameras (OBS, phone mirrors, screen capture) classify as
//      "unknown" and are accepted — defeating the policy that excludes
//      external cameras, and feeding screen pixels to face tracking
//      (field: a participant completed distance calibration on
//      "OBS Virtual Camera" while their real webcam was excluded).
// ─────────────────────────────────────────────────────────────────────────────

const srcOf = f => fs.readFileSync(path.join(__dirname, '../src', f), 'utf8')

// ── R1: the startup-error popup must offer an exit ──────────────────────────

describe('R1: camera startup error popup offers an exit (no infinite retry)', function () {
  const src = srcOf('gaze/gazeTracker.js')

  it('shows a cancel button alongside Try again', function () {
    assert.match(
      src,
      /showCancelButton:\s*true/,
      '_promptCameraRetry must showCancelButton so a deterministic failure can be ended',
    )
  })

  it('cancel marks the error userEnded and returns false (no retry)', function () {
    // The popup dismiss/cancel path must set a flag the caller can turn
    // into an explained end, and _startCameraSessionWithRetry must
    // rethrow (it already does on `!retry`).
    assert.match(
      src,
      /userEnded\s*=\s*true/,
      'cancel path must mark the error (error.userEnded = true)',
    )
  })

  it('a userEnded startup error ends camera selection explained, without a second popup', function () {
    const sel = srcOf('cameraSelection.js')
    // cameraSelection must branch on userEnded BEFORE calling showTestPopup
    // (now wrapped in untilInteractionEnds upstream), returning the
    // experimentEnded result the consumer (EasyEyes) honors.
    const branch = sel.indexOf('startupError?.userEnded')
    const popupCall = sel.indexOf('showTestPopup(this, null, opts)')
    assert.ok(
      branch >= 0,
      'cameraSelection must consult startupError.userEnded',
    )
    assert.ok(
      branch < popupCall,
      'the userEnded branch must precede the showTestPopup call',
    )
  })
})

// ── R2: the no-camera page must tell the truth about WHY ────────────────────

describe('R2: no-camera page distinguishes excluded cameras from none found', function () {
  const { noCameraMessage } = require('../src/components/popup')

  // The unit phrase table is empty (phrases arrive at runtime via
  // rc.init({ languagePhrasesJSON })), so these exercise the English
  // fallbacks — the same pattern gazeTracker already uses.

  it('no cameras at all keeps the not-found message', function () {
    const msg = noCameraMessage({ L: 'en-US' }, { anyCamerasFound: false })
    assert.match(msg, /no cameras|not.*found|couldn.*find/i)
  })

  it('cameras found but excluded says the built-in-camera truth', function () {
    const msg = noCameraMessage({ L: 'en-US' }, { anyCamerasFound: true })
    assert.match(
      msg,
      /built-in/i,
      'must say the study needs a built-in camera — not "no cameras detected"',
    )
    assert.doesNotMatch(
      msg,
      /no cameras detected/i,
      'must not claim no cameras were detected when cameras were found',
    )
  })

  it('prefers the phrase table when the language is present', function () {
    const { phrases } = require('../src/i18n/schema')
    const restore = phrases.RC_errorNoBuiltInCamera
    phrases.RC_errorNoBuiltInCamera = { 'en-US': 'SENTINEL_BUILTIN' }
    try {
      const msg = noCameraMessage({ L: 'en-US' }, { anyCamerasFound: true })
      assert.ok(
        msg.includes('SENTINEL_BUILTIN'),
        'phrase table must win over the default',
      )
    } finally {
      if (restore === undefined) delete phrases.RC_errorNoBuiltInCamera
      else phrases.RC_errorNoBuiltInCamera = restore
    }
  })

  it('showTestPopup passes the found-any-cameras fact through', function () {
    const src = srcOf('components/popup.js')
    assert.match(
      src,
      /anyCamerasFound/,
      'the zero-visible branch must tell the page whether cameras were found',
    )
  })
})

// ── R3: virtual cameras are external ────────────────────────────────────────

describe('R3: virtual cameras classify as external (excluded by default policy)', function () {
  const { likelyBuiltIn } = require('../src/components/cameraClassifier')

  const classify = label =>
    likelyBuiltIn({ label, kind: 'videoinput' }, []).classification

  const VIRTUAL_LABELS = [
    'OBS Virtual Camera',
    'ManyCam Virtual Camera',
    'Snap Camera',
    'DroidCam Video Source',
    'Iriun Webcam',
    'EpocCam',
    "Liba's S24 Ultra (Windows Virtual Camera)", // field device
    'Galaxy S24 FE (Windows Virtual Camera)', // field device
    'screen-capture-recorder', // field device
  ]

  for (const label of VIRTUAL_LABELS) {
    it(`virtual: "${label}" → external`, function () {
      assert.strictEqual(classify(label), 'external')
    })
  }

  // Regressions: the classifier's existing verdicts must not drift.
  it('built-in labels stay built-in', function () {
    for (const label of [
      'Integrated Camera (13d3:56fb)',
      'Integrated Webcam (1bcf:2b98)', // field: 3 participants completed on it
      'FaceTime HD Camera (1C1C:B782)',
      'HP 5MP Camera (04f2:b82d)',
      'MacBook Air Camera (0000:0001)',
      'Surface Camera Front',
    ]) {
      assert.strictEqual(classify(label), 'built-in', label)
    }
  })

  it('genuinely unknown labels stay unknown', function () {
    for (const label of [
      'TeckNet',
      'LGE Camera (30c9:005c)',
      '1080p FHD Camera (2b7e:c668)',
      '720p HD Camera',
    ]) {
      assert.strictEqual(classify(label), 'unknown', label)
    }
  })

  it('real external webcams stay external', function () {
    for (const label of ['Logitech C920', 'USB2.0 HD UVC WebCam (3277:0036)']) {
      assert.strictEqual(classify(label), 'external', label)
    }
  })
})

// ESC must never END the session.
//
// Field context (EasyEyes failure-reduction): RC's no-camera popup mapped a
// single stray Escape to clickCancel — ending the study instantly, with no
// confirm and no way back. That was the one destructive ESC binding in RC.
//
// The calibration screens' Escape → breakFunction bindings are NOT in that
// class and must stay. Verified cascade (2026-09-29): the panel element is
// never removed when a step starts; calibration runs on top of the
// fullscreen `calibration-background` overlay, which breakFunction removes
// — revealing the panel with the step still incomplete. The participant
// simply clicks the step again (trackGaze/trackDistance re-init cleanly
// after endGaze/endDistance). Cancel = return to panel, retry — the same
// non-destructive spirit as the experiment proper's ESC → Skip/Quit
// confirm dialog.
//
// Rule under test:
//   1. No ESC binding may END the session (no-camera popup is the fix).
//   2. The non-destructive calibration ESC-cancels REMAIN — they are the
//      keyboard path back to the panel; removing them would strand
//      keyboard users on screens whose cancel buttons were deliberately
//      omitted/hidden (gaze calibration: the 9-point dot grid occupies
//      every corner, so a fixed-position Cancel button would cover a
//      dot's ±5px click target and soft-lock calibration).
//   3. Documented exception: the distance nudger keeps Escape → endNudger
//      (dismisses a cancelable nag overlay; never aborts anything).
//
// Source-contract tests, the suite's established pattern for popup
// structure (see cameraFailureExits.test.js).

const assert = require('node:assert').strict
const fs = require('node:fs')
const path = require('node:path')

const srcOf = f => fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8')

describe('ESC never ends the session', () => {
  it('no-camera popup: Escape must not click cancel', () => {
    const popup = srcOf('components/popup.js')
    const i = popup.indexOf('const showNoCameraPopup')
    assert.ok(i >= 0, 'showNoCameraPopup must exist')
    const body = popup.slice(i, i + 6000)
    assert.ok(
      !body.includes("'Escape'") && !body.includes('"Escape"'),
      'showNoCameraPopup must not map Escape → clickCancel: a stray ESC ' +
        'ended the study with no confirm. OK is the explicit end button.',
    )
    assert.ok(
      body.includes('Enter') && body.includes('clickConfirm'),
      'no-camera popup must keep Enter → Try again',
    )
    assert.ok(
      body.includes('showCancelButton: true'),
      'no-camera popup must keep its explicit cancel (OK) button',
    )
  })
})

describe('calibration ESC-cancels stay (verified non-destructive: return to panel)', () => {
  it('gaze calibration keeps Escape → breakFunction', () => {
    const src = srcOf('gaze/gazeCalibration.js')
    assert.ok(
      /Escape\s*:\s*breakFunction/.test(src),
      'gazeCal ESC-cancel returns to the panel (retryable); it is also ' +
        'the only exit — every corner hosts a calibration dot, so no ' +
        'fixed-position Cancel button can avoid covering a ±5px target',
    )
  })

  it('screen-size calibration keeps Escape → breakFunction', () => {
    const src = srcOf('screenSize.js')
    assert.ok(
      /Escape\s*:\s*breakFunction/.test(src),
      'screenSize ESC-cancel returns to the panel (retryable)',
    )
  })

  it('typed-input steps keep Escape → bFunction', () => {
    const src = srcOf('components/checkInput.js')
    assert.ok(
      /Escape\s*:\s*bFunction/.test(src),
      'checkInput ESC-cancel resolves null → step stays incomplete in ' +
        'the panel (retryable)',
    )
  })

  it('IPD ruler keeps Escape → breakFunction', () => {
    const src = srcOf('distance/interPupillaryDistance.js')
    assert.ok(
      /Escape\s*:\s*breakFunction/.test(src),
      'IPD ESC-cancel returns to the panel (retryable)',
    )
  })

  it('distance align keeps its Escape abort', () => {
    const src = srcOf('distance/distance.js')
    assert.ok(
      /e\.key === 'Escape'/.test(src),
      'distance align ESC-cancel returns to the panel (retryable)',
    )
  })

  it('documented exception: the distance nudger keeps Escape → endNudger', () => {
    const src = srcOf('distance/distanceNudge.js')
    assert.ok(
      /Escape\s*:\s*this\.endNudger/.test(src),
      'the nudger is a cancelable nag overlay; ESC dismisses it and ' +
        'never aborts the session',
    )
  })
})

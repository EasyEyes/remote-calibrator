const assert = require('node:assert')

// ─────────────────────────────────────────────────────────────────────────────
// Choose Camera commit gate (field bug, EasyEyes Acuity24Fonts5-12: 148
// sessions stranded at the camera-selection step). The tile-click and
// Enter-key commit handlers began with `if (!isFullscreen()) return` — a
// page that is windowed (never entered fullscreen, lost to a permission
// prompt, or the re-entry request failed without a fresh gesture) ignored
// EVERY commit silently. Participants sat minutes on an unresponsive page,
// closed the tab, and retried. A commit gesture is fresh user activation:
// use it to enter fullscreen and honor the commit on success. Choose
// Screen mode stays windowed on purpose (participant positioning the study
// window on the screen with the camera), so commits remain ignored there.
// ─────────────────────────────────────────────────────────────────────────────

const { cameraCommitGate } = require('../src/components/cameraCommitGate')

const depsWith = ({ fullscreen = false, enterThrows = false } = {}) => {
  const state = { fullscreen, entered: 0 }
  return {
    state,
    isFullscreen: () => state.fullscreen,
    enterFullscreen: async () => {
      state.entered += 1
      if (enterThrows) throw new Error('not allowed')
      state.fullscreen = true
    },
  }
}

describe('cameraCommitGate', function () {
  it('already fullscreen → commit proceeds, no fullscreen request', async function () {
    const { state, isFullscreen, enterFullscreen } = depsWith({
      fullscreen: true,
    })
    const ok = await cameraCommitGate({}, { isFullscreen, enterFullscreen })
    assert.strictEqual(ok, true)
    assert.strictEqual(state.entered, 0)
  })

  it('windowed → enters fullscreen on the commit gesture and proceeds', async function () {
    const { state, isFullscreen, enterFullscreen } = depsWith()
    const ok = await cameraCommitGate({}, { isFullscreen, enterFullscreen })
    assert.strictEqual(ok, true)
    assert.strictEqual(state.entered, 1)
  })

  it('Choose Screen mode (windowed on purpose) → commit ignored, no fullscreen request', async function () {
    const { state, isFullscreen, enterFullscreen } = depsWith()
    const ok = await cameraCommitGate(
      { _inChooseScreenMode: true },
      { isFullscreen, enterFullscreen },
    )
    assert.strictEqual(ok, false)
    assert.strictEqual(state.entered, 0)
  })

  it('fullscreen request rejected → commit ignored, never throws', async function () {
    const { isFullscreen, enterFullscreen } = depsWith({ enterThrows: true })
    const ok = await cameraCommitGate({}, { isFullscreen, enterFullscreen })
    assert.strictEqual(ok, false)
  })

  it('request resolves but page still windowed → commit ignored', async function () {
    const state = { fullscreen: false, entered: 0 }
    const ok = await cameraCommitGate(
      {},
      {
        isFullscreen: () => state.fullscreen,
        enterFullscreen: async () => {
          state.entered += 1
          // resolves without changing fullscreen state
        },
      },
    )
    assert.strictEqual(ok, false)
    assert.strictEqual(state.entered, 1)
  })
})

// Source contracts: every Choose Camera commit site routes through the gate,
// and the old silent guard is gone.
describe('cameraCommitGate wiring', function () {
  const fs = require('fs')
  const path = require('path')
  const src = fs.readFileSync(
    path.join(__dirname, '../src/components/popup.js'),
    'utf8',
  )

  it('tile click and Enter-key commit handlers both gate through cameraCommitGate', function () {
    const uses = (src.match(/await cameraCommitGate\(RC\)/g) || []).length
    assert.ok(uses >= 2, `expected >=2 gated commit sites, found ${uses}`)
  })

  it('the silent not-fullscreen return is gone', function () {
    assert.ok(
      !src.includes('if (!isFullscreen()) return'),
      'commit handlers must not silently ignore windowed commits',
    )
  })
})

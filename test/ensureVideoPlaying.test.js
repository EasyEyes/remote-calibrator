const assert = require('node:assert')

/**
 * RED tests for the static-nudger-after-recalibration bug.
 *
 * Observed in the ?rcdebug manual run: after recalibration completes,
 * the webgazer video element (webgazerVideoFeed) is implicitly PAUSED
 * (browser-side pause event, no explicit .pause() call anywhere) while
 * its MediaStream and track remain live. Nothing ever calls play()
 * again, so the canvas repaints the last frame, face-mesh output is
 * constant, and the nudger shows a frozen distance forever.
 *
 * The tracking loop must auto-resume a paused video element whose
 * stream is live.
 */
describe('ensureVideoPlaying (auto-resume paused tracking video)', function () {
  const {
    ensureVideoPlaying,
  } = require('../src/distance/ensureVideoPlaying.js')

  it('calls play() on a paused video element', function () {
    let playCalls = 0
    const video = {
      paused: true,
      ended: false,
      play: () => {
        playCalls++
        return Promise.resolve()
      },
    }
    ensureVideoPlaying(video)
    assert.strictEqual(
      playCalls,
      1,
      'play() must be called on a paused element',
    )
  })

  it('does not call play() on an already-playing element', function () {
    let playCalls = 0
    const video = {
      paused: false,
      ended: false,
      play: () => {
        playCalls++
        return Promise.resolve()
      },
    }
    ensureVideoPlaying(video)
    assert.strictEqual(playCalls, 0, 'play() must not be called when playing')
  })

  it('tolerates a null/missing element', function () {
    assert.doesNotThrow(() => ensureVideoPlaying(null))
    assert.doesNotThrow(() => ensureVideoPlaying(undefined))
  })

  it('swallows a rejected play() promise (retry next frame)', async function () {
    const video = {
      paused: true,
      ended: false,
      play: () => Promise.reject(new Error('autoplay blocked')),
    }
    assert.doesNotThrow(() => ensureVideoPlaying(video))
    // Let the rejection settle; an unhandled rejection would fail the run.
    await new Promise(r => setTimeout(r, 10))
  })
})

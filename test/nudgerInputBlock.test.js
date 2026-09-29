const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

/**
 * RED tests for the RSVP lockup class (field 2026-09-29, Denis's participant
 * video): after a pause/restore the tracking UI leaked over the experiment
 * and word buttons hovered (CSS) but clicks did nothing.
 *
 * Mechanisms pinned here:
 *  1. resumeNudger() installs the capture-phase ALL-input blockers whenever
 *     _nudger.element is non-null — even when that element is detached from
 *     the DOM. Invisible block: hover still works (pure CSS), clicks/keys die.
 *  2. _removeNudger() leaves _nudger.element stale when #calibration-nudger
 *     is already gone from the DOM — feeding (1).
 *  3. #webgazerVideoContainer's CSS keeps pointer-events enabled, so a
 *     leaked visible video box eats clicks where it overlaps content.
 *  4. _prepareReconnectOverlay() defends against a leaked
 *     rc-camera-previews-bottom-outer but not the equally willClose-dependent
 *     rc-resolution-video-wrapper.
 */
describe('Nudger input blocking (RSVP lockup class)', function () {
  const RC = require('../src/index.js').default

  afterEach(function () {
    // Unblock whatever a test installed and drop body leftovers, so tests
    // stay independent (the blocker module state persists per process).
    try {
      RC._nudger = { element: null, nudgerPaused: false }
      RC.pauseNudger()
    } catch (_) {}
    document.body.innerHTML = ''
  })

  it('resumeNudger with a DETACHED element must not block clicks', function () {
    const stale = document.createElement('div') // detached: removed from DOM elsewhere
    RC._nudger = { element: stale, nudgerPaused: true }
    RC.resumeNudger()

    const target = document.createElement('div')
    document.body.appendChild(target)
    let clicked = false
    target.addEventListener('click', () => {
      clicked = true
    })
    target.dispatchEvent(
      new window.MouseEvent('click', { bubbles: true, cancelable: true }),
    )
    assert.ok(clicked, 'click reached the target (no invisible input block)')
  })

  it('resumeNudger with a LIVE nudger still blocks clicks outside it', function () {
    const live = document.createElement('div')
    live.id = 'calibration-nudger'
    document.body.appendChild(live)
    RC._nudger = { element: live, nudgerPaused: true }
    RC.resumeNudger()

    const target = document.createElement('div')
    document.body.appendChild(target)
    let clicked = false
    target.addEventListener('click', () => {
      clicked = true
    })
    target.dispatchEvent(
      new window.MouseEvent('click', { bubbles: true, cancelable: true }),
    )
    assert.ok(!clicked, 'input blocker active while the nudger is live')
    // Inside the nudger, events pass (its own buttons).
    let inside = false
    live.addEventListener('click', () => {
      inside = true
    })
    live.dispatchEvent(
      new window.MouseEvent('click', { bubbles: true, cancelable: true }),
    )
    assert.ok(inside)
  })

  it('_removeNudger resets _nudger state when the DOM element is gone', function () {
    RC._nudger = {
      element: document.createElement('div'), // never appended
      nudgerPaused: false,
    }
    const removed = RC._removeNudger()
    assert.equal(removed, false) // nothing was in the DOM
    assert.equal(
      RC._nudger.element,
      null,
      'stale element reference must not survive',
    )
    assert.equal(RC._nudger.nudgerPaused, false)
  })

  it('re-track reconfigure branch attaches the new callbackTrack', async function () {
    // The already-initialized branch ("just reconfigure ... TODO Attach new
    // callbackTrack") re-shows the video and returns. If the caller's
    // wrapped callbackTrack (which fires onRecalibrateEnd exactly once,
    // letting the host hide the video and unfreeze its trial gates) is
    // dropped, a re-track through this branch leaves the tracking UI
    // visible forever and the host's recalibration state stuck.
    const origCheck = RC.gazeTracker.checkInitialized
    const origSelfCheck = RC.checkInitialized
    const origFully = RC._distanceTrackingFullyInitialized
    const origShowVideo = RC.showVideo
    const origShowNearPoint = RC.showNearPoint
    const origShowFaceOverlay = RC.showFaceOverlay
    const origWebgazer = RC.gazeTracker.webgazer
    const origEnv = RC._environmentData
    RC.gazeTracker.checkInitialized = () => true
    RC.checkInitialized = () => true
    RC._distanceTrackingFullyInitialized = true
    RC.showVideo = () => {}
    RC.showNearPoint = () => {}
    RC.showFaceOverlay = () => {}
    // isMobile getter reads the last _environmentData entry
    RC._environmentData = [{ value: { deviceType: 'desktop' }, timestamp: 0 }]
    RC.gazeTracker.webgazer = {
      getTracker: () => ({ modelLoaded: true, loadModel: async () => {} }),
    }
    try {
      const wrapped = function wrapped() {}
      await RC.trackDistance({}, null, wrapped)
      assert.equal(
        RC.gazeTracker.defaultDistanceTrackCallback,
        wrapped,
        'reconfigure branch must attach the new (wrapped) callbackTrack',
      )
    } finally {
      RC.gazeTracker.checkInitialized = origCheck
      RC.checkInitialized = origSelfCheck
      RC._distanceTrackingFullyInitialized = origFully
      RC.showVideo = origShowVideo
      RC.showNearPoint = origShowNearPoint
      RC.showFaceOverlay = origShowFaceOverlay
      RC.gazeTracker.webgazer = origWebgazer
      RC._environmentData = origEnv
    }
  })
})

describe('Tracking-video CSS (leaked box must not eat clicks)', function () {
  it('#webgazerVideoContainer has an ACTIVE pointer-events: none', function () {
    const css = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'css', 'gaze.css'),
      'utf8',
    )
    const m = /#webgazerVideoContainer\s*\{[^}]*\}/.exec(css)
    assert.ok(m, 'container block found')
    // Strip /* */ comments: the bug is precisely that the rule is commented.
    const uncommented = m[0].replace(/\/\*[\s\S]*?\*\//g, '')
    const active = /(^|[^\w-])pointer-events\s*:\s*none/.test(uncommented)
    assert.ok(active, 'pointer-events: none is present and not commented out')
  })

  it('container opacity is not CSS-vetoed (Safari hides via inline opacity)', function () {
    const css = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'css', 'gaze.css'),
      'utf8',
    )
    const m = /#webgazerVideoContainer\s*\{[^}]*\}/.exec(css)
    assert.ok(m, 'container block found')
    assert.ok(
      !/opacity\s*:\s*1\s*!important/.test(m[0]),
      "opacity:1 !important vetoes hideVideoElement's Safari opacity hide — the container can then never be hidden",
    )
  })
})

describe('Reconnect overlay defends against leaked resolution wrapper', function () {
  it('_prepareReconnectOverlay removes a leaked #rc-resolution-video-wrapper', function () {
    const {
      _prepareReconnectOverlay,
    } = require('../src/WebGazer4RC/src/index.mjs')
    const leaked = document.createElement('div')
    leaked.id = 'rc-resolution-video-wrapper'
    document.body.appendChild(leaked)

    _prepareReconnectOverlay()

    assert.equal(
      document.getElementById('rc-resolution-video-wrapper'),
      null,
      'leaked wrapper removed before the reconnect popup snapshot',
    )
    // Snapshot wrapper it creates is pointer-transparent; clean it up.
    document.getElementById('rc-reconnect-page-snapshot')?.remove()
  })
})

const assert = require('node:assert')

// Item-1 RC changes: (a) VideoLiveMonitor suspend/unsuspend so the camera
// selection phase can own the camera without its stream churn reading as a
// participant-side disconnect; (b) quit-reason objects passed through
// webgazer → GazeTracker → RemoteCalibrator.setOnQuit; (c) camera-disconnect
// callbacks carrying the monitor snapshot; (d) findBestCameraMode probing
// frame rates only at the best resolution and honoring a wall-clock budget.

const {
  VideoLiveMonitor,
} = require('../src/WebGazer4RC/src/videoLiveMonitor.mjs')
const {
  buildCameraReconnectQuitReason,
  findBestCameraMode,
} = require('../src/WebGazer4RC/src/index.mjs')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ── fakes ────────────────────────────────────────────────────────────────────
function fakeTrack(readyState = 'live') {
  return {
    readyState,
    muted: false,
    listeners: {},
    addEventListener(ev, fn) {
      ;(this.listeners[ev] = this.listeners[ev] || []).push(fn)
    },
    removeEventListener(ev, fn) {
      this.listeners[ev] = (this.listeners[ev] || []).filter((f) => f !== fn)
    },
    dispatch(ev) {
      ;(this.listeners[ev] || []).forEach((f) => f())
    },
  }
}

function fakeStream(track) {
  return { active: true, getVideoTracks: () => [track] }
}

function makeMonitor(track) {
  const m = new VideoLiveMonitor(fakeStream(track), null, 10)
  const events = []
  m.onChange((snap) => events.push(snap))
  return { m, events }
}

describe('VideoLiveMonitor suspend', () => {
  it('suspend() detaches listeners: a track ended event does not emit', () => {
    const track = fakeTrack()
    const { m, events } = makeMonitor(track)
    m.start()
    m.suspend()
    track.readyState = 'ended'
    track.dispatch('ended')
    assert.equal(
      events.filter((e) => e.status === 'ended').length,
      0,
      'no emission while suspended',
    )
    m.stop()
  })

  it('updateStream() while suspended tracks the new stream but stays paused', () => {
    const oldTrack = fakeTrack()
    const { m, events } = makeMonitor(oldTrack)
    m.start()
    m.suspend()
    const newTrack = fakeTrack()
    m.updateStream(fakeStream(newTrack), null)
    // Old track's death is invisible (listener detached, stream replaced).
    oldTrack.readyState = 'ended'
    oldTrack.dispatch('ended')
    // New track's death is also invisible: still suspended.
    newTrack.readyState = 'ended'
    newTrack.dispatch('ended')
    assert.equal(events.filter((e) => e.status === 'ended').length, 0)
    assert.equal(m.track, newTrack, 'monitor switched to the new stream')
    m.stop()
  })

  it('unsuspend() to depth 0 re-arms on the current stream', () => {
    const track = fakeTrack()
    const { m, events } = makeMonitor(track)
    m.start()
    m.suspend()
    m.unsuspend()
    track.readyState = 'ended'
    track.dispatch('ended')
    assert.ok(
      events.some((e) => e.status === 'ended'),
      're-armed monitor reports the ended track',
    )
    m.stop()
  })

  it('suspend nests: only the final unsuspend() re-arms', () => {
    const track = fakeTrack()
    const { m, events } = makeMonitor(track)
    m.start()
    m.suspend()
    m.suspend()
    m.unsuspend()
    track.readyState = 'ended'
    track.dispatch('ended')
    assert.equal(events.filter((e) => e.status === 'ended').length, 0)
    m.unsuspend()
    track.dispatch('ended')
    assert.ok(events.some((e) => e.status === 'ended'))
    m.stop()
  })

  it('extra unsuspend() calls are harmless', () => {
    const track = fakeTrack()
    const { m } = makeMonitor(track)
    m.start()
    m.unsuspend()
    m.unsuspend()
    assert.doesNotThrow(() => m.unsuspend())
    m.stop()
  })
})

describe('buildCameraReconnectQuitReason', () => {
  it('shape: trigger, trimmed snapshot, cameraLabel, attempts, quitAfterFailedResume', () => {
    const reason = buildCameraReconnectQuitReason(
      {
        status: 'inactive',
        trackReadyState: 'live',
        streamActive: false,
        muted: true,
        videoReadyState: 2,
      },
      'HD Webcam',
      2,
    )
    assert.equal(reason.trigger, 'cameraReconnectPopup')
    assert.deepEqual(reason.snapshot, {
      status: 'inactive',
      trackReadyState: 'live',
      streamActive: false,
    })
    assert.equal(reason.cameraLabel, 'HD Webcam')
    assert.equal(reason.resumeAttempts, 2)
    assert.equal(reason.quitAfterFailedResume, true)
  })

  it('quit on the first popup (no failed resume attempts yet)', () => {
    const reason = buildCameraReconnectQuitReason({ status: 'ended' }, '', 0)
    assert.equal(reason.quitAfterFailedResume, false)
    assert.equal(reason.cameraLabel, '')
  })

  it('missing snapshot → snapshot null, not undefined', () => {
    const reason = buildCameraReconnectQuitReason(null, 'cam', 0)
    assert.strictEqual(reason.snapshot, null)
  })
})

describe('GazeTracker quit/disconnect plumbing', () => {
  it('onQuit passes the reason through to the calibrator callback', () => {
    const GazeTracker = require('../src/gaze/gazeTracker').default
    const captured = {}
    let quitReason = 'NOT CALLED'
    const calibrator = {
      L: 'en',
      LD: 'ltr',
      popupKeydownListener: null,
      _cleanupAllRC: () => {},
      _onQuitCallback: (r) => {
        quitReason = r
      },
    }
    const gt = new GazeTracker(calibrator)
    gt.webgazer = {
      params: {},
      setOnQuit: (cb) => {
        captured.onQuit = cb
      },
      setOnCameraDisconnected: (cb) => {
        captured.onDisconnected = cb
      },
      setOnCameraReconnected: (cb) => {
        captured.onReconnected = cb
      },
    }
    gt.setupCameraMonitoring()

    captured.onQuit({ trigger: 'cameraReconnectPopup', cameraLabel: 'cam' })
    assert.equal(quitReason.trigger, 'cameraReconnectPopup')

    const seen = []
    gt.onCameraDisconnected((message, snapshot) => seen.push({ message, snapshot }))
    captured.onDisconnected('Camera status: ended', {
      status: 'ended',
      trackReadyState: 'ended',
      streamActive: true,
    })
    assert.equal(seen.length, 1)
    assert.equal(seen[0].snapshot.status, 'ended')
  })
})

describe('Choose-Screen quit reason', () => {
  it("popup.js quit handler passes a trigger to _onQuitCallback (not bare)", () => {
    // The Choose-Screen Quit is a VOLUNTARY flow exit, not a camera
    // disconnect: without a trigger the consumer labels it with the
    // camera-reconnect-popup default, which would be specifically wrong.
    const fs = require('node:fs')
    const path = require('node:path')
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'components', 'popup.js'),
      'utf8',
    )
    assert.ok(
      src.includes("RC._onQuitCallback({ trigger: 'chooseScreenQuit' })"),
      'Choose-Screen quit must pass { trigger: \'chooseScreenQuit\' } so the consumer records the real cause',
    )
  })
})

describe('findBestCameraMode bounded probing (upstream 0.9.160 architecture)', () => {
  const installFakeCamera = ({ withCapabilities = true, delayMs = 0 } = {}) => {
    const calls = []
    const DISCRETE_FRS = [5, 10, 15, 20, 30, 60]
    let current = { width: 640, height: 480, frameRate: 30 }
    const track = {
      readyState: 'live',
      applyConstraints: async (c) => {
        calls.push(c)
        if (delayMs) await sleep(delayMs)
        const v = c.video || c
        if (v.width && v.width.exact != null) {
          current = { ...current, width: v.width.exact, height: v.height.exact }
        }
        if (v.frameRate && v.frameRate.ideal != null) {
          const nearest = DISCRETE_FRS.reduce((a, b) =>
            Math.abs(b - v.frameRate.ideal) < Math.abs(a - v.frameRate.ideal)
              ? b
              : a,
          )
          current = { ...current, frameRate: nearest }
        }
      },
      getSettings: () => ({ ...current }),
      ...(withCapabilities
        ? {
            getCapabilities: () => ({
              width: { min: 320, max: 1920 },
              height: { min: 240, max: 1080 },
              frameRate: { min: 5, max: 60 },
            }),
          }
        : {}),
    }
    const stream = fakeStream(track)
    const mediaDevices = { getUserMedia: async () => stream }
    Object.defineProperty(global.navigator, 'mediaDevices', {
      value: mediaDevices,
      configurable: true,
    })
    return { calls, stream }
  }

  it('capabilities path: no resolution sweep, at most the final mode application', async () => {
    // Chrome/Edge report capabilities: modes are ranked from them directly.
    // The only applyConstraints allowed is the single final mode application
    // (plus at most one ideal-retry if exact is rejected) — never a sweep.
    const { calls } = installFakeCamera({ withCapabilities: true })
    const result = await findBestCameraMode(null, 1920, 1080, 30)
    assert.ok(calls.length <= 2, `expected ≤2 applyConstraints, got ${calls.length}`)
    assert.ok(Number.isFinite(result.width))
    assert.ok(Number.isFinite(result.height))
    assert.ok(result.frameRate > 0)
    assert.ok(result.stream)
  })

  it('no-capabilities fallback: bounded to PROBE_MAX_RESOLUTIONS candidates', async () => {
    // Firefox-style track: bounded probing probes at most 4 ranked
    // resolutions (plus the final mode application), never a full sweep.
    const { calls } = installFakeCamera({ withCapabilities: false })
    const result = await findBestCameraMode(null, 1920, 1080, 30)
    assert.ok(
      calls.length <= 5,
      `expected ≤5 applyConstraints (4 probes + 1 apply), got ${calls.length}`,
    )
    assert.ok(Number.isFinite(result.width))
    assert.ok(result.frameRate > 0)
    assert.ok(result.stream)
  })
})

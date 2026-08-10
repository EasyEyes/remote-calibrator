const assert = require('node:assert')

/**
 * RED tests for the nudger's recalibrate-restart path (Trello card
 * 2024-11-10): after clicking recalibrate and re-calibrating, the
 * experiment resumed into a broken trial state and distance tracking
 * froze.
 *
 * Threshold (easyeyes.app) now passes onRecalibrateStart/onRecalibrateEnd
 * hooks in the trackDistance options; RC must invoke them around the
 * re-track. The re-track must calibrate at the CURRENT desired distance
 * (per-block setDistanceDesired), not the stale original options, and
 * GazeTracker.end must reset task bookkeeping so re-initialization runs.
 */
describe('Recalibrate-restart from nudger', function () {
  this.timeout(20000)
  const RC = require('../src/index.js').default

  describe('_restartViewingDistanceTracking', function () {
    it('invokes hooks in order and re-tracks at the CURRENT desired distance', async function () {
      const calls = []
      const trackingConfig = {
        options: {
          desiredDistanceCm: 100, // STALE — from the original trackDistance call
          onRecalibrateStart: () => calls.push('onRecalibrateStart'),
          onRecalibrateEnd: () => calls.push('onRecalibrateEnd'),
        },
        callbackStatic: null,
        callbackTrack: () => calls.push('callbackTrack'),
      }
      // A later block moved the target: per-trial setDistanceDesired(500).
      RC._distanceTrackNudging.distanceDesired = 500

      const origEnd = RC.endDistance
      const origAddBg = RC._addBackground
      const origTrack = RC.trackDistance
      let trackedOptions = null
      let endDistanceArgs = null
      RC.endDistance = (...args) => {
        calls.push('endDistance')
        endDistanceArgs = args
        return RC
      }
      RC._addBackground = () => {}
      RC.trackDistance = async (options, callbackStatic, callbackTrack) => {
        calls.push('trackDistance')
        trackedOptions = options
        // Two live tracking frames: the end hook must fire exactly once.
        if (typeof callbackTrack === 'function') {
          callbackTrack({ value: 200 })
          callbackTrack({ value: 201 })
        }
      }
      try {
        await RC._restartViewingDistanceTracking(trackingConfig)
      } finally {
        RC.endDistance = origEnd
        RC._addBackground = origAddBg
        RC.trackDistance = origTrack
        RC._distanceTrackNudging.distanceDesired = null
      }

      // Order: threshold gates the trial BEFORE teardown; re-track last.
      assert.deepEqual(calls.slice(0, 3), [
        'onRecalibrateStart',
        'endDistance',
        'trackDistance',
      ])
      // Teardown preserves the camera stream for the immediate re-track.
      assert.deepEqual(endDistanceArgs, [false, true, true])
      // Current desired distance wins over the stale original options.
      assert.equal(trackedOptions.desiredDistanceCm, 500)
      // End hook fired exactly once (first live frame), callback delegated
      // every frame.
      assert.deepEqual(
        calls.filter((c) => c === 'onRecalibrateEnd'),
        ['onRecalibrateEnd'],
      )
      assert.deepEqual(
        calls.filter((c) => c === 'callbackTrack'),
        ['callbackTrack', 'callbackTrack'],
      )
    })

    it('works without hooks or callbackTrack (bare RC usage)', async function () {
      const calls = []
      const trackingConfig = {
        options: { desiredDistanceCm: 60 },
        callbackStatic: null,
        callbackTrack: null,
      }
      const origEnd = RC.endDistance
      const origAddBg = RC._addBackground
      const origTrack = RC.trackDistance
      RC.endDistance = () => {
        calls.push('endDistance')
        return RC
      }
      RC._addBackground = () => {}
      RC.trackDistance = async () => calls.push('trackDistance')
      try {
        await RC._restartViewingDistanceTracking(trackingConfig)
      } finally {
        RC.endDistance = origEnd
        RC._addBackground = origAddBg
        RC.trackDistance = origTrack
      }
      assert.deepEqual(calls, ['endDistance', 'trackDistance'])
    })
  })

  describe('GazeTracker.end', function () {
    const withMockedWebgazerEnd = (gt, fn) => {
      const endCalls = []
      const origWebgazerEnd = gt.webgazer.end
      gt.webgazer.end = (endAll) => endCalls.push(endAll)
      let result
      try {
        fn()
        result = {
          initialized: { ...gt._initialized },
          running: { ...gt._running },
          runningVideo: gt._runningVideo,
          endCalls,
        }
      } finally {
        gt.webgazer.end = origWebgazerEnd
        // Restore pre-test bookkeeping for other suites.
        gt._initialized.distance = true
        gt._running.distance = true
        gt._runningVideo = true
      }
      return result
    }

    it('preserveVideo: resets only distance flags; camera survives', function () {
      const gt = RC.gazeTracker
      // Distance initialized, gaze NOT (typical threshold setup).
      gt._initialized.distance = true
      gt._initialized.gaze = false
      gt._running.distance = true
      gt._runningVideo = true

      const result = withMockedWebgazerEnd(gt, () =>
        gt.end('distance', false, true),
      )

      assert.equal(result.initialized.distance, false)
      assert.equal(result.running.distance, false)
      assert.equal(result.runningVideo, true)
      // webgazer.end(true) would stop the camera tracks and remove the
      // video container — the recalibration re-track would freeze.
      assert.deepEqual(result.endCalls, [])
    })

    it('full teardown (no preserveVideo): kills camera as before', function () {
      const gt = RC.gazeTracker
      gt._initialized.distance = true
      gt._initialized.gaze = false
      gt._running.distance = true
      gt._runningVideo = true

      const result = withMockedWebgazerEnd(gt, () =>
        gt.end('distance', false, false),
      )

      // Pre-existing contract: with no gaze session, ending distance ends
      // everything, including the camera.
      assert.equal(result.initialized.distance, false)
      assert.equal(result.running.distance, false)
      assert.equal(result.runningVideo, false)
      assert.deepEqual(result.endCalls, [true])
    })
  })
})

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const RC = require('../src/index').default
const {
  beginDistanceCalibrationAttempt,
  blockDistanceCalibrationAttempt,
  completeDistanceCalibrationAttempt,
  createDistanceCalibrationMediaTracker,
  observeDistanceCalibrationPage,
  recordDistanceCalibrationMeasurement,
  restoreDistanceCalibrationCameraPage,
  settleDistanceCalibrationAttempt,
  updateDistanceCalibrationAttempt,
} = require('../src/distance/object/distanceCalibrationAttempt')
const {
  createMeasurementSaveQueue,
} = require('../src/distance/object/measurementSaveQueue')

const srcOf = file =>
  fs.readFileSync(path.join(__dirname, '../src', file), 'utf8')

const measurement = (locEye, extra = {}) => ({
  locEye,
  location: locEye,
  locationIndex: 0,
  meshSamples: [1, 2, 3, 4],
  factorCmPx: 100,
  fOverWidth: 0.9,
  cameraResolution: [640, 480],
  ...extra,
})

const bulkArgs = (rc, overrides = {}) => ({
  RC: rc,
  options: {},
  ppi: 96,
  firstMeasurementCm: 30,
  isPaperSelectionModeBool: true,
  selectedPaperLabel: 'A4',
  paperSelectionOptions: [{ key: 'a4', label: 'A4' }],
  selectedPaperOption: 'a4',
  paperSuggestionValue: null,
  getOffsetPx: () => 0,
  getGlobalPointForLocation: () => [0, 0],
  processMeshDataAndCalculateNearestPoints: async () => ({
    nearestPointsData: {},
    currentIPDDistance: 200,
    ipdXYZVpx: 200,
    headRotation: {},
  }),
  createMeasurementObject: () => ({ snapshotAcceptedBool: true }),
  saveCalibrationMeasurements: () => {},
  commonData: {},
  ...overrides,
})

describe('Distance calibration attempt telemetry', () => {
  it('records accepted, rejected, and retroactively rejected measurements without mesh payloads', () => {
    const rc = Object.create(RC)
    beginDistanceCalibrationAttempt(rc, { mode: 'paper' })
    const changes = []
    const queue = createMeasurementSaveQueue({
      onChange: change => {
        changes.push(change)
        recordDistanceCalibrationMeasurement(rc, change)
      },
    })

    queue.pushAccepted(measurement('nearCamera'))
    queue.pushRejected(
      measurement('nearCameraOffsetRight', {
        rejectionReason: 'focal-length-mismatch',
        focalRatioPct: 114,
        allowedRatioPct: [93, 107],
      }),
    )
    queue.retroactivelyRejectPrevious()

    const snapshot = rc.getDistanceCalibrationAttempt()
    assert.equal(snapshot.version, 1)
    assert.equal(snapshot.mode, 'paper')
    assert.equal(snapshot.attemptsCount, 2)
    assert.equal(snapshot.acceptedCount, 0)
    assert.equal(snapshot.rejectedCount, 2)
    assert.equal(snapshot.lastAttempt.accepted, false)
    assert.equal(snapshot.lastRejectionReason, 'focal-length-mismatch')
    assert.equal(snapshot.lastSuccessfulCheckpoint.locEye, 'nearCamera')
    assert.deepEqual(
      changes.map(change => change.type),
      ['accepted', 'rejected', 'retroactive-rejection'],
    )
    assert.equal(snapshot.events.length, 3)
    assert.doesNotThrow(() => JSON.stringify(snapshot))
    assert.equal(JSON.stringify(snapshot).includes('meshSamples'), false)

    snapshot.currentLocation.locEye = 'consumer mutation'
    assert.equal(
      rc.getDistanceCalibrationAttempt().currentLocation.locEye,
      'nearCameraOffsetRight',
    )
  })

  it('tracks paper, tube, and measurement pages and the last rendered checkpoint', async () => {
    const rc = Object.create(RC)
    beginDistanceCalibrationAttempt(rc, { mode: 'paper' })
    const location = {
      index: 0,
      locEye: 'nearCamera',
      location: 'nearCamera',
    }
    const render = async () => {}
    await observeDistanceCalibrationPage(rc, 2, {
      isPaperSelectionMode: true,
      getCurrentLocation: () => location,
      render,
    })
    assert.equal(rc.getDistanceCalibrationAttempt().phase, 'paper-selection')
    await observeDistanceCalibrationPage(rc, 'tubeCheck', {
      isPaperSelectionMode: true,
      getCurrentLocation: () => location,
      render,
    })
    assert.equal(rc.getDistanceCalibrationAttempt().phase, 'tube-check')
    await observeDistanceCalibrationPage(rc, 3, {
      isPaperSelectionMode: true,
      getCurrentLocation: () => location,
      render,
    })

    const snapshot = rc.getDistanceCalibrationAttempt()
    assert.equal(snapshot.phase, 'measurement')
    assert.equal(snapshot.currentLocation.locEye, 'nearCamera')
    assert.equal(snapshot.lastSuccessfulCheckpoint.phase, 'measurement')
    assert.equal(snapshot.lastSuccessfulCheckpoint.locEye, 'nearCamera')
    assert.ok(snapshot.startedAt)
    assert.ok(snapshot.lastProgressAt)
    assert.ok(Number.isFinite(snapshot.secSinceLastProgress))
  })

  it('samples camera track/model state and settles only once', () => {
    const rc = Object.create(RC)
    const track = { readyState: 'ended' }
    const video = document.createElement('video')
    video.srcObject = {
      active: false,
      getVideoTracks: () => [track],
    }
    const container = document.createElement('div')
    container.id = 'webgazerVideoContainer'
    container.appendChild(video)
    document.body.appendChild(container)
    rc.gazeTracker = {
      isCameraDisconnected: () => true,
      webgazer: { getTracker: () => ({ modelLoaded: false }) },
    }

    beginDistanceCalibrationAttempt(rc, { mode: 'paper' })
    updateDistanceCalibrationAttempt(rc, { phase: 'camera-recovery' })
    settleDistanceCalibrationAttempt(rc, 'cancelled', 'interaction-ended')
    settleDistanceCalibrationAttempt(rc, 'completed')

    const snapshot = rc.getDistanceCalibrationAttempt()
    assert.equal(snapshot.phase, 'camera-recovery')
    assert.deepEqual(snapshot.outcome, {
      type: 'cancelled',
      reason: 'interaction-ended',
    })
    assert.equal(snapshot.camera.disconnected, true)
    assert.equal(snapshot.camera.streamActive, false)
    assert.equal(snapshot.camera.trackReadyState, 'ended')
    assert.equal(snapshot.camera.modelLoaded, false)
    container.remove()
  })

  it('retains the last live camera state after RC teardown', () => {
    const rc = Object.create(RC)
    const track = { readyState: 'live' }
    const video = document.createElement('video')
    video.srcObject = {
      active: true,
      getVideoTracks: () => [track],
    }
    const container = document.createElement('div')
    container.id = 'webgazerVideoContainer'
    container.appendChild(video)
    document.body.appendChild(container)
    rc.gazeTracker = {
      isCameraDisconnected: () => false,
      webgazer: { getTracker: () => ({ modelLoaded: true }) },
    }

    beginDistanceCalibrationAttempt(rc, { mode: 'paper' })
    updateDistanceCalibrationAttempt(rc, { phase: 'measurement' })
    video.srcObject = null

    const snapshot = rc.getDistanceCalibrationAttempt()
    assert.equal(snapshot.camera.streamActive, true)
    assert.equal(snapshot.camera.trackReadyState, 'live')
    assert.equal(snapshot.camera.modelLoaded, true)
    container.remove()
  })

  it('settles a failed later page transition instead of leaving the attempt active', async () => {
    const rc = Object.create(RC)
    beginDistanceCalibrationAttempt(rc, { mode: 'paper' })
    await assert.rejects(
      observeDistanceCalibrationPage(rc, 3, {
        isPaperSelectionMode: true,
        render: async () => {
          throw new Error('renderer failed')
        },
      }),
      /renderer failed/,
    )
    assert.deepEqual(rc.getDistanceCalibrationAttempt().outcome, {
      type: 'failed',
      reason: 'renderer failed',
    })
  })

  it('preserves the prior attempt outcome across a recalibration restart', () => {
    const rc = Object.create(RC)
    beginDistanceCalibrationAttempt(rc, { mode: 'paper' })
    blockDistanceCalibrationAttempt(rc, 'face-samples-invalid', {
      validSampleCount: 2,
      requiredSampleCount: 5,
    })
    settleDistanceCalibrationAttempt(rc, 'cancelled', 'recalibrate')

    // A recalibration restart re-enters objectTestNew, which begins a fresh
    // attempt. The struggled run's outcome must survive as history.
    beginDistanceCalibrationAttempt(rc, { mode: 'paper' })

    const snapshot = rc.getDistanceCalibrationAttempt()
    assert.deepEqual(snapshot.previousOutcomes, [
      { type: 'cancelled', reason: 'recalibrate' },
    ])
    assert.equal(snapshot.outcome, null)
  })

  it('records blockers and expected paper context', () => {
    const rc = Object.create(RC)
    beginDistanceCalibrationAttempt(rc, {
      mode: 'paper',
      expectedLocationCount: 4,
      selectedPaperOption: 'a4',
      selectedPaperLengthCm: 29.7,
      matchHalfLengthBool: false,
    })
    blockDistanceCalibrationAttempt(rc, 'face-samples-invalid', {
      validSampleCount: 2,
      requiredSampleCount: 5,
    })

    const snapshot = rc.getDistanceCalibrationAttempt()
    assert.equal(snapshot.expectedLocationCount, 4)
    assert.equal(snapshot.selectedPaperOption, 'a4')
    assert.equal(snapshot.selectedPaperLengthCm, 29.7)
    assert.equal(snapshot.matchHalfLengthBool, false)
    assert.equal(snapshot.lastBlockedReason, 'face-samples-invalid')
    assert.equal(snapshot.events.at(-1).validSampleCount, 2)
    assert.equal(snapshot.events.at(-1).requiredSampleCount, 5)
  })

  it('counts repeated identical blocks instead of hiding them', () => {
    const rc = Object.create(RC)
    beginDistanceCalibrationAttempt(rc, { mode: 'paper' })
    blockDistanceCalibrationAttempt(rc, 'tube-not-adjusted')
    blockDistanceCalibrationAttempt(rc, 'tube-not-adjusted')
    blockDistanceCalibrationAttempt(rc, 'tube-not-adjusted')

    const snapshot = rc.getDistanceCalibrationAttempt()
    const blocks = snapshot.events.filter(e => e.type === 'blocked')
    assert.equal(blocks.length, 1)
    assert.equal(blocks[0].repeatCount, 3)
    assert.equal(snapshot.lastBlockedReason, 'tube-not-adjusted')
  })

  it('reports bulk persistence failure instead of false completion', async () => {
    const rc = Object.create(RC)
    beginDistanceCalibrationAttempt(rc, { mode: 'paper' })
    const queue = createMeasurementSaveQueue({
      onChange: change => recordDistanceCalibrationMeasurement(rc, change),
    })
    queue.pushAccepted(measurement('nearCamera'))

    await queue.processBulkSave(
      bulkArgs(rc, {
        processMeshDataAndCalculateNearestPoints: async () => {
          throw new Error('mesh processing failed')
        },
      }),
    )

    const snapshot = rc.getDistanceCalibrationAttempt()
    assert.equal(snapshot.persistence.status, 'failed')
    assert.equal(snapshot.outcome.type, 'failed')
    assert.equal(snapshot.outcome.reason, 'mesh processing failed')
  })

  it('a persistence failure keeps phase non-completed when the finish flow still runs', async () => {
    const rc = Object.create(RC)
    beginDistanceCalibrationAttempt(rc, { mode: 'paper' })
    const queue = createMeasurementSaveQueue({
      onChange: change => recordDistanceCalibrationMeasurement(rc, change),
    })
    queue.pushAccepted(measurement('nearCamera'))
    await queue.processBulkSave(
      bulkArgs(rc, {
        processMeshDataAndCalculateNearestPoints: async () => {
          throw new Error('mesh processing failed')
        },
      }),
    )

    completeDistanceCalibrationAttempt(rc)

    const snapshot = rc.getDistanceCalibrationAttempt()
    assert.equal(snapshot.outcome.type, 'failed')
    assert.notEqual(snapshot.phase, 'completed')
  })

  it('records bulk persistence counts after a successful save', async () => {
    const rc = Object.create(RC)
    beginDistanceCalibrationAttempt(rc, { mode: 'paper' })
    const queue = createMeasurementSaveQueue({
      onChange: change => recordDistanceCalibrationMeasurement(rc, change),
    })
    queue.pushAccepted(measurement('nearCamera'))

    await queue.processBulkSave(bulkArgs(rc))

    const snapshot = rc.getDistanceCalibrationAttempt()
    assert.deepEqual(snapshot.persistence, {
      status: 'succeeded',
      acceptedCount: 1,
      rejectedCount: 0,
      totalCount: 1,
      error: null,
    })
  })

  it('tracks media completion and sanitized fetch errors', () => {
    const rc = Object.create(RC)
    beginDistanceCalibrationAttempt(rc, { mode: 'paper' })
    const media = createDistanceCalibrationMediaTracker(rc, 2)
    media.succeeded()
    media.failed('paper-instruction.png', new Error('404'))

    const snapshot = rc.getDistanceCalibrationAttempt()
    assert.equal(snapshot.media.completed, 2)
    assert.equal(snapshot.media.total, 2)
    assert.equal(snapshot.media.errors.length, 1)
    assert.equal(snapshot.media.errors[0].id, 'paper-instruction.png')
    assert.equal(snapshot.media.errors[0].message, '404')
    assert.equal(snapshot.lastBlockedReason, 'media-fetch-failed')
  })

  it('settles camera recovery only after rendering succeeds', async () => {
    const rc = Object.create(RC)
    beginDistanceCalibrationAttempt(rc, { mode: 'paper' })
    updateDistanceCalibrationAttempt(rc, { phase: 'camera-recovery' })
    let render
    const pending = restoreDistanceCalibrationCameraPage(rc, {
      currentPage: 3,
      isPaperSelectionMode: true,
      currentLocation: {
        index: 0,
        locEye: 'nearCamera',
        location: 'nearCamera',
      },
      render: () => new Promise(resolve => (render = resolve)),
    })
    assert.equal(rc.getDistanceCalibrationAttempt().outcome, null)
    render()
    await pending

    const snapshot = rc.getDistanceCalibrationAttempt()
    assert.equal(snapshot.phase, 'measurement')
    assert.equal(snapshot.lastSuccessfulCheckpoint.phase, 'measurement')
    assert.equal(snapshot.events.at(-1).type, 'camera-reconnected')

    beginDistanceCalibrationAttempt(rc, { mode: 'paper' })
    await restoreDistanceCalibrationCameraPage(rc, {
      currentPage: 3,
      isPaperSelectionMode: true,
      render: async () => {
        throw new Error('recovery render failed')
      },
    })
    assert.equal(rc.getDistanceCalibrationAttempt().outcome.type, 'failed')
    assert.equal(
      rc.getDistanceCalibrationAttempt().outcome.reason,
      'recovery render failed',
    )
  })

  it('observes nextPage transitions inside the page controller, not only public showPage calls', () => {
    const source = srcOf('distance/object/pageController.js')
    assert.match(source, /observeDistanceCalibrationPage\(/)
    const observation = source.indexOf('observeDistanceCalibrationPage(')
    const nextPage = source.indexOf('const nextPage')
    assert.ok(observation >= 0)
    assert.ok(nextPage > observation)
  })

  it('observer failures cannot interrupt measurement collection', () => {
    const queue = createMeasurementSaveQueue({
      onChange: () => {
        throw new Error('telemetry failed')
      },
    })
    assert.doesNotThrow(() => queue.pushAccepted(measurement('nearCamera')))
    assert.equal(queue.length, 1)
  })

  it('wires attempt state into orchestration, recovery, and rejection reasons', () => {
    const orchestrator = srcOf('distance/object/objectTestOrchestrator.js')
    const pageController = srcOf('distance/object/pageController.js')
    const space = srcOf('distance/object/spaceKeyHandler.js')
    assert.match(
      pageController,
      /observeDistanceCalibrationPage\(RC, pageNumber/,
    )
    assert.match(pageController, /paper-selection-required/)
    assert.match(pageController, /selectedPaperOption/)
    assert.match(pageController, /selectedPaperLengthCm/)
    assert.match(pageController, /matchHalfLengthBool/)
    assert.match(
      orchestrator,
      /createDistanceCalibrationMediaTracker\(\s*RC,\s*total/,
    )
    assert.match(orchestrator, /restoreDistanceCalibrationCameraPage\(\s*RC/)
    assert.match(space, /face-samples-invalid/)
    assert.match(space, /tube-not-adjusted/)
    assert.match(space, /invalid-expected-length/)
    assert.match(
      space,
      /updateDistanceCalibrationAttempt\(\s*RC,\s*\{\s*matchHalfLengthBool/,
    )
    assert.match(orchestrator, /onDisconnect:[\s\S]*?camera-recovery/)
    assert.match(orchestrator, /completeDistanceCalibrationAttempt\(\s*RC/)
    assert.match(space, /rejectionReason: 'focal-length-mismatch'/)
  })
})

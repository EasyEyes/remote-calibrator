const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const RC = require('../src/index').default
const { createInteractionLifecycle } = require('../src/interactionLifecycle')
const { phrases } = require('../src/i18n/schema')
const {
  beginCameraAttempt,
  cameraFailureReason,
  recordCameraAttemptEvent,
  recordCameraSelection,
  updateCameraAttempt,
} = require('../src/cameraAttempt')

const srcOf = file =>
  fs.readFileSync(path.join(__dirname, '../src', file), 'utf8')

describe('Camera attempt record', () => {
  it('owns the complete current attempt and returns an immutable, serializable snapshot', () => {
    const rc = Object.create(RC)
    beginCameraAttempt(rc)
    updateCameraAttempt(rc, {
      phase: 'choosing-camera',
      permission: 'granted',
      timings: { cameraFindSec: 1.25 },
      cameras: [
        {
          label: 'HP True Vision FHD Camera',
          incorporation: 'built-in',
          builtInScore: 7,
          externalScore: 1,
          likelyBuiltIn: 6,
          deviceId: 'must-not-be-exported',
        },
      ],
      eligibleCameras: [
        {
          label: 'HP True Vision FHD Camera',
          incorporation: 'built-in',
          deviceId: 'must-not-be-exported',
        },
      ],
      selectedCamera: {
        label: 'HP True Vision FHD Camera',
        incorporation: 'built-in',
        deviceId: 'must-not-be-exported',
      },
    })

    rc.selectedCamera = {
      label: 'HP True Vision FHD Camera',
      incorporation: 'built-in',
    }
    const snapshot = rc.getCameraAttempt()
    assert.equal(snapshot.phase, 'choosing-camera')
    assert.equal(snapshot.permission, 'granted')
    assert.equal(snapshot.timings.cameraFindSec, 1.25)
    assert.equal(snapshot.cameras[0].name, 'HP True Vision FHD Camera')
    assert.equal(snapshot.cameras[0].class, 'built-in')
    assert.equal(snapshot.eligibleCameras.length, 1)
    assert.equal(snapshot.selectedCamera.name, 'HP True Vision FHD Camera')
    assert.equal(snapshot.cameras[0].deviceId, undefined)
    assert.equal(snapshot.selectedCamera.deviceId, undefined)
    assert.ok(snapshot.startedAt)
    assert.ok(snapshot.lastProgressAt)
    assert.doesNotThrow(() => JSON.stringify(snapshot))

    snapshot.cameras[0].name = 'mutated by consumer'
    snapshot.phase = 'mutated by consumer'
    assert.equal(
      rc.getCameraAttempt().cameras[0].name,
      'HP True Vision FHD Camera',
    )
    assert.equal(rc.getCameraAttempt().phase, 'choosing-camera')
  })

  it('retains failure → retry → success history without changing the final outcome', () => {
    const rc = Object.create(RC)
    beginCameraAttempt(rc)
    updateCameraAttempt(rc, {
      phase: 'failed',
      outcome: { type: 'failed', reason: 'permission-denied' },
    })
    recordCameraAttemptEvent(rc, 'startup-failed', {
      reason: 'permission-denied',
    })
    updateCameraAttempt(rc, {
      phase: 'choosing-camera',
      outcome: null,
    })
    recordCameraAttemptEvent(rc, 'retry')
    updateCameraAttempt(rc, {
      phase: 'completed',
      outcome: { type: 'selected', reason: null },
    })

    const snapshot = rc.getCameraAttempt()
    assert.deepEqual(
      snapshot.events.map(event => event.type),
      ['startup-failed', 'retry'],
    )
    assert.equal(snapshot.events[0].reason, 'permission-denied')
    assert.deepEqual(snapshot.outcome, { type: 'selected', reason: null })
  })

  it('classifies nested permission and timeout failures for analysis', () => {
    assert.equal(
      cameraFailureReason({
        name: 'CameraSessionError',
        cause: { name: 'NotAllowedError', message: 'Permission denied' },
      }),
      'permission-denied',
    )
    assert.equal(
      cameraFailureReason({ name: 'CameraSessionError', phase: 'timeout' }),
      'camera-startup-timeout',
    )
  })

  it('retains failure history across a real selectCamera retry', () => {
    const rc = Object.create(RC)
    beginCameraAttempt(rc)
    updateCameraAttempt(rc, {
      phase: 'failed',
      outcome: { type: 'failed', reason: 'permission-denied' },
    })
    recordCameraAttemptEvent(rc, 'startup-failed', {
      reason: 'permission-denied',
    })

    // Public selectCamera begins again on each non-cached invocation.
    beginCameraAttempt(rc)
    updateCameraAttempt(rc, {
      phase: 'completed',
      outcome: { type: 'selected', reason: null },
    })

    const snapshot = rc.getCameraAttempt()
    assert.deepEqual(snapshot.previousOutcomes, [
      { type: 'failed', reason: 'permission-denied' },
    ])
    assert.equal(snapshot.events[0].type, 'startup-failed')
    assert.deepEqual(snapshot.outcome, { type: 'selected', reason: null })
  })

  it('uses canonical RC.selectedCamera after an uninstrumented reset', () => {
    const rc = Object.create(RC)
    beginCameraAttempt(rc)
    const committed = {
      label: 'HP True Vision FHD Camera',
      incorporation: 'built-in',
    }
    rc.selectedCamera = committed
    recordCameraSelection(rc, committed)

    // Several recovery/quit paths clear RC.selectedCamera directly.
    rc.selectedCamera = null

    assert.equal(rc.getCameraAttempt().selectedCamera, null)
  })

  it('classifies string permission rejections as well as Error objects', () => {
    assert.equal(
      cameraFailureReason('NotAllowedError: Permission denied'),
      'permission-denied',
    )
  })

  it('selection after a failed startup proves permission is granted', () => {
    const rc = Object.create(RC)
    beginCameraAttempt(rc)
    updateCameraAttempt(rc, { permission: 'checked' })

    recordCameraSelection(rc, {
      label: 'HP True Vision FHD Camera',
      incorporation: 'built-in',
    })

    assert.equal(rc.getCameraAttempt().permission, 'granted')
  })

  it('keeps a startup permission failure when the later no-camera UI settles', async () => {
    const rc = Object.create(RC)
    Object.defineProperties(rc, {
      L: { value: 'en' },
      LD: { value: 'ltr' },
      isMobile: { value: { value: false } },
    })
    rc._interactionLifecycle = createInteractionLifecycle()
    rc.checkInitialized = () => true
    rc._cameraSelectionDone = false
    rc.getFullscreen = async () => {}
    rc._background = { element: null }
    rc._addBackground = () => {}
    rc._removeBackground = () => {}
    rc.showVideo = () => {}
    rc.gazeTracker = {
      checkInitialized: () => true,
      startCameraSession: async () => {
        const error = new Error('Camera permission was denied')
        error.name = 'NotAllowedError'
        throw error
      },
      webgazer: { cameraTiming: {} },
    }
    const Swal = require('sweetalert2').default || require('sweetalert2')
    const originalFire = Swal.fire
    Swal.fire = options => {
      options.didDestroy?.()
      const promise = Promise.resolve({ isConfirmed: false })
      return { then: onFulfilled => promise.then(onFulfilled) }
    }
    const previousPhrases = new Map()
    for (const key of [
      'RC_requestCamera',
      'RC_privacyCamera',
      'RC_starting',
      'RC_CameraPrivacyAssurance',
      'RC_CameraNotFound',
      'RC_TryAgain',
      'RC_OK',
      'T_proceed',
    ]) {
      previousPhrases.set(key, phrases[key])
      phrases[key] = { en: key }
    }
    try {
      await rc.selectCamera()
      const attempt = rc.getCameraAttempt()
      assert.equal(attempt.outcome.reason, 'permission-denied')
      assert.equal(attempt.permission, 'denied')
    } finally {
      Swal.fire = originalFire
      for (const [key, value] of previousPhrases) {
        if (value === undefined) delete phrases[key]
        else phrases[key] = value
      }
    }
  })

  it('exposes the live permission phase while selectCamera is unresolved', async () => {
    const rc = Object.create(RC)
    Object.defineProperties(rc, {
      L: { value: 'en' },
      LD: { value: 'ltr' },
    })
    rc._interactionLifecycle = createInteractionLifecycle()
    rc.checkInitialized = () => true
    rc._cameraSelectionDone = false
    rc.getFullscreen = async () => {}
    rc.gazeTracker = { checkInitialized: () => true }
    const previousPermissions = Object.getOwnPropertyDescriptor(
      navigator,
      'permissions',
    )
    const previousPhrases = new Map()
    for (const key of ['RC_requestCamera', 'RC_privacyCamera']) {
      previousPhrases.set(key, phrases[key])
      phrases[key] = { en: key }
    }
    Object.defineProperty(navigator, 'permissions', {
      configurable: true,
      value: { query: () => new Promise(() => {}) },
    })
    try {
      const waiting = rc.selectCamera()
      await new Promise(resolve => setImmediate(resolve))
      assert.equal(rc.getCameraAttempt().phase, 'permission')
      assert.equal(rc.getCameraAttempt().permission, 'requesting')
      assert.equal(rc.getCameraAttempt().outcome, null)
      rc._cleanupAllRC()
      await waiting
    } finally {
      if (previousPermissions)
        Object.defineProperty(navigator, 'permissions', previousPermissions)
      else navigator.permissions = undefined
      for (const [key, value] of previousPhrases) {
        if (value === undefined) delete phrases[key]
        else phrases[key] = value
      }
    }
  })

  it('camera timing updates reach the same attempt record', () => {
    const { logCameraFindResults } = require('../src/cameraFindTiming.js')
    const rc = Object.create(RC)
    beginCameraAttempt(rc)
    rc.cameraFindTiming = { cameraFindSec: 2.5, cameraPermissionSec: 0.4 }

    logCameraFindResults(rc)

    assert.deepEqual(rc.getCameraAttempt().timings, {
      cameraFindSec: 2.5,
      cameraPermissionSec: 0.4,
    })
  })

  it('matches the versioned cross-repository camera-attempt fixture', () => {
    const XLSX = require('xlsx')
    const csv = fs.readFileSync(
      path.join(__dirname, '../test/fixtures/camera-attempt-v1.csv'),
      'utf8',
    )
    const [row] = XLSX.utils.sheet_to_json(
      XLSX.read(csv, { type: 'string' }).Sheets.Sheet1,
    )
    const expected = JSON.parse(row.cameraAttemptJSON)
    const rc = Object.create(RC)
    beginCameraAttempt(rc)
    updateCameraAttempt(rc, {
      phase: expected.phase,
      permission: expected.permission,
      timings: expected.timings,
      cameras: expected.cameras,
      eligibleCameras: expected.eligibleCameras,
      selectedCamera: null,
      outcome: expected.outcome,
    })
    recordCameraAttemptEvent(rc, 'permission')
    const actual = rc.getCameraAttempt()

    assert.equal(actual.version, expected.version)
    assert.equal(actual.phase, expected.phase)
    assert.equal(actual.permission, expected.permission)
    assert.deepEqual(actual.timings, expected.timings)
    assert.deepEqual(actual.cameras, expected.cameras)
    assert.deepEqual(actual.eligibleCameras, expected.eligibleCameras)
    assert.equal(actual.selectedCamera, expected.selectedCamera)
    assert.equal(actual.outcome, expected.outcome)
    assert.deepEqual(actual.previousOutcomes, expected.previousOutcomes)
    assert.equal(actual.events[0].type, expected.events[0].type)
  })

  it('selectCamera records permission, startup, and final outcome', () => {
    const src = srcOf('cameraSelection.js')
    assert.match(src, /beginCameraAttempt\(this\)/)
    assert.match(src, /phase: 'permission'/)
    assert.match(src, /phase: 'camera-startup'/)
    assert.match(src, /updateCameraAttempt\(this,[\s\S]*?outcome/)
  })

  it('the chooser records all and eligible cameras, selection, and no-camera reason', () => {
    const src = srcOf('components/popup.js')
    assert.match(src, /recordCameraChoices\(RC, allCameras, cameras\)/)
    assert.match(src, /recordCameraChoices\(RC, newCamerasAll, newCameras\)/)
    assert.match(src, /recordCameraSelection\(RC, committed\)/)
    assert.match(src, /recordCameraUnavailable\(\s*RC,/)
  })
})

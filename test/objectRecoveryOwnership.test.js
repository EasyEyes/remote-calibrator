const assert = require('node:assert/strict')
const { subscribeCameraRecovery } = require('../src/cameraRecoveryScope')
const {
  finishObjectTest,
  cleanupAllResources,
  breakAndRestart,
} = require('../src/distance/object/objectTestFinish')
const Swal = require('sweetalert2').default || require('sweetalert2')

function fixture() {
  const disconnect = new Set()
  const reconnect = new Set()
  const staleCallbacks = {}
  const metrics = { rendered: 0, rolledBack: 0, attached: 0, detached: 0 }
  const video = document.createElement('div')
  video.id = 'webgazerVideoContainer'
  video.style.display = 'none'
  document.body.appendChild(video)
  const tracker = {
    checkInitialized: () => true,
    onCameraDisconnected: fn => {
      disconnect.add(fn)
      staleCallbacks.disconnect = fn
      return () => disconnect.delete(fn)
    },
    onCameraReconnected: fn => {
      reconnect.add(fn)
      staleCallbacks.reconnect = fn
      return () => reconnect.delete(fn)
    },
  }
  const release = subscribeCameraRecovery(tracker, {
    onDisconnect: () => {
      metrics.detached++
    },
    onReconnect: () => {
      metrics.rolledBack++
      metrics.rendered++
      video.style.display = 'block'
      if (!document.getElementById('rc-big-circle-target')) {
        const circle = document.createElement('div')
        circle.id = 'rc-big-circle-target'
        document.body.appendChild(circle)
      }
      metrics.attached++
    },
    onRelease: () => {
      metrics.detached++
    },
  })
  const removeCircle = () =>
    document.getElementById('rc-big-circle-target')?.remove()
  const RC = {
    gazeTracker: tracker,
    L: 'en',
    LD: 'ltr',
    _CONST: { COLOR: { ORANGE: '#f80' } },
    page3FactorCmPx: 6000,
    page4FactorCmPx: 6000,
    calibrationFOverWidth: 1,
    _removeBackground: () => {},
  }
  const context = {
    RC,
    _releaseCameraRecovery: release,
    objectTestHasFinishedRef: { value: false },
    options: { calibrateDistanceCheckBool: false, useObjectTestData: 'object' },
    leftLabel: { container: document.createElement('div') },
    rightLabel: { container: document.createElement('div') },
    clearMeasurementOverlay: () => {},
    removeBigCircle: removeCircle,
    removeArrowIndicatorsFromDOM: () => {},
    firstMeasurement: 30,
    startX: 0,
    startY: 0,
    endX: 300,
    endY: 0,
    screenWidth: 1000,
    ppi: 96,
    pxPerMm: 4,
    isPaperSelectionMode: false,
    intraocularDistanceCm: 6.3,
    faceMeshSamplesPage3: [200],
    faceMeshSamplesPage4: [200],
    tape: { helpers: { getDistance: () => 300 } },
    toFixedNumber: (number, digits) => Number(number.toFixed(digits)),
  }
  return {
    context,
    metrics,
    video,
    disconnect,
    reconnect,
    staleCallbacks,
    release,
    recover: () => {
      for (const fn of [...disconnect]) fn()
      for (const fn of [...reconnect]) fn()
    },
    cleanup: () => {
      release()
      video.remove()
      removeCircle()
    },
  }
}

describe('Object measurement recovery ownership', () => {
  const { phrases } = require('../src/i18n/schema')
  const savedPhrases = new Map()
  before(() => {
    for (const key of ['T_proceed', 'RC_PutYourGlassesBackOn']) {
      savedPhrases.set(key, phrases[key])
      phrases[key] = { en: key }
    }
  })
  after(() => {
    for (const [key, value] of savedPhrases) {
      if (value === undefined) delete phrases[key]
      else phrases[key] = value
    }
  })

  it('still restores an active measurement exactly once per disconnect', () => {
    const f = fixture()
    try {
      f.staleCallbacks.reconnect()
      assert.equal(f.metrics.rendered, 0)
      f.recover()
      f.staleCallbacks.reconnect()
      assert.equal(f.metrics.rendered, 1)
      assert.equal(f.metrics.rolledBack, 1)
      assert.equal(f.metrics.attached, 1)
      assert.equal(f.video.style.display, 'block')
      assert.ok(document.getElementById('rc-big-circle-target'))
    } finally {
      f.cleanup()
    }
  })

  it('finishing revokes measurement recovery before the glasses reminder and later study', async () => {
    const f = fixture()
    const originalFire = Swal.fire
    const originalLog = console.log
    let proceed,
      popupOptions,
      finished = 0
    f.context.callback = () => {
      finished++
    }
    Swal.fire = options => {
      popupOptions = options
      return new Promise(resolve => {
        proceed = () => {
          options.didDestroy?.()
          resolve({ isConfirmed: true })
        }
      })
    }
    console.log = () => {}
    try {
      // Also cover a disconnect already in flight when the measurement ends.
      f.staleCallbacks.disconnect()
      const completing = finishObjectTest(f.context)
      assert.ok(
        popupOptions?.title,
        'the real finish flow reaches the reminder',
      )
      assert.equal(finished, 0, 'reminder must still await Proceed')
      assert.equal(f.disconnect.size, 0)
      assert.equal(f.reconnect.size, 0)
      f.recover()
      // A callback queued before unsubscribe must also be harmless.
      f.staleCallbacks.reconnect()
      f.staleCallbacks.disconnect()
      f.staleCallbacks.reconnect()
      assert.equal(f.metrics.rendered, 0)
      assert.equal(f.metrics.rolledBack, 0)
      assert.equal(f.metrics.attached, 0)
      assert.equal(f.video.style.display, 'none')
      assert.equal(document.getElementById('rc-big-circle-target'), null)
      assert.equal(finished, 0)
      proceed()
      await completing
      assert.equal(finished, 1)
      f.recover()
      assert.equal(f.metrics.rendered, 0)
      assert.equal(f.video.style.display, 'none')
      assert.equal(document.getElementById('rc-big-circle-target'), null)
    } finally {
      Swal.fire = originalFire
      console.log = originalLog
      f.cleanup()
    }
  })

  for (const action of ['cancel', 'restart']) {
    it(`${action} releases the old page before another step can recover`, () => {
      const f = fixture()
      try {
        f.staleCallbacks.disconnect()
        if (action === 'cancel') cleanupAllResources(f.context)
        else {
          let restarted = false
          breakAndRestart(f.context, () => {
            restarted = true
            f.staleCallbacks.reconnect()
            assert.equal(f.metrics.rendered, 0)
          })
          assert.equal(restarted, true)
        }
        f.staleCallbacks.reconnect()
        assert.equal(f.metrics.rendered, 0)
        assert.equal(f.disconnect.size, 0)
        assert.equal(f.reconnect.size, 0)
        const detached = f.metrics.detached
        f.release()
        assert.equal(f.metrics.detached, detached, 'release is idempotent')
      } finally {
        f.cleanup()
      }
    })
  }
})

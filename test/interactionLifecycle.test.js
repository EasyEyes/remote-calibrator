const assert = require('node:assert')
const {
  createInteractionLifecycle,
  observeDialog,
} = require('../src/interactionLifecycle')
const {
  createRecoveryLifecycle,
} = require('../src/WebGazer4RC/src/recoveryLifecycle.mjs')

describe('RC interaction lifecycle contract', () => {
  it('starts with explicit partial coverage and delivers an immutable current snapshot', () => {
    const lifecycle = createInteractionLifecycle()
    const id = lifecycle.beginScope('choose-camera')
    const received = []
    lifecycle.subscribe((state, event) => received.push({ state, event }))
    assert.equal(received.length, 1)
    assert.equal(received[0].event, null)
    assert.equal(received[0].state.version, 1)
    assert.equal(received[0].state.coverage, 'partial')
    assert.equal(received[0].state.scopes[0].id, id)
    assert.ok(Object.isFrozen(received[0].state.scopes[0]))
    assert.ok(Object.isFrozen(received[0].state.scopes))
    assert.ok(Object.isFrozen(received[0].state))
  })

  it('retains a finishing parent until its dialog cleanup completes', () => {
    const lifecycle = createInteractionLifecycle()
    const events = []
    lifecycle.subscribe((_, event) => {
      if (event) events.push(event)
    })
    const panel = lifecycle.beginScope('calibration-panel')
    const glasses = lifecycle.beginScope('glasses-reminder', panel)
    lifecycle.endScope(panel)
    assert.equal(lifecycle.getSnapshot().scopes[0].phase, 'settling')
    lifecycle.endScope(glasses)
    assert.deepEqual(lifecycle.getSnapshot().scopes, [])
    assert.deepEqual(
      events.filter(e => e.type === 'scope.end').map(e => e.id),
      [glasses, panel],
    )
  })

  it('repeated or late completions cannot release a newer interaction', () => {
    const lifecycle = createInteractionLifecycle()
    const first = lifecycle.beginScope('choose-camera')
    lifecycle.endScope(first, 'cancelled')
    const second = lifecycle.beginScope('choose-camera')
    const before = lifecycle.getSnapshot()
    lifecycle.endScope(first, 'completed')
    assert.strictEqual(lifecycle.getSnapshot(), before)
    assert.equal(before.scopes[0].id, second)
  })

  it('keeps recovery, page ownership and intentional fullscreen operations separate', () => {
    const lifecycle = createInteractionLifecycle()
    const page = lifecycle.beginScope('calibration-panel')
    const recovery = lifecycle.beginRecovery()
    const first = lifecycle.beginFullscreenIntent('choose-screen')
    const second = lifecycle.beginFullscreenIntent('other')
    lifecycle.camera('ready')
    assert.equal(lifecycle.getSnapshot().recovery.id, recovery)
    lifecycle.endFullscreenIntent(first)
    assert.deepEqual(
      lifecycle.getSnapshot().fullscreenIntents.map(i => i.id),
      [second],
    )
    lifecycle.endRecovery(recovery, 'completed')
    assert.equal(lifecycle.getSnapshot().scopes[0].id, page)
    const nextRecovery = lifecycle.beginRecovery()
    lifecycle.endRecovery(recovery, 'completed')
    assert.equal(lifecycle.getSnapshot().recovery.id, nextRecovery)
  })

  it('termination is final and invalidates late operations', () => {
    const lifecycle = createInteractionLifecycle()
    const page = lifecycle.beginScope('choose-camera')
    const recovery = lifecycle.beginRecovery()
    lifecycle.beginFullscreenIntent('choose-screen')
    lifecycle.terminate()
    const final = lifecycle.getSnapshot()
    lifecycle.camera('ready')
    lifecycle.endScope(page)
    lifecycle.endRecovery(recovery, 'completed')
    lifecycle.terminate()
    assert.equal(lifecycle.beginScope('late'), null)
    assert.strictEqual(lifecycle.getSnapshot(), final)
    assert.equal(final.status, 'ended')
    assert.deepEqual(final.scopes, [])
    assert.deepEqual(final.fullscreenIntents, [])
    assert.equal(final.recovery, null)
  })

  it('isolates sync/async observers and even a throwing diagnostics handler', async () => {
    const errors = []
    const lifecycle = createInteractionLifecycle({
      onObserverError(error) {
        errors.push(error)
        throw new Error('diagnostics')
      },
    })
    lifecycle.subscribe(() => {
      throw new Error('sync')
    })
    lifecycle.subscribe(async () => {
      throw new Error('async')
    })
    const revisions = []
    lifecycle.subscribe(state => {
      revisions.push(state.revision)
    })
    lifecycle.camera('ready')
    await Promise.resolve()
    assert.deepEqual(revisions, [0, 1])
    assert.equal(errors.length, 4)
  })

  it('orders reentrant notifications and snapshot subscriptions consistently', () => {
    const lifecycle = createInteractionLifecycle()
    const seen = []
    lifecycle.subscribe((state, event) => {
      if (!event) return
      seen.push('a' + state.revision)
      if (state.revision === 1) {
        lifecycle.camera('ready')
        lifecycle.subscribe((s, e) => {
          seen.push((e ? 'c' : 'initial') + s.revision)
        })
      }
    })
    lifecycle.subscribe((state, event) => {
      if (event) seen.push('b' + state.revision)
    })
    lifecycle.beginScope('calibration-panel')
    assert.deepEqual(seen, ['a1', 'b1', 'a2', 'b2', 'initial2'])
  })

  it('isolates asynchronous diagnostics failures too', async () => {
    const lifecycle = createInteractionLifecycle({
      onObserverError: async () => {
        throw new Error('diagnostics unavailable')
      },
    })
    lifecycle.subscribe(() => {
      throw new Error('observer')
    })
    lifecycle.camera('ready')
    await Promise.resolve()
    assert.equal(lifecycle.getSnapshot().camera, 'ready')
  })

  it('unsubscribe is idempotent and duplicate callbacks are independent subscriptions', () => {
    const lifecycle = createInteractionLifecycle()
    let count = 0
    const fn = () => {
      count++
    }
    const stop = lifecycle.subscribe(fn)
    lifecycle.subscribe(fn)
    stop()
    stop()
    lifecycle.camera('ready')
    lifecycle.camera('ready')
    assert.equal(count, 3)
  })

  it('dialog completion requires both a result and destruction in either order', () => {
    for (const destroyFirst of [true, false]) {
      const lifecycle = createInteractionLifecycle()
      const dialog = observeDialog(
        { _interactionLifecycle: lifecycle },
        'glasses-reminder',
      )
      if (destroyFirst) dialog.didDestroy()
      else dialog.settled({ isConfirmed: true })
      assert.equal(lifecycle.getSnapshot().scopes.length, 1)
      if (destroyFirst) dialog.settled({ isConfirmed: true })
      else dialog.didDestroy()
      assert.equal(lifecycle.getSnapshot().scopes.length, 0)
    }
  })

  it('dialog rejection preserves the original error', () => {
    const lifecycle = createInteractionLifecycle()
    const dialog = observeDialog(
      { _interactionLifecycle: lifecycle },
      'camera-permission',
    )
    const error = new Error('original')
    assert.throws(
      () => dialog.failed(error),
      actual => actual === error,
    )
    assert.deepEqual(lifecycle.getSnapshot().scopes, [])
  })
})

describe('WebGazer recovery view notifications', () => {
  it('does not finish while the spinner is visible or when an older dialog is destroyed', () => {
    const events = []
    const recovery = createRecoveryLifecycle(event => events.push(event))
    const closePrompt = recovery.watchView()
    recovery.phase('attempting')
    const closeSpinner = recovery.watchView()
    recovery.phase('settling')
    recovery.finish('completed')
    closePrompt()
    assert.equal(
      events.some(e => e.phase === 'ended'),
      false,
    )
    closeSpinner()
    closeSpinner()
    assert.deepEqual(
      events.map(e => e.phase),
      ['awaiting-resume', 'attempting', 'settling', 'ended'],
    )
    assert.equal(events[3].outcome, 'completed')
  })

  it('reports retry and cancellation after the last dialog is destroyed', () => {
    const events = []
    const recovery = createRecoveryLifecycle(event => events.push(event))
    recovery.watchView()
    recovery.phase('attempting')
    recovery.watchView()
    recovery.phase('retry')
    const closeRetry = recovery.watchView()
    closeRetry()
    assert.equal(
      events.some(e => e.phase === 'ended'),
      false,
    )
    recovery.finish('cancelled')
    assert.equal(events.at(-1).outcome, 'cancelled')
  })

  it('isolates observer errors and uses different IDs for later recoveries', async () => {
    assert.doesNotThrow(() => {
      const recovery = createRecoveryLifecycle(() => {
        throw new Error('observer')
      })
      recovery.finish('failed')
    })
    const events = []
    createRecoveryLifecycle(event => events.push(event))
    createRecoveryLifecycle(event => events.push(event))
    assert.notEqual(events[0].id, events[1].id)
    const recovery = createRecoveryLifecycle(async () => {
      throw new Error('async')
    })
    recovery.finish('failed')
    await Promise.resolve()
  })
})

describe('RC lifecycle integration', () => {
  const singleton = require('../src/index.js').default
  const { phrases } = require('../src/i18n/schema')
  const phraseKeys = [
    'RC_panelTitle',
    'RC_panelIntro',
    'RC_panelTitleNext',
    'RC_panelIntroNext',
    'RC_panelButton',
    'RC_performance',
    'T_proceed',
    'RC_PutYourGlassesBackOn',
    'RC_requestCamera',
    'RC_privacyCamera',
    'RC_starting',
    'RC_CameraPrivacyAssurance',
    'RC_CameraNotFound',
    'RC_TryAgain',
    'RC_OK',
  ]
  const savedPhrases = new Map()
  before(() => {
    for (const key of phraseKeys) {
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
  const Swal = require('sweetalert2').default || require('sweetalert2')
  // Match SweetAlert's actual API: the instance has then/finally but no catch.
  // Its then() returns a native Promise and accepts only onFulfilled.
  function popupResult(result) {
    const promise = Promise.resolve(result)
    return { then: onFulfilled => promise.then(onFulfilled) }
  }
  const {
    showPutGlassesBackOnScreen,
  } = require('../src/distance/object/objectTestFinish')
  function instance() {
    const RC = Object.create(singleton)
    Object.defineProperties(RC, {
      L: { value: 'en' },
      LD: { value: 'ltr' },
      isMobile: { value: { value: false } },
    })
    RC._interactionLifecycle = createInteractionLifecycle()
    RC._panelStatus = {
      hasPanel: false,
      panelFinished: false,
      panelResolveIntervals: [],
    }
    RC._panel = {}
    RC._panelInteraction = null
    RC._cameraSelectionInteraction = null
    RC._recalibrationInteraction = null
    RC._initialized = true
    RC._cameraSelectionDone = false
    RC.getFullscreen = async () => {}
    RC.keypadHandler = null
    return RC
  }

  it('recalibration remains active after setup returns and ends on the first live frame', async function () {
    this.timeout(5000)
    const RC = instance()
    const calls = []
    let frame
    RC.endDistance = (...args) => {
      calls.push(['teardown', ...args])
    }
    RC._addBackground = () => {}
    RC.trackDistance = async (options, callbackStatic, callbackTrack) => {
      frame = callbackTrack
    }
    RC.onInteractionChange(() => {
      throw new Error('observer')
    })
    await RC._restartViewingDistanceTracking({
      options: {
        onRecalibrateStart: () => calls.push('start'),
        onRecalibrateEnd: () => calls.push('end'),
      },
      callbackTrack: data => calls.push(data),
    })
    assert.equal(RC.getInteractionSnapshot().scopes[0].kind, 'recalibration')
    frame('first')
    frame('second')
    assert.deepEqual(calls, [
      'start',
      ['teardown', false, true, true],
      'end',
      'first',
      'second',
    ])
    assert.deepEqual(RC.getInteractionSnapshot().scopes, [])
  })

  it('no-camera cancellation preserves the result and existing cleanup', async () => {
    const RC = instance()
    const originalFire = Swal.fire
    const calls = []
    RC._background = { element: null }
    RC._addBackground = () => calls.push('add')
    RC._removeBackground = () => calls.push('remove')
    RC.showVideo = value => calls.push(['video', value])
    RC.gazeTracker = {
      checkInitialized: () => true,
      startCameraSession: async () => {},
      webgazer: { cameraTiming: {} },
    }
    Swal.fire = options => {
      options.didDestroy?.()
      return popupResult({ isConfirmed: false })
    }
    try {
      const result = await RC.selectCamera()
      assert.equal(result.experimentEnded, true)
      assert.equal(result.selectedCamera, null)
      assert.equal(RC._cameraSelectionDone, false)
      assert.deepEqual(calls, ['add', 'remove', ['video', false]])
      assert.deepEqual(RC.getInteractionSnapshot().scopes, [])
      assert.equal(document.getElementById('rc-starting-message'), null)
    } finally {
      Swal.fire = originalFire
    }
  })

  it('GazeTracker reports camera ready while recovery still owns its dialog', async () => {
    const GazeTracker = require('../src/gaze/gazeTracker').default
    const RC = instance()
    const callbacks = {}
    const tracker = new GazeTracker(RC)
    RC.onLanguageChange = () => () => {}
    tracker.webgazer = {
      params: {},
      setOnRecoveryInteraction: fn => {
        callbacks.recovery = fn
      },
      setOnCameraDisconnected: fn => {
        callbacks.disconnected = fn
      },
      setOnCameraReconnected: fn => {
        callbacks.reconnected = fn
      },
      setOnQuit: fn => {
        callbacks.quit = fn
      },
    }
    const oldFullscreen = Object.getOwnPropertyDescriptor(
      document,
      'fullscreenElement',
    )
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      value: document.body,
    })
    try {
      tracker.setupCameraMonitoring()
      callbacks.recovery({ id: 10, phase: 'awaiting-resume' })
      callbacks.disconnected('gone', {})
      callbacks.recovery({ id: 10, phase: 'attempting' })
      await callbacks.reconnected()
      assert.equal(RC.getInteractionSnapshot().camera, 'ready')
      assert.equal(RC.getInteractionSnapshot().recovery.phase, 'attempting')
      callbacks.recovery({ id: 10, phase: 'settling' })
      callbacks.recovery({ id: 10, phase: 'ended', outcome: 'completed' })
      callbacks.recovery({ id: 11, phase: 'awaiting-resume' })
      callbacks.recovery({ id: 10, phase: 'ended', outcome: 'completed' })
      assert.equal(
        RC.getInteractionSnapshot().recovery.phase,
        'awaiting-resume',
      )
      const activeId = RC.getInteractionSnapshot().recovery.id
      callbacks.recovery({ id: 11, phase: 'settling' })
      // Another disconnect arrives before the previous dialog is destroyed.
      callbacks.recovery({ id: 12, phase: 'awaiting-resume' })
      callbacks.recovery({ id: 11, phase: 'ended', outcome: 'completed' })
      assert.equal(RC.getInteractionSnapshot().recovery.id, activeId)
      assert.equal(
        RC.getInteractionSnapshot().recovery.phase,
        'awaiting-resume',
      )
      callbacks.recovery({ id: 12, phase: 'ended', outcome: 'completed' })
      assert.equal(RC.getInteractionSnapshot().recovery, null)
    } finally {
      if (oldFullscreen)
        Object.defineProperty(document, 'fullscreenElement', oldFullscreen)
      else delete document.fullscreenElement
    }
  })

  it('SweetAlert exposes then but no catch on popup instances', () => {
    assert.equal(typeof Swal.prototype.then, 'function')
    assert.equal(typeof Swal.prototype.catch, 'undefined')
  })

  it('Choose Camera waits for the thenable result and still waits for DOM cleanup', async () => {
    const { showCameraSelectionPopup } = require('../src/components/popup')
    const RC = instance()
    const camera = { deviceId: 'test-camera', label: 'Test camera' }
    RC._visibleCameras = [camera]
    RC.gazeTracker = { isCameraDisconnected: () => false }
    const originalFire = Swal.fire
    let popup
    let resolve
    let finished = false
    Swal.fire = options => {
      popup = options
      const promise = new Promise(done => {
        resolve = done
      })
      return { then: onFulfilled => promise.then(onFulfilled) }
    }
    try {
      const pending = showCameraSelectionPopup(RC, '', 'Choose', '').then(
        result => {
          finished = true
          return result
        },
      )
      await new Promise(done => setImmediate(done))
      assert.equal(finished, false)
      assert.ok(popup)
      assert.equal(
        RC.getInteractionSnapshot().scopes.at(-1).kind,
        'choose-camera',
      )
      RC.selectedCamera = camera
      resolve({ isConfirmed: true })
      const result = await pending
      assert.equal(result.selectedCamera, camera)
      assert.equal(result.isConfirmed, true)
      assert.equal(RC.getInteractionSnapshot().scopes.length, 1)
      popup.didDestroy()
      assert.deepEqual(RC.getInteractionSnapshot().scopes, [])
    } finally {
      Swal.fire = originalFire
    }
  })

  it('permission, startup retry and resolution dialogs accept SweetAlert thenables', async () => {
    const { checkPermissions } = require('../src/components/mediaPermission')
    const { _handlePostCameraResolution } = require('../src/components/popup')
    const GazeTracker = require('../src/gaze/gazeTracker').default
    const RC = instance()
    const originalFire = Swal.fire
    const permissions = Object.getOwnPropertyDescriptor(
      navigator,
      'permissions',
    )
    const fullscreen = Object.getOwnPropertyDescriptor(
      document,
      'fullscreenElement',
    )
    const kinds = []
    RC.onInteractionChange((_, event) => {
      if (event?.type === 'scope.begin') kinds.push(event.kind)
    })
    Object.defineProperty(navigator, 'permissions', {
      configurable: true,
      value: { query: async () => ({ state: 'prompt' }) },
    })
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      value: document.body,
    })
    Swal.fire = options => {
      options.didDestroy?.()
      return popupResult({ isConfirmed: true })
    }
    try {
      assert.deepEqual(await checkPermissions(RC, 'Allow camera'), {
        isConfirmed: true,
      })
      const tracker = new GazeTracker(RC)
      assert.equal(
        await tracker._promptCameraRetry(new Error('camera busy')),
        true,
      )
      RC.gazeTracker = { isCameraDisconnected: () => false }
      await _handlePostCameraResolution(RC, { _showCameraResolutionBool: true })
      assert.deepEqual(kinds, [
        'camera-permission',
        'camera-startup-retry',
        'camera-resolution',
      ])
      assert.deepEqual(RC.getInteractionSnapshot().scopes, [])
    } finally {
      Swal.fire = originalFire
      if (permissions)
        Object.defineProperty(navigator, 'permissions', permissions)
      else delete navigator.permissions
      if (fullscreen)
        Object.defineProperty(document, 'fullscreenElement', fullscreen)
      else delete document.fullscreenElement
    }
  })

  it('a rejected SweetAlert thenable preserves the error and releases the dialog scope', async () => {
    const GazeTracker = require('../src/gaze/gazeTracker').default
    const RC = instance()
    const originalFire = Swal.fire
    const error = new Error('popup failure')
    Swal.fire = () => ({
      then: onFulfilled => Promise.reject(error).then(onFulfilled),
    })
    try {
      await assert.rejects(
        new GazeTracker(RC)._promptCameraRetry(new Error('camera busy')),
        actual => actual === error,
      )
      assert.deepEqual(RC.getInteractionSnapshot().scopes, [])
    } finally {
      Swal.fire = originalFire
    }
  })

  it('public subscription works before camera initialization', () => {
    const RC = instance()
    let initial
    const stop = RC.onInteractionChange(state => {
      initial = state
    })
    assert.strictEqual(initial, RC.getInteractionSnapshot())
    stop()
  })

  it('cached camera selection retains its return contract and creates no interaction', async () => {
    const RC = instance()
    RC._cameraSelectionDone = true
    RC.selectedCamera = { deviceId: 'camera' }
    assert.deepEqual(await RC.selectCamera(), {
      selectedCamera: RC.selectedCamera,
      alreadyDone: true,
    })
    assert.equal(RC.getInteractionSnapshot().revision, 0)
  })

  it('camera selection reports failed startup without replacing the rejection', async () => {
    const RC = instance()
    const error = new Error('fullscreen failed')
    RC.getFullscreen = async () => {
      throw error
    }
    const events = []
    RC.onInteractionChange((_, event) => {
      if (event) events.push(event)
    })
    await assert.rejects(RC.selectCamera(), actual => actual === error)
    assert.deepEqual(
      events.map(e => e.type),
      ['scope.begin', 'scope.end'],
    )
    assert.equal(events[1].outcome, 'failed')
    assert.deepEqual(RC.getInteractionSnapshot().scopes, [])
  })

  it('empty panel preserves its callback/result with or without a throwing observer', async () => {
    for (const observe of [false, true]) {
      const RC = instance()
      if (observe)
        RC.onInteractionChange(() => {
          throw new Error('observer')
        })
      let callbacks = 0
      const result = await RC.panel(
        [],
        'body',
        {},
        () => {
          callbacks++
        },
        'original-result',
      )
      assert.equal(result, 'original-result')
      assert.equal(callbacks, 1)
      assert.equal(RC._panelStatus.panelFinished, true)
      assert.deepEqual(RC.getInteractionSnapshot().scopes, [])
    }
  })

  it('invalid panel input does not acquire ownership', async () => {
    const RC = instance()
    assert.equal(await RC.panel(['not-a-task'], 'body'), false)
    assert.equal(RC.getInteractionSnapshot().revision, 0)
  })

  for (const outcome of ['completed', 'cancelled']) {
    it(`normal panel ${outcome} preserves callback order and reports its lifetime`, async () => {
      const RC = instance()
      const originalObserver = global.ResizeObserver
      global.ResizeObserver = class {
        observe() {}
        unobserve() {}
      }
      const calls = []
      const events = []
      let finishTask
      RC.performance = (options, callback) => {
        finishTask = callback
      }
      RC.onInteractionChange((_, event) => {
        if (event) events.push(event)
      })
      const originalCallback = () => calls.push('panel callback')
      try {
        const pending = RC.panel(
          [
            {
              name: 'performance',
              callback: () => calls.push('task callback'),
            },
          ],
          'body',
          { i18n: false, fullscreen: false },
          originalCallback,
          'original-result',
        )
        // Panel setup awaits fullscreen; its returned promise waits for completion.
        await new Promise(resolve => setImmediate(resolve))
        assert.equal(
          RC.getInteractionSnapshot().scopes[0].kind,
          'calibration-panel',
        )
        assert.strictEqual(RC._panel.panelCallback, originalCallback)
        assert.deepEqual(calls, [])
        document.querySelector('.rc-panel-step').click()
        assert.equal(typeof finishTask, 'function')
        if (outcome === 'completed') {
          finishTask({ value: 42 })
          assert.deepEqual(calls, ['task callback', 'panel callback'])
          assert.equal(await pending, 'original-result')
        } else {
          RC.removePanel()
          assert.deepEqual(calls, [])
          // Preserve the legacy pending promise on panel removal.
        }
        assert.deepEqual(RC.getInteractionSnapshot().scopes, [])
        assert.equal(
          events.find(event => event.type === 'scope.end').outcome,
          outcome,
        )
      } finally {
        if (RC._panelStatus.hasPanel) RC.removePanel()
        if (originalObserver === undefined) delete global.ResizeObserver
        else global.ResizeObserver = originalObserver
      }
    })
  }

  it('glasses Proceed preserves the pending promise and reports cleanup separately', async () => {
    const RC = instance()
    const original = Swal.fire
    let options, resolve
    let completed = false
    Swal.fire = opts => {
      options = opts
      return new Promise(done => {
        resolve = done
      })
    }
    try {
      const waiting = showPutGlassesBackOnScreen(RC).then(() => {
        completed = true
      })
      await Promise.resolve()
      assert.equal(completed, false)
      assert.equal(
        RC.getInteractionSnapshot().scopes[0].kind,
        'glasses-reminder',
      )
      resolve({ isConfirmed: true })
      await waiting
      assert.equal(completed, true)
      assert.equal(RC.getInteractionSnapshot().scopes.length, 1)
      options.didDestroy()
      assert.deepEqual(RC.getInteractionSnapshot().scopes, [])
    } finally {
      Swal.fire = original
    }
  })
})

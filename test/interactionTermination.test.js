const assert = require('node:assert/strict')
const RC = require('../src/index').default
const GazeTracker = require('../src/gaze/gazeTracker').default
const { createInteractionLifecycle } = require('../src/interactionLifecycle')
const {
  onInteractionEnd,
  untilInteractionEnds,
  installInteractionInputBoundary,
} = require('../src/interactionTermination')
const {
  createKeyboardHandler,
} = require('../src/distance/object/keyboardHandler')

function instance() {
  const rc = Object.create(RC)
  Object.defineProperties(rc, { L: { value: 'en' }, LD: { value: 'ltr' } })
  rc._interactionLifecycle = createInteractionLifecycle()
  rc._interactionDisposers = new Set()
  rc._panelStatus = {
    hasPanel: false,
    panelFinished: false,
    panelResolveIntervals: [],
  }
  rc._panel = {}
  rc._removeNudger = () => {}
  rc._removeBackground = () => {}
  rc._cleanupDistanceCalibrationElements = () => {}
  rc.gazeTracker = null
  rc.getFullscreen = async () => true
  return rc
}

describe('Interaction termination', () => {
  const { phrases } = require('../src/i18n/schema')
  const saved = new Map()
  before(() => {
    for (const key of [
      'RC_panelTitle',
      'RC_panelIntro',
      'RC_panelTitleNext',
      'RC_panelIntroNext',
      'RC_panelButton',
      'RC_performance',
    ]) {
      saved.set(key, phrases[key])
      phrases[key] = { en: key }
    }
  })
  after(() => {
    for (const [key, value] of saved) {
      if (value === undefined) delete phrases[key]
      else phrases[key] = value
    }
  })
  it('cleans every resource once before publishing ended, even if one disposer fails', () => {
    const rc = instance(),
      order = []
    onInteractionEnd(rc, () => {
      order.push('first')
      throw new Error('test disposer failure')
    })
    onInteractionEnd(rc, () => order.push('second'))
    rc._removeBackground = () => order.push('background')
    rc.onInteractionChange(snapshot => {
      if (snapshot.status === 'ended') order.push('ended')
    })
    rc._cleanupAllRC()
    rc._cleanupAllRC()
    assert.deepEqual(order, ['first', 'second', 'background', 'ended'])
  })

  it('settles a cancelled waiter and discards its later success', async () => {
    const rc = instance()
    let finish
    const waiting = untilInteractionEnds(
      rc,
      new Promise(resolve => {
        finish = resolve
      }),
      'cancelled',
    )
    rc._cleanupAllRC()
    assert.equal(await waiting, 'cancelled')
    finish('completed')
    assert.equal(await waiting, 'cancelled')
    assert.equal(rc._interactionDisposers.size, 0)
  })

  for (const reason of ['quit', 'cancelled', 'failed']) {
    it(`recovery ${reason} tears down without requiring a host quit callback`, () => {
      const rc = instance(),
        callbacks = {}
      rc.onLanguageChange = () => () => {}
      const tracker = new GazeTracker(rc)
      tracker.webgazer = {
        params: {},
        setOnRecoveryInteraction: fn => {
          callbacks.recovery = fn
        },
        setOnCameraDisconnected: () => {},
        setOnCameraReconnected: () => {},
        setOnQuit: fn => {
          callbacks.quit = fn
        },
      }
      tracker.setupCameraMonitoring()
      let cleaned = false
      onInteractionEnd(rc, () => {
        cleaned = true
      })
      callbacks.recovery({ id: 1, phase: 'awaiting-resume' })
      if (reason === 'quit') callbacks.quit({ trigger: 'cameraReconnectPopup' })
      else callbacks.recovery({ id: 1, phase: 'ended', outcome: reason })
      assert.equal(cleaned, true)
      assert.equal(rc.getInteractionSnapshot().status, 'ended')
    })
  }

  it('blocks later window capture listeners but allows recovery and host controls', () => {
    const rc = instance()
    rc.attachInteractionHost({
      isInputBlocked: () => true,
      allowsInputEvent: e => !!e.target.closest('#host-dialog'),
    })
    const release = installInteractionInputBoundary(rc)
    const background = document.createElement('button')
    const recovery = document.createElement('div')
    recovery.className = 'camera-reconnect-container'
    const retry = document.createElement('button')
    recovery.append(retry)
    const host = document.createElement('button')
    host.id = 'host-dialog'
    document.body.append(background, recovery, host)
    let keys = 0,
      clicks = 0
    const key = () => keys++,
      click = () => clicks++
    window.addEventListener('keydown', key, true)
    window.addEventListener('click', click, true)
    try {
      background.dispatchEvent(
        new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      )
      background.click()
      assert.equal(keys, 0)
      assert.equal(clicks, 0)
      rc._interactionLifecycle.beginRecovery()
      retry.click()
      host.click()
      assert.equal(clicks, 2)
    } finally {
      release()
      window.removeEventListener('keydown', key, true)
      window.removeEventListener('click', click, true)
      background.remove()
      recovery.remove()
      host.remove()
    }
  })

  it('measurement handlers reject direct keyboard calls while paused, recovering or ended', () => {
    const rc = instance()
    let blocked = true,
      clicks = 0
    rc.attachInteractionHost({ isInputBlocked: () => blocked })
    const handlers = createKeyboardHandler({
      RC: rc,
      pageController: { getCurrentPage: () => 1 },
      proceedButton: { click: () => clicks++ },
      state: {},
    })
    const enter = { key: 'Enter', type: 'keydown' }
    handlers.handleKeyPress(enter)
    blocked = false
    handlers.handleKeyPress(enter)
    assert.equal(clicks, 1)
    rc._interactionLifecycle.beginRecovery()
    handlers.handleKeyPress(enter)
    rc._cleanupAllRC()
    handlers.handleKeyPress(enter)
    assert.equal(clicks, 1)
  })

  it('a skipped panel never advertises visible calibration ownership', async () => {
    const rc = instance(),
      scopes = []
    rc.onInteractionChange(snapshot => scopes.push(snapshot.scopes.length))
    let completed = 0
    assert.equal(
      await rc.panel([], 'body', { fullscreen: false }, () => completed++),
      true,
    )
    assert.equal(completed, 1)
    assert.ok(scopes.every(count => count === 0))
  })

  it('Quit settles the active panel without its success callback', async () => {
    const rc = instance(),
      old = global.ResizeObserver
    global.ResizeObserver = class {
      observe() {}
      unobserve() {}
    }
    let completed = 0
    try {
      const pending = rc.panel(
        ['performance'],
        'body',
        { i18n: false, fullscreen: false },
        () => completed++,
      )
      await new Promise(resolve => setImmediate(resolve))
      rc._cleanupAllRC()
      assert.equal(await pending, false)
      assert.equal(completed, 0)
      assert.equal(document.querySelector('.rc-panel'), null)
    } finally {
      global.ResizeObserver = old
    }
  })
})

describe('Late calibration completion', () => {
  it('camera selection settles cancellation even if fullscreen never answers', async () => {
    const rc = instance()
    rc.checkInitialized = () => true
    rc._cameraSelectionDone = false
    rc.getFullscreen = () => new Promise(() => {})
    const waiting = rc.selectCamera()
    rc._cleanupAllRC()
    assert.deepEqual(await waiting, {
      experimentEnded: true,
      selectedCamera: null,
    })
  })
})

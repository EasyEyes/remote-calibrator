const assert = require('node:assert/strict')
const RC = require('../src/index').default
const GazeTracker = require('../src/gaze/gazeTracker').default
const { createInteractionLifecycle } = require('../src/interactionLifecycle')
const {
  setUpEasyEyesKeypadHandler,
} = require('../src/extensions/keypadHandler')
const Swal = require('sweetalert2').default || require('sweetalert2')

describe('Interaction host and camera recovery', () => {
  it('a released host lease cannot detach a newer host', () => {
    const rc = Object.create(RC)
    const first = rc.attachInteractionHost({ isInputBlocked: () => true })
    const second = rc.attachInteractionHost({ isInputBlocked: () => false })
    first()
    assert.equal(rc.isInteractionInputBlocked(), false)
    assert.ok(rc._interactionHost)
    second()
    assert.equal(rc._interactionHost, null)
  })

  it('paused keypad callbacks stay registered and resume for the same RC page', () => {
    const rc = Object.create(RC)
    let blocked = true
    const detach = rc.attachInteractionHost({ isInputBlocked: () => blocked })
    const keypad = {
      event_handlers: { current: [] },
      all_keys: { current: [] },
    }
    let proceeded = 0
    setUpEasyEyesKeypadHandler(
      null,
      keypad,
      () => {
        proceeded++
      },
      true,
      ['return'],
      rc,
    )
    keypad.event_handlers.current[0]({ name: 'return' })
    assert.equal(proceeded, 0)
    assert.equal(keypad.event_handlers.current.length, 1)
    blocked = false
    keypad.event_handlers.current[0]({ name: 'return' })
    assert.equal(proceeded, 1)
    assert.equal(keypad.event_handlers.current.length, 0)
    detach()
  })

  for (const display of ['none', 'block']) {
    it(`reconnect preserves ${display} preview/circle and never reopens completed resolution UI`, async () => {
      const rc = Object.create(RC)
      Object.defineProperties(rc, { L: { value: 'en' }, LD: { value: 'ltr' } })
      rc._interactionLifecycle = createInteractionLifecycle()
      rc._cameraSelectionDone = true
      rc._cameraSelectionOptions = { _showCameraResolutionBool: true }
      rc.onLanguageChange = () => () => {}
      const detach = rc.attachInteractionHost({
        handlesFullscreenRecovery: true,
        isInputBlocked: () => false,
      })
      const tracker = new GazeTracker(rc)
      const callbacks = {}
      let showCalls = 0
      tracker.webgazer = {
        params: {
          showVideo: display === 'block',
          showFaceOverlay: display === 'block',
        },
        setOnRecoveryInteraction: fn => {
          callbacks.recovery = fn
        },
        setOnCameraDisconnected: fn => {
          callbacks.disconnected = fn
        },
        setOnCameraReconnected: fn => {
          callbacks.reconnected = fn
        },
        setOnQuit: () => {},
        showVideo: () => {
          showCalls++
        },
        showFaceOverlay: () => {
          showCalls++
        },
      }
      const video = document.createElement('div')
      video.id = 'webgazerVideoContainer'
      video.style.display = display
      const circle = document.createElement('div')
      circle.id = 'rc-big-circle-target'
      circle.style.display = display
      document.body.append(video, circle)
      const originalFire = Swal.fire
      let popups = 0
      Swal.fire = () => {
        popups++
        throw new Error('must not open a calibration/fullscreen popup')
      }
      tracker.setupCameraMonitoring()
      let resumed = 0
      tracker.onCameraReconnected(() => {
        resumed++
      })
      try {
        callbacks.recovery({ id: 1, phase: 'awaiting-resume' })
        callbacks.disconnected('sleep', {})
        await callbacks.reconnected()
        assert.equal(rc.getInteractionSnapshot().camera, 'ready')
        assert.notEqual(rc.getInteractionSnapshot().recovery, null)
        assert.equal(resumed, 1)
        assert.equal(popups, 0)
        assert.equal(showCalls, 0)
        assert.equal(video.style.display, display)
        assert.equal(circle.style.display, display)
        callbacks.recovery({ id: 1, phase: 'ended', outcome: 'completed' })
        assert.equal(rc.getInteractionSnapshot().recovery, null)
      } finally {
        Swal.fire = originalFire
        detach()
        video.remove()
        circle.remove()
      }
    })
  }
})

const assert = require('node:assert/strict')
const RC = require('../src/index').default
const { createInteractionLifecycle } = require('../src/interactionLifecycle')
const {
  showPutGlassesBackOnScreen,
} = require('../src/distance/object/objectTestFinish')
const {
  emptyCameraPreviewsHTML,
  bindMissingCameraActions,
  createCameraRefresh,
} = require('../src/components/cameraPickerRecovery')
const Swal = require('sweetalert2').default || require('sweetalert2')
const { phrases } = require('../src/i18n/schema')

function instance() {
  const rc = Object.create(RC)
  Object.defineProperties(rc, { L: { value: 'en' }, LD: { value: 'ltr' } })
  rc._interactionLifecycle = createInteractionLifecycle()
  rc._nudger = { element: null, nudgerPaused: false }
  return rc
}
const tick = () => new Promise(resolve => setTimeout(resolve, 0))

describe('Camera recovery dead ends', () => {
  const saved = new Map()
  before(() => {
    for (const key of ['T_proceed', 'RC_PutYourGlassesBackOn']) {
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

  it('the real nudger input trap permits recovery Proceed and Quit and blocks the background', () => {
    const rc = instance()
    const recovery = document.createElement('div')
    recovery.className = 'camera-reconnect-container'
    recovery.innerHTML = '<button>Proceed</button><button>Quit</button>'
    const background = document.createElement('button')
    document.body.append(recovery, background)
    let proceed = 0,
      quit = 0,
      study = 0,
      nudge = 0
    const [proceedButton, quitButton] = recovery.children
    proceedButton.onclick = () => proceed++
    quitButton.onclick = () => quit++
    background.onclick = () => study++
    try {
      rc._addNudger('<button id="test-nudger-button">Recalibrate</button>')
      const nudgeButton = document.getElementById('test-nudger-button')
      nudgeButton.onclick = () => nudge++
      nudgeButton.click()
      assert.equal(nudge, 1)
      const id = rc._interactionLifecycle.beginRecovery()
      proceedButton.click()
      quitButton.click()
      background.click()
      nudgeButton.click()
      assert.deepEqual([proceed, quit, study, nudge], [1, 1, 0, 1])
      let key = 0
      proceedButton.addEventListener('keydown', () => key++)
      proceedButton.dispatchEvent(
        new window.KeyboardEvent('keydown', {
          key: 'Enter',
          bubbles: true,
          cancelable: true,
        }),
      )
      assert.equal(key, 1)
      rc._interactionLifecycle.endRecovery(id, 'completed')
      nudgeButton.click()
      assert.equal(nudge, 2)
    } finally {
      rc._removeNudger()
      recovery.remove()
      background.remove()
    }
  })

  it('quit cleanup releases nudger input capture even without initialized tracking or remaining DOM', () => {
    const rc = instance()
    rc._removeBackground = () => {}
    rc._cleanupDistanceCalibrationElements = () => {}
    rc._panelStatus = { hasPanel: false }
    rc.gazeTracker = { _initialized: {} }
    const button = document.createElement('button')
    document.body.append(button)
    let clicks = 0
    button.onclick = () => clicks++
    try {
      rc._addNudger('Move closer')
      rc.nudger.remove()
      button.click()
      assert.equal(clicks, 0)
      rc._cleanupAllRC()
      button.click()
      assert.equal(clicks, 1)
    } finally {
      rc._removeNudger()
      button.remove()
    }
  })

  for (const outcome of ['completed', 'cancelled']) {
    it(`glasses reminder waits for recovery cleanup (${outcome}) and never treats dismissal as Proceed`, async () => {
      const rc = instance()
      const lifecycle = rc._interactionLifecycle
      const original = Swal.fire
      const views = []
      Swal.fire = options =>
        new Promise(resolve => views.push({ options, resolve }))
      let settled = false
      try {
        const waiting = showPutGlassesBackOnScreen(rc).then(value => {
          settled = true
          return value
        })
        assert.equal(views.length, 1)
        const id = lifecycle.beginRecovery()
        lifecycle.camera('disconnected')
        views[0].resolve({ isConfirmed: false })
        views[0].options.didDestroy()
        await tick()
        assert.equal(settled, false)
        lifecycle.camera('ready')
        await tick()
        assert.equal(
          views.length,
          1,
          'ready stream must not replace recovery spinner',
        )
        lifecycle.endRecovery(id, outcome)
        await tick()
        if (outcome === 'completed') {
          assert.equal(views.length, 2)
          assert.equal(
            settled,
            false,
            'the reminder still requires its own Proceed',
          )
          views[1].resolve({ isConfirmed: true })
          views[1].options.didDestroy()
          assert.equal(await waiting, true)
        } else {
          assert.equal(views.length, 1)
          assert.equal(await waiting, false)
        }
        assert.equal(lifecycle.getSnapshot().scopes.length, 0)
      } finally {
        Swal.fire = original
      }
    })
  }

  it('an empty picker keeps a replaceable mount and working Retry/Quit buttons', () => {
    const host = document.createElement('div')
    host.innerHTML = '<div id="rc-camera-previews-outer"><video></video></div>'
    document.body.append(host)
    let retry = 0,
      quit = 0
    try {
      host.firstElementChild.outerHTML = emptyCameraPreviewsHTML({
        message: 'Missing',
        retry: 'Try again',
        quit: 'Quit',
      })
      bindMissingCameraActions(host, {
        retry: () => retry++,
        quit: () => quit++,
      })
      host.querySelector('#rc-camera-missing-retry').click()
      host.querySelector('#rc-camera-missing-quit').click()
      assert.deepEqual([retry, quit], [1, 1])
      host.querySelector('#rc-camera-previews-outer').outerHTML =
        '<div id="rc-camera-previews-outer"><video></video></div>'
      assert.ok(
        host.querySelector('video'),
        'returned cameras have a live mount',
      )
    } finally {
      host.remove()
    }
  })

  it('picker refresh serializes polling/retry and discards results after close', async () => {
    let resolve,
      reads = 0,
      applies = 0
    const task = createCameraRefresh({
      read: () => {
        reads++
        return new Promise(done => {
          resolve = done
        })
      },
      apply: () => applies++,
      onError: error => {
        throw error
      },
    })
    const first = task.run()
    assert.equal(task.run(), first)
    assert.equal(reads, 1)
    resolve([])
    await first
    assert.equal(applies, 1)
    const second = task.run()
    task.dispose()
    resolve([{ deviceId: 'returned' }])
    await second
    assert.equal(applies, 1)
    await task.run()
    assert.equal(reads, 2)
  })
})

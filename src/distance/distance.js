import RemoteCalibrator from '../core'
import {
  constrain,
  constructInstructions,
  toFixedNumber,
  median,
  blurAll,
  safeExecuteFunc,
  average,
} from '../components/utils'
import {
  _getCrossX,
  _cross,
  circleDeltaX,
  _getCircleBounds,
  _circle,
} from '../components/onCanvas'
import { bindKeys, unbindKeys } from '../components/keyBinder'
import { addButtons } from '../components/buttons'
import { soundFeedback } from '../components/sound'
import { phrases } from '../i18n'

const blindSpotHTML = `<canvas id="blind-spot-canvas"></canvas>`

/* -------------------------------------------------------------------------- */

export function blindSpotTest(RC, options, toTrackDistance = false, callback) {
  let ppi = RC._CONST.N.PPI_DONT_USE // Dangerous! Arbitrary value
  if (RC.screenPpi) ppi = RC.screenPpi.value
  else
    console.error(
      'Screen size measurement is required to get accurate viewing distance measurement.'
    )

  let inTest = true // Used to break animation
  let dist = [] // Take the MEDIAN after all tests finished
  let tested = 0 // options.repeatedTesting times

  // Add HTML
  const blindSpotDiv = document.createElement('div')
  blindSpotDiv.innerHTML = blindSpotHTML
  RC.background.appendChild(blindSpotDiv)
  RC._constructFloatInstructionElement(
    'blind-spot-instruction',
    phrases.RC_distanceTrackingCloseL[RC.L]
  )
  RC._addCreditOnBackground(phrases.RC_viewingBlindSpotCredit[RC.L])

  // Get HTML elements
  const c = document.querySelector('#blind-spot-canvas')
  const ctx = c.getContext('2d')

  const eyeSideEle = document.getElementById('blind-spot-instruction')
  // let eyeSide = (eyeSideEle.innerText = 'LEFT').toLocaleLowerCase()
  let eyeSide = 'left'
  RC._setFloatInstructionElementPos(eyeSide, 16)
  let crossX = _getCrossX(eyeSide, c.width)

  let circleBounds

  // Window resize
  const _resetCanvasSize = () => {
    c.style.width = (c.width = window.innerWidth) + 'px'
    c.style.height = (c.height = window.innerHeight) + 'px'
    crossX = _getCrossX(eyeSide, c.width)
    circleBounds = _getCircleBounds(eyeSide, crossX, c.width)
  }
  const resizeObserver = new ResizeObserver(() => {
    _resetCanvasSize()
  })
  resizeObserver.observe(RC.background)
  _resetCanvasSize()

  let circleX = circleBounds[eyeSide === 'left' ? 0 : 1]
  let tempX = circleX // Used to check touching bound
  let v = eyeSide === 'left' ? 1 : -1

  // ! KEY
  const breakFunction = (toBreakTracking = true) => {
    // ! BREAK
    inTest = false
    resizeObserver.unobserve(RC.background)
    RC._removeBackground()

    if (!RC._trackingSetupFinishedStatus.distance && toBreakTracking) {
      RC._trackingSetupFinishedStatus.distance = true
      if (RC.gazeTracker.checkInitialized('distance', false)) RC.endDistance()
    }

    unbindKeys(bindKeysFunction)
  }

  // SPACE
  const finishFunction = () => {
    customButton.disabled = false
    soundFeedback()

    tested += 1
    // Average
    dist.push({
      dist: toFixedNumber(_getDist(circleX, crossX, ppi), options.decimalPlace),
      v: v,
      closedEyeSide: eyeSide,
      crossX: crossX,
      circleX: circleX,
      ppi: ppi,
      timestamp: new Date(),
    })

    // Enough tests?
    if (Math.floor(tested / options.repeatTesting) === 2) {
      // Check if these data are acceptable
      if (checkDataRepeatability(dist)) {
        // ! Put dist into data and callback function
        const data = (RC.newViewingDistanceData = {
          value: toFixedNumber(
            median(_getDistValues(dist)),
            options.decimalPlace
          ),
          timestamp: new Date(),
          method: RC._CONST.VIEW_METHOD.B,
          raw: { ...dist },
        })
        safeExecuteFunc(callback, data)

        // Break
        if (!toTrackDistance) {
          breakFunction(false)
        } else {
          // ! For tracking
          // Stop test
          inTest = false
          // Clear observer and keys
          resizeObserver.unobserve(RC.background)
          unbindKeys(bindKeysFunction)
        }
      } else {
        // ! Reset
        tested = 0
        customButton.disabled = true
        // Get first response
        const firstResponse = dist[0]
        _resetCanvasLayout(
          firstResponse.v,
          firstResponse.closedEyeSide,
          firstResponse.crossX
        )
      }
    } else if (tested % options.repeatTesting === 0) {
      // Switch eye side
      if (eyeSide === 'left') {
        // Change to RIGHT
        eyeSide = 'right'
        eyeSideEle.innerHTML = phrases.RC_distanceTrackingCloseR[RC.L]
      } else {
        eyeSide = 'left'
        eyeSideEle.innerHTML = phrases.RC_distanceTrackingCloseL[RC.L]
      }
      RC._setFloatInstructionElementPos(eyeSide, 16)

      _resetCanvasLayout(
        // eyeSide === 'left' ? 1 : -1, // v
        1, // v
        eyeSide, // eyeSide
        _getCrossX(eyeSide, c.width), // crossX
        false,
        true
      )
    } else {
      // Shift circle
      v = -v
      if (v > 0)
        // Going to the right
        circleX = circleBounds[0]
      else if (v < 0) circleX = circleBounds[1]
    }
  }

  const redoFunction = () => {
    if (!tested) return
    tested--
    customButton.disabled = true

    soundFeedback(3)

    const lastResponse = dist.pop()
    _resetCanvasLayout(
      lastResponse.v,
      lastResponse.closedEyeSide,
      lastResponse.crossX,
      true,
      true
    )
  }

  const _resetCanvasLayout = (
    nextV,
    nextEyeSide,
    nextCrossX,
    shiftFloatingElement = true,
    shiftCircle = true
  ) => {
    v = nextV
    eyeSide = nextEyeSide
    crossX = nextCrossX
    circleBounds = _getCircleBounds(eyeSide, crossX, c.width)

    if (shiftFloatingElement) {
      if (eyeSide === 'left')
        eyeSideEle.innerHTML = phrases.RC_distanceTrackingCloseL[RC.L]
      else eyeSideEle.innerHTML = phrases.RC_distanceTrackingCloseR[RC.L]
      RC._setFloatInstructionElementPos(eyeSide, 16)
    }

    if (shiftCircle) {
      if (v > 0) circleX = circleBounds[0]
      else circleX = circleBounds[1]
    }
  }

  // Bind keys
  const bindKeysFunction = bindKeys({
    Escape: breakFunction,
    ' ': finishFunction,
  })
  const addedButtons = addButtons(
    RC.L,
    RC.background,
    {
      go: finishFunction,
      cancel: breakFunction,
      custom: {
        callback: redoFunction,
        content: phrases.RC_viewingDistanceRedo[RC.L],
      },
    },
    RC.params.showCancelButton
  )

  const customButton = addedButtons[3]
  customButton.disabled = true

  // ! ACTUAL TEST
  let frameCount = 0
  const runTest = () => {
    // ctx.fillStyle = '#eee'
    // ctx.fillRect(0, 0, c.width, c.height)
    ctx.clearRect(0, 0, c.width, c.height)
    // ctx.beginPath()

    _cross(ctx, crossX, c.height / 2)

    _circle(RC, ctx, circleX, c.height / 2, frameCount, options.sparkle)
    circleX += v * circleDeltaX
    tempX = constrain(circleX, ...circleBounds)
    if (circleX !== tempX) {
      circleX = tempX
      for (let b of circleBounds)
        if (circleX !== b) {
          circleX = b
          break
        }
    }

    if (inTest) {
      frameCount++
      requestAnimationFrame(runTest)
    } else {
      ctx.clearRect(0, 0, c.width, c.height)
    }
  }

  requestAnimationFrame(runTest)
}

RemoteCalibrator.prototype.measureDistance = function (options = {}, callback) {
  /**
   * options -
   *
   * fullscreen: [Boolean]
   * repeatTesting: 2
   * sparkle: true
   * decimalPlace: 1
   * headline: [String]
   * description: [String]
   *
   */

  ////
  if (!this.checkInitialized()) return
  blurAll()
  ////

  options = Object.assign(
    {
      fullscreen: false,
      repeatTesting: 2,
      sparkle: true,
      decimalPlace: 1,
      headline: '📏 ' + phrases.RC_viewingDistanceTitle[this.L],
      description: phrases.RC_viewingDistanceIntro[this.L],
    },
    options
  )
  // Fullscreen
  this.getFullscreen(options.fullscreen)
  // Add HTML
  this._addBackground()

  this._replaceBackground(
    constructInstructions(options.headline, options.description, true)
  )
  blindSpotTest(this, options, false, callback)
}

// Helper functions

function _getDist(x, crossX, ppi) {
  // .3937 - in to cm
  return Math.abs(crossX - x) / ppi / _getTanDeg(15) / 0.3937
}

function _getTanDeg(deg) {
  return Math.tan((deg * Math.PI) / 180)
}

function checkDataRepeatability(dist) {
  let lefts = []
  let rights = []
  for (let d of dist) {
    if (d.closedEyeSide === 'left') lefts.push(d.dist)
    else rights.push(d.dist)
  }
  const leftMean = average(lefts)
  const rightMean = average(rights)

  return Math.abs(leftMean - rightMean) < 0.2 * Math.min(leftMean, rightMean)
}

function _getDistValues(dist) {
  const v = []
  for (let d of dist) v.push(d.dist)
  return v
}

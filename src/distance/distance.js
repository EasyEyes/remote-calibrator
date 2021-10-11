import RemoteCalibrator from '../core'
import {
  constrain,
  constructInstructions,
  toFixedNumber,
  median,
  blurAll,
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
  let ppi = 108 // Dangerous! Arbitrary value
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
    phrases.RC_headTrackingCloseL[RC.L]
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
  const breakFunction = () => {
    // ! BREAK
    inTest = false
    resizeObserver.unobserve(RC.background)
    RC._removeBackground()

    unbindKeys(bindKeysFunction)
  }

  // SPACE
  const finishFunction = () => {
    soundFeedback()

    tested += 1
    // Average
    dist.push(
      toFixedNumber(_getDist(circleX, crossX, ppi), options.decimalPlace)
    )

    // Enough tests?
    if (Math.floor(tested / options.repeatTesting) === 2) {
      // ! Put dist into data and callback function
      const data = (RC.newViewingDistanceData = {
        value: toFixedNumber(median(dist), options.decimalPlace),
        timestamp: new Date(),
        method: 'Blind Spot',
      })
      if (callback) callback(data)

      // Break
      if (!toTrackDistance) {
        breakFunction()
      } else {
        // ! For tracking
        // Stop test
        inTest = false
        // Clear observer and keys
        resizeObserver.unobserve(RC.background)
        unbindKeys(bindKeysFunction)
      }
    } else if (tested % options.repeatTesting === 0) {
      // Switch eye side
      if (eyeSide === 'left') {
        // Change to RIGHT
        eyeSide = 'right'
        eyeSideEle.innerHTML = phrases.RC_headTrackingCloseR[RC.L]
      } else {
        eyeSide = 'left'
        eyeSideEle.innerHTML = phrases.RC_headTrackingCloseL[RC.L]
      }
      RC._setFloatInstructionElementPos(eyeSide, 16)

      circleBounds = _getCircleBounds(eyeSide, crossX, c.width)
      circleX = circleBounds[eyeSide === 'left' ? 0 : 1]
      v = eyeSide === 'left' ? 1 : -1
      crossX = _getCrossX(eyeSide, c.width)
      circleBounds = _getCircleBounds(eyeSide, crossX, c.width)
    }
  }

  // Bind keys
  const bindKeysFunction = bindKeys({
    Escape: breakFunction,
    ' ': finishFunction,
  })
  addButtons(
    RC.L,
    RC.background,
    {
      go: finishFunction,
      cancel: breakFunction,
    },
    RC.params.showCancelButton
  )

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
      v = -v
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
   * quitFullscreenOnFinished: [Boolean] // TODO
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
      quitFullscreenOnFinished: false,
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
    constructInstructions(options.headline, options.description)
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

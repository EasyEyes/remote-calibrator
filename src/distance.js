import RemoteCalibrator from './core'
import {
  getFullscreen,
  constrain,
  removeBackground,
  addBackground,
  constructInstructions,
  toFixedNumber,
  median,
  blurAll,
} from './helpers'
import { debug } from './constants'
import { bindKeys, unbindKeys } from './components/keyBinder'

const blindSpotHTML = `
<p id="blind-spot-instruction" class="float-instruction">Please keep your <span id="eye-side"></span> eye closed, and hit SPACE when the dot disappears.</p>
<canvas id="blind-spot-canvas"></canvas>`

/* -------------------------------------------------------------------------- */

// CROSS
const crossLW = 32 // Width of a line of the middle cross
const crossLH = 4
function _cross(ctx, mX, mY) {
  // Draw a cross at the middle of the canvas
  ctx.fillStyle = '#000'
  ctx.fillRect(mX - (crossLW >> 1), mY - (crossLH >> 1), crossLW, crossLH)
  ctx.fillRect(mX - (crossLH >> 1), mY - (crossLW >> 1), crossLH, crossLW)
}

// CIRCLE
const circleR = 40
let circleDeltaX = 5

function _getCircleBounds(side, cW) {
  return side === 'left'
    ? [(cW + crossLW + circleR) / 2, cW - (circleR >> 1)]
    : [circleR >> 1, (cW - crossLW - circleR) / 2]
}

function _circle(ctx, x, y) {
  ctx.beginPath()
  ctx.arc(x, y, circleR >> 1, 0, Math.PI * 2)
  ctx.closePath()

  ctx.fillStyle = '#ac0d0d' // Red fill
  ctx.fill()
}

export function blindSpotTest(RC, parent, options, callback) {
  let ppi = 108 // Dangerous! Arbitrary value
  if (RC.screenPPI) ppi = RC.screenPPI.value
  else
    console.error(
      'Screen size measurement is required to get accurate viewing distance measurement.'
    )

  let inTest = true // Used to break animation
  let dist = [] // Take the MEDIAN after all tests finished
  let tested = 0 // options.repeatedTesting times

  // Add HTML
  const blindSpotDiv = document.createElement('div')
  blindSpotDiv.className = 'blind-spot-container'
  blindSpotDiv.innerHTML = blindSpotHTML
  parent.appendChild(blindSpotDiv)

  // Get HTML elements
  const c = document.querySelector('#blind-spot-canvas')
  const ctx = c.getContext('2d')

  const eyeSideEle = document.getElementById('eye-side')
  let eyeSide = (eyeSideEle.innerText = 'left')

  let circleBounds

  // Window resize
  const _resetCanvasSize = () => {
    c.style.width = (c.width = window.innerWidth) + 'px'
    c.style.height = (c.height = window.innerHeight) + 'px'
    circleBounds = _getCircleBounds(eyeSide, c.width)
  }
  const resizeObserver = new ResizeObserver(() => {
    _resetCanvasSize()
  })
  resizeObserver.observe(parent)
  _resetCanvasSize()

  let circleX = circleBounds[eyeSide === 'left' ? 0 : 1]
  let tempX = circleX // Used to check touching bound
  let v = eyeSide === 'left' ? 1 : -1

  // ! KEY
  const breakFunction = () => {
    // ! BREAK
    inTest = false
    resizeObserver.unobserve(parent)
    removeBackground()

    unbindKeys(bindKeysFunction)
  }

  // SPACE
  const finishFunction = () => {
    tested += 1
    // Average
    dist.push(
      toFixedNumber(
        _getDist(circleX, window.innerWidth, ppi),
        options.decimalPlace
      )
    )

    // Enough tests?
    if (Math.floor(tested / options.repeatTesting) === 2) {
      // ! Put dist into data and callback function
      if (callback)
        callback(
          (RC.viewingDistanceData = {
            value: toFixedNumber(median(dist), options.decimalPlace),
            timestamp: new Date(),
          })
        )

      // Break
      breakFunction()
      return
    } else if (tested % options.repeatTesting === 0) {
      // Switch eye side
      if (eyeSide === 'left') eyeSide = eyeSideEle.innerText = 'right'
      else eyeSide = eyeSideEle.innerText = 'left'
      circleBounds = _getCircleBounds(eyeSide, c.width)
      circleX = circleBounds[eyeSide === 'left' ? 0 : 1]
      v = eyeSide === 'left' ? 1 : -1
    }
  }

  const bindKeysFunction = bindKeys({
    Escape: breakFunction,
    ' ': finishFunction,
  })

  // ! ACTUAL TEST
  const runTest = () => {
    // ctx.clearRect(0, 0, c.width, c.height)

    ctx.fillStyle = '#ddd'
    ctx.fillRect(0, 0, c.width, c.height)

    _cross(ctx, c.width / 2, c.height / 2)

    _circle(ctx, circleX, c.height / 2)
    circleX += v * circleDeltaX
    tempX = constrain(circleX, ...circleBounds)
    if (circleX !== tempX) {
      circleX = tempX
      v = -v
    }

    if (inTest) requestAnimationFrame(runTest)
  }

  requestAnimationFrame(runTest)
}

RemoteCalibrator.prototype.measureDistance = function (options = {}, callback) {
  /**
   * options -
   *
   * fullscreen: [Boolean]
   * quitFullscreenOnFinished: [Boolean] // TODO
   * repeatTesting: 3
   * decimalPlace: 3
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
      fullscreen: true,
      quitFullscreenOnFinished: false,
      repeatTesting: 3,
      decimalPlace: 2,
      headline: '📏 Viewing Distance Calibration',
      description:
        "We'll measure your viewing distance. To do this, we'll perform a blind spot test. \nCover or close one of your eyes and focus on the black cross. \nPress <b>SPACE</b> when the red circle disappears. \nIf it doesn't disappear, you may have to move closer or farther from the screen.",
    },
    options
  )
  // Fullscreen
  if (options.fullscreen && !debug) getFullscreen()
  // Add HTML
  let staticDiv = addBackground(
    constructInstructions(options.headline, options.description)
  )

  blindSpotTest(this, staticDiv, options, callback)
}

/* -------------------------------- GET DIST -------------------------------- */

function _getDist(x, w, ppi) {
  // .3937 - in to cm
  return Math.abs(w / 2 - x) / ppi / _getTanDeg(15) / 0.3937
}

function _getTanDeg(deg) {
  return Math.tan((deg * Math.PI) / 180)
}

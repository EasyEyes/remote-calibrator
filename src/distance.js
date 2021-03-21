import {
  getFullscreen,
  constrain,
  removeBackground,
  addBackground,
  constructInstructions,
} from './helpers'
import data from './results'
import { debug } from './constants'

const blindSpotHTML = `
<p id="blind-spot-instruction" class="float-instruction">Now, please close your <span id="eye-side"></span> eye.</p>
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

export function blindSpotTest(parent, options, callback) {
  const ppi = data.screen.ppi || 108
  // The dist to
  let inTest = true // Used to break animation
  let dist = 0
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
  if ('activeElement' in document) document.activeElement.blur()
  document.addEventListener('keydown', function spaceListener(e) {
    if (e.key === ' ') {
      // Pressed SPACE
      e.preventDefault()

      tested += 1
      // Average
      dist = (
        (dist * (tested - 1)) / tested +
        _getDist(circleX, window.innerWidth, ppi, 3) / tested
      ).toFixed(3)

      // Enough tests?
      if (tested % options.repeatTesting === 0) {
        // ! Put dist into data and callback function
        callback((data.viewingDistance = { d: dist, timestamp: new Date() }))
        // ! BREAK
        inTest = false
        resizeObserver.unobserve(parent)
        document.removeEventListener('keydown', spaceListener)
        removeBackground()
        return
      }

      // Switch eye side
      if (eyeSide === 'left') eyeSide = eyeSideEle.innerText = 'right'
      else eyeSide = eyeSideEle.innerText = 'left'
      circleBounds = _getCircleBounds(eyeSide, c.width)
      circleX = circleBounds[eyeSide === 'left' ? 0 : 1]
      v = eyeSide === 'left' ? 1 : -1
    }
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

export function staticDistance(callback, options = {}) {
  /**
   * options -
   *
   * fullscreen: [Boolean]
   * quitFullscreenOnFinished: [Boolean] // TODO
   * testingEyes: ['both', 'left', 'right'] // TODO
   * repeatTesting: 2
   * headline: [String]
   * description: [String]
   *
   */
  options = Object.assign(
    {
      fullscreen: true,
      quitFullscreenOnFinished: false,
      repeatTesting: 2,
      headline: '📏 Viewing Distance Calibration',
      description:
        "We'll measure your viewing distance. To do this, we'll perform a <em>blind spot test</em>. \nCover or close one of your eyes and focus on the black cross. \nPress <b>SPACE</b> when the red circle disappears. \nIf it doesn't disappear, you may have to move closer or farther from the screen.",
    },
    options
  )
  // Fullscreen
  if (options.fullscreen && !debug) getFullscreen()
  // Add HTML
  let staticDiv = addBackground(
    constructInstructions(options.headline, options.description)
  )

  blindSpotTest(staticDiv, options, callback)
}

/* -------------------------------- GET DIST -------------------------------- */

function _getDist(x, w, ppi) {
  // .3937 - in to cm
  return Math.abs(w / 2 - x) / ppi / _getTanDeg(15) / 0.3937
}

function _getTanDeg(deg) {
  return Math.tan((deg * Math.PI) / 180)
}

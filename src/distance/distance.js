import Swal from 'sweetalert2'

import RemoteCalibrator, { env } from '../core'
import {
  constrain,
  constructInstructions,
  toFixedNumber,
  median,
  blurAll,
  safeExecuteFunc,
  average,
  emptyFunc,
  randn_bm,
} from '../components/utils'
import {
  _getCrossX,
  _cross,
  circleDeltaX,
  _getCircleBounds,
  _circle,
  bindMousedown,
  unbindMousedown,
  clickOnCircle,
} from '../components/onCanvas'
import { bindKeys, unbindKeys } from '../components/keyBinder'
import { addButtons } from '../components/buttons'
import { phrases } from '../i18n'
import { swalInfoOptions } from '../components/swalOptions'

// import { soundFeedback } from '../components/sound'
let soundFeedback
if (env !== 'mocha')
  soundFeedback = require('../components/sound').soundFeedback

const blindSpotHTML = `<canvas id="blind-spot-canvas" class="cursor-grab"></canvas>`

/* -------------------------------------------------------------------------- */

export function blindSpotTest(RC, options, toTrackDistance = false, callback) {
  const control = options.control // CONTROL (EasyEyes) or AUTOMATIC (Li et al., 2018)

  let ppi = RC._CONST.N.PPI_DONT_USE // Dangerous! Arbitrary value
  if (RC.screenPpi) ppi = RC.screenPpi.value
  else
    console.error(
      'Screen size measurement is required to get accurate viewing distance measurement.',
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
    phrases.RC_distanceTrackingCloseL[RC.L],
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
  let circleFill = RC._CONST.COLOR.DARK_RED

  let v = eyeSide === 'left' ? 1 : -1

  // ! KEY
  const breakFunction = (toBreakTracking = true) => {
    // ! BREAK
    inTest = false
    if (control) unbindMousedown('blind-spot-canvas', dragStart)
    resizeObserver.unobserve(RC.background)
    RC._removeBackground()

    if (!RC._trackingSetupFinishedStatus.distance && toBreakTracking) {
      RC._trackingSetupFinishedStatus.distance = true
      if (RC.gazeTracker.checkInitialized('distance', false)) RC.endDistance()
    }

    unbindKeys(bindKeysFunction)
    unbindKeys(bindKeyUpsFunction, 'keyup')
  }

  // SPACE
  const finishFunction = async () => {
    // customButton.disabled = false
    if (env !== 'mocha') soundFeedback()

    tested += 1
    // Average
    dist.push({
      dist: toFixedNumber(_getDist(circleX, crossX, ppi), options.decimalPlace),
      v: v,
      closedEyeSide: eyeSide,
      crossX: crossX,
      circleX: circleX,
      ppi: ppi,
      timestamp: performance.now(),
    })

    // Enough tests?
    if (Math.floor(tested / options.repeatTesting) === 2) {
      // Check if these data are acceptable
      if (checkDataRepeatability(dist)) {
        // ! Put dist into data and callback function
        const data = (RC.newViewingDistanceData = {
          value: toFixedNumber(
            median(_getDistValues(dist)),
            options.decimalPlace,
          ),
          timestamp: performance.now(),
          method: RC._CONST.VIEW_METHOD.B,
          raw: { ...dist },
        })

        // ! Break
        let measureType // For the check function
        if (!toTrackDistance) {
          measureType = 'measureDistance'
          breakFunction(false)
        } else {
          // ! For tracking
          measureType = 'trackDistance'
          // Stop test
          inTest = false
          // Clear observer and keys
          resizeObserver.unobserve(RC.background)
          unbindKeys(bindKeysFunction)
          unbindKeys(bindKeyUpsFunction, 'keyup')
        }

        // ! check
        if (options.check)
          await RC._checkDistance(
            callback,
            data,
            measureType,
            options.checkCallback,
          )
        else safeExecuteFunc(callback, data)
      } else {
        // ! Reset
        tested = 0
        // customButton.disabled = true
        // Get first response
        const firstResponse = dist[0]
        _resetCanvasLayout(
          firstResponse.v,
          firstResponse.closedEyeSide,
          firstResponse.crossX,
        )

        dist = [] // Discard old data

        Swal.fire({
          ...swalInfoOptions(RC, { showIcon: false }),
          icon: undefined,
          html: phrases.RC_viewingBlindSpotRejected[RC.L],
          allowEnterKey: true,
        })
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
        true,
      )
    } else {
      // Shift circle
      v = -v
      // if (v > 0)
      //   // Going to the right
      //   circleX = circleBounds[0]
      // else if (v < 0) circleX = circleBounds[1]
      _resetRandnCircleX(eyeSide, circleBounds)
    }
  }

  // const redoFunction = () => {
  //   if (!tested) return
  //   tested--
  //   // customButton.disabled = true

  //   soundFeedback(3)

  //   const lastResponse = dist.pop()
  //   _resetCanvasLayout(
  //     lastResponse.v,
  //     lastResponse.closedEyeSide,
  //     lastResponse.crossX,
  //     true,
  //     true
  //   )
  // }

  let arrowKeyDown = false
  let arrowIntervalFunction = null
  const arrowDownFunction = e => {
    if (arrowKeyDown) return

    arrowUpFunction()
    arrowKeyDown = true
    circleFill = RC._CONST.COLOR.RED

    arrowIntervalFunction = setInterval(() => {
      if (e.key === 'ArrowLeft') {
        circleX -= 10
        helpMoveCircleX()
      } else if (e.key === 'ArrowRight') {
        circleX += 10
        helpMoveCircleX()
      }
    }, 30)
  }

  const arrowUpFunction = () => {
    arrowKeyDown = false
    circleFill = RC._CONST.COLOR.DARK_RED
    if (arrowIntervalFunction) {
      clearInterval(arrowIntervalFunction)
      arrowIntervalFunction = null
    }
  }

  const helpMoveCircleX = () => {
    tempX = constrain(circleX, ...circleBounds)
    circleX = tempX
    // WRAP
    // if (circleX !== tempX) {
    //   circleX = tempX
    //   for (let b of circleBounds)
    //     if (circleX !== b) {
    //       circleX = b
    //       break
    //     }
    // }
  }

  const _resetRandnCircleX = (eye, bounds) => {
    let relativeBound = bounds[eye === 'left' ? 0 : 1]

    let randRange = Math.abs(bounds[1] - bounds[0]) / 4 // ! Range: 1/4
    let x = randn_bm(relativeBound - randRange, relativeBound + randRange)

    if ((x - bounds[0]) * (x - bounds[1]) > 0) x = relativeBound * 2 - x
    circleX = x
  }

  const _resetCanvasLayout = (
    nextV,
    nextEyeSide,
    nextCrossX,
    shiftFloatingElement = true,
    shiftCircle = true,
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
      // if (v > 0) circleX = circleBounds[0]
      // else circleX = circleBounds[1]
      circleX = circleBounds[eyeSide === 'left' ? 0 : 1]
      _resetRandnCircleX(nextEyeSide, circleBounds)
    }
  }

  // Bind keys
  const bindKeysFunction = bindKeys({
    Escape: options.showCancelButton ? breakFunction : undefined,
    Enter: finishFunction,
    ' ': finishFunction,
    ArrowLeft: control ? arrowDownFunction : emptyFunc,
    ArrowRight: control ? arrowDownFunction : emptyFunc,
  })
  const bindKeyUpsFunction = bindKeys(
    {
      ArrowLeft: control ? arrowUpFunction : emptyFunc,
      ArrowRight: control ? arrowUpFunction : emptyFunc,
    },
    'keyup',
  )

  addButtons(
    RC.L,
    RC.background,
    {
      go: finishFunction,
      cancel: options.showCancelButton ? breakFunction : undefined,
      custom: {
        callback: () => {
          Swal.fire({
            ...swalInfoOptions(RC, { showIcon: false }),
            icon: undefined,
            html: phrases.RC_viewingDistanceIntro[RC.L],
            allowEnterKey: true,
          })
        },
        content: phrases.RC_viewingDistanceIntroTitle[RC.L],
      },
    },
    RC.params.showCancelButton,
  )

  // const customButton = addedButtons[3]
  // customButton.disabled = true

  /* -------------------------------------------------------------------------- */
  // Drag
  const _dragStartPosition = { x: null, circleX: null }
  const dragStart = e => {
    const isTouch = e.touches && e.touches[0] ? true : false
    if (!isTouch) e.preventDefault()

    let startX, startY
    if (isTouch) {
      startX = e.touches[0].clientX
      startY = e.touches[0].clientY
    } else {
      startX = e.clientX
      startY = e.clientY
    }

    if (clickOnCircle(circleX, c.height / 2, startX, startY)) {
      _dragStartPosition.x = startX
      _dragStartPosition.circleX = circleX

      const thisCanvas = document.getElementById('blind-spot-canvas')

      circleFill = RC._CONST.COLOR.RED
      thisCanvas.classList.replace('cursor-grab', 'cursor-grabbing')

      const dragMove = eMove => {
        e.preventDefault()
        eMove.preventDefault()

        let currentX
        if (isTouch) currentX = eMove.touches[0].clientX
        else currentX = eMove.clientX

        circleX = _dragStartPosition.circleX + currentX - _dragStartPosition.x
        circleX = constrain(
          circleX,
          ..._getCircleBounds(eyeSide, crossX, c.width),
        )
      }
      if (isTouch) document.addEventListener('touchmove', dragMove)
      else document.addEventListener('mousemove', dragMove)

      const dragEnd = () => {
        if (isTouch) {
          document.removeEventListener('touchend', dragEnd)
          document.removeEventListener('touchmove', dragMove)
        } else {
          document.removeEventListener('mouseup', dragEnd)
          document.removeEventListener('mousemove', dragMove)
        }
        _dragStartPosition.x = null
        _dragStartPosition.circleX = null

        circleFill = RC._CONST.COLOR.DARK_RED
        thisCanvas.classList.replace('cursor-grabbing', 'cursor-grab')
      }
      if (isTouch) document.addEventListener('touchend', dragEnd)
      else document.addEventListener('mouseup', dragEnd)
    }
  }
  if (control) bindMousedown('blind-spot-canvas', dragStart)
  /* -------------------------------------------------------------------------- */

  // ! ACTUAL TEST
  const frameTimestampInitial = performance.now()
  let frameTimestamp = frameTimestampInitial
  const runTest = () => {
    // ctx.fillStyle = '#eee'
    // ctx.fillRect(0, 0, c.width, c.height)
    ctx.clearRect(0, 0, c.width, c.height)
    // ctx.beginPath()

    _cross(ctx, crossX, c.height / 2)

    frameTimestamp = performance.now()
    _circle(
      RC,
      ctx,
      circleX,
      c.height / 2,
      Math.round(frameTimestamp - frameTimestampInitial),
      circleFill,
      options.sparkle,
    )
    if (!control) {
      circleX += v * circleDeltaX
      helpMoveCircleX()
    }

    if (inTest) {
      requestAnimationFrame(runTest)
    } else {
      ctx.clearRect(0, 0, c.width, c.height)
    }
  }

  requestAnimationFrame(runTest)
}

/* -------------------------------------------------------------------------- */
/*                               measureDistance                              */
/* -------------------------------------------------------------------------- */

RemoteCalibrator.prototype.measureDistance = function (options = {}, callback) {
  /**
   * options -
   *
   * fullscreen: [Boolean]
   * repeatTesting: 1
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

  let description
  if (options.control !== undefined && options.control === false)
    description = phrases.RC_viewingDistanceIntroLiMethod[this.L]
  else description = phrases.RC_viewingDistanceIntro[this.L]

  options = Object.assign(
    {
      fullscreen: false,
      repeatTesting: 1,
      sparkle: true,
      decimalPlace: 1,
      control: true, // CONTROL (EasyEyes) or AUTOMATIC (Li et al., 2018)
      headline: '📏 ' + phrases.RC_viewingDistanceTitle[this.L],
      description: description,
      check: false,
      checkCallback: false,
      showCancelButton: true,
    },
    options,
  )
  // Fullscreen
  this.getFullscreen(options.fullscreen)
  // Add HTML
  this._addBackground()

  this._replaceBackground(
    constructInstructions(options.headline, null, true, ''),
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

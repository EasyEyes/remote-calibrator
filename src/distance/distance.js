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
  replaceNewlinesWithBreaks,
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
import { phrases } from '../i18n/schema'
import { swalInfoOptions } from '../components/swalOptions'
import { setUpEasyEyesKeypadHandler } from '../extensions/keypadHandler'

// import { soundFeedback } from '../components/sound'
let soundFeedback
if (env !== 'mocha')
  soundFeedback = require('../components/sound').soundFeedback

const blindSpotHTML = `<canvas id="blind-spot-canvas" class="cursor-grab"></canvas>`

/* -------------------------------------------------------------------------- */

export function blindSpotTest(
  RC,
  options,
  toTrackDistance = false,
  callback = undefined,
) {
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
    c.width = window.innerWidth
    c.height = window.innerHeight
    c.style.width = `${c.width}px`
    c.style.height = `${c.height}px`

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

  let removeKeypadHandler = setUpEasyEyesKeypadHandler(
    null,
    RC.keypadHandler,
    () => {
      finishFunction() // ! Finish
    },
    false,
    ['return'],
    RC,
  )

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
        const data = {
          value: toFixedNumber(
            median(_getDistValues(dist)),
            options.decimalPlace,
          ),
          timestamp: performance.now(),
          method: RC._CONST.VIEW_METHOD.B,
          raw: { ...dist },
        }

        RC.newViewingDistanceData = data

        // ! Break
        let measureType // For the check function
        if (!toTrackDistance) measureType = 'measureDistance'
        else measureType = 'trackDistance' // ! For tracking

        // Remove background, etc.
        breakFunction(false)

        // remove Handler
        removeKeypadHandler()

        // ! check
        if (options.calibrateTrackDistanceCheckBool)
          await RC._checkDistance(
            callback,
            data,
            measureType,
            options.checkCallback,
            options.calibrateTrackDistanceCheckCm,
            options.callbackStatic,
            options.calibrateTrackDistanceCheckSecs,
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
      removeKeypadHandler()
      removeKeypadHandler = setUpEasyEyesKeypadHandler(
        null,
        RC.keypadHandler,
        () => {
          finishFunction() // ! Finish
        },
        false,
        ['return'],
        RC,
      )

      // Switch eye side
      if (eyeSide === 'left') {
        // Change to RIGHT
        eyeSide = 'right'
        eyeSideEle.innerHTML = replaceNewlinesWithBreaks(
          phrases.RC_distanceTrackingCloseR[RC.L],
        )
      } else {
        eyeSide = 'left'
        eyeSideEle.innerHTML = replaceNewlinesWithBreaks(
          phrases.RC_distanceTrackingCloseL[RC.L],
        )
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
    const relativeBound = bounds[eye === 'left' ? 0 : 1]

    const randRange = Math.abs(bounds[1] - bounds[0]) / 4 // ! Range: 1/4
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
        eyeSideEle.innerHTML = replaceNewlinesWithBreaks(
          phrases.RC_distanceTrackingCloseL[RC.L],
        )
      else
        eyeSideEle.innerHTML = replaceNewlinesWithBreaks(
          phrases.RC_distanceTrackingCloseR[RC.L],
        )
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
            html: phrases.RC_viewingDistanceIntroLiMethod[RC.L],
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
    const isTouch = !!e.touches?.[0]
    if (!isTouch) e.preventDefault()

    let startX
    let startY
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

RemoteCalibrator.prototype.measureDistance = function (
  measureDistanceOptions = {},
  callback = undefined,
) {
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
  if (measureDistanceOptions.control === false)
    description = phrases.RC_viewingDistanceIntroLiMethod[this.L]
  else description = phrases.RC_viewingDistanceIntroLiMethod[this.L]

  const options = Object.assign(
    {
      fullscreen: false,
      repeatTesting: 1,
      sparkle: true,
      decimalPlace: 1,
      control: true, // CONTROL (EasyEyes) or AUTOMATIC (Li et al., 2018)
      headline: `📏 ${phrases.RC_viewingDistanceTitle[this.L]}`,
      description: description,
      check: false,
      checkCallback: false,
      showCancelButton: true,
    },
    measureDistanceOptions,
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

RemoteCalibrator.prototype.measureDistanceObject = function (
  options = {},
  callback = undefined,
) {
  if (!this.checkInitialized()) return

  const opts = Object.assign(
    {
      fullscreen: false,
      repeatTesting: 1,
      headline: `📏 ${phrases.RC_viewingDistanceTitle[this.L]}`,
      description: phrases.RC_viewingDistanceIntroLiMethod[this.L],
      showCancelButton: true,
    },
    options,
  )

  this.getFullscreen(opts.fullscreen)
  blurAll()

  objectTest(this, opts, callback)
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
  const lefts = []
  const rights = []
  for (const d of dist) {
    if (d.closedEyeSide === 'left') lefts.push(d.dist)
    else rights.push(d.dist)
  }
  const leftMean = average(lefts)
  const rightMean = average(rights)

  return Math.abs(leftMean - rightMean) < 0.2 * Math.min(leftMean, rightMean)
}

function _getDistValues(dist) {
  const v = []
  for (const d of dist) v.push(d.dist)
  return v
}

// ===================== OBJECT TEST SCHEME =====================
export function objectTest(RC, options, callback = undefined) {
  RC._addBackground()

  // ===================== DRAWING THE OBJECT TEST UI =====================

  // --- Calculate screen and layout measurements ---
  // Get the screen's pixels per millimeter (for accurate physical placement)
  const ppi = RC.screenPpi ? RC.screenPpi.value : 96 / 25.4 // fallback: 96dpi/25.4mm
  const pxPerMm = ppi / 25.4

  // The left vertical line is always 5mm from the left edge of the screen
  const leftLinePx = Math.round(5 * pxPerMm) // 5mm from left
  const screenWidth = window.innerWidth

  // The right vertical line starts at 2/3 of the screen width, but is adjustable
  let rightLinePx = Math.round((screenWidth * 2) / 3)

  // --- Create the main overlay container ---
  // This container holds all UI elements for the object test
  const container = document.createElement('div')
  container.style.position = 'fixed' // Change to fixed to cover entire viewport
  container.style.top = '0'
  container.style.left = '0'
  container.style.width = '100vw'
  container.style.height = '100vh'
  container.style.userSelect = 'none'
  container.style.overflow = 'hidden' // Prevent scrolling

  // --- TITLE  ---
  const title = document.createElement('h1')
  title.innerText = phrases.RC_SetViewingDistance[RC.L]
  title.style.textAlign = 'left'
  title.style.paddingLeft = '3rem'
  title.style.margin = '2rem 0 5rem 0'
  container.appendChild(title)

  // --- INSTRUCTIONS ---
  const instructionsText = phrases.RC_UseObjectToSetViewingDistance1[RC.L]
  const instructions = document.createElement('div')
  instructions.style.maxWidth = '600px'
  instructions.style.paddingLeft = '5em'
  instructions.style.marginTop = '-2rem'
  instructions.style.textAlign = 'left'
  instructions.style.whiteSpace = 'pre-line'
  instructions.style.alignSelf = 'flex-start'
  instructions.style.position = 'relative'
  instructions.style.zIndex = '3'
  instructions.innerText = instructionsText
  container.appendChild(instructions)

  // ===================== DRAWING THE VERTICAL LINES =====================

  // --- Style for both vertical lines (left and right) ---
  // Both lines are the same color, thickness, and height
  const verticalLineStyle = `
    position: absolute; 
    top: 5rem; 
    height: 75vh; 
    width: 6px; 
    background: rgb(34, 141, 16); 
    border-radius: 2px; 
    box-shadow: 0 0 8px rgba(34, 141, 16, 0.4);
    z-index: 1;
  `

  // Function to update line colors based on distance
  const updateLineColors = () => {
    const objectLengthPx = rightLinePx - leftLinePx
    const objectLengthMm = objectLengthPx / pxPerMm
    const objectLengthCm = objectLengthMm / 10

    // If distance is less than or equal to minimum distance, change to red and update label text and position
    if (objectLengthCm <= options.calibrateTrackDistanceMinCm) {
      rightLine.style.background = 'rgb(255, 0, 0)'
      rightLine.style.boxShadow = '0 0 8px rgba(255, 0, 0, 0.4)'
      rightLabel.style.color = 'rgb(255, 0, 0)'
      rightLabel.innerText = phrases.RC_viewingDistanceObjectTooShort[RC.L]
      rightLabel.style.top = '20px' // Move to top
    } else {
      rightLine.style.background = 'rgb(34, 141, 16)'
      rightLine.style.boxShadow = '0 0 8px rgba(34, 141, 16, 0.4)'
      rightLabel.style.color = 'rgb(34, 141, 16)'
      rightLabel.innerText = phrases.RC_RightEdge[RC.L]
      rightLabel.style.top = '80vh' // Move back to bottom
    }
  }

  // --- Left vertical line ---
  // Fixed at 5mm from the left edge
  const leftLine = document.createElement('div')
  leftLine.style = verticalLineStyle + `left: ${leftLinePx}px;`
  leftLine.style.marginLeft = '5mm' // Ensures physical 5mm offset
  container.appendChild(leftLine)

  // --- Right vertical line ---
  // Starts at 2/3 of the screen width, but is draggable and keyboard-movable
  const rightLine = document.createElement('div')
  rightLine.style =
    verticalLineStyle + `left: ${rightLinePx}px; cursor: ew-resize;`
  rightLine.tabIndex = 0 // Allows keyboard focus for arrow key movement
  rightLine.setAttribute('role', 'slider') // Make it more accessible
  rightLine.setAttribute('aria-label', 'Adjust right line position')
  container.appendChild(rightLine)

  // Add hover effects to both lines
  ;[leftLine, rightLine].forEach(line => {
    line.addEventListener('mouseenter', () => {
      line.style.boxShadow = '0 0 12px rgba(34, 141, 16, 0.6)'
      line.style.width = '8px'
    })
    line.addEventListener('mouseleave', () => {
      line.style.boxShadow = '0 0 8px rgba(34, 141, 16, 0.4)'
      line.style.width = '6px'
      updateLineColors() // Update colors after hover effect
    })
  })

  // ===================== LABELS FOR VERTICAL LINES =====================

  // --- Label for the left vertical line ---
  // Tells the user to align the left edge of their object here
  const leftLabel = document.createElement('div')
  leftLabel.innerText = phrases.RC_LeftEdge[RC.L]
  leftLabel.style.position = 'absolute'
  leftLabel.style.marginLeft = '5mm'
  leftLabel.style.left = `${leftLinePx + 6}px` // Slightly right of the line
  leftLabel.style.top = '80vh' // Just below the line
  leftLabel.style.color = 'rgb(34, 141, 16)'
  leftLabel.style.fontWeight = 'bold'
  leftLabel.style.fontSize = '1.4em'
  container.appendChild(leftLabel)

  // --- Label for the right vertical line ---
  // Tells the user to move this line to the right edge of their object
  const rightLabel = document.createElement('div')
  rightLabel.innerText = phrases.RC_RightEdge[RC.L]
  rightLabel.style.position = 'absolute'
  rightLabel.style.left = `${rightLinePx + 6}px` // Slightly right of the line
  rightLabel.style.top = '80vh'
  rightLabel.style.color = 'rgb(34, 141, 16)'
  rightLabel.style.fontWeight = 'bold'
  rightLabel.style.fontSize = '1.4em'
  rightLabel.id = 'right-line-label'
  container.appendChild(rightLabel)

  // Update right label position and line colors when rightLine moves (drag or keyboard)
  function updateRightLabel() {
    rightLabel.style.left = `${rightLinePx + 6}px`
    updateLineColors() // Update colors when line moves
  }

  // --- Allow the user to move the right line with arrow keys when focused ---
  rightLine.addEventListener('keydown', e => {
    const stepSize = 5 // Pixels to move per keypress
    if (e.key === 'ArrowLeft') {
      rightLinePx = Math.max(leftLinePx + 20, rightLinePx - stepSize)
      rightLine.style.left = `${rightLinePx}px`
      updateRightLabel()
      e.preventDefault()
    } else if (e.key === 'ArrowRight') {
      rightLinePx = Math.min(screenWidth - 10, rightLinePx + stepSize)
      rightLine.style.left = `${rightLinePx}px`
      updateRightLabel()
      e.preventDefault()
    }
  })

  // --- Visual feedback for keyboard focus on the right line ---
  rightLine.addEventListener('focus', () => {
    rightLine.style.boxShadow = '0 0 0 2px #ff9a00'
    rightLine.style.outline = 'none'
  })
  rightLine.addEventListener('blur', () => {
    rightLine.style.boxShadow = ''
  })

  // --- Allow the user to drag the right vertical line horizontally ---
  let dragging = false
  rightLine.addEventListener('mousedown', e => {
    dragging = true
    document.body.style.cursor = 'ew-resize'
    e.preventDefault()
  })
  window.addEventListener('mousemove', e => {
    if (!dragging) return
    let x = e.clientX
    // Clamp so it can't cross the left line or go off screen
    x = Math.max(leftLinePx + 20, Math.min(x, screenWidth - 10))
    rightLinePx = x
    rightLine.style.left = `${rightLinePx}px`
    updateRightLabel()
  })
  window.addEventListener('mouseup', () => {
    dragging = false
    document.body.style.cursor = ''
  })

  // Add keyboard event listener for arrow keys
  const handleArrowKeys = e => {
    if (document.activeElement === rightLine) {
      const stepSize = 5 // Pixels to move per keypress
      if (e.key === 'ArrowLeft') {
        rightLinePx = Math.max(leftLinePx + 20, rightLinePx - stepSize)
        rightLine.style.left = `${rightLinePx}px`
        updateRightLabel()
        e.preventDefault()
      } else if (e.key === 'ArrowRight') {
        rightLinePx = Math.min(screenWidth - 10, rightLinePx + stepSize)
        rightLine.style.left = `${rightLinePx}px`
        updateRightLabel()
        e.preventDefault()
      }
    }
  }
  document.addEventListener('keydown', handleArrowKeys)

  // Clean up keyboard event listener when done
  const cleanup = () => {
    document.removeEventListener('keydown', handleArrowKeys)
  }
  window.addEventListener('beforeunload', cleanup)

  // ===================== DRAWING THE HORIZONTAL LINE AND ARROWHEADS =====================
  // --- Calculate the vertical position for the horizontal line (5mm from bottom of viewport) ---
  const bottomMargin = 5 * pxPerMm // 5mm from bottom
  const leftMargin = 5 * pxPerMm // 5mm from left edge
  const lineThickness = 6 // px, same as vertical lines
  const arrowLength = 24 // px, length of arrowhead
  const arrowWidth = 16 // px, width of arrowhead base
  const arrowColor = 'rgb(34, 141, 16)'

  // --- Horizontal line ---
  const horizontalLine = document.createElement('div')
  horizontalLine.style.position = 'absolute'
  horizontalLine.style.left = `${leftMargin + 2 * arrowLength}px` // Start at end of left arrow base
  horizontalLine.style.right = `${arrowLength}px` // End before right arrow
  horizontalLine.style.bottom = `${bottomMargin}px`
  horizontalLine.style.height = `${lineThickness}px`
  horizontalLine.style.background = arrowColor
  horizontalLine.style.borderRadius = '2px'
  horizontalLine.style.boxShadow = '0 0 8px rgba(34, 141, 16, 0.4)'
  horizontalLine.style.zIndex = '1'
  container.appendChild(horizontalLine)

  // --- Left arrowhead for the horizontal line ---
  const leftArrow = document.createElement('div')
  leftArrow.style.position = 'absolute'
  leftArrow.style.left = `${leftMargin + arrowLength}px` // Position arrow tip at 5mm
  leftArrow.style.bottom = `${bottomMargin + lineThickness / 2 - arrowWidth / 2}px`
  leftArrow.style.width = '0'
  leftArrow.style.height = '0'
  leftArrow.style.borderTop = `${arrowWidth / 2}px solid transparent`
  leftArrow.style.borderBottom = `${arrowWidth / 2}px solid transparent`
  leftArrow.style.borderRight = `${arrowLength}px solid ${arrowColor}`
  leftArrow.style.filter = 'drop-shadow(0 0 4px rgba(34, 141, 16, 0.4))'
  leftArrow.style.zIndex = '2'
  container.appendChild(leftArrow)

  // --- Right arrowhead for the horizontal line ---
  const rightArrow = document.createElement('div')
  rightArrow.style.position = 'fixed'
  rightArrow.style.right = '0' // Position at screen edge
  rightArrow.style.bottom = `${bottomMargin + lineThickness / 2 - arrowWidth / 2}px`
  rightArrow.style.width = '0'
  rightArrow.style.height = '0'
  rightArrow.style.borderTop = `${arrowWidth / 2}px solid transparent`
  rightArrow.style.borderBottom = `${arrowWidth / 2}px solid transparent`
  rightArrow.style.borderLeft = `${arrowLength}px solid ${arrowColor}`
  rightArrow.style.filter = 'drop-shadow(0 0 4px rgba(34, 141, 16, 0.4))'
  rightArrow.style.zIndex = '2'
  container.appendChild(rightArrow)

  // --- Label for the horizontal line ---
  const maxLengthLabel = document.createElement('div')
  maxLengthLabel.innerText = phrases.RC_MaximumLength[RC.L]
  maxLengthLabel.style.position = 'absolute' // Change to absolute
  maxLengthLabel.style.left = `${(leftMargin + window.innerWidth) / 2}px` // Center between left margin and screen edge
  maxLengthLabel.style.bottom = `${bottomMargin + lineThickness + 10}px`
  maxLengthLabel.style.color = arrowColor
  maxLengthLabel.style.fontWeight = 'bold'
  maxLengthLabel.style.fontSize = '1rem'
  maxLengthLabel.style.zIndex = '3'
  container.appendChild(maxLengthLabel)

  // Update positions when window is resized
  window.addEventListener('resize', () => {
    const newBottomMargin = 5 * pxPerMm
    const newLeftMargin = 5 * pxPerMm
    horizontalLine.style.bottom = `${newBottomMargin}px`
    horizontalLine.style.left = `${newLeftMargin + 2 * arrowLength}px` // Start at end of left arrow base
    leftArrow.style.bottom = `${newBottomMargin + lineThickness / 2 - arrowWidth / 2}px`
    leftArrow.style.left = `${newLeftMargin + arrowLength}px` // Position arrow tip at 5mm
    rightArrow.style.bottom = `${newBottomMargin + lineThickness / 2 - arrowWidth / 2}px`
    maxLengthLabel.style.bottom = `${newBottomMargin + lineThickness + 10}px`
    maxLengthLabel.style.left = `${(newLeftMargin + window.innerWidth) / 2}px`
  })

  // ===================== END DRAWING =====================

  // Add to background
  RC._replaceBackground('') // Clear any previous content
  RC.background.appendChild(container)

  // ===================== OBJECT TEST FINISH FUNCTION =====================
  const objectTestFinishFunction = () => {
    // ===================== INITIALIZATION CHECK =====================
    // Initialize Face Mesh tracking if not already done
    if (!RC.gazeTracker.checkInitialized('distance')) {
      RC.gazeTracker._init(
        {
          toFixedN: 1,
          showVideo: true,
          showFaceOverlay: false,
        },
        'distance',
      )
    }

    // ===================== CALCULATE PHYSICAL DISTANCE =====================
    // Calculate the length of the object in pixels by finding the difference
    // between the right and left line positions
    const objectLengthPx = rightLinePx - leftLinePx

    // Convert the pixel length to millimeters using the screen's PPI
    // pxPerMm was calculated earlier as ppi/25.4 (pixels per inch / mm per inch)
    const objectLengthMm = objectLengthPx / pxPerMm

    // ===================== CONSOLE LOGGING =====================
    // Log the measured distance in different units for debugging
    console.log('=== Object Test Measurement Results ===')
    console.log(`Distance in pixels: ${objectLengthPx.toFixed(2)}px`)
    console.log(`Distance in millimeters: ${objectLengthMm.toFixed(2)}mm`)
    console.log(
      `Distance in centimeters: ${(objectLengthMm / 10).toFixed(2)}cm`,
    )
    console.log('=====================================')

    // ===================== CREATE MEASUREMENT DATA OBJECT =====================
    // Format the data object to match the blindspot mapping structure
    const data = {
      // Use median of both measurements, rounded to 1 decimal place
      value: toFixedNumber(median([firstMeasurement, (rightLinePx - leftLinePx) / pxPerMm / 10]), 1),

      // Use performance.now() for high-precision timing
      timestamp: performance.now(),

      // Use 'object' as the method to indicate this is from object test
      method: 'object',

      // Store all raw measurement data for potential future use
      raw: {
        leftPx: leftLinePx, // Position of left line in pixels
        rightPx: rightLinePx, // Position of right line in pixels
        screenWidth, // Total screen width in pixels
        objectLengthPx, // Object length in pixels
        objectLengthMm, // Object length in millimeters
        ppi: ppi, // Screen's pixels per inch
      },
    }

    // ===================== VISUAL FEEDBACK =====================
    // Create a feedback element to show measurements
    const feedbackDiv = document.createElement('div')
    feedbackDiv.style.position = 'fixed'
    feedbackDiv.style.bottom = '20px'
    feedbackDiv.style.left = '20px'
    feedbackDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.8)'
    feedbackDiv.style.color = 'white'
    feedbackDiv.style.padding = '10px'
    feedbackDiv.style.borderRadius = '5px'
    feedbackDiv.style.fontFamily = 'monospace'
    feedbackDiv.style.zIndex = '1000'
    feedbackDiv.innerHTML = `
      <div>Object Test Measurements:</div>
      <div>First Measurement: ${firstMeasurement.toFixed(1)} cm</div>
      <div>Second Measurement: ${(rightLinePx - leftLinePx) / pxPerMm / 10} cm</div>
      <div>Median: ${median([firstMeasurement, (rightLinePx - leftLinePx) / pxPerMm / 10]).toFixed(1)} cm</div>
      <div>Method: ${data.method}</div>     
      <div>PPI: ${ppi}</div>
    `
    document.body.appendChild(feedbackDiv)

    // ===================== STORE MEASUREMENT DATA =====================
    RC.newObjectTestDistanceData = data
    RC.newViewingDistanceData = data

    // ===================== CHECK FUNCTION =====================
    // If we're in 'both' mode, clean up and start blindspot test
    if (options.useObjectTestData === 'both') {
      // Clean up UI elements and handlers
      RC._removeBackground()

      // Add a small delay to ensure cleanup is complete and background is ready
      setTimeout(() => {
        // Add background back for blindspot test
        RC._addBackground()

        // Start blindspot test immediately
        blindSpotTest(RC, options, true, blindspotData => {
          // Calculate median of both measurements
          const medianData = {
            value: median([data.value, blindspotData.value]),
            timestamp: Date.now(),
            method: 'both',
            raw: {
              object: data,
              blindspot: blindspotData,
            },
          }

          // Update feedback for combined measurement
          feedbackDiv.innerHTML = `
                    <div>Combined Measurement:</div>
                    <div>Object Test: ${data.value} cm</div>
                    <div>Blindspot Test: ${blindspotData.value} cm</div>
                    <div>Median: ${medianData.value} cm</div>
                    <div>Method: ${medianData.method}</div>
                `

          // Update the data in RC and also the data in the callback
          RC.newObjectTestDistanceData = medianData
          RC.newViewingDistanceData = medianData

          // Handle completion based on check settings
          if (options.calibrateTrackDistanceCheckBool) {
            RC._checkDistance(
              callback,
              data,
              'object', // Use 'object' instead of 'measureDistance'
              options.checkCallback,
              options.calibrateTrackDistanceCheckCm,
              options.callbackStatic,
              options.calibrateTrackDistanceCheckSecs,
            )
          } else {
            // ===================== CALLBACK HANDLING =====================
            if (typeof callback === 'function') {
              callback(data)
            }
          }

          // Clean up UI elements
          RC._removeBackground()
          // Remove feedback after a delay
          setTimeout(() => {
            document.body.removeChild(feedbackDiv)
          }, 8000)
        })
      }, 100) // Single delay to ensure cleanup and background are ready
    } else {
      // Use the same check function as blindspot
      if (options.calibrateTrackDistanceCheckBool) {
        RC._checkDistance(
          callback,
          data,
          'object', // Use 'object' instead of 'measureDistance'
          options.checkCallback,
          options.calibrateTrackDistanceCheckCm,
          options.callbackStatic,
          options.calibrateTrackDistanceCheckSecs,
        )
      } else {
        // ===================== CALLBACK HANDLING =====================
        if (typeof callback === 'function') {
          callback(data)
        }
      }

      // Clean up UI elements
      RC._removeBackground()
      // Remove feedback after a delay
      setTimeout(() => {
        document.body.removeChild(feedbackDiv)
      }, 8000)
    }
  }
  const breakFunction = () => {
    // Restart: reset right line to initial position
    objectTest(RC, options, callback)
  }

  // ===================== KEYPAD HANDLER =====================
  let removeKeypadHandler = setUpEasyEyesKeypadHandler(
    null,
    RC.keypadHandler,
    () => {
      // If OK button is enabled, trigger its action
      if (!okButton.disabled) {
        objectTestFinishFunction()
      } else {
        // If OK button is disabled, trigger Proceed button action
        proceedButton.click()
      }
    },
    false,
    ['return'],
    RC,
  )

  // Add keyboard event listener for Enter/Return key
  const handleKeyPress = e => {
    if (e.key === 'Enter' || e.key === 'Return') {
      if (!okButton.disabled) {
        objectTestFinishFunction()
      } else {
        proceedButton.click()
      }
    }
  }
  document.addEventListener('keydown', handleKeyPress)

  // Add buttons (i18n, same as blindSpotTest)
  const buttonContainer = document.createElement('div')
  buttonContainer.className = 'rc-button-container'
  buttonContainer.style.position = 'fixed'
  buttonContainer.style.bottom = '45px'
  buttonContainer.style.right = '20px'
  buttonContainer.style.zIndex = '1000'
  buttonContainer.style.display = 'flex'
  buttonContainer.style.gap = '10px'
  RC.background.appendChild(buttonContainer)

  // Add OK button first
  const proceedButton = document.createElement('button')
  proceedButton.className = 'rc-button'
  proceedButton.textContent = 'Proceed'
  proceedButton.style.border = '2px solid #ff9a00'
  proceedButton.style.backgroundColor = '#ff9a00'
  proceedButton.style.color = 'white'
  proceedButton.style.padding = '8px 16px'
  proceedButton.style.borderRadius = '4px'
  proceedButton.style.cursor = 'pointer'

  // Store measurements
  let firstMeasurement = null

  proceedButton.onclick = () => {
    console.log('Proceed button clicked')

    // Record first measurement - just store the distance value
    firstMeasurement = (rightLinePx - leftLinePx) / pxPerMm / 10
    console.log('First measurement:', firstMeasurement)

    // Reset right line to original position (2/3 of screen width)
    rightLinePx = Math.round((screenWidth * 2) / 3)
    rightLine.style.left = `${rightLinePx}px`
    updateRightLabel()

    // Update the instruction text
    instructions.innerText = phrases.RC_UseObjectToSetViewingDistance2[RC.L]

    // Hide the first proceed button and show the second one
    proceedButton.style.display = 'none'
    okButton.disabled = false
    okButton.style.opacity = '1'
    okButton.style.display = 'block'

    // Initialize Face Mesh tracking if not already done
    if (!RC.gazeTracker.checkInitialized('distance')) {
      RC.gazeTracker._init(
        {
          toFixedN: 1,
          showVideo: true,
          showFaceOverlay: false,
        },
        'distance',
      )
    }
  }
  buttonContainer.appendChild(proceedButton)

  // Add OK button second
  const okButton = document.createElement('button')
  okButton.className = 'rc-button'
  okButton.textContent = 'Proceed'
  okButton.disabled = true
  okButton.style.opacity = '0.5'
  okButton.style.border = '2px solid #ff9a00'
  okButton.style.backgroundColor = '#ff9a00'
  okButton.style.color = 'white'
  okButton.style.padding = '8px 16px'
  okButton.style.borderRadius = '4px'
  okButton.style.cursor = 'pointer'
  okButton.style.display = 'none' // Initially hidden
  okButton.onclick = () => {
    // Remove keyboard event listener when finishing
    document.removeEventListener('keydown', handleKeyPress)
    objectTestFinishFunction()
  }
  buttonContainer.appendChild(okButton)

  // Add Explanation button last
  const explanationButton = document.createElement('button')
  explanationButton.className = 'rc-button'
  explanationButton.textContent = phrases.RC_viewingDistanceIntroTitle[RC.L]
  explanationButton.style.border = '2px solid #fff'
  explanationButton.style.backgroundColor = '#fff'
  explanationButton.style.color = '#000'
  explanationButton.style.padding = '8px 16px'
  explanationButton.style.borderRadius = '4px'
  explanationButton.style.cursor = 'pointer'
  explanationButton.onclick = () => {
    Swal.fire({
      ...swalInfoOptions(RC, { showIcon: false }),
      icon: undefined,
      html: phrases.RC_viewingDistanceIntroPelliMethod[RC.L],
      allowEnterKey: true,
    })
  }
  buttonContainer.appendChild(explanationButton)
}

// ===================== DISTANCE DATA VALIDATION =====================
// This function validates the distance measurement data before it's used for Face Mesh calibration
// It's crucial because Face Mesh needs accurate reference points to track distance changes
RemoteCalibrator.prototype.validateDistanceData = function (data) {
  // If no data provided, validation fails
  if (!data) return false

  // ===================== REQUIRED FIELDS CHECK =====================
  // These fields are essential for Face Mesh calibration:
  // - value: The measured distance in centimeters
  // - timestamp: When the measurement was taken
  // - method: Which measurement method was used (object/blindspot)
  if (!data.value || !data.timestamp || !data.method) {
    console.error('Invalid distance data: missing required fields')
    return false
  }

  // ===================== VALUE VALIDATION =====================
  // The distance value must be:
  // - A number (not string or other type)
  // - Not NaN (Not a Number)
  // - Greater than 0 (can't have negative or zero distance)
  if (typeof data.value !== 'number' || isNaN(data.value) || data.value <= 0) {
    console.error('Invalid distance value')
    return false
  }

  // ===================== TIMESTAMP VALIDATION =====================
  // The timestamp must be:
  // - A number (not string or other type)
  // - Not NaN (Not a Number)
  // This helps track when the measurement was taken
  if (typeof data.timestamp !== 'number' || isNaN(data.timestamp)) {
    console.error('Invalid timestamp')
    return false
  }

  // ===================== METHOD VALIDATION =====================
  // The method must be one of:
  // - 'object': Using the object test method
  // - 'B': Using the blindspot method
  // - 'F': Using the face method
  // This helps Face Mesh understand how the reference point was obtained
  if (data.method !== 'object' && data.method !== 'B' && data.method !== 'F') {
    console.error('Invalid measurement method')
    return false
  }

  // If all validations pass, the data is valid for Face Mesh calibration
  return true
}

// ===================== METHOD TRANSITION VALIDATION =====================
// This function ensures we can safely switch between object and blindspot methods
// It's important because it verifies we have valid reference points for Face Mesh
RemoteCalibrator.prototype.validateMethodTransition = function (
  fromMethod,
  toMethod,
) {
  // Check if current tracking is active
  if (this.gazeTracker.checkInitialized('distance', true)) {
    console.warn('Active tracking detected. Stopping current tracking...')
    this.endDistance()
  }

  // Validate methods - only object and blindspot are valid
  if (fromMethod !== 'object' && fromMethod !== 'blindspot') {
    console.error('Invalid from method')
    return false
  }
  if (toMethod !== 'object' && toMethod !== 'blindspot') {
    console.error('Invalid to method')
    return false
  }

  // Check if we have valid data for the current method
  // This is crucial because Face Mesh needs a valid reference point
  if (fromMethod === 'object' && !this.newObjectTestDistanceData) {
    console.warn('No object test data available')
    return false
  }
  if (fromMethod === 'blindspot' && !this.newViewingDistanceData) {
    console.warn('No blindspot data available')
    return false
  }

  return true
}

// ===================== METHOD SWITCHING =====================
// This function allows switching between object and blindspot methods
// It's used when we want to change how we get our reference point for Face Mesh
RemoteCalibrator.prototype.switchDistanceMethod = function (
  method,
  options = {},
  callback = undefined,
) {
  if (!this.checkInitialized()) return

  // Validate method - only object and blindspot are valid
  if (method !== 'object' && method !== 'blindspot') {
    console.error('Invalid method. Must be either "object" or "blindspot"')
    return
  }

  // Stop any existing tracking
  this.endDistance()

  // Clear any existing data
  // This is important because we want a fresh reference point for Face Mesh
  this.newViewingDistanceData = null
  this.newObjectTestDistanceData = null

  // Merge options with defaults
  const defaultOptions = {
    fullscreen: true,
    showVideo: true,
    desiredDistanceMonitor: true,
    check: false,
    checkCallback: false,
    showCancelButton: true,
  }
  const mergedOptions = Object.assign({}, defaultOptions, options)

  // Start new measurement based on method
  // This will give us a new reference point for Face Mesh
  if (method === 'object') {
    this.measureDistanceObject(mergedOptions, callback)
  } else {
    this.measureDistance(mergedOptions, callback)
  }
}

// ===================== OBJECT TEST TRACKING =====================
// This function combines object test measurement with distance tracking
// It's the main function that:
// 1. Gets a reference point using the object test
// 2. Uses that reference point to start Face Mesh tracking
RemoteCalibrator.prototype.trackDistanceObject = function (
  options = {},
  callbackStatic = undefined,
  callbackTrack = undefined,
) {
  if (!this.checkInitialized()) return

  // First measure distance using object test
  // This gives us our reference point for Face Mesh
  this.measureDistanceObject(
    {
      fullscreen: true,
      showVideo: true,
      ...options,
    },
    measurementData => {
      // Then start tracking using the object test data
      // This tells Face Mesh "this is what the facial landmarks look like at this distance"
      this.trackDistance(
        {
          ...options,
          useObjectTestData: true,
          showVideo: true,
          desiredDistanceMonitor: true,
        },
        callbackStatic,
        callbackTrack,
      )
    },
  )
}

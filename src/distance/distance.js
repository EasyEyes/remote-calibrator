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
import { setDefaultVideoPosition } from '../components/video'
import { showTestPopup } from '../components/popup'
import { ppiToPxPerCm } from '../components/converters'

// import { soundFeedback } from '../components/sound'
let soundFeedback
let cameraShutterSound
if (env !== 'mocha') {
  const soundModule = require('../components/sound')
  soundFeedback = soundModule.soundFeedback
  cameraShutterSound = soundModule.cameraShutterSound
}

const blindSpotHTML = `<canvas id="blind-spot-canvas" class="cursor-grab"></canvas>`

/* -------------------------------------------------------------------------- */

// Helper function to save calibration attempts (both failed and successful)
function saveCalibrationAttempt(RC, method, distance, calibrationFactor) {
  // Initialize the calibration attempts object if it doesn't exist
  if (!RC.calibrationAttempts) {
    RC.calibrationAttempts = {}
  }
  
  // Initialize method-specific data if it doesn't exist
  if (!RC.calibrationAttempts[method]) {
    RC.calibrationAttempts[method] = {
      distances: [],
      calibrationFactors: []
    }
  }
  
  // Trim values to 1 decimal place, handle NaN gracefully
  const trimmedDistance = isNaN(distance) ? NaN : parseFloat(distance.toFixed(1))
  const trimmedCalibrationFactor = isNaN(calibrationFactor) ? NaN : parseFloat(calibrationFactor.toFixed(1))
  
  // Add the new distance and calibration factor
  RC.calibrationAttempts[method].distances.push(trimmedDistance)
  RC.calibrationAttempts[method].calibrationFactors.push(trimmedCalibrationFactor)
  
  // Create the final array format: [method, distance1, distance2..., calibfactor1, calibfactor2...]
  const finalArray = [
    method,
    ...RC.calibrationAttempts[method].distances,
    ...RC.calibrationAttempts[method].calibrationFactors
  ]
  
  // Store in the desired format
  RC.calibrationAttempts[method + 'Array'] = finalArray
  
  console.log(`Saved ${method} calibration attempt:`, { distance: trimmedDistance, calibrationFactor: trimmedCalibrationFactor })
  console.log(`Current ${method} array:`, finalArray)
}

// Helper to get intraocular distance in pixels (not cm) - moved to global scope
async function measureIntraocularDistancePx(RC) {
  let video = document.getElementById('webgazerVideoCanvas')
  if (!video) return null
  const model = await RC.gazeTracker.webgazer.getTracker().model
  const faces = await model.estimateFaces(video)
  if (!faces.length) return null
  const mesh = faces[0].keypoints
  if (!mesh || !mesh[133] || !mesh[362]) return null
  const eyeDist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
  return eyeDist(mesh[133], mesh[362])
}

// Helper to capture current video frame as base64 image
function captureVideoFrame(RC) {
  try {
    const video = document.getElementById('webgazerVideoCanvas')
    if (!video) return null

    // Create a canvas to capture the frame
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')

    // Set canvas size to match video
    canvas.width = video.videoWidth || video.width
    canvas.height = video.videoHeight || video.height

    // Draw the current video frame to canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    // Convert to base64 data URL
    return canvas.toDataURL('image/jpeg', 0.8)
  } catch (error) {
    console.warn('Failed to capture video frame:', error)
    return null
  }
}

// Helper function to calulcte the distance from the center of the screen to the top of the screen in cm
const _calculateDistanceFromCenterToTop = ppi => {
  // get the screen height in pixels
  const screenHeightPixels = window.screen.height

  // calculate half the screen height in pixels
  const halfScreenHeightPixels = screenHeightPixels / 2

  // convert pixels to inches using the ppi
  const halfScreenHeightInches = halfScreenHeightPixels / ppi

  // convert inches to centimeters (1 inch = 2.54 cm)
  const halfScreenHeightCm = halfScreenHeightInches * 2.54

  console.log('.....halfScreenHeightCm', halfScreenHeightCm)

  return halfScreenHeightCm
}

export async function blindSpotTest(
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

  // Per-eye Face Mesh samples for calibration factor checks
  const faceMeshSamplesLeft = []
  const faceMeshSamplesRight = []

  // ===================== SHOW POPUP BEFORE CALIBRATION STARTS =====================
  // Only show popup if not running as part of "both" methods and camera selection hasn't been done
  if (options.useObjectTestData !== 'both' && !options.cameraSelectionDone) {
    await showTestPopup(RC)
  }

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

    if (!RC.blindspotData) RC.blindspotData = {}
    if (eyeSide === 'left')
      RC.blindspotData.viewingDistanceByBlindSpot1Cm = toFixedNumber(
        _getDist(circleX, crossX, ppi),
        options.decimalPlace,
      )
    else
      RC.blindspotData.viewingDistanceByBlindSpot2Cm = toFixedNumber(
        _getDist(circleX, crossX, ppi),
        options.decimalPlace,
      )

    // Collect per-eye Face Mesh samples for calibration factor checks
    const collectFiveSamples = async targetArray => {
      for (let i = 0; i < 5; i++) {
        try {
          const pxDist = await measureIntraocularDistancePx(RC)
          targetArray.push(pxDist && !isNaN(pxDist) ? pxDist : NaN)
        } catch (e) {
          targetArray.push(NaN)
        }
        await new Promise(res => setTimeout(res, 100))
      }
    }
    if (eyeSide === 'left') await collectFiveSamples(faceMeshSamplesLeft)
    else await collectFiveSamples(faceMeshSamplesRight)

    // Enough tests?
    if (Math.floor(tested / options.repeatTesting) === 2) {
      // Check if these data are acceptable
      // OLD METHOD: if (checkDataRepeatability(dist)) {
      // NEW METHOD: Uses ratio-based tolerance with calibrateTrackDistanceAllowedRatio
      const [pass, message, min, max, RMin, RMax] = checkBlindspotTolerance(
        dist,
        options.calibrateTrackDistanceAllowedRatio,
        options.calibrateTrackDistanceAllowedRangeCm,
        faceMeshSamplesLeft,
        faceMeshSamplesRight,
        ppi,
      )
      if (RC.measurementHistory && message !== 'Pass')
        RC.measurementHistory.push(message)
      else if (message !== 'Pass') RC.measurementHistory = [message]

      if (pass) {
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

        // Compute per-eye and overall Face Mesh averages
        const validLeft = faceMeshSamplesLeft.filter(s => !isNaN(s))
        const validRight = faceMeshSamplesRight.filter(s => !isNaN(s))
        const allValid = [...validLeft, ...validRight]
        const averageFaceMesh = allValid.length
          ? allValid.reduce((a, b) => a + b, 0) / allValid.length
          : 0

        // Compute per-eye means for debug
        const lefts = []
        const rights = []
        for (const d of dist) {
          if (d.closedEyeSide === 'left') lefts.push(d.dist)
          else rights.push(d.dist)
        }
        const leftMean = lefts.length ? average(lefts) : 0
        const rightMean = rights.length ? average(rights) : 0
        const leftAvgFM = validLeft.length
          ? validLeft.reduce((a, b) => a + b, 0) / validLeft.length
          : 0
        const rightAvgFM = validRight.length
          ? validRight.reduce((a, b) => a + b, 0) / validRight.length
          : 0
        const distance1FactorCmPx = leftAvgFM * leftMean
        const distance2FactorCmPx = rightAvgFM * rightMean

        // Calibration factor used for tracking
        // Apply Pythagorean correction: blindspot gives eyeToScreenCm, but we need eyeToCameraCm for calibration
        const halfScreenHeightCm = _calculateDistanceFromCenterToTop(ppi)
        const eyeToCameraCm = Math.sqrt(
          data.value ** 2 - halfScreenHeightCm ** 2,
        )
        const calibrationFactor = averageFaceMesh * eyeToCameraCm

        console.log('=== Blindspot Test Calibration Factor ===')
        console.log('Blindspot distance (eyeToScreenCm):', data.value, 'cm')
        console.log('Half screen height:', halfScreenHeightCm.toFixed(2), 'cm')
        console.log(
          'Corrected distance (eyeToCameraCm):',
          eyeToCameraCm.toFixed(2),
          'cm',
        )
        console.log('Left/Right avg Face Mesh:', leftAvgFM, rightAvgFM, 'px')
        console.log(
          'Left/Right factors (cm*px):',
          distance1FactorCmPx,
          distance2FactorCmPx,
        )
        console.log('Overall avg Face Mesh:', averageFaceMesh, 'px')
        console.log('Calibration factor (overall):', calibrationFactor)
        console.log('=========================================')

        // Store calibration factor and Face Mesh data
        data.calibrationFactor = calibrationFactor
        data.averageFaceMesh = averageFaceMesh
        data.faceMeshSamplesLeft = faceMeshSamplesLeft
        data.faceMeshSamplesRight = faceMeshSamplesRight
        data.distance1FactorCmPx = distance1FactorCmPx
        data.distance2FactorCmPx = distance2FactorCmPx

        // Save successful blindspot calibration attempt
        saveCalibrationAttempt(RC, 'blindspot', data.value, calibrationFactor)

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
            options.calibrateTrackDistanceCheckLengthCm,
          )
        else safeExecuteFunc(callback, data)
      } else {
        const reasonIsOutOfRange = message.includes('out of allowed range')
        let displayMessage = phrases.RC_viewingBlindSpotRejected[RC.L]
          .replace('[[N11]]', min.toFixed(1))
          .replace('[[N22]]', max.toFixed(1))
        if (reasonIsOutOfRange) {
          displayMessage = phrases.RC_viewingExceededRange[RC.L]
            .replace('[[N11]]', min.toFixed(1))
            .replace('[[N22]]', max.toFixed(1))
            .replace('[[N33]]', RMin.toFixed(1))
            .replace('[[N44]]', RMax.toFixed(1))
        }

        // Save failed blindspot calibration attempt
        const distanceMeasured = toFixedNumber(
          median(_getDistValues(dist)),
          options.decimalPlace,
        )
        
        // Calculate averageFaceMesh for failed attempt
        const validLeft = faceMeshSamplesLeft.filter(s => !isNaN(s))
        const validRight = faceMeshSamplesRight.filter(s => !isNaN(s))
        const allValid = [...validLeft, ...validRight]
        const averageFaceMesh = allValid.length
          ? allValid.reduce((a, b) => a + b, 0) / allValid.length
          : 0
        
        const calibrationFactor = averageFaceMesh * Math.sqrt(
          distanceMeasured ** 2 - _calculateDistanceFromCenterToTop(ppi) ** 2
        )
        saveCalibrationAttempt(RC, 'blindspot', distanceMeasured, calibrationFactor)

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

        const isOutOfRangeError = reasonIsOutOfRange
        const inPanelContext = RC._panelStatus.hasPanel

        if (isOutOfRangeError && inPanelContext) {
          Swal.fire({
            ...swalInfoOptions(RC, { showIcon: false }),
            icon: undefined,
            html: displayMessage,
            allowEnterKey: true,
          }).then(() => {
            // Clean up blindspot test before returning to panel
            if (removeKeypadHandler) removeKeypadHandler() // Clean up keypad handler
            breakFunction(false) // Don't break tracking, just clean up test
            RC._returnToPanelForScreenSize()
          })
          return
        } else {
          Swal.fire({
            ...swalInfoOptions(RC, { showIcon: false }),
            icon: undefined,
            html: displayMessage,
            allowEnterKey: true,
          })
        }
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

RemoteCalibrator.prototype.measureDistance = async function (
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
  await blindSpotTest(this, options, false, callback)
}

RemoteCalibrator.prototype.measureDistanceObject = async function (
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

  await objectTest(this, opts, callback)
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

function checkFaceMeshDataRepeatability(page3Samples, page4Samples) {
  // Filter out NaN values and calculate averages
  const validPage3Samples = page3Samples.filter(sample => !isNaN(sample))
  const validPage4Samples = page4Samples.filter(sample => !isNaN(sample))

  // Need at least 3 valid samples from each page for meaningful comparison
  if (validPage3Samples.length < 3 || validPage4Samples.length < 3) {
    console.warn('Insufficient valid Face Mesh samples for tolerance check')
    return false
  }

  const page3Mean =
    validPage3Samples.reduce((a, b) => a + b, 0) / validPage3Samples.length
  const page4Mean =
    validPage4Samples.reduce((a, b) => a + b, 0) / validPage4Samples.length

  console.log('=== Face Mesh Tolerance Check ===')
  console.log('Page 3 average:', page3Mean.toFixed(2), 'px')
  console.log('Page 4 average:', page4Mean.toFixed(2), 'px')
  console.log('Difference:', Math.abs(page3Mean - page4Mean).toFixed(2), 'px')
  console.log(
    'Tolerance threshold:',
    (0.2 * Math.min(page3Mean, page4Mean)).toFixed(2),
    'px',
  )
  console.log(
    'Tolerance check passed:',
    Math.abs(page3Mean - page4Mean) < 0.2 * Math.min(page3Mean, page4Mean),
  )
  console.log('================================')

  return Math.abs(page3Mean - page4Mean) < 0.2 * Math.min(page3Mean, page4Mean)
}

function _getDistValues(dist) {
  const v = []
  for (const d of dist) v.push(d.dist)
  return v
}

// ===================== OBJECT TEST SCHEME =====================
export async function objectTest(RC, options, callback = undefined) {
  RC._addBackground()

  // ===================== PAGE STATE MANAGEMENT =====================
  let currentPage = 1
  let savedMeasurementData = null // Store measurement data from page 2
  // let selectedPage0Option = null // Store the selected radio button option from page 0

  // ===================== FACE MESH CALIBRATION SAMPLES =====================
  // Arrays to store 5 samples per page for calibration
  let faceMeshSamplesPage3 = []
  let faceMeshSamplesPage4 = []

  // Helper to collect 5 samples of eye pixel distance using Face Mesh
  async function collectFaceMeshSamples(RC, arr, ppi) {
    arr.length = 0 // Clear array

    // Always collect exactly 5 samples, using NaN for failed measurements
    for (let i = 0; i < 5; i++) {
      try {
        const pxDist = await measureIntraocularDistancePx(RC) // Get raw pixel distance
        if (pxDist && !isNaN(pxDist)) {
          arr.push(pxDist)
        } else {
          // If Face Mesh returns null, undefined, or NaN, store NaN
          arr.push(NaN)
          console.warn(`Face Mesh measurement ${i + 1} failed, storing NaN`)
        }
      } catch (error) {
        // If there's an error during measurement, store NaN
        arr.push(NaN)
        console.warn(`Face Mesh measurement ${i + 1} error:`, error)
      }

      // Wait 100ms between samples (even for failed measurements)
      await new Promise(res => setTimeout(res, 100))
    }

    // Log the results
    const validSamples = arr.filter(sample => !isNaN(sample))
    const failedSamples = arr.filter(sample => isNaN(sample))

    console.log(
      `Face Mesh samples collected: ${validSamples.length} valid, ${failedSamples.length} failed`,
    )
    console.log(
      'All samples:',
      arr.map(sample => (isNaN(sample) ? 'NaN' : sample.toFixed(2))),
    )

    // Ensure we always have exactly 5 samples
    if (arr.length !== 5) {
      console.error(
        `Expected 5 samples but got ${arr.length}. Padding with NaN.`,
      )
      while (arr.length < 5) {
        arr.push(NaN)
      }
    }
  }

  // ===================== DRAWING THE OBJECT TEST UI =====================

  // --- Calculate screen and layout measurements ---
  // Get the screen's pixels per millimeter (for accurate physical placement)
  const ppi = RC.screenPpi ? RC.screenPpi.value : 96 / 25.4 // fallback: 96dpi/25.4mm
  const pxPerMm = ppi / 25.4

  // The left vertical line is always 5mm from the left edge of the screen
  let leftLinePx = Math.round(5 * pxPerMm) // 5mm from left
  const screenWidth = window.innerWidth

  // The right vertical line starts at 2/3 of the screen width, but is adjustable
  let rightLinePx = Math.round((screenWidth * 2) / 3)

  // --- Calculate the vertical position for all elements (10% lower than center) ---
  const screenCenterY = window.innerHeight * 0.6 // Move 10% lower from center (was 0.5)

  // --- Create the main overlay container ---
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
  title.style.whiteSpace = 'pre-line'
  title.style.alignSelf = 'flex-start'
  title.style.position = 'relative'
  title.style.textAlign = 'start'
  title.style.paddingInlineStart = '3rem'
  title.style.margin = '2rem 0 5rem 0'
  title.dir = RC.LD.toLowerCase()
  container.appendChild(title)

    // Set max-width to avoid video overlap
    const video = document.getElementById('webgazerVideoContainer')
    const videoRect = video.getBoundingClientRect()
    const videoLeftEdge = (screenWidth - videoRect.width) / 2
  // --- INSTRUCTIONS ---
  const instructions = document.createElement('div')
  instructions.style.maxWidth = `${videoLeftEdge - 10}px` 
  instructions.style.paddingLeft = '3rem'
  instructions.style.marginTop = '-2rem'
  instructions.style.textAlign = 'left'
  instructions.style.whiteSpace = 'pre-line'
  instructions.style.alignSelf = 'flex-start'
  instructions.style.position = 'relative'
  instructions.style.zIndex = '3'
  instructions.style.fontSize = '1.4em'
  instructions.style.lineHeight = '1.6'
  instructions.style.textAlign = 'start'
  //padding inline start
  instructions.style.paddingInlineStart = '3rem'
  // Add responsive font size
  instructions.style.fontSize = 'clamp(1.1em, 2.5vw, 1.4em)'
  container.appendChild(instructions)

  // --- RADIO BUTTON CONTAINER ---
  const radioOverlay = document.createElement('div')
  radioOverlay.style.position = 'fixed'
  radioOverlay.style.top = '0'
  radioOverlay.style.left = '0'
  radioOverlay.style.width = '100%'
  radioOverlay.style.height = '100%'
  radioOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.4)'
  radioOverlay.style.zIndex = '9998'
  radioOverlay.style.display = 'none' // Hidden by default
  container.appendChild(radioOverlay)

  // TODO: COMMENTED OUT - radioContainer logic will be integrated elsewhere
  // const radioContainer = document.createElement('div')
  // radioContainer.id = 'custom-radio-group'
  // radioContainer.style.position = 'relative' // Changed from fixed to relative
  // radioContainer.style.marginTop = '0.5rem' // Decreased from 2rem to 1rem for smaller gap
  // radioContainer.style.marginLeft = '3rem' // Match instructions padding
  // radioContainer.style.backgroundColor = 'transparent'
  // radioContainer.style.borderRadius = '0.5rem'
  // radioContainer.style.padding = '0' // Remove padding since we're using margin
  // radioContainer.style.zIndex = '9999'
  // radioContainer.style.width = '45vw' // Match instructions maxWidth
  // radioContainer.style.maxWidth = '45vw' // Match instructions maxWidth
  // radioContainer.style.textAlign = 'left'
  // radioContainer.style.display = 'none' // Hidden by default
  // //padding when its rtl/ltr
  // radioContainer.style.paddingInlineStart = '3rem'
  // container.appendChild(radioContainer)

  // // Create radio button options
  // const radioOptions = [
  //   { value: 'yes', label: phrases.RC_Yes[RC.L] },
  //   { value: 'no', label: phrases.RC_No[RC.L] },
  //   { value: 'dontknow', label: phrases.RC_DontKnow[RC.L] },
  // ]

  // // Create a flex container for side-by-side layout
  // const radioFlexContainer = document.createElement('div')
  // radioFlexContainer.style.display = 'flex'
  // radioFlexContainer.style.justifyContent = 'flex-start'
  // radioFlexContainer.style.alignItems = 'center'
  // radioFlexContainer.style.gap = '0.5em'
  // radioContainer.appendChild(radioFlexContainer)

  // // --- Validation message for radio selection ---
  // const validationMessage = document.createElement('div')
  // validationMessage.style.color = 'red'
  // validationMessage.style.fontSize = 'clamp(0.9em, 2vw, 0.95em)' // Responsive font size
  // validationMessage.style.marginTop = '0.5em'
  // validationMessage.style.display = 'none'
  // validationMessage.style.textAlign = 'left'
  // validationMessage.textContent = phrases.RC_PleaseSelectAnOption[RC.L]
  // radioContainer.appendChild(validationMessage)

  // radioOptions.forEach(option => {
  //   const container = document.createElement('div')
  //   container.style.display = 'flex'
  //   container.style.flexDirection = 'row'
  //   container.style.alignItems = 'center'
  //   container.style.gap = '0.2em'

  //   const radio = document.createElement('input')
  //   radio.type = 'radio'
  //   radio.name = 'page0option'
  //   radio.value = option.value
  //   radio.style.cursor = 'pointer'
  //   radio.style.transform = 'scale(1.2)'
  //   radio.className = 'custom-input-class' // Add class for keyboard handling
  //   // Hide validation message when any radio is selected
  //   radio.addEventListener('change', () => {
  //     validationMessage.style.display = 'none'
  //   })

  //   const span = document.createElement('span')
  //   span.textContent = option.label
  //   span.style.fontSize = 'clamp(1.1em, 2.5vw, 1.4em)' // Responsive font size
  //   span.style.lineHeight = '1.6'
  //   span.style.whiteSpace = 'nowrap'
  //   span.style.userSelect = 'none' // Prevent text selection

  //   container.appendChild(radio)
  //   container.appendChild(span)
  //   radioFlexContainer.appendChild(container)
  // })

  // // Add keyboard event listeners for radio buttons
  // const customInputs = radioContainer.querySelectorAll('.custom-input-class')
  // const keydownListener = event => {
  //   if (event.key === 'Enter') {
  //     // Check if a radio button is selected before proceeding
  //     const selectedRadio = document.querySelector(
  //       'input[name="page0option"]:checked',
  //     )
  //     if (selectedRadio) {
  //       nextPage() // Simulate the "PROCEED" button click
  //     }
  //   }
  // }

  // customInputs.forEach(input => {
  //   input.addEventListener('keyup', keydownListener)
  // })

  // // Add EasyEyes keypad handler support
  // if (RC.keypadHandler) {
  //   const removeKeypadHandler = setUpEasyEyesKeypadHandler(
  //     null,
  //     RC.keypadHandler,
  //     () => {
  //       removeKeypadHandler()
  //       // Check if a radio button is selected before proceeding
  //       const selectedRadio = document.querySelector(
  //         'input[name="page0option"]:checked',
  //       )
  //       if (selectedRadio) {
  //         nextPage() // Simulate the "PROCEED" button click
  //       }
  //     },
  //     false,
  //     ['return'],
  //     RC,
  //   )
  // }

  // ===================== DRAWING THE VERTICAL LINES =====================

  // --- Style for both vertical lines (left and right) ---
  // Both lines are the same color, thickness, and height
  // Calculate 3/4 inch in pixels for shorter lines
  const threeQuarterInchesInPx = Math.round(0.75 * ppi) // 3/4 inch * pixels per inch
  const lineThickness = 3 // px, now set to 3px
  const verticalLineStyle = `
    position: absolute; 
    top: ${screenCenterY}px; 
    transform: translateY(-50%); 
    height: ${threeQuarterInchesInPx}px; 
    width: ${lineThickness}px; 
    background: rgb(0, 0, 0); 
    border-radius: 2px; 
    box-shadow: 0 0 8px rgba(0, 0, 0, 0.4);
    z-index: 1;
  `

  // --- Left vertical line ---
  // Fixed at 5mm from the left edge
  const leftLine = document.createElement('div')
  leftLine.style =
    verticalLineStyle + `left: ${leftLinePx}px; cursor: ew-resize;`
  container.appendChild(leftLine)

  // --- Right vertical line ---
  // Starts at 2/3 of the screen width, but is draggable and keyboard-movable
  const rightLine = document.createElement('div')
  rightLine.style =
    verticalLineStyle + `left: ${rightLinePx}px; cursor: ew-resize;`
  container.appendChild(rightLine)

  // ===================== DRAWING THE HORIZONTAL CONNECTOR LINES =====================

  // --- Rectangle background fill ---
  const rectangleBackground = document.createElement('div')
  rectangleBackground.style.position = 'absolute'
  rectangleBackground.style.left = `${leftLinePx}px`
  rectangleBackground.style.width = `${rightLinePx - leftLinePx + lineThickness}px`
  rectangleBackground.style.top = `calc(${screenCenterY}px - ${threeQuarterInchesInPx / 2}px)`
  rectangleBackground.style.height = `${threeQuarterInchesInPx}px`
  rectangleBackground.style.background = 'rgba(255, 221, 51, 0.95)' // (255, 221, 51)Bright tape measure yellow
  rectangleBackground.style.borderRadius = '2px'
  rectangleBackground.style.zIndex = '0' // Behind all lines
  container.appendChild(rectangleBackground)

  // --- Top horizontal line connecting the vertical lines ---
  const topHorizontalLine = document.createElement('div')
  topHorizontalLine.style.position = 'absolute'
  topHorizontalLine.style.left = `${leftLinePx}px`
  topHorizontalLine.style.width = `${rightLinePx - leftLinePx + lineThickness}px`
  topHorizontalLine.style.top = `calc(${screenCenterY}px - ${threeQuarterInchesInPx / 2}px)`
  topHorizontalLine.style.height = `${lineThickness}px`
  topHorizontalLine.style.background = 'rgb(0, 0, 0)'
  topHorizontalLine.style.borderRadius = '2px'
  topHorizontalLine.style.boxShadow = '0 0 8px rgba(0, 0, 0, 0.4)'
  topHorizontalLine.style.zIndex = '1'
  container.appendChild(topHorizontalLine)

  // --- Bottom horizontal line connecting the vertical lines ---
  const bottomHorizontalLine = document.createElement('div')
  bottomHorizontalLine.style.position = 'absolute'
  bottomHorizontalLine.style.left = `${leftLinePx}px`
  bottomHorizontalLine.style.width = `${rightLinePx - leftLinePx + lineThickness}px`
  bottomHorizontalLine.style.top = `calc(${screenCenterY}px + ${threeQuarterInchesInPx / 2}px - ${lineThickness}px)`
  bottomHorizontalLine.style.height = `${lineThickness}px`
  bottomHorizontalLine.style.background = 'rgb(0, 0, 0)'
  bottomHorizontalLine.style.borderRadius = '2px'
  bottomHorizontalLine.style.boxShadow = '0 0 8px rgba(0, 0, 0, 0.4)'
  bottomHorizontalLine.style.zIndex = '1'
  container.appendChild(bottomHorizontalLine)

  // ===================== LABELS FOR VERTICAL LINES =====================

  // --- Label for the left vertical line ---
  // Tells the user to align the left edge of their object here
  const leftLabel = document.createElement('div')
  leftLabel.innerText = phrases.RC_LeftEdge[RC.L]
  leftLabel.style.position = 'absolute'
  leftLabel.style.left = `${leftLinePx + lineThickness}px` // Slightly right of the line
  leftLabel.style.top = `calc(${screenCenterY}px + ${threeQuarterInchesInPx / 2}px + 20px)` // Below the centered line with 20px gap
  leftLabel.style.color = 'rgb(0, 0, 0)'
  leftLabel.style.fontWeight = 'normal'
  leftLabel.style.fontSize = '1.4em'
  leftLabel.style.width = '240px' // Fixed width for square shape
  leftLabel.style.maxWidth = '240px' // Ensure it doesn't exceed the bounding box
  leftLabel.style.overflowWrap = 'break-word' // Modern CSS property for word wrapping
  leftLabel.style.wordWrap = 'break-word' // Enable word wrapping
  leftLabel.style.textAlign = 'left' // Align text to the left
  leftLabel.style.lineHeight = '1.2' // Tighter line height for better square appearance
  container.appendChild(leftLabel)

  // --- Label for the right vertical line ---
  // Tells the user to move this line to the right edge of their object
  const rightLabel = document.createElement('div')
  rightLabel.innerText = phrases.RC_RightEdge[RC.L]
  rightLabel.style.position = 'absolute'
  rightLabel.style.left = `${rightLinePx + lineThickness}px` // Slightly right of the line
  rightLabel.style.top = `calc(${screenCenterY}px + ${threeQuarterInchesInPx / 2}px + 20px)` // Below the centered line with 20px gap
  rightLabel.style.color = 'rgb(0, 0, 0)'
  rightLabel.style.fontWeight = 'normal'
  rightLabel.style.fontSize = '1.4em'
  rightLabel.style.width = '240px' // Fixed width for square shape
  rightLabel.style.maxWidth = '240px' // Ensure it doesn't exceed the bounding box
  rightLabel.style.overflowWrap = 'break-word' // Modern CSS property for word wrapping
  rightLabel.style.wordWrap = 'break-word' // Enable word wrapping
  rightLabel.style.textAlign = 'left' // Align text to the left
  rightLabel.style.lineHeight = '1.2' // Tighter line height for better square appearance
  rightLabel.id = 'right-line-label'
  container.appendChild(rightLabel)

  // Function to update line colors based on distance - MOVED HERE after elements are created
  const updateLineColors = () => {
    const objectLengthPx = rightLinePx - leftLinePx
    const objectLengthMm = objectLengthPx / pxPerMm
    const objectLengthCm = objectLengthMm / 10

    // Get minimum distance threshold with default value of 10cm if not specified
    const minDistanceCm = options.calibrateTrackDistanceMinCm || 10

    console.log('updateLineColors called:', {
      objectLengthPx,
      objectLengthMm,
      objectLengthCm,
      minDistanceCm,
      shouldBeRed: objectLengthCm <= minDistanceCm,
    })

    // If distance is less than or equal to minimum distance, change to red and update label text and position
    if (objectLengthCm <= minDistanceCm) {
      leftLine.style.background = 'rgb(255, 0, 0)'
      leftLine.style.boxShadow = '0 0 8px rgba(255, 0, 0, 0.4)'
      rightLine.style.background = 'rgb(255, 0, 0)'
      rightLine.style.boxShadow = '0 0 8px rgba(255, 0, 0, 0.4)'
      topHorizontalLine.style.background = 'rgb(255, 0, 0)'
      topHorizontalLine.style.boxShadow = '0 0 8px rgba(255, 0, 0, 0.4)'
      bottomHorizontalLine.style.background = 'rgb(255, 0, 0)'
      bottomHorizontalLine.style.boxShadow = '0 0 8px rgba(255, 0, 0, 0.4)'
      rightLabel.style.color = 'rgb(255, 0, 0)'
      rightLabel.innerText = phrases.RC_viewingDistanceObjectTooShort[RC.L]
      rightLabel.style.top = `calc(${screenCenterY}px + ${threeQuarterInchesInPx / 2}px + 20px)` // Below the centered line with 20px gap
      rightLabel.style.width = '440px' // Wider for red warning
      rightLabel.style.maxWidth = '440px' // Ensure it doesn't exceed the bounding box
      console.log('Changed to RED')
    } else {
      leftLine.style.background = 'rgb(0, 0, 0)'
      leftLine.style.boxShadow = '0 0 8px rgba(0, 0, 0, 0.4)'
      rightLine.style.background = 'rgb(0, 0, 0)'
      rightLine.style.boxShadow = '0 0 8px rgba(0, 0, 0, 0.4)'
      topHorizontalLine.style.background = 'rgb(0, 0, 0)'
      topHorizontalLine.style.boxShadow = '0 0 8px rgba(0, 0, 0, 0.4)'
      bottomHorizontalLine.style.background = 'rgb(0, 0, 0)'
      bottomHorizontalLine.style.boxShadow = '0 0 8px rgba(0, 0, 0, 0.4)'
      rightLabel.style.color = 'rgb(0, 0, 0)'
      rightLabel.innerText = phrases.RC_RightEdge[RC.L]
      rightLabel.style.top = `calc(${screenCenterY}px + ${threeQuarterInchesInPx / 2}px + 20px)` // Below the centered line with 20px gap
      rightLabel.style.width = '240px' // Default width
      rightLabel.style.maxWidth = '240px' // Ensure it doesn't exceed the bounding box
      console.log('Changed to GREEN')
    }
  }

  // Add hover effects to both lines
  ;[leftLine, rightLine].forEach(line => {
    line.addEventListener('mouseenter', () => {
      line.style.boxShadow = '0 0 12px rgba(0, 0, 0, 0.6)'
      line.style.width = `${lineThickness}px`
    })
    line.addEventListener('mouseleave', () => {
      line.style.boxShadow = '0 0 8px rgba(0, 0, 0, 0.4)'
      line.style.width = `${lineThickness}px`
      updateLineColors() // Update colors after hover effect
    })
  })

  // Update right label position and line colors when rightLine moves (drag or keyboard)
  function updateRightLabel() {
    rightLabel.style.left = `${rightLinePx + lineThickness}px`
    updateLineColors() // Update colors when line moves
    updateHorizontalLine() // Update horizontal line and dynamic length
    updateRectangleLines() // Update rectangle connector lines
  }

  // Update left label position and line colors when leftLine moves (drag or keyboard)
  function updateLeftLabel() {
    leftLabel.style.left = `${leftLinePx + lineThickness}px`
    updateLineColors() // Update colors when line moves
    updateHorizontalLine() // Update horizontal line and dynamic length
    updateRectangleLines() // Update rectangle connector lines
  }

  // Function to update rectangle connector lines
  function updateRectangleLines() {
    rectangleBackground.style.left = `${leftLinePx}px`
    rectangleBackground.style.width = `${rightLinePx - leftLinePx + lineThickness}px`
    topHorizontalLine.style.left = `${leftLinePx}px`
    topHorizontalLine.style.width = `${rightLinePx - leftLinePx + lineThickness}px`
    bottomHorizontalLine.style.left = `${leftLinePx}px`
    bottomHorizontalLine.style.width = `${rightLinePx - leftLinePx + lineThickness}px`

    // Update dynamic length label position since rectangle changed
    updateDynamicLength()
  }

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
    x = Math.max(leftLinePx + 10, Math.min(x, screenWidth)) // Changed from screenWidth - 2 to screenWidth
    rightLinePx = x
    rightLine.style.left = `${rightLinePx}px`
    updateRightLabel()
  })
  window.addEventListener('mouseup', () => {
    dragging = false
    document.body.style.cursor = ''
  })

  // --- Allow the user to drag the left vertical line horizontally ---
  let leftDragging = false
  leftLine.addEventListener('mousedown', e => {
    leftDragging = true
    document.body.style.cursor = 'ew-resize'
    e.preventDefault()
  })
  window.addEventListener('mousemove', e => {
    if (!leftDragging) return
    let x = e.clientX
    // Clamp so it can't cross the right line or go off screen
    x = Math.max(0, Math.min(x, rightLinePx - 2)) // Changed from 2 to 0 to touch left edge
    leftLinePx = x
    leftLine.style.left = `${leftLinePx}px`
    updateLeftLabel()
  })
  window.addEventListener('mouseup', () => {
    leftDragging = false
    document.body.style.cursor = ''
  })

  // ===================== KEYBOARD HANDLING FOR RIGHT LINE =====================
  let arrowKeyDown = false
  let arrowIntervalFunction = null
  let currentArrowKey = null

  const arrowDownFunction = e => {
    // Only handle arrow keys on page 2
    if (currentPage !== 2) return

    // Prevent default behavior
    e.preventDefault()

    // Only handle left and right arrow keys
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return

    // If already handling a key, ignore
    if (arrowKeyDown) return

    arrowKeyDown = true
    currentArrowKey = e.key
    // Removed orange color change for active movement

    // Clear any existing interval
    if (arrowIntervalFunction) {
      clearInterval(arrowIntervalFunction)
    }

    // Start continuous movement
    arrowIntervalFunction = setInterval(() => {
      if (currentArrowKey === 'ArrowLeft') {
        rightLinePx -= 5 // Move left by 5px
        helpMoveRightLine()
      } else if (currentArrowKey === 'ArrowRight') {
        rightLinePx += 5 // Move right by 5px
        helpMoveRightLine()
      }
    }, 50) // Update every 50ms for smooth movement
  }

  const arrowUpFunction = e => {
    // Only handle arrow keys on page 2
    if (currentPage !== 2) return

    // Only handle left and right arrow keys
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return

    // Only stop if this is the key we're currently handling
    if (currentArrowKey !== e.key) return

    arrowKeyDown = false
    currentArrowKey = null

    // Removed color restoration since we're not changing colors anymore

    // Clear the interval
    if (arrowIntervalFunction) {
      clearInterval(arrowIntervalFunction)
      arrowIntervalFunction = null
    }
  }

  const helpMoveRightLine = () => {
    // Clamp the position so it can't cross the left line or go off screen
    const minX = leftLinePx + 10 // Changed from 20px to 10px minimum gap from left line
    const maxX = screenWidth // Changed from screenWidth - 10 to screenWidth to touch right edge

    rightLinePx = Math.max(minX, Math.min(rightLinePx, maxX))

    // Update the visual position
    rightLine.style.left = `${rightLinePx}px`
    updateRightLabel()
  }

  // Add keyboard event listeners
  const handleArrowKeys = e => {
    if (e.type === 'keydown') {
      arrowDownFunction(e)
    } else if (e.type === 'keyup') {
      arrowUpFunction(e)
    }
  }

  // Add event listeners for arrow keys
  document.addEventListener('keydown', handleArrowKeys)
  document.addEventListener('keyup', handleArrowKeys)

  // Clean up keyboard event listener when done
  const cleanupKeyboard = () => {
    // Cleanup function for any remaining event listeners
    document.removeEventListener('keydown', handleArrowKeys)
    document.removeEventListener('keyup', handleArrowKeys)

    // Clear any active intervals
    if (arrowIntervalFunction) {
      clearInterval(arrowIntervalFunction)
      arrowIntervalFunction = null
    }
  }
  window.addEventListener('beforeunload', cleanupKeyboard)

  // ===================== DRAWING THE HORIZONTAL LINE AND ARROWHEADS =====================
  // --- Calculate the vertical position for the horizontal line (center of screen) ---
  const lineColor = 'rgb(0, 0, 0)'

  // --- Horizontal line ---
  const horizontalLine = document.createElement('div')
  horizontalLine.style.position = 'absolute'
  horizontalLine.style.left = `${leftLinePx + lineThickness}px` // Start at inside edge of left vertical line
  horizontalLine.style.right = `${window.innerWidth - rightLinePx}px` // End at inner edge of right line
  horizontalLine.style.top = `${screenCenterY}px` // Center vertically
  horizontalLine.style.height = `${lineThickness}px`
  horizontalLine.style.background = lineColor // Solid line
  horizontalLine.style.borderRadius = '2px'
  horizontalLine.style.boxShadow = '0 0 8px rgba(0, 0, 0, 0.4)'
  horizontalLine.style.zIndex = '2'
  container.appendChild(horizontalLine)

  // --- Left arrow line (45 degrees down) ---
  const leftArrowLine = document.createElement('div')
  leftArrowLine.style.position = 'absolute'
  leftArrowLine.style.left = `${leftLinePx + lineThickness + lineThickness * 0.4}px` // Account for rotation overlap
  leftArrowLine.style.top = `${screenCenterY}px` // Closer to horizontal line
  leftArrowLine.style.width = `${lineThickness * 9}px` // Length for proper arrow tip (3x longer)
  leftArrowLine.style.height = `${lineThickness}px`
  leftArrowLine.style.background = lineColor
  leftArrowLine.style.borderRadius = '2px'
  leftArrowLine.style.boxShadow = '0 0 8px rgba(0, 0, 0, 0.4)'
  leftArrowLine.style.zIndex = '5' // Above all other elements
  leftArrowLine.style.transform = 'rotate(45deg)'
  leftArrowLine.style.transformOrigin = 'left center'
  container.appendChild(leftArrowLine)

  // --- Right arrow line (45 degrees down) ---
  const rightArrowLine = document.createElement('div')
  rightArrowLine.style.position = 'absolute'
  rightArrowLine.style.left = `${rightLinePx - lineThickness * 9 - lineThickness * 0.4}px` // Account for rotation overlap
  rightArrowLine.style.top = `${screenCenterY}px` // Closer to horizontal line
  rightArrowLine.style.width = `${lineThickness * 9}px` // Length for proper arrow tip (3x longer)
  rightArrowLine.style.height = `${lineThickness}px`
  rightArrowLine.style.background = lineColor
  rightArrowLine.style.borderRadius = '2px'
  rightArrowLine.style.boxShadow = '0 0 8px rgba(0, 0, 0, 0.4)'
  rightArrowLine.style.zIndex = '5' // Above all other elements
  rightArrowLine.style.transform = 'rotate(-45deg)'
  rightArrowLine.style.transformOrigin = 'right center'
  container.appendChild(rightArrowLine)

  // --- Left arrow line (45 degrees up) ---
  const leftArrowLineUp = document.createElement('div')
  leftArrowLineUp.style.position = 'absolute'
  leftArrowLineUp.style.left = `${leftLinePx + lineThickness + lineThickness * 0.4}px` // Account for rotation overlap
  leftArrowLineUp.style.top = `${screenCenterY}px` // Closer to horizontal line
  leftArrowLineUp.style.width = `${lineThickness * 9}px` // Length for proper arrow tip (3x longer)
  leftArrowLineUp.style.height = `${lineThickness}px`
  leftArrowLineUp.style.background = lineColor
  leftArrowLineUp.style.borderRadius = '2px'
  leftArrowLineUp.style.boxShadow = '0 0 8px rgba(0, 0, 0, 0.4)'
  leftArrowLineUp.style.zIndex = '5' // Above all other elements
  leftArrowLineUp.style.transform = 'rotate(-45deg)'
  leftArrowLineUp.style.transformOrigin = 'left center'
  container.appendChild(leftArrowLineUp)

  // --- Right arrow line (45 degrees up) ---
  const rightArrowLineUp = document.createElement('div')
  rightArrowLineUp.style.position = 'absolute'
  rightArrowLineUp.style.left = `${rightLinePx - lineThickness * 9 - lineThickness * 0.4}px` // Account for rotation overlap
  rightArrowLineUp.style.top = `${screenCenterY}px` // Closer to horizontal line
  rightArrowLineUp.style.width = `${lineThickness * 9}px` // Length for proper arrow tip (3x longer)
  rightArrowLineUp.style.height = `${lineThickness}px`
  rightArrowLineUp.style.background = lineColor
  rightArrowLineUp.style.borderRadius = '2px'
  rightArrowLineUp.style.boxShadow = '0 0 8px rgba(0, 0, 0, 0.4)'
  rightArrowLineUp.style.zIndex = '5' // Above all other elements
  rightArrowLineUp.style.transform = 'rotate(45deg)'
  rightArrowLineUp.style.transformOrigin = 'right center'
  container.appendChild(rightArrowLineUp)

  // --- Dynamic length label ---
  const dynamicLengthLabel = document.createElement('div')
  dynamicLengthLabel.style.position = 'absolute'
  dynamicLengthLabel.style.color = 'rgb(0, 0, 0)'
  dynamicLengthLabel.style.fontWeight = 'bold'
  dynamicLengthLabel.style.fontSize = '1.4rem' // Reduced from 1.8rem to ensure it fits
  dynamicLengthLabel.style.zIndex = '4' // Above all lines
  dynamicLengthLabel.style.textAlign = 'center'
  dynamicLengthLabel.style.background = 'rgba(255, 221, 51, 1.0)' // Bright tape measure yellow, same as rectangle, 100% opacity
  dynamicLengthLabel.style.padding = '2px 6px' // Reduced padding to fit better
  dynamicLengthLabel.style.borderRadius = '4px'
  dynamicLengthLabel.style.whiteSpace = 'nowrap' // Prevent text wrapping
  dynamicLengthLabel.style.transform = 'translate(-50%, -50%)' // Center using transform
  container.appendChild(dynamicLengthLabel)

  // Function to update dynamic length display and position
  const updateDynamicLength = () => {
    const objectLengthPx = rightLinePx - leftLinePx
    const objectLengthMm = objectLengthPx / pxPerMm
    const objectLengthCm = objectLengthMm / 10
    dynamicLengthLabel.innerText = `${objectLengthCm.toFixed(1)} cm`

    // Calculate the center of the rectangle
    const rectangleCenterX = leftLinePx + (rightLinePx - leftLinePx) / 2
    const rectangleCenterY = screenCenterY // This is the center of the rectangle vertically

    // Position the label at the center of the rectangle
    dynamicLengthLabel.style.left = `${rectangleCenterX}px`
    dynamicLengthLabel.style.top = `${rectangleCenterY}px`

    // Adjust font size if the rectangle is too small
    const rectangleWidth = rightLinePx - leftLinePx

    // More accurate estimation of label width based on text content
    const textLength = dynamicLengthLabel.innerText.length
    const baseCharWidth = 10 // Average character width in pixels
    const padding = 12 // Horizontal padding
    const estimatedLabelWidth = textLength * baseCharWidth + padding

    // If label would be too wide for rectangle, reduce font size
    const maxAllowedWidth = rectangleWidth * 0.85 // Leave 15% margin
    if (estimatedLabelWidth > maxAllowedWidth) {
      const scaleFactor = maxAllowedWidth / estimatedLabelWidth
      const newFontSize = Math.max(0.7, scaleFactor) * 1.4 // Minimum 0.7rem
      dynamicLengthLabel.style.fontSize = `${newFontSize}rem`
    } else {
      // Reset to default size if there's enough space
      dynamicLengthLabel.style.fontSize = '1.4rem'
    }
  }

  // Function to update horizontal line positions
  const updateHorizontalLine = () => {
    // Get current screenCenterY value (in case window was resized)
    const currentScreenCenterY = window.innerHeight * 0.6

    // Update horizontal line position to connect the vertical lines directly
    horizontalLine.style.left = `${leftLinePx + lineThickness}px` // Start at inside edge of left vertical line
    horizontalLine.style.right = `${window.innerWidth - rightLinePx}px` // End at inner edge of right line
    //horizontalLine.style.top = `${currentScreenCenterY}px` // Use current 10% lower position

    // Update arrow line positions - account for rotation overlap
    leftArrowLine.style.left = `${leftLinePx + lineThickness + lineThickness * 0.4}px` // Account for rotation overlap
    // //leftArrowLine.style.top = `${currentScreenCenterY}px` // Use current 10% lower position
    rightArrowLine.style.left = `${rightLinePx - lineThickness * 9 - lineThickness * 0.4}px` // Account for rotation overlap
    // //rightArrowLine.style.top = `${currentScreenCenterY}px` // Use current 10% lower position
    leftArrowLineUp.style.left = `${leftLinePx + lineThickness + lineThickness * 0.4}px` // Account for rotation overlap
    // //leftArrowLineUp.style.top = `${currentScreenCenterY}px` // Use current 10% lower position
    rightArrowLineUp.style.left = `${rightLinePx - lineThickness * 9 - lineThickness * 0.4}px` // Account for rotation overlap
    // //rightArrowLineUp.style.top = `${currentScreenCenterY}px` // Use current 10% lower position

    // Update dynamic length (this now handles positioning too)
    updateDynamicLength()
  }

  // Update positions when window is resized
  window.addEventListener('resize', () => {
    //updateHorizontalLine() // This will update all horizontal line and arrow positions
  })

  // ===================== END DRAWING =====================

  // Add to background
  RC._replaceBackground('') // Clear any previous content
  RC.background.appendChild(container)

  // Ensure video is properly positioned after adding object test container
  const videoContainer = document.getElementById('webgazerVideoContainer')
  if (videoContainer) {
    setDefaultVideoPosition(RC, videoContainer)
  }

  // ===================== PAGE NAVIGATION FUNCTIONS =====================
  const showPage = async pageNumber => {
    currentPage = pageNumber

    if (pageNumber === 0) {
      // ===================== PAGE 0: INSTRUCTIONS ONLY =====================
      console.log('=== SHOWING PAGE 0: INSTRUCTIONS ONLY ===')

      // Hide all lines and labels
      horizontalLine.style.display = 'none'
      leftArrowLine.style.display = 'none'
      rightArrowLine.style.display = 'none'
      leftArrowLineUp.style.display = 'none'
      rightArrowLineUp.style.display = 'none'
      dynamicLengthLabel.style.display = 'none'
      leftLine.style.display = 'none'
      rightLine.style.display = 'none'
      leftLabel.style.display = 'none'
      rightLabel.style.display = 'none'
      topHorizontalLine.style.display = 'none'
      bottomHorizontalLine.style.display = 'none'
      rectangleBackground.style.display = 'none'

      // // Show radio buttons on page 0
      // radioContainer.style.display = 'block'

      // Show PROCEED button on page 0
      proceedButton.style.display = 'block'

      // Hide don't use ruler text if it exists
      if (options.calibrateTrackDistanceCheckBool) {
        const dontUseRuler = document.querySelector(
          'div[style*="color: rgb(139, 0, 0)"]',
        )
        if (dontUseRuler) {
          dontUseRuler.style.display = 'none'
        }
      }

      // Update instructions
      instructions.innerText =
        phrases.RC_UseObjectToSetViewingDistancePage0q[RC.L]
    } else if (pageNumber === 1) {
      // ===================== PAGE 1: NO LINES =====================
      console.log('=== SHOWING PAGE 1: NO LINES ===')

      // Hide all lines and labels
      horizontalLine.style.display = 'none'
      leftArrowLine.style.display = 'none'
      rightArrowLine.style.display = 'none'
      leftArrowLineUp.style.display = 'none'
      rightArrowLineUp.style.display = 'none'
      dynamicLengthLabel.style.display = 'none'
      leftLine.style.display = 'none'
      rightLine.style.display = 'none'
      leftLabel.style.display = 'none'
      rightLabel.style.display = 'none'
      topHorizontalLine.style.display = 'none'
      bottomHorizontalLine.style.display = 'none'
      rectangleBackground.style.display = 'none'

      // // Hide radio buttons on page 1
      // radioContainer.style.display = 'none'

      // Show PROCEED button on page 1
      proceedButton.style.display = 'block'

      // Hide don't use ruler text if it exists
      if (options.calibrateTrackDistanceCheckBool) {
        const dontUseRuler = document.querySelector(
          'div[style*="color: rgb(139, 0, 0)"]',
        )
        if (dontUseRuler) {
          dontUseRuler.style.display = 'none'
        }
      }

      // Update instructions
      instructions.innerText =
        phrases.RC_UseObjectToSetViewingDistancePage1[RC.L]
    } else if (pageNumber === 2) {
      // ===================== PAGE 2: VERTICAL LINES + HORIZONTAL LINE =====================
      console.log('=== SHOWING PAGE 2: VERTICAL LINES + HORIZONTAL LINE ===')

      // Show vertical lines and horizontal line
      horizontalLine.style.display = 'block'
      leftArrowLine.style.display = 'block'
      rightArrowLine.style.display = 'block'
      leftArrowLineUp.style.display = 'block'
      rightArrowLineUp.style.display = 'block'
      dynamicLengthLabel.style.display = 'block'
      leftLine.style.display = 'block'
      rightLine.style.display = 'block'
      leftLabel.style.display = 'block'
      rightLabel.style.display = 'block'
      topHorizontalLine.style.display = 'block'
      bottomHorizontalLine.style.display = 'block'
      rectangleBackground.style.display = 'block'

      // // Hide radio buttons on page 2
      // radioContainer.style.display = 'none'

      // Hide PROCEED button on page 2 - only allow space key
      proceedButton.style.display = 'none'

      // Create placeholder text for page 2 only if calibrateTrackDistanceCheckBool is true
      if (options.calibrateTrackDistanceCheckBool) {
        const dontUseRuler = document.createElement('div')
        dontUseRuler.innerText = phrases.RC_DontUseYourRulerYet[RC.L]
        dontUseRuler.style.position = 'fixed'
        dontUseRuler.style.top = '0'
        dontUseRuler.style.marginTop = '2rem'
        dontUseRuler.style.right = '3rem'
        dontUseRuler.style.color = '#8B0000' // Dark red ink
        dontUseRuler.style.fontSize = '16pt'
        dontUseRuler.style.fontWeight = 'normal'
        dontUseRuler.style.zIndex = '10'
        dontUseRuler.style.userSelect = 'none'
        dontUseRuler.style.textAlign = 'right'
        dontUseRuler.style.lineHeight = '1.6'
        dontUseRuler.style.textAlign = 'start'
        //dontUseRuler.dir = RC.LD.toLowerCase()
        dontUseRuler.style.maxWidth = '40vw'
        dontUseRuler.style.paddingInlineStart = '3rem'

        if (RC.LD === RC._CONST.RTL) {
          dontUseRuler.style.textAlign = 'left'
          dontUseRuler.style.left = '3rem'
        }
        container.appendChild(dontUseRuler)
      }

      // Update all positions and colors after showing lines
      updateRightLabel()
      updateLeftLabel()
      updateLineColors()
      updateHorizontalLine() // Update horizontal line and dynamic length
      updateRectangleLines() // Update rectangle connector lines

      // Update instructions with combined phrase
      instructions.innerText =
        phrases['RC_UseObjectToSetViewingDistancePage1&2'][RC.L]
    } else if (pageNumber === 3) {
      // ===================== PAGE 3: VIDEO ONLY =====================
      console.log('=== SHOWING PAGE 3: VIDEO ONLY ===')

      // Hide all lines and labels
      horizontalLine.style.display = 'none'
      leftArrowLine.style.display = 'none'
      rightArrowLine.style.display = 'none'
      leftArrowLineUp.style.display = 'none'
      rightArrowLineUp.style.display = 'none'
      dynamicLengthLabel.style.display = 'none'
      leftLine.style.display = 'none'
      rightLine.style.display = 'none'
      leftLabel.style.display = 'none'
      rightLabel.style.display = 'none'
      topHorizontalLine.style.display = 'none'
      bottomHorizontalLine.style.display = 'none'
      rectangleBackground.style.display = 'none'

      // // Hide radio buttons on page 3
      // radioContainer.style.display = 'none'

      // Hide PROCEED button on page 3 - only allow space key
      proceedButton.style.display = 'none'

      // Update instructions
      instructions.innerText =
        phrases.RC_UseObjectToSetViewingDistancePage3[RC.L]

      // Note: Face Mesh samples will be collected when space key is pressed
      console.log(
        '=== PAGE 3 READY - PRESS SPACE TO CAPTURE FACE MESH DATA ===',
      )
    } else if (pageNumber === 4) {
      // ===================== PAGE 4: VIDEO ONLY =====================
      console.log('=== SHOWING PAGE 4: VIDEO ONLY ===')

      // Keep all lines and labels hidden
      horizontalLine.style.display = 'none'
      leftArrowLine.style.display = 'none'
      rightArrowLine.style.display = 'none'
      leftArrowLineUp.style.display = 'none'
      rightArrowLineUp.style.display = 'none'
      dynamicLengthLabel.style.display = 'none'
      leftLine.style.display = 'none'
      rightLine.style.display = 'none'
      leftLabel.style.display = 'none'
      rightLabel.style.display = 'none'
      topHorizontalLine.style.display = 'none'
      bottomHorizontalLine.style.display = 'none'
      rectangleBackground.style.display = 'none'

      // // Hide radio buttons on page 4
      // radioContainer.style.display = 'none'

      // Hide PROCEED button on page 4 - only allow space key
      proceedButton.style.display = 'none'

      // Update instructions
      instructions.innerText =
        phrases.RC_UseObjectToSetViewingDistancePage4[RC.L]

      // Note: Face Mesh samples will be collected when space key is pressed
      console.log(
        '=== PAGE 4 READY - PRESS SPACE TO CAPTURE FACE MESH DATA ===',
      )
    }
  }

  const nextPage = async () => {
    if (currentPage === 0) {
      // // Check if a radio button option is selected
      // const selectedRadio = document.querySelector(
      //   'input[name="page0option"]:checked',
      // )
      // if (!selectedRadio) {
      //   // Show validation message - you can customize this
      //   validationMessage.style.display = 'block'
      //   return
      // }
      // // Hide validation message if present
      // validationMessage.style.display = 'none'
      // // Store the selected option
      // selectedPage0Option = selectedRadio.value
      // console.log('Selected page 0 option:', selectedPage0Option)

      await showPage(2) // Skip page 1, go directly to page 2
    } else if (currentPage === 1) {
      await showPage(2)
    } else if (currentPage === 2) {
      // ===================== SAVE MEASUREMENT DATA FROM PAGE 2 =====================
      console.log('=== SAVING MEASUREMENT DATA FROM PAGE 2 ===')

      const objectLengthPx = rightLinePx - leftLinePx
      const objectLengthMm = objectLengthPx / pxPerMm
      const objectLengthCm = objectLengthMm / 10

      savedMeasurementData = {
        value: toFixedNumber(objectLengthCm, 1),
        timestamp: performance.now(),
        method: 'object',
        intraocularDistanceCm: null,
        faceMeshSamplesPage3: [...faceMeshSamplesPage3],
        faceMeshSamplesPage4: [...faceMeshSamplesPage4],
        // page0Option: selectedPage0Option, // Store the radio button answer
        raw: {
          leftPx: leftLinePx,
          rightPx: rightLinePx,
          screenWidth,
          objectLengthPx,
          objectLengthMm,
          ppi: ppi,
        },
      }

      console.log('Saved measurement data:', savedMeasurementData)
      await showPage(3)
    } else if (currentPage === 3) {
      await showPage(4)
    } else if (currentPage === 4) {
      // ===================== SHOW DISTANCE FEEDBACK ON PAGE 4 =====================
      console.log('=== SHOWING DISTANCE FEEDBACK ON PAGE 4 ===')

      // Use the saved measurement data from page 2
      if (savedMeasurementData) {
        console.log('Using saved measurement data:', savedMeasurementData)

        // Measure intraocular distance using Face Mesh
        measureIntraocularDistanceCm(RC, ppi).then(intraocularDistanceCm => {
          if (intraocularDistanceCm) {
            console.log(
              'Measured intraocular distance (cm):',
              intraocularDistanceCm,
            )
            savedMeasurementData.intraocularDistanceCm = intraocularDistanceCm
          } else {
            console.warn('Could not measure intraocular distance.')
          }
        })

        // Store the data in RC
        RC.newObjectTestDistanceData = savedMeasurementData
        RC.newViewingDistanceData = savedMeasurementData

        // Clean up event listeners
        document.removeEventListener('keydown', handleKeyPress)
        window.removeEventListener('beforeunload', cleanupKeyboard)

        // Clean up UI
        RC._removeBackground()

        // Call callback with the data
        if (typeof callback === 'function') {
          callback(savedMeasurementData)
        }
      } else {
        console.error('No measurement data found!')
      }
    }
  }

  // ===================== OBJECT TEST FINISH FUNCTION =====================
  const objectTestFinishFunction = async () => {
    // Always clean up keyboard event listeners
    document.removeEventListener('keydown', handleKeyPress)
    document.removeEventListener('keyup', handleKeyPress)

    // // Clean up radio button event listeners
    // if (customInputs) {
    //   customInputs.forEach(input => {
    //     input.removeEventListener('keyup', keydownListener)
    //   })
    // }

    // Hide don't use ruler text if it was created
    if (options.calibrateTrackDistanceCheckBool) {
      const dontUseRuler = document.querySelector(
        'div[style*="color: rgb(139, 0, 0)"]',
      )
      if (dontUseRuler) {
        dontUseRuler.style.display = 'none'
      }
    }

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
      // Use the first measurement directly as the value
      value: toFixedNumber(firstMeasurement, 1),

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
        webcamToEyesCm: firstMeasurement, // Original webcam-to-eyes measurement
      },

      // Add intraocular distance to the data object
      intraocularDistanceCm: intraocularDistanceCm,

      // Pass the samples in the savedMeasurementData and final data object
      faceMeshSamplesPage3: [...faceMeshSamplesPage3],
      faceMeshSamplesPage4: [...faceMeshSamplesPage4],
    }

    // ===================== VISUAL FEEDBACK =====================
    // Calculate calibration factors for page 3 and page 4 separately
    // Filter out NaN values before calculating averages
    const validPage3Samples = faceMeshSamplesPage3.filter(
      sample => !isNaN(sample),
    )
    const validPage4Samples = faceMeshSamplesPage4.filter(
      sample => !isNaN(sample),
    )

    const page3Average = validPage3Samples.length
      ? validPage3Samples.reduce((a, b) => a + b, 0) / validPage3Samples.length
      : 0
    const page4Average = validPage4Samples.length
      ? validPage4Samples.reduce((a, b) => a + b, 0) / validPage4Samples.length
      : 0

    // Calculate separate calibration factors
    const distance1FactorCmPx = page3Average * data.value
    const distance2FactorCmPx = page4Average * data.value

    // Calculate average of the two factors
    const averageFactorCmPx = (distance1FactorCmPx + distance2FactorCmPx) / 2

    console.log('=== Object Test Calibration Factors ===')
    console.log('Object distance:', data.value, 'cm')
    console.log('Page 3 valid samples:', validPage3Samples.length, '/ 5')
    console.log('Page 4 valid samples:', validPage4Samples.length, '/ 5')
    console.log('Page 3 average Face Mesh:', page3Average, 'px')
    console.log('Page 4 average Face Mesh:', page4Average, 'px')
    console.log('Page 3 calibration factor:', distance1FactorCmPx)
    console.log('Page 4 calibration factor:', distance2FactorCmPx)
    console.log('Average calibration factor:', averageFactorCmPx)
    console.log('======================================')

    // Store calibration factors in data object for later use
    data.calibrationFactor = averageFactorCmPx
    data.distance1FactorCmPx = distance1FactorCmPx
    data.distance2FactorCmPx = distance2FactorCmPx
    data.viewingDistanceByObject1Cm = data.value
    data.viewingDistanceByObject2Cm = data.value

    data.page3Average = page3Average
    data.page4Average = page4Average

    // Create a feedback element to show measurements only when objecttestdebug is true
    let feedbackDiv = null
    if (options.objecttestdebug) {
      feedbackDiv = document.createElement('div')
      feedbackDiv.style.position = 'fixed'
      feedbackDiv.style.bottom = '20px'
      feedbackDiv.style.left = '20px'
      feedbackDiv.style.backgroundColor = 'rgba(255, 255, 255, 0.9)'
      feedbackDiv.style.color = 'black'
      feedbackDiv.style.padding = '10px'
      feedbackDiv.style.borderRadius = '5px'
      feedbackDiv.style.fontFamily = 'monospace'
      feedbackDiv.style.zIndex = '9999999999'
      feedbackDiv.innerHTML = `
        <div style="position: absolute; top: 5px; right: 5px; cursor: pointer; font-weight: bold; font-size: 16px; color: #666;" onclick="this.parentElement.remove()">×</div>
        <div style="margin-top: 10px;">Object distance calibration</div>
        <div>pxPerCm = ${(ppi / 2.54).toFixed(1)}</div>
        <div>distanceObjectCm = ${data.value.toFixed(1)}</div>
        <div>distance1InterpupillaryPx = ${faceMeshSamplesPage3.map(sample => (isNaN(sample) ? 'NaN' : sample.toFixed(1))).join(', ')}</div>
        <div>distance1FactorCmPx = ${distance1FactorCmPx.toFixed(1)}</div>
        <div>distance2InterpupillaryPx = ${faceMeshSamplesPage4.map(sample => (isNaN(sample) ? 'NaN' : sample.toFixed(1))).join(', ')}</div>
        <div>distance2FactorCmPx = ${distance2FactorCmPx.toFixed(1)}</div>
        <div>AverageFactorCmPx = ${averageFactorCmPx.toFixed(1)}</div>
      `
      document.body.appendChild(feedbackDiv)
    }

    // ===================== STORE MEASUREMENT DATA =====================
    RC.newObjectTestDistanceData = data
    RC.newViewingDistanceData = data

    // ===================== CHECK FUNCTION =====================
    // If we're in 'both' mode, clean up and start blindspot test
    if (options.useObjectTestData === 'both') {
      // Clean up UI elements and handlers
      RC._removeBackground()

      // Remove object test keyboard event listener to prevent conflicts
      document.removeEventListener('keydown', handleKeyPress)
      document.removeEventListener('keyup', handleKeyPress)

      // Add a small delay to ensure cleanup is complete and background is ready
      setTimeout(() => {
        // Add background back for blindspot test
        RC._addBackground()

        // Start blindspot test immediately
        blindSpotTest(RC, options, true, async blindspotData => {
          // Calculate median of calibration factors instead of distances
          const objectCalibrationFactor = data.calibrationFactor
          const blindspotCalibrationFactor = blindspotData.calibrationFactor

          console.log('=== Combined Test Calibration Factors ===')
          console.log(
            'Object test calibration factor:',
            objectCalibrationFactor,
          )
          console.log(
            'Blindspot test calibration factor:',
            blindspotCalibrationFactor,
          )

          const medianCalibrationFactor = median([
            objectCalibrationFactor,
            blindspotCalibrationFactor,
          ])

          console.log('Median calibration factor:', medianCalibrationFactor)
          console.log('=========================================')

          // Create combined data using median calibration factor
          const medianData = {
            value: data.value, // Keep object test distance as reference
            timestamp: Date.now(),
            method: 'both',
            calibrationFactor: medianCalibrationFactor, // Use median calibration factor
            averageFaceMesh: data.averageFaceMesh, // Keep object test Face Mesh data

            raw: {
              object: data,
              blindspot: blindspotData,
              objectCalibrationFactor,
              blindspotCalibrationFactor,
              medianCalibrationFactor,
            },
          }

          // Update feedback for combined measurement
          if (options.objecttestdebug && feedbackDiv) {
            feedbackDiv.innerHTML = `
                      <div style="position: absolute; top: 5px; right: 5px; cursor: pointer; font-weight: bold; font-size: 16px; color: #666;" onclick="this.parentElement.remove()">×</div>
                      <div style="margin-top: 10px;">Object distance calibration</div>
                      <div>pxPerCm = ${(ppi / 2.54).toFixed(1)}</div>
                      <div>distanceObjectCm = ${data.value.toFixed(1)}</div>
                      <div>distance1InterpupillaryPx = ${faceMeshSamplesPage3.map(sample => (isNaN(sample) ? 'NaN' : sample.toFixed(1))).join(', ')}</div>
                      <div>distance1FactorCmPx = ${distance1FactorCmPx.toFixed(1)}</div>
                      <div>distance2InterpupillaryPx = ${faceMeshSamplesPage4.map(sample => (isNaN(sample) ? 'NaN' : sample.toFixed(1))).join(', ')}</div>
                      <div>distance2FactorCmPx = ${distance2FactorCmPx.toFixed(1)}</div>
                      <div>AverageFactorCmPx = ${averageFactorCmPx.toFixed(1)}</div>
                      <div>blindspotCalibrationFactor = ${blindspotCalibrationFactor.toFixed(1)}</div>
                      <div>AverageCombinedCalibrationFactor = ${medianCalibrationFactor.toFixed(1)}</div>
                  `
          }

          // Update the data in RC and also the data in the callback
          RC.newObjectTestDistanceData = medianData
          RC.newViewingDistanceData = medianData

          // Call callback with the data
          // Handle completion based on check settings
          if (options.calibrateTrackDistanceCheckBool) {
            await RC._checkDistance(
              callback,
              data,
              'trackDistance', // Use 'object' instead of 'measureDistance'
              options.checkCallback,
              options.calibrateTrackDistanceCheckCm,
              options.callbackStatic,
              options.calibrateTrackDistanceCheckSecs,
              options.calibrateTrackDistanceCheckLengthCm,
            )
          } else {
            // ===================== CALLBACK HANDLING =====================
            if (typeof callback === 'function') {
              callback(data)
            }
          }

          // Clean up UI elements
          RC._removeBackground()
        })
      }, 500)
    } else {
      // Use the same check function as blindspot
      if (options.calibrateTrackDistanceCheckBool) {
        await RC._checkDistance(
          callback,
          data,
          'trackDistance', // Use 'object' instead of 'measureDistance'
          options.checkCallback,
          options.calibrateTrackDistanceCheckCm,
          options.callbackStatic,
          options.calibrateTrackDistanceCheckSecs,
          options.calibrateTrackDistanceCheckLengthCm,
        )
      } else {
        // ===================== CALLBACK HANDLING =====================
        if (typeof callback === 'function') {
          callback(data)
        }
      }

      // Clean up UI elements
      RC._removeBackground()
    }
  }
  const cleanupObjectTest = () => {
    // Clean up keyboard event listeners
    document.removeEventListener('keydown', handleKeyPress)
    document.removeEventListener('keyup', handleKeyPress)

    // // Clean up radio button event listeners
    // if (customInputs) {
    //   customInputs.forEach(input => {
    //     input.removeEventListener('keyup', keydownListener)
    //   })
    // }

    // Clean up keypad handler
    if (removeKeypadHandler) {
      removeKeypadHandler()
    }

    // Clean up any remaining DOM elements
    if (container && container.parentNode) {
      container.parentNode.removeChild(container)
    }

    // Clean up background
    RC._removeBackground()
  }

  const breakFunction = () => {
    // Always clean up keyboard event listeners
    document.removeEventListener('keydown', handleKeyPress)
    document.removeEventListener('keyup', handleKeyPress)

    // // Clean up radio button event listeners
    // if (customInputs) {
    //   customInputs.forEach(input => {
    //     input.removeEventListener('keyup', keydownListener)
    //   })
    // }

    // Restart: reset right line to initial position
    objectTest(RC, options, callback)
  }

  // ===================== KEYPAD HANDLER =====================
  let removeKeypadHandler = setUpEasyEyesKeypadHandler(
    null,
    RC.keypadHandler,
    () => {
      // Always trigger Proceed button action since okButton is never used
      proceedButton.click()
    },
    false,
    ['return'],
    RC,
  )

  // Store the last face image captured on space press
  let lastCapturedFaceImage = null

  // Add keyboard event listener for Enter/Return key and Space key
  const handleKeyPress = e => {
    if (e.key === 'Enter' || e.key === 'Return') {
      // On pages 2, 3 and 4, ignore return key - only allow space
      if (currentPage === 2 || currentPage === 3 || currentPage === 4) {
        return
      }
      // Always trigger Proceed button action since okButton is never used
      proceedButton.click()
    } else if (e.key === ' ') {
      // Space key - allow on pages 2, 3 and 4
      if (currentPage === 2 || currentPage === 3 || currentPage === 4) {
        e.preventDefault()

        // Play camera shutter sound on pages 3 and 4
        if (currentPage === 3 || currentPage === 4) {
          if (env !== 'mocha' && cameraShutterSound) {
            cameraShutterSound()
          }
        }

        // Capture the video frame immediately on space press (for 3 and 4)
        if (currentPage === 3 || currentPage === 4) {
          lastCapturedFaceImage = captureVideoFrame(RC)
        }

        if (currentPage === 2) {
          // Do exactly what the PROCEED button does on page 2
          ;(async () => {
            // Record first measurement - just store the distance value
            firstMeasurement = (rightLinePx - leftLinePx) / pxPerMm / 10
            console.log('First measurement:', firstMeasurement)

            // Store original measurement data before resetting lines
            const originalMeasurementData = {
              leftPx: leftLinePx,
              rightPx: rightLinePx,
              objectLengthPx: rightLinePx - leftLinePx,
              objectLengthMm: (rightLinePx - leftLinePx) / pxPerMm,
              objectLengthCm: firstMeasurement,
            }

            // Move to page 3
            await nextPage()

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
          })()
        } else if (currentPage === 3) {
          // Collect 5 Face Mesh samples for calibration on page 3
          ;(async () => {
            console.log('=== COLLECTING FACE MESH SAMPLES ON PAGE 3 ===')

            // Collect 5 Face Mesh samples for calibration
            await collectFaceMeshSamples(RC, faceMeshSamplesPage3, ppi)
            console.log(
              'Face Mesh calibration samples (page 3):',
              faceMeshSamplesPage3,
            )

            // Only show retry dialog if we have fewer than 5 valid samples or if any samples are NaN
            const validSamples = faceMeshSamplesPage3.filter(
              sample => !isNaN(sample),
            )
            if (
              validSamples.length < 5 ||
              faceMeshSamplesPage3.some(sample => isNaN(sample))
            ) {
              // Use the image captured at space press
              const capturedImage = lastCapturedFaceImage

              const result = await Swal.fire({
                ...swalInfoOptions(RC, { showIcon: false }),
                title: phrases.RC_FaceBlocked[RC.L],
                html: `<div style="text-align: center;">
                    <img src="${capturedImage}" style="max-width: 300px; max-height: 400px; border: 2px solid #ccc; border-radius: 8px;" alt="Camera view" />
                    <p style="margin-top: 15px; font-size: 0.7em; color: #666;">${phrases.RC_FaceImageNotSaved[RC.L]}</p>
                   </div>`,
                showCancelButton: false,
                showConfirmButton: false,
                allowEnterKey: true,
                footer: `
                  <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; gap: 10px;">
                    <button class="swal2-confirm swal2-styled" id="ok-button-page3" style="background-color: #3085d6; border: none; flex: 0 0 auto;">
                      ${phrases.EE_ok[RC.L]}
                    </button>
                    <div style="display: flex; align-items: center; gap: 10px;">
                      <div style="color: #666; font-size: 0.9em;">
                        ${phrases.RC_LongerObjectHelps[RC.L]}
                      </div>
                      <button class="swal2-confirm swal2-styled" id="new-object-button-page3" style="background-color: #28a745; border: none; flex: 0 0 auto;">
                        ${phrases.RC_NewObjectButton[RC.L]}
                      </button>
                    </div>
                  </div>
                `,
                customClass: {
                  footer: 'swal2-footer-no-border'
                },
                didOpen: () => {
                  // Add CSS to remove footer border
                  if (!document.getElementById('swal2-footer-no-border-style')) {
                    const style = document.createElement('style')
                    style.id = 'swal2-footer-no-border-style'
                    style.textContent = '.swal2-footer-no-border { border-top: none !important; }'
                    document.head.appendChild(style)
                  }
                  
                  // Add click handlers for custom buttons
                  document.getElementById('ok-button-page3').addEventListener('click', () => {
                    Swal.close()
                  })
                  document.getElementById('new-object-button-page3').addEventListener('click', () => {
                    // Use the same restart logic as tolerance failure (proven approach)
                    console.log('New object button clicked - restarting from page 2')
                    
                    // Clear Face Mesh samples and measurement (same as tolerance failure)
                    faceMeshSamplesPage3.length = 0
                    faceMeshSamplesPage4.length = 0
                    firstMeasurement = null
                    
                    // Reset to page 2 to restart object measurement (same as tolerance failure)
                    currentPage = 1
                    
                    // Close popup and restart
                    Swal.close()
                    nextPage()
                  })
                }
              })

              // The user will press space again to collect new samples
              console.log('=== RETRYING FACE MESH SAMPLES ON PAGE 3 ===')
              // The user will press space again to collect new samples
              // Clean up the captured image for privacy
              lastCapturedFaceImage = null
            } else {
              // All 5 samples are valid - automatically continue to page 4
              console.log(
                '=== ALL 5 FACE MESH SAMPLES VALID - CONTINUING TO PAGE 4 ===',
              )
              await nextPage()
              // Clean up the captured image for privacy
              lastCapturedFaceImage = null
            }
          })()
        } else if (currentPage === 4) {
          // Collect 5 Face Mesh samples for calibration on page 4
          ;(async () => {
            console.log('=== COLLECTING FACE MESH SAMPLES ON PAGE 4 ===')

            // Collect 5 Face Mesh samples for calibration
            await collectFaceMeshSamples(RC, faceMeshSamplesPage4, ppi)
            console.log(
              'Face Mesh calibration samples (page 4):',
              faceMeshSamplesPage4,
            )

            // Only show retry dialog if we have fewer than 5 valid samples or if any samples are NaN
            const validSamples = faceMeshSamplesPage4.filter(
              sample => !isNaN(sample),
            )
            if (
              validSamples.length < 5 ||
              faceMeshSamplesPage4.some(sample => isNaN(sample))
            ) {
              // Use the image captured at space press
              const capturedImage = lastCapturedFaceImage

              const result = await Swal.fire({
                ...swalInfoOptions(RC, { showIcon: false }),
                title: phrases.RC_FaceBlocked[RC.L],
                html: `<div style="text-align: center;">
                    <img src="${capturedImage}" style="max-width: 300px; max-height: 400px; border: 2px solid #ccc; border-radius: 8px;" alt="Camera view" />
                    <p style="margin-top: 15px; font-size: 0.7em; color: #666;">${phrases.RC_FaceImageNotSaved[RC.L]}</p>
                   </div>`,
                showCancelButton: false,
                showConfirmButton: false,
                allowEnterKey: true,
                footer: `
                  <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; gap: 10px;">
                    <button class="swal2-confirm swal2-styled" id="ok-button-page4" style="background-color: #3085d6; border: none; flex: 0 0 auto;">
                      ${phrases.EE_ok[RC.L]}
                    </button>
                    <div style="display: flex; align-items: center; gap: 10px;">
                      <div style="color: #666; font-size: 0.9em;">
                        ${phrases.RC_LongerObjectHelps[RC.L]}
                      </div>
                      <button class="swal2-confirm swal2-styled" id="new-object-button-page4" style="background-color: #28a745; border: none; flex: 0 0 auto;">
                        ${phrases.RC_NewObjectButton[RC.L]}
                      </button>
                    </div>
                  </div>
                `,
                customClass: {
                  footer: 'swal2-footer-no-border'
                },
                didOpen: () => {
                  // Add CSS to remove footer border
                  if (!document.getElementById('swal2-footer-no-border-style')) {
                    const style = document.createElement('style')
                    style.id = 'swal2-footer-no-border-style'
                    style.textContent = '.swal2-footer-no-border { border-top: none !important; }'
                    document.head.appendChild(style)
                  }
                  
                  // Add click handlers for custom buttons
                  document.getElementById('ok-button-page4').addEventListener('click', () => {
                    Swal.close()
                  })
                  document.getElementById('new-object-button-page4').addEventListener('click', () => {
                    // Use the same restart logic as tolerance failure (proven approach)
                    console.log('New object button clicked - restarting from page 2')
                    
                    // Clear Face Mesh samples and measurement (same as tolerance failure)
                    faceMeshSamplesPage3.length = 0
                    faceMeshSamplesPage4.length = 0
                    firstMeasurement = null
                    
                    // Reset to page 2 to restart object measurement (same as tolerance failure)
                    currentPage = 1
                    
                    // Close popup and restart
                    Swal.close()
                    nextPage()
                  })
                }
              })

              // User must retry - stay on page 4 and collect new samples
              console.log('=== RETRYING FACE MESH SAMPLES ON PAGE 4 ===')
              // The user will press space again to collect new samples
              // Clean up the captured image for privacy
              lastCapturedFaceImage = null
            } else {
              // All 5 samples are valid - check tolerance before finishing
              console.log(
                '=== ALL 5 FACE MESH SAMPLES VALID - CHECKING TOLERANCE ===',
              )

              // Check if the two sets of Face Mesh samples are consistent
              const [pass, message, min, max, RMin, RMax] =
                checkObjectTestTolerance(
                  RC,
                  faceMeshSamplesPage3,
                  faceMeshSamplesPage4,
                  options.calibrateTrackDistanceAllowedRatio,
                  options.calibrateTrackDistanceAllowedRangeCm,
                  firstMeasurement,
                )
              if (RC.measurementHistory && message !== 'Pass')
                RC.measurementHistory.push(message)
              else if (message !== 'Pass') RC.measurementHistory = [message]

              if (pass) {
                // Tolerance check passed - finish the test
                console.log('=== TOLERANCE CHECK PASSED - FINISHING TEST ===')
                
                // Save successful object test calibration attempt
                const validPage3Samples = faceMeshSamplesPage3.filter(sample => !isNaN(sample))
                const validPage4Samples = faceMeshSamplesPage4.filter(sample => !isNaN(sample))
                const page3Average = validPage3Samples.length
                  ? validPage3Samples.reduce((a, b) => a + b, 0) / validPage3Samples.length
                  : 0
                const page4Average = validPage4Samples.length
                  ? validPage4Samples.reduce((a, b) => a + b, 0) / validPage4Samples.length
                  : 0
                const averageFactorCmPx = ((page3Average * firstMeasurement) + (page4Average * firstMeasurement)) / 2

                saveCalibrationAttempt(RC, 'object', firstMeasurement, averageFactorCmPx)
                
                await objectTestFinishFunction()
              } else {
                const ipdpxRatio = Math.sqrt(
                  faceMeshSamplesPage3[0] / faceMeshSamplesPage4[0],
                )
                const newMin = min.toFixed(1) * ipdpxRatio
                const newMax = max.toFixed(1) / ipdpxRatio
                let displayMessage = phrases.RC_viewingObjectRejected[RC.L]
                  .replace('[[N11]]', newMin.toFixed(1))
                  .replace('[[N22]]', newMax.toFixed(1))
                const reasonIsOutOfRange = message.includes(
                  'out of allowed range',
                )
                if (reasonIsOutOfRange) {
                  displayMessage = phrases.RC_viewingExceededRange[RC.L]
                    .replace('[[N11]]', newMin.toFixed(1))
                    .replace('[[N22]]', newMax.toFixed(1))
                    .replace('[[N33]]', RMin.toFixed(1))
                    .replace('[[N44]]', RMax.toFixed(1))
                }
                // Tolerance check failed - show error and restart Face Mesh collection
                console.log(
                  '=== TOLERANCE CHECK FAILED - RESTARTING FACE MESH COLLECTION ===',
                )

                // Save failed object test calibration attempt
                const validPage3Samples = faceMeshSamplesPage3.filter(sample => !isNaN(sample))
                const validPage4Samples = faceMeshSamplesPage4.filter(sample => !isNaN(sample))
                const page3Average = validPage3Samples.length
                  ? validPage3Samples.reduce((a, b) => a + b, 0) / validPage3Samples.length
                  : 0
                const page4Average = validPage4Samples.length
                  ? validPage4Samples.reduce((a, b) => a + b, 0) / validPage4Samples.length
                  : 0
                const averageFactorCmPx = ((page3Average * firstMeasurement) + (page4Average * firstMeasurement)) / 2

                saveCalibrationAttempt(RC, 'object', firstMeasurement, averageFactorCmPx)

                // Clear both sample arrays to restart collection
                faceMeshSamplesPage3.length = 0
                faceMeshSamplesPage4.length = 0

                const isOutOfRangeError = reasonIsOutOfRange
                const inPanelContext = RC._panelStatus.hasPanel

                if (isOutOfRangeError && inPanelContext) {
                  await Swal.fire({
                    ...swalInfoOptions(RC, { showIcon: false }),
                    icon: undefined,
                    html: displayMessage,
                    allowEnterKey: true,
                  }).then(() => {
                    // Clean up object test before returning to panel
                    cleanupObjectTest()
                    RC._returnToPanelForScreenSize()
                  })
                  return // Exit early to prevent the normal restart flow
                } else {
                  await Swal.fire({
                    ...swalInfoOptions(RC, { showIcon: false }),
                    icon: undefined,
                    html: displayMessage,
                    allowEnterKey: true,
                  })
                }

                // Reset to page 2 to restart object measurement
                currentPage = 1
                firstMeasurement = null
                await nextPage()
              }

              // Clean up the captured image for privacy
              lastCapturedFaceImage = null
            }
          })()
        }
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
  buttonContainer.style.zIndex = '9999999999'
  buttonContainer.style.display = 'flex'
  buttonContainer.style.gap = '10px'
  RC.background.appendChild(buttonContainer)

  // Add OK button first
  const proceedButton = document.createElement('button')
  proceedButton.className = 'rc-button'
  proceedButton.textContent = 'Proceed'
  proceedButton.style.border = '2px solid #019267'
  proceedButton.style.backgroundColor = '#019267'
  proceedButton.style.color = 'white'
  proceedButton.style.fontSize = '1.2rem'
  proceedButton.style.padding = '8px 16px'
  proceedButton.style.borderRadius = '4px'
  proceedButton.style.cursor = 'pointer'

  // Store measurements
  let firstMeasurement = null
  let intraocularDistanceCm = null

  proceedButton.onclick = async () => {
    console.log('Proceed button clicked')

    if (currentPage === 0) {
      await nextPage() // This will now go directly to page 2
    } else if (currentPage === 1) {
      await nextPage()
    } else if (currentPage === 2) {
      // Record first measurement - just store the distance value
      firstMeasurement = (rightLinePx - leftLinePx) / pxPerMm / 10
      console.log('First measurement:', firstMeasurement)

      // Store original measurement data before resetting lines
      const originalMeasurementData = {
        leftPx: leftLinePx,
        rightPx: rightLinePx,
        objectLengthPx: rightLinePx - leftLinePx,
        objectLengthMm: (rightLinePx - leftLinePx) / pxPerMm,
        objectLengthCm: firstMeasurement,
      }

      // Move to page 3
      await nextPage()

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
    } else if (currentPage === 3) {
      // Play camera shutter sound on page 3
      if (env !== 'mocha' && cameraShutterSound) {
        cameraShutterSound()
      }

      // Collect 5 Face Mesh samples for calibration on page 3
      console.log('=== COLLECTING FACE MESH SAMPLES ON PAGE 3 ===')

      // Collect 5 Face Mesh samples for calibration
      await collectFaceMeshSamples(RC, faceMeshSamplesPage3, ppi)
      console.log(
        'Face Mesh calibration samples (page 3):',
        faceMeshSamplesPage3,
      )

      // Move to page 4
      await nextPage()
    } else if (currentPage === 4) {
      // Play camera shutter sound on page 4
      if (env !== 'mocha' && cameraShutterSound) {
        cameraShutterSound()
      }

      // Collect 5 Face Mesh samples for calibration on page 4
      console.log('=== COLLECTING FACE MESH SAMPLES ON PAGE 4 ===')

      // Collect 5 Face Mesh samples for calibration
      await collectFaceMeshSamples(RC, faceMeshSamplesPage4, ppi)
      console.log(
        'Face Mesh calibration samples (page 4):',
        faceMeshSamplesPage4,
      )

      console.log('=== CHECKING TOLERANCE BEFORE FINISHING ===')

      const [pass, message, min, max, RMin, RMax] = checkObjectTestTolerance(
        RC,
        faceMeshSamplesPage3,
        faceMeshSamplesPage4,
        options.calibrateTrackDistanceAllowedRatio,
        options.calibrateTrackDistanceAllowedRangeCm,
        firstMeasurement,
      )
      if (RC.measurementHistory && message !== 'Pass')
        RC.measurementHistory.push(message)
      else if (message !== 'Pass') RC.measurementHistory = [message]

      if (pass) {
        console.log('=== TOLERANCE CHECK PASSED - FINISHING TEST ===')
        
        // Save successful object test calibration attempt (Proceed button case)
        const validPage3Samples = faceMeshSamplesPage3.filter(sample => !isNaN(sample))
        const validPage4Samples = faceMeshSamplesPage4.filter(sample => !isNaN(sample))
        const page3Average = validPage3Samples.length
          ? validPage3Samples.reduce((a, b) => a + b, 0) / validPage3Samples.length
          : 0
        const page4Average = validPage4Samples.length
          ? validPage4Samples.reduce((a, b) => a + b, 0) / validPage4Samples.length
          : 0
        const averageFactorCmPx = ((page3Average * firstMeasurement) + (page4Average * firstMeasurement)) / 2

        saveCalibrationAttempt(RC, 'object', firstMeasurement, averageFactorCmPx)
        
        await objectTestFinishFunction()
      } else {
        const ipdpxRatio = Math.sqrt(
          faceMeshSamplesPage3[0] / faceMeshSamplesPage4[0],
        )
        const newMin = min.toFixed(1) * ipdpxRatio
        const newMax = max.toFixed(1) / ipdpxRatio
        let displayMessage = phrases.RC_viewingObjectRejected[RC.L]
          .replace('[[N11]]', newMin.toFixed(1))
          .replace('[[N22]]', newMax.toFixed(1))
        const reasonIsOutOfRange = message.includes('out of allowed range')
        if (reasonIsOutOfRange) {
          displayMessage = phrases.RC_viewingExceededRange[RC.L]
            .replace('[[N11]]', newMin.toFixed(1))
            .replace('[[N22]]', newMax.toFixed(1))
            .replace('[[N33]]', RMin.toFixed(1))
            .replace('[[N44]]', RMax.toFixed(1))
        }
        console.log(
          '=== TOLERANCE CHECK FAILED - RESTARTING FACE MESH COLLECTION ===',
        )

        // Save failed object test calibration attempt (Proceed button case)
        const validPage3Samples = faceMeshSamplesPage3.filter(sample => !isNaN(sample))
        const validPage4Samples = faceMeshSamplesPage4.filter(sample => !isNaN(sample))
        const page3Average = validPage3Samples.length
          ? validPage3Samples.reduce((a, b) => a + b, 0) / validPage3Samples.length
          : 0
        const page4Average = validPage4Samples.length
          ? validPage4Samples.reduce((a, b) => a + b, 0) / validPage4Samples.length
          : 0
        const averageFactorCmPx = ((page3Average * firstMeasurement) + (page4Average * firstMeasurement)) / 2

        saveCalibrationAttempt(RC, 'object', firstMeasurement, averageFactorCmPx)

        faceMeshSamplesPage3.length = 0
        faceMeshSamplesPage4.length = 0

        const isOutOfRangeError = reasonIsOutOfRange
        const inPanelContext = RC._panelStatus.hasPanel

        if (isOutOfRangeError && inPanelContext) {
          // Show normal error dialog but redirect to panel when OK is pressed
          await Swal.fire({
            ...swalInfoOptions(RC, { showIcon: false }),
            icon: undefined,
            html: displayMessage,
            allowEnterKey: true,
          }).then(() => {
            // Clean up object test before returning to panel
            cleanupObjectTest()
            RC._returnToPanelForScreenSize()
          })
          return // Exit early to prevent the normal restart flow
        } else {
          // Normal error dialog without panel return functionality
          await Swal.fire({
            ...swalInfoOptions(RC, { showIcon: false }),
            icon: undefined,
            html: displayMessage,
            allowEnterKey: true,
          })
        }

        currentPage = 1
        firstMeasurement = null
        await nextPage()
      }
    }
  }
  buttonContainer.appendChild(proceedButton)

  // Add Explanation button last
  const explanationButton = document.createElement('button')
  explanationButton.className = 'rc-button'
  explanationButton.textContent = phrases.RC_viewingDistanceIntroTitle[RC.L]
  explanationButton.style.border = '2px solid #999'
  explanationButton.style.backgroundColor = '#999'
  explanationButton.style.color = 'white'
  explanationButton.style.fontSize = '0.9rem'
  explanationButton.style.padding = '8px 16px'
  explanationButton.style.borderRadius = '4px'
  explanationButton.style.cursor = 'pointer'
  explanationButton.onclick = () => {
    // Insert a <br> before each numbered step (e.g., 1., 2., 3., 4.)
    const explanationHtml = phrases.RC_viewingDistanceIntroPelliMethod[RC.L]
      .replace(/(\d\.)/g, '<br>$1')
      .replace(/^<br>/, '')
    Swal.fire({
      ...swalInfoOptions(RC, { showIcon: false }),
      icon: undefined,
      html: explanationHtml,
      allowEnterKey: true,
      confirmButtonText: phrases.T_ok ? phrases.T_ok[RC.L] : 'OK',
    })
  }
  buttonContainer.appendChild(explanationButton)

  // ===================== SHOW POPUP BEFORE PAGE 0 =====================
  // Only show popup if camera selection hasn't been done already
  if (!options.cameraSelectionDone) {
    await showTestPopup(RC)
  }

  // ===================== INITIALIZE PAGE 0 =====================
  showPage(0)
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

// Utility to measure intraocular distance using Face Mesh
async function measureIntraocularDistanceCm(RC, ppi) {
  // Get the video element (use canvas only)
  let video = document.getElementById('webgazerVideoCanvas')
  if (!video) return null
  // Ensure model is loaded
  const model = await RC.gazeTracker.webgazer.getTracker().model
  const faces = await model.estimateFaces(video)
  if (!faces.length) return null
  // Use keypoints 133 (right eye outer) and 362 (left eye outer)
  const mesh = faces[0].keypoints || faces[0].scaledMesh
  if (!mesh || !mesh[133] || !mesh[362]) return null
  // Use eyeDist from distanceTrack.js logic
  const eyeDist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
  const pxDist = eyeDist(mesh[133], mesh[362])
  // Convert to mm, then cm
  const pxPerMm = ppi / 25.4
  const distMm = pxDist / pxPerMm
  const distCm = distMm / 10
  return distCm
}

function checkObjectTestTolerance(
  RC,
  page3Samples,
  page4Samples,
  allowedRatio = 1.1,
  allowedRangeCm,
  measurementCm,
) {
  const validPage3Samples = page3Samples.filter(sample => !isNaN(sample))
  const validPage4Samples = page4Samples.filter(sample => !isNaN(sample))

  if (validPage3Samples.length < 3 || validPage4Samples.length < 3) {
    console.warn('Insufficient valid Face Mesh samples for tolerance check')
    return [
      false,
      'Insufficient valid Face Mesh samples for tolerance check',
      -Infinity,
      Infinity,
      -Infinity,
      Infinity,
    ]
  }

  const page3Mean =
    validPage3Samples.reduce((a, b) => a + b, 0) / validPage3Samples.length
  const page4Mean =
    validPage4Samples.reduce((a, b) => a + b, 0) / validPage4Samples.length

  // Factor ratio using calibration factors F1 and F2
  const F1 = page3Mean * measurementCm
  const F2 = page4Mean * measurementCm
  const ratio1 = F1 / F2
  const ratio2 = F2 / F1
  const maxRatio = Math.max(ratio1, ratio2)
  const maxAllowedRatio = Math.max(allowedRatio, 1 / allowedRatio)

  console.log('=== Object Test Tolerance Check (Factors) ===')
  console.log('Measurement (cm):', measurementCm.toFixed(2))
  console.log('Page 3 avg FM (px):', page3Mean.toFixed(2))
  console.log('Page 4 avg FM (px):', page4Mean.toFixed(2))
  console.log('F1, F2 (cm*px):', F1.toFixed(2), F2.toFixed(2))
  console.log('Max ratio:', maxRatio.toFixed(3))
  console.log('Max allowed ratio:', maxAllowedRatio.toFixed(3))

  // Range check on measurement
  const ppi = RC.screenPpi ? RC.screenPpi.value : 96
  // page3Mean and page4Mean are in pixels. to convert to cm, we need to divide by ppi
  const distance1Cm = page3Mean / ppiToPxPerCm(ppi)
  const distance2Cm = page4Mean / ppiToPxPerCm(ppi)
  const RMin = Array.isArray(allowedRangeCm) ? allowedRangeCm[0] : -Infinity
  const RMax = Array.isArray(allowedRangeCm) ? allowedRangeCm[1] : Infinity
  const minM = Math.min(measurementCm, measurementCm)
  const maxM = Math.max(measurementCm, measurementCm)
  if (minM < RMin || maxM > RMax) {
    console.warn('Object measurement out of allowed range')
    return [
      false,
      `Object measurement out of allowed range
        MinCm: ${minM.toFixed(1)};
        MaxCm: ${maxM.toFixed(1)};
        distance1Cm: ${distance1Cm.toFixed(2)};
        distance2Cm: ${distance2Cm.toFixed(2)};
        distance1FactorCmPx: ${F1.toFixed(1)};
        distance2FactorCmPx: ${F2.toFixed(1)};
        `,
      minM,
      maxM,
      RMin,
      RMax,
    ]
  }

  console.log('Pass:', maxRatio <= maxAllowedRatio)
  console.log('================================')
  const pass = maxRatio <= maxAllowedRatio

  return [
    pass,
    pass
      ? 'Pass'
      : `Measurements not consistent
      distance1Cm: ${distance1Cm.toFixed(2)};
      distance2Cm: ${distance2Cm.toFixed(2)};
      distance1FactorCmPx: ${F1.toFixed(1)};
      distance2FactorCmPx: ${F2.toFixed(1)};
      `,
    minM,
    maxM,
    RMin,
    RMax,
  ]
}

function checkBlindspotTolerance(
  dist,
  allowedRatio = 1.1,
  allowedRangeCm,
  faceMeshSamplesLeft,
  faceMeshSamplesRight,
  ppi,
) {
  const lefts = []
  const rights = []
  for (const d of dist) {
    if (d.closedEyeSide === 'left') lefts.push(d.dist)
    else rights.push(d.dist)
  }

  if (lefts.length < 1 || rights.length < 1) {
    console.warn('Insufficient measurements for blindspot tolerance check')
    return [
      false,
      'Insufficient measurements for blindspot tolerance check',
      -Infinity,
      Infinity,
      -Infinity,
      Infinity,
    ]
  }

  const leftMean = average(lefts)
  const rightMean = average(rights)

  // Factor ratio using per-eye calibration factors
  const validLeft = faceMeshSamplesLeft.filter(s => !isNaN(s))
  const validRight = faceMeshSamplesRight.filter(s => !isNaN(s))
  if (validLeft.length < 3 || validRight.length < 3) {
    console.warn('Insufficient Face Mesh samples per eye for tolerance check')
    return [
      false,
      'Insufficient Face Mesh samples per eye for tolerance check',
      -Infinity,
      Infinity,
      -Infinity,
      Infinity,
    ]
  }
  const leftAvgFM = validLeft.reduce((a, b) => a + b, 0) / validLeft.length
  const rightAvgFM = validRight.reduce((a, b) => a + b, 0) / validRight.length
  // Apply Pythagorean correction for blindspot tolerance check
  const halfScreenHeightCm = _calculateDistanceFromCenterToTop(ppi)
  const leftEyeToCameraCm = Math.sqrt(leftMean ** 2 - halfScreenHeightCm ** 2)
  const rightEyeToCameraCm = Math.sqrt(rightMean ** 2 - halfScreenHeightCm ** 2)
  const F1 = leftAvgFM * leftEyeToCameraCm
  const F2 = rightAvgFM * rightEyeToCameraCm
  const ratio1 = F1 / F2
  const ratio2 = F2 / F1
  const maxRatio = Math.max(ratio1, ratio2)
  const maxAllowedRatio = Math.max(allowedRatio, 1 / allowedRatio)

  console.log('=== Blindspot Tolerance Check (Factors) ===')
  console.log('Left/Right avg (cm):', leftMean.toFixed(2), rightMean.toFixed(2))
  console.log(
    'Left/Right avg FM (px):',
    leftAvgFM.toFixed(2),
    rightAvgFM.toFixed(2),
  )
  console.log('F1, F2 (cm*px):', F1.toFixed(2), F2.toFixed(2))
  console.log('Max ratio:', maxRatio.toFixed(3))
  console.log('Max allowed ratio:', maxAllowedRatio.toFixed(3))

  // Range check on measurements
  if (typeof allowedRangeCm === 'string')
    allowedRangeCm = allowedRangeCm.split(',').map(Number)
  const RMin = Array.isArray(allowedRangeCm) ? allowedRangeCm[0] : -Infinity
  const RMax = Array.isArray(allowedRangeCm) ? allowedRangeCm[1] : Infinity
  console.log('allowedRangeCm', allowedRangeCm)
  console.log('RMin', RMin)
  console.log('RMax', RMax)
  console.log('leftMean', leftMean)
  console.log('rightMean', rightMean)

  if (
    Math.min(leftMean, rightMean) < RMin ||
    Math.max(leftMean, rightMean) > RMax
  ) {
    console.warn('Blindspot measurements out of allowed range')
    return [
      false,
      `Blindspot measurements out of allowed range
      MinCm: ${Math.min(leftMean, rightMean).toFixed(1)};
      MaxCm: ${Math.max(leftMean, rightMean).toFixed(1)};
      distance1FactorCmPx: ${F1.toFixed(1)};
      distance2FactorCmPx: ${F2.toFixed(1)};
      `,
      Math.min(leftMean, rightMean),
      Math.max(leftMean, rightMean),
      RMin,
      RMax,
    ]
  }
  console.log('Pass:', maxRatio <= maxAllowedRatio)
  console.log('================================')

  const pass = maxRatio <= maxAllowedRatio

  return [
    pass,
    pass
      ? 'Pass'
      : `Measurements not consistent
      distance1Cm: ${leftMean.toFixed(1)};
      distance2Cm: ${rightMean.toFixed(1)};
      distance1FactorCmPx: ${F1.toFixed(1)};
      distance2FactorCmPx: ${F2.toFixed(1)};
      `,
    Math.min(leftMean, rightMean),
    Math.max(leftMean, rightMean),
    RMin,
    RMax,
  ]
}

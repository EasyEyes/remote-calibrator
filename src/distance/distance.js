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
import { setDefaultVideoPosition } from '../components/video'
import {
  _getCrossX,
  _cross,
  circleDeltaX,
  _getCircleBounds,
  _circle,
  _diamond,
  bindMousedown,
  unbindMousedown,
  clickOnCircle,
  clickOnDiamond,
} from '../components/onCanvas'
import { bindKeys, unbindKeys } from '../components/keyBinder'
import { addButtons } from '../components/buttons'
import { phrases } from '../i18n/schema'
import { swalInfoOptions } from '../components/swalOptions'
import { setUpEasyEyesKeypadHandler } from '../extensions/keypadHandler'
import { showTestPopup } from '../components/popup'
import { ppiToPxPerCm } from '../components/converters'
import { calculateNearestPoints, getMeshData } from './distanceTrack'

// import { soundFeedback } from '../components/sound'
let soundFeedback
let cameraShutterSound
if (env !== 'mocha') {
  const soundModule = require('../components/sound')
  soundFeedback = soundModule.soundFeedback
  cameraShutterSound = soundModule.cameraShutterSound
}

const blindSpotHTML = `
  <style>
    #blindspot-wrapper {
      position: fixed !important;
      top: 0 !important;
      left: 50% !important;
      transform: translateX(-50%) !important;
      height: 90vh !important;
      z-index: 99999999998 !important;
      pointer-events: none;
      isolation: isolate !important;
    }
    #blind-spot-canvas {
      z-index: 99999999999 !important;
      position: absolute !important;
      pointer-events: none !important;
      top: 0;
      left: 0;
      width: 100% !important;
      height: 90vh !important;
      isolation: isolate !important;
    }
    #blind-spot-canvas.cursor-grab {
      pointer-events: auto !important;
    }
    #rc-buttons {
      z-index: 999999999999 !important;
      pointer-events: auto !important;
      position: fixed !important;
      bottom: 1.25rem !important;
      right: 1.25rem !important;
    }
    .swal2-container {
      z-index: 1000000000000 !important;
    }
    #blindspot-size-slider {
      -webkit-appearance: none;
      appearance: none;
      background: transparent;
      cursor: pointer;
      transform: rotate(-90deg);
      transform-origin: center;
    }
    #blindspot-size-slider::-webkit-slider-track {
      background: #ddd;
      height: 6px;
      border-radius: 3px;
      margin-top: 10px;
      margin-bottom: 10px;
    }
    #blindspot-size-slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      background: #8B0000;
      height: 20px;
      width: 20px;
      border-radius: 50%;
      cursor: pointer;
    }
    #blindspot-size-slider::-moz-range-track {
      background: #ddd;
      height: 6px;
      border-radius: 3px;
      border: none;
      margin-top: 10px;
      margin-bottom: 10px;
    }
    #blindspot-size-slider::-moz-range-thumb {
      background: #8B0000;
      height: 20px;
      width: 20px;
      border-radius: 50%;
      cursor: pointer;
      border: none;
    }
  </style>
  <div id="blindspot-wrapper">
    <canvas id="blind-spot-canvas" class="cursor-grab"></canvas>
    <div id="blindspot-slider-container" style="position: absolute; right: 20px; bottom: 15%; z-index: 99999999999; pointer-events: auto;">
      <div style="position: relative; height: 105px; display: flex; align-items: center;">
        <div style="position: relative; height: 105px; width: 6px; background: #ddd; border-radius: 3px; margin-right: 15px; display: flex; align-items: center; justify-content: center;">
          <input type="range" id="blindspot-size-slider" min="0" max="1" value="0.5" step="0.001">
        </div>
        <div style="display: flex; flex-direction: column; justify-content: space-between; height: 90px; font-size: 10px; color: #888; line-height: 0.2; margin-left: 10px;">
          <span>8 deg</span>
          <span>4 deg</span>
          <span>2 deg</span>
        </div>
      </div>
    </div>
  </div>
`

/* -------------------------------------------------------------------------- */

// Helper function to save multiple calibration measurements separately
function saveCalibrationMeasurements(
  RC,
  method,
  measurements, // Array of measurement objects
  spotDeg = undefined, // Spot diameter in degrees for blindspot calibrations
) {
  // Initialize the calibration attempts object if it doesn't exist
  if (!RC.calibrationAttempts) {
    RC.calibrationAttempts = {}
  }

  // Save each measurement separately
  measurements.forEach((measurement, index) => {
    const measurementType =
      measurement.type || (index === 0 ? 'part1' : 'part2')
    saveCalibrationAttempt(
      RC,
      `${method}-${measurementType}`,
      measurement.distance,
      measurement.calibrationFactor,
      method === 'blindspot'
        ? measurement.ipdCameraPx
        : measurement.currentIPDDistance,
      method === 'blindspot'
        ? measurement.distanceCm
        : measurement.nearestEyeToWebcamDistanceCM,
      measurement.nearestEye,
      measurement.nearestXYPx,
      measurement.nearestDistanceCm,
      measurement.distanceCm_left,
      measurement.distanceCm_right,
      measurement.distanceCm,
      measurement.nearestXYPx_left,
      measurement.nearestXYPx_right,
      measurement.nearestDistanceCm_right,
      measurement.nearestDistanceCm_left,
      spotDeg,
    )
  })
}

// Helper function to save calibration attempts (both failed and successful)
function saveCalibrationAttempt(
  RC,
  method,
  distance,
  calibrationFactor,
  currentIPDDistance,
  nearestEyeToWebcamDistanceCM,
  nearestEye,
  nearestXYPx,
  nearestDistanceCm,
  distanceCm_left,
  distanceCm_right,
  distanceCm,
  nearestXYPx_left,
  nearestXYPx_right,
  nearestDistanceCm_right,
  nearestDistanceCm_left,
  spotDeg = undefined,
) {
  // Initialize the calibration attempts object if it doesn't exist
  if (!RC.calibrationAttempts) {
    RC.calibrationAttempts = {}
  }

  // Trim values to 1 decimal place, handle NaN gracefully
  const trimmedDistance = isNaN(distanceCm)
    ? NaN
    : parseFloat(distanceCm.toFixed(1))
  const trimmedCalibrationFactor = isNaN(calibrationFactor)
    ? NaN
    : parseFloat(calibrationFactor.toFixed(1))

  // Find the next available calibration number
  let calibrationNumber = 1
  while (RC.calibrationAttempts[`calibration${calibrationNumber}`]) {
    calibrationNumber++
  }

  // Helper function to safely round centimeter values (1 decimal place)
  const safeRoundCm = value => {
    if (value == null || isNaN(value)) return null
    return Math.round(value * 10) / 10
  }

  // Helper function to safely round pixel values (integer)
  const safeRoundPx = value => {
    if (value == null || isNaN(value)) return null
    return Math.round(value)
  }

  // Helper function to safely round XY pixel coordinates
  const safeRoundXYPx = xyArray => {
    if (!xyArray || !Array.isArray(xyArray) || xyArray.length < 2) return null
    const x = safeRoundPx(xyArray[0])
    const y = safeRoundPx(xyArray[1])
    if (x === null || y === null) return null
    return [x, y]
  }

  const safeToFixed = value => {
    if (value == null || isNaN(value)) return null
    return parseFloat(value).toFixed(1)
  }

  // Calculate missing values
  const ppi = RC.screenPpi.value
  const pxPerCmValue = ppi / 2.54 // Convert PPI to pixels per cm
  const cameraXYPxValue = [window.innerWidth / 2, 0] // Top center of screen
  const centerXYPxValue = [window.innerWidth / 2, window.innerHeight / 2] // Screen center
  const ipdCmValue = RC._CONST.IPD_CM // Standard IPD in cm (6.3cm)

  // Calculate eye-to-center distances using trigonometry
  // Use Pythagorean theorem: distance to center = sqrt(distance to nearest² + (nearest to center)²)
  const halfScreenHeightCm = _calculateDistanceFromCenterToTop(ppi)

  // Calculate distances from nearest points to screen center for each eye
  const leftEyeToCenterCmValue =
    nearestDistanceCm_left != null && !isNaN(nearestDistanceCm_left)
      ? Math.sqrt(nearestDistanceCm_left ** 2 + halfScreenHeightCm ** 2)
      : null

  const rightEyeToCenterCmValue =
    nearestDistanceCm_right != null && !isNaN(nearestDistanceCm_right)
      ? Math.sqrt(nearestDistanceCm_right ** 2 + halfScreenHeightCm ** 2)
      : null

  // Create the calibration object
  const calibrationObject = {
    method: method,
    pxPerCm: safeRoundCm(pxPerCmValue), //measured in size phase of rc
    cameraXYPx: safeRoundXYPx(cameraXYPxValue), //top center of the screen
    eyesToCameraCm: safeRoundCm(nearestEyeToWebcamDistanceCM),
    ipdCameraPx: safeRoundPx(currentIPDDistance),
    factorCameraPxCm: safeRoundPx(trimmedCalibrationFactor),
    ipdCm: safeRoundCm(ipdCmValue), //calculated from age
    leftEyeFootXYPx: safeRoundXYPx(nearestXYPx_left),
    rightEyeFootXYPx: safeRoundXYPx(nearestXYPx_right),
    rightEyeToFootCm: safeRoundCm(nearestDistanceCm_right),
    leftEyeToFootCm: safeRoundCm(nearestDistanceCm_left),
    centerXYPx: safeRoundXYPx(centerXYPxValue), // screen center
    rightEyeToCenterCm: safeRoundCm(rightEyeToCenterCmValue), //calcualted by trignometry from above
    leftEyeToCenterCm: safeRoundCm(leftEyeToCenterCmValue), //calcualted by trignometry from above
    spotDeg: safeToFixed(spotDeg), // Add spotDeg for blindspot calibrations
  }

  console.log('factorCameraPxCm', calibrationObject.factorCameraPxCm)

  // Store in the new JSON format
  RC.calibrationAttempts[`calibration${calibrationNumber}`] = calibrationObject

  console.log(`Saved calibration${calibrationNumber}:`, calibrationObject)
}

// Helper to process mesh data and calculate nearest points
async function processMeshDataAndCalculateNearestPoints(
  RC,
  options,
  meshSamples,
  calibrationFactor,
  ppi,
  leftMean = null,
  rightMean = null,
  method = 'blindspot',
  order = 1,
) {
  const mesh = await getMeshData(
    RC,
    options.calibrateTrackDistancePupil,
    meshSamples,
  )
  const { leftEye, rightEye, video, currentIPDDistance } = mesh
  const webcamToEyeDistance = calibrationFactor / currentIPDDistance
  const pxPerCm = ppi / 2.54
  const nearestPointsData = calculateNearestPoints(
    video,
    leftEye,
    rightEye,
    currentIPDDistance,
    webcamToEyeDistance,
    pxPerCm,
    ppi,
    RC,
    {},
    leftMean,
    rightMean,
    method,
    order,
  )

  return {
    nearestPointsData,
    currentIPDDistance,
  }
}

// Helper to create measurement object from nearest points data
function createMeasurementObject(
  type,
  distance,
  calibrationFactor,
  nearestPointsData,
  currentIPDDistance,
  ipdCameraPx = null,
) {
  const {
    nearestDistanceCm_left,
    nearestDistanceCm_right,
    nearestDistanceCm,
    distanceCm_left,
    distanceCm_right,
    distanceCm,
    nearestEyeToWebcamDistanceCM,
    nearestEye,
    nearestXYPx,
    nearestXYPx_left,
    nearestXYPx_right,
  } = nearestPointsData

  const measurement = {
    type: type,
    distance: distance,
    calibrationFactor: calibrationFactor,
    nearestDistanceCm: nearestDistanceCm,
    distanceCm_left: distanceCm_left,
    distanceCm_right: distanceCm_right,
    distanceCm: distance,
    nearestDistanceCm_right: nearestDistanceCm_right,
    nearestDistanceCm_left: nearestDistanceCm_left,
    currentIPDDistance,
    nearestEyeToWebcamDistanceCM,
    nearestEye,
    nearestXYPx,
    nearestXYPx_left,
    nearestXYPx_right,
  }

  if (ipdCameraPx !== null) {
    measurement.ipdCameraPx = ipdCameraPx
  }

  return measurement
}

// Helper to get intraocular distance in pixels (not cm) - moved to global scope
async function measureIntraocularDistancePx(
  RC,
  calibrateTrackDistancePupil = 'iris',
  meshSamples = [],
) {
  let video = document.getElementById('webgazerVideoCanvas')
  if (!video) return null
  const model = await RC.gazeTracker.webgazer.getTracker().model
  const faces = await model.estimateFaces(video)
  if (!faces.length) return null
  const mesh = faces[0].keypoints
  const { leftEye, rightEye } = getLeftAndRightEyePointsFromMeshData(
    mesh,
    calibrateTrackDistancePupil,
  )
  if (!leftEye || !rightEye) return null
  const eyeDist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)

  console.log(
    'Eye distance measureIntraocularDistancePx',
    eyeDist(leftEye, rightEye),
  )
  meshSamples.length = 0
  meshSamples.push(...mesh)
  return eyeDist(leftEye, rightEye)
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

    // Mirror the image to match the video display (since video is mirrored by default)
    ctx.save()
    ctx.translate(canvas.width, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    ctx.restore()

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

  // hide webgazerFaceFeedbackBox if calibrateTrackDistanceCenterYourEyesBool is false
  const webgazerFaceFeedbackBox = document.getElementById(
    'webgazerFaceFeedbackBox',
  )
  if (
    !options.calibrateTrackDistanceCenterYourEyesBool &&
    webgazerFaceFeedbackBox
  ) {
    webgazerFaceFeedbackBox.style.display = 'none'
  }

  let ppi = RC._CONST.N.PPI_DONT_USE // Dangerous! Arbitrary value
  if (RC.screenPpi) ppi = RC.screenPpi.value
  else
    console.error(
      'Screen size measurement is required to get accurate viewing distance measurement.',
    )

  // Dynamic blindspot spot diameter in degrees - comes from options
  // Set the range to be 2-8 degrees
  let calibrateTrackDistanceBlindspotDiameterDeg =
    parseFloat(options.calibrateTrackDistanceBlindspotDiameterDeg) || 2.0
  if (calibrateTrackDistanceBlindspotDiameterDeg < 2.0) {
    calibrateTrackDistanceBlindspotDiameterDeg = 2.0
  }
  if (calibrateTrackDistanceBlindspotDiameterDeg > 8.0) {
    calibrateTrackDistanceBlindspotDiameterDeg = 8.0
  }

  let inTest = true // Used to break animation
  let dist = [] // Take the MEDIAN after all tests finished
  let tested = 0 // options.repeatedTesting times

  // Per-eye Face Mesh samples for calibration factor checks
  const faceMeshSamplesLeft = []
  const faceMeshSamplesRight = []
  const meshPointsDuringLeftMeasurement = []
  const meshPointsDuringRightMeasurement = []

  // ===================== SHOW POPUP BEFORE CALIBRATION STARTS =====================
  // Only show popup if not running as part of "both" methods and camera selection hasn't been done
  if (options.useObjectTestData !== 'both' && !options.cameraSelectionDone) {
    await showTestPopup(RC, null, options)
  }

  // Add HTML (append to body to allow overlay above video independent of background)
  const blindSpotDiv = document.createElement('div')
  blindSpotDiv.innerHTML = blindSpotHTML
  document.body.appendChild(blindSpotDiv)
  RC._constructFloatInstructionElement(
    'blind-spot-instruction',
    phrases.RC_distanceTrackingBeforeClosingEye[RC.L],
  )
  // Add blindspot-specific styling to remove white background
  const blindspotInstruction = document.getElementById('blind-spot-instruction')
  if (blindspotInstruction) {
    blindspotInstruction.classList.add('blindspot-instruction')
  }
  RC._addCreditOnBackground(phrases.RC_viewingBlindSpotCredit[RC.L])

  // Get HTML elements
  const wrapper = document.querySelector('#blindspot-wrapper')
  const c = document.querySelector('#blind-spot-canvas')
  const ctx = c.getContext('2d')

  // Ensure canvas sits above video and is interactive as needed
  // Video is at z-index 999999997, so canvas must be higher
  if (wrapper) wrapper.style.zIndex = '99999999998'
  if (c) {
    c.style.zIndex = '99999999999'
    c.style.position = 'absolute'
  }

  const eyeSideEle = document.getElementById('blind-spot-instruction')

  // Track intro page state
  let introPage = true

  // Helper: compute wrapper width (mapping) in pixels from screen width in cm
  const _computeMappingWidthPx = () => {
    const widthCm = RC.screenWidthCm ? RC.screenWidthCm.value : null
    const pxPerCm = ppi / 2.54
    if (!widthCm)
      return Math.min(window.innerWidth, Math.round(0.6 * window.innerWidth))
    const mappingCm = Math.min(
      widthCm,
      Math.max(0.45 * widthCm, 0.2 * widthCm + 18),
    )
    // return Math.round(mappingCm * pxPerCm)
    return Math.round(window.innerWidth)
  }

  // Helper: place video immediately under the fixation crosshair
  const _positionVideoBelowFixation = () => {
    const v = document.getElementById('webgazerVideoContainer')
    if (!v || !wrapper || !c.width || !c.height) return

    // Save original style once
    if (!RC._blindspotOriginalVideoStyle) {
      RC._blindspotOriginalVideoStyle = {
        left: v.style.left,
        right: v.style.right,
        top: v.style.top,
        bottom: v.style.bottom,
        transform: v.style.transform,
        transition: v.style.transition,
      }
    }

    const rect = wrapper.getBoundingClientRect()
    const videoWidth = parseInt(v.style.width) || v.offsetWidth || 0
    const videoHeight = parseInt(v.style.height) || v.offsetHeight || 0
    // Align video at the very top of the screen, horizontally following fixation (crossX)
    const fixationXViewport = rect.left + crossX
    const leftPx = Math.max(0, Math.round(fixationXViewport - videoWidth / 2))
    const topPx = 0 // top-aligned

    // Disable transitions to avoid lag while moving and ensure stacking order
    v.style.transition = 'none'
    v.style.willChange = 'left, top'
    v.style.zIndex = '999999997' // Keep video below canvas (99999999999)
    v.style.pointerEvents = 'none'

    if (_lastVideoLeftPx !== leftPx) {
      v.style.left = `${leftPx}px`
      v.style.right = 'unset'
      v.style.top = `${topPx}px`
      v.style.bottom = 'unset'
      v.style.transform = 'none'
      _lastVideoLeftPx = leftPx
    }
    // Make crossY the vertical center of the video within canvas coordinates
    crossY = Math.max(0, Math.round(topPx - rect.top + videoHeight / 2))
  }

  // Auto-hide video when any Swal modal is present
  let _lastVideoLeftPx = null

  // Setup slider for dynamic spot size with continuous logarithmic positioning
  const slider = document.getElementById('blindspot-size-slider')
  const sliderContainer = document.getElementById('blindspot-slider-container')
  // Hide slider during intro page
  if (sliderContainer) sliderContainer.style.display = 'none'
  if (slider) {
    // SLIDER VARIABLE DEFINITIONS:
    //
    // fractionHeight: Slider position as fraction of whole range (0.0 to 1.0)
    //   - 0.0 = bottom of slider = 2° spot diameter
    //   - 1.0 = top of slider = 8° spot diameter
    //   - Continuous values between 0.0 and 1.0
    //
    // Logarithmic relationship: spotDeg = 2**(2*fractionHeight+1)
    //   - fractionHeight = 0.0 → spotDeg = 2**(2*0+1) = 2**1 = 2°
    //   - fractionHeight = 0.5 → spotDeg = 2**(2*0.5+1) = 2**2 = 4°
    //   - fractionHeight = 1.0 → spotDeg = 2**(2*1+1) = 2**3 = 8°

    // Convert initial spotDeg to fractionHeight for slider position
    // spotDeg = 2**(2*fractionHeight+1), so fractionHeight = (log2(spotDeg) - 1) / 2
    const initialFractionHeight =
      (Math.log2(calibrateTrackDistanceBlindspotDiameterDeg) - 1) / 2
    slider.value = initialFractionHeight

    slider.addEventListener('input', e => {
      const fractionHeight = parseFloat(e.target.value) // Range: 0.0 to 1.0

      // Calculate spotDeg from fractionHeight: spotDeg = 2**(2*fractionHeight+1)
      calibrateTrackDistanceBlindspotDiameterDeg = parseFloat(
        Math.pow(2, 2 * fractionHeight + 1),
      )

      // Limit to 8 degrees maximum (safety check)
      if (calibrateTrackDistanceBlindspotDiameterDeg > 8.0) {
        calibrateTrackDistanceBlindspotDiameterDeg = 8.0
      }

      // Recalculate circle bounds and check if current position is still valid
      const spotRadiusPx = calculateSpotRadiusPx(
        calibrateTrackDistanceBlindspotDiameterDeg,
        ppi,
        blindspotEccXDeg,
        circleX,
        crossX,
      )
      circleBounds = _getDiamondBounds(
        eyeSide,
        centerX,
        c.width,
        spotRadiusPx * 2, // Convert radius to diamond width
        ppi,
      )
      // keep fixation mirrored across camera line and video top-centered
      crossX = 2 * centerX - circleX
      _positionVideoBelowFixation()

      // Check if current position is still within bounds, adjust if needed
      if (circleX < circleBounds[0]) {
        circleX = circleBounds[0] // Move to leftmost valid position
      } else if (circleX > circleBounds[1]) {
        circleX = circleBounds[1] // Move to rightmost valid position
      }
    })

    // Add keyboard event listeners for up/down arrow keys to control slider
    const handleKeyDown = e => {
      // Only handle arrow keys when the slider is focused or when no other element is focused
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault() // Prevent page scrolling

        const currentValue = parseFloat(slider.value)
        const step = 0.05 // Larger step for more responsive control (5% of slider range)

        let newValue
        if (e.key === 'ArrowUp') {
          newValue = Math.min(1.0, currentValue + step) // Increase spot size
        } else {
          newValue = Math.max(0.0, currentValue - step) // Decrease spot size
        }

        // Update slider value
        slider.value = newValue

        // Trigger the same logic as the slider input event
        const fractionHeight = newValue

        // Calculate spotDeg from fractionHeight: spotDeg = 2**(2*fractionHeight+1)
        calibrateTrackDistanceBlindspotDiameterDeg = parseFloat(
          Math.pow(2, 2 * fractionHeight + 1),
        )

        // Limit to 8 degrees maximum (safety check)
        if (calibrateTrackDistanceBlindspotDiameterDeg > 8.0) {
          calibrateTrackDistanceBlindspotDiameterDeg = 8.0
        }

        // Recalculate circle bounds and check if current position is still valid
        const spotRadiusPx = calculateSpotRadiusPx(
          calibrateTrackDistanceBlindspotDiameterDeg,
          ppi,
          blindspotEccXDeg,
          circleX,
          crossX,
        )
        circleBounds = _getCameraLineBounds(
          eyeSide,
          centerX,
          c.width,
          spotRadiusPx,
          ppi,
        )

        // Check if current position is still within bounds, adjust if needed
        if (circleX < circleBounds[0]) {
          circleX = circleBounds[0] // Move to leftmost valid position
        } else if (circleX > circleBounds[1]) {
          circleX = circleBounds[1] // Move to rightmost valid position
        }
        // Mirror fixation across the camera line and keep video top-centered
        crossX = 2 * centerX - circleX
        _positionVideoBelowFixation()
      }
    }

    // Add event listener to document for global keyboard control
    document.addEventListener('keydown', handleKeyDown)

    // Store reference for cleanup later
    window.blindspotKeyHandler = handleKeyDown
  }
  // let eyeSide = (eyeSideEle.innerText = 'LEFT').toLocaleLowerCase()
  let eyeSide = 'left'

  // Blindspot eccentricity constants (in degrees)
  // These define the anatomical position of the blindspot relative to fixation
  // blindspotEccXDeg should have the same sign as spotEccXCm (negative for left eye, positive for right eye)
  let blindspotEccXDeg = eyeSide === 'left' ? -15.5 : 15.5 // Horizontal eccentricity: ±15.5° (negative for left eye, positive for right eye)
  const blindspotEccYDeg = -1.5 // Vertical eccentricity: -1.5° (below horizontal midline)

  // On intro page, position instructions on left side
  RC._setFloatInstructionElementPos('left', 16)
  // Camera line (vertical midline) and high placement configuration
  let centerX = c.width / 2
  let crossY = 60 // place cross/video near the top
  // crossX will mirror the spot around the camera line; initialize at camera line
  let crossX = centerX

  let circleBounds
  // Declare circleX early so it is defined before any layout resets
  let circleX

  // Window resize
  const _resetCanvasSize = () => {
    const wrapperWidth = _computeMappingWidthPx()
    if (wrapper) {
      wrapper.style.width = `${wrapperWidth}px`
      wrapper.style.pointerEvents = 'none'
    }

    c.width = wrapperWidth
    c.height = window.innerHeight
    c.style.width = `${c.width}px`
    c.style.height = `${c.height}px`
    centerX = c.width / 2
    // keep cross mirroring current circle if available, else center
    crossX = typeof circleX === 'number' ? 2 * centerX - circleX : centerX
    // keep cross high on the screen
    crossY = 60
    // Calculate initial spot radius using the actual spot size at 6cm eccentricity
    const defaultSpotEccXCm = 6 // Use 6cm as default eccentricity for initial bounds calculation
    const defaultSpotCm =
      (Math.abs(defaultSpotEccXCm) *
        calibrateTrackDistanceBlindspotDiameterDeg) /
      blindspotEccXDeg
    const spotRadiusPx = (defaultSpotCm / 2) * ppiToPxPerCm(ppi)
    circleBounds = _getDiamondBounds(
      eyeSide,
      centerX,
      c.width,
      spotRadiusPx * 2, // Convert radius to diamond width
      ppi,
    )

    // Ensure initial position is within bounds
    const initialDistanceCm = 6
    const initialDistancePx = (initialDistanceCm * ppi) / 2.54
    const initialCircleX =
      eyeSide === 'left'
        ? crossX + initialDistancePx // Left eye: start 6cm to the right of crosshair
        : crossX - initialDistancePx // Right eye: start 6cm to the left of crosshair

    // Constrain initial position to bounds
    const constrainedInitialX = Math.max(
      circleBounds[0],
      Math.min(circleBounds[1], initialCircleX),
    )

    // Move video to top aligned with current fixation after dimensions update
    _positionVideoBelowFixation()
  }
  const resizeObserver = new ResizeObserver(() => {
    _resetCanvasSize()
  })
  resizeObserver.observe(RC.background)
  _resetCanvasSize()

  // Set initial position to 6cm separation (D) between spot and cross, symmetric about camera line
  const initialDistanceCm = 6
  const initialDistancePx = (initialDistanceCm * ppi) / 2.54
  // For symmetric layout: |circleX - centerX| = D/2
  const desiredInitialX =
    eyeSide === 'left'
      ? centerX + initialDistancePx / 2
      : centerX - initialDistancePx / 2

  // Constrain to bounds to ensure spot doesn't go off screen
  circleX = Math.max(
    circleBounds[0],
    Math.min(circleBounds[1], desiredInitialX),
  )
  // Mirror fixation cross across camera line and position video at top
  crossX = 2 * centerX - circleX
  _positionVideoBelowFixation()

  // Helper function to calculate spot radius in pixels from angular diameter
  const calculateSpotRadiusPx = (
    spotDeg,
    ppi,
    blindspotEccXDeg,
    currentCircleX,
    currentCrossX,
  ) => {
    // VARIABLE DEFINITIONS AND SIGNS:
    //
    // spotDeg: Angular diameter of the spot in degrees (always positive, 1-8°)
    // blindspotEccXDeg: Anatomical blindspot horizontal eccentricity (±15.5°, negative for left eye, positive for right eye)
    // blindspotEccYDeg: Anatomical blindspot vertical eccentricity (always negative, -1.5°)
    //
    // spotEccXCm: Horizontal eccentricity of spot center from fixation/crosshair (cm)
    //   - Sign: Same as circleX position relative to crosshair
    //   - Left of crosshair: negative (spotEccXCm < 0)
    //   - Right of crosshair: positive (spotEccXCm > 0)
    //   - At crosshair: zero (spotEccXCm = 0)
    //
    // spotEccYCm: Vertical eccentricity of spot center from fixation (cm)
    //   - Always negative because blindspot is below midline
    //   - Formula: spotEccYCm = spotEccXCm * blindspotEccYDeg / blindspotEccXDeg
    //   - Since spotEccXCm and blindspotEccXDeg have the same sign, spotEccYCm is always negative
    //   - Positions spot 1.5° below horizontal midline (fixation point)
    //
    // spotCm: Physical diameter of spot in centimeters (always positive)
    //   - Formula: spotCm = |spotEccXCm| * spotDeg / blindspotEccXDeg
    //   - Always positive because we use absolute value of spotEccXCm

    // Calculate spotEccXCm from current circle position relative to fixation/crosshair
    const spotEccXCm = (currentCircleX - currentCrossX) / ppiToPxPerCm(ppi)

    // Calculate spotCm using the formula: spotCm = spotEccXCm * spotDeg / blindspotEccXDeg
    // Since spotEccXCm and blindspotEccXDeg always have the same sign, spotCm is always positive
    const spotCm = (spotEccXCm * spotDeg) / blindspotEccXDeg

    // Safety check: ensure spotCm is always positive and has a minimum size
    const safeSpotCm = Math.max(Math.abs(spotCm), 0.1) // Minimum 0.1cm diameter

    // Convert diameter to radius in pixels
    return (safeSpotCm / 2) * ppiToPxPerCm(ppi)
  }

  // Helper function to calculate spot Y position (vertical eccentricity)
  const calculateSpotY = (
    currentCircleX,
    currentCrossX,
    currentCrossY,
    ppi,
    blindspotEccXDeg,
    blindspotEccYDeg,
  ) => {
    // Calculate spotEccXCm from current circle position relative to fixation/crosshair
    const spotEccXCm = (currentCircleX - currentCrossX) / ppiToPxPerCm(ppi)

    // Calculate spotEccYCm using the formula: spotEccYCm = spotEccXCm * blindspotEccYDeg / blindspotEccXDeg
    // This positions the spot 1.5° below the horizontal midline (fixation)
    // Since spotEccXCm and blindspotEccXDeg have the same sign, spotEccYCm will always be negative (below fixation)
    const spotEccYCm = (spotEccXCm * blindspotEccYDeg) / blindspotEccXDeg

    // Convert to pixels and position relative to crosshair Y
    const spotEccYCmPx = spotEccYCm * ppiToPxPerCm(ppi)
    return currentCrossY + spotEccYCmPx
  }

  // Bounds based on video constraints (not spot radius).
  // Video controls movement: video cannot cross midline or screen edges.
  // Spot can extend beyond screen edges.
  // circleX and crossX are mirrored: crossX = 2 * centerX - circleX
  function _getCameraLineBounds(side, cameraLineX, cW, radius = 15, ppi = 96) {
    const minDistanceCm = 5
    const minDistancePx = (minDistanceCm * ppi) / 2.54
    const minHalfPx = minDistancePx / 2

    // Get video dimensions
    const v = document.getElementById('webgazerVideoContainer')
    const videoWidth = v ? parseInt(v.style.width) || v.offsetWidth || 0 : 0
    const videoHalfWidth = videoWidth / 2

    if (side === 'left') {
      // Left eye: spot on right (circleX > centerX), video/fixation on left (crossX < centerX)
      // Video constraints on crossX: videoHalfWidth <= crossX <= centerX - videoHalfWidth
      // Convert to circleX: circleX = 2*centerX - crossX
      // Min circleX when crossX is max: circleX = 2*centerX - (centerX - videoHalfWidth) = centerX + videoHalfWidth
      // Max circleX when crossX is min: circleX = 2*centerX - videoHalfWidth
      const minX = Math.max(
        cameraLineX + minHalfPx,
        cameraLineX + videoHalfWidth,
      )
      const maxX = 2 * cameraLineX - videoHalfWidth
      return [minX, maxX]
    } else {
      // Right eye: spot on left (circleX < centerX), video/fixation on right (crossX > centerX)
      // Video constraints on crossX: centerX + videoHalfWidth <= crossX <= window.innerWidth - videoHalfWidth
      // Convert to circleX: circleX = 2*centerX - crossX
      // Max circleX when crossX is min: circleX = 2*centerX - (centerX + videoHalfWidth) = centerX - videoHalfWidth
      // Min circleX when crossX is max: circleX = 2*centerX - (window.innerWidth - videoHalfWidth)
      const minX = 2 * cameraLineX - (window.innerWidth - videoHalfWidth)
      const maxX = Math.min(
        cameraLineX - minHalfPx,
        cameraLineX - videoHalfWidth,
      )
      return [minX, maxX]
    }
  }

  // Diamond-specific bounds calculation
  // For a diamond, we need to ensure the diamond edges don't go off screen
  function _getDiamondBounds(side, cameraLineX, cW, diamondWidth, ppi = 96) {
    const minDistanceCm = 5
    const minDistancePx = (minDistanceCm * ppi) / 2.54
    const minHalfPx = minDistancePx / 2

    // Get video dimensions
    const v = document.getElementById('webgazerVideoContainer')
    const videoWidth = v ? parseInt(v.style.width) || v.offsetWidth || 0 : 0
    const videoHalfWidth = videoWidth / 2

    // For diamond bounds, we need to account for the diamond's width
    // Diamond extends diamondWidth/2 in each direction from center
    const diamondHalfWidth = diamondWidth / 2

    if (side === 'left') {
      // Left eye: spot on right (circleX > centerX), video/fixation on left (crossX < centerX)
      // Ensure diamond doesn't go off right edge of screen
      const minX = Math.max(
        cameraLineX + minHalfPx,
        cameraLineX + videoHalfWidth,
      )
      const maxX = Math.min(
        2 * cameraLineX - videoHalfWidth,
        cW - diamondHalfWidth, // Don't let diamond go off right edge
      )
      return [minX, maxX]
    } else {
      // Right eye: spot on left (circleX < centerX), video/fixation on right (crossX > centerX)
      // Ensure diamond doesn't go off left edge of screen
      const minX = Math.max(
        2 * cameraLineX - (window.innerWidth - videoHalfWidth),
        diamondHalfWidth, // Don't let diamond go off left edge
      )
      const maxX = Math.min(
        cameraLineX - minHalfPx,
        cameraLineX - videoHalfWidth,
      )
      return [minX, maxX]
    }
  }

  // Diamond vertical bounds calculation
  // Ensures diamond doesn't go off top or bottom of screen
  function _getDiamondVerticalBounds(diamondWidth, cH) {
    const diamondHalfWidth = diamondWidth / 2
    const minY = diamondHalfWidth // Don't let diamond go off top edge
    const maxY = cH - diamondHalfWidth // Don't let diamond go off bottom edge
    return [minY, maxY]
  }

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

    // Remove keyboard event listener for slider control
    if (window.blindspotKeyHandler) {
      document.removeEventListener('keydown', window.blindspotKeyHandler)
      window.blindspotKeyHandler = null
    }

    // Remove slider
    const sliderContainer = document.getElementById(
      'blindspot-slider-container',
    )
    if (sliderContainer) {
      sliderContainer.remove()
    }

    // Remove blindspot overlay from body
    const blindOverlay = document.getElementById('blindspot-wrapper')
    if (blindOverlay && blindOverlay.parentNode) {
      try {
        blindOverlay.parentNode.removeChild(blindOverlay)
      } catch (e) {}
    }

    RC._removeBackground()

    if (!RC._trackingSetupFinishedStatus.distance && toBreakTracking) {
      RC._trackingSetupFinishedStatus.distance = true
      if (RC.gazeTracker.checkInitialized('distance', false)) RC.endDistance()
    }

    unbindKeys(bindKeysFunction)
    unbindKeys(bindKeyUpsFunction, 'keyup')

    // Restore original video position when exiting test
    const vCont = document.getElementById('webgazerVideoContainer')
    if (vCont && RC._blindspotOriginalVideoStyle) {
      const s = RC._blindspotOriginalVideoStyle
      vCont.style.left = s.left
      vCont.style.right = s.right
      vCont.style.top = s.top
      vCont.style.bottom = s.bottom
      vCont.style.transform = s.transform
      vCont.style.transition = s.transition
      try {
        setDefaultVideoPosition(RC, vCont)
      } catch (e) {}
      RC._blindspotOriginalVideoStyle = null
    }
  }

  // SPACE
  const finishFunction = async () => {
    // customButton.disabled = false
    if (env !== 'mocha') soundFeedback()

    // If on intro page, transition to left eye test without recording
    if (introPage) {
      introPage = false

      // Show slider now that test begins
      if (sliderContainer) sliderContainer.style.display = 'block'

      // Update instructions to left eye instructions
      if (eyeSideEle) {
        eyeSideEle.innerHTML = replaceNewlinesWithBreaks(
          phrases.RC_distanceTrackingCloseL[RC.L],
        )
      }
      // Keep instructions on left side (already positioned there)
      RC._setFloatInstructionElementPos('left', 16)

      // Initialize left eye geometry and bounds
      const spotRadiusPx = calculateSpotRadiusPx(
        calibrateTrackDistanceBlindspotDiameterDeg,
        ppi,
        blindspotEccXDeg,
        circleX,
        crossX,
      )
      circleBounds = _getDiamondBounds(
        eyeSide,
        centerX,
        c.width,
        spotRadiusPx * 2, // Convert radius to diamond width
        ppi,
      )

      // Reset position for actual test
      const initialDistanceCm = 6
      const initialDistancePx = (initialDistanceCm * ppi) / 2.54
      const desiredInitialX =
        eyeSide === 'left'
          ? centerX + initialDistancePx / 2
          : centerX - initialDistancePx / 2
      circleX = Math.max(
        circleBounds[0],
        Math.min(circleBounds[1], desiredInitialX),
      )
      crossX = 2 * centerX - circleX
      _positionVideoBelowFixation()

      return
    }

    tested += 1
    // Average
    const pxPerCm = ppi / 2.54
    // Calculate the spot's Y position
    const spotY = calculateSpotY(
      circleX,
      crossX,
      crossY,
      ppi,
      blindspotEccXDeg,
      blindspotEccYDeg,
    )

    const fixationToSpotPx = Math.sqrt(
      (circleX - crossX) ** 2 + (spotY - crossY) ** 2,
    )
    const fixationToSpotCm = fixationToSpotPx / pxPerCm
    const eyeToCameraCm = _getEyeToCameraCm(fixationToSpotCm)
    dist.push({
      dist: toFixedNumber(eyeToCameraCm, options.decimalPlace),
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
        eyeToCameraCm,
        options.decimalPlace,
      )
    else
      RC.blindspotData.viewingDistanceByBlindSpot2Cm = toFixedNumber(
        eyeToCameraCm,
        options.decimalPlace,
      )

    // Collect per-eye Face Mesh samples for calibration factor checks
    const collectFiveSamples = async (targetArray, meshSamples) => {
      for (let i = 0; i < 5; i++) {
        try {
          const pxDist = await measureIntraocularDistancePx(
            RC,
            options.calibrateTrackDistancePupil,
            meshSamples,
          )
          targetArray.push(pxDist && !isNaN(pxDist) ? pxDist : NaN)
        } catch (e) {
          targetArray.push(NaN)
        }
        await new Promise(res => setTimeout(res, 100))
      }
    }
    if (eyeSide === 'left')
      await collectFiveSamples(
        faceMeshSamplesLeft,
        meshPointsDuringLeftMeasurement,
      )
    else
      await collectFiveSamples(
        faceMeshSamplesRight,
        meshPointsDuringRightMeasurement,
      )

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
        const distance1FactorCmPx = Math.round(leftAvgFM * leftMean)
        const distance2FactorCmPx = Math.round(rightAvgFM * rightMean)

        // Calibration factor used for tracking
        // Apply Pythagorean correction: blindspot gives eyeToScreenCm, but we need eyeToCameraCm for calibration
        const eyeToCameraCm = data.value
        const calibrationFactor = Math.round(averageFaceMesh * eyeToCameraCm)

        console.log('=== Blindspot Test Calibration Factor ===')
        console.log('Blindspot distance (eyeToScreenCm):', data.value, 'cm')
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

        try {
          if (
            meshPointsDuringLeftMeasurement.length &&
            meshPointsDuringRightMeasurement.length
          ) {
            const measurements = []

            if (meshPointsDuringLeftMeasurement.length) {
              const { nearestPointsData, currentIPDDistance } =
                await processMeshDataAndCalculateNearestPoints(
                  RC,
                  options,
                  meshPointsDuringLeftMeasurement,
                  calibrationFactor,
                  ppi,
                  leftMean,
                  rightMean,
                  'blindspot',
                  1,
                )

              const leftCalibrationFactor = distance1FactorCmPx
              measurements.push(
                createMeasurementObject(
                  'right-eye',
                  leftMean,
                  leftCalibrationFactor,
                  nearestPointsData,
                  currentIPDDistance,
                  leftAvgFM,
                ),
              )
            }

            if (meshPointsDuringRightMeasurement.length) {
              const { nearestPointsData, currentIPDDistance } =
                await processMeshDataAndCalculateNearestPoints(
                  RC,
                  options,
                  meshPointsDuringRightMeasurement,
                  calibrationFactor,
                  ppi,
                  leftMean,
                  rightMean,
                  'blindspot',
                  2,
                )

              const rightCalibrationFactor = distance2FactorCmPx
              measurements.push(
                createMeasurementObject(
                  'left-eye',
                  rightMean,
                  rightCalibrationFactor,
                  nearestPointsData,
                  currentIPDDistance,
                  rightAvgFM,
                ),
              )
            }

            saveCalibrationMeasurements(
              RC,
              'blindspot',
              measurements,
              calibrateTrackDistanceBlindspotDiameterDeg,
            )
          }
        } catch (error) {
          console.error('Error getting mesh data:', error)
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
            options.calibrateTrackDistanceCheckLengthCm,
            options.calibrateTrackDistanceCenterYourEyesBool,
            options.calibrateTrackDistancePupil,
          )
        else safeExecuteFunc(callback, data)
      } else {
        const reasonIsOutOfRange = message.includes('out of allowed range')
        let displayMessage = phrases.RC_viewingBlindSpotRejected[RC.L]
          .replace('[[N11]]', Math.round(min))
          .replace('[[N22]]', Math.round(max))
        if (reasonIsOutOfRange) {
          displayMessage = phrases.RC_viewingExceededRange[RC.L]
            .replace('[[N11]]', Math.round(min))
            .replace('[[N22]]', Math.round(max))
            .replace('[[N33]]', Math.round(RMin))
            .replace('[[N44]]', Math.round(RMax))
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

        const calibrationFactor =
          averageFaceMesh *
          Math.sqrt(
            distanceMeasured ** 2 - _calculateDistanceFromCenterToTop(ppi) ** 2,
          )

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
        const distance1FactorCmPx = Math.round(leftAvgFM * leftMean)
        const distance2FactorCmPx = Math.round(rightAvgFM * rightMean)
        try {
          if (
            meshPointsDuringLeftMeasurement.length &&
            meshPointsDuringRightMeasurement.length
          ) {
            const measurements = []
            if (meshPointsDuringLeftMeasurement.length) {
              const { nearestPointsData, currentIPDDistance } =
                await processMeshDataAndCalculateNearestPoints(
                  RC,
                  options,
                  meshPointsDuringLeftMeasurement,
                  calibrationFactor,
                  ppi,
                  leftMean,
                  rightMean,
                  'blindspot',
                  1,
                )

              const leftCalibrationFactor = distance1FactorCmPx
              measurements.push(
                createMeasurementObject(
                  'right-eye',
                  leftMean,
                  leftCalibrationFactor,
                  nearestPointsData,
                  currentIPDDistance,
                  leftAvgFM,
                ),
              )
            }
            if (meshPointsDuringRightMeasurement.length) {
              const { nearestPointsData, currentIPDDistance } =
                await processMeshDataAndCalculateNearestPoints(
                  RC,
                  options,
                  meshPointsDuringRightMeasurement,
                  calibrationFactor,
                  ppi,
                  leftMean,
                  rightMean,
                  'blindspot',
                  2,
                )

              const rightCalibrationFactor = distance2FactorCmPx
              measurements.push(
                createMeasurementObject(
                  'left-eye',
                  rightMean,
                  rightCalibrationFactor,
                  nearestPointsData,
                  currentIPDDistance,
                  rightAvgFM,
                ),
              )
            }

            saveCalibrationMeasurements(
              RC,
              'blindspot',
              measurements,
              calibrateTrackDistanceBlindspotDiameterDeg,
            )
          }
        } catch (error) {
          console.error('Error getting mesh data:', error)
        }

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
        blindspotEccXDeg = 15.5 // Positive for right eye
        eyeSideEle.innerHTML = replaceNewlinesWithBreaks(
          phrases.RC_distanceTrackingCloseR[RC.L],
        )
      } else {
        eyeSide = 'left'
        blindspotEccXDeg = -15.5 // Negative for left eye
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
        circleX -= 2.5
        helpMoveCircleX()
      } else if (e.key === 'ArrowRight') {
        circleX += 2.5
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
    if (introPage) {
      // No movement on intro page
      return
    }
    // Recalculate bounds with current spot size to ensure they're up to date
    const spotRadiusPx = calculateSpotRadiusPx(
      calibrateTrackDistanceBlindspotDiameterDeg,
      ppi,
      blindspotEccXDeg,
      circleX,
      crossX,
    )
    const currentBounds = _getDiamondBounds(
      eyeSide,
      centerX,
      c.width,
      spotRadiusPx * 2, // Convert radius to diamond width
      ppi,
    )

    tempX = constrain(circleX, ...currentBounds)
    circleX = tempX
    // keep fixation mirrored across camera line and video top-centered
    crossX = 2 * centerX - circleX
    _positionVideoBelowFixation()
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
    // Ensure blindspot horizontal eccentricity sign matches current eye side
    blindspotEccXDeg = eyeSide === 'left' ? -15.5 : 15.5
    const spotRadiusPx = calculateSpotRadiusPx(
      calibrateTrackDistanceBlindspotDiameterDeg,
      ppi,
      blindspotEccXDeg,
      circleX,
      crossX,
    )
    circleBounds = _getDiamondBounds(
      eyeSide,
      centerX,
      c.width,
      spotRadiusPx * 2, // Convert radius to diamond width
      ppi,
    )

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
      // Set position to 6cm from crosshair when switching eyes, constrained to bounds
      const initialDistanceCm = 6
      const initialDistancePx = (initialDistanceCm * ppi) / 2.54
      const desiredInitialX =
        eyeSide === 'left'
          ? centerX + initialDistancePx / 2
          : centerX - initialDistancePx / 2

      // Constrain to bounds to ensure spot doesn't go off screen
      circleX = Math.max(
        circleBounds[0],
        Math.min(circleBounds[1], desiredInitialX),
      )
      // mirror fixation across camera line
      crossX = 2 * centerX - circleX
      _resetRandnCircleX(nextEyeSide, circleBounds)
    }

    // Keep video under the current fixation crosshair after side change
    _positionVideoBelowFixation()
  }

  // Bind keys - wrap arrow functions to check introPage at runtime
  const bindKeysFunction = bindKeys({
    Escape: options.showCancelButton ? breakFunction : undefined,
    Enter: finishFunction,
    ' ': finishFunction,
    ArrowLeft: control
      ? e => {
          if (!introPage) arrowDownFunction(e)
        }
      : emptyFunc,
    ArrowRight: control
      ? e => {
          if (!introPage) arrowDownFunction(e)
        }
      : emptyFunc,
  })
  const bindKeyUpsFunction = bindKeys(
    {
      ArrowLeft: control
        ? e => {
            if (!introPage) arrowUpFunction(e)
          }
        : emptyFunc,
      ArrowRight: control
        ? e => {
            if (!introPage) arrowUpFunction(e)
          }
        : emptyFunc,
    },
    'keyup',
  )

  addButtons(
    RC.L,
    RC.background,
    {
      //go: finishFunction,
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

    // compute current spot Y for accurate hit testing
    const currentSpotRadiusPx = calculateSpotRadiusPx(
      calibrateTrackDistanceBlindspotDiameterDeg,
      ppi,
      blindspotEccXDeg,
      circleX,
      crossX,
    )
    const currentSpotY = calculateSpotY(
      circleX,
      crossX,
      crossY,
      ppi,
      blindspotEccXDeg,
      blindspotEccYDeg,
    )
    // Apply vertical bounds to click detection as well
    const verticalBounds = _getDiamondVerticalBounds(
      currentSpotRadiusPx * 2, // Convert radius to diamond width
      c.height,
    )
    const constrainedCurrentSpotY = constrain(currentSpotY, ...verticalBounds)

    if (
      clickOnDiamond(
        circleX,
        constrainedCurrentSpotY,
        startX,
        startY,
        currentSpotRadiusPx * 2,
      )
    ) {
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
        const spotRadiusPx = calculateSpotRadiusPx(
          calibrateTrackDistanceBlindspotDiameterDeg,
          ppi,
          blindspotEccXDeg,
          circleX,
          crossX,
        )
        circleX = constrain(
          circleX,
          ..._getDiamondBounds(
            eyeSide,
            centerX,
            c.width,
            spotRadiusPx * 2,
            ppi,
          ),
        )
        // Mirror fixation across camera line and keep video at top
        crossX = 2 * centerX - circleX
        _positionVideoBelowFixation()
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

    frameTimestamp = performance.now()
    const spotRadiusPx = calculateSpotRadiusPx(
      calibrateTrackDistanceBlindspotDiameterDeg,
      ppi,
      blindspotEccXDeg,
      circleX,
      crossX,
    )
    // Ensure the diamond stays within valid horizontal bounds after any layout changes/popups
    const currentBounds = _getDiamondBounds(
      eyeSide,
      centerX,
      c.width,
      spotRadiusPx * 2, // Convert radius to diamond width
      ppi,
    )
    circleX = constrain(circleX, ...currentBounds)
    const spotY = calculateSpotY(
      circleX,
      crossX,
      crossY,
      ppi,
      blindspotEccXDeg,
      blindspotEccYDeg,
    )
    // Ensure the diamond stays within valid vertical bounds
    const verticalBounds = _getDiamondVerticalBounds(
      spotRadiusPx * 2, // Convert radius to diamond width
      c.height,
    )
    const constrainedSpotY = constrain(spotY, ...verticalBounds)
    // Draw the flickering diamond - skip on intro page
    if (!introPage) {
      _diamond(
        RC,
        ctx,
        circleX,
        constrainedSpotY,
        Math.round(frameTimestamp - frameTimestampInitial),
        circleFill,
        options.sparkle,
        spotRadiusPx * 2, // Convert radius to diameter for diamond width
      )
    }

    // Draw cross last so it stays on top of the spot and video
    _cross(ctx, crossX, crossY)
    if (!control && !introPage) {
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

  // FIX this is pointless. Either we are accidentally calling the same phrase twice, or the conditional should be removed - gus
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
      headline: `${phrases.RC_viewingDistanceTitle[this.L]}`,
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

function _getEyeToCameraCm(fixationToSpotCm) {
  const eccDeg = Math.sqrt(15.2 ** 2 + 1.5 ** 2)
  return (0.5 * fixationToSpotCm) / _getTanDeg(0.5 * eccDeg)
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
  let meshSamplesDuringPage3 = []
  let meshSamplesDuringPage4 = []

  // Helper to collect 5 samples of eye pixel distance using Face Mesh
  async function collectFaceMeshSamples(RC, arr, ppi, meshSamples) {
    arr.length = 0 // Clear array

    // Always collect exactly 5 samples, using NaN for failed measurements
    for (let i = 0; i < 5; i++) {
      try {
        const pxDist = await measureIntraocularDistancePx(
          RC,
          options.calibrateTrackDistancePupil,
          meshSamples,
        ) // Get raw pixel distance
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
  let ppi = RC.screenPpi ? RC.screenPpi.value : 96 / 25.4 // fallback: 96dpi/25.4mm
  let pxPerMm = ppi / 25.4

  let screenWidth = window.innerWidth
  let screenHeight = window.innerHeight

  // For diagonal tape aligned with screen diagonal
  // Calculate screen diagonal endpoints
  let screenDiagonalStartX = 0 // Bottom-left corner (x)
  let screenDiagonalStartY = screenHeight // Bottom-left corner (y)
  let screenDiagonalEndX = screenWidth // Top-right corner (x)
  let screenDiagonalEndY = 0 // Top-right corner (y)

  // Calculate the direction vector of the screen diagonal
  let diagonalDx = screenDiagonalEndX - screenDiagonalStartX
  let diagonalDy = screenDiagonalEndY - screenDiagonalStartY
  let diagonalLength = Math.sqrt(
    diagonalDx * diagonalDx + diagonalDy * diagonalDy,
  )
  let diagonalUnitX = diagonalDx / diagonalLength
  let diagonalUnitY = diagonalDy / diagonalLength

  // Initial ruler length (can be adjusted)
  let rulerLength = Math.min(screenWidth, screenHeight) * 0.6

  // Set initial left endpoint near bottom-left with a small margin along the diagonal
  const initialInsetPx = 200
  // Left tip at: diagonal start + inset along diagonal
  let startX = screenDiagonalStartX + initialInsetPx * diagonalUnitX
  let startY = screenDiagonalStartY + initialInsetPx * diagonalUnitY

  // Set initial right endpoint to 2/3 of the screen diagonal from the diagonal start
  const twoThirdsAlong = (2 / 3) * diagonalLength
  let endX = screenDiagonalStartX + twoThirdsAlong * diagonalUnitX
  let endY = screenDiagonalStartY + twoThirdsAlong * diagonalUnitY

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

  // ===================== DIAGONAL TAPE MEASUREMENT COMPONENT =====================

  // Create a diagonal tape component that groups all elements
  const createDiagonalTapeComponent = () => {
    // Calculate dimensions
    const tapeWidth = Math.round(0.75 * ppi) // 3/4 inch width for diagonal tape
    const lineThickness = 3 // px thickness for all lines

    // Helper function to calculate distance between two points
    const getDistance = (x1, y1, x2, y2) =>
      Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)

    // Helper function to calculate angle between two points
    const getAngle = (x1, y1, x2, y2) =>
      Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI)

    // Create main tape container (covers the diagonal area)
    const tapeContainer = document.createElement('div')
    tapeContainer.id = 'diagonal-tape-measurement-component'
    tapeContainer.style.position = 'absolute'
    tapeContainer.style.left = '0px'
    tapeContainer.style.top = '0px'
    tapeContainer.style.width = '100vw'
    tapeContainer.style.height = '100vh'
    tapeContainer.style.pointerEvents = 'none' // Allow clicks to pass through to individual elements
    tapeContainer.style.zIndex = '10'

    // Main diagonal tape (yellow background with black border)
    const diagonalTape = document.createElement('div')
    diagonalTape.style.position = 'absolute'
    diagonalTape.style.background = 'rgba(255, 221, 51, 0.95)'
    diagonalTape.style.border = '2px solid rgb(0, 0, 0)'
    diagonalTape.style.borderRadius = '2px'
    diagonalTape.style.zIndex = '1'
    diagonalTape.style.transformOrigin = 'left center'
    tapeContainer.appendChild(diagonalTape)

    // Left handle (invisible diagonal line)
    const leftHandle = document.createElement('div')
    leftHandle.style.position = 'absolute'
    leftHandle.style.width = `${lineThickness}px`
    leftHandle.style.height = `${tapeWidth}px`
    leftHandle.style.background = 'transparent'
    leftHandle.style.borderRadius = '1px'
    leftHandle.style.boxShadow = 'none'
    leftHandle.style.cursor = 'move'
    leftHandle.style.pointerEvents = 'auto'
    leftHandle.style.zIndex = '3'
    leftHandle.style.transform = 'translate(-50%, -50%)'
    leftHandle.style.transformOrigin = 'center center'
    tapeContainer.appendChild(leftHandle)

    // Right handle (invisible diagonal line)
    const rightHandle = document.createElement('div')
    rightHandle.style.position = 'absolute'
    rightHandle.style.width = `${lineThickness}px`
    rightHandle.style.height = `${tapeWidth}px`
    rightHandle.style.background = 'transparent'
    rightHandle.style.borderRadius = '1px'
    rightHandle.style.boxShadow = 'none'
    rightHandle.style.cursor = 'move'
    rightHandle.style.pointerEvents = 'auto'
    rightHandle.style.zIndex = '3'
    rightHandle.style.transform = 'translate(-50%, -50%)'
    rightHandle.style.transformOrigin = 'center center'
    tapeContainer.appendChild(rightHandle)

    // Dynamic length label (centered on tape)
    const dynamicLengthLabel = document.createElement('div')
    dynamicLengthLabel.style.position = 'absolute'
    dynamicLengthLabel.style.color = 'rgb(0, 0, 0)'
    dynamicLengthLabel.style.fontWeight = 'bold'
    dynamicLengthLabel.style.fontSize = '1.4rem'
    dynamicLengthLabel.style.background = 'rgba(255, 221, 51, 1.0)' // Same as tape background
    dynamicLengthLabel.style.padding = '2px 6px'
    dynamicLengthLabel.style.borderRadius = '4px'
    dynamicLengthLabel.style.whiteSpace = 'nowrap'
    dynamicLengthLabel.style.zIndex = '20'
    dynamicLengthLabel.style.transform = 'translate(-50%, -50%)'
    tapeContainer.appendChild(dynamicLengthLabel)

    // Double-sided arrow connecting the ruler edges
    const arrowContainer = document.createElement('div')
    arrowContainer.style.position = 'absolute'
    arrowContainer.style.zIndex = '18'
    arrowContainer.style.pointerEvents = 'none'
    tapeContainer.appendChild(arrowContainer)

    // Main arrow line
    const arrowLine = document.createElement('div')
    arrowLine.style.position = 'absolute'
    arrowLine.style.background = 'rgb(0, 0, 0)'
    arrowLine.style.transformOrigin = 'left center'
    arrowLine.style.height = '2px'
    arrowContainer.appendChild(arrowLine)

    // Left arrowhead (two lines forming a V pointing toward left edge)
    const leftArrowLine1 = document.createElement('div')
    leftArrowLine1.style.position = 'absolute'
    leftArrowLine1.style.background = 'rgb(0, 0, 0)'
    leftArrowLine1.style.width = '24px'
    leftArrowLine1.style.height = '2px'
    leftArrowLine1.style.transformOrigin = 'left center' // pivot at tip
    arrowContainer.appendChild(leftArrowLine1)

    const leftArrowLine2 = document.createElement('div')
    leftArrowLine2.style.position = 'absolute'
    leftArrowLine2.style.background = 'rgb(0, 0, 0)'
    leftArrowLine2.style.width = '24px'
    leftArrowLine2.style.height = '2px'
    leftArrowLine2.style.transformOrigin = 'left center' // pivot at tip
    arrowContainer.appendChild(leftArrowLine2)

    // Right arrowhead (two lines forming a V pointing toward right edge)
    const rightArrowLine1 = document.createElement('div')
    rightArrowLine1.style.position = 'absolute'
    rightArrowLine1.style.background = 'rgb(0, 0, 0)'
    rightArrowLine1.style.width = '24px'
    rightArrowLine1.style.height = '2px'
    rightArrowLine1.style.transformOrigin = 'left center' // pivot at tip
    arrowContainer.appendChild(rightArrowLine1)

    const rightArrowLine2 = document.createElement('div')
    rightArrowLine2.style.position = 'absolute'
    rightArrowLine2.style.background = 'rgb(0, 0, 0)'
    rightArrowLine2.style.width = '24px'
    rightArrowLine2.style.height = '2px'
    rightArrowLine2.style.transformOrigin = 'left center' // pivot at tip
    arrowContainer.appendChild(rightArrowLine2)

    return {
      container: tapeContainer,
      elements: {
        diagonalTape,
        leftHandle,
        rightHandle,
        dynamicLengthLabel,
        arrowContainer,
        arrowLine,
        leftArrowLine1,
        leftArrowLine2,
        rightArrowLine1,
        rightArrowLine2,
      },
      dimensions: {
        tapeWidth,
        lineThickness,
      },
      helpers: {
        getDistance,
        getAngle,
      },
    }
  }

  // Create the diagonal tape component
  const tape = createDiagonalTapeComponent()
  container.appendChild(tape.container)

  // Function to update diagonal tape on window resize (same pattern as checkDistance.js)
  function updateDiagonalTapeOnResize() {
    // Store proportional positions
    const currentStartProportion =
      diagonalLength > 0
        ? Math.sqrt(
            (startX - screenDiagonalStartX) ** 2 +
              (startY - screenDiagonalStartY) ** 2,
          ) / diagonalLength
        : 0
    const currentEndProportion =
      diagonalLength > 0
        ? Math.sqrt(
            (endX - screenDiagonalStartX) ** 2 +
              (endY - screenDiagonalStartY) ** 2,
          ) / diagonalLength
        : 0

    // Update screen dimensions
    screenWidth = window.innerWidth
    screenHeight = window.innerHeight

    // Recalculate diagonal
    screenDiagonalStartX = 0
    screenDiagonalStartY = screenHeight
    screenDiagonalEndX = screenWidth
    screenDiagonalEndY = 0
    diagonalDx = screenDiagonalEndX - screenDiagonalStartX
    diagonalDy = screenDiagonalEndY - screenDiagonalStartY
    diagonalLength = Math.sqrt(
      diagonalDx * diagonalDx + diagonalDy * diagonalDy,
    )
    diagonalUnitX = diagonalDx / diagonalLength
    diagonalUnitY = diagonalDy / diagonalLength

    // Maintain proportional positions
    const newStartDistance = currentStartProportion * diagonalLength
    const newEndDistance = currentEndProportion * diagonalLength
    startX = screenDiagonalStartX + newStartDistance * diagonalUnitX
    startY = screenDiagonalStartY + newStartDistance * diagonalUnitY
    endX = screenDiagonalStartX + newEndDistance * diagonalUnitX
    endY = screenDiagonalStartY + newEndDistance * diagonalUnitY

    // Update tape
    updateDiagonalLabels()
  }

  // Add window resize event listener (same as checkDistance.js)
  window.addEventListener('resize', updateDiagonalTapeOnResize)

  // ===================== TRIANGULAR TEXT BOXES FOR TAPE ENDS =====================

  // Create triangular text box function
  const createSimpleTextBox = (text, isLeft = true) => {
    // Container for the text box
    const textContainer = document.createElement('div')
    textContainer.style.position = 'absolute'
    textContainer.style.zIndex = '15'

    // Calculate text width
    const textLength = text.length
    const estimatedWidth = Math.max(textLength * 12, 120) // At least 120px wide
    const textHeight = 30

    // Create simple rectangular container
    const textBox = document.createElement('div')
    textBox.style.position = 'relative'
    textBox.style.width = `${estimatedWidth}px`
    textBox.style.height = `${textHeight}px`
    textBox.style.background = 'transparent'
    textBox.style.border = 'none'
    textBox.style.display = 'flex'
    textBox.style.alignItems = 'center'
    textBox.style.justifyContent = 'center'

    // Text element
    const textElement = document.createElement('div')
    textElement.innerText = text
    textElement.style.color = 'rgb(0, 0, 0)'
    textElement.style.fontWeight = 'bold'
    textElement.style.fontSize = '1.2em'
    textElement.style.textAlign = 'center'
    textElement.style.lineHeight = '1.2'
    textElement.style.whiteSpace = 'nowrap'
    textElement.style.textShadow = '1px 1px 2px rgba(255, 255, 255, 0.8)'
    textBox.appendChild(textElement)

    textContainer.appendChild(textBox)

    // Function to update text and resize container
    const updateText = newText => {
      const newTextLength = newText.length
      const newEstimatedWidth = Math.max(newTextLength * 12, 120)

      // Update container size
      textBox.style.width = `${newEstimatedWidth}px`

      // Update text
      textElement.innerText = newText

      // Update dimensions for positioning
      textContainer.dimensions = {
        width: newEstimatedWidth,
        height: textHeight,
      }

      return newEstimatedWidth
    }

    return {
      container: textContainer,
      textElement: textElement,
      updateText: updateText,
      dimensions: { width: estimatedWidth, height: textHeight },
    }
  }

  // Left simple text box
  const leftLabel = createSimpleTextBox(phrases.RC_LeftEdge[RC.L], true)
  container.appendChild(leftLabel.container)

  // Right simple text box
  const rightLabel = createSimpleTextBox(phrases.RC_RightEdge[RC.L], false)
  rightLabel.container.id = 'right-line-label'
  container.appendChild(rightLabel.container)

  // ===================== DIAGONAL TAPE MANAGEMENT FUNCTIONS =====================

  // Function to update diagonal tape size and position
  const updateDiagonalTapeComponent = () => {
    // Calculate distance and angle
    const distance = tape.helpers.getDistance(startX, startY, endX, endY)
    const angle = tape.helpers.getAngle(startX, startY, endX, endY)

    // Update diagonal tape
    tape.elements.diagonalTape.style.left = `${startX}px`
    tape.elements.diagonalTape.style.top = `${startY - tape.dimensions.tapeWidth / 2}px`
    tape.elements.diagonalTape.style.width = `${distance}px`
    tape.elements.diagonalTape.style.height = `${tape.dimensions.tapeWidth}px`
    tape.elements.diagonalTape.style.transform = `rotate(${angle}deg)`

    // Update handle positions and rotation to match tape angle
    tape.elements.leftHandle.style.left = `${startX}px`
    tape.elements.leftHandle.style.top = `${startY}px`
    tape.elements.leftHandle.style.transform = `translate(-50%, -50%) rotate(${angle}deg)`
    tape.elements.rightHandle.style.left = `${endX}px`
    tape.elements.rightHandle.style.top = `${endY}px`
    tape.elements.rightHandle.style.transform = `translate(-50%, -50%) rotate(${angle}deg)`

    // Update dynamic length label (centered on tape)
    const centerX = (startX + endX) / 2
    const centerY = (startY + endY) / 2
    const objectLengthPx = distance
    const objectLengthMm = objectLengthPx / pxPerMm
    const objectLengthCm = objectLengthMm / 10

    tape.elements.dynamicLengthLabel.style.left = `${centerX}px`
    tape.elements.dynamicLengthLabel.style.top = `${centerY}px`
    tape.elements.dynamicLengthLabel.innerText = `${objectLengthCm.toFixed(1)} cm`

    // Auto-scale font if needed
    const estimatedLabelWidth =
      tape.elements.dynamicLengthLabel.innerText.length * 10 + 12
    if (estimatedLabelWidth > distance * 0.4) {
      const scaleFactor = (distance * 0.4) / estimatedLabelWidth
      const newFontSize = Math.max(0.7, scaleFactor) * 1.4
      tape.elements.dynamicLengthLabel.style.fontSize = `${newFontSize}rem`
    } else {
      tape.elements.dynamicLengthLabel.style.fontSize = '1.4rem'
    }

    // Update double-sided arrow (spans full ruler length)
    const arrowLength = distance // Arrow spans the full ruler length
    const arrowStartX = startX
    const arrowStartY = startY

    // Position and rotate main arrow line
    tape.elements.arrowLine.style.left = `${arrowStartX}px`
    tape.elements.arrowLine.style.top = `${arrowStartY}px`
    tape.elements.arrowLine.style.width = `${arrowLength}px`
    tape.elements.arrowLine.style.transform = `rotate(${angle}deg)`

    // Left arrowhead tip anchored at left edge (outward pointing to left edge)
    const leftTipX = startX
    const leftTipY = startY
    tape.elements.leftArrowLine1.style.left = `${leftTipX}px`
    tape.elements.leftArrowLine1.style.top = `${leftTipY}px`
    tape.elements.leftArrowLine1.style.transform = `rotate(${angle - 30}deg)` // inside, upper leg

    tape.elements.leftArrowLine2.style.left = `${leftTipX}px`
    tape.elements.leftArrowLine2.style.top = `${leftTipY}px`
    tape.elements.leftArrowLine2.style.transform = `rotate(${angle + 30}deg)` // inside, lower leg

    // Right arrowhead tip anchored at right edge (outward pointing to right edge)
    const rightTipX = endX
    const rightTipY = endY
    tape.elements.rightArrowLine1.style.left = `${rightTipX}px`
    tape.elements.rightArrowLine1.style.top = `${rightTipY}px`
    tape.elements.rightArrowLine1.style.transform = `rotate(${angle + 150}deg)`
    tape.elements.rightArrowLine2.style.left = `${rightTipX}px`
    tape.elements.rightArrowLine2.style.top = `${rightTipY}px`
    tape.elements.rightArrowLine2.style.transform = `rotate(${angle - 150}deg)`
  }

  // Function to update colors based on distance
  const updateDiagonalColors = () => {
    const distance = tape.helpers.getDistance(startX, startY, endX, endY)
    const objectLengthMm = distance / pxPerMm
    const objectLengthCm = objectLengthMm / 10
    const minDistanceCm = options.calibrateTrackDistanceMinCm || 10

    const isShort = objectLengthCm <= minDistanceCm
    const color = isShort ? 'rgb(255, 0, 0)' : 'rgb(0, 0, 0)'
    const shadow = isShort
      ? '0 0 8px rgba(255, 0, 0, 0.4)'
      : '0 0 8px rgba(0, 0, 0, 0.4)'

    // Update handle colors
    tape.elements.leftHandle.style.background = color
    tape.elements.leftHandle.style.boxShadow = shadow
    tape.elements.rightHandle.style.background = color
    tape.elements.rightHandle.style.boxShadow = shadow

    // Update tape border color as well
    tape.elements.diagonalTape.style.borderColor = color

    // Update right label text and color (with dynamic resizing)
    rightLabel.textElement.style.color = color
    const newText = isShort
      ? phrases.RC_viewingDistanceObjectTooShort[RC.L]
      : phrases.RC_RightEdge[RC.L]
    rightLabel.updateText(newText)
  }

  // Add hover effects to diagonal tape handles
  tape.elements.leftHandle.addEventListener('mouseenter', () => {
    tape.elements.leftHandle.style.boxShadow = '0 0 12px rgba(0, 0, 0, 0.6)'
  })
  tape.elements.leftHandle.addEventListener('mouseleave', () => {
    updateDiagonalColors() // This will restore correct shadow
  })

  tape.elements.rightHandle.addEventListener('mouseenter', () => {
    tape.elements.rightHandle.style.boxShadow = '0 0 12px rgba(0, 0, 0, 0.6)'
  })
  tape.elements.rightHandle.addEventListener('mouseleave', () => {
    updateDiagonalColors() // This will restore correct shadow
  })

  // Function to update triangular labels when tape changes
  function updateDiagonalLabels() {
    // Position left label above left handle
    leftLabel.container.style.left = `${startX - leftLabel.dimensions.width / 2}px`
    leftLabel.container.style.top = `${startY - leftLabel.dimensions.height - 10}px`

    // Position right label above right handle
    rightLabel.container.style.left = `${endX - rightLabel.dimensions.width / 2}px`
    rightLabel.container.style.top = `${endY - rightLabel.dimensions.height - 10}px`

    updateDiagonalColors() // Update colors when handles move
    updateDiagonalTapeComponent() // Update tape size and content
  }

  // ===================== DIAGONAL TAPE INTERACTION HANDLERS =====================

  // Dragging functionality for handles
  let leftDragging = false
  let rightDragging = false

  tape.elements.leftHandle.addEventListener('mousedown', e => {
    leftDragging = true
    document.body.style.cursor = 'move'
    e.preventDefault()
  })

  tape.elements.rightHandle.addEventListener('mousedown', e => {
    rightDragging = true
    document.body.style.cursor = 'move'
    e.preventDefault()
  })

  // Helper function to update ruler endpoints while maintaining diagonal alignment
  const updateRulerEndpoints = (newStartX, newStartY, newEndX, newEndY) => {
    // Project endpoints onto the diagonal line to maintain alignment
    const projectPointOnDiagonal = (x, y) => {
      const toPointX = x - screenDiagonalStartX
      const toPointY = y - screenDiagonalStartY
      const projection = toPointX * diagonalUnitX + toPointY * diagonalUnitY
      const projectedX = screenDiagonalStartX + projection * diagonalUnitX
      const projectedY = screenDiagonalStartY + projection * diagonalUnitY
      return { x: projectedX, y: projectedY }
    }

    // Project both points onto diagonal
    const projectedStart = projectPointOnDiagonal(newStartX, newStartY)
    const projectedEnd = projectPointOnDiagonal(newEndX, newEndY)

    // Constrain to screen bounds with margins
    const constrainToScreen = point => {
      return {
        x: Math.max(10, Math.min(screenWidth - 10, point.x)),
        y: Math.max(10, Math.min(screenHeight - 10, point.y)),
      }
    }

    const constrainedStart = constrainToScreen(projectedStart)
    const constrainedEnd = constrainToScreen(projectedEnd)

    // Ensure minimum distance
    const distance = Math.sqrt(
      (constrainedEnd.x - constrainedStart.x) ** 2 +
        (constrainedEnd.y - constrainedStart.y) ** 2,
    )
    if (distance < 50) {
      // If too short, maintain current positions
      return
    }

    startX = constrainedStart.x
    startY = constrainedStart.y
    endX = constrainedEnd.x
    endY = constrainedEnd.y

    updateDiagonalLabels()
  }

  // Mouse move handler for diagonal handles
  window.addEventListener('mousemove', e => {
    if (leftDragging) {
      // Move left handle independently
      const mouseX = e.clientX
      const mouseY = e.clientY
      updateRulerEndpoints(mouseX, mouseY, endX, endY)
    } else if (rightDragging) {
      // Move right handle independently
      const mouseX = e.clientX
      const mouseY = e.clientY
      updateRulerEndpoints(startX, startY, mouseX, mouseY)
    }
  })

  // Mouse up handler
  window.addEventListener('mouseup', () => {
    if (leftDragging || rightDragging) {
      leftDragging = false
      rightDragging = false
      document.body.style.cursor = ''
    }
  })

  // ===================== KEYBOARD HANDLING FOR DIAGONAL TAPE =====================
  let arrowKeyDown = false
  let arrowIntervalFunction = null
  let currentArrowKey = null

  const arrowDownFunction = e => {
    // Only handle arrow keys on page 2
    if (currentPage !== 2) return

    // Prevent default behavior
    e.preventDefault()

    // Handle all four arrow keys for diagonal movement
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key))
      return

    // If already handling a key, ignore
    if (arrowKeyDown) return

    arrowKeyDown = true
    currentArrowKey = e.key

    // Clear any existing interval
    if (arrowIntervalFunction) {
      clearInterval(arrowIntervalFunction)
    }

    // Start continuous movement (only affects right side)
    arrowIntervalFunction = setInterval(() => {
      const moveAmount = 5
      if (currentArrowKey === 'ArrowLeft' || currentArrowKey === 'ArrowUp') {
        // Move right side closer to left (shrink from right)
        const newEndX = endX - moveAmount * diagonalUnitX
        const newEndY = endY - moveAmount * diagonalUnitY
        updateRulerEndpoints(startX, startY, newEndX, newEndY)
      } else if (
        currentArrowKey === 'ArrowRight' ||
        currentArrowKey === 'ArrowDown'
      ) {
        // Move right side away from left (extend from right)
        const newEndX = endX + moveAmount * diagonalUnitX
        const newEndY = endY + moveAmount * diagonalUnitY
        updateRulerEndpoints(startX, startY, newEndX, newEndY)
      }
    }, 50) // Update every 50ms for smooth movement
  }

  const arrowUpFunction = e => {
    // Only handle arrow keys on page 2
    if (currentPage !== 2) return

    // Handle all four arrow keys
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key))
      return

    // Only stop if this is the key we're currently handling
    if (currentArrowKey !== e.key) return

    arrowKeyDown = false
    currentArrowKey = null

    // Clear the interval
    if (arrowIntervalFunction) {
      clearInterval(arrowIntervalFunction)
      arrowIntervalFunction = null
    }
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

  // ===================== INITIALIZATION =====================

  // Initialize diagonal tape with current values
  updateDiagonalLabels()

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

      // Show video on page 0
      RC.showVideo(true)

      // Position video properly
      const videoContainer = document.getElementById('webgazerVideoContainer')
      if (videoContainer) {
        setDefaultVideoPosition(RC, videoContainer)
      }

      // Hide diagonal tape component and labels
      tape.container.style.display = 'none'
      leftLabel.container.style.display = 'none'
      rightLabel.container.style.display = 'none'

      // // Show radio buttons on page 0
      // radioContainer.style.display = 'block'

      // Show PROCEED button on page 0
      proceedButton.style.display = 'block'

      // Hide explanation button on page 0
      explanationButton.style.display = 'none'

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

      // Show video on page 1
      RC.showVideo(true)

      // Position video properly
      const videoContainer = document.getElementById('webgazerVideoContainer')
      if (videoContainer) {
        setDefaultVideoPosition(RC, videoContainer)
      }

      // Hide diagonal tape component and labels
      tape.container.style.display = 'none'
      leftLabel.container.style.display = 'none'
      rightLabel.container.style.display = 'none'

      // Hide explanation button on page 1
      explanationButton.style.display = 'block' //show explanation button on page 1

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
      // ===================== PAGE 2: DIAGONAL TAPE =====================
      console.log('=== SHOWING PAGE 2: DIAGONAL TAPE ===')

      // Hide video on page 2 (tape measurement)
      RC.showVideo(false)

      // Show diagonal tape component and labels
      tape.container.style.display = 'block'
      leftLabel.container.style.display = 'block'
      rightLabel.container.style.display = 'block'

      // // Hide radio buttons on page 2
      // radioContainer.style.display = 'none'

      // Hide PROCEED button on page 2 - only allow space key
      proceedButton.style.display = 'none'

      // Hide explanation button on page 2
      explanationButton.style.display = 'block' //show explanation button on page 2

      // Create placeholder text for page 2 only if calibrateTrackDistanceCheckBool is true
      if (options.calibrateTrackDistanceCheckBool) {
        const dontUseRuler = document.createElement('div')
        dontUseRuler.innerText = phrases.RC_DontUseYourRulerYet[RC.L]
        dontUseRuler.style.position = 'fixed'
        dontUseRuler.style.top = '60%' // A bit lower than halfway down the page
        dontUseRuler.style.transform = 'translateY(-50%)' // Center vertically
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
          dontUseRuler.style.right = 'auto'
        }
        container.appendChild(dontUseRuler)
      }

      // Update all positions and colors after showing lines
      updateDiagonalLabels()

      // Update instructions with combined phrase
      instructions.innerText =
        phrases['RC_UseObjectToSetViewingDistancePage1&2'][RC.L]
    } else if (pageNumber === 3) {
      // ===================== PAGE 3: VIDEO ONLY =====================
      console.log('=== SHOWING PAGE 3: VIDEO ONLY ===')

      // Show video on page 3
      RC.showVideo(true)

      // Position video properly
      const videoContainer = document.getElementById('webgazerVideoContainer')
      if (videoContainer) {
        setDefaultVideoPosition(RC, videoContainer)
      }

      // Hide diagonal tape component and labels
      tape.container.style.display = 'none'
      leftLabel.container.style.display = 'none'
      rightLabel.container.style.display = 'none'

      // // Hide radio buttons on page 3
      // radioContainer.style.display = 'none'

      // Hide PROCEED button on page 3 - only allow space key
      proceedButton.style.display = 'none'

      // Hide explanation button on page 3
      explanationButton.style.display = 'block' //show explanation button on page 3

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

      // Show video on page 4
      RC.showVideo(true)

      // Position video properly
      const videoContainer = document.getElementById('webgazerVideoContainer')
      if (videoContainer) {
        setDefaultVideoPosition(RC, videoContainer)
      }

      // Keep diagonal tape component and labels hidden
      tape.container.style.display = 'none'
      leftLabel.container.style.display = 'none'
      rightLabel.container.style.display = 'none'

      // // Hide radio buttons on page 4
      // radioContainer.style.display = 'none'

      // Hide PROCEED button on page 4 - only allow space key
      proceedButton.style.display = 'none'

      // Hide explanation button on page 4
      explanationButton.style.display = 'block' //show explanation button on page 4

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

      const objectLengthPx = tape.helpers.getDistance(
        startX,
        startY,
        endX,
        endY,
      )
      const objectLengthMm = objectLengthPx / pxPerMm
      const objectLengthCm = objectLengthMm / 10

      savedMeasurementData = {
        value: toFixedNumber(objectLengthCm, 1),
        timestamp: performance.now(),
        method: 'object',
        intraocularDistanceCm: null,
        faceMeshSamplesPage3: faceMeshSamplesPage3.map(sample =>
          isNaN(sample) ? sample : Math.round(sample),
        ),
        faceMeshSamplesPage4: faceMeshSamplesPage4.map(sample =>
          isNaN(sample) ? sample : Math.round(sample),
        ),
        // page0Option: selectedPage0Option, // Store the radio button answer
        raw: {
          startX,
          startY,
          endX,
          endY,
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
        measureIntraocularDistanceCm(
          RC,
          ppi,
          options.calibrateTrackDistancePupil,
        ).then(intraocularDistanceCm => {
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
    const objectLengthPx = tape.helpers.getDistance(startX, startY, endX, endY)

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
        startX, // Position of left tip in pixels
        startY,
        endX, // Position of right tip in pixels
        endY,
        screenWidth, // Total screen width in pixels
        objectLengthPx, // Object length in pixels
        objectLengthMm, // Object length in millimeters
        ppi: ppi, // Screen's pixels per inch
        webcamToEyesCm: firstMeasurement, // Original webcam-to-eyes measurement
      },

      // Add intraocular distance to the data object
      intraocularDistanceCm: intraocularDistanceCm,

      // Pass the samples in the savedMeasurementData and final data object
      faceMeshSamplesPage3: faceMeshSamplesPage3.map(sample =>
        isNaN(sample) ? sample : Math.round(sample),
      ),
      faceMeshSamplesPage4: faceMeshSamplesPage4.map(sample =>
        isNaN(sample) ? sample : Math.round(sample),
      ),
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
    const distance1FactorCmPx = RC.page3FactorCmPx
    const distance2FactorCmPx = RC.page4FactorCmPx

    // Calculate average of the two factors
    const averageFactorCmPx = Math.round(
      (distance1FactorCmPx + distance2FactorCmPx) / 2,
    )

    console.log('=== Object Test Calibration Factors ===')
    console.log('Object distance:', data.value, 'cm')
    console.log('Page 3 valid samples:', validPage3Samples.length, '/ 5')
    console.log('Page 4 valid samples:', validPage4Samples.length, '/ 5')
    console.log('Page 3 average Face Mesh:', page3Average, 'px')
    console.log('Page 4 average Face Mesh:', page4Average, 'px')
    console.log('Page 3 calibration factor:', distance1FactorCmPx)
    console.log('Page 4 calibration factor:', distance2FactorCmPx)
    //console.log('Average calibration factor:', averageFactorCmPx)
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
        <div>distance1InterpupillaryPx = ${faceMeshSamplesPage3.map(sample => (isNaN(sample) ? 'NaN' : Math.round(sample))).join(', ')}</div>
        <div>distance1FactorCmPx = ${distance1FactorCmPx}</div>
        <div>distance2InterpupillaryPx = ${faceMeshSamplesPage4.map(sample => (isNaN(sample) ? 'NaN' : Math.round(sample))).join(', ')}</div>
        <div>distance2FactorCmPx = ${distance2FactorCmPx}</div>
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

        // Show blindspot instruction screen before starting blindspot test
        RC._replaceBackground(
          constructInstructions(
            `${phrases.RC_distanceTrackingTitle[RC.L]}`,
            null,
            true,
            '',
          ),
        )

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
            faceMeshSamplesPage3: faceMeshSamplesPage3.map(sample =>
              isNaN(sample) ? sample : Math.round(sample),
            ),
            faceMeshSamplesPage4: faceMeshSamplesPage4.map(sample =>
              isNaN(sample) ? sample : Math.round(sample),
            ),

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
                      <div>distance1InterpupillaryPx = ${faceMeshSamplesPage3.map(sample => (isNaN(sample) ? 'NaN' : Math.round(sample))).join(', ')}</div>
                      <div>distance1FactorCmPx = ${distance1FactorCmPx}</div>
                      <div>distance2InterpupillaryPx = ${faceMeshSamplesPage4.map(sample => (isNaN(sample) ? 'NaN' : Math.round(sample))).join(', ')}</div>
                      <div>distance2FactorCmPx = ${distance2FactorCmPx}</div>
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
              options.calibrateTrackDistanceCenterYourEyesBool,
              options.calibrateTrackDistancePupil,
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
          options.calibrateTrackDistanceCenterYourEyesBool,
          options.calibrateTrackDistancePupil,
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

    // Clean up resize event listener (same as checkDistance.js)
    window.removeEventListener('resize', updateDiagonalTapeOnResize)

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

    // Clean up resize event listener (same as checkDistance.js)
    window.removeEventListener('resize', updateDiagonalTapeOnResize)

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
            // Record first measurement - calculate diagonal distance
            const diagonalDistancePx = tape.helpers.getDistance(
              startX,
              startY,
              endX,
              endY,
            )
            firstMeasurement = diagonalDistancePx / pxPerMm / 10
            console.log('First measurement:', firstMeasurement)

            // Store original measurement data before resetting lines
            const originalMeasurementData = {
              startX: startX,
              startY: startY,
              endX: endX,
              endY: endY,
              objectLengthPx: diagonalDistancePx,
              objectLengthMm: diagonalDistancePx / pxPerMm,
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
            await collectFaceMeshSamples(
              RC,
              faceMeshSamplesPage3,
              ppi,
              meshSamplesDuringPage3,
            )
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
                      <div style="color: #000; font-size: 1.6em;">
                        ${phrases.RC_LongerObjectHelps[RC.L]}
                      </div>
                      <button class="swal2-confirm swal2-styled" id="new-object-button-page3" style="background-color: #28a745; border: none; flex: 0 0 auto;">
                        ${phrases.RC_NewObjectButton[RC.L]}
                      </button>
                    </div>
                  </div>
                `,
                customClass: {
                  footer: 'swal2-footer-no-border',
                },
                didOpen: () => {
                  // Add CSS to remove footer border
                  if (
                    !document.getElementById('swal2-footer-no-border-style')
                  ) {
                    const style = document.createElement('style')
                    style.id = 'swal2-footer-no-border-style'
                    style.textContent =
                      '.swal2-footer-no-border { border-top: none !important; }'
                    document.head.appendChild(style)
                  }

                  // Add click handlers for custom buttons
                  document
                    .getElementById('ok-button-page3')
                    .addEventListener('click', () => {
                      Swal.close()
                    })
                  document
                    .getElementById('new-object-button-page3')
                    .addEventListener('click', () => {
                      // Use the same restart logic as tolerance failure (proven approach)
                      console.log(
                        'New object button clicked - restarting from page 2',
                      )

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
                },
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
            await collectFaceMeshSamples(
              RC,
              faceMeshSamplesPage4,
              ppi,
              meshSamplesDuringPage4,
            )
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
                      <div style="color: #000; font-size: 1.6em;">
                        ${phrases.RC_LongerObjectHelps[RC.L]}
                      </div>
                      <button class="swal2-confirm swal2-styled" id="new-object-button-page4" style="background-color: #28a745; border: none; flex: 0 0 auto;">
                        ${phrases.RC_NewObjectButton[RC.L]}
                      </button>
                    </div>
                  </div>
                `,
                customClass: {
                  footer: 'swal2-footer-no-border',
                },
                didOpen: () => {
                  // Add CSS to remove footer border
                  if (
                    !document.getElementById('swal2-footer-no-border-style')
                  ) {
                    const style = document.createElement('style')
                    style.id = 'swal2-footer-no-border-style'
                    style.textContent =
                      '.swal2-footer-no-border { border-top: none !important; }'
                    document.head.appendChild(style)
                  }

                  // Add click handlers for custom buttons
                  document
                    .getElementById('ok-button-page4')
                    .addEventListener('click', () => {
                      Swal.close()
                    })
                  document
                    .getElementById('new-object-button-page4')
                    .addEventListener('click', () => {
                      // Use the same restart logic as tolerance failure (proven approach)
                      console.log(
                        'New object button clicked - restarting from page 2',
                      )

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
                },
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
                const validPage3Samples = faceMeshSamplesPage3.filter(
                  sample => !isNaN(sample),
                )
                const validPage4Samples = faceMeshSamplesPage4.filter(
                  sample => !isNaN(sample),
                )
                const page3Average = validPage3Samples.length
                  ? validPage3Samples.reduce((a, b) => a + b, 0) /
                    validPage3Samples.length
                  : 0
                const page4Average = validPage4Samples.length
                  ? validPage4Samples.reduce((a, b) => a + b, 0) /
                    validPage4Samples.length
                  : 0
                // Calculate separate calibration factors for page3 and page4
                const page3FactorCmPx = page3Average * firstMeasurement
                RC.page3FactorCmPx = page3FactorCmPx
                const page4FactorCmPx = page4Average * firstMeasurement
                RC.page4FactorCmPx = page4FactorCmPx
                const averageFactorCmPx =
                  (page3FactorCmPx + page4FactorCmPx) / 2
                RC.averageObjectTestCalibrationFactor = Math.round(
                  Math.sqrt(page3FactorCmPx * page4FactorCmPx),
                )

                try {
                  if (
                    meshSamplesDuringPage3.length &&
                    meshSamplesDuringPage4.length
                  ) {
                    const measurements = []
                    if (meshSamplesDuringPage3.length) {
                      const { nearestPointsData, currentIPDDistance } =
                        await processMeshDataAndCalculateNearestPoints(
                          RC,
                          options,
                          meshSamplesDuringPage3,
                          page3FactorCmPx,
                          ppi,
                        )

                      measurements.push(
                        createMeasurementObject(
                          'firstMeasurement',
                          firstMeasurement,
                          page3FactorCmPx,
                          nearestPointsData,
                          currentIPDDistance,
                        ),
                      )
                    }
                    if (meshSamplesDuringPage4.length) {
                      const { nearestPointsData, currentIPDDistance } =
                        await processMeshDataAndCalculateNearestPoints(
                          RC,
                          options,
                          meshSamplesDuringPage4,
                          page4FactorCmPx,
                          ppi,
                        )

                      measurements.push(
                        createMeasurementObject(
                          'secondMeasurement',
                          firstMeasurement,
                          page4FactorCmPx,
                          nearestPointsData,
                          currentIPDDistance,
                        ),
                      )
                    }

                    saveCalibrationMeasurements(RC, 'object', measurements)
                  }
                } catch (error) {
                  console.error('Error getting mesh data:', error)
                }
                await objectTestFinishFunction()
              } else {
                const ipdpxRatio = Math.sqrt(
                  faceMeshSamplesPage3[0] / faceMeshSamplesPage4[0],
                )
                const newMin = min.toFixed(1) * ipdpxRatio
                const newMax = max.toFixed(1) / ipdpxRatio
                let displayMessage = phrases.RC_viewingObjectRejected[RC.L]
                  .replace('[[N11]]', Math.round(newMin))
                  .replace('[[N22]]', Math.round(newMax))
                const reasonIsOutOfRange = message.includes(
                  'out of allowed range',
                )
                if (reasonIsOutOfRange) {
                  displayMessage = phrases.RC_viewingExceededRange[RC.L]
                    .replace('[[N11]]', Math.round(newMin))
                    .replace('[[N22]]', Math.round(newMax))
                    .replace('[[N33]]', Math.round(RMin))
                    .replace('[[N44]]', Math.round(RMax))
                }
                // Tolerance check failed - show error and restart Face Mesh collection
                console.log(
                  '=== TOLERANCE CHECK FAILED - RESTARTING FACE MESH COLLECTION ===',
                )

                // Save failed object test calibration attempt
                const validPage3Samples = faceMeshSamplesPage3.filter(
                  sample => !isNaN(sample),
                )
                const validPage4Samples = faceMeshSamplesPage4.filter(
                  sample => !isNaN(sample),
                )
                const page3Average = validPage3Samples.length
                  ? validPage3Samples.reduce((a, b) => a + b, 0) /
                    validPage3Samples.length
                  : 0
                const page4Average = validPage4Samples.length
                  ? validPage4Samples.reduce((a, b) => a + b, 0) /
                    validPage4Samples.length
                  : 0
                // Calculate separate calibration factors for page3 and page4
                const page3FactorCmPx = page3Average * firstMeasurement
                RC.page3FactorCmPx = page3FactorCmPx
                const page4FactorCmPx = page4Average * firstMeasurement
                RC.page4FactorCmPx = page4FactorCmPx
                const averageFactorCmPx =
                  (page3FactorCmPx + page4FactorCmPx) / 2
                //RC.averageObjectTestCalibrationFactor = Math.round(averageFactorCmPx)

                try {
                  if (
                    meshSamplesDuringPage3.length &&
                    meshSamplesDuringPage4.length
                  ) {
                    const measurements = []
                    if (meshSamplesDuringPage3.length) {
                      const { nearestPointsData, currentIPDDistance } =
                        await processMeshDataAndCalculateNearestPoints(
                          RC,
                          options,
                          meshSamplesDuringPage3,
                          page3FactorCmPx,
                          ppi,
                        )

                      measurements.push(
                        createMeasurementObject(
                          'firstMeasurement',
                          firstMeasurement,
                          page3FactorCmPx,
                          nearestPointsData,
                          currentIPDDistance,
                        ),
                      )
                    }
                    if (meshSamplesDuringPage4.length) {
                      const { nearestPointsData, currentIPDDistance } =
                        await processMeshDataAndCalculateNearestPoints(
                          RC,
                          options,
                          meshSamplesDuringPage4,
                          page4FactorCmPx,
                          ppi,
                        )

                      measurements.push(
                        createMeasurementObject(
                          'secondMeasurement',
                          firstMeasurement,
                          page4FactorCmPx,
                          nearestPointsData,
                          currentIPDDistance,
                        ),
                      )
                    }

                    saveCalibrationMeasurements(RC, 'object', measurements)
                  }
                } catch (error) {
                  console.error('Error getting mesh data:', error)
                }

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
      // Record first measurement - calculate diagonal distance
      const diagonalDistancePx = tape.helpers.getDistance(
        startX,
        startY,
        endX,
        endY,
      )
      firstMeasurement = diagonalDistancePx / pxPerMm / 10
      console.log('First measurement:', firstMeasurement)

      // Store original measurement data before resetting lines
      const originalMeasurementData = {
        startX: startX,
        startY: startY,
        endX: endX,
        endY: endY,
        objectLengthPx: diagonalDistancePx,
        objectLengthMm: diagonalDistancePx / pxPerMm,
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
      await collectFaceMeshSamples(
        RC,
        faceMeshSamplesPage3,
        ppi,
        meshSamplesDuringPage3,
      )
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
      await collectFaceMeshSamples(
        RC,
        faceMeshSamplesPage4,
        ppi,
        meshSamplesDuringPage4,
      )
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
        const validPage3Samples = faceMeshSamplesPage3.filter(
          sample => !isNaN(sample),
        )
        const validPage4Samples = faceMeshSamplesPage4.filter(
          sample => !isNaN(sample),
        )
        const page3Average = validPage3Samples.length
          ? validPage3Samples.reduce((a, b) => a + b, 0) /
            validPage3Samples.length
          : 0
        const page4Average = validPage4Samples.length
          ? validPage4Samples.reduce((a, b) => a + b, 0) /
            validPage4Samples.length
          : 0
        // Calculate separate calibration factors for page3 and page4
        const page3FactorCmPx = RC.page3FactorCmPx
        const page4FactorCmPx = page4Average * firstMeasurement
        const averageFactorCmPx = (page3FactorCmPx + page4FactorCmPx) / 2
        //RC.averageObjectTestCalibrationFactor = Math.round(averageFactorCmPx)

        try {
          if (meshSamplesDuringPage3.length && meshSamplesDuringPage4.length) {
            const measurements = []
            if (meshSamplesDuringPage3.length) {
              const { nearestPointsData, currentIPDDistance } =
                await processMeshDataAndCalculateNearestPoints(
                  RC,
                  options,
                  meshSamplesDuringPage3,
                  page3FactorCmPx,
                  ppi,
                )

              measurements.push(
                createMeasurementObject(
                  'firstMeasurement',
                  firstMeasurement,
                  page3FactorCmPx,
                  nearestPointsData,
                  currentIPDDistance,
                ),
              )
            }
            if (meshSamplesDuringPage4.length) {
              const { nearestPointsData, currentIPDDistance } =
                await processMeshDataAndCalculateNearestPoints(
                  RC,
                  options,
                  meshSamplesDuringPage4,
                  page4FactorCmPx,
                  ppi,
                )

              measurements.push(
                createMeasurementObject(
                  'secondMeasurement',
                  firstMeasurement,
                  page4FactorCmPx,
                  nearestPointsData,
                  currentIPDDistance,
                ),
              )
            }

            saveCalibrationMeasurements(RC, 'object', measurements)
          }
        } catch (error) {
          console.error('Error getting mesh data:', error)
        }

        await objectTestFinishFunction()
      } else {
        const ipdpxRatio = Math.sqrt(
          faceMeshSamplesPage3[0] / faceMeshSamplesPage4[0],
        )
        const newMin = min.toFixed(1) * ipdpxRatio
        const newMax = max.toFixed(1) / ipdpxRatio
        let displayMessage = phrases.RC_viewingObjectRejected[RC.L]
          .replace('[[N11]]', Math.round(newMin))
          .replace('[[N22]]', Math.round(newMax))
        const reasonIsOutOfRange = message.includes('out of allowed range')
        if (reasonIsOutOfRange) {
          displayMessage = phrases.RC_viewingExceededRange[RC.L]
            .replace('[[N11]]', Math.round(newMin))
            .replace('[[N22]]', Math.round(newMax))
            .replace('[[N33]]', Math.round(RMin))
            .replace('[[N44]]', Math.round(RMax))
        }
        console.log(
          '=== TOLERANCE CHECK FAILED - RESTARTING FACE MESH COLLECTION ===',
        )

        // Save failed object test calibration attempt (Proceed button case)
        const validPage3Samples = faceMeshSamplesPage3.filter(
          sample => !isNaN(sample),
        )
        const validPage4Samples = faceMeshSamplesPage4.filter(
          sample => !isNaN(sample),
        )
        const page3Average = validPage3Samples.length
          ? validPage3Samples.reduce((a, b) => a + b, 0) /
            validPage3Samples.length
          : 0
        const page4Average = validPage4Samples.length
          ? validPage4Samples.reduce((a, b) => a + b, 0) /
            validPage4Samples.length
          : 0
        // Calculate separate calibration factors for page3 and page4
        const page3FactorCmPx = RC.page3FactorCmPx
        const page4FactorCmPx = RC.page4FactorCmPx
        const averageFactorCmPx = (page3FactorCmPx + page4FactorCmPx) / 2
        //RC.averageObjectTestCalibrationFactor = Math.round(averageFactorCmPx)
        try {
          const mesh = await getMeshData(
            RC,
            options.calibrateTrackDistancePupil,
            meshSamples,
          )
          if (mesh) {
            const { leftEye, rightEye, video, currentIPDDistance } = mesh
            // Calculate nearest points data for both page measurements
            const webcamToEyeDistance_avg =
              averageFactorCmPx / currentIPDDistance
            const pxPerCm = ppi / 2.54
            const nearestPointsData = calculateNearestPoints(
              video,
              leftEye,
              rightEye,
              currentIPDDistance,
              webcamToEyeDistance_avg,
              pxPerCm,
              ppi,
              RC,
            )
            const {
              nearestXYPx_left,
              nearestXYPx_right,
              clampedNearestLeft,
              clampedNearestRight,
              nearestDistanceCm_left,
              nearestDistanceCm_right,
              nearestEyeToWebcamDistanceCM,
              nearestEye,
              nearestXYPx,
              nearestDistanceCm,
              distanceCm_left,
              distanceCm_right,
              distanceCm,
            } = nearestPointsData
            // Save object measurements separately (page3 and page4)
            const measurements = [
              {
                type: 'firstMeasurement',
                distance: firstMeasurement,
                calibrationFactor: page3FactorCmPx,
                nearestDistanceCm: nearestDistanceCm,
                distanceCm_left: distanceCm_left,
                distanceCm_right: distanceCm_right,
                distanceCm: distanceCm,
                nearestDistanceCm_right: nearestDistanceCm_right,
                nearestDistanceCm_left: nearestDistanceCm_left,
              },
              {
                type: 'secondMeasurement',
                distance: firstMeasurement,
                calibrationFactor: page4FactorCmPx,
                nearestDistanceCm: nearestDistanceCm,
                distanceCm_left: distanceCm_left,
                distanceCm_right: distanceCm_right,
                distanceCm: distanceCm,
                nearestDistanceCm_right: nearestDistanceCm_right,
                nearestDistanceCm_left: nearestDistanceCm_left,
              },
            ]

            const sharedData = {
              currentIPDDistance,
              nearestEyeToWebcamDistanceCM,
              nearestEye,
              nearestXYPx,
              nearestXYPx_left,
              nearestXYPx_right,
            }

            saveCalibrationMeasurements(RC, 'object', measurements, sharedData)
          }
        } catch (error) {
          console.error('Error getting mesh data:', error)
        }

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
    await showTestPopup(RC, null, options)
  }

  // ===================== INITIALIZE PAGE 0 =====================
  //hide webgazerFaceFeedbackBox if calibrateTrackDistanceCenterYourEyesBool is false
  const webgazerFaceFeedbackBox = document.getElementById(
    'webgazerFaceFeedbackBox',
  )
  if (
    !options.calibrateTrackDistanceCenterYourEyesBool &&
    webgazerFaceFeedbackBox
  )
    webgazerFaceFeedbackBox.style.display = 'none'
  if (options.calibrateTrackDistanceCenterYourEyesBool) showPage(0)
  else showPage(2)
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
async function measureIntraocularDistanceCm(
  RC,
  ppi,
  calibrateTrackDistancePupil = 'iris',
) {
  // Get the video element (use canvas only)
  let video = document.getElementById('webgazerVideoCanvas')
  if (!video) return null
  // Ensure model is loaded
  const model = await RC.gazeTracker.webgazer.getTracker().model
  const faces = await model.estimateFaces(video)
  if (!faces.length) return null
  // Use keypoints 133 (right eye outer) and 362 (left eye outer)
  const mesh = faces[0].keypoints || faces[0].scaledMesh
  // Use eyeDist from distanceTrack.js logic
  const eyeDist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
  const { leftEye, rightEye } = getLeftAndRightEyePointsFromMeshData(
    mesh,
    calibrateTrackDistancePupil,
  )
  if (!leftEye || !rightEye) return null

  const pxDist = eyeDist(leftEye, rightEye)
  console.log('Eye distance measureIntraocularDistanceCm..', pxDist)
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
        MinCm: ${Math.round(minM)};
        MaxCm: ${Math.round(maxM)};
        distance1Cm: ${Math.round(distance1Cm)};
        distance2Cm: ${Math.round(distance2Cm)};
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
      distance1Cm: ${Math.round(distance1Cm)};
      distance2Cm: ${Math.round(distance2Cm)};
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
  const F1 = leftAvgFM * leftMean
  const F2 = rightAvgFM * rightMean
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
      MinCm: ${Math.round(Math.min(leftMean, rightMean))};
      MaxCm: ${Math.round(Math.max(leftMean, rightMean))};
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
      distance1Cm: ${Math.round(leftMean)};
      distance2Cm: ${Math.round(rightMean)};
      distance1FactorCmPx: ${F1.toFixed(1)};
      distance2FactorCmPx: ${F2.toFixed(1)};
      `,
    Math.min(leftMean, rightMean),
    Math.max(leftMean, rightMean),
    RMin,
    RMax,
  ]
}

export const getLeftAndRightEyePointsFromMeshData = (
  mesh,
  calibrateTrackDistancePupil = 'iris',
) => {
  if (calibrateTrackDistancePupil === 'iris') {
    if (mesh[468] && mesh[473]) {
      return {
        leftEye: { x: mesh[468].x, y: mesh[468].y, z: mesh[468].z },
        rightEye: { x: mesh[473].x, y: mesh[473].y, z: mesh[473].z },
      }
    }
    return {
      leftEye: null,
      rightEye: null,
    }
  }

  //return the average of the eye corners
  // points 33 and 133 (right eye) and points 362 and 263 (left eye).
  if (mesh[362] && mesh[263] && mesh[33] && mesh[133]) {
    return {
      leftEye: {
        x: (mesh[362].x + mesh[263].x) / 2,
        y: (mesh[362].y + mesh[263].y) / 2,
        z: (mesh[362].z + mesh[263].z) / 2,
      },
      rightEye: {
        x: (mesh[33].x + mesh[133].x) / 2,
        y: (mesh[33].y + mesh[133].y) / 2,
        z: (mesh[33].z + mesh[133].z) / 2,
      },
    }
  }
  return {
    leftEye: null,
    rightEye: null,
  }
}

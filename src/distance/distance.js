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
import { irisTrackingIsActive } from './distanceTrack'
import {
  _getCrossX,
  _cross,
  circleDeltaX,
  _getCircleBounds,
  _circle,
  _diamond,
  _redGreenSquares,
  bindMousedown,
  unbindMousedown,
  clickOnCircle,
  clickOnDiamond,
  clickOnRedGreenSquares,
} from '../components/onCanvas'
import { bindKeys, unbindKeys } from '../components/keyBinder'
import { addButtons } from '../components/buttons'
import { phrases } from '../i18n/schema'
import { swalInfoOptions } from '../components/swalOptions'
import { setUpEasyEyesKeypadHandler } from '../extensions/keypadHandler'
import { showTestPopup } from '../components/popup'
import { ppiToPxPerCm } from '../components/converters'
import {
  calculateFootXYPx,
  calculateNearestPoints,
  getMeshData,
} from './distanceTrack'

// import { soundFeedback } from '../components/sound'
let soundFeedback
let cameraShutterSound
let stampOfApprovalSound
if (env !== 'mocha') {
  const soundModule = require('../components/sound')
  soundFeedback = soundModule.soundFeedback
  cameraShutterSound = soundModule.cameraShutterSound
  stampOfApprovalSound = soundModule.stampOfApprovalSound
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
        <div style="display: flex; flex-direction: column; justify-content: space-between; height: 105px; font-size: 10px; color: #888; line-height: 0.2; margin-left: 10px;">
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
      // NEW FIELDS for edge-based blindspot test
      measurement.spotXYPx,
      measurement.fixationXYPx,
      measurement.spotToFixationCm,
      measurement.eyesToFixationCm,
      measurement.eyesToSpotCm,
      measurement.calibrateTrackDistanceSpotXYDeg,
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
  // NEW FIELDS for edge-based blindspot test
  spotXYPx = undefined,
  fixationXYPx = undefined,
  spotToFixationCm = undefined,
  eyesToFixationCm = undefined,
  eyesToSpotCm = undefined,
  calibrateTrackDistanceSpotXYDeg = undefined,
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
    // NEW FIELDS for edge-based blindspot test
    _calibrateTrackDistanceSpotXYDeg: calibrateTrackDistanceSpotXYDeg
      ? [
          safeToFixed(calibrateTrackDistanceSpotXYDeg[0]),
          safeToFixed(calibrateTrackDistanceSpotXYDeg[1]),
        ]
      : undefined,
    spotXYPx: safeRoundXYPx(spotXYPx), // Middle of red-green edge
    fixationXYPx: safeRoundXYPx(fixationXYPx), // Position of fixation cross
    spotToFixationCm: safeRoundCm(spotToFixationCm), // Distance between spot and fixation
    eyesToFixationCm: safeRoundCm(eyesToFixationCm), // Distance from participant to fixation
    eyesToSpotCm: safeRoundCm(eyesToSpotCm), // Distance from participant to spot
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
  _leftMean = null, // retained for API stability (unused)
  _rightMean = null, // retained for API stability (unused)
  method = 'blindspot',
  order = 1,
  fixPoint = [window.innerWidth / 2, window.innerHeight / 2],
  spotPoint = [window.innerWidth / 2, window.innerHeight / 2],
  blindspotDeg = 0,
  fixationToSpotCm = 0,
  ipdCameraPx = 0,
  calibrateTrackDistanceChecking = 'camera',
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
    options,
    _leftMean,
    _rightMean,
    method,
    order,
    fixPoint,
    spotPoint,
    blindspotDeg,
    fixationToSpotCm,
    ipdCameraPx === 0 ? currentIPDDistance : ipdCameraPx,
    false,
    calibrateTrackDistanceChecking,
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

// Helper to calculate the shared border position (spotXYPx) between red and green squares
function calculateSpotXYPx(circleX, circleY, greenSide, fixationX, squareSize) {
  // circleX now represents the red-green edge (shared border) directly
  // No calculation needed - just return the position
  return [circleX, circleY]
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

/**
Solve for eye-to-screen distance (cm).
Inputs:
eyeFoot    : {x, y}  // projection of eye onto screen (pixels)
fixPoint   : {x, y}  // fixation point on screen (pixels)
spotPoint  : {x, y}  // spot centered on blindspot (pixels)
blindspotDeg : number // included angle at the eye, in degrees (e.g.  sqrt(15.5^2 + 1.5^2) )
pxPerCm    : number // pixels per centimeter for this screen (>= 0)
Returns:
{ d_cm, d_px } where d_px is distance in pixels and d_cm is in cm,
or throws an Error if no valid solution.
*/
export const solveEyeToScreenCm = (
  eyeFoot,
  fixPoint,
  spotPoint,
  blindspotDeg,
  pxPerCm,
) => {
  // values to report in the error message.
  //Round to integer for: EyeFoot, FixPoint, SpotPoint
  // 1 decimal place for: BlindspotDeg, PxPerCm
  const valuesToReport = {
    eyeFoot: [Math.round(eyeFoot[0]), Math.round(eyeFoot[1])],
    fixPoint: [Math.round(fixPoint[0]), Math.round(fixPoint[1])],
    spotPoint: [Math.round(spotPoint[0]), Math.round(spotPoint[1])],
    blindspotDeg: blindspotDeg.toFixed(1),
    pxPerCm: pxPerCm.toFixed(1),
  }
  // vector u = fix - eyeFoot
  const ux = fixPoint[0] - eyeFoot[0]
  const uy = fixPoint[1] - eyeFoot[1]
  // vector v = spot - eyeFoot
  const vx = spotPoint[0] - eyeFoot[0]
  const vy = spotPoint[1] - eyeFoot[1]
  const a = ux * ux + uy * uy // |u|^2
  const b = vx * vx + vy * vy // |v|^2
  const c = ux * vx + uy * vy // u·v
  // angle in radians
  const theta = (Math.PI / 180) * blindspotDeg
  const cos2 = Math.cos(theta) * Math.cos(theta)
  const sin2 = Math.sin(theta) * Math.sin(theta)
  // coefficients for quadratic in x = d^2:
  // alpha * x^2 + beta * x + gamma = 0
  const alpha = sin2
  const beta = 2 * c - cos2 * (a + b)
  const gamma = c * c - cos2 * a * b
  // handle degenerate angle (theta == 0 or pi)
  if (alpha === 0) {
    throw new Error(
      'Degenerate angle (sin^2 theta == 0). Cannot solve uniquely\nEyeFoot: ' +
        JSON.stringify(valuesToReport.eyeFoot) +
        ', FixPoint: ' +
        JSON.stringify(valuesToReport.fixPoint) +
        ', SpotPoint: ' +
        JSON.stringify(valuesToReport.spotPoint) +
        ', BlindspotDeg: ' +
        valuesToReport.blindspotDeg +
        ', PxPerCm: ' +
        valuesToReport.pxPerCm,
    )
  }
  const disc = beta * beta - 4 * alpha * gamma
  if (disc < 0) {
    throw new Error(
      'No real solution (negative discriminant). Check inputs\nEyeFoot: ' +
        JSON.stringify(valuesToReport.eyeFoot) +
        ', FixPoint: ' +
        JSON.stringify(valuesToReport.fixPoint) +
        ', SpotPoint: ' +
        JSON.stringify(valuesToReport.spotPoint) +
        ', BlindspotDeg: ' +
        valuesToReport.blindspotDeg +
        ', PxPerCm: ' +
        valuesToReport.pxPerCm,
    )
  }
  // two roots for x = d^2
  const sqrtDisc = Math.sqrt(disc)
  const x1 = (-beta + sqrtDisc) / (2 * alpha)
  const x2 = (-beta - sqrtDisc) / (2 * alpha)
  // We need x > 0 (d^2 positive)
  const candidates = [x1, x2].filter(x => isFinite(x) && x > 0)
  if (candidates.length === 0) {
    throw new Error(
      'No positive solution for d^2. Check geometry/inputs\nEyeFoot: ' +
        JSON.stringify(valuesToReport.eyeFoot) +
        ', FixPoint: ' +
        JSON.stringify(valuesToReport.fixPoint) +
        ', SpotPoint: ' +
        JSON.stringify(valuesToReport.spotPoint) +
        ', BlindspotDeg: ' +
        valuesToReport.blindspotDeg +
        ', PxPerCm: ' +
        valuesToReport.pxPerCm,
    )
  }
  // choose the physically reasonable root.
  // Usually the larger positive root corresponds to farther eye; pick the max.
  const x = Math.max(...candidates)
  const d_px = Math.sqrt(x)
  if (!pxPerCm || pxPerCm <= 0) {
    // return px if no conversion provided
    return { d_px, d_cm: null }
  }
  const d_cm = d_px / pxPerCm
  return { d_px, d_cm }
}

// New iterative blindspot mapping (7 pages) replacing the old scheme
export async function blindSpotTestNew(
  RC,
  options,
  toTrackDistance = false,
  callback = undefined,
) {
  // Prep and setup
  const control = options.control
  let ppi = RC._CONST.N.PPI_DONT_USE
  if (RC.screenPpi) ppi = RC.screenPpi.value
  else
    console.error(
      'Screen size measurement is required to get accurate viewing distance measurement.',
    )

  // Hide webgazerFaceFeedbackBox (small grey/red square on video)
  const webgazerFaceFeedbackBox = document.getElementById(
    'webgazerFaceFeedbackBox',
  )
  if (webgazerFaceFeedbackBox) {
    webgazerFaceFeedbackBox.style.display = 'none'
  }

  // Camera selection if needed
  if (!options.cameraSelectionDone) {
    await showTestPopup(RC, null, options)
    options.cameraSelectionDone = true
  }

  // Slider should be removed in the new flow
  // Note: remove both container and input if present later after HTML is added too
  const preSliderContainer = document.getElementById(
    'blindspot-slider-container',
  )
  if (preSliderContainer && preSliderContainer.parentNode)
    preSliderContainer.parentNode.removeChild(preSliderContainer)

  // Blindspot size range
  let minMaxDeg = options.calibrateTrackDistanceSpotMinMaxDeg
  if (typeof minMaxDeg === 'string')
    minMaxDeg = minMaxDeg.split(',').map(Number)
  if (!Array.isArray(minMaxDeg) || minMaxDeg.length < 2) minMaxDeg = [2.0, 8.0]
  const minDeg = Math.max(0.1, parseFloat(minMaxDeg[0]))
  const maxDeg = Math.max(minDeg + 0.1, parseFloat(minMaxDeg[1]))

  // Build overlay
  const blindSpotDiv = document.createElement('div')
  blindSpotDiv.innerHTML = blindSpotHTML
  document.body.appendChild(blindSpotDiv)

  // Determine which instruction to show based on calibrateTrackDistanceChecking option
  const checkingOptions = options.calibrateTrackDistanceChecking
  const shouldShowTiltAndSwivel =
    checkingOptions &&
    typeof checkingOptions === 'string' &&
    checkingOptions
      .toLowerCase()
      .split(',')
      .map(s => s.trim())
      .includes('tiltandswivel')

  const instructionText = shouldShowTiltAndSwivel
    ? phrases.RC_distanceTrackingBlindspotGetReadyTiltAndSwivel?.[RC.L] ||
      'Get ready. When you press SPACE, we will measure your viewing distance.'
    : phrases.RC_distanceTrackingBlindspotGetReady?.[RC.L] ||
      'Get ready. When you press SPACE, we will measure your viewing distance.'

  RC._constructFloatInstructionElement(
    'blind-spot-instruction',
    instructionText,
  )
  // Position instruction like old flow
  RC._setFloatInstructionElementPos('left', 16)
  // Add blindspot-specific styling to remove white background
  const blindspotInstruction = document.getElementById('blind-spot-instruction')
  if (blindspotInstruction) {
    blindspotInstruction.classList.add('blindspot-instruction')
  }
  RC._addCreditOnBackground(phrases.RC_viewingBlindSpotCredit[RC.L])

  // Hide slider on prep page (will show when measurement pages start)
  const sliderContainer = document.getElementById('blindspot-slider-container')
  if (sliderContainer) sliderContainer.style.display = 'none'
  const wrapper = document.querySelector('#blindspot-wrapper')
  const c = document.querySelector('#blind-spot-canvas')
  const ctx = c.getContext('2d')
  // Remove cursor-grab to prevent canvas from intercepting clicks; ensure pointer events off
  if (c) {
    c.classList.remove('cursor-grab')
    c.style.pointerEvents = 'none'
  }
  if (wrapper) wrapper.style.zIndex = '99999999998'
  if (c) {
    c.style.zIndex = '99999999999'
    c.style.position = 'absolute'
  }
  // Update slider range labels to reflect [minDeg, maxDeg]
  const labelSpans = document.querySelectorAll(
    '#blindspot-slider-container span',
  )
  const formatDeg = v =>
    Math.abs(v - Math.round(v)) < 1e-6 ? String(Math.round(v)) : v.toFixed(1)
  if (labelSpans && labelSpans.length >= 3) {
    const midDeg = Math.pow(
      10,
      Math.log10(minDeg) + 0.5 * Math.log10(maxDeg / minDeg),
    )
    const midDegRounded = Math.round(midDeg)
    // Order in DOM is top->bottom
    labelSpans[0].textContent = `${formatDeg(maxDeg)} deg`
    labelSpans[1].textContent = `${midDegRounded} deg`
    labelSpans[2].textContent = `${formatDeg(minDeg)} deg`
  }

  // Geometry and movement
  let eyeSide = 'right' // start with right
  let centerX = 0
  let crossX = 0
  let crossY = 60
  let circleX = 0
  let circleFill = RC._CONST.COLOR.DARK_RED
  let v = -1 // direction for auto movement (unused in new scheme)
  const pxPerCm = ppi / 2.54

  // Calculate maximum eccentricity possible with minimum spotDeg
  // COMMENTED OUT: No longer enforcing max eccentricity constraint
  // const calculateMaxEccentricity = () => {
  //   const vCont = document.getElementById('webgazerVideoContainer')
  //   const videoWidth = vCont
  //     ? parseInt(vCont.style.width) || vCont.offsetWidth || 0
  //     : 0

  //   // Use minimum spotDeg from calibrateTrackDistanceSpotMinMaxDeg for max eccentricity calculation
  //   const spotDegForMaxEcc = minDeg
  //   const tempCircleX = circleX || c.width / 2
  //   const tempCrossX = crossX || c.width / 2
  //   const rPxAtMin = calculateSpotRadiusPx(
  //     spotDegForMaxEcc,
  //     ppi,
  //     blindspotEccXDeg,
  //     tempCircleX,
  //     tempCrossX,
  //   )
  //   const diamondWidthAtMin = rPxAtMin * 2

  //   // Max eccentricity = screen width - video width - diamond width (at min size)
  //   const maxEcc = c.width - videoWidth - diamondWidthAtMin
  //   return Math.max(0, maxEcc)
  // }

  // Center the stimulus at screen midline
  // Note: circleX now represents the red-green edge (midline between squares)
  const centerStimulus = squareSize => {
    const vCont = document.getElementById('webgazerVideoContainer')
    const videoWidth = vCont
      ? parseInt(vCont.style.width) || vCont.offsetWidth || 0
      : 0
    const videoHalfWidth = videoWidth / 2

    // Calculate outer edges of the entire stimulus (video edge to far square edge)
    // circleX is the edge between red and green squares
    // Squares extend squareSize in both directions from the edge
    let outerVideoX, outerSquaresX

    if (circleX < crossX) {
      // Squares are LEFT of fixation (red-green edge on left side)
      outerVideoX = crossX + videoHalfWidth // Right edge of video
      // The leftmost square extends squareSize to the left of the edge
      outerSquaresX = circleX - squareSize // Left edge of leftmost square
    } else {
      // Squares are RIGHT of fixation (red-green edge on right side)
      outerVideoX = crossX - videoHalfWidth // Left edge of video
      // The rightmost square extends squareSize to the right of the edge
      outerSquaresX = circleX + squareSize // Right edge of rightmost square
    }

    // Calculate middle of entire stimulus (from video edge to far square edge)
    const middlePx = (outerVideoX + outerSquaresX) / 2

    // Calculate offset to center at screen midline
    const screenMidline = c.width / 2
    const offsetXPx = screenMidline - middlePx

    // Apply offset to both fixation and edge position (preserves eccentricity)
    crossX += offsetXPx
    circleX += offsetXPx
  }

  // Help message element
  let helpMessageElement = null
  const createHelpMessage = () => {
    if (helpMessageElement) return helpMessageElement

    helpMessageElement = document.createElement('div')
    helpMessageElement.id = 'blindspot-help-message'
    helpMessageElement.style.position = 'fixed'
    helpMessageElement.style.left = '50%'
    helpMessageElement.style.bottom = '20%'
    helpMessageElement.style.transform = 'translateX(-50%)'
    helpMessageElement.style.color = '#ff6b6b'
    helpMessageElement.style.fontSize = '18px'
    helpMessageElement.style.fontWeight = 'bold'
    helpMessageElement.style.textAlign = 'center'
    helpMessageElement.style.zIndex = '999999998'
    helpMessageElement.style.pointerEvents = 'none'
    helpMessageElement.style.display = 'none'
    helpMessageElement.textContent =
      phrases.RC_MovingCloserWillHelp?.[RC.L] || 'RC_MovingCloserWillHelp'
    document.body.appendChild(helpMessageElement)
    return helpMessageElement
  }

  const showHelpMessage = show => {
    const msg = createHelpMessage()
    msg.style.display = show ? 'block' : 'none'
  }

  // Check if we should show help message (per spec: when eccentricity OR spotDeg is limited)
  const checkAndShowHelpMessage = () => {
    const currentEccentricity = Math.abs(circleX - crossX)
    // const maxEccentricity = calculateMaxEccentricity()
    // const atMaxEccentricity = currentEccentricity >= maxEccentricity
    const atMaxSpotDeg = spotDeg >= maxDeg

    // Check if video is at screen bounds (use threshold since centering might offset slightly)
    const edgeThreshold = 5 // pixels
    const vCont = document.getElementById('webgazerVideoContainer')
    const videoWidth = vCont
      ? parseInt(vCont.style.width) || vCont.offsetWidth || 0
      : 0
    const videoHalfWidth = videoWidth / 2
    const videoLeftEdge = crossX - videoHalfWidth
    const videoRightEdge = crossX + videoHalfWidth
    const videoAtEdge =
      videoLeftEdge <= edgeThreshold ||
      videoRightEdge >= c.width - edgeThreshold

    // Check if red-green squares are at screen bounds (use threshold since centering might offset slightly)
    const rPx = calculateSpotRadiusPx(
      spotDeg,
      ppi,
      blindspotEccXDeg,
      circleX,
      crossX,
    )
    const squareSize = rPx * 2
    const spotYForCheck = calculateSpotY(
      circleX,
      crossX,
      crossY,
      ppi,
      blindspotEccXDeg,
      blindspotEccYDeg,
    )
    const boundsCheck = getRedGreenCombinedBounds(
      circleX,
      spotYForCheck,
      squareSize,
      currentEdge,
      crossX,
    )
    const squaresAtEdge =
      boundsCheck.left <= edgeThreshold ||
      boundsCheck.right >= c.width - edgeThreshold

    const shouldShow =
      /* atMaxEccentricity || */ atMaxSpotDeg || videoAtEdge || squaresAtEdge

    // // DEBUG: Always log to see what's happening with actual values
    // console.log('MESSAGE CHECK:', {
    //   shouldShow,
    //   // atMaxEccentricity,
    //   atMaxSpotDeg,
    //   videoAtEdge,
    //   squaresAtEdge,
    //   videoLeft: videoLeftEdge.toFixed(1),
    //   videoRight: videoRightEdge.toFixed(1),
    //   combinedLeft: boundsCheck.left.toFixed(1),
    //   combinedRight: boundsCheck.right.toFixed(1),
    //   redLeft: boundsCheck.redLeft.toFixed(1),
    //   greenLeft: boundsCheck.greenLeft.toFixed(1),
    //   screenWidth: c.width,
    // })

    // Per spec: "display RC_MovingCloserWillHelp solely while either spotDeg or spotXYPx is limited by screen size"
    // Show message if ANY limit is hit:
    // - Eccentricity is at max (limited by screen size with spotDeg=2), OR
    // - SpotDeg is at max, OR
    // - Video at screen edge (can't shift further), OR
    // - Diamond at screen edge (can't grow or move further)
    showHelpMessage(shouldShow)
  }

  // Visibility and input flags
  let showDiamond = false
  let allowMove = false
  let currentEdge = 'near' // Track which edge we're testing: 'near' or 'far'

  const vCont = document.getElementById('webgazerVideoContainer')
  if (vCont) {
    const videoHeight = parseInt(vCont.style.height) || vCont.offsetHeight || 0
    crossY = Math.max(0, Math.round(videoHeight / 2))
  }

  const _computeCanvas = () => {
    const width = Math.round(window.innerWidth)
    if (wrapper) {
      wrapper.style.width = `${width}px`
      wrapper.style.pointerEvents = 'none'
    }
    c.width = width
    // Match canvas internal height to CSS height (90vh) to avoid scaling distortion
    c.height = Math.round(window.innerHeight * 0.9)
    c.style.width = `${c.width}px`
    c.style.height = `${c.height}px`

    const oldCenterX = centerX
    centerX = c.width / 2

    // IMPORTANT: On resize, constrain circleX to prevent squares from going off screen
    // or ending up on wrong side of centerX
    if (allowMove && typeof circleX === 'number') {
      // Determine which side the square should be on
      const shouldBeOnRight = circleX > oldCenterX

      // Calculate current square size to determine bounds
      const tempCrossX = 2 * centerX - circleX
      const tempRPx = calculateSpotRadiusPx(
        spotDeg,
        ppi,
        blindspotEccXDeg,
        circleX,
        tempCrossX,
      )
      const tempSquareSize = tempRPx * 2

      // Calculate safe bounds for this side
      const minEdgeMargin = 2 // 2px from edge minimum
      const greenOffset =
        currentEdge === 'far'
          ? shouldBeOnRight
            ? tempSquareSize
            : -tempSquareSize // Green away from fixation
          : shouldBeOnRight
            ? -tempSquareSize
            : tempSquareSize // Green toward fixation

      // Determine bounds based on which side
      let minCircleX, maxCircleX
      if (shouldBeOnRight) {
        // Square should be on right side (circleX > centerX)
        minCircleX = centerX + 10 // At least 10px from center
        // Max: green square right edge must be 2px from screen edge
        const maxGreenRight = c.width - minEdgeMargin
        maxCircleX =
          greenOffset > 0
            ? maxGreenRight - tempSquareSize // Green is to the right
            : maxGreenRight // Green is to the left
      } else {
        // Square should be on left side (circleX < centerX)
        maxCircleX = centerX - 10 // At least 10px from center
        // Min: green square left edge must be 2px from screen edge
        const minGreenLeft = minEdgeMargin
        minCircleX =
          greenOffset < 0
            ? minGreenLeft + tempSquareSize // Green is to the left
            : minGreenLeft // Green is to the right
      }

      // Constrain circleX to valid bounds
      circleX = Math.max(minCircleX, Math.min(maxCircleX, circleX))

      // Recalculate crossX with constrained circleX
      crossX = 2 * centerX - circleX
    } else if (allowMove) {
      crossX = typeof circleX === 'number' ? 2 * centerX - circleX : centerX
    } else {
      crossX = crossX || centerX
    }

    if (vCont) {
      const videoHeight =
        parseInt(vCont.style.height) || vCont.offsetHeight || 0
      crossY = Math.max(0, Math.round(videoHeight / 2))
    } else {
      crossY = 60
    }
  }
  _computeCanvas()
  const resizeObserver = new ResizeObserver(_computeCanvas)
  resizeObserver.observe(RC.background)

  // Video positioning under the fixation cross, top-aligned
  let _lastVideoLeftPx = null
  const _positionVideoBelowFixation = () => {
    if (!vCont || !wrapper) return
    if (!RC._blindspotOriginalVideoStyle) {
      RC._blindspotOriginalVideoStyle = {
        left: vCont.style.left,
        right: vCont.style.right,
        top: vCont.style.top,
        bottom: vCont.style.bottom,
        transform: vCont.style.transform,
        transition: vCont.style.transition,
      }
    }
    const rect = wrapper.getBoundingClientRect()
    const videoWidth = parseInt(vCont.style.width) || vCont.offsetWidth || 0
    const videoHeight = parseInt(vCont.style.height) || vCont.offsetHeight || 0
    const fixationXViewport = rect.left + crossX
    const leftPx = Math.max(0, Math.round(fixationXViewport - videoWidth / 2))
    const topPx = 0
    vCont.style.transition = 'none'
    vCont.style.willChange = 'left, top'
    vCont.style.zIndex = '999999997'
    vCont.style.pointerEvents = 'none'
    if (_lastVideoLeftPx !== leftPx) {
      vCont.style.left = `${leftPx}px`
      vCont.style.right = 'unset'
      vCont.style.top = `${topPx}px`
      vCont.style.bottom = 'unset'
      vCont.style.transform = 'none'
      _lastVideoLeftPx = leftPx
    }

    crossY = Math.max(0, Math.round(videoHeight / 2))
    //console.log('topPx...', topPx, videoHeight, crossY)
  }

  // Align video fully to one side, keeping its center on the vertical midline boundary
  const _alignVideoToSide = side => {
    const vCont = document.getElementById('webgazerVideoContainer')
    if (!vCont) return
    const videoWidth = parseInt(vCont.style.width) || vCont.offsetWidth || 0
    const videoHalfWidth = videoWidth / 2
    // side refers to the OPEN eye. Video must be on the opposite side.
    // If side is right (left eye closed), video goes LEFT; if side is left, video goes RIGHT.
    if (side === 'right') crossX = centerX - videoHalfWidth
    else if (side === 'center') crossX = centerX
    else crossX = centerX + videoHalfWidth
    _positionVideoBelowFixation()
  }

  // Blindspot geometry helpers reused from old scheme
  const calculateSpotRadiusPx = (
    spotDeg,
    ppi,
    blindspotEccXDeg,
    currentCircleX,
    currentCrossX,
    blindspotEccYDeg = -1.5, // Add vertical eccentricity parameter
  ) => {
    const spotEccXCm = (currentCircleX - currentCrossX) / ppiToPxPerCm(ppi)

    // Use simple horizontal-based formula (original approach)
    const spotCm = (Math.abs(spotEccXCm) * spotDeg) / Math.abs(blindspotEccXDeg)
    const safeSpotCm = Math.max(spotCm, 0.1)
    return (safeSpotCm / 2) * ppiToPxPerCm(ppi)
  }
  const calculateSpotY = (
    currentCircleX,
    currentCrossX,
    currentCrossY,
    ppi,
    blindspotEccXDeg,
    blindspotEccYDeg,
  ) => {
    const spotEccXCm = (currentCircleX - currentCrossX) / ppiToPxPerCm(ppi)
    const spotEccYCm = (spotEccXCm * blindspotEccYDeg) / blindspotEccXDeg
    const spotEccYCmPx = spotEccYCm * ppiToPxPerCm(ppi)
    // Invert to account for canvas Y-axis (downwards positive)
    return currentCrossY - spotEccYCmPx
  }
  function _getDiamondBounds(side, cameraLineX, cW, diamondWidth, ppi = 96) {
    const minDistanceCm = 5
    const minDistancePx = (minDistanceCm * ppi) / 2.54
    const minHalfPx = minDistancePx / 2
    const vCont = document.getElementById('webgazerVideoContainer')
    const videoWidth = vCont
      ? parseInt(vCont.style.width) || vCont.offsetWidth || 0
      : 0
    const videoHalfWidth = videoWidth / 2

    // For red-green squares, we need to protect the combined extent
    // Since green extends one full square width beyond red, use 1.5x the single square width
    // This ensures both squares stay on screen with a safety margin
    const singleSquareHalfWidth = diamondWidth / 2
    const combinedExtent = diamondWidth * 1.5 // Red (full width) + Green (half width on far side) = 1.5x

    if (side === 'left') {
      // Left eye: spot on right side, might extend further right with green square
      const minX = Math.max(
        cameraLineX + minHalfPx,
        cameraLineX + videoHalfWidth,
      )
      const maxX = Math.min(
        2 * cameraLineX - videoHalfWidth,
        cW - combinedExtent, // Use combined extent for safety
      )
      return [minX, maxX]
    } else {
      // Right eye: spot on left side, might extend further left with green square
      const minX = Math.max(
        2 * cameraLineX - (window.innerWidth - videoHalfWidth),
        combinedExtent, // Use combined extent for safety
      )
      const maxX = Math.min(
        cameraLineX - minHalfPx,
        cameraLineX - videoHalfWidth,
      )
      return [minX, maxX]
    }
  }
  function _getDiamondVerticalBounds(diamondWidth, cH) {
    const diamondHalfWidth = diamondWidth / 2
    const minY = diamondHalfWidth
    const maxY = cH - diamondHalfWidth
    return [minY, maxY]
  }

  // Helper function to calculate combined red+green square bounds
  // Returns the actual left/right edges when both squares are rendered
  // This ensures we protect BOTH squares from going off-screen
  // circleX now represents the red-green edge (midline), not the red center
  function getRedGreenCombinedBounds(
    circleX,
    circleY,
    squareSize,
    greenSide,
    fixationX,
  ) {
    const halfSize = squareSize / 2

    // Determine green square offset direction (same logic as in onCanvas.js)
    let greenOffsetX = 0
    if (greenSide === 'near') {
      // Green square toward fixation
      greenOffsetX = fixationX < circleX ? -squareSize : squareSize
    } else {
      // Green square away from fixation
      greenOffsetX = fixationX < circleX ? squareSize : -squareSize
    }

    // Calculate square centers from edge position
    // circleX is the edge (midline), so red and green are offset in opposite directions
    const redX = circleX - greenOffsetX / 2
    const greenX = circleX + greenOffsetX / 2

    // Calculate all edges
    const redLeft = redX - halfSize
    const redRight = redX + halfSize
    const greenLeft = greenX - halfSize
    const greenRight = greenX + halfSize

    // Return combined extent
    return {
      left: Math.min(redLeft, greenLeft),
      right: Math.max(redRight, greenRight),
      top: circleY - halfSize,
      bottom: circleY + halfSize,
      redCenter: redX,
      greenCenter: greenX,
      redLeft,
      redRight,
      greenLeft,
      greenRight,
      width: Math.max(redRight, greenRight) - Math.min(redLeft, greenLeft),
    }
  }

  // No radio buttons or hint text in new flow - removed UI elements

  const setInstructionContent = (html, side) => {
    const inst = document.getElementById('blind-spot-instruction')
    if (inst) {
      inst.innerHTML = replaceNewlinesWithBreaks(html)
    } else {
      RC._constructFloatInstructionElement(
        'blind-spot-instruction',
        replaceNewlinesWithBreaks(html),
      )
    }
    RC._setFloatInstructionElementPos(side, 16)
  }

  let blindspotEccXDeg = options.calibrateTrackDistanceSpotXYDeg[0]
  const blindspotEccYDeg = options.calibrateTrackDistanceSpotXYDeg[1]
  let spotDeg = minDeg
  const slider = document.getElementById('blindspot-size-slider')
  slider.value = 0
  slider.addEventListener('input', e => {
    const fractionHeight = parseFloat(e.target.value)
    spotDeg = Math.pow(
      10,
      Math.log10(minDeg) + fractionHeight * Math.log10(maxDeg / minDeg),
    )
  })
  let circleBounds = [0, 0]

  // TEST FUNCTION: Draw anatomical line through fixation cross
  const drawAnatomicalLine = (
    ctx,
    crossX,
    crossY,
    blindspotEccXDeg,
    blindspotEccYDeg,
    canvasWidth,
    canvasHeight,
    diamondX,
    diamondY,
    debugging,
  ) => {
    if (!debugging) return

    // Calculate the grade/slope: blindspotEccYDeg / blindspotEccXDeg (mirrored)
    const grade = -blindspotEccYDeg / blindspotEccXDeg

    // Calculate line endpoints
    // Start from left edge of canvas
    const startX = 0
    const startY = crossY + grade * (startX - crossX)

    // End at right edge of canvas
    const endX = canvasWidth
    const endY = crossY + grade * (endX - crossX)

    //console.log('Line endpoints:', { startX, startY, endX, endY })

    // Draw the line with dark blue color
    ctx.strokeStyle = '#000080' // Dark blue
    ctx.lineWidth = 2 // Thinner line
    ctx.beginPath()
    ctx.moveTo(startX, startY)
    ctx.lineTo(endX, endY)
    ctx.stroke()

    // Draw green circle at diamond center to show it follows the line
    if (diamondX !== undefined && diamondY !== undefined) {
      ctx.fillStyle = '#00FF00' // Green
      ctx.beginPath()
      ctx.arc(diamondX, diamondY, 5, 0, 2 * Math.PI)
      ctx.fill()
    }

    // Draw grade info as text without background
    ctx.fillStyle = '#FF0000' // Bright red text
    ctx.font = '12px Arial' // Smaller font
    ctx.fillText(`Grade: ${grade.toFixed(3)}`, 10, 20)
    ctx.fillText(`X: ${blindspotEccXDeg}°, Y: ${blindspotEccYDeg}°`, 10, 35)
    ctx.fillText(
      `Cross: (${Math.round(crossX)}, ${Math.round(crossY)})`,
      10,
      50,
    )
  }

  const resetEyeSide = side => {
    eyeSide = side
    blindspotEccXDeg =
      side === 'left'
        ? -options.calibrateTrackDistanceSpotXYDeg[0]
        : options.calibrateTrackDistanceSpotXYDeg[0]
    // initial horizontal separation: 6cm total → half to each side
    const initialDistanceCm = 6
    const initialDistancePx = (initialDistanceCm * ppi) / 2.54
    // Place the diamond on the SAME side as the open eye
    circleX =
      side === 'right'
        ? centerX + initialDistancePx / 2
        : centerX - initialDistancePx / 2
    const rPx = calculateSpotRadiusPx(
      spotDeg,
      ppi,
      blindspotEccXDeg,
      circleX,
      crossX,
    )
    const boundsSide = side === 'right' ? 'left' : 'right'
    circleBounds = _getDiamondBounds(boundsSide, centerX, c.width, rPx * 2, ppi)
    circleX = Math.max(circleBounds[0], Math.min(circleBounds[1], circleX))
    crossX = 2 * centerX - circleX
    _positionVideoBelowFixation()
  }

  // Draw loop
  const frameTimestampInitial = performance.now()
  let inTest = true
  const run = () => {
    //console.log('Drawing frame - crossY:', crossY, 'crossX:', crossX)
    ctx.clearRect(0, 0, c.width, c.height)
    const rPx = calculateSpotRadiusPx(
      spotDeg,
      ppi,
      blindspotEccXDeg,
      circleX,
      crossX,
    )
    const boundsSide = eyeSide === 'right' ? 'left' : 'right'
    circleBounds = _getDiamondBounds(boundsSide, centerX, c.width, rPx * 2, ppi)

    // Calculate combined red+green bounds to prevent either square from going off screen
    const spotYForBounds = calculateSpotY(
      circleX,
      crossX,
      crossY,
      ppi,
      blindspotEccXDeg,
      blindspotEccYDeg,
    )
    const combinedBounds = getRedGreenCombinedBounds(
      circleX,
      spotYForBounds,
      rPx * 2, // squareSize
      currentEdge,
      crossX,
    )

    // Check if green or red square would overlap video (prevent occlusion)
    const vCont = document.getElementById('webgazerVideoContainer')
    const videoWidth = vCont
      ? parseInt(vCont.style.width) || vCont.offsetWidth || 0
      : 0
    const videoHalfWidth = videoWidth / 2
    const videoLeftEdge = crossX - videoHalfWidth
    const videoRightEdge = crossX + videoHalfWidth

    // Check for overlap: square overlaps video if squareLeft < videoRight AND squareRight > videoLeft
    const greenOverlapsVideo =
      combinedBounds.greenLeft < videoRightEdge &&
      combinedBounds.greenRight > videoLeftEdge
    const redOverlapsVideo =
      combinedBounds.redLeft < videoRightEdge &&
      combinedBounds.redRight > videoLeftEdge

    if (greenOverlapsVideo || redOverlapsVideo) {
      // Push stimulus away from video to prevent occlusion
      // Calculate how much to shift to clear the video
      let videoShift = 0

      if (greenOverlapsVideo) {
        // Green is overlapping - push away
        if (combinedBounds.greenCenter < crossX) {
          // Green is left of fixation, push further left
          videoShift = videoLeftEdge - combinedBounds.greenRight
        } else {
          // Green is right of fixation, push further right
          videoShift = videoRightEdge - combinedBounds.greenLeft
        }
      } else if (redOverlapsVideo) {
        // Red is overlapping - push away
        if (combinedBounds.redCenter < crossX) {
          // Red is left of fixation, push further left
          videoShift = videoLeftEdge - combinedBounds.redRight
        } else {
          // Red is right of fixation, push further right
          videoShift = videoRightEdge - combinedBounds.redLeft
        }
      }

      // Apply video clearance shift
      const newCircleX = circleX + videoShift

      // Make sure this doesn't push us off screen
      const testBounds = getRedGreenCombinedBounds(
        newCircleX,
        spotYForBounds,
        rPx * 2,
        currentEdge,
        crossX,
      )

      if (testBounds.left >= 0 && testBounds.right <= c.width) {
        // Safe to apply shift
        circleX = newCircleX
      }
      // If can't shift without going off screen, we're stuck - user needs to adjust
    }

    let shift = 0
    const isAtMaxSize = spotDeg >= maxDeg

    if (!isAtMaxSize) {
      // Only shift if squares are not at maximum size
      if (combinedBounds.left < 0) {
        // Combined stimulus would go off left edge, shift everything right
        shift = -combinedBounds.left
      } else if (combinedBounds.right > c.width) {
        // Combined stimulus would go off right edge, shift everything left
        shift = c.width - combinedBounds.right
      }

      // Check if shift would push video off screen
      if (shift !== 0) {
        const vCont = document.getElementById('webgazerVideoContainer')
        const videoWidth = vCont
          ? parseInt(vCont.style.width) || vCont.offsetWidth || 0
          : 0
        const videoHalfWidth = videoWidth / 2

        // Calculate video edges after proposed shift
        const newCrossX = crossX + shift
        const videoLeftEdge = newCrossX - videoHalfWidth
        const videoRightEdge = newCrossX + videoHalfWidth

        // Only apply shift if video stays within screen bounds
        if (videoLeftEdge >= 0 && videoRightEdge <= c.width) {
          // Safe to shift, video stays on screen
          circleX += shift
          crossX += shift
          _positionVideoBelowFixation()
        } else {
          // Can't shift because video would go off screen
          // Constrain edge position to keep combined stimulus on screen
          if (combinedBounds.left < 0) {
            // Shift edge (circleX) right by the overflow amount
            circleX = circleX - combinedBounds.left
          } else if (combinedBounds.right > c.width) {
            // Shift edge (circleX) left by the overflow amount
            circleX = circleX - (combinedBounds.right - c.width)
          }
        }
      }
    } else {
      // At max size, just constrain to screen bounds (may reduce eccentricity)
      if (combinedBounds.left < 0) {
        circleX = circleX - combinedBounds.left
      } else if (combinedBounds.right > c.width) {
        circleX = circleX - (combinedBounds.right - c.width)
      }
    }

    // Only center and check message when diamond is visible
    if (showDiamond) {
      // Center the stimulus at screen midline (if it fits)
      centerStimulus(rPx * 2)
      _positionVideoBelowFixation()

      // Check if we should show help message
      checkAndShowHelpMessage()
    }

    const spotY = calculateSpotY(
      circleX,
      crossX,
      crossY,
      ppi,
      blindspotEccXDeg,
      blindspotEccYDeg,
    )
    // Remove bounds constraints to let diamond follow anatomical line exactly
    const constrainedSpotY = spotY
    if (showDiamond) {
      // Use red-green squares for edge-based blindspot test
      // greenSide is 'near' (toward fixation) or 'far' (away from fixation)
      _redGreenSquares(
        RC,
        ctx,
        circleX,
        constrainedSpotY,
        Math.round(performance.now() - frameTimestampInitial),
        options.sparkle,
        rPx * 2,
        currentEdge, // Dynamic: 'near' or 'far' based on which edge we're testing
        crossX,
      )
    }
    _cross(ctx, crossX, crossY)

    // TEST: Draw anatomical line through fixation cross
    drawAnatomicalLine(
      ctx,
      crossX,
      crossY,
      blindspotEccXDeg,
      blindspotEccYDeg,
      c.width,
      c.height,
      circleX,
      constrainedSpotY,
      options.calibrateTrackDistanceBlindspotDebugging,
    )

    if (inTest) requestAnimationFrame(run)
  }
  requestAnimationFrame(run)

  // Keyboard handlers
  const adjustHorizontal = dx => {
    // Calculate current and max eccentricity
    const currentEccentricity = Math.abs(circleX - crossX)
    // const maxEccentricity = calculateMaxEccentricity()

    // Check if trying to increase eccentricity beyond max
    const newCircleX = circleX + dx
    const newEccentricity = Math.abs(newCircleX - crossX)

    // if (
    //   newEccentricity > currentEccentricity &&
    //   currentEccentricity >= maxEccentricity
    // ) {
    //   // At max eccentricity, trying to increase further - block
    //   return
    // }

    // Check if trying to decrease eccentricity below minimum (5cm)
    const minDistanceCm = 5
    const minDistancePx = (minDistanceCm * ppi) / 2.54

    if (
      newEccentricity < currentEccentricity &&
      newEccentricity < minDistancePx
    ) {
      // Trying to move closer than minimum distance - block
      return
    }

    // Calculate square size
    const rPx = calculateSpotRadiusPx(
      spotDeg,
      ppi,
      blindspotEccXDeg,
      circleX,
      crossX,
    )
    const squareSize = rPx * 2

    // Calculate combined bounds for new position
    const newSpotY = calculateSpotY(
      newCircleX,
      crossX,
      crossY,
      ppi,
      blindspotEccXDeg,
      blindspotEccYDeg,
    )
    const newBounds = getRedGreenCombinedBounds(
      newCircleX,
      newSpotY,
      squareSize,
      currentEdge,
      crossX,
    )

    // Check if new position would keep both squares within screen bounds
    if (newBounds.left >= 0 && newBounds.right <= c.width) {
      // Only move if both squares stay within screen bounds
      circleX = newCircleX
      _positionVideoBelowFixation()

      // Message will be checked in animation loop
    } else {
      console.log('BLOCKED by red-green squares screen edge:', {
        combinedLeft: newBounds.left.toFixed(1),
        combinedRight: newBounds.right.toFixed(1),
        redLeft: newBounds.redLeft.toFixed(1),
        redRight: newBounds.redRight.toFixed(1),
        greenLeft: newBounds.greenLeft.toFixed(1),
        greenRight: newBounds.greenRight.toFixed(1),
        screenWidth: c.width,
      })
    }
  }
  const adjustSpot = scale => {
    // Only allow increase if we can maintain eccentricity
    if (scale > 1) {
      // Calculate what the new size would be
      const newSpotDeg = Math.max(minDeg, Math.min(maxDeg, spotDeg * scale))

      // If size would actually increase
      if (newSpotDeg > spotDeg) {
        // Calculate new square size
        const newRPx = calculateSpotRadiusPx(
          newSpotDeg,
          ppi,
          blindspotEccXDeg,
          circleX,
          crossX,
        )
        const newSquareSize = newRPx * 2

        // Calculate combined bounds with new size
        const newSpotY = calculateSpotY(
          circleX,
          crossX,
          crossY,
          ppi,
          blindspotEccXDeg,
          blindspotEccYDeg,
        )
        const newBounds = getRedGreenCombinedBounds(
          circleX,
          newSpotY,
          newSquareSize,
          currentEdge,
          crossX,
        )

        // Check if combined squares would go off screen with new size
        const squaresNeedShift = newBounds.left < 0 || newBounds.right > c.width

        // NEW: Check if green square would occlude the video
        // Video is centered at crossX
        const vCont = document.getElementById('webgazerVideoContainer')
        const videoWidth = vCont
          ? parseInt(vCont.style.width) || vCont.offsetWidth || 0
          : 0
        const videoHalfWidth = videoWidth / 2
        const videoLeftEdge = crossX - videoHalfWidth
        const videoRightEdge = crossX + videoHalfWidth

        // Check if green square would overlap video
        // Green overlaps video if: greenLeft < videoRight AND greenRight > videoLeft
        const greenWouldOverlapVideo =
          newBounds.greenLeft < videoRightEdge &&
          newBounds.greenRight > videoLeftEdge

        if (greenWouldOverlapVideo) {
          console.log('❌ BLOCKED size increase: green would occlude video', {
            greenLeft: newBounds.greenLeft.toFixed(1),
            greenRight: newBounds.greenRight.toFixed(1),
            videoLeft: videoLeftEdge.toFixed(1),
            videoRight: videoRightEdge.toFixed(1),
            crossX: crossX.toFixed(1),
            overlap: 'Green square would cover the video feed',
            message: 'Move stimulus away from fixation to increase size',
          })
          return
        }

        // Also check if red square would overlap video (already exists but let's be explicit)
        const redWouldOverlapVideo =
          newBounds.redLeft < videoRightEdge &&
          newBounds.redRight > videoLeftEdge

        if (redWouldOverlapVideo) {
          console.log('❌ BLOCKED size increase: red would occlude video', {
            redLeft: newBounds.redLeft.toFixed(1),
            redRight: newBounds.redRight.toFixed(1),
            videoLeft: videoLeftEdge.toFixed(1),
            videoRight: videoRightEdge.toFixed(1),
            crossX: crossX.toFixed(1),
            overlap: 'Red square would cover the video feed',
            message: 'Move stimulus away from fixation to increase size',
          })
          return
        }

        if (squaresNeedShift) {
          // Calculate required shift
          let requiredShift = 0
          if (newBounds.left < 0) {
            requiredShift = -newBounds.left
          } else if (newBounds.right > c.width) {
            requiredShift = c.width - newBounds.right
          }

          // console.log('🔍 Size increase would require shift:', {
          //   currentBoundsLeft: getRedGreenCombinedBounds(
          //     circleX,
          //     calculateSpotY(
          //       circleX,
          //       crossX,
          //       crossY,
          //       ppi,
          //       blindspotEccXDeg,
          //       blindspotEccYDeg,
          //     ),
          //     rPx * 2,
          //     currentEdge,
          //     crossX,
          //   ).left.toFixed(1),
          //   currentBoundsRight: getRedGreenCombinedBounds(
          //     circleX,
          //     calculateSpotY(
          //       circleX,
          //       crossX,
          //       crossY,
          //       ppi,
          //       blindspotEccXDeg,
          //       blindspotEccYDeg,
          //     ),
          //     rPx * 2,
          //     currentEdge,
          //     crossX,
          //   ).right.toFixed(1),
          //   newBoundsLeft: newBounds.left.toFixed(1),
          //   newBoundsRight: newBounds.right.toFixed(1),
          //   requiredShift: requiredShift.toFixed(1),
          //   screenWidth: c.width,
          // })

          // Check if video can shift
          const vCont = document.getElementById('webgazerVideoContainer')
          const videoWidth = vCont
            ? parseInt(vCont.style.width) || vCont.offsetWidth || 0
            : 0
          const videoHalfWidth = videoWidth / 2
          const newCrossX = crossX + requiredShift
          const videoLeftEdge = newCrossX - videoHalfWidth
          const videoRightEdge = newCrossX + videoHalfWidth

          // Block size increase if it would require shifting
          // The animation loop will handle shifts dynamically, but we shouldn't
          // proactively increase size beyond what fits
          console.log(
            '❌ BLOCKED size increase: would push squares off screen',
            {
              requiredShift: requiredShift.toFixed(1),
              newBoundsLeft: newBounds.left.toFixed(1),
              newBoundsRight: newBounds.right.toFixed(1),
              redLeft: newBounds.redLeft.toFixed(1),
              redRight: newBounds.redRight.toFixed(1),
              greenLeft: newBounds.greenLeft.toFixed(1),
              greenRight: newBounds.greenRight.toFixed(1),
              screenWidth: c.width,
              message: 'Move stimulus away from edge to increase size',
            },
          )
          return
        }
      }
    }

    // Safe to adjust size
    spotDeg = Math.max(minDeg, Math.min(maxDeg, spotDeg * scale))
    const currentValue = parseFloat(slider.value)
    const newValue = Math.max(
      0,
      Math.min(
        1,
        currentValue + Math.log10(scale) / Math.log10(maxDeg / minDeg),
      ),
    )
    slider.value = newValue.toFixed(3)

    // Message will be checked in animation loop
  }
  const keyHandler = e => {
    if (!allowMove) return
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      adjustHorizontal(-2.5)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      adjustHorizontal(2.5)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      adjustSpot(1.05)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      adjustSpot(0.95)
    } else if (e.key === 'Escape' && options.showCancelButton) {
      e.preventDefault()
      cleanup(false)
    }
  }
  document.addEventListener('keydown', keyHandler)

  // Prep page: space to proceed
  // Hide diamond and prevent movement; align video on right side initially
  showDiamond = false
  allowMove = false
  _alignVideoToSide('center')
  // Also update the instruction placement on the right for the prep page
  const prepInstructionText = shouldShowTiltAndSwivel
    ? phrases.RC_distanceTrackingBlindspotGetReadyTiltAndSwivel?.[RC.L] ||
      'Get ready. When you press SPACE, we will measure your viewing distance.'
    : phrases.RC_distanceTrackingBlindspotGetReady?.[RC.L] ||
      'Get ready. When you press SPACE, we will measure your viewing distance.'
  setInstructionContent(prepInstructionText, 'left')
  // Re-align after layout settles
  requestAnimationFrame(() => _alignVideoToSide('center'))
  requestAnimationFrame(() => _alignVideoToSide('center'))
  await new Promise(resolve => {
    const onSpace = e => {
      if (e.key === ' ') {
        //play stamp of approval sound
        if (env !== 'mocha' && stampOfApprovalSound) {
          stampOfApprovalSound()
        }
        e.preventDefault()
        document.removeEventListener('keydown', onSpace)
        resolve()
      }
    }
    document.addEventListener('keydown', onSpace)
  })

  // Per-eye, per-edge snapshot storage
  let rightNearSnapshot = null
  let rightFarSnapshot = null
  let leftNearSnapshot = null
  let leftFarSnapshot = null

  // Simplified function: one snapshot per edge (no centering loop, no radio buttons)
  const doEdgeSnapshot = async (
    side,
    edge,
    nearEdgeSpotXYPx = null,
    nearEdgeDistanceCm = null,
    nearEdgeFixationXYPx = null, // ADDED: Actual fixation position from near edge
  ) => {
    resetEyeSide(side)

    // If this is a far edge and we have the near edge position, initialize based on near edge eccentricity
    if (edge === 'far' && nearEdgeSpotXYPx) {
      const nearEdgeX = nearEdgeSpotXYPx[0]

      // Use ACTUAL fixation position from near edge measurement
      // If not provided, fall back to calculated value
      const nearEdgeCrossX = nearEdgeFixationXYPx
        ? nearEdgeFixationXYPx[0]
        : 2 * centerX - nearEdgeX
      const nearEdgeEccentricityPx = Math.abs(nearEdgeX - nearEdgeCrossX)
      const nearEdgeEccentricityCm = nearEdgeEccentricityPx / pxPerCm

      console.log('///// ===== FAR EDGE ECCENTRICITY DEBUGGING =====')
      console.log('///// STEP 1: NEAR EDGE ANALYSIS')
      console.log('/////   Screen width:', c.width, 'px')
      console.log('/////   Screen centerX:', centerX.toFixed(1), 'px')
      console.log(
        '/////   Near edge shared border was at:',
        nearEdgeX.toFixed(1),
        'px',
      )
      console.log(
        '/////   Near edge fixation (crossX) was at:',
        nearEdgeCrossX.toFixed(1),
        'px',
        nearEdgeFixationXYPx
          ? '(ACTUAL from snapshot ✓)'
          : '(CALCULATED - may be inaccurate!)',
      )
      console.log(
        '/////   Distance between them:',
        nearEdgeEccentricityPx.toFixed(1),
        'px =',
        nearEdgeEccentricityCm.toFixed(1),
        'cm',
      )
      console.log('/////   ↑ This is the near edge eccentricity we will use')

      // Multiplier for far edge eccentricity (configurable: 1x, 2x, 3x, etc.)
      const eccentricityMultiplier = 2.0 // 2× the near edge eccentricity

      // Calculate target far edge eccentricity
      const targetEccentricityPx =
        nearEdgeEccentricityPx * eccentricityMultiplier
      const targetEccentricityCm =
        nearEdgeEccentricityCm * eccentricityMultiplier

      // Determine direction: away from fixation means away from centerX
      // CRITICAL: After resetEyeSide, crossX is reset to default position
      // We need to determine directionAwayFromFixation based on near edge position
      // relative to screen center, not the reset crossX
      const directionAwayFromFixation = nearEdgeX > centerX ? 1 : -1

      // Calculate square size with CURRENT spotDeg (user may have adjusted size)
      // Use a reference circleX to calculate the size - we'll use the near edge position
      // Use nearEdgeX as circleX (the edge position) during near edge measurement
      // This ensures we use the size the user actually set during near edge
      const tempCircleXForSize = nearEdgeX // Edge position for size calculation
      const tempCrossXForSize = 2 * centerX - tempCircleXForSize
      const rPx = calculateSpotRadiusPx(
        spotDeg,
        ppi,
        blindspotEccXDeg,
        tempCircleXForSize,
        tempCrossXForSize,
      )
      const squareSize = rPx * 2

      console.log('///// STEP 2: TARGET CALCULATION')
      console.log('/////   Multiplier:', eccentricityMultiplier + '×')
      console.log(
        '/////   Near edge eccentricity:',
        nearEdgeEccentricityCm.toFixed(1),
        'cm (',
        nearEdgeEccentricityPx.toFixed(1),
        'px )',
      )
      console.log(
        '/////   Target far edge eccentricity:',
        targetEccentricityCm.toFixed(1),
        'cm (',
        targetEccentricityPx.toFixed(1),
        'px )',
      )
      console.log(
        '/////   Direction away from fixation:',
        directionAwayFromFixation > 0 ? 'right (+1)' : 'left (-1)',
      )
      console.log('/////   Current spot size (deg):', spotDeg.toFixed(2))
      console.log(
        '/////   Calculated square size:',
        squareSize.toFixed(1),
        'px',
      )

      // For 'far' edge, green is AWAY from fixation
      const greenOffsetX =
        directionAwayFromFixation > 0 ? squareSize : -squareSize

      // Smart constraint: Scale down offset if green would go too close to edge
      // Minimum distance from edge: 2px (very minimal constraint)
      const minEdgeDistancePx = 2 // Just 2 pixels from edge

      // IMPORTANT: We want the NEAR SIDE OF RED SQUARE at 2× eccentricity, not the midline!
      // For far edge: Red is toward fixation, Green is away
      // Layout: [Red][SharedBorder][Green]
      // Near side of red = the edge of red closer to fixation
      //
      // For right side: nearSideOfRed = sharedBorder - redSize
      // For left side: nearSideOfRed = sharedBorder + redSize
      // We want: |nearSideOfRed - crossX| = targetEccentricity
      //
      // Since redSize depends on sharedBorder position, we iterate to converge

      console.log(
        '///// STEP 3: FAR EDGE POSITION CALCULATION (NEAR SIDE OF RED at 2×)',
      )
      console.log(
        '/////   Target: Near side of red at',
        targetEccentricityCm.toFixed(1),
        'cm (',
        targetEccentricityPx.toFixed(1),
        'px )',
      )

      // Start with initial guess: place midline at 2× eccentricity
      let sharedBorderX =
        centerX + (directionAwayFromFixation * targetEccentricityPx) / 2
      let iterations = 0
      const maxIterations = 10

      while (iterations < maxIterations) {
        const testCrossX = 2 * centerX - sharedBorderX
        const testRPx = calculateSpotRadiusPx(
          spotDeg,
          ppi,
          blindspotEccXDeg,
          sharedBorderX,
          testCrossX,
        )
        const redSize = testRPx * 2

        // Calculate where near side of red is
        const nearSideOfRed =
          directionAwayFromFixation > 0
            ? sharedBorderX - redSize // Right side: red is to the left of border
            : sharedBorderX + redSize // Left side: red is to the right of border

        // Calculate eccentricity of near side of red
        const nearSideEccentricity = Math.abs(nearSideOfRed - testCrossX)

        console.log(
          '/////   Iteration',
          iterations + 1 + ':',
          'sharedBorder =',
          sharedBorderX.toFixed(1),
          'redSize =',
          redSize.toFixed(1),
          'nearSideEcc =',
          nearSideEccentricity.toFixed(1),
        )

        // Check if we've converged
        if (Math.abs(nearSideEccentricity - targetEccentricityPx) < 0.5) {
          console.log(
            '/////   ✓ Converged! Near side of red eccentricity:',
            nearSideEccentricity.toFixed(1),
            'px',
          )
          break
        }

        // Adjust: if nearSideEccentricity is too small, move sharedBorder farther from fixation
        const error = targetEccentricityPx - nearSideEccentricity
        sharedBorderX += (directionAwayFromFixation * error) / 2
        iterations++
      }

      let newSharedBorderX = sharedBorderX
      let newCircleX = newSharedBorderX

      // IMPORTANT: Recalculate square size at the final converged position
      // This accounts for square size changing with eccentricity
      const finalIterCrossX = 2 * centerX - newSharedBorderX
      const finalIterRPx = calculateSpotRadiusPx(
        spotDeg,
        ppi,
        blindspotEccXDeg,
        newSharedBorderX,
        finalIterCrossX,
      )
      const finalIterSquareSize = finalIterRPx * 2

      console.log(
        '/////   Final shared border X:',
        newSharedBorderX.toFixed(1),
        'px (after',
        iterations + 1,
        'iterations)',
      )
      console.log(
        '/////   Final square size at this position:',
        finalIterSquareSize.toFixed(1),
        'px (recalculated with current spotDeg)',
      )

      // Calculate where green would be with this position using CURRENT square size
      const testSpotY = calculateSpotY(
        newCircleX,
        finalIterCrossX,
        crossY,
        ppi,
        blindspotEccXDeg,
        blindspotEccYDeg,
      )
      const testBounds = getRedGreenCombinedBounds(
        newCircleX,
        testSpotY,
        finalIterSquareSize, // Use the recalculated square size from converged position!
        'far',
        finalIterCrossX,
      )

      // Verify the calculated eccentricity
      const calculatedCrossX = 2 * centerX - newSharedBorderX
      const calculatedEccentricityPx = Math.abs(
        newSharedBorderX - calculatedCrossX,
      )
      const calculatedEccentricityCm = calculatedEccentricityPx / pxPerCm

      console.log('///// STEP 4: VERIFICATION')
      console.log(
        '/////   Calculated far edge crossX:',
        calculatedCrossX.toFixed(1),
        'px',
      )
      console.log(
        '/////   Calculated far edge eccentricity:',
        calculatedEccentricityPx.toFixed(1),
        'px =',
        calculatedEccentricityCm.toFixed(1),
        'cm',
      )
      console.log(
        '/////   Target was:',
        targetEccentricityPx.toFixed(1),
        'px =',
        targetEccentricityCm.toFixed(1),
        'cm',
      )
      console.log(
        '/////   Match:',
        Math.abs(calculatedEccentricityPx - targetEccentricityPx) < 0.1
          ? '✓ YES'
          : '✗ NO - DIFFERENCE: ' +
              (calculatedEccentricityPx - targetEccentricityPx).toFixed(1) +
              'px',
      )

      // Check if green would be too close to screen edge
      let eccentricityWasReduced = false

      console.log('🔍 DEBUG: Checking eccentricity constraints')
      console.log('  Screen width:', c.width)
      console.log('  Test bounds:', {
        left: testBounds.left.toFixed(1),
        right: testBounds.right.toFixed(1),
        redLeft: testBounds.redLeft.toFixed(1),
        redRight: testBounds.redRight.toFixed(1),
        greenLeft: testBounds.greenLeft.toFixed(1),
        greenRight: testBounds.greenRight.toFixed(1),
      })
      console.log(
        '  Direction:',
        directionAwayFromFixation > 0 ? 'right' : 'left',
      )
      console.log('  Min edge distance:', minEdgeDistancePx.toFixed(1), 'px')

      if (directionAwayFromFixation > 0) {
        // Moving right - check right edge
        const distanceFromRightEdge = c.width - testBounds.right
        console.log(
          '  Distance from right edge:',
          distanceFromRightEdge.toFixed(1),
          'px',
        )

        if (distanceFromRightEdge < minEdgeDistancePx) {
          // Green too close to right edge - need to find max position iteratively
          // because square size changes with eccentricity!
          eccentricityWasReduced = true
          console.log(
            '  ⚠️  TOO CLOSE! Finding maximum position (accounting for changing square size)...',
          )

          // Binary search for maximum position that fits
          let lowX = centerX // Safe position
          let highX = newSharedBorderX // Too far
          let iterations = 0
          const maxIterations = 20

          while (iterations < maxIterations && Math.abs(highX - lowX) > 1) {
            const midX = (lowX + highX) / 2
            const testCrossX = 2 * centerX - midX

            // Calculate square size at THIS position
            const testRPx = calculateSpotRadiusPx(
              spotDeg,
              ppi,
              blindspotEccXDeg,
              midX,
              testCrossX,
            )
            const testSquareSize = testRPx * 2
            const testGreenOffsetX =
              directionAwayFromFixation > 0 ? testSquareSize : -testSquareSize

            // Calculate bounds with the actual square size at this position
            const testY = calculateSpotY(
              midX,
              testCrossX,
              crossY,
              ppi,
              blindspotEccXDeg,
              blindspotEccYDeg,
            )
            const testBoundsAtMid = getRedGreenCombinedBounds(
              midX,
              testY,
              testSquareSize,
              'far',
              testCrossX,
            )

            const rightClearance = c.width - testBoundsAtMid.right

            if (rightClearance >= minEdgeDistancePx) {
              // This position works - try going farther
              lowX = midX
            } else {
              // Too far - reduce
              highX = midX
            }
            iterations++
          }

          // Use the safe position found
          newSharedBorderX = lowX
          newCircleX = newSharedBorderX

          const maxCrossX = 2 * centerX - newSharedBorderX
          const maxEccentricityPx = Math.abs(newSharedBorderX - maxCrossX)
          const maxEccentricityCm = maxEccentricityPx / pxPerCm

          // Also calculate near side of red eccentricity at max position
          const maxTestRPx = calculateSpotRadiusPx(
            spotDeg,
            ppi,
            blindspotEccXDeg,
            newSharedBorderX,
            maxCrossX,
          )
          const maxRedSize = maxTestRPx * 2
          const maxNearSideOfRedX = newSharedBorderX - maxRedSize
          const maxNearSideEccentricityPx = Math.abs(
            maxNearSideOfRedX - maxCrossX,
          )
          const maxNearSideEccentricityCm = maxNearSideEccentricityPx / pxPerCm

          console.log(
            '  Found maximum position after',
            iterations,
            'iterations',
          )
          console.log('  Max shared border X:', newSharedBorderX.toFixed(1))
          console.log(
            '  Max midline eccentricity:',
            maxEccentricityCm.toFixed(1),
            'cm',
          )
          console.log(
            '  Max NEAR SIDE OF RED eccentricity:',
            maxNearSideEccentricityCm.toFixed(1),
            'cm',
          )
        } else {
          console.log('  ✓ Sufficient clearance from right edge')
        }
      } else {
        // Moving left - check left edge
        const distanceFromLeftEdge = testBounds.left
        console.log(
          '  Distance from left edge:',
          distanceFromLeftEdge.toFixed(1),
          'px',
        )

        if (distanceFromLeftEdge < minEdgeDistancePx) {
          // Green too close to left edge - need to find max position iteratively
          // because square size changes with eccentricity!
          eccentricityWasReduced = true
          console.log(
            '  ⚠️  TOO CLOSE! Finding maximum position (accounting for changing square size)...',
          )

          // Binary search for maximum position that fits
          let lowX = newSharedBorderX // Too far (most negative)
          let highX = centerX // Safe position
          let iterations = 0
          const maxIterations = 20

          while (iterations < maxIterations && Math.abs(highX - lowX) > 1) {
            const midX = (lowX + highX) / 2
            const testCrossX = 2 * centerX - midX

            // Calculate square size at THIS position
            const testRPx = calculateSpotRadiusPx(
              spotDeg,
              ppi,
              blindspotEccXDeg,
              midX,
              testCrossX,
            )
            const testSquareSize = testRPx * 2
            const testGreenOffsetX =
              directionAwayFromFixation > 0 ? testSquareSize : -testSquareSize

            // Calculate bounds with the actual square size at this position
            const testY = calculateSpotY(
              midX,
              testCrossX,
              crossY,
              ppi,
              blindspotEccXDeg,
              blindspotEccYDeg,
            )
            const testBoundsAtMid = getRedGreenCombinedBounds(
              midX,
              testY,
              testSquareSize,
              'far',
              testCrossX,
            )

            const leftClearance = testBoundsAtMid.left

            if (leftClearance >= minEdgeDistancePx) {
              // This position works - try going farther (more negative)
              highX = midX
            } else {
              // Too far - reduce (less negative)
              lowX = midX
            }
            iterations++
          }

          // Use the safe position found
          newSharedBorderX = highX
          newCircleX = newSharedBorderX

          const maxCrossX = 2 * centerX - newSharedBorderX
          const maxEccentricityPx = Math.abs(newSharedBorderX - maxCrossX)
          const maxEccentricityCm = maxEccentricityPx / pxPerCm

          // Also calculate near side of red eccentricity at max position
          const maxTestRPx = calculateSpotRadiusPx(
            spotDeg,
            ppi,
            blindspotEccXDeg,
            newSharedBorderX,
            maxCrossX,
          )
          const maxRedSize = maxTestRPx * 2
          const maxNearSideOfRedX = newSharedBorderX + maxRedSize
          const maxNearSideEccentricityPx = Math.abs(
            maxNearSideOfRedX - maxCrossX,
          )
          const maxNearSideEccentricityCm = maxNearSideEccentricityPx / pxPerCm

          console.log(
            '  Found maximum position after',
            iterations,
            'iterations',
          )
          console.log('  Max shared border X:', newSharedBorderX.toFixed(1))
          console.log(
            '  Max midline eccentricity:',
            maxEccentricityCm.toFixed(1),
            'cm',
          )
          console.log(
            '  Max NEAR SIDE OF RED eccentricity:',
            maxNearSideEccentricityCm.toFixed(1),
            'cm',
          )
        } else {
          console.log('  ✓ Sufficient clearance from left edge')
        }
      }

      // CRITICAL: Validate final position against ALL constraints
      // Recalculate with actual current state to ensure accuracy
      const proposedCrossX = 2 * centerX - newCircleX

      // Recalculate square size with the proposed position to be absolutely certain
      const finalRPx = calculateSpotRadiusPx(
        spotDeg,
        ppi,
        blindspotEccXDeg,
        newCircleX,
        proposedCrossX,
      )
      const finalSquareSize = finalRPx * 2

      // Recalculate green offset with final square size
      const finalGreenOffsetX =
        directionAwayFromFixation > 0 ? finalSquareSize : -finalSquareSize

      const finalTestBounds = getRedGreenCombinedBounds(
        newCircleX,
        testSpotY,
        finalSquareSize, // Use recalculated size
        'far',
        proposedCrossX,
      )

      console.log('🔍 Final recalculation with proposed position:', {
        proposedCircleX: newCircleX.toFixed(1),
        proposedCrossX: proposedCrossX.toFixed(1),
        recalculatedSquareSize: finalSquareSize.toFixed(1),
        originalSquareSize: squareSize.toFixed(1),
        sizeDifference: (finalSquareSize - squareSize).toFixed(1),
      })

      // Constraint 1: Check HORIZONTAL screen bounds only (left/right edges)
      // Vertical (top/bottom) can go off screen - we don't care
      const leftClearance = finalTestBounds.left
      const rightClearance = c.width - finalTestBounds.right
      const hasScreenClearance =
        leftClearance >= minEdgeDistancePx &&
        rightClearance >= minEdgeDistancePx // Only checking horizontal edges

      // Constraint 2: Check video overlap
      const vCont = document.getElementById('webgazerVideoContainer')
      const videoWidth = vCont
        ? parseInt(vCont.style.width) || vCont.offsetWidth || 0
        : 0
      const videoHalfWidth = videoWidth / 2
      const videoLeftEdge = proposedCrossX - videoHalfWidth
      const videoRightEdge = proposedCrossX + videoHalfWidth

      const greenOverlapsVideo =
        finalTestBounds.greenLeft < videoRightEdge &&
        finalTestBounds.greenRight > videoLeftEdge
      const redOverlapsVideo =
        finalTestBounds.redLeft < videoRightEdge &&
        finalTestBounds.redRight > videoLeftEdge

      const noVideoOverlap = !greenOverlapsVideo && !redOverlapsVideo

      console.log('  📋 Final validation:', {
        leftClearance: leftClearance.toFixed(1),
        rightClearance: rightClearance.toFixed(1),
        hasScreenClearance,
        greenOverlapsVideo,
        redOverlapsVideo,
        noVideoOverlap,
        finalBounds: {
          left: finalTestBounds.left.toFixed(1),
          right: finalTestBounds.right.toFixed(1),
          greenLeft: finalTestBounds.greenLeft.toFixed(1),
          greenRight: finalTestBounds.greenRight.toFixed(1),
        },
      })

      // Apply the position (Level 1 binary search already handled constraints)
      // Just check video overlap as final validation
      if (noVideoOverlap) {
        // Safe to apply
        circleX = newCircleX
        crossX = proposedCrossX
        _positionVideoBelowFixation()
        console.log('  ✅ Position applied (no video overlap)')
      } else {
        // Video overlap - shouldn't happen often, just apply anyway and log warning
        console.log('  ⚠️  Video overlap detected but applying position anyway')
        circleX = newCircleX
        crossX = proposedCrossX
        _positionVideoBelowFixation()
      }

      // Calculate final achieved eccentricity
      const finalCrossX = 2 * centerX - circleX
      const finalEccentricityPx = Math.abs(circleX - finalCrossX)
      const finalEccentricityCm = finalEccentricityPx / pxPerCm

      // Calculate final near side of red eccentricity
      const finalRedSize = finalSquareSize // From the recalculation above
      const finalNearSideOfRedX =
        directionAwayFromFixation > 0
          ? circleX - finalRedSize // Right side: red is to the left of border
          : circleX + finalRedSize // Left side: red is to the right of border
      const finalNearSideEccentricityPx = Math.abs(
        finalNearSideOfRedX - finalCrossX,
      )
      const finalNearSideEccentricityCm = finalNearSideEccentricityPx / pxPerCm

      console.log('///// STEP 5: FINAL RESULT')
      console.log(
        '/////   Near edge eccentricity (midline) was:',
        nearEdgeEccentricityCm.toFixed(1),
        'cm (',
        nearEdgeEccentricityPx.toFixed(1),
        'px )',
      )
      console.log('/////   Multiplier:', eccentricityMultiplier + '×')
      console.log(
        '/////   Target NEAR SIDE OF RED eccentricity:',
        targetEccentricityCm.toFixed(1),
        'cm (',
        targetEccentricityPx.toFixed(1),
        'px )',
      )
      console.log('/////   ')
      console.log(
        '/////   Final shared border (midline):',
        circleX.toFixed(1),
        'px',
      )
      console.log(
        '/////   Final fixation (crossX):',
        finalCrossX.toFixed(1),
        'px',
      )
      console.log(
        '/////   Final red square size:',
        finalRedSize.toFixed(1),
        'px',
      )
      console.log(
        '/////   Final NEAR SIDE OF RED position:',
        finalNearSideOfRedX.toFixed(1),
        'px',
      )
      console.log('/////   ')
      console.log(
        '/////   ACHIEVED midline eccentricity:',
        finalEccentricityPx.toFixed(1),
        'px =',
        finalEccentricityCm.toFixed(1),
        'cm',
      )
      console.log(
        '/////   ACHIEVED near side of red eccentricity:',
        finalNearSideEccentricityPx.toFixed(1),
        'px =',
        finalNearSideEccentricityCm.toFixed(1),
        'cm',
      )
      console.log(
        '/////   Ratio to near edge (midline):',
        (finalNearSideEccentricityPx / nearEdgeEccentricityPx).toFixed(3) +
          '× (should be ' +
          eccentricityMultiplier.toFixed(1) +
          '×)',
      )
      console.log('///// ')
      console.log('///// 📏 WHAT YOU SHOULD MEASURE WITH RULER:')
      console.log('/////   PPI:', ppi, '→ pxPerCm:', pxPerCm.toFixed(2))
      console.log(
        '/////   Near edge: Fixation → Midline =',
        nearEdgeEccentricityCm.toFixed(2),
        'cm',
      )
      console.log(
        '/////   Far edge: Fixation → NEAR SIDE OF RED =',
        finalNearSideEccentricityCm.toFixed(2),
        'cm',
      )
      console.log(
        '/////   📊 Expected ratio with ruler:',
        (finalNearSideEccentricityCm / nearEdgeEccentricityCm).toFixed(3) +
          '× (should be ' +
          eccentricityMultiplier.toFixed(1) +
          '×)',
      )
      console.log(
        '/////   ⚠️  If your ruler shows different, PPI calibration may be off!',
      )

      if (eccentricityWasReduced) {
        console.log(
          '/////   ⚠️  ECCENTRICITY WAS REDUCED to keep green 2px from screen edge',
        )
      } else {
        console.log(
          '/////   ✓ Target eccentricity achieved (green has sufficient clearance)',
        )
      }
      console.log('///// ===== END DEBUGGING =====')
      console.log(
        'Target shared border (edge):',
        newSharedBorderX.toFixed(1),
        'px',
      )
      console.log('Set circleX (edge position):', circleX.toFixed(1), 'px')
      console.log(
        'Green offset:',
        greenOffsetX > 0 ? '+' : '',
        greenOffsetX.toFixed(1),
        'px',
      )
      console.log('Fixation X:', crossX.toFixed(1), 'px')
      console.log('===========================================')
    }

    // Enable movement and show squares
    allowMove = true
    showDiamond = true
    // Set which edge we're testing
    currentEdge = edge

    // Show slider for size adjustment during measurement pages
    const sliderContainer = document.getElementById(
      'blindspot-slider-container',
    )
    if (sliderContainer) sliderContainer.style.display = 'block'

    // Set instruction based on side and edge
    // Placeholder phrases - actual phrases come from parent app
    const instructionSide = side === 'right' ? 'left' : 'right'
    if (side === 'right' && edge === 'near') {
      setInstructionContent(
        phrases.RC_distanceTrackingRightEyeBlindspotSquare1?.[RC.L] ||
          'RIGHT EYE: FIND NEAR EDGE OF BLINDSPOT',
        instructionSide,
      )
    } else if (side === 'right' && edge === 'far') {
      setInstructionContent(
        phrases.RC_distanceTrackingRightEyeBlindspotSquare2?.[RC.L] ||
          'RIGHT EYE: FIND FAR EDGE OF BLINDSPOT',
        instructionSide,
      )
    } else if (side === 'left' && edge === 'near') {
      setInstructionContent(
        phrases.RC_distanceTrackingLeftEyeBlindspotSquare1?.[RC.L] ||
          'LEFT EYE: FIND NEAR EDGE OF BLINDSPOT',
        instructionSide,
      )
    } else if (side === 'left' && edge === 'far') {
      setInstructionContent(
        phrases.RC_distanceTrackingLeftEyeBlindspotSquare2?.[RC.L] ||
          'LEFT EYE: FIND FAR EDGE OF BLINDSPOT',
        instructionSide,
      )
    }

    return await new Promise((resolve, reject) => {
      // Wait for SPACE to take snapshot
      const onSpaceSnap = async e => {
        if (e.key !== ' ') return
        e.preventDefault()

        // Check if iris tracking is active before proceeding
        if (!irisTrackingIsActive) {
          console.log('Iris tracking not active - ignoring space bar')
          return
        }

        document.removeEventListener('keydown', onSpaceSnap)

        // Play shutter sound
        if (env !== 'mocha' && cameraShutterSound) {
          cameraShutterSound()
        }

        // Compute distance from current geometry
        const spotY = calculateSpotY(
          circleX,
          crossX,
          crossY,
          ppi,
          blindspotEccXDeg,
          blindspotEccYDeg,
        )

        // Calculate the actual spot position (shared border between red and green squares)
        // This is the position we'll save in calibration JSON as spotXYPx
        const rPx = calculateSpotRadiusPx(
          spotDeg,
          ppi,
          blindspotEccXDeg,
          circleX,
          crossX,
        )
        const spotXYPx = calculateSpotXYPx(
          circleX,
          spotY,
          currentEdge,
          crossX,
          rPx * 2,
        )

        // IMPORTANT: Calculate fixationToSpot using the shared border (spotXYPx)
        // Note: circleX now represents the edge directly, so spotXYPx[0] === circleX
        const fixationToSpotPx = Math.hypot(
          spotXYPx[0] - crossX,
          spotXYPx[1] - crossY,
        )
        const fixationToSpotCm = fixationToSpotPx / pxPerCm

        // Collect Face Mesh samples (5)
        const samples = []
        const meshPoints = []
        for (let k = 0; k < 5; k++) {
          try {
            const pxDist = await measureIntraocularDistancePx(
              RC,
              options.calibrateTrackDistancePupil,
              meshPoints,
            )
            samples.push(pxDist && !isNaN(pxDist) ? pxDist : NaN)
          } catch (e) {
            samples.push(NaN)
          }
          await new Promise(r => setTimeout(r, 100))
        }
        const valid = samples.filter(s => !isNaN(s))
        const avgIPD = valid.length
          ? valid.reduce((a, b) => a + b, 0) / valid.length
          : 0

        // Check basic validity: face present and range
        // const range = options.calibrateTrackDistanceAllowedRangeCm || [30, 70]
        // const inRange = eyeToCameraCm >= range[0] && eyeToCameraCm <= range[1]
        const faceOk = valid.length >= 3 && avgIPD > 0
        // console.log('faceOK', faceOk, 'inRange', inRange)
        if (!faceOk) {
          // Retry same page
          const captured = captureVideoFrame(RC)

          // Temporarily remove the space key listener to prevent interference
          document.removeEventListener('keydown', onSpaceSnap)

          await Swal.fire({
            ...swalInfoOptions(RC, { showIcon: false }),
            title: phrases.RC_FaceBlocked ? phrases.RC_FaceBlocked[RC.L] : '',
            html: captured
              ? `<div style="text-align:center"><img src="${captured}" style="max-width:300px;max-height:400px;border:2px solid #ccc;border-radius:8px;"/><p style="margin-top:10px;font-size:0.8em;color:#666;">${phrases.RC_FaceImageNotSaved ? phrases.RC_FaceImageNotSaved[RC.L] : ''}</p></div>`
              : undefined,
            showConfirmButton: true,
            allowEnterKey: false,
            didOpen: () => {
              // Handle keyboard events - only allow Enter/Return, prevent Space
              const keydownListener = event => {
                if (event.key === ' ') {
                  event.preventDefault()
                  event.stopPropagation()
                  return
                }
                if (event.key === 'Enter' || event.key === 'Return') {
                  Swal.clickConfirm()
                }
              }
              document.addEventListener('keydown', keydownListener, true)
              RC.popupKeydownListener = keydownListener
            },
            willClose: () => {
              // Remove keyboard event listener
              if (RC.popupKeydownListener) {
                document.removeEventListener(
                  'keydown',
                  RC.popupKeydownListener,
                  true,
                )
                RC.popupKeydownListener = null
              }
              // Re-add the space key listener after popup closes
              document.addEventListener('keydown', onSpaceSnap)
            },
          })
          return
        }

        try {
          const eccDeg = Math.sqrt(
            options.calibrateTrackDistanceSpotXYDeg[0] ** 2 +
              options.calibrateTrackDistanceSpotXYDeg[1] ** 2,
          )
          const { nearestPointsData, currentIPDDistance } =
            await processMeshDataAndCalculateNearestPoints(
              RC,
              options,
              meshPoints,
              0,
              ppi,
              0,
              0,
              'blindspot',
              side === 'right' ? 1 : 2,
              [crossX, crossY], // fixPoint - fixation cross position
              spotXYPx, // spotPoint - MUST be shared border, not red center
              eccDeg,
              fixationToSpotCm,
              avgIPD,
              options.calibrateTrackDistanceChecking,
            )

          // Calculate additional distances for new JSON fields
          // These are 3D distances from eye to points on screen (using Pythagorean theorem)
          // nearestXYPx = foot of perpendicular from eye to screen (2D on-screen position)
          // nearestDistanceCm = perpendicular distance from eye to screen

          // Distance on screen from eye foot to fixation (2D)
          const footToFixationPx = Math.hypot(
            nearestPointsData.nearestXYPx[0] - crossX,
            nearestPointsData.nearestXYPx[1] - crossY,
          )
          const footToFixationCm = footToFixationPx / pxPerCm
          // 3D distance from eye to fixation = √(perpendicular² + on-screen²)
          const eyesToFixationCm = Math.sqrt(
            nearestPointsData.nearestDistanceCm ** 2 + footToFixationCm ** 2,
          )

          // Distance on screen from eye foot to spot (2D)
          const footToSpotPx = Math.hypot(
            nearestPointsData.nearestXYPx[0] - spotXYPx[0],
            nearestPointsData.nearestXYPx[1] - spotXYPx[1],
          )
          const footToSpotCm = footToSpotPx / pxPerCm
          // 3D distance from eye to spot = √(perpendicular² + on-screen²)
          const eyesToSpotCm = Math.sqrt(
            nearestPointsData.nearestDistanceCm ** 2 + footToSpotCm ** 2,
          )

          const measurement = createMeasurementObject(
            `${side}-eye-${edge}-edge`, // e.g., 'right-eye-near-edge'
            nearestPointsData.distanceCm,
            nearestPointsData.calibrationFactor,
            nearestPointsData,
            currentIPDDistance,
            avgIPD,
          )

          // Add new fields to measurement
          measurement.spotXYPx = spotXYPx
          measurement.fixationXYPx = [crossX, crossY]
          measurement.spotToFixationCm = fixationToSpotCm
          measurement.eyesToFixationCm = eyesToFixationCm
          measurement.eyesToSpotCm = eyesToSpotCm
          measurement.calibrateTrackDistanceSpotXYDeg =
            options.calibrateTrackDistanceSpotXYDeg

          saveCalibrationMeasurements(RC, 'blindspot', [measurement], spotDeg)
          const snapshot = {
            eye: side,
            edge: edge,
            distanceCm: nearestPointsData.distanceCm,
            avgIPD,
            calibrationFactor: nearestPointsData.calibrationFactor,
            samples,
            spotXYPx, // Include the spot position (shared border)
            fixationXYPx: [crossX, crossY], // ADDED: Save actual fixation position
          }
          resolve(snapshot)
        } catch (e) {
          try {
            await Swal.fire({
              ...swalInfoOptions(RC, { showIcon: false }),
              icon: undefined,
              title: '',
              html:
                (e && e.message ? e.message : String(e || 'Unknown error')) +
                '<br/><small>Please try again. The calibration will restart from the first eye.</small>',
              allowEnterKey: true,
            })
          } catch (_) {}
          reject(e)
        }
      }
      document.addEventListener('keydown', onSpaceSnap)
    })
  }

  // 4-page sequence: right-near, right-far, left-near, left-far
  // Restart from beginning if any page fails
  while (true) {
    try {
      rightNearSnapshot = await doEdgeSnapshot('right', 'near')
      // Initialize far edge based on near edge eccentricity
      // Pass spot position, distance, AND actual fixation position for accurate calculation
      rightFarSnapshot = await doEdgeSnapshot(
        'right',
        'far',
        rightNearSnapshot.spotXYPx,
        rightNearSnapshot.distanceCm,
        rightNearSnapshot.fixationXYPx, // ADDED: Pass actual fixation position
      )
      leftNearSnapshot = await doEdgeSnapshot('left', 'near')
      // Initialize far edge based on near edge eccentricity
      leftFarSnapshot = await doEdgeSnapshot(
        'left',
        'far',
        leftNearSnapshot.spotXYPx,
        leftNearSnapshot.distanceCm,
        leftNearSnapshot.fixationXYPx, // ADDED: Pass actual fixation position
      )
      break
    } catch (e) {
      // Restart sequence from the first page
      console.log('Error during edge snapshot, restarting:', e)
      continue
    }
  }

  // Calculate geometric mean factor for each eye (from near and far edges)
  const rightEyeFactor = Math.sqrt(
    rightNearSnapshot.calibrationFactor * rightFarSnapshot.calibrationFactor,
  )
  const leftEyeFactor = Math.sqrt(
    leftNearSnapshot.calibrationFactor * leftFarSnapshot.calibrationFactor,
  )

  console.log('=== Per-Eye Geometric Mean Factors ===')
  console.log('Right near factor:', rightNearSnapshot.calibrationFactor)
  console.log('Right far factor:', rightFarSnapshot.calibrationFactor)
  console.log('Right eye geometric mean:', rightEyeFactor)
  console.log('Left near factor:', leftNearSnapshot.calibrationFactor)
  console.log('Left far factor:', leftFarSnapshot.calibrationFactor)
  console.log('Left eye geometric mean:', leftEyeFactor)

  // Tolerance between factors from two eyes (using geometric means)
  const maxRatio = Math.max(
    rightEyeFactor / leftEyeFactor,
    leftEyeFactor / rightEyeFactor,
  )
  const maxAllowedRatio = Math.max(
    options.calibrateTrackDistanceAllowedRatio || 1.1,
    1 / (options.calibrateTrackDistanceAllowedRatio || 1.1),
  )

  const min = Math.min(
    rightNearSnapshot.distanceCm,
    rightFarSnapshot.distanceCm,
    leftNearSnapshot.distanceCm,
    leftFarSnapshot.distanceCm,
  )
  const max = Math.max(
    rightNearSnapshot.distanceCm,
    rightFarSnapshot.distanceCm,
    leftNearSnapshot.distanceCm,
    leftFarSnapshot.distanceCm,
  )
  const RMin = Array.isArray(options.calibrateTrackDistanceAllowedRangeCm)
    ? options.calibrateTrackDistanceAllowedRangeCm[0]
    : -Infinity
  const RMax = Array.isArray(options.calibrateTrackDistanceAllowedRangeCm)
    ? options.calibrateTrackDistanceAllowedRangeCm[1]
    : Infinity

  if (min < RMin || max > RMax) {
    const displayMessage = phrases.RC_viewingExceededRange[RC.L]
      .replace('[[N11]]', Math.round(min))
      .replace('[[N22]]', Math.round(max))
      .replace('[[N33]]', Math.round(RMin))
      .replace('[[N44]]', Math.round(RMax))
    await Swal.fire({
      ...swalInfoOptions(RC, { showIcon: false }),
      html: displayMessage
        ? displayMessage
        : 'Calibration not consistent. Please retry.',
    })
    // Restart full calibration
    cleanup(false)
    return await blindSpotTestNew(RC, options, toTrackDistance, callback)
  } else if (maxRatio > maxAllowedRatio) {
    const ratioText = maxRatio.toFixed(2)
    const displayMessage = phrases.RC_viewingBlindSpotRejected[RC.L]
      .replace('[[N11]]', ratioText)
      .replace('[[N22]]', '')
    await Swal.fire({
      ...swalInfoOptions(RC, { showIcon: false }),
      html: displayMessage
        ? displayMessage
        : 'Calibration not consistent. Please retry.',
    })
    // Restart full calibration
    cleanup(false)
    return await blindSpotTestNew(RC, options, toTrackDistance, callback)
  }

  // Success → finalize data
  const allValid = [
    ...rightNearSnapshot.samples.filter(s => !isNaN(s)),
    ...rightFarSnapshot.samples.filter(s => !isNaN(s)),
    ...leftNearSnapshot.samples.filter(s => !isNaN(s)),
    ...leftFarSnapshot.samples.filter(s => !isNaN(s)),
  ]
  const averageFaceMesh = allValid.length
    ? allValid.reduce((a, b) => a + b, 0) / allValid.length
    : 0
  const eyeToCameraCmMedian = median([
    rightNearSnapshot.distanceCm,
    rightFarSnapshot.distanceCm,
    leftNearSnapshot.distanceCm,
    leftFarSnapshot.distanceCm,
  ])
  // Overall calibration factor: geometric mean of left and right eye factors
  const calibrationFactor = Math.round(
    Math.sqrt(rightEyeFactor * leftEyeFactor),
  )

  const data = {
    value: toFixedNumber(eyeToCameraCmMedian, options.decimalPlace || 1),
    timestamp: performance.now(),
    method: RC._CONST.VIEW_METHOD.B,
    calibrationFactor,
    averageFaceMesh,
    // Store all 4 edge measurements
    faceMeshSamplesRightNear: rightNearSnapshot.samples,
    faceMeshSamplesRightFar: rightFarSnapshot.samples,
    faceMeshSamplesLeftNear: leftNearSnapshot.samples,
    faceMeshSamplesLeftFar: leftFarSnapshot.samples,
    // Store per-eye geometric mean factors
    rightEyeFactor,
    leftEyeFactor,
  }

  RC.newViewingDistanceData = data

  // Cleanup and callbacks
  cleanup(false)
  if (options.calibrateTrackDistanceCheckBool)
    await RC._checkDistance(
      callback,
      data,
      toTrackDistance ? 'trackDistance' : 'measureDistance',
      options.checkCallback,
      options.calibrateTrackDistanceCheckCm,
      options.callbackStatic,
      options.calibrateTrackDistanceCheckSecs,
      options.calibrateTrackDistanceCheckLengthCm,
      options.calibrateTrackDistanceCenterYourEyesBool,
      options.calibrateTrackDistancePupil,
      options.calibrateTrackDistanceChecking,
      options.calibrateTrackDistanceSpotXYDeg,
      options.calibrateTrackDistance,
    )
  else safeExecuteFunc(callback, data)

  function cleanup(endTracking = true) {
    inTest = false
    resizeObserver.unobserve(RC.background)
    document.removeEventListener('keydown', keyHandler)
    const blindOverlay = document.getElementById('blindspot-wrapper')
    if (blindOverlay && blindOverlay.parentNode) {
      try {
        blindOverlay.parentNode.removeChild(blindOverlay)
      } catch (e) {}
    }

    // Clean up help message
    if (helpMessageElement && helpMessageElement.parentNode) {
      try {
        helpMessageElement.parentNode.removeChild(helpMessageElement)
      } catch (e) {}
      helpMessageElement = null
    }

    RC._removeBackground()
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
    if (!RC._trackingSetupFinishedStatus.distance && endTracking) {
      RC._trackingSetupFinishedStatus.distance = true
      if (RC.gazeTracker.checkInitialized('distance', false)) RC.endDistance()
    }
  }
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
  await blindSpotTestNew(this, options, false, callback)
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

export function _getEyeToCameraCm(
  fixationToSpotCm,
  calibrateTrackDistanceSpotXYDeg,
) {
  const eccDeg = Math.sqrt(
    calibrateTrackDistanceSpotXYDeg[0] ** 2 +
      calibrateTrackDistanceSpotXYDeg[1] ** 2,
  )
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

  // ===================== UNIT SELECTION STATE =====================
  let selectedUnit = 'inches' // Default to inches

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

  // For horizontal tape near bottom of screen
  // Position tape horizontally, leaving room for arrow/dimensions below
  const bottomMarginPx = 80 // Space for arrow and dimensions below tape
  const tapeYPosition = screenHeight - bottomMarginPx

  // Initial ruler length (can be adjusted)
  let rulerLength = Math.min(screenWidth, screenHeight) * 0.6

  const oneCMInPx = pxPerMm * 10
  //one cm on left and right of the tape

  // Set initial left endpoint (left side with margin)
  const leftMarginPx = oneCMInPx
  let startX = leftMarginPx
  let startY = tapeYPosition

  // Set initial right endpoint (2/3 of screen width)
  const initialRulerLengthPx = screenWidth - oneCMInPx * 2
  let endX = leftMarginPx + initialRulerLengthPx
  let endY = tapeYPosition

  // --- Create the main overlay container ---
  const container = document.createElement('div')
  container.style.position = 'fixed' // Change to fixed to cover entire viewport
  container.style.top = '0'
  container.style.left = '0'
  container.style.width = '100vw'
  container.style.height = '100vh'
  container.style.userSelect = 'none'
  container.style.overflow = 'hidden' // Prevent scrolling

  // --- TITLE AND UNIT SELECTION ROW ---
  // Create a flex container to hold title and radio buttons side by side
  const titleRow = document.createElement('div')
  titleRow.style.display = 'flex'
  titleRow.style.alignItems = 'baseline'
  titleRow.style.gap = `${pxPerMm * 10}px` // 1 cm gap
  titleRow.style.paddingInlineStart = '3rem'
  titleRow.style.margin = '2rem 0 5rem 0'
  titleRow.style.position = 'relative'
  container.appendChild(titleRow)

  // --- TITLE  ---
  const title = document.createElement('h1')
  title.innerText = phrases.RC_SetViewingDistance[RC.L]
  title.style.whiteSpace = 'pre-line'
  title.style.textAlign = 'start'
  title.style.margin = '0' // Remove default margin
  title.dir = RC.LD.toLowerCase()
  titleRow.appendChild(title)

  // --- UNIT SELECTION RADIO BUTTONS (FOR PAGE 2) ---
  const unitRadioContainer = document.createElement('div')
  unitRadioContainer.style.display = 'none' // Hidden by default, shown on page 2
  unitRadioContainer.style.flexDirection = 'row'
  unitRadioContainer.style.gap = '1em'
  unitRadioContainer.style.alignItems = 'center'
  titleRow.appendChild(unitRadioContainer)

  // Create radio buttons for inches and cm in a horizontal layout
  const unitOptions = [
    { value: 'inches', label: phrases.RC_inches[RC.L] },
    { value: 'cm', label: phrases.RC_cm[RC.L] },
  ]

  unitOptions.forEach((option, index) => {
    const optionContainer = document.createElement('div')
    optionContainer.style.display = 'flex'
    optionContainer.style.alignItems = 'center'
    optionContainer.style.gap = '0.4em'
    optionContainer.style.cursor = 'pointer'

    const radio = document.createElement('input')
    radio.type = 'radio'
    radio.name = 'unitSelection'
    radio.value = option.value
    radio.id = `unit-${option.value}`
    radio.style.cursor = 'pointer'
    radio.style.margin = '0'
    radio.style.padding = '0'
    radio.style.width = '16px'
    radio.style.height = '16px'
    radio.checked = option.value === selectedUnit // Default to inches
    radio.tabIndex = -1 // Disable tab navigation

    // Update selectedUnit when radio button changes
    radio.addEventListener('change', () => {
      if (radio.checked) {
        selectedUnit = option.value
        updateDiagonalLabels() // Refresh the display
      }
    })

    // Prevent arrow key navigation
    radio.addEventListener('keydown', e => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault()
      }
    })

    const label = document.createElement('label')
    label.htmlFor = `unit-${option.value}`
    label.textContent = option.label
    label.style.fontSize = 'clamp(0.9em, 2vw, 1.1em)'
    label.style.fontWeight = '500'
    label.style.cursor = 'pointer'
    label.style.userSelect = 'none'
    label.style.margin = '0'
    label.style.lineHeight = '1'
    label.style.display = 'flex'
    label.style.alignItems = 'center'

    optionContainer.appendChild(radio)
    optionContainer.appendChild(label)

    // Make the whole container clickable
    optionContainer.addEventListener('click', e => {
      if (e.target !== radio) {
        radio.checked = true
        radio.dispatchEvent(new Event('change'))
      }
    })

    unitRadioContainer.appendChild(optionContainer)
  })

  // --- INSTRUCTIONS CONTAINER (holds both columns) ---
  const instructionsContainer = document.createElement('div')
  instructionsContainer.style.display = 'flex'
  instructionsContainer.style.flexDirection = 'row'
  instructionsContainer.style.width = '100%'
  instructionsContainer.style.gap = '0'
  instructionsContainer.style.margin = '2rem 0 5rem 0'
  instructionsContainer.style.position = 'relative'
  instructionsContainer.style.zIndex = '3'
  container.appendChild(instructionsContainer)

  // --- LEFT/RIGHT COLUMN (instructions) ---
  const instructions = document.createElement('div')
  instructions.style.width = '50%'
  instructions.style.maxWidth = '50%'
  instructions.style.paddingInlineStart = '3rem'
  instructions.style.paddingInlineEnd = '1rem'
  instructions.style.textAlign = 'start'
  instructions.style.whiteSpace = 'pre-line'
  instructions.style.fontSize = 'clamp(1.1em, 2.5vw, 1.4em)'
  instructions.style.lineHeight = '1.4'
  instructionsContainer.appendChild(instructions)

  // --- RIGHT/LEFT COLUMN (dontUseRuler placeholder) ---
  const dontUseRulerColumn = document.createElement('div')
  dontUseRulerColumn.id = 'dont-use-ruler-column'
  dontUseRulerColumn.style.width = '50%'
  dontUseRulerColumn.style.maxWidth = '50%'
  dontUseRulerColumn.style.paddingInlineStart = '1rem'
  dontUseRulerColumn.style.paddingInlineEnd = '3rem'
  dontUseRulerColumn.style.textAlign = 'start'
  dontUseRulerColumn.style.whiteSpace = 'pre-line'
  dontUseRulerColumn.style.fontSize = '16pt'
  dontUseRulerColumn.style.lineHeight = '1.4'
  dontUseRulerColumn.style.display = 'none' // Hidden by default
  instructionsContainer.appendChild(dontUseRulerColumn)

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

  // ===================== HORIZONTAL TAPE MEASUREMENT COMPONENT =====================

  // Create a horizontal tape component that groups all elements
  const createDiagonalTapeComponent = () => {
    // Calculate dimensions
    const tapeWidth = Math.round(0.75 * ppi) // 3/4 inch width for horizontal tape
    const lineThickness = 3 // px thickness for all lines
    const handleHotspotWidth = Math.round(ppi / 4) // 1" wide hotspot for easier grabbing

    // Helper function to calculate distance between two points
    const getDistance = (x1, y1, x2, y2) =>
      Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)

    // Helper function to calculate angle between two points
    const getAngle = (x1, y1, x2, y2) =>
      Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI)

    // Create main tape container (covers the diagonal area)
    const tapeContainer = document.createElement('div')
    tapeContainer.id = 'diagonal-tape-measurement-component'
    //add rc-lang-ltr (always ltr)
    tapeContainer.className += ' rc-lang-ltr'
    tapeContainer.style.position = 'absolute'
    tapeContainer.style.left = '0px'
    tapeContainer.style.top = '0px'
    tapeContainer.style.width = '100vw'
    tapeContainer.style.height = '100vh'
    tapeContainer.style.pointerEvents = 'none' // Allow clicks to pass through to individual elements
    tapeContainer.style.zIndex = '10'

    // Main horizontal tape (yellow background with black border)
    const diagonalTape = document.createElement('div')
    diagonalTape.style.position = 'absolute'
    diagonalTape.style.background = 'rgba(255, 221, 51, 0.95)'
    diagonalTape.style.border = '2px solid rgb(0, 0, 0)'
    diagonalTape.style.borderRadius = '2px'
    diagonalTape.style.zIndex = '1'
    diagonalTape.style.transformOrigin = 'left center'
    tapeContainer.appendChild(diagonalTape)

    // Left handle (wider hotspot for easier clicking)
    const leftHandle = document.createElement('div')
    leftHandle.style.position = 'absolute'
    leftHandle.style.width = `${handleHotspotWidth}px`
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
    
    // Visual line for left handle (thin, centered within hotspot)
    const leftVisualLine = document.createElement('div')
    leftVisualLine.style.position = 'absolute'
    leftVisualLine.style.width = `${lineThickness}px`
    leftVisualLine.style.height = `${tapeWidth}px`
    leftVisualLine.style.background = 'transparent'
    leftVisualLine.style.borderRadius = '1px'
    leftVisualLine.style.boxShadow = 'none'
    leftVisualLine.style.left = '50%'
    leftVisualLine.style.top = '50%'
    leftVisualLine.style.transform = 'translate(-50%, -50%)'
    leftVisualLine.style.pointerEvents = 'none'
    leftVisualLine.style.zIndex = '4'
    leftHandle.appendChild(leftVisualLine)

    // Right handle (wider hotspot for easier clicking)
    const rightHandle = document.createElement('div')
    rightHandle.style.position = 'absolute'
    rightHandle.style.width = `${handleHotspotWidth}px`
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
    
    // Visual line for right handle (thin, centered within hotspot)
    const rightVisualLine = document.createElement('div')
    rightVisualLine.style.position = 'absolute'
    rightVisualLine.style.width = `${lineThickness}px`
    rightVisualLine.style.height = `${tapeWidth}px`
    rightVisualLine.style.background = 'transparent'
    rightVisualLine.style.borderRadius = '1px'
    rightVisualLine.style.boxShadow = 'none'
    rightVisualLine.style.left = '50%'
    rightVisualLine.style.top = '50%'
    rightVisualLine.style.transform = 'translate(-50%, -50%)'
    rightVisualLine.style.pointerEvents = 'none'
    rightVisualLine.style.zIndex = '4'
    rightHandle.appendChild(rightVisualLine)

    // Dynamic length label (centered on tape)
    const dynamicLengthLabel = document.createElement('div')
    dynamicLengthLabel.style.position = 'absolute'
    dynamicLengthLabel.style.color = 'rgb(0, 0, 0)'
    dynamicLengthLabel.style.fontWeight = 'bold'
    dynamicLengthLabel.style.fontSize = '1.4rem'
    dynamicLengthLabel.style.background = '#eee'
    dynamicLengthLabel.style.padding = '2px 6px'
    dynamicLengthLabel.style.whiteSpace = 'nowrap'
    dynamicLengthLabel.style.zIndex = '20'
    dynamicLengthLabel.style.transform = 'translate(-50%, -50%)'
    tapeContainer.appendChild(dynamicLengthLabel)

    // Container for ruler markings (tick marks and numbers)
    const rulerMarkingsContainer = document.createElement('div')
    rulerMarkingsContainer.style.position = 'absolute'
    rulerMarkingsContainer.style.zIndex = '17'
    rulerMarkingsContainer.style.pointerEvents = 'none'
    tapeContainer.appendChild(rulerMarkingsContainer)

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
        leftVisualLine,
        rightVisualLine,
        dynamicLengthLabel,
        rulerMarkingsContainer,
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

  // Function to update horizontal tape on window resize (same pattern as checkDistance.js)
  function updateDiagonalTapeOnResize() {
    // Store proportional positions (as ratios of screen width)
    const currentStartProportionX = startX / screenWidth
    const currentEndProportionX = endX / screenWidth

    // Update screen dimensions
    screenWidth = window.innerWidth
    screenHeight = window.innerHeight

    // Recalculate Y position (maintain distance from bottom)
    const newTapeYPosition = screenHeight - bottomMarginPx

    // Maintain proportional X positions
    startX = currentStartProportionX * screenWidth
    startY = newTapeYPosition
    endX = currentEndProportionX * screenWidth
    endY = newTapeYPosition

    // Update tape
    updateDiagonalLabels()
  }

  // Add window resize event listener (same as checkDistance.js)
  window.addEventListener('resize', updateDiagonalTapeOnResize)

  // ===================== TRIANGULAR TEXT BOXES FOR TAPE ENDS =====================

  // Create text box function with wrapping to fit on screen
  const createSimpleTextBox = (text, isLeft = true) => {
    // Container for the text box
    const textContainer = document.createElement('div')
    textContainer.style.position = 'absolute'
    textContainer.style.zIndex = '15'

    // Use a square-ish max width for wrapping
    const maxWidth = 150 // Max width in pixels for wrapping

    // Create simple rectangular container that wraps text
    const textBox = document.createElement('div')
    textBox.style.position = 'relative'
    textBox.style.maxWidth = `${maxWidth}px`
    textBox.style.background = 'transparent'
    textBox.style.border = 'none'
    textBox.style.display = 'flex'
    textBox.style.alignItems = 'center'
    textBox.style.justifyContent = 'center'
    textBox.style.padding = '0px'

    // Text element with wrapping enabled
    const textElement = document.createElement('div')
    textElement.innerText = text
    textElement.style.color = 'rgb(0, 0, 0)'
    textElement.style.fontWeight = 'normal'
    textElement.style.fontSize = '1.2em'
    textElement.style.textAlign = isLeft ? 'left' : 'right'
    textElement.style.lineHeight = '1.2'
    textElement.style.whiteSpace = 'normal' // Allow wrapping
    textElement.style.wordWrap = 'break-word'
    textElement.style.textShadow = '1px 1px 2px rgba(255, 255, 255, 0.8)'
    textBox.appendChild(textElement)

    textContainer.appendChild(textBox)

    // Function to update text
    const updateText = newText => {
      // Update text
      textElement.innerText = newText

      // Get actual dimensions after text is set (needed for positioning)
      // Use setTimeout to allow DOM to update
      setTimeout(() => {
        const rect = textBox.getBoundingClientRect()
        textContainer.dimensions = {
          width: rect.width,
          height: rect.height,
        }
        // Trigger a position update with new dimensions
        if (typeof updateDiagonalLabels === 'function') {
          updateDiagonalLabels()
        }
      }, 0)

      return maxWidth
    }

    // Set initial dimensions
    setTimeout(() => {
      const rect = textBox.getBoundingClientRect()
      textContainer.dimensions = {
        width: rect.width,
        height: rect.height,
      }
    }, 0)

    return {
      container: textContainer,
      textElement: textElement,
      updateText: updateText,
      dimensions: { width: maxWidth, height: 50 }, // Initial estimate
    }
  }

  // Left simple text box
  const leftLabel = createSimpleTextBox(phrases.RC_LeftEdge[RC.L], true)
  container.appendChild(leftLabel.container)

  // Right simple text box
  const rightLabel = createSimpleTextBox(phrases.RC_RightEdge[RC.L], false)
  rightLabel.container.id = 'right-line-label'
  container.appendChild(rightLabel.container)

  // Update label dimensions after they're in the DOM
  setTimeout(() => {
    const leftRect = leftLabel.container
      .querySelector('div')
      .getBoundingClientRect()
    leftLabel.dimensions = {
      width: leftRect.width,
      height: leftRect.height,
    }
    const rightRect = rightLabel.container
      .querySelector('div')
      .getBoundingClientRect()
    rightLabel.dimensions = {
      width: rightRect.width,
      height: rightRect.height,
    }
    // Trigger a position update with correct dimensions
    updateDiagonalLabels()
  }, 10)

  // ===================== HORIZONTAL TAPE MANAGEMENT FUNCTIONS =====================

  // Function to update horizontal tape size and position
  const updateDiagonalTapeComponent = () => {
    // Calculate distance (horizontal distance between endpoints)
    const distance = Math.abs(endX - startX)

    // Update horizontal tape
    tape.elements.diagonalTape.style.left = `${startX}px`
    tape.elements.diagonalTape.style.top = `${startY - tape.dimensions.tapeWidth / 2}px`
    tape.elements.diagonalTape.style.width = `${distance}px`
    tape.elements.diagonalTape.style.height = `${tape.dimensions.tapeWidth}px`
    tape.elements.diagonalTape.style.transform = 'rotate(0deg)' // Horizontal

    // Update handle positions (horizontal alignment)
    tape.elements.leftHandle.style.left = `${startX}px`
    tape.elements.leftHandle.style.top = `${startY}px`
    tape.elements.leftHandle.style.transform =
      'translate(-50%, -50%) rotate(0deg)'
    tape.elements.rightHandle.style.left = `${endX}px`
    tape.elements.rightHandle.style.top = `${endY}px`
    tape.elements.rightHandle.style.transform =
      'translate(-50%, -50%) rotate(0deg)'

    // Update dynamic length label (centered on VISIBLE part of tape)
    const objectLengthPx = distance
    const objectLengthMm = objectLengthPx / pxPerMm
    const objectLengthCm = objectLengthMm / 10
    const objectLengthInches = objectLengthCm / 2.54

    // Calculate visible portion of tape (constrained to screen bounds)
    const visibleStartX = Math.max(0, startX)
    const visibleEndX = Math.min(screenWidth, endX)
    const visibleCenterX = (visibleStartX + visibleEndX) / 2
    const visibleCenterY = startY + tape.dimensions.tapeWidth / 2 + 15 // Y is constant for horizontal tape

    tape.elements.dynamicLengthLabel.style.left = `${visibleCenterX}px`
    tape.elements.dynamicLengthLabel.style.top = `${visibleCenterY}px`

    // Display length in selected unit
    if (selectedUnit === 'inches') {
      tape.elements.dynamicLengthLabel.innerText = `${objectLengthInches.toFixed(1)}`
    } else {
      tape.elements.dynamicLengthLabel.innerText = `${objectLengthCm.toFixed(1)}`
    }

    // Auto-scale font if needed (using reduced base size)
    const estimatedLabelWidth =
      tape.elements.dynamicLengthLabel.innerText.length * 10 + 12
    const visibleDistance = visibleEndX - visibleStartX
    if (estimatedLabelWidth > visibleDistance * 0.4) {
      const scaleFactor = (visibleDistance * 0.4) / estimatedLabelWidth
      const newFontSize = Math.max(0.5, scaleFactor) * 1.0 // Reduced by factor of 1.4
      tape.elements.dynamicLengthLabel.style.fontSize = `${newFontSize}rem`
    } else {
      tape.elements.dynamicLengthLabel.style.fontSize = '1.0rem' // Reduced by factor of 1.4
    }

    // Update double-sided arrow (positioned below the horizontal tape)
    const arrowLength = distance // Arrow spans the full ruler length

    // Position arrow below the tape (outside the tape, in the margin space)
    // Move it further below to accommodate the larger tick numbers and be clearly separate
    const arrowOffsetBelow = tape.dimensions.tapeWidth / 2 + 15 // Below tape edge plus gap

    const arrowStartX = startX
    const arrowStartY = startY + arrowOffsetBelow

    // Position and rotate main arrow line (horizontal - angle is 0)
    tape.elements.arrowLine.style.left = `${arrowStartX}px`
    tape.elements.arrowLine.style.top = `${arrowStartY}px`
    tape.elements.arrowLine.style.width = `${arrowLength}px`
    tape.elements.arrowLine.style.transform = 'rotate(0deg)' // Horizontal

    // Left arrowhead tip anchored at left edge (pointing left)
    const leftTipX = arrowStartX
    const leftTipY = arrowStartY
    tape.elements.leftArrowLine1.style.left = `${leftTipX}px`
    tape.elements.leftArrowLine1.style.top = `${leftTipY}px`
    tape.elements.leftArrowLine1.style.transform = 'rotate(-30deg)' // Upper leg of left arrow

    tape.elements.leftArrowLine2.style.left = `${leftTipX}px`
    tape.elements.leftArrowLine2.style.top = `${leftTipY}px`
    tape.elements.leftArrowLine2.style.transform = 'rotate(30deg)' // Lower leg of left arrow

    // Right arrowhead tip anchored at right edge (pointing right)
    const rightTipX = arrowStartX + arrowLength
    const rightTipY = arrowStartY
    tape.elements.rightArrowLine1.style.left = `${rightTipX}px`
    tape.elements.rightArrowLine1.style.top = `${rightTipY}px`
    tape.elements.rightArrowLine1.style.transform = 'rotate(150deg)' // Upper leg of right arrow
    tape.elements.rightArrowLine2.style.left = `${rightTipX}px`
    tape.elements.rightArrowLine2.style.top = `${rightTipY}px`
    tape.elements.rightArrowLine2.style.transform = 'rotate(-150deg)' // Lower leg of right arrow

    // Update ruler markings
    updateRulerMarkings()
  }

  // Function to update ruler markings (tick marks and numbers)
  const updateRulerMarkings = () => {
    // Clear existing markings
    tape.elements.rulerMarkingsContainer.innerHTML = ''

    const distance = tape.helpers.getDistance(startX, startY, endX, endY)
    const angle = tape.helpers.getAngle(startX, startY, endX, endY)

    // Calculate length in selected unit
    const objectLengthMm = distance / pxPerMm
    const objectLengthCm = objectLengthMm / 10
    const objectLengthInches = objectLengthCm / 2.54

    // Determine spacing and total marks
    let spacingInPx
    let numMarks

    if (selectedUnit === 'inches') {
      spacingInPx = pxPerMm * 25.4 // 1 inch in pixels
      numMarks = Math.ceil(objectLengthInches)
    } else {
      spacingInPx = pxPerMm * 10 // 1 cm in pixels
      numMarks = Math.ceil(objectLengthCm)
    }

    // Create tick marks and numbers
    for (let i = 1; i <= numMarks; i++) {
      const markPosition = i * spacingInPx
      if (markPosition > distance) break // Don't draw beyond the tape

      // Calculate position along the horizontal tape
      const markX = startX + markPosition
      const markY = startY // Same Y for all marks (horizontal tape)

      // Create tick mark on TOP edge (vertical, perpendicular to horizontal tape)
      const tickTop = document.createElement('div')
      tickTop.style.position = 'absolute'

      // Position tick mark to start at the top edge of the tape
      const tickLength = tape.dimensions.tapeWidth * 0.2 // 20% of tape width
      const upperEdgeOffset = tape.dimensions.tapeWidth / 2 // Distance from center to upper edge

      // Start position at upper edge (above the tape center)
      const tickStartX = markX
      const tickStartY = markY - upperEdgeOffset

      tickTop.style.left = `${tickStartX}px`
      tickTop.style.top = `${tickStartY}px`
      tickTop.style.width = '2px' // Thin vertical line
      tickTop.style.height = `${tickLength}px`
      tickTop.style.background = 'rgb(0, 0, 0)'
      tickTop.style.transformOrigin = 'center top' // Start from the top
      tickTop.style.transform = 'rotate(0deg)' // Vertical (no rotation needed)
      tape.elements.rulerMarkingsContainer.appendChild(tickTop)

      // Create tick mark on BOTTOM edge (mirror of top tick)
      const tickBottom = document.createElement('div')
      tickBottom.style.position = 'absolute'

      // Start position at lower edge (below the tape center)
      const tickBottomStartX = markX
      const tickBottomStartY = markY + upperEdgeOffset - tickLength

      tickBottom.style.left = `${tickBottomStartX}px`
      tickBottom.style.top = `${tickBottomStartY}px`
      tickBottom.style.width = '2px' // Thin vertical line
      tickBottom.style.height = `${tickLength}px`
      tickBottom.style.background = 'rgb(0, 0, 0)'
      tickBottom.style.transformOrigin = 'center top' // Start from the top (extends downward)
      tickBottom.style.transform = 'rotate(0deg)' // Vertical (no rotation needed)
      tape.elements.rulerMarkingsContainer.appendChild(tickBottom)

      // Create number label positioned vertically centered on the tape
      const label = document.createElement('div')
      label.style.position = 'absolute'

      // Position label at the center of the tape (vertically centered)
      label.style.left = `${markX}px`
      label.style.top = `${markY}px`
      label.textContent = i.toString()
      label.style.color = 'rgb(0, 0, 0)'
      label.style.fontSize = '1.8rem' // Doubled from 0.9rem for better visibility
      label.style.fontWeight = 'bold'
      label.style.whiteSpace = 'nowrap'
      label.style.userSelect = 'none'
      label.style.transform = 'translate(-50%, -50%)'

      tape.elements.rulerMarkingsContainer.appendChild(label)
    }
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

    // Update visual line colors (not the handles, which are transparent hotspots)
    tape.elements.leftVisualLine.style.background = color
    tape.elements.leftVisualLine.style.boxShadow = shadow
    tape.elements.rightVisualLine.style.background = color
    tape.elements.rightVisualLine.style.boxShadow = shadow

    // Update tape border color as well
    tape.elements.diagonalTape.style.borderColor = color

    // Update right label text and color (with dynamic resizing)
    rightLabel.textElement.style.color = color
    const newText = isShort
      ? phrases.RC_viewingDistanceObjectTooShort[RC.L]
      : phrases.RC_RightEdge[RC.L]

    // Only update text if it has actually changed (prevent unnecessary DOM updates)
    if (rightLabel.textElement.innerText !== newText) {
      rightLabel.updateText(newText)
    }
  }

  // Add hover effects to diagonal tape handles (apply to visual lines)
  tape.elements.leftHandle.addEventListener('mouseenter', () => {
    tape.elements.leftVisualLine.style.boxShadow = '0 0 12px rgba(0, 0, 0, 0.6)'
  })
  tape.elements.leftHandle.addEventListener('mouseleave', () => {
    updateDiagonalColors() // This will restore correct shadow
  })

  tape.elements.rightHandle.addEventListener('mouseenter', () => {
    tape.elements.rightVisualLine.style.boxShadow = '0 0 12px rgba(0, 0, 0, 0.6)'
  })
  tape.elements.rightHandle.addEventListener('mouseleave', () => {
    updateDiagonalColors() // This will restore correct shadow
  })

  // Function to update triangular labels when tape changes
  function updateDiagonalLabels() {
    // Check if left tape end is off-screen (left side can go negative)
    const leftOffScreen = startX < 0

    // Hide/show left label based on whether tip is off-screen
    if (leftOffScreen) {
      leftLabel.container.style.display = 'none'
    } else {
      leftLabel.container.style.display = 'block'

      // Position left label above left handle, aligned with left tip
      // Left edge of text box aligns with left tip of tape
      let leftX = startX
      let leftY =
        startY - leftLabel.dimensions.height - tape.dimensions.tapeWidth / 2

      // Constrain to screen bounds to prevent clipping
      const marginFromEdge = 10 // Minimum pixels from screen edge
      leftX = Math.max(
        marginFromEdge,
        Math.min(
          leftX,
          screenWidth - leftLabel.dimensions.width - marginFromEdge,
        ),
      )
      leftY = Math.max(marginFromEdge, leftY) // Keep above tape, but on screen

      leftLabel.container.style.left = `${leftX}px`
      leftLabel.container.style.top = `${leftY}px`
    }

    // Right label is always shown (right tip can't go off-screen)
    rightLabel.container.style.display = 'block'

    // Position right label above right handle, aligned with right tip
    // Right edge of text box aligns with right tip of tape
    let rightX = endX - rightLabel.dimensions.width
    let rightY =
      endY - rightLabel.dimensions.height - tape.dimensions.tapeWidth / 2

    // Constrain to screen bounds to prevent clipping
    const marginFromEdge = 10 // Minimum pixels from screen edge
    rightX = Math.max(
      marginFromEdge,
      Math.min(
        rightX,
        screenWidth - rightLabel.dimensions.width - marginFromEdge,
      ),
    )
    rightY = Math.max(marginFromEdge, rightY) // Keep above tape, but on screen

    rightLabel.container.style.left = `${rightX}px`
    rightLabel.container.style.top = `${rightY}px`

    updateDiagonalColors() // Update colors when handles move
    updateDiagonalTapeComponent() // Update tape size and content
  }

  // ===================== HORIZONTAL TAPE INTERACTION HANDLERS =====================

  // Dragging functionality for handles and tape body
  let leftDragging = false
  let rightDragging = false
  let bodyDragging = false
  let dragStartMouseX = 0
  let dragStartMouseY = 0
  let dragStartTapeStartX = 0
  let dragStartTapeStartY = 0
  let dragStartTapeEndX = 0
  let dragStartTapeEndY = 0

  tape.elements.leftHandle.addEventListener('mousedown', e => {
    leftDragging = true
    document.body.style.cursor = 'move'
    e.preventDefault()
    e.stopPropagation() // Prevent body drag
  })

  tape.elements.rightHandle.addEventListener('mousedown', e => {
    rightDragging = true
    document.body.style.cursor = 'move'
    e.preventDefault()
    e.stopPropagation() // Prevent body drag
  })

  // Add body dragging for the tape
  tape.elements.diagonalTape.style.pointerEvents = 'auto'
  tape.elements.diagonalTape.style.cursor = 'move'
  tape.elements.diagonalTape.addEventListener('mousedown', e => {
    bodyDragging = true
    dragStartMouseX = e.clientX
    dragStartMouseY = e.clientY
    dragStartTapeStartX = startX
    dragStartTapeStartY = startY
    dragStartTapeEndX = endX
    dragStartTapeEndY = endY
    document.body.style.cursor = 'move'
    e.preventDefault()
  })

  // Helper function to update ruler endpoints while maintaining horizontal alignment
  const updateRulerEndpoints = (
    newStartX,
    newStartY,
    newEndX,
    newEndY,
    allowStartOffScreen = false,
  ) => {
    // Keep Y coordinates fixed at tape position (horizontal tape)
    const tapeY = screenHeight - bottomMarginPx

    // Constrain end point to screen bounds (right end cannot leave screen)
    const constrainEndToScreen = x => {
      return Math.max(0, Math.min(screenWidth, x))
    }

    const constrainedEndX = constrainEndToScreen(newEndX)

    // Start point can go beyond screen if allowStartOffScreen is true
    let constrainedStartX
    if (allowStartOffScreen) {
      // Allow start to go off screen (can be negative for left edge)
      constrainedStartX = newStartX
    } else {
      // Constrain start to screen bounds
      constrainedStartX = constrainEndToScreen(newStartX)
    }

    // Calculate actual distance (even if start is off-screen)
    const distance = Math.abs(constrainedEndX - constrainedStartX)

    // Only apply minimum distance check if we're not allowing off-screen
    // This prevents the tape from "jumping" when the start goes off-screen
    if (!allowStartOffScreen && distance < 50) {
      // If too short, maintain current positions
      return
    }

    startX = constrainedStartX
    startY = tapeY
    endX = constrainedEndX
    endY = tapeY

    updateDiagonalLabels()
  }

  // Mouse move handler for horizontal tape handles and body
  window.addEventListener('mousemove', e => {
    if (leftDragging) {
      // Move left handle independently (allow it to go off screen)
      const mouseX = e.clientX
      const mouseY = e.clientY
      updateRulerEndpoints(mouseX, mouseY, endX, endY, true)
    } else if (rightDragging) {
      // Move right handle independently
      // If start is already off-screen, keep allowing it to stay off-screen
      const mouseX = e.clientX
      const mouseY = e.clientY
      const isStartOffScreen =
        startX < 0 ||
        startX > screenWidth ||
        startY < 0 ||
        startY > screenHeight
      updateRulerEndpoints(startX, startY, mouseX, mouseY, isStartOffScreen)
    } else if (bodyDragging) {
      // Move entire tape horizontally, maintaining length
      const deltaX = e.clientX - dragStartMouseX
      // Ignore Y movement - tape stays horizontal

      const newStartX = dragStartTapeStartX + deltaX
      const newEndX = dragStartTapeEndX + deltaX
      const tapeY = screenHeight - bottomMarginPx

      // Constrain end to screen bounds
      const constrainedEndX = Math.max(0, Math.min(screenWidth, newEndX))

      // If end would be constrained, calculate how much movement is actually allowed
      if (constrainedEndX !== newEndX) {
        // End hit a boundary - adjust both points to stop at the boundary
        const allowedDeltaX = constrainedEndX - dragStartTapeEndX
        const adjustedStartX = dragStartTapeStartX + allowedDeltaX
        const adjustedEndX = dragStartTapeEndX + allowedDeltaX

        updateRulerEndpoints(adjustedStartX, tapeY, adjustedEndX, tapeY, true)
      } else {
        // Normal movement - end is not constrained
        updateRulerEndpoints(newStartX, tapeY, newEndX, tapeY, true)
      }
    }
  })

  // Mouse up handler
  window.addEventListener('mouseup', () => {
    if (leftDragging || rightDragging || bodyDragging) {
      leftDragging = false
      rightDragging = false
      bodyDragging = false
      document.body.style.cursor = ''
    }
  })

  // ===================== KEYBOARD HANDLING FOR HORIZONTAL TAPE =====================
  let arrowKeyDown = false
  let arrowIntervalFunction = null
  let currentArrowKey = null
  // Dynamic step size variables
  let intervalCount = 0 // Track how many intervals have fired

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
    intervalCount = 0 // Reset counter for new key press

    // Clear any existing interval
    if (arrowIntervalFunction) {
      clearInterval(arrowIntervalFunction)
    }

    // Calculate dynamic step size based on whether key is being held
    const calculateStepSize = () => {
      // If held for more than 3 intervals (~150ms), switch to fast movement
      if (intervalCount > 3) {
        return 5 * pxPerMm // 5mm for held keys (fast approach)
      }
      return 0.5 * pxPerMm // 0.5mm for taps (precise adjustment)
    }

    // Start continuous movement (only affects right side horizontally)
    arrowIntervalFunction = setInterval(() => {
      intervalCount++
      const moveAmount = calculateStepSize()
      // Check if start is off-screen to preserve that state
      const isStartOffScreen = startX < 0 || startX > screenWidth
      const tapeY = screenHeight - bottomMarginPx

      if (currentArrowKey === 'ArrowLeft' || currentArrowKey === 'ArrowUp') {
        // Move right side closer to left (shrink from right)
        const newEndX = endX - moveAmount
        updateRulerEndpoints(startX, tapeY, newEndX, tapeY, isStartOffScreen)
      } else if (
        currentArrowKey === 'ArrowRight' ||
        currentArrowKey === 'ArrowDown'
      ) {
        // Move right side away from left (extend from right)
        const newEndX = endX + moveAmount
        updateRulerEndpoints(startX, tapeY, newEndX, tapeY, isStartOffScreen)
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

      // Hide diagonal tape component and remove labels from DOM
      tape.container.style.display = 'none'
      if (leftLabel.container.parentNode) {
        leftLabel.container.parentNode.removeChild(leftLabel.container)
      }
      if (rightLabel.container.parentNode) {
        rightLabel.container.parentNode.removeChild(rightLabel.container)
      }

      // Hide unit selection radio buttons on page 0
      unitRadioContainer.style.display = 'none'

      // // Show radio buttons on page 0
      // radioContainer.style.display = 'block'

      // Show PROCEED button on page 0
      proceedButton.style.display = 'block'

      // Hide explanation button on page 0
      explanationButton.style.display = 'none'

      // Update instructions
      instructions.innerText =
        phrases.RC_UseObjectToSetViewingDistancePage0q[RC.L]

      // Hide dontUseRuler column on page 0
      dontUseRulerColumn.style.display = 'none'
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

      // Hide diagonal tape component and remove labels from DOM
      tape.container.style.display = 'none'
      if (leftLabel.container.parentNode) {
        leftLabel.container.parentNode.removeChild(leftLabel.container)
      }
      if (rightLabel.container.parentNode) {
        rightLabel.container.parentNode.removeChild(rightLabel.container)
      }

      // Hide unit selection radio buttons on page 1
      unitRadioContainer.style.display = 'none'

      // Hide explanation button on page 1
      explanationButton.style.display = 'block' //show explanation button on page 1

      // // Hide radio buttons on page 1
      // radioContainer.style.display = 'none'

      // Show PROCEED button on page 1
      proceedButton.style.display = 'block'

      // Hide dontUseRuler column on page 1
      dontUseRulerColumn.style.display = 'none'

      // Update instructions
      instructions.innerText =
        phrases.RC_UseObjectToSetViewingDistancePage1[RC.L]
    } else if (pageNumber === 2) {
      // ===================== PAGE 2: DIAGONAL TAPE =====================
      console.log('=== SHOWING PAGE 2: DIAGONAL TAPE ===')

      // Hide video on page 2 (tape measurement)
      RC.showVideo(false)

      // Show diagonal tape component and add labels to DOM
      tape.container.style.display = 'block'

      // Re-add labels to container if not already present
      if (!leftLabel.container.parentNode) {
        container.appendChild(leftLabel.container)
      }
      leftLabel.container.style.display = 'block'

      if (!rightLabel.container.parentNode) {
        container.appendChild(rightLabel.container)
      }
      rightLabel.container.style.display = 'block'

      // Update label positions
      updateDiagonalLabels()

      // Show unit selection radio buttons on page 2
      unitRadioContainer.style.display = 'flex'

      // // Hide radio buttons on page 2
      // radioContainer.style.display = 'none'

      // Hide PROCEED button on page 2 - only allow space key
      proceedButton.style.display = 'none'

      // Hide explanation button on page 2
      explanationButton.style.display = 'block' //show explanation button on page 2

      // Show dontUseRuler column on page 2 if calibrateTrackDistanceCheckBool is true
      if (options.calibrateTrackDistanceCheckBool) {
        dontUseRulerColumn.style.display = 'block'
        dontUseRulerColumn.innerText = phrases.RC_DontUseYourRulerYet[RC.L]
        dontUseRulerColumn.style.color = '#8B0000' // Dark red ink
        dontUseRulerColumn.style.fontWeight = 'normal'
        dontUseRulerColumn.style.userSelect = 'none'
      }

      // Update all positions and colors after showing lines
      updateDiagonalLabels()

      // Update instructions with combined phrase
      const minCm = options.calibrateTrackDistanceObjectMinMaxCm[0]
      const maxCm = options.calibrateTrackDistanceObjectMinMaxCm[1]
      const minInch = minCm / 2.54
      const maxInch = maxCm / 2.54

      instructions.innerText = phrases[
        'RC_UseObjectToSetViewingDistancePage1&2NEW'
      ][RC.L]
        .replace('[[IN1]]', minInch.toFixed(0))
        .replace('[[IN2]]', maxInch.toFixed(0))
        .replace('[[CM1]]', minCm.toFixed(0))
        .replace('[[CM2]]', maxCm.toFixed(0))
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

      // Hide diagonal tape component and remove labels from DOM
      tape.container.style.display = 'none'
      if (leftLabel.container.parentNode) {
        leftLabel.container.parentNode.removeChild(leftLabel.container)
      }
      if (rightLabel.container.parentNode) {
        rightLabel.container.parentNode.removeChild(rightLabel.container)
      }

      // Hide unit selection radio buttons on page 3
      unitRadioContainer.style.display = 'none'

      // // Hide radio buttons on page 3
      // radioContainer.style.display = 'none'

      // Hide PROCEED button on page 3 - only allow space key
      proceedButton.style.display = 'none'

      // Hide explanation button on page 3
      explanationButton.style.display = 'block' //show explanation button on page 3

      // Update instructions
      instructions.innerText =
        phrases.RC_UseObjectToSetViewingDistancePage3[RC.L]

      // Hide dontUseRuler column on page 3
      dontUseRulerColumn.style.display = 'none'

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

      // Keep diagonal tape component hidden and remove labels from DOM
      tape.container.style.display = 'none'
      if (leftLabel.container.parentNode) {
        leftLabel.container.parentNode.removeChild(leftLabel.container)
      }
      if (rightLabel.container.parentNode) {
        rightLabel.container.parentNode.removeChild(rightLabel.container)
      }

      // Hide unit selection radio buttons on page 4
      unitRadioContainer.style.display = 'none'

      // // Hide radio buttons on page 4
      // radioContainer.style.display = 'none'

      // Hide PROCEED button on page 4 - only allow space key
      proceedButton.style.display = 'none'

      // Hide explanation button on page 4
      explanationButton.style.display = 'block' //show explanation button on page 4

      // Update instructions
      instructions.innerText =
        phrases.RC_UseObjectToSetViewingDistancePage4[RC.L]

      // Hide dontUseRuler column on page 4
      dontUseRulerColumn.style.display = 'none'

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
          selectedUnit: selectedUnit, // Store the selected unit (inches or cm)
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

    // Clean up label elements explicitly
    if (leftLabel.container.parentNode) {
      leftLabel.container.parentNode.removeChild(leftLabel.container)
    }
    if (rightLabel.container.parentNode) {
      rightLabel.container.parentNode.removeChild(rightLabel.container)
    }

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
        blindSpotTestNew(RC, options, true, async blindspotData => {
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
              options.calibrateTrackDistanceChecking,
              options.calibrateTrackDistanceSpotXYDeg,
              options.calibrateTrackDistance,
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
          options.calibrateTrackDistanceChecking,
          options.calibrateTrackDistanceSpotXYDeg,
          options.calibrateTrackDistance,
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

    // Clean up label elements explicitly
    if (leftLabel.container.parentNode) {
      leftLabel.container.parentNode.removeChild(leftLabel.container)
    }
    if (rightLabel.container.parentNode) {
      rightLabel.container.parentNode.removeChild(rightLabel.container)
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

    // Clean up resize event listener (same as checkDistance.js)
    window.removeEventListener('resize', updateDiagonalTapeOnResize)

    // Clean up label elements explicitly before restarting
    if (leftLabel.container.parentNode) {
      leftLabel.container.parentNode.removeChild(leftLabel.container)
    }
    if (rightLabel.container.parentNode) {
      rightLabel.container.parentNode.removeChild(rightLabel.container)
    }

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

        // Check if iris tracking is active before proceeding (for pages 3 and 4)
        if ((currentPage === 3 || currentPage === 4) && !irisTrackingIsActive) {
          console.log('Iris tracking not active - ignoring space bar')
          return
        }

        // Remove the event listener immediately to prevent multiple rapid presses
        document.removeEventListener('keydown', handleKeyPress)

        // Play camera shutter sound on pages 3 and 4
        if (currentPage === 3 || currentPage === 4) {
          if (env !== 'mocha' && cameraShutterSound) {
            cameraShutterSound()
          }
        }

        //play stamp of approval sound on page 2
        if (currentPage === 2) {
          if (env !== 'mocha' && stampOfApprovalSound) {
            stampOfApprovalSound()
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

            // Validate object length - reject if too short
            const minCm =
              options.calibrateTrackDistanceObjectMinMaxCm?.[0] || 30
            if (Math.round(firstMeasurement) < Math.round(minCm)) {
              console.log(
                `Object too short: ${Math.round(firstMeasurement)}cm < ${Math.round(minCm)}cm`,
              )

              // Show error message
              const objectCm = firstMeasurement
              const errorMessage =
                phrases.RC_YourObjectIsTooShort?.[RC.L]
                  ?.replace('[[IN1]]', Math.round(objectCm / 2.54).toString())
                  ?.replace('[[CM1]]', Math.round(objectCm).toString())
                  ?.replace('[[IN2]]', Math.round(minCm / 2.54).toString())
                  ?.replace('[[CM2]]', Math.round(minCm).toString()) ||
                `Your object (${Math.round(objectCm)}cm) is too short. Minimum: ${Math.round(minCm)}cm`

              await Swal.fire({
                ...swalInfoOptions(RC, { showIcon: false }),
                icon: undefined,
                html: errorMessage,
                allowEnterKey: true,
                confirmButtonText: phrases.T_ok?.[RC.L] || 'OK',
              })

              // Stay on page 2 - re-add the event listener
              document.addEventListener('keydown', handleKeyPress)
              return
            }

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

            // Re-add the listener for page 3
            document.addEventListener('keydown', handleKeyPress)
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
                allowEnterKey: false,
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

                  // Handle keyboard events - only allow Enter/Return, prevent Space
                  const keydownListener = event => {
                    if (event.key === ' ') {
                      event.preventDefault()
                      event.stopPropagation()
                      return
                    }
                    if (event.key === 'Enter' || event.key === 'Return') {
                      document.getElementById('ok-button-page3').click()
                    }
                  }
                  document.addEventListener('keydown', keydownListener, true)
                  RC.popupKeydownListener = keydownListener

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

                      // Re-add the event listener for page 2 after restart
                      document.addEventListener('keydown', handleKeyPress)
                    })
                },
                willClose: () => {
                  // Remove keyboard event listener
                  if (RC.popupKeydownListener) {
                    document.removeEventListener(
                      'keydown',
                      RC.popupKeydownListener,
                      true,
                    )
                    RC.popupKeydownListener = null
                  }
                  // Re-add the space key listener after popup closes
                  document.addEventListener('keydown', handleKeyPress)
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

              // Re-add the listener for page 4
              document.addEventListener('keydown', handleKeyPress)
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
                allowEnterKey: false,
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

                  // Handle keyboard events - only allow Enter/Return, prevent Space
                  const keydownListener = event => {
                    if (event.key === ' ') {
                      event.preventDefault()
                      event.stopPropagation()
                      return
                    }
                    if (event.key === 'Enter' || event.key === 'Return') {
                      document.getElementById('ok-button-page4').click()
                    }
                  }
                  document.addEventListener('keydown', keydownListener, true)
                  RC.popupKeydownListener = keydownListener

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

                      // Re-add the event listener for page 2 after restart
                      document.addEventListener('keydown', handleKeyPress)
                    })
                },
                willClose: () => {
                  // Remove keyboard event listener
                  if (RC.popupKeydownListener) {
                    document.removeEventListener(
                      'keydown',
                      RC.popupKeydownListener,
                      true,
                    )
                    RC.popupKeydownListener = null
                  }
                  // Re-add the space key listener after popup closes
                  document.addEventListener('keydown', handleKeyPress)
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
              const [pass, message, min, max, RMin, RMax, maxRatio] =
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
                          0,
                          0,
                          'object',
                          1,
                          [0, 0], // fixPoint - fixation cross position
                          [0, 0], // spotPoint - MUST be shared border, not red center
                          0,
                          0,
                          0,
                          options.calibrateTrackDistanceChecking,
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
                          0,
                          0,
                          'object',
                          2,
                          [0, 0], // fixPoint - fixation cross position
                          [0, 0], // spotPoint - MUST be shared border, not red center
                          0,
                          0,
                          0,
                          options.calibrateTrackDistanceChecking,
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
                const ratioText = maxRatio.toFixed(2)
                let displayMessage = phrases.RC_viewingObjectRejected[RC.L]
                  .replace('[[N11]]', ratioText)
                  .replace('[[N22]]', '')
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
                          0,
                          0,
                          'object',
                          1,
                          [0, 0], // fixPoint - fixation cross position
                          [0, 0], // spotPoint - MUST be shared border, not red center
                          0,
                          0,
                          0,
                          options.calibrateTrackDistanceChecking,
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
                          0,
                          0,
                          'object',
                          2,
                          [0, 0], // fixPoint - fixation cross position
                          [0, 0], // spotPoint - MUST be shared border, not red center
                          0,
                          0,
                          0,
                          options.calibrateTrackDistanceChecking,
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

                // Re-add the event listener for the new page 2 instance
                document.addEventListener('keydown', handleKeyPress)
              }

              // Clean up the captured image for privacy
              lastCapturedFaceImage = null

              // Only remove the listener if the test is actually finishing (not restarting)
              if (pass) {
                document.removeEventListener('keydown', handleKeyPress)
              }
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
  buttonContainer.style.bottom = '230px'
  if (RC.LD === RC._CONST.RTL) {
    buttonContainer.style.left = '20px'
  } else {
    buttonContainer.style.right = '20px'
  }
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

      // Validate object length - reject if too short
      const minCm = options.calibrateTrackDistanceObjectMinMaxCm?.[0] || 10
      if (Math.round(firstMeasurement) < Math.round(minCm)) {
        console.log(
          `Object too short: ${Math.round(firstMeasurement)}cm < ${Math.round(minCm)}cm`,
        )

        // Show error message
        const objectCm = firstMeasurement
        const errorMessage =
          phrases.RC_YourObjectIsTooShort?.[RC.L]
            ?.replace('[[IN1]]', Math.round(objectCm / 2.54).toString())
            ?.replace('[[CM1]]', Math.round(objectCm).toString())
            ?.replace('[[IN2]]', Math.round(minCm / 2.54).toString())
            ?.replace('[[CM2]]', Math.round(minCm).toString()) ||
          `Your object (${Math.round(objectCm)}cm) is too short. Minimum: ${Math.round(minCm)}cm`

        await Swal.fire({
          ...swalInfoOptions(RC, { showIcon: false }),
          icon: undefined,
          html: errorMessage,
          allowEnterKey: true,
          confirmButtonText: phrases.T_ok?.[RC.L] || 'OK',
        })

        // Stay on page 2 - object length page is already showing
        return
      }

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

      const [pass, message, min, max, RMin, RMax, maxRatio] =
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
                  0,
                  0,
                  'object',
                  1,
                  [0, 0], // fixPoint - fixation cross position
                  [0, 0], // spotPoint - MUST be shared border, not red center
                  0,
                  0,
                  0,
                  options.calibrateTrackDistanceChecking,
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
                  0,
                  0,
                  'object',
                  2,
                  [0, 0], // fixPoint - fixation cross position
                  [0, 0], // spotPoint - MUST be shared border, not red center
                  0,
                  0,
                  0,
                  options.calibrateTrackDistanceChecking,
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
        const ratioText = maxRatio.toFixed(2)
        let displayMessage = phrases.RC_viewingObjectRejected[RC.L]
          .replace('[[N11]]', ratioText)
          .replace('[[N22]]', '')
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
              options,
              0,
              0,
              'object',
              1,
              [0, 0],
              [0, 0],
              0,
              0,
              currentIPDDistance,
              false,
              options.calibrateTrackDistanceChecking,
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

        // Re-add the event listener for page 2 after restart
        document.addEventListener('keydown', handleKeyPress)
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
// ===================== FACE TRACKING VALIDATION =====================
// This function checks if face tracking can return valid eye positions
// Returns true if face mesh data is available and eye positions are valid
async function isFaceTrackingActive(RC) {
  try {
    // Import getMeshData from distanceTrack.js
    const { getMeshData } = await import('./distanceTrack.js')

    // Try to get mesh data with eye positions
    const meshData = await getMeshData(RC, 'iris')

    if (meshData && meshData.leftEye && meshData.rightEye) {
      console.log('Face tracking validation: Active and ready')
      return true
    } else {
      console.log('Face tracking validation: No valid eye positions')
      return false
    }
  } catch (error) {
    console.log(
      'Face tracking validation: Error checking tracking status:',
      error,
    )
    return false
  }
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
    maxRatio,
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

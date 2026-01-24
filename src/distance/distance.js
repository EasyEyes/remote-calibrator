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
  getCameraResolutionXY,
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
import {
  test_phrases,
  test_assetMap,
  distanceCalibrationAssetMap,
} from './assetMap'
import {
  fetchBlobOnce,
  resolveInstructionMediaUrl,
} from './instructionMediaCache'
import {
  buildStepInstructions,
  createStepInstructionsUI,
  renderStepInstructions,
} from './stepByStepInstructionHelps'
import { parseInstructions } from './instructionParserAdapter'
import { swalInfoOptions } from '../components/swalOptions'
import { setUpEasyEyesKeypadHandler } from '../extensions/keypadHandler'
import { showTestPopup } from '../components/popup'
import { ppiToPxPerCm } from '../components/converters'
import {
  calculateFootXYPx,
  calculateNearestPoints,
  getMeshData,
} from './distanceTrack'
import woodSvg from '../media/AdobeStock_1568677429.svg'

export const objectLengthCmGlobal = {
  value: null,
}
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
  COMMON = undefined,
) {
  // Initialize the calibration attempts object if it doesn't exist
  if (!RC.calibrationAttempts) {
    RC.calibrationAttempts = {
      future: 'To be deleted by end of November 2025.',
    }
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
        ? measurement.ipdVpx
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
      measurement.calibrateDistanceSpotXYDeg,
      measurement.cameraResolutionXYVpx,
      measurement.pointXYPx,
      measurement.eyesToFootCm,
      measurement.objectLengthCm,
      measurement.footXYPx,
      measurement.footToPointCm,
      measurement.object,
      measurement.objectSuggestion,
      COMMON,
      measurement.ipdXYZVpx, // 3D IPD in pixels
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
  calibrateDistanceSpotXYDeg = undefined,
  cameraResolutionXYVpx = undefined,
  pointXYPx = undefined,
  eyesToFootCm = undefined,
  objectLengthCm = undefined,
  footXYPx = undefined,
  footToPointCm = undefined,
  object = undefined,
  objectSuggestion = undefined,
  COMMON = undefined,
  ipdXYZVpx = undefined, // 3D IPD in pixels (always with Z coordinate)
) {
  // Maintain a transposed view of calibration attempts where each field accumulates
  // arrays of values across attempts for easier downstream analysis.
  const _updateCalibrationAttemptsTransposed = (
    RC,
    calibrationObject,
    COMMON,
  ) => {
    if (!RC.calibrationAttemptsT) RC.calibrationAttemptsT = {}
    for (const [key, value] of Object.entries(calibrationObject)) {
      const v = value === undefined ? null : value
      if (!RC.calibrationAttemptsT[key]) RC.calibrationAttemptsT[key] = []
      RC.calibrationAttemptsT[key].push(v)
    }
    if (COMMON) {
      for (const [key, value] of Object.entries(COMMON)) {
        const v = value === undefined ? null : value
        //for fields: objectRulerIntervalCm: ,objectLengthCm: , objectMeasuredMsg: , objectName: ,
        // push to array if array, otherwise set to value
        if (Array.isArray(v)) {
          if (!RC.calibrationAttemptsT[key]) RC.calibrationAttemptsT[key] = []
          RC.calibrationAttemptsT[key].push(...v)
        } else {
          if (!RC.calibrationAttemptsT[key]) RC.calibrationAttemptsT[key] = v
        }
        // if (!RC.calibrationAttemptsT[key]) RC.calibrationAttemptsT[key] = v
      }
    }
  }

  // Initialize the calibration attempts object if it doesn't exist
  if (!RC.calibrationAttempts) {
    RC.calibrationAttempts = {
      future: 'To be deleted by end of November 2025.',
    }
  }

  // Find the next available calibration number
  let calibrationNumber = 1
  while (RC.calibrationAttempts[`calibration${calibrationNumber}`]) {
    calibrationNumber++
  }

  const isBlindspot = method.toLowerCase().includes('blindspot')
  const isObject = method.toLowerCase().includes('object')
  const isPaper = COMMON?._calibrateDistance === 'paper'

  // Helper function to safely round centimeter values (2 decimal places, preserves trailing zeros)
  const safeRoundCm = value => {
    if (value == null || isNaN(value)) return null
    return parseFloat(value).toFixed(2)
  }

  // Helper function to safely round ratio values (4 decimal places)
  const safeRoundRatio = value => {
    if (value == null || isNaN(value)) return null
    return Math.round(value * 10000) / 10000
  }

  // Helper function to safely round pixel values (integer)
  const safeRoundPx = (value, decimalPlaces = 0) => {
    if (value == null || isNaN(value)) return null
    // return parseFloat(value.toFixed(decimalPlaces))
    return Math.round(value * 10 ** decimalPlaces) / 10 ** decimalPlaces
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
  const ipdCmValue = RC._CONST.IPD_CM // Standard IPD in cm (6.3cm)
  const fVpx = (currentIPDDistance * eyesToFootCm) / ipdCmValue
  const fOverWidth = fVpx / window.innerWidth
  const ipdOverWidth = currentIPDDistance / window.innerWidth
  // Calculate ipdOverWidthXYZ: 3D IPD / camera width
  const cameraWidth = cameraResolutionXYVpx ? cameraResolutionXYVpx[0] : null
  const ipdOverWidthXYZ =
    ipdXYZVpx && cameraWidth ? ipdXYZVpx / cameraWidth : null
  const imageBasedEyesToFootCm = (fVpx * ipdCmValue) / currentIPDDistance
  const imageBasedEyesToPointCm = Math.sqrt(
    imageBasedEyesToFootCm ** 2 + footToPointCm ** 2,
  )

  const screenResolutionXYVpx = [window.innerWidth, window.innerHeight]

  // Create the calibration object
  const calibrationObject = {
    method: method,
    object: object,
    objectMeasuredMsg: COMMON?.objectMeasuredMsg,
    objectSuggestion: objectSuggestion,
    cameraResolutionXYVpx: safeRoundXYPx(cameraResolutionXYVpx), // camera resolution
    screenResolutionXYVpx: safeRoundXYPx(screenResolutionXYVpx), // screen resolution
    pxPerCm: safeRoundCm(pxPerCmValue), //measured in size phase of rc
    ipdCm: safeRoundCm(ipdCmValue), //calculated from age
    leftEyeFootXYPx: safeRoundXYPx(nearestXYPx_left),
    rightEyeFootXYPx: safeRoundXYPx(nearestXYPx_right),
    footXYPx: safeRoundXYPx(footXYPx),
    pointXYPx: safeRoundXYPx(pointXYPx), // point on the screen
    footToPointCm: safeRoundCm(footToPointCm),
    objectLengthCm: safeRoundCm(objectLengthCm), // Distance from participant to object
    ipdOverWidth: safeRoundRatio(ipdOverWidth),
    ipdOverWidthXYZ: safeRoundRatio(ipdOverWidthXYZ), // 3D IPD / camera width
    fOverWidth: safeRoundRatio(fOverWidth),
    rulerBasedRightEyeToFootCm: safeRoundCm(nearestDistanceCm_right),
    rulerBasedLeftEyeToFootCm: safeRoundCm(nearestDistanceCm_left),
    rulerBasedEyesToFootCm: safeRoundCm(
      Math.sqrt(objectLengthCm ** 2 - footToPointCm ** 2),
    ),
    rulerBasedEyesToPointCm: safeRoundCm(objectLengthCm),
    imageBasedEyesToFootCm: safeRoundCm(imageBasedEyesToFootCm),
    imageBasedEyesToPointCm: safeRoundCm(imageBasedEyesToPointCm),
  }

  // Include spot parameters only if _calibrateDistance === 'blindspot'
  if (COMMON?._calibrateDistance === 'blindspot') {
    calibrationObject.spotDeg = safeToFixed(spotDeg)
    calibrationObject._calibrateDistanceSpotXYDeg = calibrateDistanceSpotXYDeg
      ? [
          safeToFixed(calibrateDistanceSpotXYDeg[0]),
          safeToFixed(calibrateDistanceSpotXYDeg[1]),
        ]
      : undefined
    calibrationObject.spotXYPx = safeRoundXYPx(spotXYPx)
    calibrationObject.eyesToSpotCm = safeRoundCm(eyesToSpotCm)
  }

  // Include eyesToFixationCm only if fixationXYPx is defined
  if (fixationXYPx) {
    calibrationObject.eyesToFixationCm = safeRoundCm(eyesToFixationCm)
  }

  console.log('factorVpxCm', calibrationObject.factorVpxCm)

  // Store in the new JSON format
  RC.calibrationAttempts[`calibration${calibrationNumber}`] = calibrationObject

  //unless isObject, delete objectRulerIntervalCm from Common
  if (!isObject || isPaper) {
    if (COMMON.objectRulerIntervalCm) {
      delete COMMON.objectRulerIntervalCm
    }
  }

  if (COMMON?.objectMeasuredMsg) {
    delete COMMON.objectMeasuredMsg
  }

  // Also maintain a transposed structure for easier consumption
  _updateCalibrationAttemptsTransposed(RC, calibrationObject, COMMON)

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
  ipdVpx = 0,
  calibrateDistanceChecking = 'camera',
  _pointXYPx = [window.innerWidth / 2, window.innerHeight / 2],
) {
  const mesh = await getMeshData(
    RC,
    options.calibrateDistancePupil,
    meshSamples,
  )
  const { leftEye, rightEye, video, currentIPDDistance, ipdXYZVpx } = mesh
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
    ipdVpx === 0 ? currentIPDDistance : ipdVpx,
    false,
    calibrateDistanceChecking,
    _pointXYPx,
  )
  return {
    nearestPointsData,
    currentIPDDistance,
    ipdXYZVpx, // Always 3D IPD
  }
}

// Helper to create measurement object from nearest points data
function createMeasurementObject(
  type,
  distance,
  calibrationFactor,
  nearestPointsData,
  currentIPDDistance,
  ipdVpx = null,
  cameraResolutionXYVpx = [0, 0],
  object = undefined,
  objectSuggestion = undefined,
  ipdXYZVpx = null, // Always 3D IPD for ipdOverWidthXYZ
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
    pointXYPx,
    eyeToFootCm,
    footXYPx,
    footToPointCm,
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
    pointXYPx,
    cameraResolutionXYVpx: cameraResolutionXYVpx,
    eyesToFootCm: eyeToFootCm,
    footXYPx: footXYPx,
    footToPointCm: footToPointCm,
    object: object,
    objectSuggestion: objectSuggestion,
    objectLengthCm: distance,
    ipdXYZVpx: ipdXYZVpx, // Always 3D IPD for ipdOverWidthXYZ
  }

  if (ipdVpx !== null) {
    measurement.ipdVpx = ipdVpx
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
  calibrateDistancePupil = 'iris',
  meshSamples = [],
  calibrateDistanceIpdUsesZBool = true,
) {
  let video = document.getElementById('webgazerVideoCanvas')
  if (!video) return null
  const model = await RC.gazeTracker.webgazer.getTracker().model
  const faces = await model.estimateFaces(video)
  if (!faces.length) return null
  const mesh = faces[0].keypoints
  const { leftEye, rightEye } = getLeftAndRightEyePointsFromMeshData(
    mesh,
    calibrateDistancePupil,
  )
  if (!leftEye || !rightEye) return null
  const eyeDist = (a, b, useZ = true) => {
    if (useZ) {
      console.log(
        '[distance.js - measureIntraocularDistancePx] eyeDist using 3D formula (with Z)',
      )
      return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
    }
    console.log(
      '[distance.js - measureIntraocularDistancePx] eyeDist using 2D formula (NO Z)',
    )
    return Math.hypot(a.x - b.x, a.y - b.y)
  }

  console.log(
    'Eye distance measureIntraocularDistancePx',
    eyeDist(leftEye, rightEye, calibrateDistanceIpdUsesZBool),
  )
  meshSamples.length = 0
  meshSamples.push(...mesh)
  return eyeDist(leftEye, rightEye, calibrateDistanceIpdUsesZBool)
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
  let minMaxDeg = options.calibrateDistanceSpotMinMaxDeg
  if (typeof minMaxDeg === 'string')
    minMaxDeg = minMaxDeg.split(',').map(Number)
  if (!Array.isArray(minMaxDeg) || minMaxDeg.length < 2) minMaxDeg = [2.0, 8.0]
  const minDeg = Math.max(0.1, parseFloat(minMaxDeg[0]))
  const maxDeg = Math.max(minDeg + 0.1, parseFloat(minMaxDeg[1]))

  // Build overlay
  const blindSpotDiv = document.createElement('div')
  blindSpotDiv.innerHTML = blindSpotHTML
  document.body.appendChild(blindSpotDiv)

  // Determine which instruction to show based on calibrateDistanceChecking option
  const checkingOptions = options.calibrateDistanceChecking
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

  //   // Use minimum spotDeg from calibrateDistanceSpotMinMaxDeg for max eccentricity calculation
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

  let blindspotEccXDeg = options.calibrateDistanceSpotXYDeg[0]
  const blindspotEccYDeg = options.calibrateDistanceSpotXYDeg[1]
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
        ? -options.calibrateDistanceSpotXYDeg[0]
        : options.calibrateDistanceSpotXYDeg[0]
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
      options.calibrateDistanceBlindspotDebugging,
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
              options.calibrateDistancePupil,
              meshPoints,
              RC.calibrateDistanceIpdUsesZBool !== false,
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
        // const range = options.calibrateDistanceAllowedRangeCm || [30, 70]
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
            options.calibrateDistanceSpotXYDeg[0] ** 2 +
              options.calibrateDistanceSpotXYDeg[1] ** 2,
          )
          const { nearestPointsData, currentIPDDistance, ipdXYZVpx } =
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
              options.calibrateDistanceChecking,
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

          const cameraResolutionXYVpx = getCameraResolutionXY(RC)
          const measurement = createMeasurementObject(
            `${side}-eye-${edge}-edge`, // e.g., 'right-eye-near-edge'
            nearestPointsData.distanceCm,
            nearestPointsData.calibrationFactor,
            nearestPointsData,
            currentIPDDistance,
            avgIPD,
            cameraResolutionXYVpx,
            null,
            null,
            ipdXYZVpx,
          )

          // Add new fields to measurement
          measurement.spotXYPx = spotXYPx
          measurement.fixationXYPx = [crossX, crossY]
          measurement.spotToFixationCm = fixationToSpotCm
          measurement.eyesToFixationCm = eyesToFixationCm
          measurement.eyesToSpotCm = eyesToSpotCm
          measurement.calibrateDistanceSpotXYDeg =
            options.calibrateDistanceSpotXYDeg

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
    options.calibrateDistanceAllowedRatio || 1.1,
    1 / (options.calibrateDistanceAllowedRatio || 1.1),
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
  const RMin = Array.isArray(options.calibrateDistanceAllowedRangeCm)
    ? options.calibrateDistanceAllowedRangeCm[0]
    : -Infinity
  const RMax = Array.isArray(options.calibrateDistanceAllowedRangeCm)
    ? options.calibrateDistanceAllowedRangeCm[1]
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
  if (options.calibrateDistanceCheckBool)
    await RC._checkDistance(
      callback,
      data,
      toTrackDistance ? 'trackDistance' : 'measureDistance',
      options.checkCallback,
      options.calibrateDistanceCheckCm,
      options.callbackStatic,
      options.calibrateDistanceCheckSecs,
      options.calibrateDistanceCheckLengthCm,
      options.calibrateDistanceCenterYourEyesBool,
      options.calibrateDistancePupil,
      options.calibrateDistanceChecking,
      options.calibrateDistanceSpotXYDeg,
      options.calibrateDistance,
      options.stepperHistory,
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

RemoteCalibrator.prototype.measureDistanceKnown = async function (
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

  await knownDistanceTest(this, opts, callback)
}

// Helper functions

function _getDist(x, crossX, ppi) {
  // .3937 - in to cm
  return Math.abs(crossX - x) / ppi / _getTanDeg(15) / 0.3937
}

export function _getEyeToCameraCm(
  fixationToSpotCm,
  calibrateDistanceSpotXYDeg,
) {
  const eccDeg = Math.sqrt(
    calibrateDistanceSpotXYDeg[0] ** 2 + calibrateDistanceSpotXYDeg[1] ** 2,
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

// Helper function to check if the last 2 consecutive object measurements are consistent
function checkLastTwoObjectMeasurements(measurements, threshold) {
  // Need at least 2 measurements to compare
  if (measurements.length < 2) return null

  // Get the last two measurements
  const lastIdx = measurements.length - 1
  const secondLastIdx = measurements.length - 2

  const M1 = measurements[secondLastIdx].objectLengthCm
  const M2 = measurements[lastIdx].objectLengthCm

  // Calculate max(M1/M2, M2/M1)
  const ratio = Math.max(M1 / M2, M2 / M1)

  // Test passes if ratio <= max(threshold, 1/threshold)
  const maxThreshold = Math.max(threshold, 1 / threshold)

  console.log(
    `Checking last two measurements: M1=${M1.toFixed(1)}cm, M2=${M2.toFixed(1)}cm, ratio=${ratio.toFixed(3)}, maxThreshold=${maxThreshold.toFixed(3)}`,
  )

  if (ratio <= maxThreshold) {
    // Found consistent last two measurements!
    console.log('✓ Last two measurements are consistent')
    return { indices: [secondLastIdx, lastIdx], values: [M1, M2] }
  }

  console.log('✗ Last two measurements are NOT consistent')
  return null // Last two measurements are not consistent
}

// Helper function to show pause before allowing new object measurement
export async function showPauseBeforeNewObject(
  RC,
  rejectionCount,
  phraseKey = 'RC_PauseBeforeNewObject',
) {
  let pauseSec
  if (rejectionCount === 0) {
    pauseSec = 0
  } else {
    pauseSec = 2 * Math.pow(1.4, rejectionCount - 1)
  }

  if (pauseSec === 0) {
    return // No pause needed
  }

  console.log(
    `Showing pause for ${pauseSec.toFixed(1)} seconds after ${rejectionCount} rejections`,
  )

  const pauseMs = pauseSec * 1000
  let timerInterval

  await Swal.fire({
    title: phrases[phraseKey]?.[RC.L],
    html: `<div style="margin: 20px 0;">
      <div style="width: 100%; background-color: #e0e0e0; border-radius: 10px; height: 30px; overflow: hidden;">
        <div id="pause-progress-bar" style="height: 100%; background-color: #4CAF50; width: 0%; transition: width 0.1s linear;"></div>
      </div>
    </div>`,
    showConfirmButton: false,
    allowEscapeKey: false,
    allowOutsideClick: false,
    didOpen: () => {
      const progressBar = document.getElementById('pause-progress-bar')
      const startTime = Date.now()

      timerInterval = setInterval(() => {
        const elapsed = Date.now() - startTime
        const remaining = Math.max(0, pauseMs - elapsed)
        const progress = Math.min(100, (elapsed / pauseMs) * 100)

        if (progressBar) {
          progressBar.style.width = `${progress}%`
        }

        if (remaining <= 0) {
          clearInterval(timerInterval)
          Swal.close()
        }
      }, 100)
    },
    willClose: () => {
      if (timerInterval) {
        clearInterval(timerInterval)
      }
    },
  })

  console.log('Pause completed')
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
  const showLength = !!options.calibrateDistanceShowRulerUnitsBool

  // ===================== PAPER SELECTION MODE =====================
  const isPaperSelectionMode = options.useObjectTestData === 'paper'

  const paperChoiceLengthMap = {
    // Prefer parsing lengths from the label text (see parseLengthCmFromLabel).
    // Keep explicit overrides for any labels that intentionally map to null.
    'None of the above': null,
  }

  const unitToCmFactor = unitRaw => {
    const unit = String(unitRaw || '')
      .trim()
      .toLowerCase()
    if (unit === 'cm') return 1
    if (unit === 'mm') return 0.1
    if (unit === 'in' || unit === 'inch' || unit === 'inches') return 2.54
    return null
  }

  const parseLengthCmFromLabel = labelRaw => {
    const label = String(labelRaw || '').trim()
    if (!label) return null

    // 1) Prefer anything in parentheses: "(210 × 297 mm)", "(8.5 x 11 inch)", etc.
    // Support both "×" and "x" as separators (case-insensitive).
    const parenMatch = label.match(/\(([^)]+)\)/)
    if (parenMatch && parenMatch[1]) {
      const inside = parenMatch[1]
      // Try a "a x b unit" pattern.
      const dimMatch = inside.match(
        /(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(mm|cm|inches?|inch|in)\b/i,
      )
      if (dimMatch) {
        const a = Number(dimMatch[1])
        const b = Number(dimMatch[2])
        const factor = unitToCmFactor(dimMatch[3])
        if (Number.isFinite(a) && Number.isFinite(b) && factor) {
          return Math.max(a, b) * factor
        }
      }

      // Fallback: single measurement inside parentheses: "(50 cm)".
      const singleInside = inside.match(
        /(\d+(?:\.\d+)?)\s*(mm|cm|inches?|inch|in)\b/i,
      )
      if (singleInside) {
        const v = Number(singleInside[1])
        const factor = unitToCmFactor(singleInside[2])
        if (Number.isFinite(v) && factor) return v * factor
      }
    }

    // 2) Anywhere in the label: "50 cm ruler", "24 inch ruler", etc.
    const singleMatch = label.match(
      /(\d+(?:\.\d+)?)\s*(mm|cm|inches?|inch|in)\b/i,
    )
    if (singleMatch) {
      const v = Number(singleMatch[1])
      const factor = unitToCmFactor(singleMatch[2])
      if (Number.isFinite(v) && factor) return v * factor
    }

    return null
  }

  const buildPaperSelectionOptions = (rawChoices, fallbackLengths) => {
    try {
      const raw = rawChoices || ''
      const lines = raw
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length)
      if (!lines.length) return null
      return lines.map((label, idx) => {
        const lengthCm = (() => {
          if (label in paperChoiceLengthMap) return paperChoiceLengthMap[label]
          const parsed = parseLengthCmFromLabel(label)
          if (parsed !== null) return parsed
          return fallbackLengths?.[idx] ?? null
        })()
        return {
          key: `paper-${idx}`,
          label,
          lengthCm,
        }
      })
    } catch (e) {
      console.warn('Failed to build paper choices from phrases:', e)
      return null
    }
  }

  // In paper-selection mode, optionally restrict page-2 choices to paper sizes only.
  // When calibrateDistanceCheckBool is true, we expect the phrase `RC_PaperChoices`
  // (paper-only). Otherwise we use `RC_PaperAndRulerChoices` (paper + rulers).
  const paperOnlyFallbackOptions = [
    { key: 'usLegal', label: 'US Legal (8.5 × 14 inch)', lengthCm: 14 * 2.54 },
    {
      key: 'usLetter',
      label: 'US Letter (8.5 × 11 inch)',
      lengthCm: 11 * 2.54,
    },
    { key: 'a3', label: 'A3 (297 × 420 mm)', lengthCm: 42 },
    { key: 'a4', label: 'A4 (210 × 297 mm)', lengthCm: 29.7 },
    { key: 'a5', label: 'A5 (148 × 210 mm)', lengthCm: 21 },
    { key: 'none', label: 'None of the above', lengthCm: null },
  ]
  const paperAndRulerFallbackOptions = [
    { key: 'ruler24in', label: '24 inch ruler', lengthCm: 24 * 2.54 },
    { key: 'ruler18in', label: '18 inch ruler', lengthCm: 18 * 2.54 },
    { key: 'ruler12in', label: '12 inch ruler', lengthCm: 12 * 2.54 },
    ...paperOnlyFallbackOptions.slice(0, 2),
    { key: 'ruler50cm', label: '50 cm  ruler', lengthCm: 50 },
    { key: 'ruler30cm', label: '30 cm  ruler', lengthCm: 30 },
    { key: 'ruler20cm', label: '20 cm ruler', lengthCm: 20 },
    ...paperOnlyFallbackOptions.slice(2),
  ]

  const usePaperOnlyChoices =
    isPaperSelectionMode && options.calibrateDistanceCheckBool === true
  const paperChoicesPhraseKey = usePaperOnlyChoices
    ? 'RC_PaperChoices'
    : 'RC_PaperAndRulerChoices'
  const rawPaperChoices = phrases?.[paperChoicesPhraseKey]?.[RC.L] || ''

  const fallbackLengths = (
    usePaperOnlyChoices
      ? paperOnlyFallbackOptions
      : paperAndRulerFallbackOptions
  ).map(o => o.lengthCm)

  const paperSelectionOptions =
    buildPaperSelectionOptions(rawPaperChoices, fallbackLengths) ||
    (usePaperOnlyChoices
      ? paperOnlyFallbackOptions
      : paperAndRulerFallbackOptions)
  let selectedPaperOption = null
  let selectedPaperLengthCm = null
  let selectedPaperLabel = null

  // ===================== MEASUREMENT STATE MANAGEMENT =====================
  const measurementState = {
    currentIteration: 1,
    totalIterations: Math.max(
      1,
      Math.floor(options.objectMeasurementCount || 1),
    ),
    measurements: [], // Store all individual ruler measurements
    consistentPair: null,
    lastAttemptWasTooShort: false, // Track if previous attempt failed minimum length check
    rejectionCount: 0, // Track number of times user has been rejected (too short OR mismatched)
    factorRejectionCount: 0, // Track number of times page 3/4 factor mismatch occurred
  }

  if (isPaperSelectionMode) {
    measurementState.totalIterations = 1
  }

  const collectAllAssetUrls = () => {
    const maps = [test_assetMap].filter(Boolean)
    const urls = new Set()
    maps.forEach(m => {
      Object.values(m || {}).forEach(u => {
        if (typeof u === 'string' && u) urls.add(u)
      })
    })
    return Array.from(urls)
  }

  // Build a prioritized preload order for instruction media.
  // We start with LL9, LL1, LL10, LL2, LL3, LL4, LL5, LL6, LL8, LL7, then the rest.
  const buildInstructionMediaPreloadOrder = () => {
    const allUrls = collectAllAssetUrls()
    if (!allUrls.length) return []

    const priorityKeys = [
      'LL9',
      'LL1',
      'LL10',
      'LL2',
      'LL3',
      'LL4',
      'LL5',
      'LL6',
      'LL8',
      'LL7',
    ]
    const seen = new Set()
    const ordered = []

    // Map priority keys to URLs (if present) and keep only unique URLs.
    priorityKeys.forEach(key => {
      const url = (test_assetMap && test_assetMap[key]) || null
      if (url && allUrls.includes(url) && !seen.has(url)) {
        ordered.push(url)
        seen.add(url)
      }
    })

    // Append any remaining URLs that weren't in the explicit priority list.
    allUrls.forEach(url => {
      if (!seen.has(url)) {
        ordered.push(url)
        seen.add(url)
      }
    })

    return ordered
  }

  // Preload a small number of highest-priority assets (blocking),
  // then continue preloading the rest sequentially in the background.
  const preloadAllInstructionMedia = async () => {
    const orderedUrls = buildInstructionMediaPreloadOrder()
    console.log('orderedUrls...', orderedUrls)
    if (!orderedUrls.length) return

    const firstBlockingCount = 3
    const firstBatch = orderedUrls.slice(0, firstBlockingCount)
    const remaining = orderedUrls.slice(firstBlockingCount)

    // Block only on the first 1–2 assets so the initial step has media ready.
    await Promise.all(firstBatch.map(fetchBlobOnce)).catch(error => {
      console.error('error preloading initial media...', error)
    })

    // Start a sequential preloader in the background for the rest.
    if (remaining.length) {
      if (!window.__eeInstructionMediaPreloaderPromise) {
        window.__eeInstructionMediaPreloaderPromise = (async () => {
          for (const url of remaining) {
            try {
              // Sequentially warm the cache; fetchBlobOnce will no-op on cached URLs.
              // eslint-disable-next-line no-await-in-loop
              await fetchBlobOnce(url)
            } catch (err) {
              console.error('error preloading media url...', err)
            }
          }
        })()
      }
    }
  }

  // Start preload: block only on the highest-priority assets, then continue in background.
  await preloadAllInstructionMedia()

  // ===================== OBJECT TEST COMMON DATA TO BE SAVED IN RC.calibrationAttempts.COMMON =====================
  const objectTestCommonData = {
    _calibrateDistance: options.calibrateDistance,
    _calibrateDistanceAllowedRangeCm: options.calibrateDistanceAllowedRangeCm,
    _calibrateDistanceAllowedRatio: options.calibrateDistanceAllowedRatio,
    _calibrateDistancePupil: options.calibrateDistancePupil,
    _calibrateDistanceShowRulerUnitsBool:
      options.calibrateDistanceShowRulerUnitsBool,
    _calibrateDistanceTimes: options.objectMeasurementCount,
    _calibrateScreenSizeAllowedRatio: options.calibrateScreenSizeAllowedRatio,
    _calibrateScreenSizeTimes: options.calibrateScreenSizeTimes,
    _showPerpendicularFeetBool: options.showNearestPointsBool,
    _viewingDistanceWhichEye: options.viewingDistanceWhichEye,
    _viewingDistanceWhichPoint: options.viewingDistanceWhichPoint,
    objectRulerIntervalCm: [],
    // objectLengthCm: [],
    objectMeasuredMsg: [],
  }

  // ===================== VIEWING DISTANCE MEASUREMENT TRACKING =====================
  // Track progress title counter for the viewing-distance capture steps.
  // In paper-selection mode, page 2 (paper choice) is treated as step 1, then pages 3 and 4.
  let viewingDistanceMeasurementCount = 0 // Total number of page 3/4 cycles completed
  // Expected total (starts at 2, increments by 2 on retry; +1 in paper-selection mode for the paper-choice step).
  let viewingDistanceTotalExpected = isPaperSelectionMode ? 3 : 2

  // Render the "Distance (N of X)" title safely (never show N > X).
  const renderViewingDistanceProgressTitle = () => {
    const n1 = Math.max(0, Math.floor(viewingDistanceMeasurementCount || 0))
    const n2 = Math.max(Math.floor(viewingDistanceTotalExpected || 0), n1, 1)
    const template =
      phrases.RC_distanceTrackingN?.[RC.L] || 'Distance [[N1]] of [[N2]]'
    title.innerText = template
      .replace('[[N1]]', n1.toString())
      .replace('[[N2]]', n2.toString())
  }

  // ===================== FACE MESH CALIBRATION SAMPLES =====================
  // Arrays to store 5 samples per page for calibration
  let faceMeshSamplesPage3 = []
  let cameraResolutionXYVpxPage3 = []
  let faceMeshSamplesPage4 = []
  let cameraResolutionXYVpxPage4 = []
  let meshSamplesDuringPage3 = []
  let meshSamplesDuringPage4 = []
  // For a seamless transition, remember how far down page 3 had to push the instructions
  // to avoid the (top-centered) video, and apply at least that much on page 4.
  let page3InstructionsMarginTopPx = null

  // Helper to collect 5 samples of eye pixel distance using Face Mesh
  async function collectFaceMeshSamples(RC, arr, ppi, meshSamples) {
    arr.length = 0 // Clear array

    // Always collect exactly 5 samples, using NaN for failed measurements
    for (let i = 0; i < 5; i++) {
      try {
        const pxDist = await measureIntraocularDistancePx(
          RC,
          options.calibrateDistancePupil,
          meshSamples,
          RC.calibrateDistanceIpdUsesZBool !== false,
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
  const pxPerCm = ppi / 2.54

  // ===================== ARROW INDICATORS FOR PAGES 3 & 4 =====================
  // Create arrow elements to point to the object resting position
  const createArrowIndicators = targetXYPx => {
    const arrowSizeCm = 3
    const arrowSizePx = arrowSizeCm * pxPerCm
    const lineThicknessPx = 3 // Fixed 3-pixel line thickness

    // Calculate arrow positions on horizontal midline
    const midlineY = window.innerHeight / 2
    const leftArrowX = window.innerWidth / 3
    const rightArrowX = (2 * window.innerWidth) / 3

    // Create container for arrows
    const arrowContainer = document.createElement('div')
    arrowContainer.id = 'object-test-arrow-indicators'
    arrowContainer.style.position = 'fixed'
    arrowContainer.style.top = '0'
    arrowContainer.style.left = '0'
    arrowContainer.style.width = '100%'
    arrowContainer.style.height = '100%'
    arrowContainer.style.pointerEvents = 'none'
    arrowContainer.style.zIndex = '999999998' // Below video but above most elements

    // Helper function to create a single arrow
    const createArrow = (fromX, fromY, toX, toY) => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      svg.style.position = 'absolute'
      svg.style.top = '0'
      svg.style.left = '0'
      svg.style.width = '100%'
      svg.style.height = '100%'
      svg.style.overflow = 'visible'

      // Calculate arrow direction
      const dx = toX - fromX
      const dy = toY - fromY
      const distance = Math.sqrt(dx * dx + dy * dy)
      const unitX = dx / distance
      const unitY = dy / distance

      // Arrow shaft (line from starting point toward target, length = arrowSizePx)
      const endX = fromX + unitX * arrowSizePx
      const endY = fromY + unitY * arrowSizePx

      // Draw arrow shaft
      const line = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'line',
      )
      line.setAttribute('x1', fromX)
      line.setAttribute('y1', fromY)
      line.setAttribute('x2', endX)
      line.setAttribute('y2', endY)
      line.setAttribute('stroke', 'black')
      line.setAttribute('stroke-width', lineThicknessPx)
      line.setAttribute('stroke-linecap', 'butt')
      svg.appendChild(line)

      // Draw arrowhead (two lines forming a V)
      const arrowheadLength = arrowSizePx * 0.35 // 35% of arrow size
      const arrowheadAngle = 30 * (Math.PI / 180) // 30 degrees

      // Calculate perpendicular direction for arrowhead wings
      const angle = Math.atan2(dy, dx)

      // Left wing of arrowhead
      const leftWingX =
        endX - arrowheadLength * Math.cos(angle - arrowheadAngle)
      const leftWingY =
        endY - arrowheadLength * Math.sin(angle - arrowheadAngle)
      const leftWing = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'line',
      )
      leftWing.setAttribute('x1', endX)
      leftWing.setAttribute('y1', endY)
      leftWing.setAttribute('x2', leftWingX)
      leftWing.setAttribute('y2', leftWingY)
      leftWing.setAttribute('stroke', 'black')
      leftWing.setAttribute('stroke-width', lineThicknessPx)
      leftWing.setAttribute('stroke-linecap', 'butt')
      svg.appendChild(leftWing)

      // Right wing of arrowhead
      const rightWingX =
        endX - arrowheadLength * Math.cos(angle + arrowheadAngle)
      const rightWingY =
        endY - arrowheadLength * Math.sin(angle + arrowheadAngle)
      const rightWing = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'line',
      )
      rightWing.setAttribute('x1', endX)
      rightWing.setAttribute('y1', endY)
      rightWing.setAttribute('x2', rightWingX)
      rightWing.setAttribute('y2', rightWingY)
      rightWing.setAttribute('stroke', 'black')
      rightWing.setAttribute('stroke-width', lineThicknessPx)
      rightWing.setAttribute('stroke-linecap', 'butt')
      svg.appendChild(rightWing)

      return svg
    }

    // Create left arrow (pointing from 1/3 position toward target)
    const leftArrow = createArrow(
      leftArrowX,
      midlineY,
      targetXYPx[0],
      targetXYPx[1],
    )
    arrowContainer.appendChild(leftArrow)

    // Create right arrow (pointing from 2/3 position toward target)
    const rightArrow = createArrow(
      rightArrowX,
      midlineY,
      targetXYPx[0],
      targetXYPx[1],
    )
    arrowContainer.appendChild(rightArrow)

    return arrowContainer
  }

  // Store reference to arrow indicators for cleanup
  let arrowIndicators = null

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

  // Randomized interval (in cm) used only when showLength is false
  let intervalCmCurrent = null
  const computeNewIntervalCm = () => {
    // Base the randomized interval on the CURRENT ruler length so the first tick ("1")
    // always fits within the initial ruler span without requiring user adjustment.
    const currentDistancePx = tape.helpers.getDistance(
      startX,
      startY,
      endX,
      endY,
    )
    const currentLengthCm = currentDistancePx / pxPerCm
    const r = 0.6 + 0.4 * Math.random() // doubled randomness amplitude (was 0.8 + 0.2)
    // Leave ~1 cm headroom so the first tick is guaranteed on-screen
    return Math.max(0.1, Math.max(0, currentLengthCm - 1) * r)
  }

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
  titleRow.style.margin = '2rem 0 0rem 0'
  titleRow.style.position = 'relative'
  container.appendChild(titleRow)

  // --- TITLE  ---
  const title = document.createElement('h1')
  // Start with regular title (no progress counter)
  const initialTitleText = (
    phrases.RC_distanceTrackingN?.[RC.L] || 'Distance [[N1]] of [[N2]]'
  )
    .replace('[[N1]]', '1')
    .replace('[[N2]]', viewingDistanceTotalExpected.toString())
  title.innerText = initialTitleText
  title.style.whiteSpace = 'pre-line'
  title.style.textAlign = 'start'
  title.style.margin = '0' // Remove default margin
  title.dir = RC.LD.toLowerCase()
  title.id = 'distance-tracking-title'
  titleRow.appendChild(title)

  // Helper function to update title with current progress (only for page 2)
  const updateTitleWithProgress = () => {
    const currentMeasurement = measurementState.currentIteration
    const totalShown = Math.max(
      currentMeasurement,
      measurementState.totalIterations,
    )

    const titleText = phrases.RC_distanceObjectLengthN?.[RC.L]
      ?.replace('[[N1]]', currentMeasurement.toString())
      ?.replace('[[N2]]', totalShown.toString())

    title.innerText = titleText
    console.log(`Updated title to: ${titleText}`)
  }

  // Helper function to reset title to default (for pages other than page 2)
  const resetTitleToDefault = () => {
    // Default to "1 of total"
    viewingDistanceMeasurementCount = Math.max(
      1,
      viewingDistanceMeasurementCount,
    )
    renderViewingDistanceProgressTitle()
  }

  // Track and render instructions text with custom two-column flow
  let currentInstructionText = ''
  // Setter is reassigned after UI is created; default stores text only
  let setInstructionsText = text => {
    currentInstructionText = text
  }

  // Helper function to update instructions based on current iteration
  const updateInstructions = () => {
    const minCm = options.calibrateDistanceObjectMinMaxCm[0]
    const maxCm = options.calibrateDistanceObjectMinMaxCm[1]
    const minInch = minCm / 2.54
    const maxInch = maxCm / 2.54

    // Phrase key mapping for distance.js: bypass test_phrases timing issue
    const phraseKeyMapping = {
      RC_UseObjectToSetViewingDistanceTapePage1_MD:
        'RC_UseObjectToSetViewingDistanceTapeStepperPage1',
      RC_UseObjectToSetViewingDistanceRulerPage1_MD:
        'RC_UseObjectToSetViewingDistanceRulerStepperPage1',
      RC_UseObjectToSetViewingDistanceTapePage2_MD:
        'RC_UseObjectToSetViewingDistanceTapeStepperPage2',
      RC_UseObjectToSetViewingDistanceRulerPage2_MD:
        'RC_UseObjectToSetViewingDistanceRulerStepperPage2',
    }

    // Use different phrase for first measurement vs subsequent measurements
    // Use Markdown versions (with _MD suffix)
    const phraseKey =
      measurementState.currentIteration === 1
        ? showLength
          ? 'RC_UseObjectToSetViewingDistanceTapePage1_MD'
          : 'RC_UseObjectToSetViewingDistanceRulerPage1_MD'
        : showLength
          ? 'RC_UseObjectToSetViewingDistanceTapePage2_MD'
          : 'RC_UseObjectToSetViewingDistanceRulerPage2_MD'

    // Get actual phrase key from main phrases system (bypasses test_phrases)
    const actualPhraseKey = phraseKeyMapping[phraseKey]
    const chosenText = (phrases[actualPhraseKey]?.[RC.L] || '')
      .replace('[[IN1]]', minInch.toFixed(0))
      .replace('[[IN2]]', maxInch.toFixed(0))
      .replace('[[CM1]]', minCm.toFixed(0))
      .replace('[[CM2]]', maxCm.toFixed(0))

    // Parse with new Markdown parser adapter (auto-detects format)
    try {
      stepInstructionModel = parseInstructions(chosenText, {
        assetMap: test_assetMap,
      })
      currentStepFlatIndex = 0
      currentInstructionText = chosenText

      // Hide Ruler-Shift button when resetting to step 0
      if (typeof rulerShiftButton !== 'undefined' && rulerShiftButton) {
        rulerShiftButton.style.display = 'none'
      }

      renderCurrentStepView()
    } catch (e) {
      console.warn('Failed to parse step instructions; using plain text', e)
      currentInstructionText = chosenText
      leftInstructionsText.textContent = currentInstructionText || ''
      rightInstructionsText.textContent = ''
      sectionMediaContainer.innerHTML = ''
    }
    console.log(
      `Updated instructions (${phraseKey}) for iteration ${measurementState.currentIteration}`,
    )
  }

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
  // Default margins; will be adjusted per-page in showPage
  instructionsContainer.style.margin = '2rem 0 5rem 0'
  instructionsContainer.style.position = 'relative'
  instructionsContainer.style.zIndex = '3'
  container.appendChild(instructionsContainer)

  // --- STEP INSTRUCTIONS UI (reusable) ---
  const instructionsUI = createStepInstructionsUI(instructionsContainer, {
    leftWidth: '50%',
    rightWidth: '50%',
    leftPaddingStart: '3rem',
    leftPaddingEnd: '1rem',
    rightPaddingStart: '1rem',
    rightPaddingEnd: '3rem',
    fontSize: 'clamp(1.1em, 2.5vw, 1.4em)',
    lineHeight: '1.4',
  })
  const leftInstructionsText = instructionsUI.leftText
  const rightInstructionsText = instructionsUI.rightText
  const rightInstructions = instructionsUI.rightColumn
  const sectionMediaContainer = instructionsUI.mediaContainer

  // --- FOLLOW-UP BANNER fixed at upper-right (dontUseRuler) ---
  const dontUseRulerColumn = document.createElement('div')
  dontUseRulerColumn.id = 'dont-use-ruler-column'
  dontUseRulerColumn.style.position = 'fixed'
  dontUseRulerColumn.style.top = '12px'
  dontUseRulerColumn.style.zIndex = '999999999'
  dontUseRulerColumn.style.whiteSpace = 'pre-line'
  dontUseRulerColumn.style.fontSize = '16pt'
  dontUseRulerColumn.style.lineHeight = '1.4'
  dontUseRulerColumn.style.display = 'none' // Hidden by default
  dontUseRulerColumn.style.width = '50vw'
  dontUseRulerColumn.style.maxWidth = '50vw'

  // Position and align based on language direction
  if (RC.LD === RC._CONST.RTL) {
    // RTL: position at top-left with left alignment
    dontUseRulerColumn.style.left = '12px'
    dontUseRulerColumn.style.right = 'auto'
    dontUseRulerColumn.style.textAlign = 'left'
  } else {
    // LTR: position at top-right with right alignment
    dontUseRulerColumn.style.right = '12px'
    dontUseRulerColumn.style.left = 'auto'
    dontUseRulerColumn.style.textAlign = 'right'
  }

  document.body.appendChild(dontUseRulerColumn)

  // Step-by-step instruction model and current index
  let stepInstructionModel = null
  let currentStepFlatIndex = 0

  const renderCurrentStepView = () => {
    const maxIdx = (stepInstructionModel?.flatSteps?.length || 1) - 1

    const handlePrev = () => {
      if (currentStepFlatIndex > 0) {
        currentStepFlatIndex--
        renderCurrentStepView()
      }
    }

    const handleNext = () => {
      if (currentStepFlatIndex < maxIdx) {
        currentStepFlatIndex++
        renderCurrentStepView()
      }
    }

    renderStepInstructions({
      model: stepInstructionModel,
      flatIndex: currentStepFlatIndex,
      elements: {
        leftText: leftInstructionsText,
        rightText: rightInstructionsText,
        mediaContainer: sectionMediaContainer,
      },
      options: {
        calibrateDistanceCheckBool: options.calibrateDistanceCheckBool,
        thresholdFraction: 0.6,
        useCurrentSectionOnly: true,
        resolveMediaUrl: resolveInstructionMediaUrl,
        stepperHistory: options.stepperHistory,
        onPrev: handlePrev,
        onNext: handleNext,
      },
      lang: RC.language.value,
      langDirection: RC.LD,
      phrases: phrases,
    })

    // Show/Hide Ruler-Shift button based on step and measurement iteration
    // First measurement (iteration 1): show only at step index 5
    // Subsequent measurements (iteration 2+): show only at step index 4
    if (currentPage === 2 && stepInstructionModel) {
      if (typeof rulerShiftButton !== 'undefined' && rulerShiftButton) {
        const isFirstMeasurement = measurementState.currentIteration === 1
        const showAtIndex = isFirstMeasurement ? 5 : 4

        if (currentStepFlatIndex === showAtIndex) {
          rulerShiftButton.style.display = 'flex'
        } else {
          rulerShiftButton.style.display = 'none'
        }
      }
    }
  }

  // Replace the setter to support both legacy and step-by-step flows
  const reflowInstructionsOnResize = () => renderCurrentStepView()
  setInstructionsText = text => {
    currentInstructionText = text
    // Fallback: raw text mode
    leftInstructionsText.textContent = currentInstructionText || ''
    rightInstructionsText.textContent = ''
    sectionMediaContainer.innerHTML = ''
  }
  // Initial flow (if text already computed)
  setInstructionsText(currentInstructionText)
  // Reflow on viewport changes
  window.addEventListener('resize', reflowInstructionsOnResize)

  // Up/Down navigation for step-by-step instructions (page 2 only)
  const handleInstructionNav = e => {
    if (![2, 3, 4].includes(currentPage) || !stepInstructionModel) return
    if (e.key === 'ArrowDown') {
      const maxIdx = (stepInstructionModel.flatSteps?.length || 1) - 1
      if (currentStepFlatIndex < maxIdx) {
        currentStepFlatIndex++
        renderCurrentStepView()
      }
      e.preventDefault()
      e.stopPropagation()
    } else if (e.key === 'ArrowUp') {
      if (currentStepFlatIndex > 0) {
        currentStepFlatIndex--
        renderCurrentStepView()
      }
      e.preventDefault()
      e.stopPropagation()
    }
  }
  document.addEventListener('keydown', handleInstructionNav)

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

  // --- PAPER SELECTION UI (for useObjectTestData === "paper") ---
  const paperSelectionContainer = document.createElement('div')
  paperSelectionContainer.id = 'paper-selection-container'
  paperSelectionContainer.style.position = 'relative'
  paperSelectionContainer.style.display = 'none'
  paperSelectionContainer.style.flexDirection = 'column'
  paperSelectionContainer.style.alignItems = 'flex-start'
  paperSelectionContainer.style.justifyContent = 'flex-start'
  paperSelectionContainer.style.backgroundColor = 'transparent'
  paperSelectionContainer.style.zIndex = '10000000000'
  paperSelectionContainer.style.color = '#111'
  paperSelectionContainer.style.padding = '0'
  paperSelectionContainer.style.paddingLeft = 'clamp(1rem, 5vw, 3rem)'
  paperSelectionContainer.style.paddingRight = 'clamp(1rem, 5vw, 3rem)'
  paperSelectionContainer.style.paddingTop = '0.1rem'
  paperSelectionContainer.style.paddingBottom = '1rem'
  paperSelectionContainer.style.boxSizing = 'border-box'
  // Calculate remaining viewport height below title (approx 4rem for title row)
  paperSelectionContainer.style.maxHeight = 'calc(100vh - 5rem)'
  paperSelectionContainer.style.overflowY = 'auto' // Enable scrolling as fallback
  paperSelectionContainer.style.overflowX = 'hidden'
  // Allow typing/clicking inside even when global listeners exist
  paperSelectionContainer.style.pointerEvents = 'auto'
  paperSelectionContainer.style.userSelect = 'auto'

  const paperSelectionCard = document.createElement('div')
  paperSelectionCard.style.maxWidth = 'min(50vw, 100% - 2rem)'
  paperSelectionCard.style.width = 'auto'
  paperSelectionCard.style.background = 'transparent'
  paperSelectionCard.style.border = 'none'
  paperSelectionCard.style.borderRadius = '0'
  paperSelectionCard.style.padding = '0'
  paperSelectionCard.style.boxSizing = 'border-box'
  paperSelectionCard.style.boxShadow = 'none'
  paperSelectionCard.style.display = 'flex'
  paperSelectionCard.style.flexDirection = 'column'
  paperSelectionCard.style.minHeight = '0' // Allow shrinking in flex context
  paperSelectionCard.style.flexGrow = '1' // Allow card to grow to fill available space

  const paperSelectionTitle = document.createElement('div')
  paperSelectionTitle.textContent = phrases.RC_PaperChoicesInstructions[RC.L]
  paperSelectionTitle.style.fontSize = 'clamp(1rem, 3vmin, 1.4rem)'
  paperSelectionTitle.style.fontWeight = '600'
  paperSelectionTitle.style.color = '#111'
  paperSelectionTitle.style.textAlign = 'left'
  paperSelectionTitle.style.margin =
    'clamp(0.5rem, 3vmin, 2rem) 0px clamp(0.5rem, 2vmin, 1rem) 0px'

  const paperOptionsList = document.createElement('div')
  paperOptionsList.style.display = 'flex'
  paperOptionsList.style.flexDirection = 'column'
  paperOptionsList.style.gap = 'clamp(0.3rem, 1.5vmin, 0.7rem)'
  paperOptionsList.style.alignItems = 'flex-start'

  // Inline warning directly under radio buttons (footnote - smaller on small screens)
  const paperInlineWarning = document.createElement('div')
  const useLongEdgeRaw = phrases.RC_UseLongEdge?.[RC.L] || ''
  // Support "/n" (and literal "\n") in the phrase by converting to real line breaks.
  paperInlineWarning.textContent = useLongEdgeRaw
    .replaceAll('/n', '\n')
    .replaceAll('\\n', '\n')
  paperInlineWarning.style.marginTop = 'clamp(0.75rem, 4vmin, 3rem)'
  paperInlineWarning.style.fontSize = 'clamp(0.85rem, 2.5vmin, 1.3rem)'
  paperInlineWarning.style.lineHeight = '1.4'
  paperInlineWarning.style.color = '#555'
  paperInlineWarning.style.whiteSpace = 'pre-line'

  // Suggestion input under first warning
  const paperSuggestionWrapper = document.createElement('div')
  paperSuggestionWrapper.style.display = 'flex'
  paperSuggestionWrapper.style.flexDirection = 'column'
  paperSuggestionWrapper.style.gap = 'clamp(0.2rem, 1vmin, 0.35rem)'
  paperSuggestionWrapper.style.marginTop = 'clamp(0.5rem, 2vmin, 1rem)'

  const paperSuggestionLabel = document.createElement('div')
  paperSuggestionLabel.textContent = phrases.RC_SuggestObject[RC.L]
  paperSuggestionLabel.style.fontSize = 'clamp(0.85rem, 2.5vmin, 1.3rem)'
  paperSuggestionLabel.style.lineHeight = '1.3'
  paperSuggestionLabel.style.color = '#555'

  const paperSuggestionInput = document.createElement('input')
  paperSuggestionInput.type = 'text'
  paperSuggestionInput.placeholder = phrases.RC_SuggestObjectHere[RC.L]
  paperSuggestionInput.style.fontSize = '1rem'
  // Box style (transparent background, rounded corners)
  paperSuggestionInput.style.padding = '10px 12px'
  paperSuggestionInput.style.border = '1px solid rgba(85, 85, 85, 0.9)'
  paperSuggestionInput.style.borderRadius = '10px'
  paperSuggestionInput.style.width = '320px'
  paperSuggestionInput.style.maxWidth = '90vw'
  paperSuggestionInput.style.outline = 'none'
  paperSuggestionInput.style.background = 'transparent'
  paperSuggestionInput.style.pointerEvents = 'auto'
  paperSuggestionInput.style.userSelect = 'text'
  let paperSuggestionValue = ''
  paperSuggestionInput.oninput = e => {
    paperSuggestionValue = e.target.value || ''
  }
  // Stop bubbling so global key handlers (space/enter) don't block typing here
  paperSuggestionInput.addEventListener('keydown', e => {
    e.stopPropagation()
  })
  paperSuggestionInput.addEventListener('click', e => e.stopPropagation())

  paperSuggestionWrapper.appendChild(paperSuggestionLabel)
  paperSuggestionWrapper.appendChild(paperSuggestionInput)

  // Optional note right under the suggestion input (footnote - smaller on small screens)
  // (only when calibrateDistanceCheckBool is true)
  const dontUseYourRulerNote = document.createElement('div')
  const dontUseYourRulerRaw = phrases.RC_DontUseYourRulerYet?.[RC.L] || ''
  dontUseYourRulerNote.textContent = dontUseYourRulerRaw
    .replaceAll('/n', '\n')
    .replaceAll('\\n', '\n')
  dontUseYourRulerNote.style.marginTop = 'clamp(0.5rem, 2vmin, 1rem)'
  dontUseYourRulerNote.style.fontSize = 'clamp(0.85rem, 2.5vmin, 1.3rem)'
  dontUseYourRulerNote.style.lineHeight = '1.4'
  dontUseYourRulerNote.style.color = '#555'
  dontUseYourRulerNote.style.whiteSpace = 'pre-line'
  dontUseYourRulerNote.style.display =
    options.calibrateDistanceCheckBool === true &&
    dontUseYourRulerRaw.trim().length
      ? 'block'
      : 'none'
  paperSuggestionWrapper.appendChild(dontUseYourRulerNote)

  // Important warning under suggestion input
  const paperImportantWarning = document.createElement('div')
  paperImportantWarning.textContent = ''
  paperImportantWarning.style.marginTop = 'clamp(0.5rem, 2vmin, 1rem)'
  paperImportantWarning.style.fontSize = 'clamp(0.9rem, 2.5vmin, 1.3rem)'
  paperImportantWarning.style.lineHeight = '1.4'
  paperImportantWarning.style.color = '#111'

  const paperValidationMessage = document.createElement('div')
  paperValidationMessage.style.color = '#ff9f43'
  paperValidationMessage.style.marginTop = 'clamp(0.5rem, 2vmin, 1rem)'
  paperValidationMessage.style.display = 'none'
  paperValidationMessage.style.fontSize = 'clamp(0.8rem, 2vmin, 0.95rem)'

  const createPaperOptionRow = option => {
    const row = document.createElement('label')
    row.style.display = 'flex'
    row.style.alignItems = 'center'
    row.style.gap = '1px'
    row.style.cursor = 'pointer'
    row.style.fontSize = 'clamp(1rem, 2.5vmin, 1.3rem)'
    row.style.lineHeight = '1.2'
    row.style.color = '#111'
    row.style.textAlign = 'left'
    row.style.padding = '0'

    const radio = document.createElement('input')
    radio.type = 'radio'
    radio.name = 'paper-selection'
    radio.value = option.key
    radio.style.cursor = 'pointer'
    radio.style.marginRight = '0.5rem'
    radio.style.padding = '0'
    radio.style.width = 'clamp(14px, 3vmin, 16px)'
    radio.style.height = 'clamp(14px, 3vmin, 16px)'
    radio.style.flexShrink = '0'
    radio.onchange = () => {
      selectedPaperOption = option.key
      selectedPaperLengthCm = option.lengthCm
      selectedPaperLabel = option.label
      paperValidationMessage.style.display = 'none'
      if (isPaperSelectionMode && typeof proceedButton !== 'undefined') {
        proceedButton.disabled = !selectedPaperLengthCm
      }
    }

    const labelSpan = document.createElement('span')
    labelSpan.textContent = option.label
    labelSpan.style.fontSize = 'clamp(1rem, 2.5vmin, 1.3rem)'

    row.appendChild(radio)
    row.appendChild(labelSpan)

    return row
  }

  paperSelectionOptions.forEach(opt => {
    const row = createPaperOptionRow(opt)
    paperOptionsList.appendChild(row)
  })

  paperSelectionCard.appendChild(paperSelectionTitle)
  paperSelectionCard.appendChild(paperOptionsList)
  paperSelectionCard.appendChild(paperInlineWarning)
  paperSelectionCard.appendChild(paperSuggestionWrapper)
  paperSelectionCard.appendChild(paperImportantWarning)
  paperSelectionCard.appendChild(paperValidationMessage)
  paperSelectionContainer.appendChild(paperSelectionCard)
  container.appendChild(paperSelectionContainer)

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

    // Apply wood texture when not showing numeric length
    if (!showLength) {
      // Build an adjusted wood tile: crop bottom half of the source so vertical tiling has no empty gap
      let sourceSvg = woodSvg
      try {
        const pngMatch =
          woodSvg.match(/xlink:href="([^"]+)"/) ||
          woodSvg.match(/href="([^"]+)"/)
        const widthMatch = woodSvg.match(/width="([\\d.]+)px"/)
        const heightMatch = woodSvg.match(/height="([\\d.]+)px"/)
        const originalWidth = widthMatch
          ? Math.round(parseFloat(widthMatch[1]))
          : 6000
        const originalHeight = heightMatch
          ? Math.round(parseFloat(heightMatch[1]))
          : 3000
        const croppedHeight = Math.max(1, Math.round(originalHeight / 2))
        if (pngMatch && pngMatch[1]) {
          const pngHref = pngMatch[1]
          sourceSvg =
            `<svg xmlns="http://www.w3.org/2000/svg" ` +
            `xmlns:xlink="http://www.w3.org/1999/xlink" ` +
            `width="${originalWidth}px" height="${croppedHeight}px" ` +
            `viewBox="0 0 ${originalWidth} ${croppedHeight}">` +
            `<image xlink:href="${pngHref}" x="0" y="0" ` +
            `width="${originalWidth}" height="${originalHeight}" />` +
            `</svg>`
        }
      } catch (e) {
        // Fall back to original woodSvg if parsing fails
        sourceSvg = woodSvg
      }

      // Use inline SVG (cropped) as a data URL so it tiles and moves with the ruler
      const woodDataUrl = `url("data:image/svg+xml;utf8,${encodeURIComponent(sourceSvg)}")`
      diagonalTape.style.background = 'transparent'
      diagonalTape.style.backgroundImage = woodDataUrl
      diagonalTape.style.backgroundRepeat = 'repeat'
      diagonalTape.style.backgroundPosition = '0 0'
      // Make wood grain larger by mapping one tile to the tape height
      diagonalTape.style.backgroundSize = `auto ${Math.round(tapeWidth)}px`
    }

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
    if (!showLength) {
      dynamicLengthLabel.style.display = 'none'
    }

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
    if (!showLength) {
      arrowContainer.style.display = 'none'
    }

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
    // Store proportional positions (as ratios of screen dimensions)
    const currentStartProportionX = startX / screenWidth
    const currentEndProportionX = endX / screenWidth
    const currentStartProportionY = startY / screenHeight
    const currentEndProportionY = endY / screenHeight

    // Update screen dimensions
    const oldScreenWidth = screenWidth
    const oldScreenHeight = screenHeight
    screenWidth = window.innerWidth
    screenHeight = window.innerHeight

    // Maintain proportional positions
    startX = currentStartProportionX * screenWidth
    startY = currentStartProportionY * screenHeight
    endX = currentEndProportionX * screenWidth
    endY = currentEndProportionY * screenHeight

    // Update tape
    updateDiagonalLabels()
  }

  // Add window resize event listener (same as checkDistance.js)
  window.addEventListener('resize', updateDiagonalTapeOnResize)

  // ===================== RULER-SHIFT BUTTON =====================

  // Create the Ruler-Shift button (large left arrow above ruler)
  const rulerShiftButton = document.createElement('button')
  rulerShiftButton.id = 'ruler-shift-button'
  rulerShiftButton.innerHTML = '⬅'
  rulerShiftButton.style.position = 'fixed'
  rulerShiftButton.style.fontSize = '60pt' // 60 point arrow
  rulerShiftButton.style.width = '100px'
  rulerShiftButton.style.height = '100px'
  rulerShiftButton.style.backgroundColor = '#FFD700' // Bright gold/yellow
  rulerShiftButton.style.border = 'none' // No border
  rulerShiftButton.style.borderRadius = '50%' // Perfect circle
  rulerShiftButton.style.cursor = 'pointer'
  rulerShiftButton.style.zIndex = '100'
  rulerShiftButton.style.display = 'flex'
  rulerShiftButton.style.alignItems = 'center'
  rulerShiftButton.style.justifyContent = 'center'
  rulerShiftButton.style.boxShadow =
    '0 6px 16px rgba(255, 140, 0, 0.6), 0 0 20px rgba(255, 215, 0, 0.4)' // Glowing effect
  rulerShiftButton.style.transition =
    'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)' // Bouncy transition
  rulerShiftButton.style.fontWeight = 'bold'
  rulerShiftButton.style.lineHeight = '1'
  rulerShiftButton.style.padding = '0'
  rulerShiftButton.style.outline = 'none'
  rulerShiftButton.title = 'Click to shift ruler left and extend to fit screen'

  // Add pulsing animation to make it inviting
  const pulseKeyframes = `
    @keyframes ruler-shift-pulse {
      0%, 100% { transform: translate(-50%, 0) scale(1); }
      50% { transform: translate(-50%, 0) scale(1.08); }
    }
  `
  if (!document.getElementById('ruler-shift-pulse-style')) {
    const style = document.createElement('style')
    style.id = 'ruler-shift-pulse-style'
    style.textContent = pulseKeyframes
    document.head.appendChild(style)
  }
  rulerShiftButton.style.animation = 'ruler-shift-pulse 2s ease-in-out infinite'

  // Position button above the ruler (centered horizontally on screen, 25px above ruler)
  const positionRulerShiftButton = () => {
    const buttonX = screenWidth / 2 // Center horizontally (will use transform to center)
    // Use the actual ruler Y position (average of start and end Y, which should be the same)
    const rulerY = (startY + endY) / 2
    const rulerTopEdge = rulerY - tape.dimensions.tapeWidth / 2
    const buttonBottomEdge = rulerTopEdge - 25 // 25px gap above ruler
    const buttonY = buttonBottomEdge - 100 // Button is 100px tall, position by top edge
    rulerShiftButton.style.left = `${buttonX}px`
    rulerShiftButton.style.top = `${buttonY}px`
    rulerShiftButton.style.transform = 'translate(-50%, 0)' // Center the button on the X position
  }
  positionRulerShiftButton()

  // Update button position on window resize
  const originalResizeHandler = updateDiagonalTapeOnResize
  updateDiagonalTapeOnResize = function () {
    originalResizeHandler()
    positionRulerShiftButton()
  }

  // Add hover effects - make it more exciting!
  rulerShiftButton.addEventListener('mouseenter', () => {
    rulerShiftButton.style.animation = 'none' // Stop pulsing on hover
    rulerShiftButton.style.backgroundColor = '#FFA500' // Bright orange on hover
    rulerShiftButton.style.transform = 'translate(-50%, -5px) scale(1.15)' // Lift up and grow
    rulerShiftButton.style.boxShadow =
      '0 10px 25px rgba(255, 140, 0, 0.8), 0 0 30px rgba(255, 215, 0, 0.6)' // Stronger glow
  })

  rulerShiftButton.addEventListener('mouseleave', () => {
    rulerShiftButton.style.animation =
      'ruler-shift-pulse 2s ease-in-out infinite' // Resume pulsing
    rulerShiftButton.style.backgroundColor = '#FFD700'
    rulerShiftButton.style.transform = 'translate(-50%, 0) scale(1)'
    rulerShiftButton.style.boxShadow =
      '0 6px 16px rgba(255, 140, 0, 0.6), 0 0 20px rgba(255, 215, 0, 0.4)'
  })

  // Active state (when pressed)
  rulerShiftButton.addEventListener('mousedown', () => {
    if (!isAnimating) {
      rulerShiftButton.style.transform = 'translate(-50%, 2px) scale(1.05)' // Press down effect
      rulerShiftButton.style.boxShadow = '0 2px 8px rgba(255, 140, 0, 0.8)'
    }
  })

  // Animation state
  let isAnimating = false
  let animationFrameId = null

  // Function to cancel ongoing animation
  const cancelRulerShiftAnimation = () => {
    if (isAnimating) {
      isAnimating = false
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId)
        animationFrameId = null
      }
      rulerShiftButton.disabled = false
      rulerShiftButton.style.opacity = '1'
      rulerShiftButton.style.cursor = 'pointer'
      rulerShiftButton.style.animation =
        'ruler-shift-pulse 2s ease-in-out infinite' // Resume pulsing
      rulerShiftButton.style.transform = 'translate(-50%, 0) scale(1)' // Keep centered
      rulerShiftButton.style.backgroundColor = '#FFD700' // Restore gold color
    }
  }

  // Function to find the rightmost visible tick/number on the ruler
  const getRightmostVisibleTickX = () => {
    const distance = tape.helpers.getDistance(startX, startY, endX, endY)
    const objectLengthMm = distance / pxPerMm
    const objectLengthCm = objectLengthMm / 10

    // Determine spacing (same logic as updateRulerMarkings)
    let spacingInPx
    let numMarks

    if (!showLength) {
      if (!intervalCmCurrent) intervalCmCurrent = computeNewIntervalCm()
      spacingInPx = intervalCmCurrent * pxPerCm
      numMarks = Math.ceil(objectLengthCm / intervalCmCurrent)
    } else {
      const objectLengthInches = objectLengthCm / 2.54
      if (selectedUnit === 'inches') {
        spacingInPx = pxPerMm * 25.4
        numMarks = Math.ceil(objectLengthInches)
      } else {
        spacingInPx = pxPerMm * 10
        numMarks = Math.ceil(objectLengthCm)
      }
    }

    // Find the rightmost tick that's actually drawn
    let rightmostTickX = startX
    for (let i = 1; i <= numMarks; i++) {
      const markPosition = i * spacingInPx
      if (markPosition > distance) break
      rightmostTickX = startX + markPosition
    }

    return rightmostTickX
  }

  // Ruler-Shift animation function
  const performRulerShift = () => {
    if (isAnimating) return

    isAnimating = true
    rulerShiftButton.disabled = true
    rulerShiftButton.style.animation = 'none' // Stop pulsing during animation
    rulerShiftButton.style.opacity = '0.6'
    rulerShiftButton.style.cursor = 'not-allowed'
    rulerShiftButton.style.transform = 'translate(-50%, 0) scale(0.95)' // Keep centered, slightly smaller
    rulerShiftButton.style.backgroundColor = '#D3D3D3' // Gray out during animation

    const ANIMATION_SPEED = 200 // pixels per second (doubled from 100)
    const TARGET_MARGIN = 25 // pixels from edge

    let phase = 1 // Phase 1: slide left, Phase 2: extend right
    let lastTimestamp = performance.now()

    const animate = currentTimestamp => {
      const deltaTime = (currentTimestamp - lastTimestamp) / 1000 // Convert to seconds
      lastTimestamp = currentTimestamp

      const movement = ANIMATION_SPEED * deltaTime

      if (phase === 1) {
        // PHASE 1: Slide ruler left until rightmost tick is 25px from left edge
        const rightmostTickX = getRightmostVisibleTickX()
        const targetX = TARGET_MARGIN

        if (rightmostTickX > targetX + 1) {
          // +1 for tolerance
          // Calculate how much to move
          const distanceToMove = Math.min(movement, rightmostTickX - targetX)

          // Move both endpoints left by the same amount (solid object movement)
          // Maintain current Y position
          const currentTapeY = startY
          const newStartX = startX - distanceToMove
          const newEndX = endX - distanceToMove

          updateRulerEndpoints(
            newStartX,
            currentTapeY,
            newEndX,
            currentTapeY,
            true,
          )

          animationFrameId = requestAnimationFrame(animate)
        } else {
          // Phase 1 complete, move to phase 2
          phase = 2
          animationFrameId = requestAnimationFrame(animate)
        }
      } else if (phase === 2) {
        // PHASE 2: Extend right end until it's 25px from right edge
        const targetEndX = screenWidth - TARGET_MARGIN

        if (endX < targetEndX - 1) {
          // -1 for tolerance
          // Calculate how much to extend
          const distanceToExtend = Math.min(movement, targetEndX - endX)

          // Extend only the right end
          // Maintain current Y position
          const currentTapeY = startY
          const newEndX = endX + distanceToExtend
          const isStartOffScreen = startX < 0 || startX > screenWidth

          updateRulerEndpoints(
            startX,
            currentTapeY,
            newEndX,
            currentTapeY,
            isStartOffScreen,
          )

          animationFrameId = requestAnimationFrame(animate)
        } else {
          // Animation complete - restore button to normal state
          isAnimating = false
          rulerShiftButton.disabled = false
          rulerShiftButton.style.opacity = '1'
          rulerShiftButton.style.cursor = 'pointer'
          rulerShiftButton.style.animation =
            'ruler-shift-pulse 2s ease-in-out infinite' // Resume pulsing
          rulerShiftButton.style.transform = 'translate(-50%, 0) scale(1)' // Keep centered
          rulerShiftButton.style.backgroundColor = '#FFD700' // Restore gold color
        }
      }
    }

    animationFrameId = requestAnimationFrame(animate)
  }

  // Add click handler
  rulerShiftButton.addEventListener('click', e => {
    e.preventDefault()
    e.stopPropagation()
    performRulerShift()
    // Hide button after click
    rulerShiftButton.style.display = 'none'
  })

  // Add button to container (only show on page 2)
  rulerShiftButton.style.display = 'none'
  container.appendChild(rulerShiftButton)

  // ===================== TRIANGULAR TEXT BOXES FOR TAPE ENDS =====================

  // Create text box function with wrapping to fit on screen
  const createSimpleTextBox = (text, isLeft = true) => {
    // Container for the text box
    const textContainer = document.createElement('div')
    textContainer.style.position = 'absolute'
    textContainer.style.zIndex = '15'

    // Use a wider max width for wrapping (twice the original width)
    //1/3 of screen width
    const maxWidth = screenWidth / 3 // Max width in pixels for wrapping

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

    // Update dynamic length label and dimension line only when showing numeric length
    const objectLengthPx = distance
    const objectLengthMm = objectLengthPx / pxPerMm
    const objectLengthCm = objectLengthMm / 10
    objectLengthCmGlobal.value = objectLengthCm
    const objectLengthInches = objectLengthCm / 2.54

    if (showLength) {
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
    }

    // Update ruler markings
    updateRulerMarkings()
  }

  // Function to update ruler markings (tick marks and numbers)
  const updateRulerMarkings = () => {
    // Clear existing markings
    tape.elements.rulerMarkingsContainer.innerHTML = ''

    const distance = tape.helpers.getDistance(startX, startY, endX, endY)
    const angle = tape.helpers.getAngle(startX, startY, endX, endY)

    // Calculate length in cm
    const objectLengthMm = distance / pxPerMm
    const objectLengthCm = objectLengthMm / 10
    objectLengthCmGlobal.value = objectLengthCm

    // Determine spacing and total marks
    let spacingInPx
    let numMarks

    if (!showLength) {
      // Use randomized large interval per measurement (kept until SPACE)
      if (!intervalCmCurrent) intervalCmCurrent = computeNewIntervalCm()
      spacingInPx = intervalCmCurrent * pxPerCm
      numMarks = Math.ceil(objectLengthCm / intervalCmCurrent)
    } else {
      const objectLengthInches = objectLengthCm / 2.54
      if (selectedUnit === 'inches') {
        spacingInPx = pxPerMm * 25.4 // 1 inch in pixels
        numMarks = Math.ceil(objectLengthInches)
      } else {
        spacingInPx = pxPerMm * 10 // 1 cm in pixels
        numMarks = Math.ceil(objectLengthCm)
      }
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
    objectLengthCmGlobal.value = objectLengthCm
    const minDistanceCm = options.calibrateDistanceMinCm || 10

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
    tape.elements.rightVisualLine.style.boxShadow =
      '0 0 12px rgba(0, 0, 0, 0.6)'
  })
  tape.elements.rightHandle.addEventListener('mouseleave', () => {
    updateDiagonalColors() // This will restore correct shadow
  })

  // Function to update triangular labels when tape changes
  function updateDiagonalLabels() {
    if (isPaperSelectionMode) {
      objectLengthCmGlobal.value = 27.94
      return
    }
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

    // Update Ruler-Shift button position to stay centered and 25px above ruler
    if (typeof positionRulerShiftButton === 'function') {
      positionRulerShiftButton()
    }
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
    cancelRulerShiftAnimation() // Cancel animation if user manually adjusts
    leftDragging = true
    document.body.style.cursor = 'move'
    e.preventDefault()
    e.stopPropagation() // Prevent body drag
  })

  tape.elements.rightHandle.addEventListener('mousedown', e => {
    cancelRulerShiftAnimation() // Cancel animation if user manually adjusts
    rightDragging = true
    document.body.style.cursor = 'move'
    e.preventDefault()
    e.stopPropagation() // Prevent body drag
  })

  // Add body dragging for the tape
  tape.elements.diagonalTape.style.pointerEvents = 'auto'
  tape.elements.diagonalTape.style.cursor = 'move'
  tape.elements.diagonalTape.addEventListener('mousedown', e => {
    cancelRulerShiftAnimation() // Cancel animation if user manually adjusts
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

  // Helper function to update ruler endpoints
  const updateRulerEndpoints = (
    newStartX,
    newStartY,
    newEndX,
    newEndY,
    allowStartOffScreen = false,
  ) => {
    // Constrain Y coordinates to keep ruler on screen (with margins)
    const minY = tape.dimensions.tapeWidth // Minimum: top of screen + tape height
    const maxY = screenHeight - 30 // Maximum: near bottom of screen (30px margin)

    const constrainYToScreen = y => {
      return Math.max(minY, Math.min(maxY, y))
    }

    // Constrain end point to screen bounds (right end cannot leave screen)
    const constrainXToScreen = x => {
      return Math.max(0, Math.min(screenWidth, x))
    }

    const constrainedEndX = constrainXToScreen(newEndX)
    const constrainedEndY = constrainYToScreen(newEndY)

    // Start point can go beyond screen horizontally if allowStartOffScreen is true
    let constrainedStartX
    if (allowStartOffScreen) {
      // Allow start to go off screen horizontally (can be negative for left edge)
      constrainedStartX = newStartX
    } else {
      // Constrain start to screen bounds
      constrainedStartX = constrainXToScreen(newStartX)
    }

    // Y coordinates are always constrained for both start and end
    const constrainedStartY = constrainYToScreen(newStartY)

    // Calculate actual distance (even if start is off-screen)
    const distance = Math.abs(constrainedEndX - constrainedStartX)

    // Only apply minimum distance check if we're not allowing off-screen
    // This prevents the tape from "jumping" when the start goes off-screen
    if (!allowStartOffScreen && distance < 50) {
      // If too short, maintain current positions
      return
    }

    startX = constrainedStartX
    startY = constrainedStartY
    endX = constrainedEndX
    endY = constrainedEndY

    // Update button position immediately for smooth dragging (before other updates)
    positionRulerShiftButton()

    updateDiagonalLabels()
  }

  // Mouse move handler for horizontal tape handles and body
  window.addEventListener('mousemove', e => {
    if (leftDragging) {
      // Move left handle horizontally only (maintain current Y position)
      const mouseX = e.clientX
      const currentY = startY // Maintain current Y position
      updateRulerEndpoints(mouseX, currentY, endX, endY, true)
    } else if (rightDragging) {
      // Move right handle horizontally only (maintain current Y position)
      const mouseX = e.clientX
      const currentY = endY // Maintain current Y position
      const isStartOffScreen = startX < 0 || startX > screenWidth
      updateRulerEndpoints(startX, startY, mouseX, currentY, isStartOffScreen)
    } else if (bodyDragging) {
      // Move entire tape horizontally and vertically, maintaining length and horizontal orientation
      const deltaX = e.clientX - dragStartMouseX
      const deltaY = e.clientY - dragStartMouseY

      const newStartX = dragStartTapeStartX + deltaX
      const newEndX = dragStartTapeEndX + deltaX
      const newStartY = dragStartTapeStartY + deltaY
      const newEndY = dragStartTapeEndY + deltaY

      // Constrain end to screen bounds
      const constrainedEndX = Math.max(0, Math.min(screenWidth, newEndX))

      // If end would be constrained horizontally, calculate how much movement is actually allowed
      if (constrainedEndX !== newEndX) {
        // End hit a horizontal boundary - adjust both points to stop at the boundary
        const allowedDeltaX = constrainedEndX - dragStartTapeEndX
        const adjustedStartX = dragStartTapeStartX + allowedDeltaX
        const adjustedEndX = dragStartTapeEndX + allowedDeltaX

        // Update button position immediately BEFORE updateRulerEndpoints for smooth tracking
        // Calculate button position directly from new coordinates
        const minY = tape.dimensions.tapeWidth
        const maxY = screenHeight - 30
        const constrainedNewStartY = Math.max(minY, Math.min(maxY, newStartY))
        const constrainedNewEndY = Math.max(minY, Math.min(maxY, newEndY))
        const newRulerY = (constrainedNewStartY + constrainedNewEndY) / 2
        const newRulerTopEdge = newRulerY - tape.dimensions.tapeWidth / 2
        const newButtonBottomEdge = newRulerTopEdge - 25
        const newButtonY = newButtonBottomEdge - 100
        rulerShiftButton.style.top = `${newButtonY}px`

        updateRulerEndpoints(
          adjustedStartX,
          newStartY,
          adjustedEndX,
          newEndY,
          true,
        )
      } else {
        // Normal movement - end is not constrained horizontally

        // Update button position immediately BEFORE updateRulerEndpoints for smooth tracking
        // Calculate button position directly from new coordinates
        const minY = tape.dimensions.tapeWidth
        const maxY = screenHeight - 30
        const constrainedNewStartY = Math.max(minY, Math.min(maxY, newStartY))
        const constrainedNewEndY = Math.max(minY, Math.min(maxY, newEndY))
        const newRulerY = (constrainedNewStartY + constrainedNewEndY) / 2
        const newRulerTopEdge = newRulerY - tape.dimensions.tapeWidth / 2
        const newButtonBottomEdge = newRulerTopEdge - 25
        const newButtonY = newButtonBottomEdge - 100
        rulerShiftButton.style.top = `${newButtonY}px`

        updateRulerEndpoints(newStartX, newStartY, newEndX, newEndY, true)
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

    // Cancel animation if user manually adjusts with arrow keys
    cancelRulerShiftAnimation()

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
      // Use current Y position (ruler maintains its vertical position)
      const currentTapeY = startY

      if (currentArrowKey === 'ArrowLeft') {
        // Move right side closer to left (shrink from right)
        const newEndX = endX - moveAmount
        updateRulerEndpoints(
          startX,
          currentTapeY,
          newEndX,
          currentTapeY,
          isStartOffScreen,
        )
      } else if (currentArrowKey === 'ArrowRight') {
        // Move right side away from left (extend from right)
        const newEndX = endX + moveAmount
        updateRulerEndpoints(
          startX,
          currentTapeY,
          newEndX,
          currentTapeY,
          isStartOffScreen,
        )
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

  // Function to reset page 2 for next measurement
  const resetPage2ForNextMeasurement = async () => {
    console.log(
      `=== RESETTING PAGE 2 FOR MEASUREMENT ${measurementState.currentIteration}/${measurementState.totalIterations} ===`,
    )

    // Reset tape to default/initial position
    startX = leftMarginPx
    endX = leftMarginPx + initialRulerLengthPx
    // startY and endY stay the same (horizontal tape)

    // Update the visual representation
    updateDiagonalLabels()

    // Update title with current progress (only for page 2)
    updateTitleWithProgress()

    // Update instructions for subsequent measurements
    updateInstructions()
    // Generate a fresh interval for this measurement when not showing length
    if (!showLength) {
      intervalCmCurrent = computeNewIntervalCm()
      updateRulerMarkings()
    }
  }

  const showPage = async pageNumber => {
    const previousPage = currentPage
    currentPage = pageNumber

    if (pageNumber === 0) {
      // ===================== PAGE 0: INSTRUCTIONS ONLY =====================
      console.log('=== SHOWING PAGE 0: INSTRUCTIONS ONLY ===')

      // Reset title to default (no progress counter)
      resetTitleToDefault()

      // Show video on page 0
      RC.showVideo(true)

      // Position video properly
      const videoContainer = document.getElementById('webgazerVideoContainer')
      if (videoContainer) {
        setDefaultVideoPosition(RC, videoContainer)
      }

      // Hide Ruler-Shift button on page 0
      rulerShiftButton.style.display = 'none'

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
      setInstructionsText(phrases.RC_UseObjectToSetViewingDistancePage0q[RC.L])

      // Hide dontUseRuler column on page 0
      dontUseRulerColumn.style.display = 'none'
      paperSelectionContainer.style.display = 'none'
      container.style.backgroundColor = ''
    } else if (pageNumber === 1) {
      // ===================== PAGE 1: NO LINES =====================
      console.log('=== SHOWING PAGE 1: NO LINES ===')
      paperSelectionContainer.style.display = 'none'
      container.style.backgroundColor = ''

      // Show video on page 1
      RC.showVideo(true)

      // Position video properly
      const videoContainer = document.getElementById('webgazerVideoContainer')
      if (videoContainer) {
        setDefaultVideoPosition(RC, videoContainer)
      }

      // Hide Ruler-Shift button on page 1
      rulerShiftButton.style.display = 'none'

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
      setInstructionsText(phrases.RC_UseObjectToSetViewingDistancePage1[RC.L])
    } else if (pageNumber === 2) {
      // ===================== PAGE 2: DIAGONAL TAPE =====================
      console.log('=== SHOWING PAGE 2: DIAGONAL TAPE ===')

      // Hide paper selection unless we are in paper mode
      if (!isPaperSelectionMode) paperSelectionContainer.style.display = 'none'

      if (isPaperSelectionMode) {
        container.style.backgroundColor = ''
        // Show a "Distance (1 of X)" style title in paper-selection mode too.
        title.style.display = 'block'
        // Page 2 is always the first step in paper-selection mode.
        viewingDistanceMeasurementCount = 1
        renderViewingDistanceProgressTitle()
        // Tighten instructions margin only for paper mode on page 2
        instructionsContainer.style.margin = '0 0 0 0'

        // IMPORTANT: When returning to page 2 from pages 3/4, the step-by-step
        // instruction renderer may still be showing the tape/object UI content.
        // In paper-selection mode, page 2 should ONLY show the paper selection UI.
        stepInstructionModel = null
        currentStepFlatIndex = 0
        if (leftInstructionsText) leftInstructionsText.textContent = ''
        if (rightInstructionsText) rightInstructionsText.textContent = ''
        if (sectionMediaContainer) sectionMediaContainer.innerHTML = ''

        // Hide unused UI
        if (arrowIndicators) {
          arrowIndicators.remove()
          arrowIndicators = null
        }
        RC.showVideo(false)
        tape.container.style.display = 'none'
        if (leftLabel.container.parentNode) {
          leftLabel.container.parentNode.removeChild(leftLabel.container)
        }
        if (rightLabel.container.parentNode) {
          rightLabel.container.parentNode.removeChild(rightLabel.container)
        }
        unitRadioContainer.style.display = 'none'
        dontUseRulerColumn.style.display = 'none'
        rulerShiftButton.style.display = 'none'
        explanationButton.style.display = 'none'

        // Show paper selection UI
        paperSelectionContainer.style.display = 'flex'
        paperValidationMessage.style.display = 'none'
        proceedButton.style.display = 'block'
        proceedButton.disabled = !selectedPaperLengthCm

        // Keep proceed button fixed at bottom right of screen
        buttonContainer.style.position = 'fixed'
        buttonContainer.style.bottom = '20px'
        if (RC.LD === RC._CONST.RTL) {
          buttonContainer.style.left = '20px'
          buttonContainer.style.right = ''
        } else {
          buttonContainer.style.right = '20px'
          buttonContainer.style.left = ''
        }
        RC.background.appendChild(buttonContainer)

        // Clear right column so warnings render under radios instead
        if (rightInstructionsText) {
          rightInstructionsText.textContent = ''
        }
      } else {
        container.style.backgroundColor = ''
        // Restore default button position (fixed at bottom right)
        buttonContainer.style.position = 'fixed'
        buttonContainer.style.bottom = '230px'
        if (RC.LD === RC._CONST.RTL) {
          buttonContainer.style.left = '20px'
          buttonContainer.style.right = ''
        } else {
          buttonContainer.style.right = '20px'
          buttonContainer.style.left = ''
        }
        RC.background.appendChild(buttonContainer)
        // Hide paper mode warning if present
        if (rightInstructionsText) {
          rightInstructionsText.textContent = ''
        }
        // Restore title for non-paper modes
        title.style.display = 'block'
        updateTitleWithProgress()

        // Update title with progress counter (for page 2 only)
        updateTitleWithProgress()

        // Restore default instructions margin
        instructionsContainer.style.margin = '2rem 0 5rem 0'

        // Hide arrow indicators on page 2
        if (arrowIndicators) {
          arrowIndicators.remove()
          arrowIndicators = null
        }

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

        // Show unit selection radio buttons on page 2 only when length is shown
        unitRadioContainer.style.display = showLength ? 'flex' : 'none'

        // // Hide radio buttons on page 2
        // radioContainer.style.display = 'none'

        // Hide PROCEED button on page 2 - only allow space key
        proceedButton.style.display = 'none'

        // Hide explanation button on page 2
        explanationButton.style.display = 'block' //show explanation button on page 2

        // Show dontUseRuler column on page 2 if calibrateDistanceCheckBool is true
        if (options.calibrateDistanceCheckBool) {
          dontUseRulerColumn.style.display = 'block'
          dontUseRulerColumn.innerText = phrases.RC_DontUseYourRulerYet[RC.L]
          dontUseRulerColumn.style.color = '#8B0000' // Dark red ink
          dontUseRulerColumn.style.fontWeight = 'normal'
          dontUseRulerColumn.style.userSelect = 'none'
        }

        // Update all positions and colors after showing lines
        updateDiagonalLabels()

        // Ruler-Shift button will be shown by renderCurrentStepView() after step 2.2
        // Initially hide it when page 2 first loads
        rulerShiftButton.style.display = 'none'

        // Update instructions based on current iteration (first vs subsequent)
        updateInstructions()
        // Initialize the randomized interval for this measurement if needed
        if (!showLength) {
          intervalCmCurrent = computeNewIntervalCm()
          updateRulerMarkings()
        }
      }
    } else if (pageNumber === 3) {
      // ===================== PAGE 3: VIDEO ONLY =====================
      console.log('=== SHOWING PAGE 3: VIDEO ONLY ===')
      paperSelectionContainer.style.display = 'none'
      container.style.backgroundColor = ''
      // Always show title from page 3 onward (even in paper mode) and restore margins
      title.style.display = 'block'
      instructionsContainer.style.margin = '2rem 0 5rem 0'

      // Increment measurement count only when *entering* page 3 (avoid double-counting on re-show).
      if (previousPage !== 3) {
        viewingDistanceMeasurementCount++
      }
      renderViewingDistanceProgressTitle()

      console.log(
        `Page 3 title: Measurement ${viewingDistanceMeasurementCount} of ${viewingDistanceTotalExpected}`,
      )

      // Show video on page 3
      RC.showVideo(true)

      // Position video properly
      const videoContainer = document.getElementById('webgazerVideoContainer')
      if (videoContainer) {
        setDefaultVideoPosition(RC, videoContainer)
      }

      // Ensure the video preview doesn't occlude the stepper/instructions (pages 3+).
      // We only push the instructions down when the video is positioned above them.
      const ensureInstructionsBelowVideo = (gapPx = 16) => {
        const v = document.getElementById('webgazerVideoContainer')
        if (!v) return
        const apply = () => {
          try {
            // Reset to the default margin first (avoid compounding on repeated calls)
            instructionsContainer.style.marginTop = ''
            const vRect = v.getBoundingClientRect()
            const iRect = instructionsContainer.getBoundingClientRect()
            // Only adjust when the video is above the instructions (top overlap scenario)
            if (vRect.top <= iRect.top + 1) {
              const overlapPx = vRect.bottom + gapPx - iRect.top
              if (overlapPx > 0) {
                const baseTop =
                  parseFloat(
                    getComputedStyle(instructionsContainer).marginTop,
                  ) || 0
                instructionsContainer.style.marginTop = `${Math.ceil(
                  baseTop + overlapPx,
                )}px`
              }
            }
            // Record the final marginTop so page 4 can match it for a seamless transition.
            page3InstructionsMarginTopPx =
              parseFloat(getComputedStyle(instructionsContainer).marginTop) || 0
          } catch {}
        }
        requestAnimationFrame(() => {
          apply()
          // Run again shortly after in case the video container resizes/finishes layout
          setTimeout(apply, 50)
        })
      }
      ensureInstructionsBelowVideo(18)

      // Hide Ruler-Shift button on page 3
      rulerShiftButton.style.display = 'none'

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

      // Update instructions using step-by-step renderer with Markdown
      try {
        // Bypass test_phrases, use phrases directly
        const p3Text =
          (phrases.RC_UseObjectToSetViewingDistancePage3?.[RC.L] || '') + ''
        stepInstructionModel = parseInstructions(p3Text, {
          assetMap: test_assetMap,
        })
        currentStepFlatIndex = 0
        renderCurrentStepView()
      } catch (e) {
        console.warn(
          'Failed to parse step instructions for Page 3; using plain text',
          e,
        )
        setInstructionsText(phrases.RC_UseObjectToSetViewingDistancePage3[RC.L])
      }

      // Hide dontUseRuler column on page 3
      dontUseRulerColumn.style.display = 'none'

      // Show arrow indicators pointing to top-center of screen (camera position)
      if (arrowIndicators) {
        arrowIndicators.remove()
      }
      const cameraXYPx = [window.innerWidth / 2, 0] // Top center
      arrowIndicators = createArrowIndicators(cameraXYPx)
      RC.background.appendChild(arrowIndicators)
      console.log('Arrow indicators added for page 3, pointing to top-center')

      // Note: Face Mesh samples will be collected when space key is pressed
      console.log(
        '=== PAGE 3 READY - PRESS SPACE TO CAPTURE FACE MESH DATA ===',
      )
    } else if (pageNumber === 4) {
      // ===================== PAGE 4: VIDEO ONLY =====================
      console.log('=== SHOWING PAGE 4: VIDEO ONLY ===')
      paperSelectionContainer.style.display = 'none'
      container.style.backgroundColor = ''
      // Always show title from page 4 onward (even in paper mode) and restore margins
      title.style.display = 'block'
      instructionsContainer.style.margin = '2rem 0 5rem 0'

      // Increment measurement count only when *entering* page 4 (avoid double-counting on re-show).
      if (previousPage !== 4) {
        viewingDistanceMeasurementCount++
      }
      renderViewingDistanceProgressTitle()

      console.log(
        `Page 4 title: Measurement ${viewingDistanceMeasurementCount} of ${viewingDistanceTotalExpected}`,
      )

      // Show video on page 4
      RC.showVideo(true)

      // Position video at screen center for page 4
      const videoContainer = document.getElementById('webgazerVideoContainer')
      if (videoContainer) {
        // Position video centered within viewport
        const videoWidth =
          parseInt(videoContainer.style.width) ||
          parseInt(videoContainer.offsetWidth) ||
          0
        const videoHeight =
          parseInt(videoContainer.style.height) ||
          parseInt(videoContainer.offsetHeight) ||
          0
        const viewportWidth =
          window.innerWidth || document.documentElement.clientWidth
        const viewportHeight =
          window.innerHeight || document.documentElement.clientHeight

        videoContainer.style.zIndex = 999999999999
        videoContainer.style.left = `${viewportWidth / 2 - videoWidth / 2}px`
        videoContainer.style.top = `${viewportHeight / 2 - videoHeight / 2}px`
        videoContainer.style.right = 'unset'
        videoContainer.style.bottom = 'unset'
        videoContainer.style.transform = 'none'
      }

      // Ensure the video preview doesn't occlude the stepper/instructions (only adjust if video is above instructions).
      const ensureInstructionsBelowVideo = (gapPx = 16) => {
        const v = document.getElementById('webgazerVideoContainer')
        if (!v) return
        const apply = () => {
          try {
            instructionsContainer.style.marginTop = ''
            const vRect = v.getBoundingClientRect()
            const iRect = instructionsContainer.getBoundingClientRect()
            if (vRect.top <= iRect.top + 1) {
              const overlapPx = vRect.bottom + gapPx - iRect.top
              if (overlapPx > 0) {
                const baseTop =
                  parseFloat(
                    getComputedStyle(instructionsContainer).marginTop,
                  ) || 0
                instructionsContainer.style.marginTop = `${Math.ceil(
                  baseTop + overlapPx,
                )}px`
              }
            }
          } catch {}
        }
        requestAnimationFrame(() => {
          apply()
          setTimeout(apply, 50)
        })
      }
      ensureInstructionsBelowVideo(18)

      // Even though page 4's video is not top-centered, keep instructions at least as low as
      // page 3 had them (visual continuity between pages).
      const matchPage3InstructionsOffset = () => {
        if (page3InstructionsMarginTopPx == null) return
        const current =
          parseFloat(getComputedStyle(instructionsContainer).marginTop) || 0
        if (current < page3InstructionsMarginTopPx) {
          instructionsContainer.style.marginTop = `${Math.ceil(
            page3InstructionsMarginTopPx,
          )}px`
        }
      }
      requestAnimationFrame(() => {
        matchPage3InstructionsOffset()
        setTimeout(matchPage3InstructionsOffset, 60)
      })

      // Hide Ruler-Shift button on page 4
      rulerShiftButton.style.display = 'none'

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

      // Update instructions using step-by-step renderer with Markdown
      try {
        // Bypass test_phrases, use phrases directly
        // Prefer the generic stepper Page 4 text (so instructions don't hardcode a screen corner),
        // but fall back to the legacy "LowerRight" key for backward compatibility.
        const p4Text =
          (phrases.RC_UseObjectToSetViewingDistanceCenterPage4?.[RC.L] || '') +
          ''
        stepInstructionModel = parseInstructions(p4Text, {
          assetMap: test_assetMap,
        })
        currentStepFlatIndex = 0
        renderCurrentStepView()
      } catch (e) {
        console.warn(
          'Failed to parse step instructions for Page 4; using plain text',
          e,
        )
        setInstructionsText(
          phrases.RC_UseObjectToSetViewingDistanceStepperPage4?.[RC.L] ||
            phrases.RC_UseObjectToSetViewingDistanceCenterPage4?.[RC.L] ||
            '',
        )
      }

      // Hide dontUseRuler column on page 4
      dontUseRulerColumn.style.display = 'none'

      // Show arrow indicators pointing to screen center
      if (arrowIndicators) {
        arrowIndicators.remove()
      }
      const centerXYPx = [window.innerWidth / 2, window.innerHeight / 2] // Screen center
      arrowIndicators = createArrowIndicators(centerXYPx)
      RC.background.appendChild(arrowIndicators)
      console.log(
        'Arrow indicators added for page 4, pointing to screen center',
      )

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
      if (isPaperSelectionMode) {
        if (!selectedPaperOption || selectedPaperLengthCm === null) {
          paperValidationMessage.textContent =
            phrases.RC_PleaseSelectAnOption[RC.L]
          paperValidationMessage.style.display = 'block'
          if (typeof proceedButton !== 'undefined') {
            proceedButton.disabled = true
          }
          return false
        }

        const paperTimestamp = performance.now()
        firstMeasurement = selectedPaperLengthCm
        objectLengthCmGlobal.value = selectedPaperLengthCm

        const roundedLength =
          Math.round(Number(selectedPaperLengthCm) * 10) / 10
        objectTestCommonData.objectMeasuredMsg.push('ok')
        // objectTestCommonData.objectLengthCm.push(roundedLength)

        objectTestCommonData.objectRulerIntervalCm.push(null)

        measurementState.measurements.push({
          objectLengthCm: selectedPaperLengthCm,
          objectLengthPx: null,
          objectLengthMm: selectedPaperLengthCm * 10,
          timestamp: paperTimestamp,
          selectedUnit: 'paper',
          paperOption: selectedPaperOption,
          objectSuggestion: paperSuggestionValue || null,
        })
        measurementState.currentIteration = measurementState.totalIterations

        savedMeasurementData = {
          value: toFixedNumber(selectedPaperLengthCm, 1),
          timestamp: paperTimestamp,
          method: 'object',
          objectSuggestion: paperSuggestionValue || null,
          intraocularDistanceCm: null,
          faceMeshSamplesPage3: faceMeshSamplesPage3.map(sample =>
            isNaN(sample) ? sample : Math.round(sample),
          ),
          faceMeshSamplesPage4: faceMeshSamplesPage4.map(sample =>
            isNaN(sample) ? sample : Math.round(sample),
          ),
          raw: {
            paperOption: selectedPaperOption,
            paperLabel:
              paperSelectionOptions.find(o => o.key === selectedPaperOption)
                ?.label || '',
            paperLengthCm: selectedPaperLengthCm,
            objectSuggestion: paperSuggestionValue || null,
            ppi: ppi,
          },
        }

        await showPage(3)
        return true
      }
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
      objectLengthCmGlobal.value = objectLengthCm
      // Store this measurement
      measurementState.measurements.push({
        objectLengthCm: objectLengthCm,
        objectLengthPx: objectLengthPx,
        objectLengthMm: objectLengthMm,
        timestamp: performance.now(),
        startX,
        startY,
        endX,
        endY,
        selectedUnit: selectedUnit,
      })

      console.log(
        `Measurement ${measurementState.currentIteration} saved:`,
        objectLengthCm.toFixed(1),
        'cm',
      )

      // If only 1 measurement requested, accept it immediately
      if (measurementState.totalIterations === 1) {
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
          raw: {
            startX,
            startY,
            endX,
            endY,
            screenWidth,
            objectLengthPx,
            objectLengthMm,
            ppi: ppi,
            selectedUnit: selectedUnit,
          },
        }
        console.log('Single measurement accepted:', savedMeasurementData)
        objectTestCommonData.objectMeasuredMsg.push('ok')
        // objectTestCommonData.objectLengthCm =
        //   Math.round(Number(objectLengthCm) * 10) / 10
        await showPage(3)
        return
      }

      // Check if we need more measurements to reach minimum count
      if (
        measurementState.currentIteration < measurementState.totalIterations
      ) {
        measurementState.currentIteration++
        console.log(
          `Need more measurements: ${measurementState.currentIteration}/${measurementState.totalIterations}`,
        )
        objectTestCommonData.objectMeasuredMsg.push(
          measurementState.lastAttemptWasTooShort ? 'short' : 'ok',
        )
        // Reset tape and stay on page 2
        await resetPage2ForNextMeasurement()
        return
      }

      // We've done minimum N measurements - now check for consistency of last 2
      const consistentPair = checkLastTwoObjectMeasurements(
        measurementState.measurements,
        options.objectMeasurementConsistencyThreshold,
      )

      if (consistentPair) {
        // Found 2 consistent measurements! Use geometric mean
        const geoMean = Math.sqrt(
          consistentPair.values[0] * consistentPair.values[1],
        )
        measurementState.consistentPair = consistentPair
        objectTestCommonData.objectMeasuredMsg.push('ok')
        // objectTestCommonData.objectLengthCm =
        //   Math.round(Number(geoMean) * 10) / 10

        console.log(
          'Found consistent pair:',
          consistentPair.values,
          '→ geometric mean:',
          geoMean.toFixed(1),
        )

        // Use the first measurement's data as template, but with geometric mean value
        const firstMeasurement =
          measurementState.measurements[consistentPair.indices[0]]

        savedMeasurementData = {
          value: toFixedNumber(geoMean, 1),
          timestamp: performance.now(),
          method: 'object',
          intraocularDistanceCm: null,
          faceMeshSamplesPage3: faceMeshSamplesPage3.map(sample =>
            isNaN(sample) ? sample : Math.round(sample),
          ),
          faceMeshSamplesPage4: faceMeshSamplesPage4.map(sample =>
            isNaN(sample) ? sample : Math.round(sample),
          ),
          raw: {
            startX: firstMeasurement.startX,
            startY: firstMeasurement.startY,
            endX: firstMeasurement.endX,
            endY: firstMeasurement.endY,
            screenWidth,
            objectLengthPx: firstMeasurement.objectLengthPx,
            objectLengthMm: firstMeasurement.objectLengthMm,
            ppi: ppi,
            selectedUnit: selectedUnit,
          },
        }

        // Save measurement details to RC
        RC.objectMeasurements = {
          future: 'To be deleted by end of November 2025.',
          objectLengthCm: measurementState.measurements.map(m =>
            toFixedNumber(m.objectLengthCm, 1),
          ),
          chosen: consistentPair.values.map(v => toFixedNumber(v, 1)),
          mean: toFixedNumber(geoMean, 1),
        }

        console.log(
          'Proceeding to page 3 with geometric mean:',
          geoMean.toFixed(1),
        )
        await showPage(3)
      } else {
        // No consistent pair found
        console.log(
          `consistentPair is null. objectMeasurementCount=${options.objectMeasurementCount}, type=${typeof options.objectMeasurementCount}`,
        )
        console.log(
          `Number of measurements: ${measurementState.measurements.length}`,
        )

        // If objectMeasurementCount is 2, show popup with error message
        if (
          options.objectMeasurementCount === 2 &&
          measurementState.measurements.length >= 2
        ) {
          // Calculate ratio for the last two measurements to show in popup
          const lastIdx = measurementState.measurements.length - 1
          const secondLastIdx = measurementState.measurements.length - 2
          const M1 = measurementState.measurements[secondLastIdx].objectLengthCm
          const M2 = measurementState.measurements[lastIdx].objectLengthCm
          const ratio = M2 / M1 // Current / Previous

          console.log(
            `///Consistency check failed. Ratio: ${toFixedNumber(ratio, 2)}. Showing popup.`,
          )
          console.log(`///M1=${M1}, M2=${M2}, ratio=${ratio}`)

          const errorMessage =
            phrases.RC_objectSizeMismatch?.[RC.L]?.replace(
              '[[N1]]',
              toFixedNumber(ratio, 2).toString(),
            ) ||
            `Measurements are inconsistent. Ratio: ${toFixedNumber(ratio, 2)}`

          // Show popup (only accept Return/Enter, not spacebar)
          const preventSpacebar = e => {
            if (e.key === ' ' || e.code === 'Space') {
              e.preventDefault()
              e.stopPropagation()
            }
          }

          await Swal.fire({
            ...swalInfoOptions(RC, { showIcon: false }),
            icon: undefined,
            html: errorMessage,
            allowEnterKey: true,
            confirmButtonText:
              phrases.T_ok?.[RC.L] || phrases.RC_OK?.[RC.L] || 'OK',
            didOpen: () => {
              // Prevent spacebar from closing the popup
              document.addEventListener('keydown', preventSpacebar, true)
            },
            willClose: () => {
              // Clean up the event listener
              document.removeEventListener('keydown', preventSpacebar, true)
            },
          })

          // Increment rejection counter for mismatched measurements
          measurementState.rejectionCount++
          console.log(
            `Rejection count (mismatch): ${measurementState.rejectionCount}`,
          )

          // Show pause before allowing new object (with exponentially growing duration)
          await showPauseBeforeNewObject(RC, measurementState.rejectionCount)
        }

        objectTestCommonData.objectMeasuredMsg.push('mismatch')

        // After popup (or if no popup), continue measuring
        measurementState.currentIteration++
        console.log('No consistent measurements found yet, continuing...')
        await resetPage2ForNextMeasurement()
      }
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
          options.calibrateDistancePupil,
          RC.calibrateDistanceIpdUsesZBool !== false,
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

    // Clean up arrow indicators
    if (arrowIndicators) {
      arrowIndicators.remove()
      arrowIndicators = null
    }

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
    if (options.calibrateDistanceCheckBool) {
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
    // In paper-selection mode, page 2 is not a tape measurement. Avoid recording
    // misleading tape-derived pixel/mm values in logs or raw output.
    let objectLengthPx = null
    let objectLengthMm = null
    if (!isPaperSelectionMode) {
      // Calculate the length of the object in pixels by finding the difference
      // between the right and left line positions
      objectLengthPx = tape.helpers.getDistance(startX, startY, endX, endY)

      // Convert the pixel length to millimeters using the screen's PPI
      // pxPerMm was calculated earlier as ppi/25.4 (pixels per inch / mm per inch)
      objectLengthMm = objectLengthPx / pxPerMm

      // ===================== CONSOLE LOGGING =====================
      // Log the measured distance in different units for debugging
      console.log('=== Object Test Measurement Results ===')
      console.log(`Distance in pixels: ${objectLengthPx.toFixed(2)}px`)
      console.log(`Distance in millimeters: ${objectLengthMm.toFixed(2)}mm`)
      console.log(
        `Distance in centimeters: ${(objectLengthMm / 10).toFixed(2)}cm`,
      )
      console.log('=====================================')
    }

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
        paperOption: isPaperSelectionMode ? selectedPaperOption : null,
        paperLabel: isPaperSelectionMode
          ? selectedPaperLabel ||
            paperSelectionOptions.find(o => o.key === selectedPaperOption)
              ?.label ||
            null
          : null,
        paperLengthCm: isPaperSelectionMode ? selectedPaperLengthCm : null,
        objectSuggestion: isPaperSelectionMode ? paperSuggestionValue : null,
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
      objectSuggestion: isPaperSelectionMode ? paperSuggestionValue : null,
      objectName: selectedPaperOption
        ? paperSelectionOptions.find(o => o.key === selectedPaperOption)
            ?.label || ''
        : null,
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
      feedbackDiv.style.backgroundColor = 'rgba(255, 255, 255, 0.95)'
      feedbackDiv.style.maxHeight = '80vh'
      feedbackDiv.style.overflowY = 'auto'
      feedbackDiv.style.fontSize = '11px'

      // Build geometric calculation details HTML
      let geometricCalcHtml = ''
      if (RC.page4GeometricCalc) {
        const g = RC.page4GeometricCalc
        geometricCalcHtml = `
          <div style="margin-top: 10px; border-top: 1px solid #ccc; padding-top: 10px;">
            <div style="font-weight: bold; margin-bottom: 5px;">📐 Page 4 Geometric Calculation:</div>
            <div style="margin-left: 10px;">
              <div style="color: #0066cc; font-weight: bold;">Input Values:</div>
              <div>  objectLengthCm = ${g.objectLengthCm.toFixed(2)}</div>
              <div>  ipdVpx = ${g.ipdVpx.toFixed(2)}</div>
              <div>  nearestXYPx_left = [${g.nearestXYPx_left[0].toFixed(1)}, ${g.nearestXYPx_left[1].toFixed(1)}]</div>
              <div>  nearestXYPx_right = [${g.nearestXYPx_right[0].toFixed(1)}, ${g.nearestXYPx_right[1].toFixed(1)}]</div>
              <div>  cameraXYPx = [${g.cameraXYPx[0].toFixed(1)}, ${g.cameraXYPx[1].toFixed(1)}]</div>
              <div>  pointXYPx (screen center) = [${g.pointXYPx[0].toFixed(1)}, ${g.pointXYPx[1].toFixed(1)}]</div>
              
              <div style="color: #0066cc; font-weight: bold; margin-top: 8px;">Step 1: Calculate foot position (mean of left & right eye feet)</div>
              <div>  footXYPx = mean(nearestXYPx_left, nearestXYPx_right)</div>
              <div>  footXYPx = [${g.footXYPx[0].toFixed(1)}, ${g.footXYPx[1].toFixed(1)}]</div>
              
              <div style="color: #0066cc; font-weight: bold; margin-top: 8px;">Step 2: Calculate pointToFootCm</div>
              <div>  pointToFootCm = norm(pointXYPx - footXYPx) / pxPerCm</div>
              <div>  pointToFootCm = sqrt((${g.pointXYPx[0].toFixed(1)} - ${g.footXYPx[0].toFixed(1)})² + (${g.pointXYPx[1].toFixed(1)} - ${g.footXYPx[1].toFixed(1)})²) / ${(ppi / 2.54).toFixed(2)}</div>
              <div>  <strong>pointToFootCm = ${g.pointToFootCm.toFixed(2)} cm</strong></div>
              
              <div style="color: #0066cc; font-weight: bold; margin-top: 8px;">Step 3: Calculate footToCameraCm</div>
              <div>  footToCameraCm = norm(footXYPx - cameraXYPx) / pxPerCm</div>
              <div>  footToCameraCm = sqrt((${g.footXYPx[0].toFixed(1)} - ${g.cameraXYPx[0].toFixed(1)})² + (${g.footXYPx[1].toFixed(1)} - ${g.cameraXYPx[1].toFixed(1)})²) / ${(ppi / 2.54).toFixed(2)}</div>
              <div>  <strong>footToCameraCm = ${g.footToCameraCm.toFixed(2)} cm</strong></div>
              
              <div style="color: #0066cc; font-weight: bold; margin-top: 8px;">Step 4: Set eyeToPointCm = objectLengthCm</div>
              <div>  <strong>eyeToPointCm = ${g.eyeToPointCm.toFixed(2)} cm</strong></div>
              
              <div style="color: #0066cc; font-weight: bold; margin-top: 8px;">Step 5: Calculate eyeToFootCm (Pythagorean theorem)</div>
              <div>  eyeToFootCm = sqrt(eyeToPointCm² - pointToFootCm²)</div>
              <div>  eyeToFootCm = sqrt(${g.eyeToPointCm.toFixed(2)}² - ${g.pointToFootCm.toFixed(2)}²)</div>
              <div>  <strong>eyeToFootCm = ${g.eyeToFootCm.toFixed(2)} cm</strong></div>
              
              <div style="color: #0066cc; font-weight: bold; margin-top: 8px;">Step 6: Calculate eyeToScreenCm (parallel to optical axis)</div>
              <div>  eyeToScreenCm = eyeToFootCm</div>
              <div>  eyeToScreenCm = ${g.eyeToFootCm.toFixed(2)}</div>
              <div>  <strong>eyeToScreenCm = ${g.eyeToFootCm.toFixed(2)} cm</strong></div>
              
              <div style="color: #0066cc; font-weight: bold; margin-top: 8px;">Step 7: Calculate factorVpxCm</div>
              <div>  factorVpxCm = ipdVpx × eyeToScreenCm</div>
              <div>  factorVpxCm = ${g.ipdVpx.toFixed(2)} × ${g.eyeToFootCm.toFixed(2)}</div>
              <div style="color: #cc0000; font-weight: bold;">  ✓ page4FactorCmPx = ${g.page4FactorCmPx.toFixed(2)}</div>
            </div>
          </div>
        `
      }

      feedbackDiv.innerHTML = `
        <div style="position: absolute; top: 5px; right: 5px; cursor: pointer; font-weight: bold; font-size: 16px; color: #666;" onclick="this.parentElement.remove()">×</div>
        <div style="margin-top: 10px; font-weight: bold;">Object Distance Calibration Debug</div>
        <div>pxPerCm = ${(ppi / 2.54).toFixed(1)}</div>
        <div>distanceObjectCm = ${data.value.toFixed(1)}</div>
        <div style="margin-top: 5px; border-top: 1px solid #eee; padding-top: 5px;">
        <div>distance1InterpupillaryPx = ${faceMeshSamplesPage3.map(sample => (isNaN(sample) ? 'NaN' : Math.round(sample))).join(', ')}</div>
          <div>distance1FactorCmPx (Page 3) = ${distance1FactorCmPx}</div>
        <div>distance2InterpupillaryPx = ${faceMeshSamplesPage4.map(sample => (isNaN(sample) ? 'NaN' : Math.round(sample))).join(', ')}</div>
          <div>distance2FactorCmPx (Page 4) = ${distance2FactorCmPx}</div>
        </div>
        ${geometricCalcHtml}
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
            // Build geometric calculation details HTML
            let geometricCalcHtml = ''
            if (RC.page4GeometricCalc) {
              const g = RC.page4GeometricCalc
              geometricCalcHtml = `
                <div style="margin-top: 10px; border-top: 1px solid #ccc; padding-top: 10px;">
                  <div style="font-weight: bold; margin-bottom: 5px;">📐 Page 4 Geometric Calculation:</div>
                  <div style="margin-left: 10px;">
                    <div style="color: #0066cc; font-weight: bold;">Input Values:</div>
                    <div>  objectLengthCm = ${g.objectLengthCm.toFixed(2)}</div>
                    <div>  ipdVpx = ${g.ipdVpx.toFixed(2)}</div>
                    <div>  nearestXYPx_left = [${g.nearestXYPx_left[0].toFixed(1)}, ${g.nearestXYPx_left[1].toFixed(1)}]</div>
                    <div>  nearestXYPx_right = [${g.nearestXYPx_right[0].toFixed(1)}, ${g.nearestXYPx_right[1].toFixed(1)}]</div>
                    <div>  cameraXYPx = [${g.cameraXYPx[0].toFixed(1)}, ${g.cameraXYPx[1].toFixed(1)}]</div>
                    <div>  pointXYPx (screen center) = [${g.pointXYPx[0].toFixed(1)}, ${g.pointXYPx[1].toFixed(1)}]</div>
                    
                    <div style="color: #0066cc; font-weight: bold; margin-top: 8px;">Step 1: Calculate foot position (mean of left & right eye feet)</div>
                    <div>  footXYPx = mean(nearestXYPx_left, nearestXYPx_right)</div>
                    <div>  footXYPx = [${g.footXYPx[0].toFixed(1)}, ${g.footXYPx[1].toFixed(1)}]</div>
                    
                    <div style="color: #0066cc; font-weight: bold; margin-top: 8px;">Step 2: Calculate pointToFootCm</div>
                    <div>  pointToFootCm = norm(pointXYPx - footXYPx) / pxPerCm</div>
                    <div>  pointToFootCm = sqrt((${g.pointXYPx[0].toFixed(1)} - ${g.footXYPx[0].toFixed(1)})² + (${g.pointXYPx[1].toFixed(1)} - ${g.footXYPx[1].toFixed(1)})²) / ${(ppi / 2.54).toFixed(2)}</div>
                    <div>  <strong>pointToFootCm = ${g.pointToFootCm.toFixed(2)} cm</strong></div>
                    
                    <div style="color: #0066cc; font-weight: bold; margin-top: 8px;">Step 3: Calculate footToCameraCm</div>
                    <div>  footToCameraCm = norm(footXYPx - cameraXYPx) / pxPerCm</div>
                    <div>  footToCameraCm = sqrt((${g.footXYPx[0].toFixed(1)} - ${g.cameraXYPx[0].toFixed(1)})² + (${g.footXYPx[1].toFixed(1)} - ${g.cameraXYPx[1].toFixed(1)})²) / ${(ppi / 2.54).toFixed(2)}</div>
                    <div>  <strong>footToCameraCm = ${g.footToCameraCm.toFixed(2)} cm</strong></div>
                    
                    <div style="color: #0066cc; font-weight: bold; margin-top: 8px;">Step 4: Set eyeToPointCm = objectLengthCm</div>
                    <div>  <strong>eyeToPointCm = ${g.eyeToPointCm.toFixed(2)} cm</strong></div>
                    
                    <div style="color: #0066cc; font-weight: bold; margin-top: 8px;">Step 5: Calculate eyeToFootCm (Pythagorean theorem)</div>
                    <div>  eyeToFootCm = sqrt(eyeToPointCm² - pointToFootCm²)</div>
                    <div>  eyeToFootCm = sqrt(${g.eyeToPointCm.toFixed(2)}² - ${g.pointToFootCm.toFixed(2)}²)</div>
                    <div>  <strong>eyeToFootCm = ${g.eyeToFootCm.toFixed(2)} cm</strong></div>
                    
                    <div style="color: #0066cc; font-weight: bold; margin-top: 8px;">Step 6: Calculate eyeToScreenCm (parallel to optical axis)</div>
                    <div>  eyeToScreenCm = eyeToFootCm</div>
                    <div>  eyeToScreenCm = ${g.eyeToFootCm.toFixed(2)}</div>
                    <div>  <strong>eyeToScreenCm = ${g.eyeToFootCm.toFixed(2)} cm</strong></div>
                    
                    <div style="color: #0066cc; font-weight: bold; margin-top: 8px;">Step 7: Calculate factorVpxCm</div>
                    <div>  factorVpxCm = ipdVpx × eyeToScreenCm</div>
                    <div>  factorVpxCm = ${g.ipdVpx.toFixed(2)} × ${g.eyeToFootCm.toFixed(2)}</div>
                    <div style="color: #cc0000; font-weight: bold;">  ✓ page4FactorCmPx = ${g.page4FactorCmPx.toFixed(2)}</div>
                  </div>
                </div>
              `
            }

            feedbackDiv.innerHTML = `
                      <div style="position: absolute; top: 5px; right: 5px; cursor: pointer; font-weight: bold; font-size: 16px; color: #666;" onclick="this.parentElement.remove()">×</div>
                      <div style="margin-top: 10px; font-weight: bold;">Object + Blindspot Combined Calibration Debug</div>
                      <div>pxPerCm = ${(ppi / 2.54).toFixed(1)}</div>
                      <div>distanceObjectCm = ${data.value.toFixed(1)}</div>
                      <div style="margin-top: 5px; border-top: 1px solid #eee; padding-top: 5px;">
                      <div>distance1InterpupillaryPx = ${faceMeshSamplesPage3.map(sample => (isNaN(sample) ? 'NaN' : Math.round(sample))).join(', ')}</div>
                        <div>distance1FactorCmPx (Page 3) = ${distance1FactorCmPx}</div>
                      <div>distance2InterpupillaryPx = ${faceMeshSamplesPage4.map(sample => (isNaN(sample) ? 'NaN' : Math.round(sample))).join(', ')}</div>
                        <div>distance2FactorCmPx (Page 4) = ${distance2FactorCmPx}</div>
                        <div style="margin-top: 5px;">blindspotCalibrationFactor = ${blindspotCalibrationFactor.toFixed(1)}</div>
                      <div>AverageCombinedCalibrationFactor = ${medianCalibrationFactor.toFixed(1)}</div>
                      </div>
                      ${geometricCalcHtml}
                  `
          }

          // Update the data in RC and also the data in the callback
          RC.newObjectTestDistanceData = medianData
          RC.newViewingDistanceData = medianData

          // Call callback with the data
          // Handle completion based on check settings
          if (options.calibrateDistanceCheckBool) {
            await RC._checkDistance(
              callback,
              data,
              'trackDistance', // Use 'object' instead of 'measureDistance'
              options.checkCallback,
              options.calibrateDistanceCheckCm,
              options.callbackStatic,
              options.calibrateDistanceCheckSecs,
              options.calibrateDistanceCheckLengthCm,
              options.calibrateDistanceCenterYourEyesBool,
              options.calibrateDistancePupil,
              options.calibrateDistanceChecking,
              options.calibrateDistanceSpotXYDeg,
              options.calibrateDistance,
              options.stepperHistory,
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
      if (options.calibrateDistanceCheckBool) {
        await RC._checkDistance(
          callback,
          data,
          'trackDistance', // Use 'object' instead of 'measureDistance'
          options.checkCallback,
          options.calibrateDistanceCheckCm,
          options.callbackStatic,
          options.calibrateDistanceCheckSecs,
          options.calibrateDistanceCheckLengthCm,
          options.calibrateDistanceCenterYourEyesBool,
          options.calibrateDistancePupil,
          options.calibrateDistanceChecking,
          options.calibrateDistanceSpotXYDeg,
          options.calibrateDistance,
          options.stepperHistory,
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
    document.removeEventListener('keydown', handleInstructionNav)

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
    // Remove instructions reflow listener if present
    if (typeof reflowInstructionsOnResize === 'function') {
      window.removeEventListener('resize', reflowInstructionsOnResize)
    }

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
    document.removeEventListener('keydown', handleInstructionNav)

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
      // In paper-selection mode on page 2, allow Enter/Return to "Proceed".
      // On other modes/pages 2-4, ignore return key (space is used for capture/advance).
      if (currentPage === 2) {
        if (isPaperSelectionMode) {
          e.preventDefault()
          proceedButton.click()
        }
        return
      }
      if (currentPage === 3 || currentPage === 4) return
      // Always trigger Proceed button action since okButton is never used
      proceedButton.click()
    } else if (e.key === ' ') {
      // Space key - allow on pages 2, 3 and 4
      if (currentPage === 2 || currentPage === 3 || currentPage === 4) {
        e.preventDefault()

        // In paper-selection mode, require Enter/Return (space should not advance).
        if (currentPage === 2 && isPaperSelectionMode) {
          return
        }

        // Cancel any ongoing ruler-shift animation on page 2
        if (currentPage === 2) {
          cancelRulerShiftAnimation()
        }

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
          if (isPaperSelectionMode) {
            ;(async () => {
              const advanced = await nextPage()

              if (advanced && !RC.gazeTracker.checkInitialized('distance')) {
                RC.gazeTracker._init(
                  {
                    toFixedN: 1,
                    showVideo: true,
                    showFaceOverlay: false,
                  },
                  'distance',
                )
              }

              // Re-add listener after handling space key
              document.addEventListener('keydown', handleKeyPress)
            })()
            return
          }
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

            // Validate object length - check if this is first measurement or if previous was too short
            const minCm = options.calibrateDistanceObjectMinMaxCm?.[0] || 30
            const isFirstMeasurement =
              measurementState.measurements.length === 0
            const shouldEnforceMinimum =
              isFirstMeasurement || measurementState.lastAttemptWasTooShort

            // objectTestCommonData.objectLengthCm.push(
            //   Math.round(Number(firstMeasurement) * 10) / 10,
            // )
            objectTestCommonData.objectRulerIntervalCm.push(
              Math.round(Number(intervalCmCurrent) * 10) / 10,
            )

            if (shouldEnforceMinimum) {
              // We need to enforce minimum length - reject if too short
              if (Math.round(firstMeasurement) < Math.round(minCm)) {
                console.log(
                  `Object too short: ${Math.round(firstMeasurement)}cm < ${Math.round(minCm)}cm (isFirst: ${isFirstMeasurement}, prevWasShort: ${measurementState.lastAttemptWasTooShort})`,
                )

                // Mark that this attempt was too short
                measurementState.lastAttemptWasTooShort = true
                objectTestCommonData.objectMeasuredMsg.push('short')

                // Increment rejection counter
                measurementState.rejectionCount++
                console.log(
                  `Rejection count: ${measurementState.rejectionCount}`,
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

                // Show pause before allowing new object (with exponentially growing duration)
                await showPauseBeforeNewObject(
                  RC,
                  measurementState.rejectionCount,
                )

                // Reset the ruler/tape to initial position
                await resetPage2ForNextMeasurement()

                // Stay on page 2 - re-add the event listener
                document.addEventListener('keydown', handleKeyPress)
                return
              } else {
                // Passed the enforcement check
                console.log(
                  `Measurement passed minimum length enforcement: ${Math.round(firstMeasurement)}cm >= ${Math.round(minCm)}cm`,
                )
                measurementState.lastAttemptWasTooShort = false
              }
            } else {
              // Don't enforce minimum - but check if current measurement is too short for NEXT time
              console.log(
                `Not enforcing minimum length for measurement #${measurementState.measurements.length + 1}: ${Math.round(firstMeasurement)}cm`,
              )
              if (Math.round(firstMeasurement) < Math.round(minCm)) {
                console.log(
                  `Current measurement is too short (${Math.round(firstMeasurement)}cm < ${Math.round(minCm)}cm) - will enforce on NEXT measurement`,
                )
                measurementState.lastAttemptWasTooShort = true
                objectTestCommonData.objectMeasuredMsg.push('short')
              } else {
                measurementState.lastAttemptWasTooShort = false
              }
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
            cameraResolutionXYVpxPage3 = getCameraResolutionXY(RC)
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
                      meshSamplesDuringPage3.length = 0
                      meshSamplesDuringPage4.length = 0
                      firstMeasurement = null

                      // Full reset of viewing-distance counter (so paper mode returns to "1 of 3")
                      viewingDistanceMeasurementCount = 0
                      viewingDistanceTotalExpected = isPaperSelectionMode
                        ? 3
                        : 2

                      // Reset object-measurement state for a fresh object
                      savedMeasurementData = null
                      measurementState.measurements = []
                      measurementState.currentIteration = 1
                      measurementState.consistentPair = null
                      measurementState.lastAttemptWasTooShort = false
                      measurementState.rejectionCount = 0
                      measurementState.factorRejectionCount = 0

                      if (isPaperSelectionMode) {
                        // Reset paper-selection state too
                        selectedPaperOption = null
                        selectedPaperLengthCm = null
                        selectedPaperLabel = null
                        paperSuggestionValue = ''
                        if (typeof paperSuggestionInput !== 'undefined')
                          paperSuggestionInput.value = ''
                        const checked = paperSelectionContainer?.querySelector(
                          'input[name="paper-selection"]:checked',
                        )
                        if (checked) checked.checked = false
                        if (paperValidationMessage)
                          paperValidationMessage.style.display = 'none'
                      }

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
            cameraResolutionXYVpxPage4 = getCameraResolutionXY(RC)
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
                      meshSamplesDuringPage3.length = 0
                      meshSamplesDuringPage4.length = 0
                      firstMeasurement = null

                      // Full reset of viewing-distance counter (so paper mode returns to "1 of 3")
                      viewingDistanceMeasurementCount = 0
                      viewingDistanceTotalExpected = isPaperSelectionMode
                        ? 3
                        : 2

                      // Reset object-measurement state for a fresh object
                      savedMeasurementData = null
                      measurementState.measurements = []
                      measurementState.currentIteration = 1
                      measurementState.consistentPair = null
                      measurementState.lastAttemptWasTooShort = false
                      measurementState.rejectionCount = 0
                      measurementState.factorRejectionCount = 0

                      if (isPaperSelectionMode) {
                        // Reset paper-selection state too
                        selectedPaperOption = null
                        selectedPaperLengthCm = null
                        selectedPaperLabel = null
                        paperSuggestionValue = ''
                        if (typeof paperSuggestionInput !== 'undefined')
                          paperSuggestionInput.value = ''
                        const checked = paperSelectionContainer?.querySelector(
                          'input[name="paper-selection"]:checked',
                        )
                        if (checked) checked.checked = false
                        if (paperValidationMessage)
                          paperValidationMessage.style.display = 'none'
                      }

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
              // All 5 samples are valid - calculate factors then check tolerance
              console.log(
                '=== ALL 5 FACE MESH SAMPLES VALID - CALCULATING FACTORS ===',
              )

              // Calculate factors BEFORE tolerance check
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
              //TODO: clean up later
              let page3FactorCmPx = page3Average * firstMeasurement // Default calculation

              // Calculate page3FactorCmPx using new geometry (camera position)
              try {
                if (meshSamplesDuringPage3.length) {
                  const mesh = await getMeshData(
                    RC,
                    options.calibrateDistancePupil,
                    meshSamplesDuringPage3,
                  )
                  if (mesh) {
                    const { leftEye, rightEye, video, currentIPDDistance } =
                      mesh
                    const pxPerCm = ppi / 2.54
                    const ipdVpx = currentIPDDistance

                    // Get foot positions using calculateFootXYPx
                    const { nearestXYPx_left, nearestXYPx_right, cameraXYPx } =
                      calculateFootXYPx(
                        RC,
                        video,
                        leftEye,
                        rightEye,
                        pxPerCm,
                        currentIPDDistance,
                      )

                    // Calculate average foot position
                    const footXYPx = [
                      (nearestXYPx_left[0] + nearestXYPx_right[0]) / 2,
                      (nearestXYPx_left[1] + nearestXYPx_right[1]) / 2,
                    ]

                    // Calculate distances using the geometric formulas
                    const footToCameraCm =
                      Math.hypot(
                        footXYPx[0] - cameraXYPx[0],
                        footXYPx[1] - cameraXYPx[1],
                      ) / pxPerCm

                    const eyeToCameraCm = firstMeasurement
                    const eyeToFootCm = Math.sqrt(
                      eyeToCameraCm ** 2 - footToCameraCm ** 2,
                    )
                    page3FactorCmPx = ipdVpx * eyeToFootCm
                  }
                }
              } catch (error) {
                console.warn(
                  'Error calculating page3FactorCmPx with geometry, using default:',
                  error,
                )
              }

              //const page3FactorCmPx = page3Average * firstMeasurement
              RC.page3FactorCmPx = page3FactorCmPx

              // For page 4, calculate factorVpxCm using new geometric formulas
              let page4FactorCmPx = page4Average * firstMeasurement // Default calculation

              // Calculate page4FactorCmPx using new geometry (screen center)
              try {
                if (meshSamplesDuringPage4.length) {
                  const mesh = await getMeshData(
                    RC,
                    options.calibrateDistancePupil,
                    meshSamplesDuringPage4,
                  )
                  if (mesh) {
                    const { leftEye, rightEye, video, currentIPDDistance } =
                      mesh
                    const pxPerCm = ppi / 2.54
                    const objectLengthCm = firstMeasurement
                    objectLengthCmGlobal.value = objectLengthCm
                    const ipdVpx = currentIPDDistance

                    // Get foot positions
                    const { nearestXYPx_left, nearestXYPx_right, cameraXYPx } =
                      calculateFootXYPx(
                        RC,
                        video,
                        leftEye,
                        rightEye,
                        pxPerCm,
                        currentIPDDistance,
                      )

                    // Calculate average foot position
                    const footXYPx = [
                      (nearestXYPx_left[0] + nearestXYPx_right[0]) / 2,
                      (nearestXYPx_left[1] + nearestXYPx_right[1]) / 2,
                    ]

                    // Set pointXYPx to screen center
                    const pointXYPx = [
                      window.innerWidth / 2,
                      window.innerHeight / 2,
                    ]

                    // Calculate distances using the new formulas
                    const pointToFootCm =
                      Math.hypot(
                        pointXYPx[0] - footXYPx[0],
                        pointXYPx[1] - footXYPx[1],
                      ) / pxPerCm

                    const footToCameraCm =
                      Math.hypot(
                        footXYPx[0] - cameraXYPx[0],
                        footXYPx[1] - cameraXYPx[1],
                      ) / pxPerCm

                    const eyeToPointCm = objectLengthCm
                    const eyeToFootCm = Math.sqrt(
                      eyeToPointCm ** 2 - pointToFootCm ** 2,
                    )
                    const eyeToScreenCm = eyeToFootCm // parallel to optical axis (screen normal)
                    const eyeToCameraCm = Math.hypot(
                      eyeToScreenCm,
                      footToCameraCm,
                    )

                    // Calculate factorVpxCm using parallel-to-axis distance
                    page4FactorCmPx = ipdVpx * eyeToScreenCm

                    // Store geometric calculation details for debugging
                    RC.page4GeometricCalc = {
                      objectLengthCm: objectLengthCm,
                      ipdVpx: ipdVpx,
                      footXYPx: footXYPx,
                      pointXYPx: pointXYPx,
                      cameraXYPx: cameraXYPx,
                      pointToFootCm: pointToFootCm,
                      footToCameraCm: footToCameraCm,
                      eyeToPointCm: eyeToPointCm,
                      eyeToFootCm: eyeToFootCm,
                      eyeToScreenCm: eyeToScreenCm,
                      eyeToCameraCm: eyeToCameraCm,
                      page4FactorCmPx: page4FactorCmPx,
                      nearestXYPx_left: nearestXYPx_left,
                      nearestXYPx_right: nearestXYPx_right,
                    }

                    console.log('=== Page 4 Geometric Calculation ===')
                    console.log('objectLengthCm:', objectLengthCm)
                    console.log('ipdVpx:', ipdVpx)
                    console.log('footXYPx:', footXYPx)
                    console.log('pointXYPx:', pointXYPx)
                    console.log('cameraXYPx:', cameraXYPx)
                    console.log('pointToFootCm:', pointToFootCm)
                    console.log('footToCameraCm:', footToCameraCm)
                    console.log('eyeToPointCm:', eyeToPointCm)
                    console.log('eyeToFootCm:', eyeToFootCm)
                    console.log('eyeToCameraCm:', eyeToCameraCm)
                    console.log('page4FactorCmPx:', page4FactorCmPx)
                    console.log('====================================')
                  }
                }
              } catch (error) {
                console.error(
                  'Error calculating page4FactorCmPx with new geometry:',
                  error,
                )
                // Fall back to simple calculation
                //page4FactorCmPx = page4Average * firstMeasurement
              }

              RC.page4FactorCmPx = page4FactorCmPx
              const averageFactorCmPx = (page3FactorCmPx + page4FactorCmPx) / 2
              RC.averageObjectTestCalibrationFactor = Math.round(
                Math.sqrt(page3FactorCmPx * page4FactorCmPx),
              )

              // Now check tolerance with the calculated factors
              console.log('=== CHECKING TOLERANCE WITH CALCULATED FACTORS ===')
              const [
                pass,
                message,
                min,
                max,
                RMin,
                RMax,
                maxRatio,
                factorRatio,
              ] = checkObjectTestTolerance(
                RC,
                faceMeshSamplesPage3,
                faceMeshSamplesPage4,
                options.calibrateDistanceAllowedRatio,
                options.calibrateDistanceAllowedRangeCm,
                firstMeasurement,
                page3FactorCmPx,
                page4FactorCmPx,
              )
              if (RC.measurementHistory && message !== 'Pass')
                RC.measurementHistory.push(message)
              else if (message !== 'Pass') RC.measurementHistory = [message]

              if (pass) {
                // Tolerance check passed - finish the test
                console.log('=== TOLERANCE CHECK PASSED - FINISHING TEST ===')

                try {
                  if (
                    meshSamplesDuringPage3.length &&
                    meshSamplesDuringPage4.length
                  ) {
                    const measurements = []
                    if (meshSamplesDuringPage3.length) {
                      const {
                        nearestPointsData,
                        currentIPDDistance,
                        ipdXYZVpx: ipdXYZVpxPage3,
                      } = await processMeshDataAndCalculateNearestPoints(
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
                        options.calibrateDistanceChecking,
                        [window.innerWidth / 2, 0], // pointXYPx = cameraXYPx
                      )

                      measurements.push(
                        createMeasurementObject(
                          'firstMeasurement',
                          firstMeasurement,
                          page3FactorCmPx,
                          nearestPointsData,
                          currentIPDDistance,
                          null,
                          cameraResolutionXYVpxPage3,
                          isPaperSelectionMode
                            ? selectedPaperLabel ||
                                paperSelectionOptions.find(
                                  o => o.key === selectedPaperOption,
                                )?.label ||
                                null
                            : null,
                          isPaperSelectionMode ? paperSuggestionValue : null,
                          ipdXYZVpxPage3,
                        ),
                      )
                    }
                    if (meshSamplesDuringPage4.length) {
                      const {
                        nearestPointsData,
                        currentIPDDistance,
                        ipdXYZVpx: ipdXYZVpxPage4,
                      } = await processMeshDataAndCalculateNearestPoints(
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
                        options.calibrateDistanceChecking,
                        [window.innerWidth / 2, window.innerHeight / 2], // pointXYPx = screen center
                      )

                      measurements.push(
                        createMeasurementObject(
                          'secondMeasurement',
                          firstMeasurement,
                          page4FactorCmPx,
                          nearestPointsData,
                          currentIPDDistance,
                          null,
                          cameraResolutionXYVpxPage4,
                          isPaperSelectionMode
                            ? selectedPaperLabel ||
                                paperSelectionOptions.find(
                                  o => o.key === selectedPaperOption,
                                )?.label ||
                                null
                            : null,
                          isPaperSelectionMode ? paperSuggestionValue : null,
                          ipdXYZVpxPage4,
                        ),
                      )
                    }

                    saveCalibrationMeasurements(
                      RC,
                      'object',
                      measurements,
                      undefined,
                      objectTestCommonData,
                    )
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
                const ratioText = factorRatio.toFixed(2) // Use factorRatio (F1/F2) for display
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

                // Note: validPage3Samples, validPage4Samples, page3Average, page4Average,
                // page3FactorCmPx, page4FactorCmPx, averageFactorCmPx
                // are already calculated above in the outer scope

                try {
                  if (
                    meshSamplesDuringPage3.length &&
                    meshSamplesDuringPage4.length
                  ) {
                    const measurements = []
                    if (meshSamplesDuringPage3.length) {
                      const {
                        nearestPointsData,
                        currentIPDDistance,
                        ipdXYZVpx: ipdXYZVpxPage3,
                      } = await processMeshDataAndCalculateNearestPoints(
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
                        options.calibrateDistanceChecking,
                        [window.innerWidth / 2, 0], // pointXYPx = cameraXYPx
                      )

                      measurements.push(
                        createMeasurementObject(
                          'firstMeasurement',
                          firstMeasurement,
                          page3FactorCmPx,
                          nearestPointsData,
                          currentIPDDistance,
                          null,
                          cameraResolutionXYVpxPage3,
                          isPaperSelectionMode
                            ? selectedPaperLabel ||
                                paperSelectionOptions.find(
                                  o => o.key === selectedPaperOption,
                                )?.label ||
                                null
                            : null,
                          isPaperSelectionMode ? paperSuggestionValue : null,
                          ipdXYZVpxPage3,
                        ),
                      )
                    }
                    if (meshSamplesDuringPage4.length) {
                      const {
                        nearestPointsData,
                        currentIPDDistance,
                        ipdXYZVpx: ipdXYZVpxPage4,
                      } = await processMeshDataAndCalculateNearestPoints(
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
                        options.calibrateDistanceChecking,
                        [window.innerWidth / 2, window.innerHeight / 2], // pointXYPx = screen center
                      )

                      measurements.push(
                        createMeasurementObject(
                          'secondMeasurement',
                          firstMeasurement,
                          page4FactorCmPx,
                          nearestPointsData,
                          currentIPDDistance,
                          null,
                          cameraResolutionXYVpxPage4,
                          isPaperSelectionMode
                            ? selectedPaperLabel ||
                                paperSelectionOptions.find(
                                  o => o.key === selectedPaperOption,
                                )?.label ||
                                null
                            : null,
                          isPaperSelectionMode ? paperSuggestionValue : null,
                          ipdXYZVpxPage4,
                        ),
                      )
                    }

                    saveCalibrationMeasurements(
                      RC,
                      'object',
                      measurements,
                      undefined,
                      objectTestCommonData,
                    )
                  }
                } catch (error) {
                  console.error('Error getting mesh data:', error)
                }

                // Clear both sample arrays to restart collection
                faceMeshSamplesPage3.length = 0
                faceMeshSamplesPage4.length = 0
                meshSamplesDuringPage3.length = 0
                meshSamplesDuringPage4.length = 0

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
                  // Show popup with two buttons: Use Old Object Again or Try New Object
                  const result = await Swal.fire({
                    ...swalInfoOptions(RC, { showIcon: false }),
                    icon: undefined,
                    html: displayMessage,
                    showCancelButton: true,
                    confirmButtonText: phrases.RC_ok?.[RC.L],
                    cancelButtonText: phrases.RC_NewObjectButton?.[RC.L],
                    allowEnterKey: true,
                    allowEscapeKey: false, // Prevent ESC from dismissing
                    allowOutsideClick: false, // Require button click
                    // Keep default order so confirm (Use Old Object) is on the left and cancel (Try New Object) is on the right
                    customClass: {
                      actions: 'rc-two-button-actions',
                      confirmButton: 'rc-two-button-confirm',
                      cancelButton: 'rc-two-button-cancel',
                    },
                    didOpen: () => {
                      // Style buttons to be the same
                      const confirmBtn = document.querySelector(
                        '.rc-two-button-confirm',
                      )
                      const cancelBtn = document.querySelector(
                        '.rc-two-button-cancel',
                      )

                      const buttonStyle = `
                        background-color: #019267 !important;
                        color: white !important;
                        border: none !important;
                        padding: 12px 24px !important;
                        font-size: 16px !important;
                        cursor: pointer !important;
                        border-radius: 7px !important;
                        min-width: 150px !important;
                        font-weight: 700 !important;
                      `

                      if (confirmBtn) {
                        confirmBtn.style.cssText = buttonStyle
                        // Add hover effect
                        confirmBtn.addEventListener('mouseenter', () => {
                          confirmBtn.style.backgroundColor = '#016b4a'
                        })
                        confirmBtn.addEventListener('mouseleave', () => {
                          confirmBtn.style.backgroundColor = '#019267'
                        })
                      }
                      if (cancelBtn) {
                        cancelBtn.style.cssText = buttonStyle
                        // Add hover effect
                        cancelBtn.addEventListener('mouseenter', () => {
                          cancelBtn.style.backgroundColor = '#016b4a'
                        })
                        cancelBtn.addEventListener('mouseleave', () => {
                          cancelBtn.style.backgroundColor = '#019267'
                        })
                      }

                      // Put the two buttons at the left/right corners of the popup action row
                      const actionsContainer = document.querySelector(
                        '.rc-two-button-actions',
                      )
                      if (actionsContainer) {
                        actionsContainer.style.cssText = `
                          display: flex !important;
                          justify-content: space-between !important;
                          align-items: center !important;
                          width: 100% !important;
                          gap: 0px !important;
                          padding: 0 16px !important;
                        `
                      }
                      // Ensure buttons don't auto-center via margins
                      if (confirmBtn) confirmBtn.style.margin = '0'
                      if (cancelBtn) cancelBtn.style.margin = '0'
                    },
                  })

                  if (
                    result.dismiss === Swal.DismissReason.cancel ||
                    !result.isConfirmed
                  ) {
                    // User clicked "Try New Object" (cancel button) - go back to page 2
                    console.log(
                      'User chose to try new object - returning to page 2',
                    )

                    // Reset rejection counter when starting fresh with new object
                    measurementState.factorRejectionCount = 0
                    console.log(
                      'Reset factor rejection count to 0 (new object)',
                    )

                    // Clear the saved measurement data to start fresh
                    savedMeasurementData = null
                    measurementState.measurements = []
                    measurementState.currentIteration = 1
                    measurementState.consistentPair = null

                    // Reset viewing distance counters for fresh start
                    viewingDistanceMeasurementCount = 0
                    viewingDistanceTotalExpected = isPaperSelectionMode ? 3 : 2

                    if (isPaperSelectionMode) {
                      // Reset paper-selection state so page 2 shows ONLY paper selection (no tape-mode leftovers)
                      selectedPaperOption = null
                      selectedPaperLengthCm = null
                      selectedPaperLabel = null
                      paperSuggestionValue = ''
                      if (typeof paperSuggestionInput !== 'undefined')
                        paperSuggestionInput.value = ''
                      // Clear any checked radio buttons
                      const checked = paperSelectionContainer?.querySelector(
                        'input[name="paper-selection"]:checked',
                      )
                      if (checked) checked.checked = false
                      if (paperValidationMessage)
                        paperValidationMessage.style.display = 'none'
                    } else {
                      // Reset ruler/tape to initial position for new object (non-paper mode)
                      await resetPage2ForNextMeasurement()
                    }

                    // Go back to page 2 to measure new object
                    await showPage(2)

                    // Re-add the event listener for the new page 2 instance
                    document.addEventListener('keydown', handleKeyPress)
                    return
                  }

                  // User chose "Use Old Object Again" - increment counter and show pause
                  measurementState.factorRejectionCount++
                  console.log(
                    `Factor rejection count: ${measurementState.factorRejectionCount}`,
                  )

                  // Show pause before allowing retry (with exponentially growing duration)
                  await showPauseBeforeNewObject(
                    RC,
                    measurementState.factorRejectionCount,
                    'RC_PauseBeforeRemeasuringDistance',
                  )
                }

                // Reset to page 3 to restart snapshots (keep same object measurement)
                // Per spec: "stick with the same measured object and go back to the first object-set distance and snapshot"

                // Increment expected total by 2 (one more page 3/4 cycle)
                viewingDistanceTotalExpected += 2
                console.log(
                  `Retrying with same object. Expected total now: ${viewingDistanceTotalExpected}`,
                )

                currentPage = 2 // Will advance to page 3
                // Keep firstMeasurement - DO NOT set to null
                await nextPage()

                // Re-add the event listener for the new page 3 instance
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
  proceedButton.textContent = phrases.T_proceed[RC.L]
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
      if (isPaperSelectionMode) {
        const advanced = await nextPage()
        if (advanced && !RC.gazeTracker.checkInitialized('distance')) {
          RC.gazeTracker._init(
            {
              toFixedN: 1,
              showVideo: true,
              showFaceOverlay: false,
            },
            'distance',
          )
        }
        return
      }
      // Record first measurement - calculate diagonal distance
      const diagonalDistancePx = tape.helpers.getDistance(
        startX,
        startY,
        endX,
        endY,
      )
      firstMeasurement = diagonalDistancePx / pxPerMm / 10
      console.log('First measurement:', firstMeasurement)

      // Validate object length - check if this is first measurement or if previous was too short
      const minCm = options.calibrateDistanceObjectMinMaxCm?.[0] || 10
      const isFirstMeasurement = measurementState.measurements.length === 0
      const shouldEnforceMinimum =
        isFirstMeasurement || measurementState.lastAttemptWasTooShort

      // objectTestCommonData.objectLengthCm.push(
      //   Math.round(Number(firstMeasurement) * 10) / 10,
      // )
      objectTestCommonData.objectRulerIntervalCm.push(
        Math.round(Number(intervalCmCurrent) * 10) / 10,
      )

      if (shouldEnforceMinimum) {
        // We need to enforce minimum length - reject if too short
        if (Math.round(firstMeasurement) < Math.round(minCm)) {
          console.log(
            `Object too short: ${Math.round(firstMeasurement)}cm < ${Math.round(minCm)}cm (isFirst: ${isFirstMeasurement}, prevWasShort: ${measurementState.lastAttemptWasTooShort})`,
          )

          // Mark that this attempt was too short
          measurementState.lastAttemptWasTooShort = true
          objectTestCommonData.objectMeasuredMsg.push('short')

          // Increment rejection counter
          measurementState.tooShortRejectionCount++
          console.log(
            `Rejection count: ${measurementState.tooShortRejectionCount}`,
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

          // Show pause before allowing new object (with exponentially growing duration)
          await showPauseBeforeNewObject(
            RC,
            measurementState.tooShortRejectionCount,
          )

          // Reset the ruler/tape to initial position
          await resetPage2ForNextMeasurement()

          // Stay on page 2 - object length page is already showing
          return
        } else {
          // Passed the enforcement check
          console.log(
            `Measurement passed minimum length enforcement: ${Math.round(firstMeasurement)}cm >= ${Math.round(minCm)}cm`,
          )
          measurementState.lastAttemptWasTooShort = false
        }
      } else {
        // Don't enforce minimum - but check if current measurement is too short for NEXT time
        console.log(
          `Not enforcing minimum length for measurement #${measurementState.measurements.length + 1}: ${Math.round(firstMeasurement)}cm`,
        )
        if (Math.round(firstMeasurement) < Math.round(minCm)) {
          console.log(
            `Current measurement is too short (${Math.round(firstMeasurement)}cm < ${Math.round(minCm)}cm) - will enforce on NEXT measurement`,
          )
          measurementState.lastAttemptWasTooShort = true
          objectTestCommonData.objectMeasuredMsg.push('short')
        } else {
          measurementState.lastAttemptWasTooShort = false
        }
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
      cameraResolutionXYVpxPage3 = getCameraResolutionXY(RC)
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
      cameraResolutionXYVpxPage4 = getCameraResolutionXY(RC)
      console.log(
        'Face Mesh calibration samples (page 4):',
        faceMeshSamplesPage4,
      )

      console.log('=== CALCULATING FACTORS BEFORE TOLERANCE CHECK ===')

      // Calculate factors BEFORE tolerance check (Proceed button case)
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

      // For page 4, calculate factorVpxCm using new geometric formulas
      let page4FactorCmPx = page4Average * firstMeasurement // Default calculation

      // Calculate page4FactorCmPx using new geometry (screen center)
      try {
        if (meshSamplesDuringPage4.length) {
          const mesh = await getMeshData(
            RC,
            options.calibrateDistancePupil,
            meshSamplesDuringPage4,
          )
          if (mesh) {
            const { leftEye, rightEye, video, currentIPDDistance } = mesh
            const pxPerCm = ppi / 2.54
            const objectLengthCm = firstMeasurement
            objectLengthCmGlobal.value = objectLengthCm
            const ipdVpx = currentIPDDistance

            // Get foot positions
            const { nearestXYPx_left, nearestXYPx_right, cameraXYPx } =
              calculateFootXYPx(
                RC,
                video,
                leftEye,
                rightEye,
                pxPerCm,
                currentIPDDistance,
              )

            // Calculate average foot position
            const footXYPx = [
              (nearestXYPx_left[0] + nearestXYPx_right[0]) / 2,
              (nearestXYPx_left[1] + nearestXYPx_right[1]) / 2,
            ]

            // Set pointXYPx to screen center
            const pointXYPx = [window.innerWidth / 2, window.innerHeight / 2]

            // Calculate distances using the new formulas
            const pointToFootCm =
              Math.hypot(
                pointXYPx[0] - footXYPx[0],
                pointXYPx[1] - footXYPx[1],
              ) / pxPerCm

            const footToCameraCm =
              Math.hypot(
                footXYPx[0] - cameraXYPx[0],
                footXYPx[1] - cameraXYPx[1],
              ) / pxPerCm

            const eyeToPointCm = objectLengthCm
            const eyeToFootCm = Math.sqrt(
              eyeToPointCm ** 2 - pointToFootCm ** 2,
            )
            const eyeToScreenCm = eyeToFootCm // parallel to optical axis (screen normal)
            const eyeToCameraCm = Math.hypot(eyeToScreenCm, footToCameraCm)

            // Calculate factorVpxCm using parallel-to-axis distance
            page4FactorCmPx = ipdVpx * eyeToScreenCm

            // Store geometric calculation details for debugging
            RC.page4GeometricCalc = {
              objectLengthCm: objectLengthCm,
              ipdVpx: ipdVpx,
              footXYPx: footXYPx,
              pointXYPx: pointXYPx,
              cameraXYPx: cameraXYPx,
              pointToFootCm: pointToFootCm,
              footToCameraCm: footToCameraCm,
              eyeToPointCm: eyeToPointCm,
              eyeToFootCm: eyeToFootCm,
              eyeToScreenCm: eyeToScreenCm,
              eyeToCameraCm: eyeToCameraCm,
              page4FactorCmPx: page4FactorCmPx,
              nearestXYPx_left: nearestXYPx_left,
              nearestXYPx_right: nearestXYPx_right,
            }
          }
        }
      } catch (error) {
        console.error(
          'Error calculating page4FactorCmPx with new geometry (Proceed button):',
          error,
        )
        // Fall back to simple calculation
        //page4FactorCmPx = page4Average * firstMeasurement
      }

      const averageFactorCmPx = (page3FactorCmPx + page4FactorCmPx) / 2
      //RC.averageObjectTestCalibrationFactor = Math.round(averageFactorCmPx)

      // Now check tolerance with the calculated factors
      console.log(
        '=== CHECKING TOLERANCE WITH CALCULATED FACTORS (Proceed button) ===',
      )
      const [pass, message, min, max, RMin, RMax, maxRatio, factorRatio] =
        checkObjectTestTolerance(
          RC,
          faceMeshSamplesPage3,
          faceMeshSamplesPage4,
          options.calibrateDistanceAllowedRatio,
          options.calibrateDistanceAllowedRangeCm,
          firstMeasurement,
          page3FactorCmPx,
          page4FactorCmPx,
        )
      if (RC.measurementHistory && message !== 'Pass')
        RC.measurementHistory.push(message)
      else if (message !== 'Pass') RC.measurementHistory = [message]

      if (pass) {
        console.log('=== TOLERANCE CHECK PASSED - FINISHING TEST ===')

        try {
          if (meshSamplesDuringPage3.length && meshSamplesDuringPage4.length) {
            const measurements = []
            if (meshSamplesDuringPage3.length) {
              const {
                nearestPointsData,
                currentIPDDistance,
                ipdXYZVpx: ipdXYZVpxPage3,
              } = await processMeshDataAndCalculateNearestPoints(
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
                options.calibrateDistanceChecking,
                [window.innerWidth / 2, 0], // pointXYPx = cameraXYPx
              )

              measurements.push(
                createMeasurementObject(
                  'firstMeasurement',
                  firstMeasurement,
                  page3FactorCmPx,
                  nearestPointsData,
                  currentIPDDistance,
                  null,
                  cameraResolutionXYVpxPage3,
                  isPaperSelectionMode
                    ? selectedPaperLabel ||
                        paperSelectionOptions.find(
                          o => o.key === selectedPaperOption,
                        )?.label ||
                        null
                    : null,
                  isPaperSelectionMode ? paperSuggestionValue : null,
                  ipdXYZVpxPage3,
                ),
              )
            }
            if (meshSamplesDuringPage4.length) {
              const {
                nearestPointsData,
                currentIPDDistance,
                ipdXYZVpx: ipdXYZVpxPage4,
              } = await processMeshDataAndCalculateNearestPoints(
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
                options.calibrateDistanceChecking,
                [window.innerWidth / 2, window.innerHeight / 2], // pointXYPx = screen center
              )

              measurements.push(
                createMeasurementObject(
                  'secondMeasurement',
                  firstMeasurement,
                  page4FactorCmPx,
                  nearestPointsData,
                  currentIPDDistance,
                  null,
                  cameraResolutionXYVpxPage4,
                  isPaperSelectionMode
                    ? selectedPaperLabel ||
                        paperSelectionOptions.find(
                          o => o.key === selectedPaperOption,
                        )?.label ||
                        null
                    : null,
                  isPaperSelectionMode ? paperSuggestionValue : null,
                  ipdXYZVpxPage4,
                ),
              )
            }

            saveCalibrationMeasurements(
              RC,
              'object',
              measurements,
              undefined,
              objectTestCommonData,
            )
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
        const ratioText = factorRatio.toFixed(2) // Use factorRatio (F1/F2) for display
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
          '=== TOLERANCE CHECK FAILED - RESTARTING FACE MESH COLLECTION (Proceed button) ===',
        )

        // Note: validPage3Samples, validPage4Samples, page3Average, page4Average, page3FactorCmPx, page4FactorCmPx
        // are already calculated above in the outer scope

        // Save failed calibration attempt with the calculated factors
        try {
          const mesh = await getMeshData(
            RC,
            options.calibrateDistancePupil,
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
              options.calibrateDistanceChecking,
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

            saveCalibrationMeasurements(
              RC,
              'object',
              measurements,
              undefined,
              objectTestCommonData,
            )
          }
        } catch (error) {
          console.error('Error getting mesh data:', error)
        }

        faceMeshSamplesPage3.length = 0
        faceMeshSamplesPage4.length = 0
        meshSamplesDuringPage3.length = 0
        meshSamplesDuringPage4.length = 0

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
          // Show popup with two buttons: Use Old Object Again or Try New Object
          const result = await Swal.fire({
            ...swalInfoOptions(RC, { showIcon: false }),
            icon: undefined,
            html: displayMessage,
            showCancelButton: true,
            confirmButtonText:
              phrases.RC_UseOldObjectAgain?.[RC.L] || 'Use Old Object Again',
            cancelButtonText:
              phrases.RC_TryNewObject?.[RC.L] || 'Try New Object',
            allowEnterKey: true,
            allowEscapeKey: false, // Prevent ESC from dismissing
            allowOutsideClick: false, // Require button click
            // Keep default order so confirm (Use Old Object) is on the left and cancel (Try New Object) is on the right
            customClass: {
              actions: 'rc-two-button-actions',
              confirmButton: 'rc-two-button-confirm',
              cancelButton: 'rc-two-button-cancel',
            },
            didOpen: () => {
              // Style buttons to be the same
              const confirmBtn = document.querySelector(
                '.rc-two-button-confirm',
              )
              const cancelBtn = document.querySelector('.rc-two-button-cancel')

              const buttonStyle = `
                        background-color: #019267 !important;
                        color: white !important;
                        border: none !important;
                        padding: 12px 24px !important;
                        font-size: 16px !important;
                        cursor: pointer !important;
                        border-radius: 7px !important;
                        min-width: 150px !important;
                        font-weight: 700 !important;
                      `

              if (confirmBtn) {
                confirmBtn.style.cssText = buttonStyle
                // Add hover effect
                confirmBtn.addEventListener('mouseenter', () => {
                  confirmBtn.style.backgroundColor = '#016b4a'
                })
                confirmBtn.addEventListener('mouseleave', () => {
                  confirmBtn.style.backgroundColor = '#019267'
                })
              }
              if (cancelBtn) {
                cancelBtn.style.cssText = buttonStyle
                // Add hover effect
                cancelBtn.addEventListener('mouseenter', () => {
                  cancelBtn.style.backgroundColor = '#016b4a'
                })
                cancelBtn.addEventListener('mouseleave', () => {
                  cancelBtn.style.backgroundColor = '#019267'
                })
              }

              // Put the two buttons at the left/right corners of the popup action row
              const actionsContainer = document.querySelector(
                '.rc-two-button-actions',
              )
              if (actionsContainer) {
                actionsContainer.style.cssText = `
                          display: flex !important;
                          justify-content: space-between !important;
                          align-items: center !important;
                          width: 100% !important;
                          gap: 0px !important;
                          padding: 0 16px !important;
                        `
              }
              if (confirmBtn) confirmBtn.style.marginRight = '25'
              if (cancelBtn) cancelBtn.style.marginLeft = '25'
            },
          })

          if (
            result.dismiss === Swal.DismissReason.cancel ||
            !result.isConfirmed
          ) {
            // User clicked "Try New Object" (cancel button) - go back to page 2
            console.log(
              'User chose to try new object (Proceed button path) - returning to page 2',
            )

            // Reset rejection counter when starting fresh with new object
            measurementState.factorRejectionCount = 0
            console.log(
              'Reset factor rejection count to 0 (new object, Proceed button path)',
            )

            // Clear the saved measurement data to start fresh
            savedMeasurementData = null
            measurementState.measurements = []
            measurementState.currentIteration = 1
            measurementState.consistentPair = null

            // Reset viewing distance counters for fresh start
            viewingDistanceMeasurementCount = 0
            viewingDistanceTotalExpected = isPaperSelectionMode ? 3 : 2

            if (isPaperSelectionMode) {
              // Reset paper-selection state so page 2 shows ONLY paper selection (no tape-mode leftovers)
              selectedPaperOption = null
              selectedPaperLengthCm = null
              selectedPaperLabel = null
              paperSuggestionValue = ''
              if (typeof paperSuggestionInput !== 'undefined')
                paperSuggestionInput.value = ''
              // Clear any checked radio buttons
              const checked = paperSelectionContainer?.querySelector(
                'input[name="paper-selection"]:checked',
              )
              if (checked) checked.checked = false
              if (paperValidationMessage)
                paperValidationMessage.style.display = 'none'
            } else {
              // Reset ruler/tape to initial position for new object
              await resetPage2ForNextMeasurement()
            }

            // Go back to page 2 to measure new object
            await showPage(2)
            return
          }

          // User chose "Use Old Object Again" - increment counter and show pause
          measurementState.factorRejectionCount++
          console.log(
            `Factor rejection count (Proceed button path): ${measurementState.factorRejectionCount}`,
          )

          // Show pause before allowing retry (with exponentially growing duration)
          await showPauseBeforeNewObject(
            RC,
            measurementState.factorRejectionCount,
            'RC_PauseBeforeRemeasuringDistance',
          )
        }

        // Reset to page 3 to restart snapshots (keep same object measurement)
        // Per spec: "stick with the same measured object and go back to the first object-set distance and snapshot"

        // Increment expected total by 2 (one more page 3/4 cycle)
        viewingDistanceTotalExpected += 2
        console.log(
          `Retrying with same object (Proceed button path). Expected total now: ${viewingDistanceTotalExpected}`,
        )

        currentPage = 2 // Will advance to page 3
        // Keep firstMeasurement - DO NOT set to null
        await nextPage()

        // Re-add the event listener for page 3 after restart
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
  //hide webgazerFaceFeedbackBox if calibrateDistanceCenterYourEyesBool is false
  const webgazerFaceFeedbackBox = document.getElementById(
    'webgazerFaceFeedbackBox',
  )
  if (!options.calibrateDistanceCenterYourEyesBool && webgazerFaceFeedbackBox)
    webgazerFaceFeedbackBox.style.display = 'none'
  if (options.calibrateDistanceCenterYourEyesBool) showPage(0)
  else showPage(2)
}

// ===================== KNOWN DISTANCE TEST SCHEME =====================
// This function measures viewing distance using a known object length (credit card)
// It skips the manual ruler measurement (pages 1-2) and goes straight to face mesh calibration
export async function knownDistanceTest(RC, options, callback = undefined) {
  RC._addBackground()

  // ===================== PAGE STATE MANAGEMENT =====================
  let currentPage = 3 // Start directly at page 3 (skip pages 1-2)
  let savedMeasurementData = null

  // ===================== KNOWN DISTANCE (Credit Card Standard) =====================
  const CREDIT_CARD_LENGTH_CM = 8.56 // Standard credit card length in cm
  const knownObjectLengthCm = CREDIT_CARD_LENGTH_CM

  // ===================== MEASUREMENT STATE MANAGEMENT =====================
  // Check how many measurements are requested (1 = page 3 only, 2+ = both pages with tolerance)
  const measurementCount = Math.max(
    1,
    Math.floor(options.objectMeasurementCount || 1),
  )
  const useSinglePage = measurementCount === 1 // If 1, only use page 3

  console.log('=== Known Distance Test Configuration ===')
  console.log('Measurement count (objectMeasurementCount):', measurementCount)
  console.log(
    'Mode:',
    useSinglePage
      ? 'Single Page (Page 3 only)'
      : 'Two Pages (Page 3 + 4 with tolerance)',
  )
  console.log('===========================================')

  const measurementState = {
    totalIterations: measurementCount,
    measurements: [],
    rejectionCount: 0,
    factorRejectionCount: 0,
  }

  const collectAllAssetUrls = () => {
    const maps = [test_assetMap].filter(Boolean)
    const urls = new Set()
    maps.forEach(m => {
      Object.values(m || {}).forEach(u => {
        if (typeof u === 'string' && u) urls.add(u)
      })
    })
    return Array.from(urls)
  }

  const buildInstructionMediaPreloadOrder = () => {
    const allUrls = collectAllAssetUrls()
    if (!allUrls.length) return []

    const priorityKeys = [
      'LL9',
      'LL1',
      'LL10',
      'LL2',
      'LL3',
      'LL4',
      'LL5',
      'LL6',
      'LL8',
      'LL7',
    ]
    const seen = new Set()
    const ordered = []

    priorityKeys.forEach(key => {
      const url = (test_assetMap && test_assetMap[key]) || null
      if (url && allUrls.includes(url) && !seen.has(url)) {
        ordered.push(url)
        seen.add(url)
      }
    })

    allUrls.forEach(url => {
      if (!seen.has(url)) {
        ordered.push(url)
        seen.add(url)
      }
    })

    return ordered
  }

  const preloadAllInstructionMedia = async () => {
    const orderedUrls = buildInstructionMediaPreloadOrder()
    console.log('orderedUrls...', orderedUrls)
    if (!orderedUrls.length) return

    const firstBlockingCount = 3
    const firstBatch = orderedUrls.slice(0, firstBlockingCount)
    const remaining = orderedUrls.slice(firstBlockingCount)

    await Promise.all(firstBatch.map(fetchBlobOnce)).catch(error => {
      console.error('error preloading initial media...', error)
    })

    if (remaining.length) {
      if (!window.__eeInstructionMediaPreloaderPromise) {
        window.__eeInstructionMediaPreloaderPromise = (async () => {
          for (const url of remaining) {
            try {
              await fetchBlobOnce(url)
            } catch (err) {
              console.error('error preloading media url...', err)
            }
          }
        })()
      }
    }
  }

  await preloadAllInstructionMedia()

  // ===================== KNOWN DISTANCE TEST COMMON DATA =====================
  const knownDistanceTestCommonData = {
    objectLengthCm: knownObjectLengthCm,
    method: 'knownDistance',
    _calibrateDistance: options.calibrateDistance,
    _calibrateDistanceAllowedRangeCm: options.calibrateDistanceAllowedRangeCm,
    _calibrateDistanceAllowedRatio: options.calibrateDistanceAllowedRatio,
    _calibrateDistancePupil: options.calibrateDistancePupil,
    _viewingDistanceWhichEye: options.viewingDistanceWhichEye,
    _viewingDistanceWhichPoint: options.viewingDistanceWhichPoint,
  }

  // ===================== VIEWING DISTANCE MEASUREMENT TRACKING =====================
  let viewingDistanceMeasurementCount = 0
  let viewingDistanceTotalExpected = useSinglePage ? 1 : 2 // 1 page or 2 pages

  // Render the "Distance (N of X)" title safely (never show N > X).
  const renderViewingDistanceProgressTitle = () => {
    const n1 = Math.max(0, Math.floor(viewingDistanceMeasurementCount || 0))
    const n2 = Math.max(Math.floor(viewingDistanceTotalExpected || 0), n1, 1)
    const template =
      phrases.RC_distanceTrackingN?.[RC.L] || 'Distance [[N1]] of [[N2]]'
    title.innerText = template
      .replace('[[N1]]', n1.toString())
      .replace('[[N2]]', n2.toString())
  }

  // ===================== FACE MESH CALIBRATION SAMPLES =====================
  let faceMeshSamplesPage3 = []
  let faceMeshSamplesPage4 = []
  let meshSamplesDuringPage3 = []
  let meshSamplesDuringPage4 = []

  // Helper to collect 5 samples of eye pixel distance using Face Mesh
  async function collectFaceMeshSamples(RC, arr, ppi, meshSamples) {
    arr.length = 0

    for (let i = 0; i < 5; i++) {
      try {
        const pxDist = await measureIntraocularDistancePx(
          RC,
          options.calibrateDistancePupil,
          meshSamples,
          RC.calibrateDistanceIpdUsesZBool !== false,
        )
        if (pxDist && !isNaN(pxDist)) {
          arr.push(pxDist)
        } else {
          arr.push(NaN)
          console.warn(`Face Mesh measurement ${i + 1} failed, storing NaN`)
        }
      } catch (error) {
        arr.push(NaN)
        console.warn(`Face Mesh measurement ${i + 1} error:`, error)
      }

      await new Promise(res => setTimeout(res, 100))
    }

    const validSamples = arr.filter(sample => !isNaN(sample))
    const failedSamples = arr.filter(sample => isNaN(sample))

    console.log(
      `Face Mesh samples collected: ${validSamples.length} valid, ${failedSamples.length} failed`,
    )
    console.log(
      'All samples:',
      arr.map(sample => (isNaN(sample) ? 'NaN' : sample.toFixed(2))),
    )

    if (arr.length !== 5) {
      console.error(
        `Expected 5 samples but got ${arr.length}. Padding with NaN.`,
      )
      while (arr.length < 5) {
        arr.push(NaN)
      }
    }
  }

  // ===================== DRAWING THE KNOWN DISTANCE TEST UI =====================
  let ppi = RC.screenPpi ? RC.screenPpi.value : 96 / 25.4
  let pxPerMm = ppi / 25.4
  const pxPerCm = ppi / 2.54

  // ===================== ARROW INDICATORS FOR PAGES 3 & 4 =====================
  const createArrowIndicators = targetXYPx => {
    const arrowSizeCm = 3
    const arrowSizePx = arrowSizeCm * pxPerCm
    const lineThicknessPx = 3

    const midlineY = window.innerHeight / 2
    const leftArrowX = window.innerWidth / 3
    const rightArrowX = (2 * window.innerWidth) / 3

    const arrowContainer = document.createElement('div')
    arrowContainer.id = 'known-distance-test-arrow-indicators'
    arrowContainer.style.position = 'fixed'
    arrowContainer.style.top = '0'
    arrowContainer.style.left = '0'
    arrowContainer.style.width = '100%'
    arrowContainer.style.height = '100%'
    arrowContainer.style.pointerEvents = 'none'
    arrowContainer.style.zIndex = '999999998'

    const createArrow = (fromX, fromY, toX, toY) => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      svg.style.position = 'absolute'
      svg.style.top = '0'
      svg.style.left = '0'
      svg.style.width = '100%'
      svg.style.height = '100%'
      svg.style.overflow = 'visible'

      const dx = toX - fromX
      const dy = toY - fromY
      const distance = Math.sqrt(dx * dx + dy * dy)
      const unitX = dx / distance
      const unitY = dy / distance

      const endX = fromX + unitX * arrowSizePx
      const endY = fromY + unitY * arrowSizePx

      const line = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'line',
      )
      line.setAttribute('x1', fromX)
      line.setAttribute('y1', fromY)
      line.setAttribute('x2', endX)
      line.setAttribute('y2', endY)
      line.setAttribute('stroke', 'black')
      line.setAttribute('stroke-width', lineThicknessPx)
      line.setAttribute('stroke-linecap', 'butt')
      svg.appendChild(line)

      const arrowheadLength = arrowSizePx * 0.35
      const arrowheadAngle = 30 * (Math.PI / 180)
      const angle = Math.atan2(dy, dx)

      const leftWingX =
        endX - arrowheadLength * Math.cos(angle - arrowheadAngle)
      const leftWingY =
        endY - arrowheadLength * Math.sin(angle - arrowheadAngle)
      const leftWing = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'line',
      )
      leftWing.setAttribute('x1', endX)
      leftWing.setAttribute('y1', endY)
      leftWing.setAttribute('x2', leftWingX)
      leftWing.setAttribute('y2', leftWingY)
      leftWing.setAttribute('stroke', 'black')
      leftWing.setAttribute('stroke-width', lineThicknessPx)
      leftWing.setAttribute('stroke-linecap', 'butt')
      svg.appendChild(leftWing)

      const rightWingX =
        endX - arrowheadLength * Math.cos(angle + arrowheadAngle)
      const rightWingY =
        endY - arrowheadLength * Math.sin(angle + arrowheadAngle)
      const rightWing = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'line',
      )
      rightWing.setAttribute('x1', endX)
      rightWing.setAttribute('y1', endY)
      rightWing.setAttribute('x2', rightWingX)
      rightWing.setAttribute('y2', rightWingY)
      rightWing.setAttribute('stroke', 'black')
      rightWing.setAttribute('stroke-width', lineThicknessPx)
      rightWing.setAttribute('stroke-linecap', 'butt')
      svg.appendChild(rightWing)

      return svg
    }

    const leftArrow = createArrow(
      leftArrowX,
      midlineY,
      targetXYPx[0],
      targetXYPx[1],
    )
    arrowContainer.appendChild(leftArrow)

    const rightArrow = createArrow(
      rightArrowX,
      midlineY,
      targetXYPx[0],
      targetXYPx[1],
    )
    arrowContainer.appendChild(rightArrow)

    return arrowContainer
  }

  let arrowIndicators = null

  let screenWidth = window.innerWidth
  let screenHeight = window.innerHeight

  const container = document.createElement('div')
  container.style.position = 'fixed'
  container.style.top = '0'
  container.style.left = '0'
  container.style.width = '100vw'
  container.style.height = '100vh'
  container.style.userSelect = 'none'
  container.style.overflow = 'hidden'

  // ===================== TITLE ROW =====================
  const titleRow = document.createElement('div')
  titleRow.style.display = 'flex'
  titleRow.style.alignItems = 'baseline'
  titleRow.style.gap = `${pxPerMm * 10}px`
  titleRow.style.paddingInlineStart = '3rem'
  titleRow.style.margin = '2rem 0 0rem 0'
  titleRow.style.position = 'relative'
  container.appendChild(titleRow)

  const title = document.createElement('h1')
  viewingDistanceMeasurementCount = 1
  renderViewingDistanceProgressTitle()
  title.style.whiteSpace = 'pre-line'
  title.style.textAlign = 'start'
  title.style.margin = '0'
  title.dir = RC.LD.toLowerCase()
  title.id = 'distance-tracking-title'
  titleRow.appendChild(title)

  // ===================== INSTRUCTIONS CONTAINER =====================
  const instructionsContainer = document.createElement('div')
  instructionsContainer.style.display = 'flex'
  instructionsContainer.style.flexDirection = 'row'
  instructionsContainer.style.width = '100%'
  instructionsContainer.style.gap = '0'
  instructionsContainer.style.margin = '2rem 0 5rem 0'
  instructionsContainer.style.position = 'relative'
  instructionsContainer.style.zIndex = '3'
  container.appendChild(instructionsContainer)

  const instructionsUI = createStepInstructionsUI(instructionsContainer, {
    leftWidth: '50%',
    rightWidth: '50%',
    leftPaddingStart: '3rem',
    leftPaddingEnd: '1rem',
    rightPaddingStart: '1rem',
    rightPaddingEnd: '3rem',
    fontSize: 'clamp(1.1em, 2.5vw, 1.4em)',
    lineHeight: '1.4',
  })
  const leftInstructionsText = instructionsUI.leftText
  const rightInstructionsText = instructionsUI.rightText
  const rightInstructions = instructionsUI.rightColumn
  const sectionMediaContainer = instructionsUI.mediaContainer

  let stepInstructionModel = null
  let currentStepFlatIndex = 0

  const renderCurrentStepView = () => {
    const maxIdx = (stepInstructionModel?.flatSteps?.length || 1) - 1

    const handlePrev = () => {
      if (currentStepFlatIndex > 0) {
        currentStepFlatIndex--
        renderCurrentStepView()
      }
    }

    const handleNext = () => {
      if (currentStepFlatIndex < maxIdx) {
        currentStepFlatIndex++
        renderCurrentStepView()
      }
    }

    renderStepInstructions({
      model: stepInstructionModel,
      flatIndex: currentStepFlatIndex,
      elements: {
        leftText: leftInstructionsText,
        rightText: rightInstructionsText,
        mediaContainer: sectionMediaContainer,
      },
      options: {
        calibrateDistanceCheckBool: options.calibrateDistanceCheckBool,
        thresholdFraction: 0.6,
        useCurrentSectionOnly: true,
        resolveMediaUrl: resolveInstructionMediaUrl,
        stepperHistory: options.stepperHistory,
        onPrev: handlePrev,
        onNext: handleNext,
      },
      lang: RC.language.value,
      langDirection: RC.LD,
      phrases: phrases,
    })
  }

  const reflowInstructionsOnResize = () => renderCurrentStepView()
  window.addEventListener('resize', reflowInstructionsOnResize)

  const handleInstructionNav = e => {
    if (![3, 4].includes(currentPage) || !stepInstructionModel) return
    if (e.key === 'ArrowDown') {
      const maxIdx = (stepInstructionModel.flatSteps?.length || 1) - 1
      if (currentStepFlatIndex < maxIdx) {
        currentStepFlatIndex++
        renderCurrentStepView()
      }
      e.preventDefault()
      e.stopPropagation()
    } else if (e.key === 'ArrowUp') {
      if (currentStepFlatIndex > 0) {
        currentStepFlatIndex--
        renderCurrentStepView()
      }
      e.preventDefault()
      e.stopPropagation()
    }
  }
  document.addEventListener('keydown', handleInstructionNav)

  // ===================== PAGE NAVIGATION FUNCTIONS =====================

  const showPage = async pageNumber => {
    const previousPage = currentPage
    currentPage = pageNumber

    // Ensure the video preview doesn't occlude the stepper/instructions on pages 3/4.
    // Only adjusts when the video is positioned above the instructions (top overlap scenario).
    const ensureInstructionsBelowVideo = (gapPx = 16) => {
      const v = document.getElementById('webgazerVideoContainer')
      if (!v) return
      const apply = () => {
        try {
          // Reset to default marginTop first to avoid compounding across calls/pages
          instructionsContainer.style.marginTop = ''
          const vRect = v.getBoundingClientRect()
          const iRect = instructionsContainer.getBoundingClientRect()
          if (vRect.top <= iRect.top + 1) {
            const overlapPx = vRect.bottom + gapPx - iRect.top
            if (overlapPx > 0) {
              const baseTop =
                parseFloat(getComputedStyle(instructionsContainer).marginTop) ||
                0
              instructionsContainer.style.marginTop = `${Math.ceil(
                baseTop + overlapPx,
              )}px`
            }
          }
        } catch {}
      }
      requestAnimationFrame(() => {
        apply()
        setTimeout(apply, 50)
      })
    }

    if (pageNumber === 3) {
      // ===================== PAGE 3: VIDEO AT TOP CENTER =====================
      console.log('=== SHOWING PAGE 3: VIDEO AT TOP CENTER ===')

      if (previousPage !== 3) {
        viewingDistanceMeasurementCount++
      }
      renderViewingDistanceProgressTitle()

      console.log(
        `Page 3 title: Measurement ${viewingDistanceMeasurementCount} of ${viewingDistanceTotalExpected}`,
      )

      RC.showVideo(true)

      const videoContainer = document.getElementById('webgazerVideoContainer')
      if (videoContainer) {
        setDefaultVideoPosition(RC, videoContainer)
      }
      ensureInstructionsBelowVideo(18)

      try {
        const p3Text =
          (phrases.RC_UseObjectToSetViewingDistanceCreditCardPage3?.[RC.L] ||
            '') + ''
        stepInstructionModel = parseInstructions(p3Text, {
          assetMap: test_assetMap,
        })
        currentStepFlatIndex = 0
        renderCurrentStepView()
      } catch (e) {
        console.warn(
          'Failed to parse step instructions for Page 3; using plain text',
          e,
        )
        leftInstructionsText.textContent =
          phrases.RC_UseObjectToSetViewingDistanceCreditCardPage3[RC.L]
      }

      if (arrowIndicators) {
        arrowIndicators.remove()
      }
      const cameraXYPx = [window.innerWidth / 2, 0]
      arrowIndicators = createArrowIndicators(cameraXYPx)
      RC.background.appendChild(arrowIndicators)
      console.log('Arrow indicators added for page 3, pointing to top-center')

      console.log(
        '=== PAGE 3 READY - PRESS SPACE TO CAPTURE FACE MESH DATA ===',
      )
    } else if (pageNumber === 4) {
      // ===================== PAGE 4: VIDEO AT TOP CENTER (SAME AS PAGE 3) =====================
      console.log('=== SHOWING PAGE 4: VIDEO AT TOP CENTER ===')

      if (previousPage !== 4) {
        viewingDistanceMeasurementCount++
      }
      renderViewingDistanceProgressTitle()

      console.log(
        `Page 4 title: Measurement ${viewingDistanceMeasurementCount} of ${viewingDistanceTotalExpected}`,
      )

      RC.showVideo(true)

      // Position video at TOP CENTER (same as page 3) instead of lower right
      const videoContainer = document.getElementById('webgazerVideoContainer')
      if (videoContainer) {
        setDefaultVideoPosition(RC, videoContainer)
      }
      ensureInstructionsBelowVideo(18)

      // Use the same instructions as page 3 for now (duplicate as requested)
      try {
        const p4Text =
          (phrases.RC_UseObjectToSetViewingDistanceRepeatCreditCardPage4?.[
            RC.L
          ] || '') + ''
        stepInstructionModel = parseInstructions(p4Text, {
          assetMap: test_assetMap,
        })
        currentStepFlatIndex = 0
        renderCurrentStepView()
      } catch (e) {
        console.warn(
          'Failed to parse step instructions for Page 4; using plain text',
          e,
        )
        leftInstructionsText.textContent =
          phrases.RC_UseObjectToSetViewingDistanceRepeatCreditCardPage4[RC.L]
      }

      // Point arrows to TOP CENTER (same as page 3)
      if (arrowIndicators) {
        arrowIndicators.remove()
      }
      const cameraXYPx = [window.innerWidth / 2, 0]
      arrowIndicators = createArrowIndicators(cameraXYPx)
      RC.background.appendChild(arrowIndicators)
      console.log('Arrow indicators added for page 4, pointing to top-center')

      console.log(
        '=== PAGE 4 READY - PRESS SPACE TO CAPTURE FACE MESH DATA ===',
      )
    }
  }

  const nextPage = async () => {
    if (currentPage === 3) {
      await showPage(4)
    } else if (currentPage === 4) {
      // ===================== FINISH KNOWN DISTANCE TEST =====================
      console.log('=== FINISHING KNOWN DISTANCE TEST ===')

      if (savedMeasurementData) {
        console.log('Using saved measurement data:', savedMeasurementData)

        measureIntraocularDistanceCm(
          RC,
          ppi,
          options.calibrateDistancePupil,
          RC.calibrateDistanceIpdUsesZBool !== false,
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

        RC.newKnownDistanceTestData = savedMeasurementData
        RC.newViewingDistanceData = savedMeasurementData

        document.removeEventListener('keydown', handleKeyPress)

        RC._removeBackground()

        if (typeof callback === 'function') {
          callback(savedMeasurementData)
        }
      } else {
        console.error('No measurement data found!')
      }
    }
  }

  // ===================== KNOWN DISTANCE TEST FINISH FUNCTION =====================
  const knownDistanceTestFinishFunction = async () => {
    document.removeEventListener('keydown', handleKeyPress)
    document.removeEventListener('keyup', handleKeyPress)

    if (arrowIndicators) {
      arrowIndicators.remove()
      arrowIndicators = null
    }

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

    // ===================== CREATE MEASUREMENT DATA OBJECT =====================
    const data = {
      value: toFixedNumber(knownObjectLengthCm, 1),
      timestamp: performance.now(),
      method: 'knownDistance',
      raw: {
        knownObjectLengthCm: knownObjectLengthCm,
        ppi: ppi,
      },
      intraocularDistanceCm: null,
      faceMeshSamplesPage3: faceMeshSamplesPage3.map(sample =>
        isNaN(sample) ? sample : Math.round(sample),
      ),
      faceMeshSamplesPage4: faceMeshSamplesPage4.map(sample =>
        isNaN(sample) ? sample : Math.round(sample),
      ),
    }

    // ===================== CALCULATE CALIBRATION FACTORS =====================
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

    const distance1FactorCmPx = page3Average * knownObjectLengthCm
    RC.page3FactorCmPx = distance1FactorCmPx

    // For page 4, since we're using top center (same as page 3), use simple calculation
    const distance2FactorCmPx = page4Average * knownObjectLengthCm
    RC.page4FactorCmPx = distance2FactorCmPx

    const averageFactorCmPx = Math.round(
      (distance1FactorCmPx + distance2FactorCmPx) / 2,
    )

    console.log('=== Known Distance Test Calibration Factors ===')
    console.log('Known object distance:', data.value, 'cm')
    console.log('Page 3 valid samples:', validPage3Samples.length, '/ 5')
    console.log('Page 4 valid samples:', validPage4Samples.length, '/ 5')
    console.log('Page 3 average Face Mesh:', page3Average, 'px')
    console.log('Page 4 average Face Mesh:', page4Average, 'px')
    console.log('Page 3 calibration factor:', distance1FactorCmPx)
    console.log('Page 4 calibration factor:', distance2FactorCmPx)
    console.log('Average calibration factor:', averageFactorCmPx)
    console.log('==============================================')

    data.calibrationFactor = averageFactorCmPx
    data.distance1FactorCmPx = distance1FactorCmPx
    data.distance2FactorCmPx = distance2FactorCmPx
    data.viewingDistanceByKnownObject1Cm = data.value
    data.viewingDistanceByKnownObject2Cm = data.value

    data.page3Average = page3Average
    data.page4Average = page4Average

    RC.newKnownDistanceTestData = data
    RC.newViewingDistanceData = data

    if (options.calibrateDistanceCheckBool) {
      await RC._checkDistance(
        callback,
        data,
        'trackDistance',
        options.checkCallback,
        options.calibrateDistanceCheckCm,
        options.callbackStatic,
        options.calibrateDistanceCheckSecs,
        options.calibrateDistanceCheckLengthCm,
        options.calibrateDistanceCenterYourEyesBool,
        options.calibrateDistancePupil,
        options.calibrateDistanceChecking,
        options.calibrateDistanceSpotXYDeg,
        options.calibrateDistance,
        options.stepperHistory,
      )
    } else {
      if (typeof callback === 'function') {
        callback(data)
      }
    }

    RC._removeBackground()
  }

  const cleanupKnownDistanceTest = () => {
    document.removeEventListener('keydown', handleKeyPress)
    document.removeEventListener('keyup', handleKeyPress)
    document.removeEventListener('keydown', handleInstructionNav)

    if (removeKeypadHandler) {
      removeKeypadHandler()
    }

    if (typeof reflowInstructionsOnResize === 'function') {
      window.removeEventListener('resize', reflowInstructionsOnResize)
    }

    if (container && container.parentNode) {
      container.parentNode.removeChild(container)
    }

    RC._removeBackground()
  }

  const breakFunction = () => {
    document.removeEventListener('keydown', handleKeyPress)
    document.removeEventListener('keyup', handleKeyPress)
    document.removeEventListener('keydown', handleInstructionNav)

    knownDistanceTest(RC, options, callback)
  }

  // ===================== KEYPAD HANDLER =====================
  let removeKeypadHandler = setUpEasyEyesKeypadHandler(
    null,
    RC.keypadHandler,
    () => {
      // Trigger space key action on Return
      const spaceEvent = new KeyboardEvent('keydown', { key: ' ' })
      document.dispatchEvent(spaceEvent)
    },
    false,
    ['return'],
    RC,
  )

  let lastCapturedFaceImage = null

  // ===================== KEYBOARD EVENT HANDLER =====================
  const handleKeyPress = e => {
    if (e.key === ' ') {
      if (currentPage === 3 || currentPage === 4) {
        e.preventDefault()

        if ((currentPage === 3 || currentPage === 4) && !irisTrackingIsActive) {
          console.log('Iris tracking not active - ignoring space bar')
          return
        }

        document.removeEventListener('keydown', handleKeyPress)

        if (currentPage === 3 || currentPage === 4) {
          if (env !== 'mocha' && cameraShutterSound) {
            cameraShutterSound()
          }
        }

        if (currentPage === 3 || currentPage === 4) {
          lastCapturedFaceImage = captureVideoFrame(RC)
        }

        if (currentPage === 3) {
          ;(async () => {
            console.log('=== COLLECTING FACE MESH SAMPLES ON PAGE 3 ===')

            await collectFaceMeshSamples(
              RC,
              faceMeshSamplesPage3,
              ppi,
              meshSamplesDuringPage3,
            )
            cameraResolutionXYVpxPage3 = getCameraResolutionXY(RC)
            console.log(
              'Face Mesh calibration samples (page 3):',
              faceMeshSamplesPage3,
            )

            const validSamples = faceMeshSamplesPage3.filter(
              sample => !isNaN(sample),
            )
            if (
              validSamples.length < 5 ||
              faceMeshSamplesPage3.some(sample => isNaN(sample))
            ) {
              const capturedImage = lastCapturedFaceImage

              const result = await Swal.fire({
                ...swalInfoOptions(RC, { showIcon: false }),
                title: phrases.RC_FaceBlocked[RC.L],
                html: `<div style="text-align: center;">
                    <img src="${capturedImage}" style="max-width: 300px; max-height: 400px; border: 2px solid #ccc; border-radius: 8px;" alt="Camera view" />
                    <p style="margin-top: 15px; font-size: 0.7em; color: #666;">${phrases.RC_FaceImageNotSaved[RC.L]}</p>
                   </div>`,
                confirmButtonText: phrases.EE_ok[RC.L],
                allowEnterKey: true,
              })

              console.log('=== RETRYING FACE MESH SAMPLES ON PAGE 3 ===')
              lastCapturedFaceImage = null
              document.addEventListener('keydown', handleKeyPress)
            } else {
              // Check if we should finish after page 3 only (single page mode)
              if (useSinglePage) {
                console.log(
                  '=== ALL 5 FACE MESH SAMPLES VALID - FINISHING (SINGLE PAGE MODE) ===',
                )

                // Calculate calibration factor using only page 3 data
                const validPage3Samples = faceMeshSamplesPage3.filter(
                  sample => !isNaN(sample),
                )
                const page3Average = validPage3Samples.length
                  ? validPage3Samples.reduce((a, b) => a + b, 0) /
                    validPage3Samples.length
                  : 0

                const calibrationFactorSinglePage =
                  page3Average * knownObjectLengthCm
                RC.page3FactorCmPx = calibrationFactorSinglePage

                // Build complete data object (same structure as dual page mode)
                const singlePageData = {
                  value: toFixedNumber(knownObjectLengthCm, 1),
                  timestamp: performance.now(),
                  method: 'knownDistance',
                  intraocularDistanceCm: null,
                  faceMeshSamplesPage3: faceMeshSamplesPage3.map(sample =>
                    isNaN(sample) ? sample : Math.round(sample),
                  ),
                  faceMeshSamplesPage4: [], // Empty for single page
                  calibrationFactor: Math.round(calibrationFactorSinglePage),
                  distance1FactorCmPx: calibrationFactorSinglePage,
                  distance2FactorCmPx: null, // Not used in single page mode
                  viewingDistanceByKnownObject1Cm: toFixedNumber(
                    knownObjectLengthCm,
                    1,
                  ),
                  viewingDistanceByKnownObject2Cm: null,
                  page3Average: page3Average,
                  page4Average: null, // Not used in single page mode
                  raw: {
                    knownObjectLengthCm: knownObjectLengthCm,
                    ppi: ppi,
                  },
                }

                console.log('=== Single Page Mode Calibration ===')
                console.log('Known object distance:', knownObjectLengthCm, 'cm')
                console.log(
                  'Page 3 valid samples:',
                  validPage3Samples.length,
                  '/ 5',
                )
                console.log('Page 3 average Face Mesh:', page3Average, 'px')
                console.log(
                  'Calibration factor:',
                  Math.round(calibrationFactorSinglePage),
                )
                console.log('====================================')

                // Measure intraocular distance
                measureIntraocularDistanceCm(
                  RC,
                  ppi,
                  options.calibrateDistancePupil,
                  RC.calibrateDistanceIpdUsesZBool !== false,
                ).then(intraocularDistanceCm => {
                  if (intraocularDistanceCm) {
                    singlePageData.intraocularDistanceCm = intraocularDistanceCm
                  }
                })

                // Store data in RC (same as dual page mode)
                RC.newKnownDistanceTestData = singlePageData
                RC.newViewingDistanceData = singlePageData

                // Clean up keyboard listener
                document.removeEventListener('keydown', handleKeyPress)

                // Follow the SAME finish pattern as dual page mode
                if (options.calibrateDistanceCheckBool) {
                  // Call _checkDistance (same as knownDistanceTestFinishFunction)
                  await RC._checkDistance(
                    callback,
                    singlePageData,
                    'trackDistance',
                    options.checkCallback,
                    options.calibrateDistanceCheckCm,
                    options.callbackStatic,
                    options.calibrateDistanceCheckSecs,
                    options.calibrateDistanceCheckLengthCm,
                    options.calibrateDistanceCenterYourEyesBool,
                    options.calibrateDistancePupil,
                    options.calibrateDistanceChecking,
                    options.calibrateDistanceSpotXYDeg,
                    options.calibrateDistance,
                    options.stepperHistory,
                  )
                } else {
                  // Call callback directly (same as knownDistanceTestFinishFunction)
                  if (typeof callback === 'function') {
                    callback(singlePageData)
                  }
                }

                // Clean up background (same as knownDistanceTestFinishFunction)
                RC._removeBackground()

                lastCapturedFaceImage = null
              } else {
                console.log(
                  '=== ALL 5 FACE MESH SAMPLES VALID - CONTINUING TO PAGE 4 ===',
                )

                // Save measurement data before moving to page 4
                savedMeasurementData = {
                  value: toFixedNumber(knownObjectLengthCm, 1),
                  timestamp: performance.now(),
                  method: 'knownDistance',
                  intraocularDistanceCm: null,
                  faceMeshSamplesPage3: faceMeshSamplesPage3.map(sample =>
                    isNaN(sample) ? sample : Math.round(sample),
                  ),
                  faceMeshSamplesPage4: [],
                  raw: {
                    knownObjectLengthCm: knownObjectLengthCm,
                    ppi: ppi,
                  },
                }

                await nextPage()
                lastCapturedFaceImage = null

                document.addEventListener('keydown', handleKeyPress)
              }
            }
          })()
        } else if (currentPage === 4) {
          ;(async () => {
            console.log('=== COLLECTING FACE MESH SAMPLES ON PAGE 4 ===')

            await collectFaceMeshSamples(
              RC,
              faceMeshSamplesPage4,
              ppi,
              meshSamplesDuringPage4,
            )
            cameraResolutionXYVpxPage4 = getCameraResolutionXY(RC)
            console.log(
              'Face Mesh calibration samples (page 4):',
              faceMeshSamplesPage4,
            )

            const validSamples = faceMeshSamplesPage4.filter(
              sample => !isNaN(sample),
            )
            if (
              validSamples.length < 5 ||
              faceMeshSamplesPage4.some(sample => isNaN(sample))
            ) {
              const capturedImage = lastCapturedFaceImage

              const result = await Swal.fire({
                ...swalInfoOptions(RC, { showIcon: false }),
                title: phrases.RC_FaceBlocked[RC.L],
                html: `<div style="text-align: center;">
                    <img src="${capturedImage}" style="max-width: 300px; max-height: 400px; border: 2px solid #ccc; border-radius: 8px;" alt="Camera view" />
                    <p style="margin-top: 15px; font-size: 0.7em; color: #666;">${phrases.RC_FaceImageNotSaved[RC.L]}</p>
                   </div>`,
                confirmButtonText: phrases.EE_ok[RC.L],
                allowEnterKey: true,
              })

              console.log('=== RETRYING FACE MESH SAMPLES ON PAGE 4 ===')
              lastCapturedFaceImage = null
              document.addEventListener('keydown', handleKeyPress)
            } else {
              console.log(
                '=== ALL 5 FACE MESH SAMPLES VALID - CALCULATING FACTORS ===',
              )

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

              const page3FactorCmPx = page3Average * knownObjectLengthCm
              RC.page3FactorCmPx = page3FactorCmPx

              // Since page 4 uses top center (same as page 3), use simple calculation
              const page4FactorCmPx = page4Average * knownObjectLengthCm
              RC.page4FactorCmPx = page4FactorCmPx

              RC.averageKnownDistanceTestCalibrationFactor = Math.round(
                Math.sqrt(page3FactorCmPx * page4FactorCmPx),
              )

              console.log('=== CHECKING TOLERANCE WITH CALCULATED FACTORS ===')
              const [
                pass,
                message,
                min,
                max,
                RMin,
                RMax,
                maxRatio,
                factorRatio,
              ] = checkObjectTestTolerance(
                RC,
                faceMeshSamplesPage3,
                faceMeshSamplesPage4,
                options.calibrateDistanceAllowedRatio,
                options.calibrateDistanceAllowedRangeCm,
                knownObjectLengthCm,
                page3FactorCmPx,
                page4FactorCmPx,
              )
              if (RC.measurementHistory && message !== 'Pass')
                RC.measurementHistory.push(message)
              else if (message !== 'Pass') RC.measurementHistory = [message]

              if (pass) {
                console.log('=== TOLERANCE CHECK PASSED - FINISHING TEST ===')

                // Update saved measurement data with page 4 samples
                savedMeasurementData.faceMeshSamplesPage4 =
                  faceMeshSamplesPage4.map(sample =>
                    isNaN(sample) ? sample : Math.round(sample),
                  )

                await knownDistanceTestFinishFunction()
                lastCapturedFaceImage = null
              } else {
                console.log('=== TOLERANCE CHECK FAILED - RESTARTING ===')

                // Calculate display values (same as object test)
                const ipdpxRatio = Math.sqrt(
                  faceMeshSamplesPage3[0] / faceMeshSamplesPage4[0],
                )
                const newMin = min.toFixed(1) * ipdpxRatio
                const newMax = max.toFixed(1) / ipdpxRatio
                const ratioText = factorRatio.toFixed(2) // Use factorRatio (F1/F2) for display

                // Use proper phrases (same as object test)
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

                // Show error message
                await Swal.fire({
                  ...swalInfoOptions(RC, { showIcon: false }),
                  icon: undefined,
                  html: displayMessage,
                  allowEnterKey: true,
                  confirmButtonText: phrases.T_ok?.[RC.L] || 'OK',
                })

                // Show pause
                measurementState.factorRejectionCount++
                await showPauseBeforeNewObject(
                  RC,
                  measurementState.factorRejectionCount,
                )

                // Reset and restart from page 3
                faceMeshSamplesPage3.length = 0
                faceMeshSamplesPage4.length = 0
                meshSamplesDuringPage3.length = 0
                meshSamplesDuringPage4.length = 0
                savedMeasurementData = null
                viewingDistanceMeasurementCount = 0

                await showPage(3)
                document.addEventListener('keydown', handleKeyPress)
              }
            }
          })()
        }
      }
    }
  }

  // ===================== ADD TO BACKGROUND =====================
  RC._replaceBackground('')
  RC.background.appendChild(container)

  const videoContainer = document.getElementById('webgazerVideoContainer')
  if (videoContainer) {
    setDefaultVideoPosition(RC, videoContainer)
  }

  // ===================== INITIALIZE PAGE 3 =====================
  showPage(3)

  // Add keyboard event listener
  document.addEventListener('keydown', handleKeyPress)
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

// ===================== KNOWN DISTANCE TEST TRACKING =====================
// This function combines known distance test measurement with distance tracking
// It's the main function that:
// 1. Gets a reference point using the known distance test (credit card)
// 2. Uses that reference point to start Face Mesh tracking
RemoteCalibrator.prototype.trackDistanceKnown = function (
  options = {},
  callbackStatic = undefined,
  callbackTrack = undefined,
) {
  if (!this.checkInitialized()) return

  // First measure distance using known distance test
  // This gives us our reference point for Face Mesh
  this.measureDistanceKnown(
    {
      fullscreen: true,
      showVideo: true,
      ...options,
    },
    measurementData => {
      // Then start tracking using the known distance test data
      // This tells Face Mesh "this is what the facial landmarks look like at this distance"
      this.trackDistance(
        {
          ...options,
          useKnownDistanceTestData: true,
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
  calibrateDistancePupil = 'iris',
  calibrateDistanceIpdUsesZBool = true,
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
  const eyeDist = (a, b, useZ = true) => {
    if (useZ) {
      console.log(
        '[distance.js - measureIntraocularDistanceCm] eyeDist using 3D formula (with Z)',
      )
      return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
    }
    console.log(
      '[distance.js - measureIntraocularDistanceCm] eyeDist using 2D formula (NO Z)',
    )
    return Math.hypot(a.x - b.x, a.y - b.y)
  }
  const { leftEye, rightEye } = getLeftAndRightEyePointsFromMeshData(
    mesh,
    calibrateDistancePupil,
  )
  if (!leftEye || !rightEye) return null

  const pxDist = eyeDist(leftEye, rightEye, calibrateDistanceIpdUsesZBool)
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
  page3FactorCmPx = null,
  page4FactorCmPx = null,
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
  // Use the actual calculated factors if provided, otherwise fall back to simple calculation
  const F1 =
    page3FactorCmPx !== null ? page3FactorCmPx : page3Mean * measurementCm
  const F2 =
    page4FactorCmPx !== null ? page4FactorCmPx : page4Mean * measurementCm
  const factorRatio = F1 / F2 // Previous (Page 3) / Current (Page 4)

  // For tolerance check, use the maximum of the ratio and its inverse
  const ratio1 = F1 / F2
  const ratio2 = F2 / F1
  const maxRatio = Math.max(ratio1, ratio2)
  const maxAllowedRatio = Math.max(allowedRatio, 1 / allowedRatio)

  console.log('=== Object Test Tolerance Check (Factors) ===')
  console.log('Measurement (cm):', measurementCm.toFixed(2))
  console.log('Page 3 avg FM (px):', page3Mean.toFixed(2))
  console.log('Page 4 avg FM (px):', page4Mean.toFixed(2))
  console.log('F1 (page3FactorCmPx):', F1.toFixed(2))
  console.log('F2 (page4FactorCmPx):', F2.toFixed(2))
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
    factorRatio,
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
  calibrateDistancePupil = 'iris',
) => {
  if (calibrateDistancePupil === 'iris') {
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

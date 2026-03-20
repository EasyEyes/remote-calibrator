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
  forceFullscreen,
  enforceFullscreenOnSpacePress,
  isFullscreen,
  fitToViewport,
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
  fitStepperBoxToHeight,
} from './stepByStepInstructionHelps'
import { parseInstructions } from './instructionParserAdapter'
import { processInlineFormatting } from './markdownInstructionParser'
import { fitContentToAvailableSpace } from '../components/handPreference'
import { swalInfoOptions } from '../components/swalOptions'
import { setUpEasyEyesKeypadHandler } from '../extensions/keypadHandler'
import {
  showPopup,
  showTestPopup,
  hideResolutionSettingMessage,
  showVideoResolutionLabel,
  hideVideoResolutionLabel,
} from '../components/popup'
import { ppiToPxPerCm } from '../components/converters'
import {
  calculateFootXYPx,
  calculateNearestPoints,
  getMeshData,
  setMeasurementOverlay,
  clearMeasurementOverlay,
} from './distanceTrack'
import {
  parseLocation,
  parseLocationsArray,
  getArrowPositionForLocation,
  positionVideoForLocation,
  getGlobalPointForLocation,
  removeBigCircle,
  createLocationMeasurementManager,
  createMeasurementPageRenderer,
  buildMeasurementPageConfig,
} from './object'
import woodSvg from '../media/AdobeStock_1568677429.svg'
import { captureVideoFrame } from '../check/captureVideoFrame'

export const objectLengthCmGlobal = {
  value: null,
}
export const globalPointXYPx = {
  value: [window.screen.width / 2, 0],
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
/* Location-based measurement helpers are imported from ./object              */
/* -------------------------------------------------------------------------- */

// helper function to save multiple calibration measurements separately
export function saveCalibrationMeasurements(
  RC,
  method,
  measurements, // array of measurement objects
  spotDeg = undefined, // spot diameter in degrees for blindspot calibrations
  COMMON = undefined,
) {
  // initialize the calibration attempts object if it doesn't exist
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
      measurement.fOverWidth,
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
  fOverWidth = undefined,
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
        //for plot lists: override with current value
        if (
          key === 'acceptedFOverWidth' ||
          key === 'acceptedRatioFOverWidth' ||
          key === 'acceptedLocation' ||
          key === 'acceptedPointXYPx' ||
          key === 'acceptedLeftEyeFootXYPx' ||
          key === 'acceptedRightEyeFootXYPx' ||
          key === 'acceptedIpdOverWidth' ||
          key === 'acceptedRulerBasedEyesToFootCm' ||
          key === 'acceptedRulerBasedEyesToPointCm' ||
          key === 'acceptedImageBasedEyesToFootCm' ||
          key === 'acceptedImageBasedEyesToPointCm' ||
          key === 'rejectedFOverWidth' ||
          key === 'rejectedRatioFOverWidth' ||
          key === 'rejectedLocation' ||
          key === 'rejectedPointXYPx' ||
          key === 'rejectedLeftEyeFootXYPx' ||
          key === 'rejectedRightEyeFootXYPx' ||
          key === 'rejectedIpdOverWidth' ||
          key === 'rejectedRulerBasedEyesToFootCm' ||
          key === 'rejectedRulerBasedEyesToPointCm' ||
          key === 'rejectedImageBasedEyesToFootCm' ||
          key === 'rejectedImageBasedEyesToPointCm' ||
          key === 'historyFOverWidth' ||
          key === 'historyEyesToFootCm' ||
          key === 'historyPreferRightHandBool' ||
          key === 'acceptedPreferRightHandBool' ||
          key === 'rejectedPreferRightHandBool' ||
          key === 'snapshotsTaken' ||
          key === 'snapshotsRejected' ||
          key === 'estimatedLengthCm' ||
          key === 'estimatedLengthRatio' ||
          key === 'matchHalfLengthBool'
        ) {
          RC.calibrationAttemptsT[key] = v
        } else if (Array.isArray(v)) {
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
  const cameraWidth = cameraResolutionXYVpx ? cameraResolutionXYVpx[0] : null
  const fVpx = fOverWidth * cameraWidth
  // Use camera width for all ratios since fVpx, ipdOverWidth are derived from camera-space measurements

  const ipdOverWidth =
    currentIPDDistance && cameraWidth ? currentIPDDistance / cameraWidth : null
  const ipdOverWidthXYZ =
    ipdXYZVpx && cameraWidth ? ipdXYZVpx / cameraWidth : null
  const imageBasedEyesToFootCm = (fVpx * ipdCmValue) / currentIPDDistance
  const imageBasedEyesToPointCm = Math.sqrt(
    imageBasedEyesToFootCm ** 2 + footToPointCm ** 2,
  )

  const screenResolutionXYVpx = [window.screen.width, window.screen.height]

  // Create the calibration object
  const calibrationObject = {
    method: method,
    object: object,
    objectMeasuredMsg: COMMON?.objectMeasuredMsg,
    objectSuggestion: objectSuggestion,
    cameraResolutionXYVpx: safeRoundXYPx(cameraResolutionXYVpx), // camera resolution
    cameraHz: RC.gazeTracker?.webgazer?.videoParamsToReport?.frameRate || null,
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
export async function processMeshDataAndCalculateNearestPoints(
  RC,
  options,
  meshSamples,
  calibrationFactor,
  ppi,
  _leftMean = null, // retained for API stability (unused)
  _rightMean = null, // retained for API stability (unused)
  method = 'blindspot',
  order = 1,
  fixPoint = [window.screen.width / 2, window.screen.height / 2],
  spotPoint = [window.screen.width / 2, window.screen.height / 2],
  blindspotDeg = 0,
  fixationToSpotCm = 0,
  ipdVpx = 0,
  calibrateDistanceChecking = 'camera',
  _pointXYPx = [window.screen.width / 2, window.screen.height / 2],
  objectLengthCm = null,
  eye = 'unspecified',
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
    objectLengthCm,
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
    eye,
  )
  return {
    nearestPointsData,
    currentIPDDistance,
    ipdXYZVpx, // Always 3D IPD
  }
}

// Helper to create measurement object from nearest points data
export function createMeasurementObject(
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
  fOverWidth = null,
  snapshotAcceptedBool = false,
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
    fOverWidth: fOverWidth,
    snapshotAcceptedBool: snapshotAcceptedBool,
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
export async function measureIntraocularDistancePx(
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

  // Hide the resolution setting message now that we're ready to show the UI
  hideResolutionSettingMessage()

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

          let conditionalFaceImageNotSaved = ''
          if (!options.saveSnapshots) {
            conditionalFaceImageNotSaved = `<p style="margin-top:10px;font-size:0.8em;color:#666;">${processInlineFormatting(phrases.RC_FaceImageNotSaved ? phrases.RC_FaceImageNotSaved[RC.L] : '')}</p>`
          }
          await Swal.fire({
            ...swalInfoOptions(RC, { showIcon: false }),
            title: processInlineFormatting(
              phrases.RC_FaceBlocked ? phrases.RC_FaceBlocked[RC.L] : '',
            ),
            html: captured
              ? `<div style="text-align:center"><img src="${captured}" style="max-width:300px;max-height:400px;border:2px solid #ccc;border-radius:8px;"/>${conditionalFaceImageNotSaved}</div>`
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
    options.calibrateDistanceAllowedRatioFOverWidth || 1.1,
    1 / (options.calibrateDistanceAllowedRatioFOverWidth || 1.1),
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

  // Round values before testing so the accept/reject decision is
  // consistent with the integer-cm values shown to the participant.
  const roundedMin = Math.round(min)
  const roundedMax = Math.round(max)
  const roundedRMin = Math.round(RMin)
  const roundedRMax = Math.round(RMax)

  if (roundedMin < roundedRMin || roundedMax > roundedRMax) {
    const displayMessage = phrases.RC_viewingExceededRange[RC.L]
      .replace('[[N11]]', roundedMin)
      .replace('[[N22]]', roundedMax)
      .replace('[[N33]]', roundedRMin)
      .replace('[[N44]]', roundedRMax)
    await Swal.fire({
      ...swalInfoOptions(RC, { showIcon: false }),
      html: processInlineFormatting(
        displayMessage || 'Calibration not consistent. Please retry.',
      ),
    })
    cleanup(false)
    return await blindSpotTestNew(RC, options, toTrackDistance, callback)
  } else {
    const T = options.calibrateDistanceAllowedRatioFOverWidth || 1.1
    const eyeRatio = rightEyeFactor / leftEyeFactor
    const roundedPercent = Math.round(100 * eyeRatio)
    const lowerBound = Math.round(100 / T)
    const upperBound = Math.round(100 * T)
    const accepted =
      roundedPercent >= lowerBound && roundedPercent <= upperBound

    if (!accepted) {
      const displayMessage = phrases.RC_viewingBlindSpotRejected[RC.L]
        .replace('[[N1]]', roundedPercent.toString())
        .replace('[[TT1]]', lowerBound.toString())
        .replace('[[TT2]]', upperBound.toString())
      await Swal.fire({
        ...swalInfoOptions(RC, { showIcon: false }),
        html: processInlineFormatting(
          displayMessage || 'Calibration not consistent. Please retry.',
        ),
      })
      // Restart full calibration
      cleanup(false)
      return await blindSpotTestNew(RC, options, toTrackDistance, callback)
    }
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
      options.calibrateDistanceAllowedRatioPxPerCm,
      options.calibrateDistanceAllowedRatioFOverWidth,
      options.viewingDistanceWhichEye,
      options.saveSnapshots,
      options.calibrateDistanceCheckMinRulerCm,
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

// Helper functions

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

// ===================== KNOWN DISTANCE TEST SCHEME =====================
// This function measures viewing distance using a known object length (credit card)
// It skips the manual ruler measurement (pages 1-2) and goes straight to face mesh calibration
export async function knownDistanceTest(RC, options, callback = undefined) {
  console.log('=== knownDistanceTest FUNCTION CALLED ===')
  console.log(
    'options.calibrateDistanceLocations:',
    options.calibrateDistanceLocations,
  )
  RC._addBackground()

  // Store tube options on RC so locationUtils can access them
  RC._calibrateDistanceTubeDiameterCm =
    options.calibrateDistanceTubeDiameterCm ?? 3.5
  RC._calibrateDistanceDrawPaperTubeBool =
    options.calibrateDistanceDrawPaperTubeBool !== false

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
    _calibrateDistanceAllowedRatioFOverWidth:
      options.calibrateDistanceAllowedRatioFOverWidth,
    _calibrateDistancePupil: options.calibrateDistancePupil,
    _viewingDistanceWhichEye: options.viewingDistanceWhichEye,
    _viewingDistanceWhichPoint: options.viewingDistanceWhichPoint,
    // Plot lists (same shape as objectTestCommonData; accepted populated before tolerance check)
    acceptedFOverWidth: [],
    acceptedRatioFOverWidth: [],
    acceptedLocation: [],
    acceptedPointXYPx: [],
    rejectedFOverWidth: [],
    rejectedRatioFOverWidth: [],
    rejectedLocation: [],
    rejectedPointXYPx: [],
    // Per-snapshot metrics (knownDistanceTest has no mesh/eye data; eye fields are null)
    acceptedLeftEyeFootXYPx: [],
    acceptedRightEyeFootXYPx: [],
    acceptedIpdOverWidth: [],
    acceptedRulerBasedEyesToFootCm: [],
    acceptedRulerBasedEyesToPointCm: [],
    acceptedImageBasedEyesToFootCm: [],
    acceptedImageBasedEyesToPointCm: [],
    acceptedPreferRightHandBool: [],
    rejectedLeftEyeFootXYPx: [],
    rejectedRightEyeFootXYPx: [],
    rejectedIpdOverWidth: [],
    rejectedRulerBasedEyesToFootCm: [],
    rejectedRulerBasedEyesToPointCm: [],
    rejectedImageBasedEyesToFootCm: [],
    rejectedImageBasedEyesToPointCm: [],
    rejectedPreferRightHandBool: [],
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
    arrowContainer.style.zIndex = '1000000000001' // Above video to ensure arrows are never obscured

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

  const cleanupBeforeCheckDistance = () => {
    removeArrowIndicatorsFromDOMKnown()
    if (instructionsUI?.destroy) {
      instructionsUI.destroy()
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container)
    }
  }

  let stepInstructionModel = null
  let currentStepFlatIndex = 0
  let currentStepperPhraseKey = null
  let _showingReadFirstPopup = false

  const renderCurrentStepView = () => {
    const maxIdx = (stepInstructionModel?.flatSteps?.length || 1) - 1

    // Cement "already read" state whenever we're at or past the last step
    if (
      (currentPage === 3 || currentPage === 4) &&
      currentStepFlatIndex >= maxIdx &&
      currentStepperPhraseKey
    ) {
      RC._readInstructionPhraseKeys.add(currentStepperPhraseKey)
    }

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
        readFirstPhraseKey:
          currentPage === 3 || currentPage === 4
            ? currentStepperPhraseKey
            : null,
        readPhraseKeys: RC._readInstructionPhraseKeys,
        onPrev: handlePrev,
        onNext: handleNext,
      },
      lang: RC.language.value,
      langDirection: RC.LD,
      phrases: phrases,
    })

    fitContentToAvailableSpace({
      wrapper: instructionsContainer,
      navHintEl: instructionsContainer.querySelector('.rc-stepper-nav-hint'),
      stepperBox: instructionsContainer.querySelector('.rc-stepper-box'),
      handSelector: instructionsContainer.querySelector(
        '.rc-hand-preference-selector',
      ),
      barHeight: 44,
      fillTarget: 0.95,
      fitStepper: fitStepperBoxToHeight,
    })
    fitToViewport(container)
  }

  const reflowInstructionsOnResize = () => renderCurrentStepView()
  window.addEventListener('resize', reflowInstructionsOnResize)

  const handleInstructionNav = e => {
    if (![3, 4].includes(currentPage) || !stepInstructionModel) return
    if (e.key === 'ArrowDown') {
      const maxIdx = (stepInstructionModel.flatSteps?.length || 1) - 1
      if (currentStepFlatIndex < maxIdx) {
        currentStepFlatIndex++
      }
      // Always re-render to provide visual feedback (even if only one step)
      renderCurrentStepView()
      e.preventDefault()
      e.stopPropagation()
    } else if (e.key === 'ArrowUp') {
      if (currentStepFlatIndex > 0) {
        currentStepFlatIndex--
      }
      // Always re-render to provide visual feedback (even if only one step)
      renderCurrentStepView()
      e.preventDefault()
      e.stopPropagation()
    }
  }
  document.addEventListener('keydown', handleInstructionNav)

  // ===================== PAGE NAVIGATION FUNCTIONS =====================

  const showPage = async pageNumber => {
    const previousPage = currentPage
    currentPage = pageNumber

    const ensureInstructionsBelowVideo = (gapPx = 15) => {
      const v = document.getElementById('webgazerVideoContainer')
      if (!v) return
      const apply = () => {
        try {
          instructionsContainer.style.marginTop = ''
          void instructionsContainer.offsetHeight
          const vH = v.getBoundingClientRect().height || 0
          const containerTop = instructionsContainer.getBoundingClientRect().top
          const needed = vH + gapPx - containerTop
          instructionsContainer.style.marginTop =
            needed > 0 ? `${Math.ceil(needed)}px` : '0'
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
      showVideoResolutionLabel(RC)

      const videoContainer = document.getElementById('webgazerVideoContainer')
      if (videoContainer) {
        setDefaultVideoPosition(RC, videoContainer)
      }
      ensureInstructionsBelowVideo(18)

      try {
        const p3Text =
          (phrases.RC_UseObjectToSetViewingDistanceCreditCardPage3?.[RC.L] ||
            '') + ''
        currentStepperPhraseKey =
          'RC_UseObjectToSetViewingDistanceCreditCardPage3'
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
      dontUseYourRulerNote.style.display = 'none'
      console.log('=== SHOWING PAGE 4: VIDEO AT TOP CENTER ===')

      if (previousPage !== 4) {
        viewingDistanceMeasurementCount++
      }
      renderViewingDistanceProgressTitle()

      console.log(
        `Page 4 title: Measurement ${viewingDistanceMeasurementCount} of ${viewingDistanceTotalExpected}`,
      )

      RC.showVideo(true)
      showVideoResolutionLabel(RC)

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
        currentStepperPhraseKey =
          'RC_UseObjectToSetViewingDistanceRepeatCreditCardPage4'
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

  // Remove arrow indicator elements from DOM by id (so they never reappear in distance check)
  const removeArrowIndicatorsFromDOMKnown = () => {
    ;[
      'object-test-arrow-indicators',
      'known-distance-test-arrow-indicators',
    ].forEach(id => {
      const el = document.getElementById(id)
      if (el) el.remove()
    })
  }

  // ===================== KNOWN DISTANCE TEST FINISH FUNCTION =====================
  const knownDistanceTestFinishFunction = async () => {
    document.removeEventListener('keydown', handleKeyPress)
    document.removeEventListener('keyup', handleKeyPress)

    if (arrowIndicators) {
      arrowIndicators.remove()
      arrowIndicators = null
    }
    removeArrowIndicatorsFromDOMKnown()

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

    // Calculate geometric mean of the two factors (appropriate for ratio data)
    const averageFactorCmPx = Math.round(
      Math.sqrt(distance1FactorCmPx * distance2FactorCmPx),
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
      cleanupBeforeCheckDistance()
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
        options.calibrateDistanceAllowedRatioPxPerCm,
        options.calibrateDistanceAllowedRatioFOverWidth,
        options.viewingDistanceWhichEye,
        undefined,
        options.calibrateDistanceCheckMinRulerCm,
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
    // Remove stepper UI (including viewport-positioned media container)
    if (instructionsUI?.destroy) {
      instructionsUI.destroy()
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

        // Gate SPACE on pages 3/4: require stepper to be on the last step
        if (stepInstructionModel) {
          const maxIdx = (stepInstructionModel.flatSteps?.length || 1) - 1
          const alreadyRead =
            currentStepperPhraseKey &&
            RC._readInstructionPhraseKeys.has(currentStepperPhraseKey)
          if (!alreadyRead && currentStepFlatIndex < maxIdx) {
            if (!_showingReadFirstPopup) {
              _showingReadFirstPopup = true
              ;(async () => {
                await showPopup(
                  RC,
                  '',
                  phrases.EE_SpaceBarDisabledUntilInstructionsFullyRead?.[
                    RC.L
                  ] || '',
                )
                _showingReadFirstPopup = false
              })()
            }
            return
          }
          if (currentStepperPhraseKey) {
            RC._readInstructionPhraseKeys.add(currentStepperPhraseKey)
          }
        }
        // Enforce fullscreen - if not in fullscreen, force it, wait 4 seconds, and ignore this key press
        ;(async () => {
          const canProceed = await enforceFullscreenOnSpacePress(RC.L, RC)
          if (!canProceed) {
            // Key press flushed - not in fullscreen, now in fullscreen after 4 second wait
            // Wait for a new key press (do nothing, just return)
            return
          }

          if (
            (currentPage === 3 || currentPage === 4) &&
            !irisTrackingIsActive
          ) {
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
                let conditionalFaceImageNotSaved = ''
                if (!options.saveSnapshots) {
                  conditionalFaceImageNotSaved = `<p style="margin-top: 15px; font-size: 0.7em; color: #666;">${processInlineFormatting(phrases.RC_FaceImageNotSaved[RC.L])}</p>`
                }
                const result = await Swal.fire({
                  ...swalInfoOptions(RC, { showIcon: false }),
                  title: processInlineFormatting(phrases.RC_FaceBlocked[RC.L]),
                  html: `<div style="text-align: center;">
                    <img src="${capturedImage}" style="max-width: 300px; max-height: 400px; border: 2px solid #ccc; border-radius: 8px;" alt="Camera view" />
                    ${conditionalFaceImageNotSaved}
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
                  console.log(
                    'Known object distance:',
                    knownObjectLengthCm,
                    'cm',
                  )
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
                      singlePageData.intraocularDistanceCm =
                        intraocularDistanceCm
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
                      options.calibrateDistanceAllowedRatioPxPerCm,
                      options.calibrateDistanceAllowedRatioFOverWidth,
                      options.viewingDistanceWhichEye,
                      undefined,
                      options.calibrateDistanceCheckMinRulerCm,
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

                let conditionalFaceImageNotSaved = ''
                if (!options.saveSnapshots) {
                  conditionalFaceImageNotSaved = `<p style="margin-top: 15px; font-size: 0.7em; color: #666;">${processInlineFormatting(phrases.RC_FaceImageNotSaved[RC.L])}</p>`
                }

                const result = await Swal.fire({
                  ...swalInfoOptions(RC, { showIcon: false }),
                  title: processInlineFormatting(phrases.RC_FaceBlocked[RC.L]),
                  html: `<div style="text-align: center;">
                    <img src="${capturedImage}" style="max-width: 300px; max-height: 400px; border: 2px solid #ccc; border-radius: 8px;" alt="Camera view" />
                    ${conditionalFaceImageNotSaved}
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

                console.log(
                  '=== CHECKING TOLERANCE WITH CALCULATED FACTORS ===',
                )
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
                  options.calibrateDistanceAllowedRatioFOverWidth,
                  options.calibrateDistanceAllowedRangeCm,
                  knownObjectLengthCm,
                  RC.fOverWidth1,
                  RC.fOverWidth2,
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
                  const reasonIsOutOfRange = message.includes(
                    'out of allowed range',
                  )

                  // Ratio: new / old as integer percentage
                  const T_kdt =
                    options.calibrateDistanceAllowedRatioFOverWidth || 1.1
                  const kdtRatio =
                    RC.fOverWidth1 && RC.fOverWidth2
                      ? RC.fOverWidth2 / RC.fOverWidth1
                      : factorRatio
                  const kdtRoundedPct = Math.round(100 * kdtRatio)
                  const kdtLower = Math.round(100 / T_kdt)
                  const kdtUpper = Math.round(100 * T_kdt)

                  let displayMessage = ''
                  if (reasonIsOutOfRange) {
                    displayMessage = phrases.RC_viewingExceededRange[RC.L]
                      .replace('[[N11]]', Math.round(newMin))
                      .replace('[[N22]]', Math.round(newMax))
                      .replace('[[N33]]', Math.round(RMin))
                      .replace('[[N44]]', Math.round(RMax))
                  } else {
                    displayMessage =
                      phrases.RC_focalLengthMismatch?.[RC.L]
                        ?.replace('[[N1]]', kdtRoundedPct.toString())
                        .replace('[[TT1]]', kdtLower.toString())
                        .replace('[[TT2]]', kdtUpper.toString()) ||
                      `❌ The last two snapshots are inconsistent. Your new distance is ${kdtRoundedPct}% of that expected from your previous snapshot. Let's try again. Click OK or press RETURN.`
                  }

                  console.log(
                    `fOverWidth mismatch: ratio = ${kdtRoundedPct}% (fOverWidth1=${RC.fOverWidth1}, fOverWidth2=${RC.fOverWidth2})`,
                  )

                  // Rejected plot lists: only the more recent (page4) fOverWidth
                  if (RC.fOverWidth2 != null) {
                    knownDistanceTestCommonData.rejectedFOverWidth.push(
                      parseFloat(Number(RC.fOverWidth2).toFixed(4)),
                    )
                    knownDistanceTestCommonData.rejectedRatioFOverWidth.push(
                      parseFloat(
                        Number(RC.fOverWidth2 / RC.fOverWidth1).toFixed(4),
                      ),
                    )
                    knownDistanceTestCommonData.rejectedLocation.push(
                      options.calibrateDistanceLocations?.[1] ?? 'page4',
                    )
                    knownDistanceTestCommonData.rejectedPointXYPx.push(null)
                    // Rejected per-snapshot metrics (knownDistanceTest has no mesh; push null for eye fields)
                    knownDistanceTestCommonData.rejectedLeftEyeFootXYPx.push(
                      null,
                    )
                    knownDistanceTestCommonData.rejectedRightEyeFootXYPx.push(
                      null,
                    )
                    knownDistanceTestCommonData.rejectedIpdOverWidth.push(null)
                    knownDistanceTestCommonData.rejectedRulerBasedEyesToFootCm.push(
                      null,
                    )
                    knownDistanceTestCommonData.rejectedRulerBasedEyesToPointCm.push(
                      null,
                    )
                    knownDistanceTestCommonData.rejectedImageBasedEyesToFootCm.push(
                      null,
                    )
                    knownDistanceTestCommonData.rejectedImageBasedEyesToPointCm.push(
                      null,
                    )
                  }
                  // Shrink accepted lists if we had pushed before the check
                  for (let popCount = 0; popCount < 2; popCount++) {
                    if (
                      knownDistanceTestCommonData.acceptedFOverWidth.length > 0
                    ) {
                      knownDistanceTestCommonData.acceptedFOverWidth.pop()
                      knownDistanceTestCommonData.acceptedRatioFOverWidth.pop()
                      knownDistanceTestCommonData.acceptedLocation.pop()
                      knownDistanceTestCommonData.acceptedPointXYPx.pop()
                      knownDistanceTestCommonData.acceptedLeftEyeFootXYPx.pop()
                      knownDistanceTestCommonData.acceptedRightEyeFootXYPx.pop()
                      knownDistanceTestCommonData.acceptedIpdOverWidth.pop()
                      knownDistanceTestCommonData.acceptedRulerBasedEyesToFootCm.pop()
                      knownDistanceTestCommonData.acceptedRulerBasedEyesToPointCm.pop()
                      knownDistanceTestCommonData.acceptedImageBasedEyesToFootCm.pop()
                      knownDistanceTestCommonData.acceptedImageBasedEyesToPointCm.pop()
                      knownDistanceTestCommonData.acceptedPreferRightHandBool.pop()
                    }
                  }

                  // Show error message
                  await Swal.fire({
                    ...swalInfoOptions(RC, { showIcon: false }),
                    icon: undefined,
                    html: processInlineFormatting(displayMessage),
                    allowEnterKey: true,
                    confirmButtonText: phrases.T_ok?.[RC.L] || 'OK',
                  })

                  // Show pause
                  measurementState.factorRejectionCount++
                  // await showPauseBeforeNewObject(
                  //   RC,
                  //   measurementState.factorRejectionCount,
                  // )

                  // Reset and restart from page 3 - reject BOTH measurements
                  faceMeshSamplesPage3.length = 0
                  faceMeshSamplesPage4.length = 0
                  meshSamplesDuringPage3.length = 0
                  meshSamplesDuringPage4.length = 0
                  savedMeasurementData = null

                  // Reset measurement count to 0 - we're starting fresh with both snapshots
                  viewingDistanceMeasurementCount = 0
                  // Reset expected total to 2 (knownDistanceTest doesn't have paper mode)
                  viewingDistanceTotalExpected = 2

                  console.log(
                    `Rejected BOTH measurements (knownDistanceTest). Restarting from page 3. Count reset to: ${viewingDistanceMeasurementCount} of ${viewingDistanceTotalExpected}`,
                  )

                  await showPage(3)
                  document.addEventListener('keydown', handleKeyPress)
                }
              }
            })()
          }
        })() // Close the fullscreen enforcement async IIFE
      }
    }
  }

  // ===================== ADD TO BACKGROUND =====================
  // Hide the resolution setting message now that we're ready to show the UI
  hideResolutionSettingMessage()

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

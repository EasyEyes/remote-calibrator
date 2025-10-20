import RemoteCalibrator from '../core'

import {
  _getEyeToCameraCm,
  blindSpotTestNew,
  getLeftAndRightEyePointsFromMeshData,
  objectTest,
  solveEyeToScreenCm,
} from './distance'
import {
  toFixedNumber,
  constructInstructions,
  blurAll,
  sleep,
  safeExecuteFunc,
  median,
  average,
  emptyFunc,
  randn_bm,
  replaceNewlinesWithBreaks,
} from '../components/utils'
import { iRepeat } from '../components/iRepeat'
import { phrases } from '../i18n/schema'
import { spaceForLanguage } from '../components/language'
import { checkPermissions } from '../components/mediaPermission'
import Swal from 'sweetalert2'
import { swalInfoOptions } from '../components/swalOptions'
import { setUpEasyEyesKeypadHandler } from '../extensions/keypadHandler'
import { showTestPopup } from '../components/popup'

const originalStyles = {
  video: false,
}

// Pre-calibration popup similar to equipment popup
const showPreCalibrationPopup = async RC => {
  const html = `
    <p style="text-align: left; margin-top: 1rem; font-size: 1.4rem; line-height: 1.6;">
      ${phrases.RC_IsCameraTopCenter[RC.L].replace('\n', '<br />').replace('\n', '<br />')}
    </p>
    <div id="custom-radio-group">
      <label>
        <input type="radio" name="calibration-method" value="Yes" />
        ${phrases.RC_Yes[RC.L]}
      </label>
      <label>
        <input type="radio" name="calibration-method" value="No" />
        ${phrases.RC_No[RC.L]}
      </label>
      <label>
        <input type="radio" name="calibration-method" value="DontKnow" />
        ${phrases.RC_DontKnow[RC.L]}
      </label>
    </div>
  `

  const { value: result } = await Swal.fire({
    ...swalInfoOptions(RC, {
      showIcon: false,
    }),
    html,
    preConfirm: () => {
      const selected = document.querySelector(
        'input[name="calibration-method"]:checked',
      )
      if (!selected) {
        Swal.showValidationMessage(
          phrases.RC_PleaseSelectAnOption[RC.language.value],
        )
        return null
      }
      return selected.value
    },
    didOpen: () => {
      const customInputs = document.querySelectorAll(
        'input[name="calibration-method"]',
      )
      const keydownListener = event => {
        if (event.key === 'Enter') {
          Swal.clickConfirm() // Simulate the "OK" button click
        }
      }

      customInputs.forEach(input => {
        input.addEventListener('keyup', keydownListener)
      })

      if (RC.keypadHandler) {
        const removeKeypadHandler = setUpEasyEyesKeypadHandler(
          null,
          RC.keypadHandler,
          () => {
            removeKeypadHandler()
            Swal.clickConfirm()
          },
          false,
          ['return'],
          RC,
        )
      }

      // Store listeners for cleanup
      RC.customKeydownListener = keydownListener
      RC.customInputs = customInputs
    },
    willClose: () => {
      // Remove keydown event listeners when the modal closes
      if (RC.customInputs) {
        RC.customInputs.forEach(input => {
          input.removeEventListener('keyup', RC.customKeydownListener)
        })
      }
    },
  })

  if (!result) return null

  // Store the selected option for potential future use
  RC.preCalibrationChoice = result

  return result
}

RemoteCalibrator.prototype.trackDistance = async function (
  trackDistanceOptions = {},
  callbackStatic = undefined,
  callbackTrack = undefined,
) {
  /**
   * options -
   *
   * fullscreen: [Boolean]
   * repeatTesting: 1
   * pipWidthPx: [208]
   *
   * (Interface)
   * headline: [String]
   * description: [String]
   *
   */

  ////
  if (!this.checkInitialized()) return
  blurAll()
  ////

  if (this.gazeTracker.webgazer.getTracker().modelLoaded === false) {
    // inform the user that the model is still loading
    // Swal.fire({
    //   ...swalInfoOptions(this, { showIcon: false }),
    //   title: phrases.EE_FaceMeshLoading[this.L],
    //   showConfirmButton: false,
    //   allowOutsideClick: false,
    //   didOpen: () => {
    //     Swal.showLoading()
    //   },
    // })

    this.gazeTracker.webgazer.getTracker().loadModel()
    // Swal.close()
  }

  let description
  if (
    trackDistanceOptions.control !== undefined &&
    trackDistanceOptions.control === false
  )
    description = phrases.RC_viewingDistanceIntroLiMethod[this.L]
  else description = phrases.RC_viewingDistanceIntroLiMethod[this.L]

  const options = Object.assign(
    {
      fullscreen: false,
      repeatTesting: 1,
      sparkle: true,
      pipWidthPx:
        this._CONST.N.VIDEO_W[this.isMobile.value ? 'MOBILE' : 'DESKTOP'],
      showVideo: true,
      showFaceOverlay: false,
      decimalPlace: 1,
      framerate: 6, // tracking rate - increased from 3 for better performance
      desiredDistanceCm: undefined,
      desiredDistanceTolerance: 1.2,
      desiredDistanceMonitor: false,
      desiredDistanceMonitorCancelable: false,
      desiredDistanceMonitorAllowRecalibrate: true,
      nearPoint: true,
      showNearPoint: false,
      control: true, // CONTROL (EasyEyes) or AUTOMATIC (Li et al., 2018)
      headline: `${phrases.RC_distanceTrackingTitle[this.L]}`,
      description:
        phrases.RC_distanceTrackingIntroStart[this.L] +
        spaceForLanguage(this.L) +
        description +
        spaceForLanguage(this.L) +
        phrases.RC_distanceTrackingIntroEnd[this.L],
      check: false,
      checkCallback: null,
      showCancelButton: true,
      callbackStatic,
      useObjectTestData: false, // New option to use object test data
      objecttestdebug: false, // New option to show debug feedback div in object test
      calibrateTrackDistanceAllowedRatio: 1.1,
      calibrateTrackDistanceAllowedRangeCm: [30, 70],
      resolutionWarningThreshold: undefined,
      calibrateTrackDistanceSpotCm: 0.5,
      calibrateTrackDistanceBlindspotDiameterDeg: 2.0,
      calibrateTrackDistanceSpotXYDeg: [15.5, -1.5],
      viewingDistanceWhichEye: undefined,
      viewingDistanceWhichPoint: undefined,
      calibrateTrackDistanceBlindspotDebugging: false, // Debug option to show anatomical line and diamond center
      calibrateTrackDistanceChecking: undefined,
    },
    trackDistanceOptions,
  )

  try {
    this.viewingDistanceAllowedPreciseBool =
      trackDistanceOptions.viewingDistanceAllowedPreciseBool
  } catch (e) {
    this.viewingDistanceAllowedPreciseBool = false
  }

  /* -------------------------------------------------------------------------- */

  this.getFullscreen(options.fullscreen)

  if (this.gazeTracker.checkInitialized('distance')) {
    // ! Initialized
    this.gazeTracker._toFixedN = options.decimalPlace
    this.showNearPoint(options.showNearPoint)
    this.showVideo(options.showVideo)
    this.showFaceOverlay(options.showFaceOverlay)

    // TODO Attach new callbackTrack
    return
  }

  this._addBackground()
  this._constructFloatInstructionElement(
    'gaze-system-instruction',
    phrases.RC_starting[this.L],
  )

  // Permissions
  await checkPermissions(this)
  ////

  // STEP 2 - Live estimate
  const getStdDist = (distData, excecuteCallbackStaticHere = true) => {
    this.showVideo(originalStyles.video)
    originalStyles.video = false

    if (this.gazeTracker.checkInitialized('gaze', false))
      this.showGazer(originalGazer)

    console.log('=== Setting up tracking with measurement data ===')
    console.log('Distance data:', {
      value: distData.value,
      method: distData.method,
      calibrationFactor: distData.calibrationFactor,
      averageFaceMesh: distData.averageFaceMesh,
    })
    console.log('================================================')

    // Validate that we have a calibration factor
    if (!distData.calibrationFactor) {
      console.error('ERROR: No calibration factor found in measurement data!')
      console.error(
        'This means the measurement test did not properly calculate the calibration factor.',
      )
      console.error('Measurement data:', distData)
      return
    }

    console.log(
      '=== CALLING CALLBACK STATIC ===',
      excecuteCallbackStaticHere,
      distData,
      callbackStatic,
    )
    if (excecuteCallbackStaticHere) safeExecuteFunc(callbackStatic, distData)
    stdDist.current = distData
    stdDist.method = distData.method
    stdFactor = null
  }

  /* -------------------------------------------------------------------------- */

  // STEP 1 - Calibrate for live estimate
  const originalGazer = this.gazeTracker.webgazer.params.showGazeDot
  const _ = async () => {
    // Only show blindspot instruction screen if we're using blindspot test only
    // For object test only or 'both' mode, skip the instruction screen and go directly to the test
    if (!options.useObjectTestData) {
      this._addBackground()

      this._replaceBackground(
        constructInstructions(options.headline, null, true, ''),
      )

      if (this.gazeTracker.checkInitialized('gaze', false))
        this.showGazer(false)
    }

    // Show camera selection popup first (if multiple cameras available)
    console.log('=== Checking for camera selection ===')
    const cameraResult = await showTestPopup(this, null, options)

    // Check if experiment was ended due to no cameras
    if (cameraResult?.experimentEnded) {
      console.log('Experiment ended - no cameras detected')
    }

    // Mark that camera selection has been done to avoid calling it again in calibration methods
    options.cameraSelectionDone = true

    console.log('showIrisesBool', options.showIrisesBool)
    //calibrateTrackDistancePupil = iris, eyeCorners
    if (options.calibrateTrackDistancePupil === 'eyeCorners') {
      // set the gaze tracker to TFFacemesh_unrefined_landmarks
      await this.gazeTracker.webgazer.setTracker(
        'TFFacemesh_unrefined_landmarks',
      )
    }
    // Start iris drawing with mesh data before calibration tests
    if (options.showIrisesBool) {
      console.log('=== Starting iris drawing before calibration tests ===')
      await startIrisDrawingWithMesh(this)
    }

    // Show pre-calibration popup before starting any calibration methods
    //only show if calibrateTrackDistanceIsCameraTopCenterBool is true
    if (options.calibrateTrackDistanceIsCameraTopCenterBool) {
      const preCalibrationResult = await showPreCalibrationPopup(this)
      if (!preCalibrationResult) {
        // User cancelled or didn't select anything, exit gracefully
        console.log('Pre-calibration popup cancelled by user')
        return
      }
    }

    // Check if we should use object test data
    if (options.useObjectTestData === 'both') {
      console.log('=== Starting Both Methods Test ===')
      console.log(
        'This will run object test first, then blindspot test, then use median calibration factor',
      )
      // First run object test
      await objectTest(this, options, getStdDist)
    } else if (options.useObjectTestData) {
      console.log('=== Starting Object Test Only ===')
      console.log('This will use object test calibration factor for tracking')
      // Call objectTest directly for calibration
      await objectTest(this, options, getStdDist)
    } else {
      console.log('=== Starting Blindspot Test Only ===')
      console.log(
        'This will use blindspot test calibration factor for tracking',
      )
      // Use blindspot test for calibration
      await blindSpotTestNew(this, options, true, getStdDist)
    }
  }

  trackingOptions.pipWidthPx = options.pipWidthPx
  trackingOptions.decimalPlace = options.decimalPlace
  trackingOptions.framerate = options.framerate
  trackingOptions.nearPoint = options.nearPoint
  trackingOptions.showNearPoint = options.showNearPoint
  trackingOptions.showIrisesBool = options.showIrisesBool
  trackingOptions.showNearestPointsBool = options.showNearestPointsBool
  trackingOptions.calibrateTrackDistancePupil =
    options.calibrateTrackDistancePupil

  trackingOptions.desiredDistanceCm = options.desiredDistanceCm
  trackingOptions.desiredDistanceTolerance = options.desiredDistanceTolerance
  trackingOptions.desiredDistanceMonitor = options.desiredDistanceMonitor
  trackingOptions.desiredDistanceMonitorCancelable =
    options.desiredDistanceMonitorCancelable
  trackingOptions.desiredDistanceMonitorAllowRecalibrate =
    options.desiredDistanceMonitorAllowRecalibrate

  trackingOptions.viewingDistanceWhichEye = options.viewingDistanceWhichEye
  trackingOptions.viewingDistanceWhichPoint = options.viewingDistanceWhichPoint

  originalStyles.video = options.showVideo

  this.gazeTracker._init(
    {
      toFixedN: 1,
      showVideo: true,
      showFaceOverlay: options.showFaceOverlay,
    },
    'distance',
  )

  this._trackingSetupFinishedStatus.distance = false

  const trackingConfig = {
    options: options,
    callbackStatic: callbackStatic,
    callbackTrack: callbackTrack,
  }

  if (options.nearPoint) {
    startTrackingPupils(
      this,
      () => {
        return this._measurePD({}, _)
      },
      callbackTrack,
      trackingConfig,
    )
  } else {
    startTrackingPupils(this, _, callbackTrack, trackingConfig)
  }
}

RemoteCalibrator.prototype.setViewingDistanceAllowedPreciseBool = function (
  value = true,
) {
  this.viewingDistanceAllowedPreciseBool = value
}

/* -------------------------------------------------------------------------- */

const startTrackingPupils = async (
  RC,
  beforeCallbackTrack,
  callbackTrack,
  trackingConfig,
) => {
  await RC.gazeTracker.webgazer.getTracker().loadModel()

  RC.gazeTracker.beginVideo({ pipWidthPx: trackingOptions.pipWidthPx }, () => {
    RC._removeFloatInstructionElement()

    safeExecuteFunc(beforeCallbackTrack)
    _tracking(RC, trackingOptions, callbackTrack, trackingConfig)
  })
}

const eyeDist = (a, b) => {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
}

const cyclopean = (video, a, b) => {
  return [
    (-a.x - b.x + video.videoWidth) / 2,
    (-a.y - b.y + video.videoHeight) / 2,
  ]
}

/* -------------------------------------------------------------------------- */
const trackingOptions = {
  pipWidthPx: 0,
  decimalPlace: 2,
  framerate: 30,
  nearPoint: true,
  showNearPoint: false,
  desiredDistanceCm: undefined,
  desiredDistanceTolerance: 1.2,
  desiredDistanceMonitor: false,
  desiredDistanceMonitorCancelable: false,
  desiredDistanceMonitorAllowRecalibrate: true,
}

export const stdDist = {
  current: null,
  method: null, // Track which method was used
}

let stdFactor = null
let video = null
let viewingDistanceTrackingFunction = null
const iRepeatOptions = { framerate: 20, break: true }

let nearPointDot = null
/* -------------------------------------------------------------------------- */

// Canvas-based iris and pupil drawing
let irisCanvas = null
let irisCtx = null
let irisRafId = null
let RC_instance = null // Store RC instance for independent data access
let sharedFaceData = null // Shared face data between tracking and iris drawing
export let irisTrackingIsActive = false // Reflects whether tracking is currently active
let lastIrisValidTime = 0 // Timestamp of last valid face mesh
const IRIS_VALIDITY_WINDOW_MS = 200 // Consider tracking active if we saw valid mesh within this shorter window

// FPS throttling variables
const targetFPS = 30
const frameInterval = 1000 / targetFPS
let lastFrameTime = 0
let lastIrisFrameTime = 0
let lastIrisTrackingTime = 0

const createIrisCanvas = () => {
  if (irisCanvas) return irisCanvas

  irisCanvas = document.createElement('canvas')
  irisCanvas.id = 'rc-iris-overlay'
  irisCanvas.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    pointer-events: none;
    z-index: 2147483647;
  `

  // Set canvas size to match viewport
  irisCanvas.width = window.innerWidth
  irisCanvas.height = window.innerHeight

  document.body.appendChild(irisCanvas)
  irisCtx = irisCanvas.getContext('2d')

  // Handle window resize
  window.addEventListener('resize', () => {
    if (irisCanvas) {
      irisCanvas.width = window.innerWidth
      irisCanvas.height = window.innerHeight
    }
  })

  return irisCanvas
}

const drawIrisAndPupil = () => {
  if (!irisCtx || !sharedFaceData) return

  // Clear canvas
  irisCtx.clearRect(0, 0, irisCanvas.width, irisCanvas.height)

  // Check if iris drawing should be enabled
  if (!RC_instance || !trackingOptions.showIrisesBool) {
    // Canvas is already cleared above, just return
    return
  }

  const { leftEye, rightEye, video, currentIPDDistance } = sharedFaceData

  if (!leftEye || !rightEye || !video || !currentIPDDistance) return

  // Find video element for positioning
  const videoFeed = document.getElementById('webgazerVideoFeed')
  const videoContainer = document.getElementById('webgazerVideoContainer')
  const videoEl = videoFeed || videoContainer

  if (!videoEl) return

  const rect = videoEl.getBoundingClientRect()

  // Source coordinate space (facemesh/video canvas)
  const srcW = video.width
  const srcH = video.height

  // Account for CSS object-fit by computing scale and crop/letterbox offsets
  const containerW = rect.width
  const containerH = rect.height
  const scaleCover = Math.max(containerW / srcW, containerH / srcH)
  const uniformScale = scaleCover
  const offsetX = (srcW * uniformScale - containerW) / 2
  const offsetY = (srcH * uniformScale - containerH) / 2

  // Apply horizontal flip since video is typically mirrored
  const leftEyeXFlipped = srcW - leftEye.x
  const rightEyeXFlipped = srcW - rightEye.x

  const leftPx = {
    x: rect.left + leftEyeXFlipped * uniformScale - offsetX,
    y: rect.top + leftEye.y * uniformScale - offsetY,
  }
  const rightPx = {
    x: rect.left + rightEyeXFlipped * uniformScale - offsetX,
    y: rect.top + rightEye.y * uniformScale - offsetY,
  }

  // Compute iris diameter from IPD (19%) in source pixels, then scale to CSS
  const ipdSrcPx =
    currentIPDDistance ||
    Math.hypot(
      rightEye.x - leftEye.x,
      rightEye.y - leftEye.y,
      rightEye.z - leftEye.z,
    )
  const irisDiameter = Math.max(4, 0.19 * ipdSrcPx * uniformScale)
  const pupilDiameter = Math.max(2, 0.4 * irisDiameter)
  const irisRadius = irisDiameter / 2
  const pupilRadius = pupilDiameter / 2

  // Choose iris color based on tracking status
  const irisFillColor = irisTrackingIsActive ? '#00ffe9' : '#ff3b30'

  // Draw left iris
  irisCtx.beginPath()
  irisCtx.arc(leftPx.x, leftPx.y, irisRadius, 0, 2 * Math.PI)
  irisCtx.fillStyle = irisFillColor
  irisCtx.fill()

  // Add iris shadow effect
  irisCtx.beginPath()
  irisCtx.arc(leftPx.x, leftPx.y, irisRadius, 0, 2 * Math.PI)
  irisCtx.strokeStyle = 'rgba(0,0,0,0.35)'
  irisCtx.lineWidth = 2
  irisCtx.stroke()

  // Draw left pupil
  irisCtx.beginPath()
  irisCtx.arc(leftPx.x, leftPx.y, pupilRadius, 0, 2 * Math.PI)
  irisCtx.fillStyle = '#000'
  irisCtx.fill()

  // Draw right iris
  irisCtx.beginPath()
  irisCtx.arc(rightPx.x, rightPx.y, irisRadius, 0, 2 * Math.PI)
  irisCtx.fillStyle = irisFillColor
  irisCtx.fill()

  // Add iris shadow effect
  irisCtx.beginPath()
  irisCtx.arc(rightPx.x, rightPx.y, irisRadius, 0, 2 * Math.PI)
  irisCtx.strokeStyle = 'rgba(0,0,0,0.35)'
  irisCtx.lineWidth = 2
  irisCtx.stroke()

  // Draw right pupil
  irisCtx.beginPath()
  irisCtx.arc(rightPx.x, rightPx.y, pupilRadius, 0, 2 * Math.PI)
  irisCtx.fillStyle = '#000'
  irisCtx.fill()
}

const startIrisDrawing = RC => {
  RC_instance = RC // Store RC instance for independent access

  // Only create canvas and start drawing if iris drawing is enabled
  if (!trackingOptions.showIrisesBool) {
    console.log('Iris drawing disabled - showIrisesBool is false')
    return
  }

  if (!irisCanvas) createIrisCanvas()

  // Start independent iris drawing loop that uses shared mesh data
  const renderIris = currentTime => {
    if (iRepeatOptions.break) return

    // Throttle to 30fps
    if (currentTime - lastIrisFrameTime >= frameInterval) {
      // Use the mesh data from the shared face data (updated by distance tracking)
      if (sharedFaceData) {
        drawIrisAndPupil()
      }
      lastIrisFrameTime = currentTime
    }

    irisRafId = requestAnimationFrame(renderIris)
  }

  irisRafId = requestAnimationFrame(renderIris)
}

const stopIrisDrawing = () => {
  // Cancel animation frame
  if (irisRafId) {
    cancelAnimationFrame(irisRafId)
    irisRafId = null
  }

  // Clear canvas
  if (irisCtx) {
    irisCtx.clearRect(0, 0, irisCanvas.width, irisCanvas.height)
  }

  RC_instance = null // Clear the RC instance reference
  sharedFaceData = null // Clear shared data
}

const updateSharedFaceData = (leftEye, rightEye, video, currentIPDDistance) => {
  sharedFaceData = { leftEye, rightEye, video, currentIPDDistance }
}

// Start iris drawing with continuous mesh data tracking
const startIrisDrawingWithMesh = async RC => {
  console.log('=== Starting iris drawing with continuous mesh tracking ===')

  // Check if iris drawing is enabled
  if (!trackingOptions.showIrisesBool) {
    console.log('Iris drawing disabled - showIrisesBool is false')
    return false
  }

  // Start the iris drawing canvas first
  startIrisDrawing(RC)

  // Create a continuous tracking loop for iris drawing during calibration
  let irisTrackingActive = true
  let irisTrackingRafId = null

  const trackIrisPosition = async currentTime => {
    if (!irisTrackingActive || iRepeatOptions.break) {
      console.log('Iris tracking stopped')
      return
    }

    // Throttle to 30fps for drawing, but we use a freshness window to avoid flicker
    if (currentTime - lastIrisTrackingTime >= frameInterval) {
      // Get current mesh data
      const meshData = await getMeshData(
        RC,
        trackingOptions.calibrateTrackDistancePupil,
      )
      if (meshData && meshData.leftEye && meshData.rightEye) {
        // Update last time we saw a valid mesh
        lastIrisValidTime = currentTime
        const { leftEye, rightEye, video, currentIPDDistance } = meshData

        // Update shared face data for iris drawing
        updateSharedFaceData(leftEye, rightEye, video, currentIPDDistance)

        // Log occasionally for debugging (every ~30 frames at 30fps = 1 second)
        if (Math.random() < 0.033) {
          console.log('Iris tracking update:', {
            leftEye: `(${leftEye.x.toFixed(1)}, ${leftEye.y.toFixed(1)})`,
            rightEye: `(${rightEye.x.toFixed(1)}, ${rightEye.y.toFixed(1)})`,
            ipd: currentIPDDistance.toFixed(1),
          })
        }
      }
      // Compute active status based on freshness window (no motion required)
      irisTrackingIsActive =
        currentTime - lastIrisValidTime <= IRIS_VALIDITY_WINDOW_MS
      lastIrisTrackingTime = currentTime
    }

    // Continue tracking
    irisTrackingRafId = requestAnimationFrame(trackIrisPosition)
  }

  // Start the tracking loop
  irisTrackingRafId = requestAnimationFrame(trackIrisPosition)

  // Store cleanup function on RC instance so it can be called later
  RC._stopIrisTracking = () => {
    console.log('=== Stopping iris tracking ===')
    irisTrackingActive = false
    if (irisTrackingRafId) {
      cancelAnimationFrame(irisTrackingRafId)
      irisTrackingRafId = null
    }
  }

  console.log(
    'Iris tracking started - irises will follow face movement during calibration',
  )
  return true
}

// Factor out mesh data retrieval for reuse
export const getMeshData = async (
  RC,
  calibrateTrackDistancePupil = 'iris',
  meshSamples = [],
) => {
  const video = document.getElementById('webgazerVideoCanvas')
  if (!video) {
    console.log('Video canvas not ready for mesh data retrieval')
    return null
  }
  let mesh = meshSamples.length
    ? meshSamples
    : RC.gazeTracker.webgazer.getTracker().getPositions()
  // Try to use WebGazer's mesh data first, but fallback to our own detection if stale
  let meshSource = 'webgazer'

  // Check if WebGazer mesh data is stale (WebGazer might be paused)
  console.log('paused', RC.gazeTracker.webgazer.params.paused)
  if (!mesh || mesh.length === 0 || RC.gazeTracker.webgazer.params.paused) {
    console.log('WebGazer mesh stale or paused, using own face detection')
    try {
      const model = await RC.gazeTracker.webgazer.getTracker().model
      const faces = await model.estimateFaces(video)
      if (faces.length) {
        mesh = faces[0].keypoints
        meshSource = 'own'
      }
    } catch (error) {
      console.warn('Own face detection failed:', error)
      mesh = null
    }
  }

  console.log('Mesh source:', meshSource, 'length:', mesh && mesh.length)

  if (mesh && mesh.length) {
    const { leftEye, rightEye } = getLeftAndRightEyePointsFromMeshData(
      mesh,
      calibrateTrackDistancePupil,
    )
    if (leftEye && rightEye) {
      const currentIPDDistance = eyeDist(leftEye, rightEye)

      return {
        mesh,
        leftEye,
        rightEye,
        video,
        currentIPDDistance,
        meshSource,
      }
    }
  }

  return null
}

/* -------------------------------------------------------------------------- */

let readyToGetFirstData = false
let rafId = null

const _tracking = async (
  RC,
  trackingOptions,
  callbackTrack,
  trackingConfig,
) => {
  // const video = document.getElementById('webgazerVideoCanvas')
  RC.improvedDistanceTrackingData = {
    left: {
      nearestXYPx: [0, 0],
      nearestDistanceCm: 0,
      distanceCm: 0,
    },
    right: {
      nearestXYPx: [0, 0],
      nearestDistanceCm: 0,
      distanceCm: 0,
    },
    nearEye: 'left',
    distanceCm: 0,
    nearestXYPx: [0, 0],
    nearestDistanceCm: 0,
    oldDistanceCm: 0,
  }

  const model = await RC.gazeTracker.webgazer.getTracker().model

  // Near point setup
  const ppi = RC.screenPpi ? RC.screenPpi.value : RC._CONST.N.PPI_DONT_USE
  const pxPerCm = ppi / 2.54
  if (!RC.screenPpi && trackingOptions.nearPoint)
    console.error(
      'Screen size measurement is required to get accurate near point tracking.',
    )

  if (trackingOptions.nearPoint && trackingOptions.showNearPoint) {
    nearPointDot = document.createElement('div')
    nearPointDot.id = 'rc-near-point-dot'
    document.body.appendChild(nearPointDot)

    Object.assign(nearPointDot.style, {
      display: 'block',
      zIndex: 999999,
      width: '10px', // TODO Make it customizable
      height: '10px',
      background: 'green',
      position: 'fixed',
      top: '-15px',
      left: '-15px',
    })
  }

  readyToGetFirstData = false
  const {
    desiredDistanceCm,
    desiredDistanceTolerance,
    desiredDistanceMonitor,
    desiredDistanceMonitorCancelable,
    desiredDistanceMonitorAllowRecalibrate,
  } = trackingOptions

  // Always enable correct on a fresh start
  RC._distanceTrackNudging.distanceCorrectEnabled = true
  RC._distanceTrackNudging.distanceDesired = desiredDistanceCm
  RC._distanceTrackNudging.distanceAllowedRatio = desiredDistanceTolerance

  // Set break to false to start the tracking loop
  iRepeatOptions.break = false

  // Stop the calibration-phase iris tracking since main tracking will take over
  if (RC._stopIrisTracking) {
    RC._stopIrisTracking()
    RC._stopIrisTracking = null
  }

  // Note: Iris drawing canvas is already created, main tracking will update the shared data

  // Main tracking loop using requestAnimationFrame like FaceMesh demo
  const renderPrediction = async currentTime => {
    if (iRepeatOptions.break) {
      // Stop the animation loop if break is set
      return
    }

    // Throttle to 30fps
    if (currentTime - lastFrameTime >= frameInterval) {
      await renderDistanceResult(
        RC,
        trackingOptions,
        callbackTrack,
        trackingConfig,
        model,
        ppi,
        pxPerCm,
        desiredDistanceCm,
        desiredDistanceMonitor,
        desiredDistanceMonitorCancelable,
        desiredDistanceMonitorAllowRecalibrate,
      )
      lastFrameTime = currentTime
    }

    rafId = requestAnimationFrame(renderPrediction)
  }

  // Start the tracking loop
  rafId = requestAnimationFrame(renderPrediction)
}

export const calculateFootXYPx = (
  RC,
  video,
  leftEye,
  rightEye,
  pxPerCm,
  currentIPDDistance,
) => {
  const centerXYCameraPx = getCenterXYCameraPx(video)

  // Mirror correction: Video is horizontally flipped, so flip X coordinates to match screen
  //left eye: 468
  //right eye: 473
  const leftEyeX = video.width - leftEye.x // Flip X coordinate
  const leftEyeY = leftEye.y // Y coordinate unchanged
  const rightEyeX = video.width - rightEye.x // Flip X coordinate
  const rightEyeY = rightEye.y // Y coordinate unchanged

  const ipdCameraPx = eyeDist(leftEye, rightEye)

  const offsetXYCameraPx_left = [
    leftEyeX - centerXYCameraPx[0],
    leftEyeY - centerXYCameraPx[1],
  ]
  const offsetXYCameraPx_right = [
    rightEyeX - centerXYCameraPx[0],
    rightEyeY - centerXYCameraPx[1],
  ]

  const offsetXYCm_left = [
    (offsetXYCameraPx_left[0] * RC._CONST.IPD_CM) / currentIPDDistance,
    (offsetXYCameraPx_left[1] * RC._CONST.IPD_CM) / currentIPDDistance,
  ]
  const offsetXYCm_right = [
    (offsetXYCameraPx_right[0] * RC._CONST.IPD_CM) / currentIPDDistance,
    (offsetXYCameraPx_right[1] * RC._CONST.IPD_CM) / currentIPDDistance,
  ]

  const cameraXYPx = [window.innerWidth / 2, 0]

  const nearestXYPx_left = [
    cameraXYPx[0] + offsetXYCm_left[0] * pxPerCm,
    cameraXYPx[1] + offsetXYCm_left[1] * pxPerCm,
  ]
  const nearestXYPx_right = [
    cameraXYPx[0] + offsetXYCm_right[0] * pxPerCm,
    cameraXYPx[1] + offsetXYCm_right[1] * pxPerCm,
  ]

  return {
    nearestXYPx_left,
    nearestXYPx_right,
    ipdCameraPx,
    offsetXYCm_left,
    offsetXYCm_right,
    cameraXYPx,
    pxPerCm,
  }
}

// Function to calculate nearest points for both eyes
export const calculateNearestPoints = (
  video,
  leftEye,
  rightEye,
  currentIPDDistance,
  webcamToEyeDistance,
  pxPerCm,
  ppi,
  RC,
  options = {},
  leftMean = 0,
  rightMean = 0,
  method = 'object',
  order = 1, // 1 for first measurement (right-eye for blindspot, page3 for object), 2 for second measurement (left-eye for blindspot, page4 for object)
  fixPoint = [window.innerWidth / 2, window.innerHeight / 2],
  spotPoint = [window.innerWidth / 2, window.innerHeight / 2],
  blindspotDeg = 0,
  fixationToSpotCm = 0,
  ipdCameraPx = 0,
) => {
  const {
    nearestXYPx_left,
    nearestXYPx_right,
    offsetXYCm_left,
    offsetXYCm_right,
    cameraXYPx,
  } = calculateFootXYPx(
    RC,
    video,
    leftEye,
    rightEye,
    pxPerCm,
    currentIPDDistance,
  )

  let eyeToFootCm = 0
  if (webcamToEyeDistance === 0) {
    try {
      const { d_cm, d_px } = solveEyeToScreenCm(
        order === 1 ? nearestXYPx_right : nearestXYPx_left,
        fixPoint,
        spotPoint,
        blindspotDeg,
        pxPerCm,
      )
      eyeToFootCm = d_cm
      // TEMP: use _getEyeToCameraCm instead of solveEyeToScreenCm
      // eyeToFootCm = _getEyeToCameraCm(
      //   fixationToSpotCm,
      //   options.calibrateTrackDistanceSpotXYDeg,
      // )
    } catch (e) {
      // eyeToFootCm = _getEyeToCameraCm(
      //   fixationToSpotCm,
      //   options.calibrateTrackDistanceSpotXYDeg,
      // )
      throw new Error(e)
    }
  } else {
    eyeToFootCm = webcamToEyeDistance
  }

  const footXYPx = order === 1 ? nearestXYPx_right : nearestXYPx_left
  const footToCameraCm =
    Math.hypot(cameraXYPx[0] - footXYPx[0], cameraXYPx[1] - footXYPx[1]) /
    pxPerCm
  const eyeToCameraCm = Math.hypot(footToCameraCm, eyeToFootCm)
  const calibrationFactor = Math.round(eyeToCameraCm * ipdCameraPx)

  // Clamp coordinates to stay within viewport bounds
  const clampedNearestLeft = [
    Math.max(0, Math.min(nearestXYPx_left[0], window.innerWidth)),
    Math.max(0, Math.min(nearestXYPx_left[1], window.innerHeight)),
  ]
  const clampedNearestRight = [
    Math.max(0, Math.min(nearestXYPx_right[0], window.innerWidth)),
    Math.max(0, Math.min(nearestXYPx_right[1], window.innerHeight)),
  ]

  //calculate nearest distance cm left and right from webcamToEyeDistance and OffsetXYCm_left and OffsetXYCm_right
  const norm_offsetXYCm_left = Math.hypot(
    offsetXYCm_left[0],
    offsetXYCm_left[1],
  )
  const norm_offsetXYCm_right = Math.hypot(
    offsetXYCm_right[0],
    offsetXYCm_right[1],
  )
  const cameraToEyeDistance =
    method === 'blindspot' ? eyeToCameraCm : webcamToEyeDistance

  const nearestDistanceCm_left = Math.sqrt(
    cameraToEyeDistance ** 2 - norm_offsetXYCm_left ** 2,
  )
  const nearestDistanceCm_right = Math.sqrt(
    cameraToEyeDistance ** 2 - norm_offsetXYCm_right ** 2,
  )

  const eyeToScreenCenterDistance_left = getEyeToDesiredDistance(
    nearestXYPx_left,
    nearestDistanceCm_left,
    [window.innerWidth / 2, window.innerHeight / 2],
    pxPerCm,
  )
  const eyeToScreenCenterDistance_right = getEyeToDesiredDistance(
    nearestXYPx_right,
    nearestDistanceCm_right,
    [window.innerWidth / 2, window.innerHeight / 2],
    pxPerCm,
  )
  //choose the nearest eye to screen center distance
  const nearestEye =
    eyeToScreenCenterDistance_left < eyeToScreenCenterDistance_right
      ? 'left'
      : 'right'
  const nearestXYPx =
    nearestEye === 'left' ? nearestXYPx_left : nearestXYPx_right
  const nearestDistanceCm =
    nearestEye === 'left' ? nearestDistanceCm_left : nearestDistanceCm_right
  const distanceCm_left = getEyeToDesiredDistance(
    nearestXYPx_left,
    nearestDistanceCm_left,
    [window.innerWidth / 2, window.innerHeight / 2],
    pxPerCm,
  )
  const distanceCm_right = getEyeToDesiredDistance(
    nearestXYPx_right,
    nearestDistanceCm_right,
    [window.innerWidth / 2, window.innerHeight / 2],
    pxPerCm,
  )

  const nearestEyeToWebcamDistanceCM =
    method === 'blindspot' ? eyeToCameraCm : webcamToEyeDistance

  const distanceCm =
    method === 'blindspot' ? eyeToCameraCm : webcamToEyeDistance

  return {
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
    ipdCameraPx,
    cameraXYPx,
    viewingDistanceWhichEye: options?.viewingDistanceWhichEye,
    viewingDistanceWhichPoint: options?.viewingDistanceWhichPoint,
    calibrationFactor,
  }
}

const renderDistanceResult = async (
  RC,
  trackingOptions,
  callbackTrack,
  trackingConfig,
  model,
  ppi,
  pxPerCm,
  desiredDistanceCm,
  desiredDistanceMonitor,
  desiredDistanceMonitorCancelable,
  desiredDistanceMonitorAllowRecalibrate,
) => {
  console.log('././renderDistanceResult')
  if (!video) video = document.getElementById('webgazerVideoCanvas')

  // Check if video is ready
  if (!video) {
    // console.log('././video not ready', video.readyState)
    return
  }

  const videoTimestamp = performance.now()

  // Use the factored out mesh data retrieval
  const meshData = await getMeshData(
    RC,
    trackingOptions.calibrateTrackDistancePupil,
  )

  if (meshData) {
    const { mesh, leftEye, rightEye, currentIPDDistance } = meshData
    RC._trackingVideoFrameTimestamps.distance = videoTimestamp

    // Initialize calibration factor on first run
    if (stdDist.current !== null) {
      if (!stdFactor) {
        // ! First time estimate
        // ALWAYS use the pre-calculated calibration factor from measurement tests
        if (stdDist.current.calibrationFactor) {
          console.log(
            'Using pre-calculated calibration factor:',
            stdDist.current.calibrationFactor,
          )
          console.log('Method used:', stdDist.current.method)
          stdFactor = stdDist.current.calibrationFactor
        } else {
          console.error('No calibration factor found! This should not happen.')
          console.error('Measurement data:', stdDist.current)
          return
        }

        // ! FINISH
        if (trackingConfig.options.calibrateTrackDistanceCheckBool !== true)
          RC._removeBackground() // Remove BG if no check

        RC._trackingSetupFinishedStatus.distance = true
        readyToGetFirstData = true
      }

      /* -------------------------------------------------------------------------- */

      const timestamp = performance.now()
      const latency = Math.round(
        timestamp - RC._trackingVideoFrameTimestamps.distance,
      )

      const webcamToEyeDistance = stdFactor / currentIPDDistance
      const cameraPxPerCm = currentIPDDistance / RC._CONST.IPD_CM

      // Calculate nearest points using the factored function
      const nearestPointsData = calculateNearestPoints(
        video,
        leftEye,
        rightEye,
        currentIPDDistance,
        webcamToEyeDistance,
        pxPerCm,
        ppi,
        RC,
        trackingOptions,
        0,
        0,
        '',
        1,
        [],
        [],
        0,
        0,
        currentIPDDistance,
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
        cameraXYPx,
        viewingDistanceWhichEye,
        viewingDistanceWhichPoint,
      } = nearestPointsData

      // Apply trigonometric adjustment to get screen-center-to-eye distance
      const screenCenterToEyeDistance = _adjustDistanceToScreenCenter(
        webcamToEyeDistance,
        ppi,
      )

      RC.improvedDistanceTrackingData = {
        left: {
          nearestXYPx: nearestXYPx_left,
          nearestDistanceCm: nearestDistanceCm_left,
          distanceCm: distanceCm_left,
        },
        right: {
          nearestXYPx: nearestXYPx_right,
          nearestDistanceCm: nearestDistanceCm_right,
          distanceCm: distanceCm_right,
        },
        nearEye: nearestEye,
        distanceCm: distanceCm,
        nearestXYPx: nearestXYPx,
        nearestDistanceCm: nearestDistanceCm,
        oldDistanceCm: screenCenterToEyeDistance,
        ipdDistancePx: currentIPDDistance,
      }

      const data = {
        value: toFixedNumber(distanceCm, trackingOptions.decimalPlace),
        timestamp: timestamp,
        method: RC._CONST.VIEW_METHOD.F,
        latencyMs: latency,
        calibrationMethod: stdDist.method, // Include which method was used
      }

      RC.newViewingDistanceData = data

      // Update shared face data for iris drawing
      updateSharedFaceData(leftEye, rightEye, video, currentIPDDistance)

      // Debug: Draw nearest points on screen using clamped coordinates
      if (trackingConfig.options.showNearestPointsBool)
        _drawNearestPoints(
          clampedNearestLeft,
          clampedNearestRight,
          nearestDistanceCm_left,
          nearestDistanceCm_right,
          trackingOptions.decimalPlace,
          nearestEyeToWebcamDistanceCM,
          stdFactor,
          currentIPDDistance,
          {
            x: leftEye.x,
            y: leftEye.y,
          },
          {
            x: rightEye.x,
            y: rightEye.y,
          },
          cameraXYPx,
          viewingDistanceWhichEye,
          viewingDistanceWhichPoint,
          nearestXYPx,
          distanceCm_left,
          distanceCm_right,
        )

      if (readyToGetFirstData || desiredDistanceMonitor) {
        // ! Check distance
        if (desiredDistanceCm) {
          RC.nudgeDistance(
            desiredDistanceMonitorCancelable,
            desiredDistanceMonitorAllowRecalibrate,
            trackingConfig,
          )
        }
        readyToGetFirstData = false
      }

      /* -------------------------------------------------------------------------- */

      /* -------------------------------------------------------------------------- */

      if (callbackTrack && typeof callbackTrack === 'function') {
        RC.gazeTracker.defaultDistanceTrackCallback = callbackTrack
        callbackTrack(data)
      }
    }
  } else {
    cleanUpEyePoints()
  }
}

const getEyeToDesiredDistance = (
  nearestXYPx,
  nearestDistanceCm,
  desiredXYPx,
  pxPerCm,
) => {
  const desiredOffsetCm =
    Math.hypot(
      nearestXYPx[0] - desiredXYPx[0],
      nearestXYPx[1] - desiredXYPx[1],
    ) / pxPerCm
  return Math.sqrt(nearestDistanceCm ** 2 + desiredOffsetCm ** 2)
}

const getCenterXYCameraPx = video => {
  if (!video) return [0, 0]
  const videoWidth = video.width
  const videoHeight = video.height
  const centerX = videoWidth / 2
  const centerY = videoHeight / 2
  return [centerX, centerY]
}

// Helper function to calculate label position avoiding video overlap
const _calculateLabelPosition = (dotX, dotY, eyeSide) => {
  const videoContainer = document.getElementById('webgazerVideoContainer')
  let labelLeft = dotX + 15
  let labelTop = dotY - 12

  // if (videoContainer) {
  //   const videoRect = videoContainer.getBoundingClientRect()
  //   const labelWidth = 80
  //   const labelHeight = 25

  //   const labelRight = labelLeft + labelWidth
  //   const labelBottom = labelTop + labelHeight

  //   const overlapsHorizontally =
  //     labelLeft < videoRect.right && labelRight > videoRect.left
  //   const overlapsVertically =
  //     labelTop < videoRect.bottom && labelBottom > videoRect.top

  //   if (overlapsHorizontally && overlapsVertically) {
  //     if (eyeSide === 'left') {
  //       labelLeft = videoRect.left - labelWidth - 10

  //       if (labelLeft < 0) {
  //         labelLeft = 10
  //       }
  //     } else {
  //       labelLeft = videoRect.right + 10

  //       if (labelLeft + labelWidth > window.innerWidth) {
  //         labelLeft = window.innerWidth - labelWidth - 10
  //       }
  //     }
  //   }
  // }

  labelLeft = Math.max(10, Math.min(labelLeft, window.innerWidth - 90))
  labelTop = Math.max(0, Math.min(labelTop, window.innerHeight - 25))

  return { left: labelLeft, top: labelTop }
}

// Debug function to draw nearest points on screen
let nearestPointDots = { left: null, right: null }
let nearestPointLabels = { left: null, right: null }
let webcamDistanceLabel = null
let factorLabel = null
let ipdLabel = null
let cameraXYPxLabel = null
let viewingDistanceWhichEyeLabel = null
let viewingDistanceWhichPointLabel = null
let eyePointDots = { left: null, right: null }
let pupilDots = { left: null, right: null }
let nearestPointCoordsLabels = { left: null, right: null }
const _drawNearestPoints = (
  nearestLeft,
  nearestRight,
  distanceLeft,
  distanceRight,
  decimalPlace,
  nearestEyeToWebcamDistanceCM,
  factorCameraPxCm,
  averageDist,
  leftEyePoint,
  rightEyePoint,
  cameraXYPx,
  viewingDistanceWhichEye,
  viewingDistanceWhichPoint,
  nearestXYPx,
  distanceCm_left,
  distanceCm_right,
) => {
  // Get video container and its bounding rect once for reuse
  const videoContainer = document.getElementById('webgazerVideoContainer')
  const videoRect = videoContainer
    ? videoContainer.getBoundingClientRect()
    : null

  // Create elements only if they don't exist, otherwise reuse them
  const createOrUpdateElement = (elementRef, id, baseStyles) => {
    if (!elementRef) {
      elementRef = document.createElement('div')
      elementRef.id = id
      document.body.appendChild(elementRef)
    }
    // Apply base styles that don't change frequently
    if (baseStyles && !elementRef.dataset.baseStylesApplied) {
      Object.assign(elementRef.style, baseStyles)
      elementRef.dataset.baseStylesApplied = 'true'
    }
    return elementRef
  }

  if (
    nearestLeft &&
    nearestLeft[0] !== undefined &&
    nearestLeft[1] !== undefined
  ) {
    // Create or reuse left dot
    nearestPointDots.left = createOrUpdateElement(
      nearestPointDots.left,
      'rc-nearest-point-left',
      {
        position: 'fixed',
        width: '12px',
        height: '12px',
        background: 'red',
        border: '2px solid white',
        borderRadius: '50%',
        zIndex: '99999999999999',
        pointerEvents: 'none',
      },
    )

    // Update only position (frequently changing properties)
    nearestPointDots.left.style.left = `${nearestLeft[0] - 6}px`
    nearestPointDots.left.style.top = `${nearestLeft[1] - 6}px`

    if (distanceLeft !== undefined) {
      // Create or reuse left label
      nearestPointLabels.left = createOrUpdateElement(
        nearestPointLabels.left,
        'rc-nearest-point-label-left',
        {
          position: 'fixed',
          fontSize: '18px',
          color: 'red',
          background: 'rgba(255, 255, 255, 0.8)',
          padding: '2px 6px',
          borderRadius: '4px',
          zIndex: '9999999999999',
          pointerEvents: 'none',
          fontFamily: 'Arial, sans-serif',
          fontWeight: 'normal',
        },
      )

      // Update content and position
      nearestPointLabels.left.textContent = `${distanceLeft.toFixed(decimalPlace || 1)} cm`
      const labelPosition = _calculateLabelPosition(
        nearestLeft[0],
        nearestLeft[1],
        'left',
      )
      nearestPointLabels.left.style.left = `${labelPosition.left}px`
      nearestPointLabels.left.style.top = `${labelPosition.top}px`
    }

    // Create or reuse left coordinates label (positioned right below the dot)
    nearestPointCoordsLabels.left = createOrUpdateElement(
      nearestPointCoordsLabels.left,
      'rc-nearest-point-coords-left',
      {
        position: 'fixed',
        fontSize: '12px',
        color: '#111',
        background: 'rgba(255, 255, 255, 0.9)',
        padding: '1px 4px',
        borderRadius: '3px',
        zIndex: '9999999999999',
        pointerEvents: 'none',
        fontFamily: 'Arial, sans-serif',
        transform: 'translate(-50%, 0)',
      },
    )

    // Update content and position centered below the dot
    nearestPointCoordsLabels.left.textContent = `${Math.round(nearestLeft[0])}, ${Math.round(nearestLeft[1])}`
    nearestPointCoordsLabels.left.style.left = `${nearestLeft[0]}px`
    nearestPointCoordsLabels.left.style.top = `${nearestLeft[1] + 15}px`
  }

  if (
    nearestRight &&
    nearestRight[0] !== undefined &&
    nearestRight[1] !== undefined
  ) {
    // Create or reuse right dot
    nearestPointDots.right = createOrUpdateElement(
      nearestPointDots.right,
      'rc-nearest-point-right',
      {
        position: 'fixed',
        width: '12px',
        height: '12px',
        background: 'blue',
        border: '2px solid white',
        borderRadius: '50%',
        zIndex: '99999999999999',
        pointerEvents: 'none',
      },
    )

    // Update only position
    nearestPointDots.right.style.left = `${nearestRight[0] - 6}px`
    nearestPointDots.right.style.top = `${nearestRight[1] - 6}px`

    if (distanceRight !== undefined) {
      // Create or reuse right label
      nearestPointLabels.right = createOrUpdateElement(
        nearestPointLabels.right,
        'rc-nearest-point-label-right',
        {
          position: 'fixed',
          fontSize: '18px',
          color: 'blue',
          background: 'rgba(255, 255, 255, 0.8)',
          padding: '2px 6px',
          borderRadius: '4px',
          zIndex: '9999999999999',
          pointerEvents: 'none',
          fontFamily: 'Arial, sans-serif',
          fontWeight: 'normal',
        },
      )

      // Update content and position
      nearestPointLabels.right.textContent = `${distanceRight.toFixed(decimalPlace || 1)} cm`
      const labelPosition = _calculateLabelPosition(
        nearestRight[0],
        nearestRight[1],
        'right',
      )
      nearestPointLabels.right.style.left = `${labelPosition.left}px`
      nearestPointLabels.right.style.top = `${labelPosition.top}px`
    }

    // Create or reuse right coordinates label (positioned right below the dot)
    nearestPointCoordsLabels.right = createOrUpdateElement(
      nearestPointCoordsLabels.right,
      'rc-nearest-point-coords-right',
      {
        position: 'fixed',
        fontSize: '12px',
        color: '#111',
        background: 'rgba(255, 255, 255, 0.9)',
        padding: '1px 4px',
        borderRadius: '3px',
        zIndex: '9999999999999',
        pointerEvents: 'none',
        fontFamily: 'Arial, sans-serif',
        transform: 'translate(-50%, 0)',
      },
    )

    // Update content and position centered below the dot
    nearestPointCoordsLabels.right.textContent = `${Math.round(nearestRight[0])}, ${Math.round(nearestRight[1])}`
    nearestPointCoordsLabels.right.style.left = `${nearestRight[0]}px`
    nearestPointCoordsLabels.right.style.top = `${nearestRight[1] + 15}px`
  }

  // NOTE: Iris and pupil drawing is now handled by the separate canvas-based function

  // Add webcam-to-eye distance label at top center, offset to avoid video
  if (nearestEyeToWebcamDistanceCM !== undefined) {
    webcamDistanceLabel = createOrUpdateElement(
      webcamDistanceLabel,
      'rc-webcam-distance-label',
      {
        position: 'fixed',
        fontSize: '16px',
        color: '#333',
        background: 'rgba(255, 255, 255, 0.9)',
        padding: '4px 8px',
        borderRadius: '6px',
        border: '1px solid #ddd',
        zIndex: '2147483646',
        pointerEvents: 'none',
        fontFamily: 'Arial, sans-serif',
        fontWeight: 'normal',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
      },
    )

    // Update content and position
    webcamDistanceLabel.textContent = `${nearestEyeToWebcamDistanceCM.toFixed(decimalPlace || 1)} cm`

    // Calculate position: top center, offset right to avoid video
    let labelLeft = window.innerWidth / 2
    const labelTop = 20 // 20px from top

    // If video container exists, offset to avoid overlap
    if (videoRect) {
      const labelWidth = 80 // Approximate label width

      // Position to the right of the video with some padding
      labelLeft = Math.max(window.innerWidth / 2, videoRect.right + 20)

      // If that would push it off screen, position to the left of video
      if (labelLeft + labelWidth > window.innerWidth) {
        labelLeft = Math.max(20, videoRect.left - labelWidth - 20)
      }
    }

    // Ensure label stays within screen bounds
    labelLeft = Math.max(20, Math.min(labelLeft, window.innerWidth - 100))

    webcamDistanceLabel.style.left = `${labelLeft}px`
    webcamDistanceLabel.style.top = `${labelTop}px`
  }

  // Add factor label right below the webcam distance label
  if (factorCameraPxCm !== undefined) {
    factorLabel = createOrUpdateElement(factorLabel, 'rc-factor-label', {
      position: 'fixed',
      fontSize: '16px',
      color: '#333',
      background: 'rgba(255, 255, 255, 0.9)',
      padding: '4px 8px',
      borderRadius: '6px',
      border: '1px solid #ddd',
      zIndex: '2147483646',
      pointerEvents: 'none',
      fontFamily: 'Arial, sans-serif',
      fontWeight: 'normal',
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    })

    // Update content and position
    factorLabel.textContent = `factorCameraPxCm: ${factorCameraPxCm.toFixed(0)}`

    // Calculate position: same horizontal position as webcam label, but below it
    let labelLeft = window.innerWidth / 2
    const labelTop = 50 // 50px from top (30px below the webcam label)

    // If video container exists, offset to avoid overlap (same logic as webcam label)
    if (videoRect) {
      const labelWidth = 80 // Approximate label width

      // Position to the right of the video with some padding
      labelLeft = Math.max(window.innerWidth / 2, videoRect.right + 20)

      // If that would push it off screen, position to the left of video
      if (labelLeft + labelWidth > window.innerWidth) {
        labelLeft = Math.max(20, videoRect.left - labelWidth - 20)
      }
    }

    // Ensure label stays within screen bounds
    labelLeft = Math.max(20, Math.min(labelLeft, window.innerWidth - 100))

    factorLabel.style.left = `${labelLeft}px`
    factorLabel.style.top = `${labelTop}px`
  }

  // Add IPD label right below the factor label
  if (averageDist !== undefined) {
    ipdLabel = createOrUpdateElement(ipdLabel, 'rc-ipd-label', {
      position: 'fixed',
      fontSize: '16px',
      color: '#333',
      background: 'rgba(255, 255, 255, 0.9)',
      padding: '4px 8px',
      borderRadius: '6px',
      border: '1px solid #ddd',
      zIndex: '2147483646',
      pointerEvents: 'none',
      fontFamily: 'Arial, sans-serif',
      fontWeight: 'normal',
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    })

    // Update content and position
    ipdLabel.textContent = `ipdCameraPx: ${Math.round(averageDist)}`

    // Calculate position: same horizontal position as factor label, but below it
    let labelLeft = window.innerWidth / 2
    const labelTop = 80 // 80px from top (30px below the factor label)

    // If video container exists, offset to avoid overlap (same logic as other labels)
    if (videoRect) {
      const labelWidth = 80 // Approximate label width

      // Position to the right of the video with some padding
      labelLeft = Math.max(window.innerWidth / 2, videoRect.right + 20)

      // If that would push it off screen, position to the left of video
      if (labelLeft + labelWidth > window.innerWidth) {
        labelLeft = Math.max(20, videoRect.left - labelWidth - 20)
      }
    }

    // Ensure label stays within screen bounds
    labelLeft = Math.max(20, Math.min(labelLeft, window.innerWidth - 100))

    ipdLabel.style.left = `${labelLeft}px`
    ipdLabel.style.top = `${labelTop}px`
  }

  // Add cameraXYPx label right below the IPD label
  if (cameraXYPx !== undefined) {
    cameraXYPxLabel = createOrUpdateElement(
      cameraXYPxLabel,
      'rc-camera-xy-px-label',
      {
        position: 'fixed',
        fontSize: '16px',
        color: '#333',
        background: 'rgba(255, 255, 255, 0.9)',
        padding: '4px 8px',
        borderRadius: '6px',
        border: '1px solid #ddd',
        zIndex: '2147483646',
        pointerEvents: 'none',
        fontFamily: 'Arial, sans-serif',
        fontWeight: 'normal',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
      },
    )

    // Update content and position
    cameraXYPxLabel.textContent = `cameraXYPx: [${Math.round(cameraXYPx[0])}, ${Math.round(cameraXYPx[1])}]`

    // Calculate position: same horizontal position as IPD label, but below it
    let labelLeft = window.innerWidth / 2
    const labelTop = 110 // 110px from top (30px below the IPD label)

    // If video container exists, offset to avoid overlap (same logic as other labels)
    if (videoRect) {
      const labelWidth = 80 // Approximate label width

      // Position to the right of the video with some padding
      labelLeft = Math.max(window.innerWidth / 2, videoRect.right + 20)

      // If that would push it off screen, position to the left of video
      if (labelLeft + labelWidth > window.innerWidth) {
        labelLeft = Math.max(20, videoRect.left - labelWidth - 20)
      }
    }

    // Ensure label stays within screen bounds
    labelLeft = Math.max(20, Math.min(labelLeft, window.innerWidth - 100))

    cameraXYPxLabel.style.left = `${labelLeft}px`
    cameraXYPxLabel.style.top = `${labelTop}px`
  }

  // Add viewingDistanceWhichEye label right below the cameraXYPx label
  if (viewingDistanceWhichEye !== undefined) {
    viewingDistanceWhichEyeLabel = createOrUpdateElement(
      viewingDistanceWhichEyeLabel,
      'rc-viewing-distance-which-eye-label',
      {
        position: 'fixed',
        fontSize: '16px',
        color: '#333',
        background: 'rgba(255, 255, 255, 0.9)',
        padding: '4px 8px',
        borderRadius: '6px',
        border: '1px solid #ddd',
        zIndex: '2147483646',
        pointerEvents: 'none',
        fontFamily: 'Arial, sans-serif',
        fontWeight: 'normal',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
      },
    )

    // Calculate viewing distance based on eye selection
    const calculateViewingDistanceCm = (
      eyeSelection,
      distanceCm_left,
      distanceCm_right,
    ) => {
      switch (eyeSelection) {
        case 'left':
          return distanceCm_left
        case 'right':
          return distanceCm_right
        case 'min':
          return Math.min(distanceCm_left, distanceCm_right)
        case 'geoMean':
          return Math.sqrt(distanceCm_left * distanceCm_right)
        default:
          return 'NaN'
      }
    }

    const viewingDistanceCm = calculateViewingDistanceCm(
      viewingDistanceWhichEye,
      distanceCm_left,
      distanceCm_right,
    )

    // Update content and position
    viewingDistanceWhichEyeLabel.textContent = `viewingDistanceWhichEye: ${viewingDistanceWhichEye} (${viewingDistanceCm.toFixed(1)} cm)`

    // Calculate position: same horizontal position as cameraXYPx label, but below it
    let labelLeft = window.innerWidth / 2
    const labelTop = 140 // 140px from top (30px below the cameraXYPx label)

    // If video container exists, offset to avoid overlap (same logic as other labels)
    if (videoRect) {
      const labelWidth = 80 // Approximate label width

      // Position to the right of the video with some padding
      labelLeft = Math.max(window.innerWidth / 2, videoRect.right + 20)

      // If that would push it off screen, position to the left of video
      if (labelLeft + labelWidth > window.innerWidth) {
        labelLeft = Math.max(20, videoRect.left - labelWidth - 20)
      }
    }

    // Ensure label stays within screen bounds
    labelLeft = Math.max(20, Math.min(labelLeft, window.innerWidth - 100))

    viewingDistanceWhichEyeLabel.style.left = `${labelLeft}px`
    viewingDistanceWhichEyeLabel.style.top = `${labelTop}px`
  }

  // Add viewingDistanceWhichPoint label right below the viewingDistanceWhichEye label
  if (viewingDistanceWhichPoint !== undefined) {
    viewingDistanceWhichPointLabel = createOrUpdateElement(
      viewingDistanceWhichPointLabel,
      'rc-viewing-distance-which-point-label',
      {
        position: 'fixed',
        fontSize: '16px',
        color: '#333',
        background: 'rgba(255, 255, 255, 0.9)',
        padding: '4px 8px',
        borderRadius: '6px',
        border: '1px solid #ddd',
        zIndex: '2147483646',
        pointerEvents: 'none',
        fontFamily: 'Arial, sans-serif',
        fontWeight: 'normal',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
      },
    )

    // Interpret viewingDistanceWhichPoint based on category
    const interpretViewingDistanceWhichPoint = (
      category,
      nearestXYPx,
      cameraXYPx,
      viewingDistanceWhichEye,
    ) => {
      let pointXYDeg
      switch (category) {
        case 'fixation':
          pointXYDeg = [0, 0]
          break
        case 'target':
          pointXYDeg = NaN // TODO
          break
        case 'nearest':
          pointXYDeg = NaN // TODO nearestXYDeg
          break
        case 'camera':
          pointXYDeg = NaN // TODO XYDegOfPx(cameraXYPx);
          break
        case 'xyDeg':
          pointXYDeg = NaN // TODO viewingDistanceToXYDeg;
          break
        default:
          pointXYDeg = [
            viewingDistanceWhichPoint[0],
            viewingDistanceWhichPoint[1],
          ]
      }
      return pointXYDeg
    }

    // Update content and position
    const interpretedValue = interpretViewingDistanceWhichPoint(
      viewingDistanceWhichPoint,
      nearestXYPx,
      cameraXYPx,
      viewingDistanceWhichEye,
    )

    // Format the display value properly
    let displayValue
    if (Array.isArray(interpretedValue)) {
      displayValue = `[${interpretedValue.join(', ')}]`
    } else {
      displayValue = interpretedValue
    }

    viewingDistanceWhichPointLabel.textContent = `viewingDistanceWhichPoint: ${displayValue}`

    // Calculate position: same horizontal position as viewingDistanceWhichEye label, but below it
    let labelLeft = window.innerWidth / 2
    const labelTop = 170 // 170px from top (30px below the viewingDistanceWhichEye label)

    // If video container exists, offset to avoid overlap (same logic as other labels)
    if (videoRect) {
      const labelWidth = 80 // Approximate label width

      // Position to the right of the video with some padding
      labelLeft = Math.max(window.innerWidth / 2, videoRect.right + 20)

      // If that would push it off screen, position to the left of video
      if (labelLeft + labelWidth > window.innerWidth) {
        labelLeft = Math.max(20, videoRect.left - labelWidth - 20)
      }
    }

    // Ensure label stays within screen bounds
    labelLeft = Math.max(20, Math.min(labelLeft, window.innerWidth - 100))

    viewingDistanceWhichPointLabel.style.left = `${labelLeft}px`
    viewingDistanceWhichPointLabel.style.top = `${labelTop}px`
  }
}

const cleanUpEyePoints = () => {
  //clean up all points drawn in _drawNearestPoints
  if (nearestPointDots.left) {
    document.body.removeChild(nearestPointDots.left)
    nearestPointDots.left = null
  }
  if (nearestPointDots.right) {
    document.body.removeChild(nearestPointDots.right)
    nearestPointDots.right = null
  }
  if (nearestPointLabels.left) {
    document.body.removeChild(nearestPointLabels.left)
    nearestPointLabels.left = null
  }
  if (nearestPointLabels.right) {
    document.body.removeChild(nearestPointLabels.right)
    nearestPointLabels.right = null
  }
  if (webcamDistanceLabel) {
    document.body.removeChild(webcamDistanceLabel)
    webcamDistanceLabel = null
  }
  if (factorLabel) {
    document.body.removeChild(factorLabel)
    factorLabel = null
  }
  if (ipdLabel) {
    document.body.removeChild(ipdLabel)
    ipdLabel = null
  }
  if (cameraXYPxLabel) {
    document.body.removeChild(cameraXYPxLabel)
    cameraXYPxLabel = null
  }
  if (viewingDistanceWhichEyeLabel) {
    document.body.removeChild(viewingDistanceWhichEyeLabel)
    viewingDistanceWhichEyeLabel = null
  }
  if (viewingDistanceWhichPointLabel) {
    document.body.removeChild(viewingDistanceWhichPointLabel)
    viewingDistanceWhichPointLabel = null
  }
  if (nearestPointCoordsLabels.left) {
    document.body.removeChild(nearestPointCoordsLabels.left)
    nearestPointCoordsLabels.left = null
  }
  if (nearestPointCoordsLabels.right) {
    document.body.removeChild(nearestPointCoordsLabels.right)
    nearestPointCoordsLabels.right = null
  }
  if (pupilDots.left) {
    document.body.removeChild(pupilDots.left)
    pupilDots.left = null
  }
  if (pupilDots.right) {
    document.body.removeChild(pupilDots.right)
    pupilDots.right = null
  }
  if (eyePointDots.left) {
    document.body.removeChild(eyePointDots.left)
    eyePointDots.left = null
  }
  if (eyePointDots.right) {
    document.body.removeChild(eyePointDots.right)
    eyePointDots.right = null
  }
}

const _getNearPoint = (
  RC,
  trackingOptions,
  video,
  mesh,
  averageDist,
  timestamp,
  ppi,
  latency,
) => {
  const offsetToVideoCenter = cyclopean(
    video,
    {
      x: mesh[468].x,
      y: mesh[468].y,
      z: mesh[468].z,
    },
    {
      x: mesh[473].x,
      y: mesh[473].y,
      z: mesh[473].z,
    },
  )
  offsetToVideoCenter.forEach((offset, i) => {
    // Average inter-pupillary distance - 6.4cm
    offsetToVideoCenter[i] =
      ((RC.PDCm ? RC.PDCm.value : RC._CONST.N.PD_DONT_USE) * offset) /
      averageDist
  })

  const nPData = {
    value: {
      x: toFixedNumber(offsetToVideoCenter[0], trackingOptions.decimalPlace),
      y: toFixedNumber(
        offsetToVideoCenter[1] + ((screen.height / 2) * 2.54) / ppi, // Commonly the webcam is 0.5cm above the screen
        trackingOptions.decimalPlace,
      ),
      latencyMs: latency,
    },
    timestamp: timestamp,
  }

  RC.newNearPointData = nPData

  // SHOW
  const dotR = 5
  if (trackingOptions.showNearPoint) {
    const offsetX = (nPData.value.x * ppi) / 2.54
    const offsetY = (nPData.value.y * ppi) / 2.54
    Object.assign(nearPointDot.style, {
      left: `${screen.width / 2 - window.screenLeft + offsetX - dotR}px`,
      top: `${
        screen.height / 2 -
        window.screenTop -
        (window.outerHeight - window.innerHeight) -
        offsetY -
        dotR
      }px`,
    })
  }

  return nPData
}

RemoteCalibrator.prototype.pauseDistance = function () {
  if (
    this.gazeTracker.checkInitialized('distance', true) &&
    !this._trackingPaused.distance
  ) {
    iRepeatOptions.break = true
    if (rafId) {
      cancelAnimationFrame(rafId)
      rafId = null
    }

    // Stop calibration-phase iris tracking if still active
    if (this._stopIrisTracking) {
      this._stopIrisTracking()
      this._stopIrisTracking = null
    }

    stopIrisDrawing()
    if (nearPointDot) nearPointDot.style.display = 'none'
    this._trackingVideoFrameTimestamps.distance = 0

    this._trackingPaused.distance = true
    this.pauseNudger() // 0.6.0

    return this
  }
  return null
}

RemoteCalibrator.prototype.resumeDistance = function (showIrisesBool = false) {
  if (
    this.gazeTracker.checkInitialized('distance', true) &&
    this._trackingPaused.distance
  ) {
    iRepeatOptions.break = false
    // Use the parameter or fall back to trackingOptions
    if (showIrisesBool || trackingOptions.showIrisesBool) startIrisDrawing(this)
    if (nearPointDot) nearPointDot.style.display = 'block'

    this._trackingVideoFrameTimestamps.distance = 0

    // Restart the requestAnimationFrame loop
    const renderPrediction = async currentTime => {
      if (iRepeatOptions.break) {
        return
      }

      // Throttle to 30fps
      if (currentTime - lastFrameTime >= frameInterval) {
        // Note: We need to reconstruct the render function parameters here
        // This is a simplified resume - full implementation would need to store these
        lastFrameTime = currentTime
      }
      rafId = requestAnimationFrame(renderPrediction)
    }

    rafId = requestAnimationFrame(renderPrediction)

    this._trackingPaused.distance = false
    this.resumeNudger() // 0.6.0

    return this
  }
  return null
}

RemoteCalibrator.prototype.endDistance = function (endAll = false, _r = true) {
  if (this.gazeTracker.checkInitialized('distance', true)) {
    iRepeatOptions.break = true
    if (rafId) {
      cancelAnimationFrame(rafId)
      rafId = null
    }

    // Stop calibration-phase iris tracking if still active
    if (this._stopIrisTracking) {
      this._stopIrisTracking()
      this._stopIrisTracking = null
    }

    stopIrisDrawing()

    // Clean up iris canvas
    if (irisCanvas) {
      document.body.removeChild(irisCanvas)
      irisCanvas = null
      irisCtx = null
    }
    RC_instance = null

    iRepeatOptions.framerate = 20

    trackingOptions.pipWidthPx = 0
    trackingOptions.decimalPlace = 2
    trackingOptions.framerate = 30
    trackingOptions.nearPoint = true
    trackingOptions.showNearPoint = false

    trackingOptions.desiredDistanceCm = undefined
    trackingOptions.desiredDistanceTolerance = 1.2
    trackingOptions.desiredDistanceMonitor = false
    trackingOptions.desiredDistanceMonitorCancelable = false
    trackingOptions.desiredDistanceMonitorAllowRecalibrate = true

    stdDist.current = null
    stdFactor = null

    video = null

    readyToGetFirstData = false
    this._trackingVideoFrameTimestamps.distance = 0
    this._trackingPaused.distance = false

    // Near point
    if (nearPointDot) {
      document.body.removeChild(nearPointDot)
      nearPointDot = null
    }

    // Debug nearest points cleanup
    if (nearestPointDots.left) {
      document.body.removeChild(nearestPointDots.left)
      nearestPointDots.left = null
    }
    if (nearestPointDots.right) {
      document.body.removeChild(nearestPointDots.right)
      nearestPointDots.right = null
    }
    if (nearestPointLabels.left) {
      document.body.removeChild(nearestPointLabels.left)
      nearestPointLabels.left = null
    }
    if (nearestPointLabels.right) {
      document.body.removeChild(nearestPointLabels.right)
      nearestPointLabels.right = null
    }
    if (webcamDistanceLabel) {
      document.body.removeChild(webcamDistanceLabel)
      webcamDistanceLabel = null
    }
    if (factorLabel) {
      document.body.removeChild(factorLabel)
      factorLabel = null
    }
    if (ipdLabel) {
      document.body.removeChild(ipdLabel)
      ipdLabel = null
    }
    if (cameraXYPxLabel) {
      document.body.removeChild(cameraXYPxLabel)
      cameraXYPxLabel = null
    }
    if (viewingDistanceWhichEyeLabel) {
      document.body.removeChild(viewingDistanceWhichEyeLabel)
      viewingDistanceWhichEyeLabel = null
    }
    if (viewingDistanceWhichPointLabel) {
      document.body.removeChild(viewingDistanceWhichPointLabel)
      viewingDistanceWhichPointLabel = null
    }
    if (nearestPointCoordsLabels.left) {
      document.body.removeChild(nearestPointCoordsLabels.left)
      nearestPointCoordsLabels.left = null
    }
    if (nearestPointCoordsLabels.right) {
      document.body.removeChild(nearestPointCoordsLabels.right)
      nearestPointCoordsLabels.right = null
    }

    if (eyePointDots && eyePointDots.left) {
      document.body.removeChild(eyePointDots.left)
      eyePointDots.left = null
    }
    if (eyePointDots && eyePointDots.right) {
      document.body.removeChild(eyePointDots.right)
      eyePointDots.right = null
    }

    // Nudger
    this.endNudger()

    if (_r) this.gazeTracker.end('distance', endAll)
    return this
  }
  return null
}

RemoteCalibrator.prototype.getDistanceNow = async function (callback = null) {
  if (
    !this.checkInitialized() ||
    !this.gazeTracker.checkInitialized('distance', true) ||
    !iRepeatOptions.break
  )
    return

  const c = callback || this.gazeTracker.defaultDistanceTrackCallback

  const v = document.getElementById('webgazerVideoCanvas')
  const m = await this.gazeTracker.webgazer.getTracker().model
  const videoTimestamp = performance.now()
  const f = await m.estimateFaces(v)

  if (f.length) {
    const mesh = f[0].scaledMesh
    const dist = eyeDist(
      {
        x: mesh[468].x,
        y: mesh[468].y,
        z: mesh[468].z,
      },
      {
        x: mesh[473].x,
        y: mesh[473].y,
        z: mesh[473].z,
      },
    )

    const timestamp = performance.now()
    //
    const latency = timestamp - videoTimestamp
    //

    // Calculate webcam-to-eye distance
    const webcamToEyeDistance = stdFactor / dist

    // Apply trigonometric adjustment to get screen-center-to-eye distance
    const ppi = this.screenPpi
      ? this.screenPpi.value
      : this._CONST.N.PPI_DONT_USE
    const screenCenterToEyeDistance = _adjustDistanceToScreenCenter(
      webcamToEyeDistance,
      ppi,
    )

    this.newViewingDistanceData = {
      value: toFixedNumber(
        screenCenterToEyeDistance,
        trackingOptions.decimalPlace,
      ),
      timestamp: timestamp,
      method: this._CONST.VIEW_METHOD.F,
      latencyMs: latency,
    }
    const data = this.newViewingDistanceData

    let nPData
    if (trackingOptions.nearPoint) {
      nPData = _getNearPoint(
        this,
        trackingOptions,
        v,
        mesh,
        dist,
        timestamp,
        this.screenPpi ? this.screenPpi.value : this._CONST.N.PPI_DONT_USE,
        latency,
      )
    }

    safeExecuteFunc(c, {
      value: {
        viewingDistanceCm: data.value,
        nearPointCm: nPData ? nPData.value : null,
        latencyMs: latency,
      },
      timestamp: timestamp,
      method: this._CONST.VIEW_METHOD.F,
    })
    return data
  }

  return null
}

RemoteCalibrator.prototype.showNearPoint = function (show = true) {
  if (this.gazeTracker.checkInitialized('distance', false)) {
    const n = document.querySelector('#rc-near-point-dot')
    if (n) n.display = show ? 'block' : 'none'
  }
}

const _calculateDistanceFromCenterToTop = ppi => {
  // get the screen height in pixels
  const screenHeightPixels = window.screen.height

  // calculate half the screen height in pixels
  const halfScreenHeightPixels = screenHeightPixels / 2

  // convert pixels to inches using the ppi
  const halfScreenHeightInches = halfScreenHeightPixels / ppi

  // convert inches to centimeters (1 inch = 2.54 cm)
  const halfScreenHeightCm = halfScreenHeightInches * 2.54

  return halfScreenHeightCm
}

// Helper function to convert webcam-to-eye distance to screen-center-to-eye distance
const _adjustDistanceToScreenCenter = (webcamToEyeDistance, ppi) => {
  // Calculate distance from webcam to screen center (half screen height)
  const webcamToScreenCenterDistance = _calculateDistanceFromCenterToTop(ppi)

  // Use Pythagorean theorem: screen-center-to-eye = sqrt(webcam-to-eye² + webcam-to-screen-center²)
  const screenCenterToEyeDistance = Math.sqrt(
    Math.pow(webcamToEyeDistance, 2) -
      Math.pow(webcamToScreenCenterDistance, 2),
  )

  return screenCenterToEyeDistance
}

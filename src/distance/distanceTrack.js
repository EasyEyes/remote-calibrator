import RemoteCalibrator from '../core'

import { blindSpotTest, objectTest } from './distance'
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
const showPreCalibrationPopup = async (RC) => {
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
      const selected = document.querySelector('input[name="calibration-method"]:checked')
      if (!selected) {
        Swal.showValidationMessage(
          phrases.RC_PleaseSelectAnOption[RC.language.value],
        )
        return null
      }
      return selected.value
    },
    didOpen: () => {
      const customInputs = document.querySelectorAll('input[name="calibration-method"]')
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
  console.log('Selected pre-calibration option:', result)
  
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
      framerate: 3, // tracking rate
      desiredDistanceCm: undefined,
      desiredDistanceTolerance: 1.2,
      desiredDistanceMonitor: false,
      desiredDistanceMonitorCancelable: false,
      desiredDistanceMonitorAllowRecalibrate: true,
      nearPoint: true,
      showNearPoint: false,
      control: true, // CONTROL (EasyEyes) or AUTOMATIC (Li et al., 2018)
      headline: `📏 ${phrases.RC_distanceTrackingTitle[this.L]}`,
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
    this._addBackground()

    this._replaceBackground(
      constructInstructions(options.headline, null, true, ''),
    )

    if (this.gazeTracker.checkInitialized('gaze', false)) this.showGazer(false)

    // Show camera selection popup first (if multiple cameras available)
    console.log('=== Checking for camera selection ===')
    const cameraResult = await showTestPopup(this)

    // Check if experiment was ended due to no cameras
    if (cameraResult?.experimentEnded) {
      console.log('Experiment ended - no cameras detected')
    }

    // Mark that camera selection has been done to avoid calling it again in calibration methods
    options.cameraSelectionDone = true

    // Show pre-calibration popup before starting any calibration methods
    const preCalibrationResult = await showPreCalibrationPopup(this)
    if (!preCalibrationResult) {
      // User cancelled or didn't select anything, exit gracefully
      console.log('Pre-calibration popup cancelled by user')
      return
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
      await blindSpotTest(this, options, true, getStdDist)
    }
  }

  trackingOptions.pipWidthPx = options.pipWidthPx
  trackingOptions.decimalPlace = options.decimalPlace
  trackingOptions.framerate = options.framerate
  trackingOptions.nearPoint = options.nearPoint
  trackingOptions.showNearPoint = options.showNearPoint

  trackingOptions.desiredDistanceCm = options.desiredDistanceCm
  trackingOptions.desiredDistanceTolerance = options.desiredDistanceTolerance
  trackingOptions.desiredDistanceMonitor = options.desiredDistanceMonitor
  trackingOptions.desiredDistanceMonitorCancelable =
    options.desiredDistanceMonitorCancelable
  trackingOptions.desiredDistanceMonitorAllowRecalibrate =
    options.desiredDistanceMonitorAllowRecalibrate

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
  framerate: 3,
  nearPoint: true,
  showNearPoint: false,
  desiredDistanceCm: undefined,
  desiredDistanceTolerance: 1.2,
  desiredDistanceMonitor: false,
  desiredDistanceMonitorCancelable: false,
  desiredDistanceMonitorAllowRecalibrate: true,
}

const stdDist = {
  current: null,
  method: null, // Track which method was used
}

let stdFactor = null
let video = null
let viewingDistanceTrackingFunction = null
const iRepeatOptions = { framerate: 20, break: true }

let nearPointDot = null
/* -------------------------------------------------------------------------- */

let readyToGetFirstData = false
let averageDist = 0
let distCount = 1

const _tracking = async (
  RC,
  trackingOptions,
  callbackTrack,
  trackingConfig,
) => {
  // const video = document.getElementById('webgazerVideoCanvas')

  const _ = async () => {
    // const canvas = RC.gazeTracker.webgazer.videoCanvas
    let faces

    // Get the average of 5 estimates for one measure
    averageDist = 0
    distCount = 1
    const targetCount = 5

    const model = await RC.gazeTracker.webgazer.getTracker().model

    // Near point
    const ppi = RC.screenPpi ? RC.screenPpi.value : RC._CONST.N.PPI_DONT_USE
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

    viewingDistanceTrackingFunction = async () => {
      // Only collect samples if not using object test samples
      if (!video) video = document.getElementById('webgazerVideoCanvas')
      const videoTimestamp = performance.now()
      faces = await model.estimateFaces(video)
      if (faces.length) {
        RC._trackingVideoFrameTimestamps.distance += videoTimestamp
        const mesh = faces[0].keypoints
        if (targetCount === distCount) {
          averageDist += eyeDist(mesh[133], mesh[362])
          averageDist /= targetCount
          RC._trackingVideoFrameTimestamps.distance /= targetCount

          // TODO Add more samples for the first estimate
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
                console.error(
                  'No calibration factor found! This should not happen.',
                )
                console.error('Measurement data:', stdDist.current)
                return
              }

              // ! FINISH
              if (
                trackingConfig.options.calibrateTrackDistanceCheckBool !== true
              )
                RC._removeBackground() // Remove BG if no check

              RC._trackingSetupFinishedStatus.distance = true
              readyToGetFirstData = true
            }

            /* -------------------------------------------------------------------------- */

            const timestamp = performance.now()
            const latency = Math.round(
              timestamp - RC._trackingVideoFrameTimestamps.distance,
            )

            // Calculate webcam-to-eye distance
            const webcamToEyeDistance = stdFactor / averageDist

            // Apply trigonometric adjustment to get screen-center-to-eye distance
            const screenCenterToEyeDistance = _adjustDistanceToScreenCenter(
              webcamToEyeDistance,
              ppi,
            )

            //print adjusted and adjusted
            console.log(
              '.....screenCenterToEyeDistance',
              screenCenterToEyeDistance,
            )
            console.log('.....webcamToEyeDistance', webcamToEyeDistance)
            const data = {
              value: toFixedNumber(
                screenCenterToEyeDistance,
                trackingOptions.decimalPlace,
              ),
              timestamp: timestamp,
              method: RC._CONST.VIEW_METHOD.F,
              latencyMs: latency,
              calibrationMethod: stdDist.method, // Include which method was used
            }

            RC.newViewingDistanceData = data

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

            // Near point
            let nPData
            if (trackingOptions.nearPoint) {
              nPData = _getNearPoint(
                RC,
                trackingOptions,
                video,
                mesh,
                averageDist,
                timestamp,
                ppi,
                latency,
              )
            }

            /* -------------------------------------------------------------------------- */

            if (callbackTrack && typeof callbackTrack === 'function') {
              RC.gazeTracker.defaultDistanceTrackCallback = callbackTrack
              callbackTrack(data)
            }
          }

          averageDist = 0
          distCount = 1

          RC._trackingVideoFrameTimestamps.distance = 0
        } else {
          averageDist += eyeDist(mesh[133], mesh[362])
          ++distCount
        }
      }
    }

    iRepeatOptions.break = false
    iRepeatOptions.framerate = targetCount * trackingOptions.framerate // Default 5 * 3
    iRepeat(viewingDistanceTrackingFunction, iRepeatOptions)
  }

  sleep(1000).then(_)
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
  const offsetToVideoCenter = cyclopean(video, mesh[133], mesh[362])
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
    if (nearPointDot) nearPointDot.style.display = 'none'
    this._trackingVideoFrameTimestamps.distance = 0

    this._trackingPaused.distance = true
    this.pauseNudger() // 0.6.0

    return this
  }
  return null
}

RemoteCalibrator.prototype.resumeDistance = function () {
  if (
    this.gazeTracker.checkInitialized('distance', true) &&
    this._trackingPaused.distance
  ) {
    iRepeatOptions.break = false
    if (nearPointDot) nearPointDot.style.display = 'block'

    averageDist = 0
    distCount = 1
    this._trackingVideoFrameTimestamps.distance = 0

    iRepeat(viewingDistanceTrackingFunction, iRepeatOptions)

    this._trackingPaused.distance = false
    this.resumeNudger() // 0.6.0

    return this
  }
  return null
}

RemoteCalibrator.prototype.endDistance = function (endAll = false, _r = true) {
  if (this.gazeTracker.checkInitialized('distance', true)) {
    iRepeatOptions.break = true
    iRepeatOptions.framerate = 20

    trackingOptions.pipWidthPx = 0
    trackingOptions.decimalPlace = 2
    trackingOptions.framerate = 3
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
    viewingDistanceTrackingFunction = null

    readyToGetFirstData = false
    this._trackingVideoFrameTimestamps.distance = 0
    this._trackingPaused.distance = false

    // Near point
    if (nearPointDot) {
      document.body.removeChild(nearPointDot)
      nearPointDot = null
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
    const dist = eyeDist(mesh[133], mesh[362])

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
  console.log('.....screenHeightPixels', ppi)

  // calculate half the screen height in pixels
  const halfScreenHeightPixels = screenHeightPixels / 2

  // convert pixels to inches using the ppi
  const halfScreenHeightInches = halfScreenHeightPixels / ppi

  // convert inches to centimeters (1 inch = 2.54 cm)
  const halfScreenHeightCm = halfScreenHeightInches * 2.54

  console.log('.....halfScreenHeightCm', halfScreenHeightCm)

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

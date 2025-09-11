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

    viewingDistanceTrackingFunction = async () => {
      // Only collect samples if not using object test samples
      if (!video) video = document.getElementById('webgazerVideoCanvas')
      const videoTimestamp = performance.now()
      faces = await model.estimateFaces(video)
      if (faces.length) {
        RC._trackingVideoFrameTimestamps.distance += videoTimestamp
        const mesh = faces[0].keypoints
        if (targetCount === distCount) {
          //left eye: 468
          //right eye: 473
          const leftEyeX = mesh[468].x
          const leftEyeY = mesh[468].y
          const leftEyeZ = mesh[468].z
          const rightEyeX = mesh[473].x
          const rightEyeY = mesh[473].y
          const rightEyeZ = mesh[473].z
          const leftEye = { x: leftEyeX, y: leftEyeY, z: leftEyeZ }
          const rightEye = { x: rightEyeX, y: rightEyeY, z: rightEyeZ }
          averageDist += eyeDist(leftEye, rightEye)
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

            const webcamToEyeDistance = stdFactor / averageDist
            const cameraPxPerCm = averageDist / RC._CONST.IPD_CM

            const centerXYCameraPx = getCenterXYCameraPx(video)

            // Mirror correction: Video is horizontally flipped, so flip X coordinates to match screen
            //left eye: 468
            //right eye: 473
            const leftEyeX = video.width - mesh[468].x // Flip X coordinate
            const leftEyeY = mesh[468].y // Y coordinate unchanged
            const rightEyeX = video.width - mesh[473].x // Flip X coordinate
            const rightEyeY = mesh[473].y // Y coordinate unchanged

            const offsetXYCameraPx_left = [
              leftEyeX - centerXYCameraPx[0],
              leftEyeY - centerXYCameraPx[1],
            ]
            const offsetXYCameraPx_right = [
              rightEyeX - centerXYCameraPx[0],
              rightEyeY - centerXYCameraPx[1],
            ]

            const offsetXYCm_left = [
              (offsetXYCameraPx_left[0] * RC._CONST.IPD_CM) / averageDist,
              (offsetXYCameraPx_left[1] * RC._CONST.IPD_CM) / averageDist,
            ]
            const offsetXYCm_right = [
              (offsetXYCameraPx_right[0] * RC._CONST.IPD_CM) / averageDist,
              (offsetXYCameraPx_right[1] * RC._CONST.IPD_CM) / averageDist,
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

            // Clamp coordinates to stay within viewport bounds
            const clampedNearestLeft = [
              Math.max(0, Math.min(nearestXYPx_left[0], window.innerWidth)),
              Math.max(0, Math.min(nearestXYPx_left[1], window.innerHeight)),
            ]
            const clampedNearestRight = [
              Math.max(0, Math.min(nearestXYPx_right[0], window.innerWidth)),
              Math.max(0, Math.min(nearestXYPx_right[1], window.innerHeight)),
            ]

            // Debug calculations
            const actualIPDPx = Math.hypot(
              rightEyeX - leftEyeX,
              rightEyeY - leftEyeY,
              rightEyeZ - leftEyeZ,
            )
            const calculatedIPDCm = actualIPDPx / cameraPxPerCm

            // Apply trigonometric adjustment to get screen-center-to-eye distance
            const screenCenterToEyeDistance = _adjustDistanceToScreenCenter(
              webcamToEyeDistance,
              ppi,
            )

            //calculate nearest distance cm left and right from webcamToEyeDistance and OffsetXYCm_left and OffsetXYCm_right
            const norm_offsetXYCm_left = Math.hypot(
              offsetXYCm_left[0],
              offsetXYCm_left[1],
            )
            const norm_offsetXYCm_right = Math.hypot(
              offsetXYCm_right[0],
              offsetXYCm_right[1],
            )
            const nearestDistanceCm_left = Math.sqrt(
              webcamToEyeDistance ** 2 - norm_offsetXYCm_left ** 2,
            )
            const nearestDistanceCm_right = Math.sqrt(
              webcamToEyeDistance ** 2 - norm_offsetXYCm_right ** 2,
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
              nearestEye === 'left'
                ? nearestDistanceCm_left
                : nearestDistanceCm_right
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

            const nearestEyeToWebcamDistanceCM = getEyeToDesiredDistance(
              nearestXYPx,
              nearestDistanceCm,
              cameraXYPx,
              pxPerCm,
            )

            const distanceCm =
              nearestEye === 'left' ? distanceCm_left : distanceCm_right

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
            }

            const data = {
              value: toFixedNumber(distanceCm, trackingOptions.decimalPlace),
              timestamp: timestamp,
              method: RC._CONST.VIEW_METHOD.F,
              latencyMs: latency,
              calibrationMethod: stdDist.method, // Include which method was used
            }

            RC.newViewingDistanceData = data

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
                averageDist,
                {
                  x: mesh[468].x,
                  y: mesh[468].y,
                },
                {
                  x: mesh[473].x,
                  y: mesh[473].y,
                },
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
          averageDist += eyeDist(
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
          ++distCount
        }
      } else {
        cleanUpEyePoints()
      }
    }

    iRepeatOptions.break = false
    iRepeatOptions.framerate = targetCount * trackingOptions.framerate // Default 5 * 3
    iRepeat(viewingDistanceTrackingFunction, iRepeatOptions)
  }

  sleep(1000).then(_)
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
let eyePointDots = { left: null, right: null }
let pupilDots = { left: null, right: null }
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
) => {
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

  if (eyePointDots.left) {
    document.body.removeChild(eyePointDots.left)
    eyePointDots.left = null
  }
  if (eyePointDots.right) {
    document.body.removeChild(eyePointDots.right)
    eyePointDots.right = null
  }
  if (pupilDots.left) {
    document.body.removeChild(pupilDots.left)
    pupilDots.left = null
  }
  if (pupilDots.right) {
    document.body.removeChild(pupilDots.right)
    pupilDots.right = null
  }

  if (
    nearestLeft &&
    nearestLeft[0] !== undefined &&
    nearestLeft[1] !== undefined
  ) {
    nearestPointDots.left = document.createElement('div')
    nearestPointDots.left.id = 'rc-nearest-point-left'
    nearestPointDots.left.style.cssText = `
      position: fixed;
      width: 12px;
      height: 12px;
      background: red;
      border: 2px solid white;
      border-radius: 50%;
      z-index: 99999999999999;
      pointer-events: none;
      left: ${nearestLeft[0] - 6}px;
      top: ${nearestLeft[1] - 6}px;
    `
    document.body.appendChild(nearestPointDots.left)

    if (distanceLeft !== undefined) {
      nearestPointLabels.left = document.createElement('div')
      nearestPointLabels.left.id = 'rc-nearest-point-label-left'
      nearestPointLabels.left.textContent = `${distanceLeft.toFixed(decimalPlace || 1)} cm`

      const labelPosition = _calculateLabelPosition(
        nearestLeft[0],
        nearestLeft[1],
        'left',
      )

      nearestPointLabels.left.style.cssText = `
        position: fixed;
        font-size: 18px;
        color: red;
        background: rgba(255, 255, 255, 0.8);
        padding: 2px 6px;
        border-radius: 4px;
        z-index: 9999999999999;
        pointer-events: none;
        left: ${labelPosition.left}px;
        top: ${labelPosition.top}px;
        font-family: Arial, sans-serif;
        font-weight: bold;
      `
      document.body.appendChild(nearestPointLabels.left)
    }
  }

  if (
    nearestRight &&
    nearestRight[0] !== undefined &&
    nearestRight[1] !== undefined
  ) {
    nearestPointDots.right = document.createElement('div')
    nearestPointDots.right.id = 'rc-nearest-point-right'
    nearestPointDots.right.style.cssText = `
      position: fixed;
      width: 12px;
      height: 12px;
      background: blue;
      border: 2px solid white;
      border-radius: 50%;
      z-index: 99999999999999;
      pointer-events: none;
      left: ${nearestRight[0] - 6}px;
      top: ${nearestRight[1] - 6}px;
    `
    document.body.appendChild(nearestPointDots.right)

    if (distanceRight !== undefined) {
      nearestPointLabels.right = document.createElement('div')
      nearestPointLabels.right.id = 'rc-nearest-point-label-right'
      nearestPointLabels.right.textContent = `${distanceRight.toFixed(decimalPlace || 1)} cm`

      const labelPosition = _calculateLabelPosition(
        nearestRight[0],
        nearestRight[1],
        'right',
      )

      nearestPointLabels.right.style.cssText = `
        position: fixed;
        font-size: 18px;
        color: blue;
        background: rgba(255, 255, 255, 0.8);
        padding: 2px 6px;
        border-radius: 4px;
        z-index: 9999999999999;
        pointer-events: none;
        left: ${labelPosition.left}px;
        top: ${labelPosition.top}px;
        font-family: Arial, sans-serif;
        font-weight: bold;
      `
      document.body.appendChild(nearestPointLabels.right)
    }
  }

  // Draw realistic iris and pupil at the two eye points over the video feed
  if (leftEyePoint && rightEyePoint) {
    // Try to find the actual video feed element first, then fall back to container
    const videoFeed = document.getElementById('webgazerVideoFeed')
    const videoContainer = document.getElementById('webgazerVideoContainer')
    const videoEl = videoFeed || videoContainer

    if (videoEl && video) {
      const rect = videoEl.getBoundingClientRect()

      // Source coordinate space (facemesh/video canvas)
      const srcW = video.width
      const srcH = video.height

      // Account for CSS object-fit by computing scale and crop/letterbox offsets
      const containerW = rect.width
      const containerH = rect.height
      let scaleX, scaleY, offsetX, offsetY
      // Maintain aspect ratio: cover/contain/scale-down
      const scaleCover = Math.max(containerW / srcW, containerH / srcH)
      const uniformScale = scaleCover
      scaleX = uniformScale
      scaleY = uniformScale
      // For cover, displayed > container → positive offsets (crop). For contain, displayed < container → negative (letterbox)
      offsetX = (srcW * uniformScale - containerW) / 2
      offsetY = (srcH * uniformScale - containerH) / 2

      // Apply horizontal flip since video is typically mirrored
      const leftEyeXFlipped = srcW - leftEyePoint.x
      const rightEyeXFlipped = srcW - rightEyePoint.x

      const leftPx = {
        x: rect.left + leftEyeXFlipped * scaleX - offsetX,
        y: rect.top + leftEyePoint.y * scaleY - offsetY,
      }
      const rightPx = {
        x: rect.left + rightEyeXFlipped * scaleX - offsetX,
        y: rect.top + rightEyePoint.y * scaleY - offsetY,
      }

      // Compute iris diameter from IPD (19%) in source pixels, then scale to CSS
      const ipdSrcPx =
        averageDist ||
        Math.hypot(
          rightEyePoint.x - leftEyePoint.x,
          rightEyePoint.y - leftEyePoint.y,
          rightEyePoint.z - leftEyePoint.z,
        )
      const irisDiameterCss = Math.max(2, 0.19 * ipdSrcPx * uniformScale)
      const pupilDiameterCss = Math.max(1, 0.4 * irisDiameterCss)
      const irisRadiusCss = irisDiameterCss / 2
      const pupilRadiusCss = pupilDiameterCss / 2

      // Left iris
      eyePointDots.left = document.createElement('div')
      eyePointDots.left.id = 'rc-eye-iris-left'
      eyePointDots.left.style.cssText = `
        position: fixed;
        width: ${irisDiameterCss}px;
        height: ${irisDiameterCss}px;
        background: #00ffe9;
        border-radius: 50%;
        z-index: 2147483647;
        pointer-events: none;
        left: ${leftPx.x - irisRadiusCss}px;
        top: ${leftPx.y - irisRadiusCss}px;
        box-shadow: inset 0 0 4px rgba(0,0,0,0.35);
      `
      document.body.appendChild(eyePointDots.left)

      // Left pupil
      pupilDots.left = document.createElement('div')
      pupilDots.left.id = 'rc-eye-pupil-left'
      pupilDots.left.style.cssText = `
        position: fixed;
        width: ${pupilDiameterCss}px;
        height: ${pupilDiameterCss}px;
        background: #000;
        border-radius: 50%;
        z-index: 2147483647;
        pointer-events: none;
        left: ${leftPx.x - pupilRadiusCss}px;
        top: ${leftPx.y - pupilRadiusCss}px;
      `
      document.body.appendChild(pupilDots.left)

      // Right iris
      eyePointDots.right = document.createElement('div')
      eyePointDots.right.id = 'rc-eye-iris-right'
      eyePointDots.right.style.cssText = `
        position: fixed;
        width: ${irisDiameterCss}px;
        height: ${irisDiameterCss}px;
        background: #00ffe9;
        border-radius: 50%;
        z-index: 2147483647;
        pointer-events: none;
        left: ${rightPx.x - irisRadiusCss}px;
        top: ${rightPx.y - irisRadiusCss}px;
        box-shadow: inset 0 0 4px rgba(0,0,0,0.35);
      `
      document.body.appendChild(eyePointDots.right)

      // Right pupil
      pupilDots.right = document.createElement('div')
      pupilDots.right.id = 'rc-eye-pupil-right'
      pupilDots.right.style.cssText = `
        position: fixed;
        width: ${pupilDiameterCss}px;
        height: ${pupilDiameterCss}px;
        background: #000;
        border-radius: 50%;
        z-index: 2147483647;
        pointer-events: none;
        left: ${rightPx.x - pupilRadiusCss}px;
        top: ${rightPx.y - pupilRadiusCss}px;
      `
      document.body.appendChild(pupilDots.right)
    }
  }

  // Add webcam-to-eye distance label at top center, offset to avoid video
  if (nearestEyeToWebcamDistanceCM !== undefined) {
    webcamDistanceLabel = document.createElement('div')
    webcamDistanceLabel.id = 'rc-webcam-distance-label'
    webcamDistanceLabel.textContent = `${nearestEyeToWebcamDistanceCM.toFixed(decimalPlace || 1)} cm`

    // Calculate position: top center, offset right to avoid video
    const videoContainer = document.getElementById('webgazerVideoContainer')
    let labelLeft = window.innerWidth / 2
    const labelTop = 20 // 20px from top

    // If video container exists, offset to avoid overlap
    if (videoContainer) {
      const videoRect = videoContainer.getBoundingClientRect()
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

    webcamDistanceLabel.style.cssText = `
      position: fixed;
      font-size: 16px;
      color: #333;
      background: rgba(255, 255, 255, 0.9);
      padding: 4px 8px;
      border-radius: 6px;
      border: 1px solid #ddd;
      z-index: 2147483646;
      pointer-events: none;
      left: ${labelLeft}px;
      top: ${labelTop}px;
      font-family: Arial, sans-serif;
      font-weight: bold;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
     `
    document.body.appendChild(webcamDistanceLabel)
  }

  // Add factor label right below the webcam distance label
  if (factorCameraPxCm !== undefined) {
    factorLabel = document.createElement('div')
    factorLabel.id = 'rc-factor-label'
    factorLabel.textContent = `factorCameraPxCm: ${factorCameraPxCm.toFixed(0)}`

    // Calculate position: same horizontal position as webcam label, but below it
    const videoContainer = document.getElementById('webgazerVideoContainer')
    let labelLeft = window.innerWidth / 2
    const labelTop = 50 // 50px from top (30px below the webcam label)

    // If video container exists, offset to avoid overlap (same logic as webcam label)
    if (videoContainer) {
      const videoRect = videoContainer.getBoundingClientRect()
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

    factorLabel.style.cssText = `
       position: fixed;
       font-size: 16px;
       color: #333;
       background: rgba(255, 255, 255, 0.9);
       padding: 4px 8px;
       border-radius: 6px;
       border: 1px solid #ddd;
       z-index: 2147483646;
       pointer-events: none;
       left: ${labelLeft}px;
       top: ${labelTop}px;
       font-family: Arial, sans-serif;
       font-weight: bold;
       box-shadow: 0 2px 4px rgba(0,0,0,0.1);
     `
    document.body.appendChild(factorLabel)
  }

  // Add IPD label right below the factor label
  if (averageDist !== undefined) {
    ipdLabel = document.createElement('div')
    ipdLabel.id = 'rc-ipd-label'
    ipdLabel.textContent = `ipdCameraPx: ${Math.round(averageDist)}`

    // Calculate position: same horizontal position as factor label, but below it
    const videoContainer = document.getElementById('webgazerVideoContainer')
    let labelLeft = window.innerWidth / 2
    const labelTop = 80 // 80px from top (30px below the factor label)

    // If video container exists, offset to avoid overlap (same logic as other labels)
    if (videoContainer) {
      const videoRect = videoContainer.getBoundingClientRect()
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

    ipdLabel.style.cssText = `
       position: fixed;
       font-size: 16px;
       color: #333;
       background: rgba(255, 255, 255, 0.9);
       padding: 4px 8px;
       border-radius: 6px;
       border: 1px solid #ddd;
       z-index: 2147483646;
       pointer-events: none;
       left: ${labelLeft}px;
       top: ${labelTop}px;
       font-family: Arial, sans-serif;
       font-weight: bold;
       box-shadow: 0 2px 4px rgba(0,0,0,0.1);
     `
    document.body.appendChild(ipdLabel)
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

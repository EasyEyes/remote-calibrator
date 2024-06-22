import RemoteCalibrator from '../core'

import { blindSpotTest } from './distance'
import {
  toFixedNumber,
  constructInstructions,
  blurAll,
  sleep,
  safeExecuteFunc,
} from '../components/utils'
import { iRepeat } from '../components/iRepeat'
import { phrases } from '../i18n/schema'
import { spaceForLanguage } from '../components/language'
import { checkPermissions } from '../components/mediaPermission'

const originalStyles = {
  video: false,
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
    },
    trackDistanceOptions,
  )

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
  const getStdDist = distData => {
    this.showVideo(originalStyles.video)
    originalStyles.video = false

    if (this.gazeTracker.checkInitialized('gaze', false))
      this.showGazer(originalGazer)

    safeExecuteFunc(callbackStatic, distData)
    stdDist.current = distData
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

    blindSpotTest(this, options, true, getStdDist)
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

const stdDist = { current: null }

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
      //
      if (!video) video = document.getElementById('webgazerVideoCanvas')
      const videoTimestamp = performance.now()
      //
      faces = await model.estimateFaces(video)
      if (faces.length) {
        // There's at least one face in video
        RC._trackingVideoFrameTimestamps.distance += videoTimestamp
        // https://github.com/tensorflow/tfjs-models/blob/master/facemesh/mesh_map.jpg
        const mesh = faces[0].keypoints

        if (targetCount === distCount) {
          averageDist += eyeDist(mesh[133], mesh[362])
          averageDist /= targetCount
          RC._trackingVideoFrameTimestamps.distance /= targetCount

          // TODO Add more samples for the first estimate
          if (stdDist.current !== null) {
            if (!stdFactor) {
              // ! First time estimate
              // Face_Known_Px  *  Distance_Known_Cm  =  Face_Now_Px  *  Distance_x_Cm
              // Get the factor to be used for future predictions

              // adjust stdDist to the distance from the center of the screen to the user's eyes
              /*
              stdDist.current.value is the hypotenuse of the triangle formed by 
              the distance from the center of the screen to the top of the screen 
              and the distance from the center of the screen to the user's eyes
              */

              const distanceFromCenterToTop =
                _calculateDistanceFromCenterToTop(ppi)
              const distanceFromCenterToUser = Math.sqrt(
                stdDist.current.value ** 2 - distanceFromCenterToTop ** 2,
              )

              stdDist.current.value = distanceFromCenterToUser
              stdFactor = averageDist * stdDist.current.value

              // ! FINISH
              if (trackingConfig.options.check !== true) RC._removeBackground() // Remove BG if no check

              RC._trackingSetupFinishedStatus.distance = true
              readyToGetFirstData = true
            }

            /* -------------------------------------------------------------------------- */

            const timestamp = performance.now()
            const latency = Math.round(
              timestamp - RC._trackingVideoFrameTimestamps.distance,
            )

            const data = {
              value: toFixedNumber(
                stdFactor / averageDist,
                trackingOptions.decimalPlace,
              ),
              timestamp: timestamp,
              method: RC._CONST.VIEW_METHOD.F,
              latencyMs: latency,
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
              callbackTrack({
                value: {
                  viewingDistanceCm: data.value,
                  nearPointCm: nPData ? nPData.value : [null, null],
                  latencyMs: latency,
                },
                timestamp: timestamp,
                method: RC._CONST.VIEW_METHOD.F,
              })
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

  const v = document.querySelector('#webgazerVideoFeed')
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

    this.newViewingDistanceData = {
      value: toFixedNumber(stdFactor / dist, trackingOptions.decimalPlace),
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

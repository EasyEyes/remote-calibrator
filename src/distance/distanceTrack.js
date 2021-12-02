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
import { phrases } from '../i18n'

const originalStyles = {
  video: false,
}

RemoteCalibrator.prototype.trackDistance = function (
  options = {},
  callbackStatic,
  callbackTrack
) {
  /**
   * options -
   *
   * fullscreen: [Boolean]
   * repeatTesting: 2
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

  options = Object.assign(
    {
      fullscreen: false,
      repeatTesting: 2,
      sparkle: true,
      pipWidthPx:
        this._CONST.N.VIDEO_W[this.isMobile.value ? 'MOBILE' : 'DESKTOP'],
      showVideo: true,
      showFaceOverlay: false,
      decimalPlace: 1,
      framerate: 3, // tracking rate
      desiredDistanceCm: undefined,
      desiredDistanceTolerance: 0.9,
      desiredDistanceMonitor: false,
      desiredDistanceMonitorCancelable: false,
      nearPoint: true,
      showNearPoint: false,
      headline: '🙂 ' + phrases.RC_distanceTrackingTitle[this.L],
      description: phrases.RC_distanceTrackingIntro[this.L],
    },
    options
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
    phrases.RC_starting[this.L]
  )

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
  const _ = () => {
    this._addBackground()

    this._replaceBackground(
      constructInstructions(options.headline, options.description, true)
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

  originalStyles.video = options.showVideo

  this.gazeTracker._init(
    {
      toFixedN: 1,
      showVideo: true,
      showFaceOverlay: options.showFaceOverlay,
    },
    'distance'
  )

  this._trackingSetupFinishedStatus.distance = false

  if (options.nearPoint) {
    startTrackingPupils(
      this,
      () => {
        this._measurePD({}, _)
      },
      callbackTrack
    )
  } else {
    startTrackingPupils(this, _, callbackTrack)
  }
}

/* -------------------------------------------------------------------------- */

const startTrackingPupils = async (RC, beforeCallbackTrack, callbackTrack) => {
  RC.gazeTracker.beginVideo({ pipWidthPx: trackingOptions.pipWidthPx }, () => {
    RC._removeFloatInstructionElement()
    safeExecuteFunc(beforeCallbackTrack)
    _tracking(RC, trackingOptions, callbackTrack)
  })
}

const eyeDist = (a, b) => {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

const cyclopean = (video, a, b) => {
  return [
    (-a[0] - b[0] + video.videoWidth) / 2,
    (-a[1] - b[1] + video.videoHeight) / 2,
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
  desiredDistanceTolerance: 0.9,
  desiredDistanceMonitor: false,
  desiredDistanceMonitorCancelable: false,
}

const stdDist = { current: null }

let stdFactor, viewingDistanceTrackingFunction
let iRepeatOptions = { framerate: 20, break: true }

let nearPointDot = null
/* -------------------------------------------------------------------------- */

let readyToGetFirstData = false
let averageDist = 0
let distCount = 1

const _tracking = async (RC, trackingOptions, callbackTrack) => {
  const video = document.querySelector('#webgazerVideoFeed')

  const _ = async () => {
    // const canvas = RC.gazeTracker.webgazer.videoCanvas
    let model, faces

    // Get the average of 5 estimates for one measure
    averageDist = 0
    distCount = 1
    const targetCount = 5

    model = await RC.gazeTracker.webgazer.getTracker().model

    // Near point
    let ppi = RC.screenPpi ? RC.screenPpi.value : RC._CONST.N.PPI_DONT_USE
    if (!RC.screenPpi && trackingOptions.nearPoint)
      console.error(
        'Screen size measurement is required to get accurate near point tracking.'
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
    } = trackingOptions

    // Always enable correct on a fresh start
    RC._distanceTrackNudging.distanceCorrectEnabled = true
    RC._distanceTrackNudging.distanceDesired = desiredDistanceCm
    RC._distanceTrackNudging.distanceAllowedRatio = desiredDistanceTolerance

    viewingDistanceTrackingFunction = async () => {
      //
      const videoTimestamp = new Date().getTime()
      //
      faces = await model.estimateFaces(video)
      if (faces.length) {
        // There's at least one face in video
        RC._tackingVideoFrameTimestamps.distance += videoTimestamp
        // https://github.com/tensorflow/tfjs-models/blob/master/facemesh/mesh_map.jpg
        const mesh = faces[0].scaledMesh

        if (targetCount === distCount) {
          averageDist += eyeDist(mesh[133], mesh[362])
          averageDist /= targetCount
          RC._tackingVideoFrameTimestamps.distance /= targetCount

          // TODO Add more samples for the first estimate
          if (stdDist.current !== null) {
            if (!stdFactor) {
              // ! First time estimate
              // Face_Known_Px  *  Distance_Known_Cm  =  Face_Now_Px  *  Distance_x_Cm
              // Get the factor to be used for future predictions
              stdFactor = averageDist * stdDist.current.value
              // ! FINISH
              RC._removeBackground()
              RC._trackingSetupFinishedStatus.distance = true
              readyToGetFirstData = true
            }

            /* -------------------------------------------------------------------------- */

            const timestamp = new Date()
            const latency = Math.round(
              timestamp.getTime() - RC._tackingVideoFrameTimestamps.distance
            )

            const data = (RC.newViewingDistanceData = {
              value: toFixedNumber(
                stdFactor / averageDist,
                trackingOptions.decimalPlace
              ),
              timestamp: timestamp,
              method: RC._CONST.VIEW_METHOD.F,
              latencyMs: latency,
            })

            if (readyToGetFirstData || desiredDistanceMonitor) {
              // ! Check distance
              if (desiredDistanceCm)
                RC.checkDistance(desiredDistanceMonitorCancelable)
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
                latency
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

          RC._tackingVideoFrameTimestamps.distance = 0
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
  latency
) => {
  let offsetToVideoCenter = cyclopean(video, mesh[133], mesh[362])
  offsetToVideoCenter.forEach((offset, i) => {
    // Average inter-pupillary distance - 6.4cm
    offsetToVideoCenter[i] =
      ((RC.PDCm ? RC.PDCm.value : RC._CONST.N.PD_DONT_USE) * offset) /
      averageDist
  })

  let nPData = (RC.newNearPointData = {
    value: {
      x: toFixedNumber(offsetToVideoCenter[0], trackingOptions.decimalPlace),
      y: toFixedNumber(
        offsetToVideoCenter[1] + ((screen.height / 2) * 2.54) / ppi, // Commonly the webcam is 0.5cm above the screen
        trackingOptions.decimalPlace
      ),
      latencyMs: latency,
    },
    timestamp: timestamp,
  })

  // SHOW
  const dotR = 5
  if (trackingOptions.showNearPoint) {
    let offsetX = (nPData.value.x * ppi) / 2.54
    let offsetY = (nPData.value.y * ppi) / 2.54
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
  if (this.gazeTracker.checkInitialized('distance', true)) {
    iRepeatOptions.break = true
    if (nearPointDot) nearPointDot.style.display = 'none'
    this._tackingVideoFrameTimestamps.distance = 0
    return this
  }
  return null
}

RemoteCalibrator.prototype.resumeDistance = function () {
  if (this.gazeTracker.checkInitialized('distance', true)) {
    iRepeatOptions.break = false
    if (nearPointDot) nearPointDot.style.display = 'block'

    averageDist = 0
    distCount = 1
    this._tackingVideoFrameTimestamps.distance = 0

    iRepeat(viewingDistanceTrackingFunction, iRepeatOptions)
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
    trackingOptions.desiredDistanceTolerance = 0.9
    trackingOptions.desiredDistanceMonitor = false
    trackingOptions.desiredDistanceMonitorCancelable = false

    stdDist.current = null
    stdFactor = null
    viewingDistanceTrackingFunction = null

    readyToGetFirstData = false
    this._tackingVideoFrameTimestamps.distance = 0

    // Near point
    if (nearPointDot) {
      document.body.removeChild(nearPointDot)
      nearPointDot = null
    }

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

  let c = callback || this.gazeTracker.defaultDistanceTrackCallback

  let v = document.querySelector('#webgazerVideoFeed')
  let m = await this.gazeTracker.webgazer.getTracker().model
  const videoTimestamp = new Date().getTime()
  let f = await m.estimateFaces(v)

  if (f.length) {
    const mesh = f[0].scaledMesh
    const dist = eyeDist(mesh[133], mesh[362])

    let timestamp = new Date()
    //
    const latency = timestamp.getTime() - videoTimestamp
    //

    const data = (this.newViewingDistanceData = {
      value: toFixedNumber(stdFactor / dist, trackingOptions.decimalPlace),
      timestamp: timestamp,
      method: this._CONST.VIEW_METHOD.F,
      latencyMs: latency,
    })

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
        latency
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

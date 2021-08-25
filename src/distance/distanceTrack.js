import Swal from 'sweetalert2'

import RemoteCalibrator from '../core'

import { blindSpotTest } from './distance'
import { toFixedNumber, constructInstructions, blurAll } from '../helpers'
import { iRepeat } from '../components/iRepeat'
import text from '../text.json'
import { swalInfoOptions } from '../components/swalOptions'

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
      pipWidthPx: 208,
      showVideo: true,
      showFaceOverlay: false,
      decimalPlace: 2,
      framerate: 3, // track rate
      nearPoint: true, // New 0.0.6
      showNearPoint: false, // New 0.0.6
      headline: text.trackDistance.headline,
      description: text.trackDistance.description,
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
    'Starting up... Please wait.'
  )

  // STEP 2 - Live estimate
  const getStdDist = distData => {
    if (this.gazeTracker.checkInitialized('gaze', false))
      this.showGazer(originalGazer)

    if (callbackStatic && typeof callbackStatic === 'function')
      callbackStatic(distData)

    stdDist.current = distData
  }

  /* -------------------------------------------------------------------------- */

  // STEP 1 - Calibrate for live estimate
  const originalGazer = this.gazeTracker.webgazer.params.showGazeDot
  const _ = () => {
    this._addBackground()

    Swal.fire({
      ...swalInfoOptions,
      html: options.description,
    }).then(() => {
      this._replaceBackground(constructInstructions(options.headline))

      if (this.gazeTracker.checkInitialized('gaze', false))
        this.showGazer(false)
      blindSpotTest(this, options, true, getStdDist)
    })
  }

  trackingOptions.pipWidthPx = options.pipWidthPx
  trackingOptions.decimalPlace = options.decimalPlace
  trackingOptions.framerate = options.framerate
  trackingOptions.nearPoint = options.nearPoint
  trackingOptions.showNearPoint = options.showNearPoint

  // TODO Handle multiple init
  this.gazeTracker._init(
    {
      toFixedN: 1,
      showVideo: options.showVideo,
      showFaceOverlay: options.showFaceOverlay,
    },
    'distance'
  )

  if (options.nearPoint) {
    startTrackingPupils(
      this,
      () => {
        this.measurePD({}, _)
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
    beforeCallbackTrack()
    _tracking(RC, trackingOptions, callbackTrack)
  })
}

const eyeDist = (a, b) => {
  return Math.sqrt(
    Math.pow(a[0] - b[0], 2) +
      Math.pow(a[1] - b[1], 2) +
      Math.pow(a[2] - b[2], 2)
  )
}

const cyclopean = (video, a, b) => {
  let [aX, aY] = [video.videoWidth - a[0], a[1]]
  let [bX, bY] = [video.videoWidth - b[0], b[1]]
  return [(aX + bX) / 2, (aY + bY) / 2]
}

/* -------------------------------------------------------------------------- */
const trackingOptions = {
  pipWidthPx: 208,
  decimalPlace: 2,
  framerate: 3,
  nearPoint: true,
  showNearPoint: false,
}

const stdDist = { current: null }

let stdFactor, viewingDistanceTrackingFunction
let iRepeatOptions = { framerate: 20, break: true }

let nearPointDot = null
/* -------------------------------------------------------------------------- */

const _tracking = async (RC, trackingOptions, callbackTrack) => {
  const _ = async () => {
    // const canvas = RC.gazeTracker.webgazer.videoCanvas
    const video = document.querySelector('#webgazerVideoFeed')
    let model, faces

    // Get the average of 2 estimates for one measure
    let averageDist = 0
    let distCount = 1
    const targetCount = 5

    model = await RC.gazeTracker.webgazer.getTracker().model

    // Near point
    let ppi = RC.screenPpi ? RC.screenPpi.value : 108
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

    viewingDistanceTrackingFunction = async () => {
      faces = await model.estimateFaces(video)
      if (faces.length) {
        // There's at least one face in video
        const mesh = faces[0].scaledMesh
        // https://github.com/tensorflow/tfjs-models/blob/master/facemesh/mesh_map.jpg
        if (targetCount === distCount) {
          averageDist += eyeDist(mesh[133], mesh[362])
          averageDist /= 5

          if (stdDist.current !== null) {
            if (!stdFactor) {
              // ! First time estimate
              // Face_Known_Px  *  Distance_Known_Cm  =  Face_Now_Px  *  Distance_x_Cm
              // Get the factor to be used for future predictions
              stdFactor = averageDist * stdDist.current.value
              // FINISH
              RC._removeBackground()
            }

            /* -------------------------------------------------------------------------- */

            const timestamp = new Date()

            const data = (RC.newViewingDistanceData = {
              value: toFixedNumber(
                stdFactor / averageDist,
                trackingOptions.decimalPlace
              ),
              timestamp: timestamp,
              method: 'Facemesh Predict',
            })

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
                ppi
              )
            }

            /* -------------------------------------------------------------------------- */

            if (callbackTrack && typeof callbackTrack === 'function') {
              RC.gazeTracker.defaultDistanceTrackCallback = callbackTrack
              callbackTrack({
                value: {
                  viewingDistanceCm: data.value,
                  nearPointCm: nPData ? nPData.value : null,
                },
                timestamp: timestamp,
                method: 'Facemesh Predict',
              })
            }
          }

          averageDist = 0
          distCount = 1
        } else {
          averageDist += eyeDist(mesh[133], mesh[362])
          ++distCount
        }
      }
    }

    iRepeatOptions.break = false
    iRepeatOptions.framerate = targetCount * trackingOptions.framerate // Default 3 * 5
    iRepeat(viewingDistanceTrackingFunction, iRepeatOptions)
  }

  await _()
}

const _getNearPoint = (
  RC,
  trackingOptions,
  video,
  mesh,
  averageDist,
  timestamp,
  ppi
) => {
  let m = cyclopean(video, mesh[133], mesh[362])
  let offsetToVideoMid = [
    m[0] - video.videoWidth / 2,
    video.videoHeight / 2 - m[1],
  ]

  const videoFactor = video.videoHeight / video.clientHeight
  offsetToVideoMid.forEach((e, i) => {
    // Average interpupillary distance - 6.4cm
    offsetToVideoMid[i] =
      ((RC.PDCm ? RC.PDCm.value : 6.4) * e) /
      (averageDist * (videoFactor / 2)) /* Should this be videoFactor? */
  })

  let nPData = (RC.newNearPointData = {
    value: {
      x: toFixedNumber(offsetToVideoMid[0], trackingOptions.decimalPlace),
      y: toFixedNumber(
        offsetToVideoMid[1] + 0.5, // Commonly the webcam is 0.5cm above the screen
        trackingOptions.decimalPlace
      ),
    },
    timestamp: timestamp,
  })

  // SHOW
  if (trackingOptions.showNearPoint) {
    let offsetX = (nPData.value.x * ppi) / 2.54
    let offsetY = (nPData.value.y * ppi) / 2.54
    Object.assign(nearPointDot.style, {
      left: `${screen.width / 2 - window.screenLeft - 5 + offsetX}px`,
      top: `${
        screen.height / 2 -
        window.screenTop -
        5 -
        (RC.isFullscreen.value ? 0 : 50) -
        offsetY
      }px`,
    })
  }

  return nPData
}

RemoteCalibrator.prototype.pauseDistance = function () {
  if (this.gazeTracker.checkInitialized('distance', true)) {
    iRepeatOptions.break = true
    if (nearPointDot) nearPointDot.style.display = 'none'
    return this
  }
  return null
}

RemoteCalibrator.prototype.resumeDistance = function () {
  if (this.gazeTracker.checkInitialized('distance', true)) {
    iRepeatOptions.break = false
    if (nearPointDot) nearPointDot.style.display = 'block'
    iRepeat(viewingDistanceTrackingFunction, iRepeatOptions)
    return this
  }
  return null
}

RemoteCalibrator.prototype.endDistance = function (endAll = false, _r = true) {
  if (this.gazeTracker.checkInitialized('distance', true)) {
    iRepeatOptions.break = true
    iRepeatOptions.framerate = 20

    trackingOptions.pipWidthPx = 208
    trackingOptions.decimalPlace = 2
    trackingOptions.framerate = 3
    trackingOptions.nearPoint = true
    trackingOptions.showNearPoint = false

    stdDist.current = null
    stdFactor = null
    viewingDistanceTrackingFunction = null

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
  let f = await m.estimateFaces(v)

  if (f.length) {
    const mesh = f[0].scaledMesh
    const dist = eyeDist(mesh[133], mesh[362])

    let timestamp = new Date()

    const data = (this.newViewingDistanceData = {
      value: toFixedNumber(stdFactor / dist, trackingOptions.decimalPlace),
      timestamp: timestamp,
      method: 'Facemesh Predict',
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
        this.screenPpi ? this.screenPpi.value : 108
      )
    }

    if (c)
      c({
        value: {
          viewingDistanceCm: data.value,
          nearPointCm: nPData ? nPData.value : null,
        },
        timestamp: timestamp,
        method: 'Facemesh Predict',
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

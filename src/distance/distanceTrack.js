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
   * pipWidthPX: [208]
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
      pipWidthPX: 208,
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

  // STEP 2 - Live estimate
  const getStdDist = distData => {
    if (this.gazeTracker.checkInitialized('gaze')) this.showGazer(originalGazer)

    if (callbackStatic && typeof callbackStatic === 'function')
      callbackStatic(distData)

    // After getting the standard distance
    trackingOptions.pipWidthPX = options.pipWidthPX
    trackingOptions.decimalPlace = options.decimalPlace
    trackingOptions.framerate = options.framerate
    trackingOptions.nearPoint = options.nearPoint
    trackingOptions.showNearPoint = options.showNearPoint

    startTrackingPupils(this, distData, callbackTrack)
  }

  /* -------------------------------------------------------------------------- */

  // STEP 1 - Calibrate for live estimate
  this._addBackground()

  const originalGazer = this.gazeTracker.webgazer.params.showGazeDot
  Swal.fire({
    ...swalInfoOptions,
    html: options.description,
  }).then(() => {
    this._replaceBackground(constructInstructions(options.headline))

    // TODO Handle multiple init
    this.gazeTracker._init(
      {
        toFixedN: 1,
        showVideo: options.showVideo,
        showFaceOverlay: options.showFaceOverlay,
      },
      'distance'
    )

    if (this.gazeTracker.checkInitialized('gaze')) this.showGazer(false)
    blindSpotTest(this, options, true, getStdDist)
  })
}

/* -------------------------------------------------------------------------- */

const startTrackingPupils = async (RC, stdDist, callbackTrack) => {
  const _t = _tracking.bind(this, RC, stdDist, trackingOptions, callbackTrack)
  RC.gazeTracker.beginVideo({ pipWidthPX: trackingOptions.pipWidthPX }, _t)
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
  pipWidthPX: 208,
  decimalPlace: 2,
  framerate: 3,
  nearPoint: true,
  showNearPoint: false,
}

let stdFactor, viewingDistanceTrackingFunction
let iRepeatOptions = { framerate: 20, break: true }

let nearPointDot = null
/* -------------------------------------------------------------------------- */

const _tracking = async (
  RC,
  stdDist = null,
  trackingOptions,
  callbackTrack
) => {
  // const canvas = RC.gazeTracker.webgazer.videoCanvas
  const video = document.querySelector('#webgazerVideoFeed')
  let model, faces

  // Get the average of 2 estimates for one measure
  let averageDist = 0
  let distCount = 1
  const targetCount = 5

  model = await RC.gazeTracker.webgazer.getTracker().model

  // Near point
  let ppi = RC.screenPPI ? RC.screenPPI.value : 108
  if (!RC.screenPPI && trackingOptions.nearPoint)
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
      top: '-5px',
      left: '-5px',
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

        if (!stdFactor && stdDist !== null) {
          // ! First time estimate
          // Face_Known_PX  *  Distance_Known_CM  =  Face_Now_PX  *  Distance_x_CM
          // Get the factor to be used for future predictions
          stdFactor = averageDist * stdDist.value
          // FINISH
          RC._removeBackground()
        }

        /* -------------------------------------------------------------------------- */

        const timestamp = new Date()

        const data = (RC.viewingDistanceData = {
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
              viewingDistanceCM: data.value,
              nearPointCM: nPData ? nPData.value : null,
            },
            timestamp: timestamp,
            method: 'Facemesh Predict',
          })
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
      (6.4 * e) /
      (averageDist * (videoFactor / 2)) /* Should this be videoFactor? */
  })

  let nPData = (RC.nearPointData = {
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

    trackingOptions.pipWidthPX = 208
    trackingOptions.decimalPlace = 2
    trackingOptions.framerate = 3
    trackingOptions.nearPoint = true
    trackingOptions.showNearPoint = false

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

    const data = (this.viewingDistanceData = {
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
        this.screenPPI ? this.screenPPI.value : 108
      )
    }

    if (c)
      c({
        value: {
          viewingDistanceCM: data.value,
          nearPointCM: nPData ? nPData.value : null,
        },
        timestamp: timestamp,
        method: 'Facemesh Predict',
      })
    return data
  }

  return null
}

import RemoteCalibrator from '../core'

import { blindSpotTest } from './distance'
import { toFixedNumber, constructInstructions, blurAll } from '../helpers'
import { iRepeat } from '../components/iRepeat'
import text from '../text.json'

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
   * ? pip: [Boolean] (Display a small picture at corner or not)
   * pipWidthPX: [208]
   * landmarkRate: [15] (How many times (each second) to get landmarks of the face, and adjust est distance!)
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
    startTrackingPupils(this, distData, callbackTrack)
  }

  /* -------------------------------------------------------------------------- */

  // STEP 1 - Calibrate for live estimate
  this._addBackground(
    constructInstructions(options.headline, options.description)
  )

  // TODO Handle multiple init
  this.gazeTracker._init(
    {
      toFixedN: 1,
      showVideo: options.showVideo,
      showFaceOverlay: options.showFaceOverlay,
    },
    'distance'
  )

  const originalGazer = this.gazeTracker.webgazer.params.showGazeDot
  if (this.gazeTracker.checkInitialized('gaze')) this.showGazer(false)

  blindSpotTest(this, options, true, getStdDist)
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

/* -------------------------------------------------------------------------- */
const trackingOptions = {
  pipWidthPX: 208,
  decimalPlace: 2,
  framerate: 3,
}

let stdFactor, viewingDistanceTrackingFunction
let iRepeatOptions = { framerate: 20, break: true }
/* -------------------------------------------------------------------------- */

const _tracking = async (
  RC,
  stdDist = null,
  trackingOptions,
  callbackTrack
) => {
  // const canvas = RC.gazeTracker.webgazer.videoCanvas
  const video = document.querySelector('video')
  let model, faces

  // Get the average of 2 estimates for one measure
  let averageDist = 0
  let distCount = 1
  const targetCount = 5

  model = await RC.gazeTracker.webgazer.getTracker().model

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

        if (callbackTrack && typeof callbackTrack === 'function') {
          RC.gazeTracker.defaultDistanceTrackCallback = callbackTrack
          callbackTrack(
            (RC.viewingDistanceData = {
              value: toFixedNumber(
                stdFactor / averageDist,
                trackingOptions.decimalPlace
              ),
              timestamp: new Date(),
              method: 'Facemesh Predict',
            })
          )
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

RemoteCalibrator.prototype.pauseDistance = function () {
  if (this.gazeTracker.checkInitialized('distance', true)) {
    iRepeatOptions.break = true
    return this
  }
  return null
}

RemoteCalibrator.prototype.resumeDistance = function () {
  if (this.gazeTracker.checkInitialized('distance', true)) {
    iRepeatOptions.break = false
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

    stdFactor = null
    viewingDistanceTrackingFunction = null

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

  let m = await this.gazeTracker.webgazer.getTracker().model
  let f = await m.estimateFaces(document.querySelector('video'))

  if (f.length) {
    const mesh = f[0].scaledMesh
    const dist = eyeDist(mesh[133], mesh[362])

    const data = (this.viewingDistanceData = {
      value: toFixedNumber(stdFactor / dist, trackingOptions.decimalPlace),
      timestamp: new Date(),
      method: 'Facemesh Predict',
    })

    if (c) c(data)
    return data
  }

  return null
}

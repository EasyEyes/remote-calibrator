import RemoteCalibrator from './core'

import { blindSpotTest } from './distance'
import { toFixedNumber, constructInstructions, blurAll } from './helpers'
import { iRepeat } from './components/iRepeat'
import text from './text.json'

RemoteCalibrator.prototype.trackDistance = function (
  options = {},
  callbackStd,
  callbackTrack
) {
  /**
   * options -
   *
   * fullscreen: [Boolean]
   * repeatTesting: 3
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
      fullscreen: true,
      repeatTesting: 2,
      pipWidthPX: 208,
      showVideo: true,
      showFaceOverlay: true,
      decimalPlace: 2,
      trackingRate: 3, // FPS
      headline: text.trackDistance.headline,
      description: text.trackDistance.description,
    },
    options
  )

  /* -------------------------------------------------------------------------- */

  this.getFullscreen(options.fullscreen)

  // STEP 2 - Live estimate
  const getStdDist = distData => {
    callbackStd(distData)
    // After getting the standard distance
    const trackingOptions = {
      pipWidthPX: options.pipWidthPX,
      decimalPlace: options.decimalPlace,
      trackingRate: options.trackingRate,
    }
    startTrackingPupils(this, distData, trackingOptions, callbackTrack)
  }

  // STEP 1 - Calibrate for live estimate
  this._addBackground(
    constructInstructions(options.headline, options.description)
  )

  this.gazeTracker._init({
    toFixedN: 1,
    showVideo: options.showVideo,
    showFaceOverlay: options.showFaceOverlay,
    showGazer: false,
  })

  blindSpotTest(this, options, true, getStdDist)
}

const startTrackingPupils = (RC, stdDist, trackingOptions, callbackTrack) => {
  // Face_Known_PX  *  Distance_Known_CM  =  Face_Now_PX  *  Distance_x_CM
  let stdFactor

  RC.gazeTracker.beginVideo(
    { pipWidthPX: trackingOptions.pipWidthPX },
    async () => {
      // const canvas = RC.gazeTracker.webgazer.videoCanvas
      const video = document.querySelector('video')
      let model, faces

      // Get the average of 2 estimates for one measure
      let averageDist = 0
      let distCount = 1
      const targetCount = 5

      model = await RC.gazeTracker.webgazer.getTracker().model

      const iFunction = async () => {
        faces = await model.estimateFaces(video)
        if (faces.length) {
          // There's at least one face in video
          const mesh = faces[0].scaledMesh
          // https://github.com/tensorflow/tfjs-models/blob/master/facemesh/mesh_map.jpg
          if (targetCount === distCount) {
            averageDist += eyeDist(mesh[133], mesh[362])
            averageDist /= 5

            if (!stdFactor) {
              // ! First time estimate
              // Get the factor to be used for future predictions
              stdFactor = averageDist * stdDist.value
              // FINISH
              RC._removeBackground()
            }

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

            averageDist = 0
            distCount = 1
          } else {
            averageDist += eyeDist(mesh[133], mesh[362])
            distCount += 1
          }
        }
      }

      iRepeat(iFunction, targetCount * trackingOptions.trackingRate) // Default 3 * 5
    }
  )
}

const eyeDist = (a, b) => {
  return Math.sqrt(
    Math.pow(a[0] - b[0], 2) +
      Math.pow(a[1] - b[1], 2) +
      Math.pow(a[2] - b[2], 2)
  )
}

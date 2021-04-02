import RemoteCalibrator from './core'

import { blindSpotTest } from './distance'
import { addBackground, constructInstructions, getFullscreen } from './helpers'
import { debug } from './constants'

RemoteCalibrator.prototype.trackDistance = function (options = {}, callback) {
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
  options = Object.assign(
    {
      fullscreen: true,
      repeatTesting: 3,
      // pip: true,
      pipWidthPX: 208,
      landmarkRate: 15,
      headline: `📏 Live Viewing Distance Calibration`,
      description:
        "We'll measure your viewing distance. To do this, we'll perform a blind spot test. \nCover or close one of your eyes and focus on the black cross. \nPress <b>SPACE</b> when the red circle disappears. \nIf it doesn't disappear, you may have to move closer or farther from the screen. \n<b>Please enable camera access.</b>",
    },
    options
  )

  /* -------------------------------------------------------------------------- */

  if (options.fullscreen && !debug) getFullscreen()

  // STEP 2 - Live estimate
  const getStdDist = dist => {
    // After getting the standard distance
    if (callback) callback(dist)
  }

  // STEP 1 - Calibrate for live estimate
  const trainingDiv = addBackground(
    constructInstructions(options.headline, options.description)
  )

  blindSpotTest(this, trainingDiv, options, getStdDist)
}

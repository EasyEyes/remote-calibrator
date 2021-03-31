import { blindSpotTest } from './distance'
import { addBackground, constructInstructions, getFullscreen } from './helpers'
import { debug } from './constants'

export function trackDistance(callback, options) {
  /**
   * options -
   *
   * fullscreen: [Boolean]
   * testingEyes: ['both', 'left', 'right'] // TODO
   * repeatTesting: 2
   * ? pip: [Boolean] (Display a small picture at corner or not)
   * pipWidth: [208]
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
      repeatTesting: 2,
      // pip: true,
      pipWidth: 208,
      landmarkRate: 15,
      headline: `📏 Live Viewing Distance Calibration`,
      description:
        "We'll measure your viewing distance. To do this, we'll perform a <em>blind spot test</em>. \nCover or close one of your eyes and focus on the black cross. \nPress <b>SPACE</b> when the red circle disappears. \nIf it doesn't disappear, you may have to move closer or farther from the screen. \n<b>Please enable camera access.</b>",
    },
    options
  )

  /* -------------------------------------------------------------------------- */

  if (options.fullscreen && !debug) getFullscreen()

  // STEP 2 - Live estimate
  const getStdDist = dist => {
    // After getting the standard distance
    callback(dist)
  }

  // STEP 1 - Calibrate for live estimate
  const trainingDiv = addBackground(
    constructInstructions(options.headline, options.description)
  )

  blindSpotTest(trainingDiv, options, getStdDist)
}

import { blindSpotTest } from './distance'
import { addBackground, getFullscreen } from './helpers'
import {
  addVideoElementsToBody,
  drawVideoOnCanvas,
  formatVideoCanvas,
  startVideo,
} from './video'

// import {
//   SupportedPackages,
//   load,
// } from '@tensorflow-models/face-landmarks-detection'
// import '@tensorflow/tfjs-backend-webgl'
// import '@tensorflow/tfjs-backend-cpu'

const debug = false // Disable fullscreen when debug

const trainingHTML = `
<div class="calibration-instruction">
	<h1>📏 Live Viewing Distance Calibration</h1>
	<p>
		We'll measure your viewing distance. To do this, we'll perform a <em>blind spot test</em>.
		Cover or close one of your eyes and focus on the black cross.
		Press <b>SPACE</b> when the red circle disappears.
    We'll measure for several trials. After each trial, please move closer or farther,
    stay still again, and repeat the above. The toolbox will then start live estimating of
    your viewing distance. <b>Please enable camera access.</b>
	</p>
</div>`

export function liveDistance(callback, options) {
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
   */
  options = Object.assign(
    {
      fullscreen: true,
      repeatTesting: 2,
      // pip: true,
      pipWidth: 208,
      landmarkRate: 15,
    },
    options
  )

  /* -------------------------------------------------------------------------- */

  if (options.fullscreen && !debug) getFullscreen()

  // STEP 2 - Live estimate
  const getStdDist = dist => {
    // After getting the standard distance
  }

  // STEP 1 - Calibrate for live estimate
  const trainingDiv = addBackground(trainingHTML)

  // ! CAMERA & CANVAS

  // TODO Move to video.js?
  const [video, vC, vCtx] = addVideoElementsToBody()

  // Video Canvas
  const projectVideoToCanvas = () => {
    drawVideoOnCanvas(video, vCtx, vC.width, vC.height)

    // Draw landmarks
    // if (face_predictions && face_predictions[0]) {
    //   for (let point of face_predictions[0].scaledMesh) {
    //     vCtx.fillRect(point[0], point[1], 1, 1)
    //   }
    // }

    requestAnimationFrame(projectVideoToCanvas)
  }

  // Model
  let face_predictions, estimateInterval
  async function landmarksDetection() {
    const model = await load(SupportedPackages.mediapipeFacemesh, {
      shouldLoadIrisModel: true,
      maxFace: 1,
      detectionConfidence: 0.9,
      iouThreshold: 0.4,
    })
    // Prediction Interval
    estimateInterval = setInterval(async () => {
      face_predictions = await model.estimateFaces({
        input: vC,
      })
    }, Math.round(1000 / options.landmarkRate))
  }

  // Video
  startVideo(video, stream => {
    formatVideoCanvas(vC, stream, options.pipWidth)

    requestAnimationFrame(projectVideoToCanvas)
    landmarksDetection(video)
  })

  blindSpotTest(trainingDiv, options, getStdDist)
}

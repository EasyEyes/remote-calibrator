import { blindSpotTest } from './distance'
import { getFullscreen } from './helpers'

import ccv from './library/ccv'
import cascade from './library/face'

const trainingHTML = `
<div class="calibration-instruction">
	<h1>📏 Live Viewing Distance Calibration</h1>
	<p>
		We'll measure your viewing distance. To do this, we'll perform a <em>blind spot test</em>.
		Cover or close one of your eyes and focus on the black cross.
		Press <b>SPACE</b> when the red circle disappears.
		If it doesn't disappear, you may have to move closer or farther from the screen.
    We'll measure for several trials. After each trial, please move closer or farther,
    stay still again, and repeat the above. The toolbox will then start live estimating of
    your viewing distance. <b>Please enable camera access.</b>
	</p>
</div>
<video id="face-video"></video>
<canvas id="video-canvas"></canvas>`

export function liveDistance(callback, options) {
  /**
   * options -
   *
   * units: ['in', 'cm'] // TODO
   * fullscreen: [Boolean]
   * quitFullscreenOnFinished: [Boolean] // TODO
   * testingEyes: ['both', 'left', 'right'] // TODO
   * repeatTestingEachTrial: 2
   * trials: 3
   * pip: [Boolean] (Display a small picture at corner or not)
   * pipWidth: [240]
   *
   */
  options = Object.assign(
    {
      units: 'in',
      fullscreen: true,
      quitFullscreenOnFinished: false,
      repeatTestingEachTrial: 2,
      trials: 3,
      pip: true,
      pipWidth: 208,
    },
    options
  )
  options.repeatTesting = options.repeatTestingEachTrial

  const addTrialPoint = dist => {}

  /* -------------------------------------------------------------------------- */

  if (options.fullscreen) getFullscreen()

  // STEP 1 - Calibrate for live estimate
  const trainingDiv = document.createElement('div')
  trainingDiv.className = 'calibration-background'
  trainingDiv.innerHTML = trainingHTML
  document.body.appendChild(trainingDiv)

  // ! Start camera
  const vC = document.querySelector('#video-canvas')
  const vCtx = vC.getContext('2d')
  const video = document.querySelector('video')
  let width, height, scale // Width and height of our video

  let face
  const projectVideoToCanvas = () => {
    vCtx.drawImage(video, 0, 0, vC.width, vC.height)
    face = ccv.detect_objects({
      canvas: ccv.pre(vC),
      cascade: cascade,
      interval: 2,
      min_neighbors: 1,
    })
    if (face[0] && face[0].confidence > 0.3) {
      vCtx.fillStyle = '#57068c77'
      vCtx.fillRect(face[0].x, face[0].y, face[0].width, face[0].height)
    }
    requestAnimationFrame(projectVideoToCanvas)
  }

  navigator.getUserMedia(
    { video: {} },
    stream => {
      video.srcObject = stream
      video.play()
      ;({ width, height } = stream.getTracks()[0].getSettings())
      scale = options.pipWidth / width
      vC.style.width = (vC.width = options.pipWidth) + 'px'
      vC.style.height = (vC.height = scale * height) + 'px'

      vCtx.translate(options.pipWidth, 0)
      vCtx.scale(-1, 1)

      requestAnimationFrame(projectVideoToCanvas)
    },
    err => console.error(err)
  )

  // navigator.mediaDevices
  //   .getUserMedia({ audio: false, video: true })
  //   .then(function (stream) {
  //     video.srcObject = stream
  //     video.play()
  //   })
  //   .catch(function (error) {
  //     // Error
  //     console.error(error)
  //   })

  blindSpotTest(trainingDiv, options, addTrialPoint)
}

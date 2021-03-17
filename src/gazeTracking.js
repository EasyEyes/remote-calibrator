import webgazer from './WebGazer/dist/webgazer.commonjs2.min'

import { addBackground, getFullscreen } from './helpers'
// import {
//   addVideoElementsToBody,
//   drawVideoOnCanvas,
//   formatVideoCanvas,
//   startVideo,
// } from './video'

const debug = false

const gazeTrainingHTML = `
<div class="calibration-instruction">
	<h1>👀 Live Gaze Tracking</h1>
	<p>
		We'll keep track of your gaze position. First, we need to calibrate for the system.
    Please enable camera access and move your body to the center so that the square becomes green.
    Please then follow the instructions below to finish the calibration.
	</p>
</div>`

export function gazeTracking(callback, options) {
  /**
   * options -
   *
   * fullscreen: [Boolean]
   * showGazer: [Boolean]
   * pipWidth: [208]
   * greedyLearner: [Boolean] If false, stop learning after calibration process // TODO
   *
   */
  // const gazerScript = document.createElement('script')
  // gazerScript.src = 'https://webgazer.cs.brown.edu/webgazer.js'
  // gazerScript.async = true
  // document.body.appendChild(gazerScript)
  // gazerScript.onload = () => {

  // }

  options = Object.assign(
    {
      fullscreen: true,
      showGazer: true,
      pipWidth: 208,
      greedyLearner: true,
    },
    options
  )
  // Fullscreen
  if (options.fullscreen && !debug) getFullscreen()

  addBackground(gazeTrainingHTML)

  // const [video, vC, vCtx] = addVideoElementsToBody()
  // const projectVideoToCanvas = () => {
  //   drawVideoOnCanvas(video, vCtx, vC.width, vC.height)
  //   requestAnimationFrame(projectVideoToCanvas)
  // }
  // startVideo(video, (stream) => {
  //   formatVideoCanvas(vC, stream, options.pipWidth)
  //   requestAnimationFrame(projectVideoToCanvas)
  // })

  // ! WebGazer
  ////
  webgazer.clearData()
  window.saveDataAcrossSessions = false
  ////
  webgazer.showVideo(true)
  webgazer.showPredictionPoints(options.showGazer)

  webgazer
    .setGazeListener((data, elapsedTme) => {
      if (data) {
        callback([data.x, data.y])
      }
    })
    // .setVideoViewerSize(options.pipWidth, () => {
    //   const [wgWidth, wgHeight] = _webgazerVideoGetSize()
    //   return (options.pipWidth / wgWidth) * wgHeight
    // })
    .begin()

  let checkWebgazerReady = setInterval(() => {
    let v = document.getElementById('webgazerVideoFeed')
    if (v) {
      // webgazer.setVideoViewerSize(
      //   options.pipWidth,
      //   (options.pipWidth / v.width) * v.height
      // )
      v.parentElement.style.transform = `scale(${
        options.pipWidth / parseInt(v.style.width)
      })`
      v.parentElement.style.left = '1rem'
      v.parentElement.style.bottom = '1rem'
      v.parentElement.style.top = 'unset'
      clearInterval(checkWebgazerReady)
    }
  }, 200)
}

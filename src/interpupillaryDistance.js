import Swal from 'sweetalert2'

import RemoteCalibrator from './core'

import { blurAll, constructInstructions, toFixedNumber } from './helpers'
import { swalInfoOptions } from './components/swalOptions'
import text from './text.json'

// let selfVideo = false // No WebGazer video available and an extra video element needs to be created

RemoteCalibrator.prototype.measurePD = function (options = {}, callback) {
  ////
  if (!this.checkInitialized()) return
  blurAll()
  ////

  options = Object.assign(
    {
      fullscreen: false,
      headline: text.measurePD.headline,
      description: text.measurePD.description,
      shortDescription: text.measurePD.shortDescription,
    },
    options
  )

  this.getFullscreen(options.fullscreen)

  this._replaceBackground()

  Swal.fire({
    ...swalInfoOptions,
    html: options.description,
  }).then(() => {
    this._replaceBackground(
      constructInstructions(options.headline, options.shortDescription)
    )
    let [videoWidth, videoHeight] = setupVideo(this)
    setupRuler(this, videoWidth, videoHeight)

    // if (callback && typeof callback === 'function') callback()
  })
}

const setupVideo = RC => {
  let video = document.querySelector('#webgazerVideoFeed')
  if (!video) {
    // selfVideo = true
    // let [videoElement, videoCanvas, videoCanvasDrawingContext] =
    //   addVideoElementsToBody()
    // video = videoElement
    // formatVideo(video, videoCanvas)
    // let _d = drawVideoOnCanvas.bind(
    //   RC,
    //   video,
    //   videoCanvasDrawingContext,
    //   videoCanvas.width,
    //   videoCanvas.height
    // )
    // startVideo(video, stream => {
    //   formatVideo(video, videoCanvas, stream)
    // })
    // iRepeat(_d)
    console.error('No proper video element found!')
  } else {
    return formatVideo(
      RC,
      video,
      document.querySelector('#webgazerVideoCanvas'),
      document.querySelector('#webgazerVideoContainer')
    )
  }
}

const originalStyles = {
  video: false,
  videoWidth: 0,
  videoHeight: 0,
  gaze: false,
  faceOverlay: false,
}

const videoWidthFactor = 0.9

const formatVideo = (RC, video, canvas, container, stream = null) => {
  if (!stream) {
    if (video.captureStream) {
      stream = video.captureStream()
    }
  }

  // const { width, height } = stream
  //   ? stream.getTracks()[0].getSettings()
  //   : [video.videoWidth, video.videoHeight]
  let h =
    ((window.innerWidth * 0.5) / parseInt(video.style.width)) *
    parseInt(video.style.height)

  originalStyles.videoWidth = container.style.width
  originalStyles.videoHeight = container.style.height
  Object.assign(container.style, {
    height: h + 'px',
    width: window.innerWidth * videoWidthFactor + 'px',
    opacity: 1,
    // left: `50%`,
    // top: `50%`,
    // transform: `translate(${(-window.innerWidth * videoWidthFactor) / 2}px, ${
    //   -h * 0.5
    // }px)`,
    left: 0.5 * window.innerWidth * (1 - videoWidthFactor) + 'px',
    bottom: 0.5 * (window.innerHeight - h) + 'px',
    borderRadius: '15px',
  })

  // Canvas
  // Object.assign(canvas.style, {
  //   height: h + 'px',
  //   width: window.innerWidth / 2 + 'px',
  // })

  Object.assign(video.style, {
    height: h * videoWidthFactor * 2 + 'px',
    width: window.innerWidth * videoWidthFactor + 'px',
    top: -h * (videoWidthFactor - 0.5) + 'px',
    transform: 'scale(-2, 2)',
    transformOrigin: 'center',
  })

  originalStyles.video = RC.gazeTracker.webgazer.params.showVideo
  originalStyles.gaze = RC.gazeTracker.webgazer.params.showGazeDot
  originalStyles.faceOverlay = RC.gazeTracker.webgazer.params.showFaceOverlay
  if (!originalStyles.video) RC.showVideo(true)
  if (originalStyles.gaze) RC.showGazer(true)
  if (originalStyles.faceOverlay) RC.showFaceOverlay(false)
  RC.gazeTracker.webgazer.showFaceFeedbackBox(false)

  return [window.innerWidth * videoWidthFactor, h]
}

/* -------------------------------------------------------------------------- */

const sidePadding = 30 // Paddings (px) on both sides of the ruler

const setupRuler = (RC, vWidth, vHeight) => {
  const screenPPI = RC.screenPPI ? RC.screenPPI.value : 108

  const rulerElement = document.createElement('div')
  rulerElement.id = 'rc-ruler'
  Object.assign(rulerElement.style, {
    height: (0.9 * (window.innerHeight - vHeight)) / 2 + 'px',
    width: 2 * window.innerWidth + 'px',
    left: 0.25 * (window.innerWidth - vWidth) + 'px',
    bottom: 0,
    backgroundColor: '#FFD523dd',
    borderRadius: '15px 0 0 0',
    boxSizing: 'border-box',
    borderBottom: '9px solid #cca500',
  })

  RC.background.appendChild(rulerElement)

  const scales = document.createElement('div')
  scales.id = 'rc-ruler-scales'
  rulerElement.appendChild(scales)

  const totalCM =
    ((rulerElement.clientWidth - sidePadding * 2) * 2.54) / screenPPI
  for (let i = 0; i <= toFixedNumber(totalCM, 1) * 10; i++) {
    let thisScale = document.createElement('div')
    thisScale.className =
      'rc-ruler-scale ' +
      (i % 10 === 0
        ? 'rc-ruler-major'
        : i % 5 === 0
        ? 'rc-ruler-secondary'
        : 'rc-ruler-minor')
    thisScale.style.left = (0.1 * i * screenPPI) / 2.54 + 'px'
    scales.appendChild(thisScale)
  }

  const zeroText = document.createElement('p')
  zeroText.innerHTML = '0'
  zeroText.id = 'rc-ruler-zero'
  scales.appendChild(zeroText)
}

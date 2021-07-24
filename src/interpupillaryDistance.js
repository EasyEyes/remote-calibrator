import Swal from 'sweetalert2'

import RemoteCalibrator from './core'

import { blurAll, constructInstructions, toFixedNumber } from './helpers'
import { swalInfoOptions } from './components/swalOptions'
import Arrow from './media/arrow.svg'
import PD from './media/pd.png'
import { bindKeys, unbindKeys } from './components/keyBinder'
import { colorDarkRed } from './constants'
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
    icon: undefined,
    imageUrl: PD,
    imageWidth: 480,
    imageAlt: 'Measurement Instruction',
    html: options.description,
  }).then(() => {
    this._replaceBackground(
      constructInstructions(options.headline, options.shortDescription)
    )
    const screenPPI = this.screenPPI ? this.screenPPI.value : 108

    let [videoWidth, videoHeight] = setupVideo(this)
    let [ruler, rulerListener] = setupRuler(
      this,
      screenPPI,
      videoWidth,
      videoHeight
    )

    const breakFunction = () => {
      ruler.removeEventListener('mousedown', rulerListener)
      this._removeBackground()

      this.showVideo(originalStyles.video)
      this.showGazer(originalStyles.gaze)
      this.showFaceOverlay(originalStyles.faceOverlay)
      this.gazeTracker.webgazer.showFaceFeedbackBox(true)

      Object.assign(document.querySelector('#webgazerVideoContainer').style, {
        height: originalStyles.videoHeight,
        width: originalStyles.videoWidth,
        opacity: originalStyles.opacity,
        left: '10px',
        bottom: '10px',
        borderRadius: '0px',
      })

      Object.assign(document.querySelector('#webgazerVideoFeed').style, {
        height: originalStyles.videoHeight,
        width: originalStyles.videoWidth,
        top: 'unset',
        transform: 'scale(-1, 1)',
        transformOrigin: 'unset',
      })

      originalStyles.video = false
      originalStyles.videoWidth = 0
      originalStyles.videoHeight = 0
      originalStyles.opacity = 1
      originalStyles.gaze = false
      originalStyles.faceOverlay = false

      unbindKeys(bindKeysFunction)
    }

    const finishFunction = () => {
      if (offsetPixel !== -100) {
        const PDData = {
          value: (offsetPixel * 2.54) / screenPPI,
          timestamp: new Date(),
        }
        this.PDData = PDData

        breakFunction()
        callback()
      }
    }

    // if (callback && typeof callback === 'function') callback()
    const bindKeysFunction = bindKeys({
      Escape: breakFunction,
      ' ': finishFunction,
    })
  })
}

/* -------------------------------------------------------------------------- */
/*                                    Video                                   */
/* -------------------------------------------------------------------------- */

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
  opacity: 1,
  gaze: false,
  faceOverlay: false,
}

const videoWidthFactor = 0.9
const videoHeightFactor = 0.3

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
    ((window.innerWidth * videoHeightFactor) / parseInt(video.style.width)) *
    parseInt(video.style.height)

  originalStyles.videoWidth = container.style.width
  originalStyles.videoHeight = container.style.height
  originalStyles.opacity = container.style.opacity
  // Container
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

  // Video feed
  Object.assign(video.style, {
    height: (h * videoWidthFactor) / videoHeightFactor + 'px',
    width: window.innerWidth * videoWidthFactor + 'px',
    top: -h * (videoWidthFactor - videoHeightFactor) + 'px',
    transform: 'scale(-2, 2)',
    transformOrigin: 'center',
  })

  originalStyles.video = RC.gazeTracker.webgazer.params.showVideo
  originalStyles.gaze = RC.gazeTracker.webgazer.params.showGazeDot
  originalStyles.faceOverlay = RC.gazeTracker.webgazer.params.showFaceOverlay
  console.log('video')
  if (!originalStyles.video) RC.showVideo(true)
  if (originalStyles.gaze) RC.showGazer(false)
  if (originalStyles.faceOverlay) RC.showFaceOverlay(false)
  RC.gazeTracker.webgazer.showFaceFeedbackBox(false)

  return [window.innerWidth * videoWidthFactor, h]
}

/* -------------------------------------------------------------------------- */
/*                                    Ruler                                   */
/* -------------------------------------------------------------------------- */

const sidePadding = 30 // Paddings (px) on both sides of the ruler

let offsetPixel = -100 // !

const setupRuler = (RC, screenPPI, vWidth, vHeight) => {
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
    borderBottom: '7px solid #bb6600',
  })

  RC.background.appendChild(rulerElement)

  const scales = document.createElement('div')
  scales.id = 'rc-ruler-scales'
  rulerElement.appendChild(scales)

  const totalCM =
    ((rulerElement.clientWidth - sidePadding * 2) * 2.54) / screenPPI
  for (let i = 0; i <= toFixedNumber(totalCM, 1) * 10; i++) {
    let thisScale = document.createElement('div')
    let left = (0.1 * i * screenPPI) / 2.54 + 'px' // Offset from zero
    thisScale.className =
      'rc-ruler-scale ' +
      (i % 10 === 0
        ? 'rc-ruler-major'
        : i % 5 === 0
        ? 'rc-ruler-secondary'
        : 'rc-ruler-minor')
    thisScale.style.left = left
    scales.appendChild(thisScale)

    if (i % 10 === 0) {
      let thisText = document.createElement('p')
      thisText.className = 'rc-ruler-scale-text'
      thisText.style.left = left
      thisText.innerHTML = i / 10
      scales.appendChild(thisText)

      if (i === 0) thisText.style.color = colorDarkRed
    }
  }

  // Selection
  let selectionElement = document.createElement('div')
  scales.appendChild(selectionElement)
  selectionElement.outerHTML = Arrow
  selectionElement = document.querySelector('#size-arrow')
  selectionElement.setAttribute('preserveAspectRatio', 'none')
  selectionElement.style.left = '-100px'
  selectionElement.style.top = '40px'

  document.getElementById('size-arrow-fill').setAttribute('fill', colorDarkRed)

  const _onDownRuler = e => {
    selectionElement.style.left = (offsetPixel = e.offsetX - 30) + 'px'

    const _onMoveRuler = e => {
      selectionElement.style.left = (offsetPixel = e.offsetX - 30) + 'px'
    }
    rulerElement.addEventListener('mousemove', _onMoveRuler)
    rulerElement.addEventListener('mouseup', function _() {
      rulerElement.removeEventListener('mousemove', _onMoveRuler)
      rulerElement.removeEventListener('mouseup', _)
    })
  }

  rulerElement.addEventListener('mousedown', _onDownRuler)

  return [rulerElement, _onDownRuler]
}

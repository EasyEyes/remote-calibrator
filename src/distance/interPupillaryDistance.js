import Swal from 'sweetalert2'

import RemoteCalibrator from '../core'

import {
  blurAll,
  constructInstructions,
  safeExecuteFunc,
  sleep,
  toFixedNumber,
} from '../components/utils'
import { swalInfoOptions } from '../components/swalOptions'
import Arrow from '../media/arrow.svg'
import PD from '../media/pd.png?width=240&height=120'
import { bindKeys, unbindKeys } from '../components/keyBinder'
import { addButtons } from '../components/buttons'
import { setDefaultVideoPosition } from '../components/video'
import { phrases } from '../i18n'

// let selfVideo = false // No WebGazer video available and an extra video element needs to be created

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

RemoteCalibrator.prototype._measurePD = async function (
  options = {},
  callback,
) {
  ////
  if (!this.checkInitialized()) return
  blurAll()
  ////

  options = Object.assign(
    {
      fullscreen: false,
      headline: '👁️ ' + phrases.RC_nearPointTitle[this.L],
      description: phrases.RC_nearPointIntro[this.L],
      shortDescription: phrases.RC_nearPointIntro[this.L],
    },
    options,
  )

  this.getFullscreen(options.fullscreen)

  await sleep(1000)

  this._replaceBackground()
  this._replaceBackground(
    constructInstructions(options.headline, options.shortDescription, true),
  )
  const screenPpi = this.screenPpi
    ? this.screenPpi.value
    : this._CONST.N.PPI_DONT_USE

  let [videoWidth, videoHeight] = setupVideo(this)
  let [ruler, rulerListener] = setupRuler(
    this,
    screenPpi,
    videoWidth,
    videoHeight,
  )

  const RC = this

  const breakFunction = (toBreak = true) => {
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
      borderRadius: '5px',
    })
    setDefaultVideoPosition(
      RC,
      document.querySelector('#webgazerVideoContainer'),
    )

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

    if (!RC._trackingSetupFinishedStatus.distance && toBreak) {
      RC._trackingSetupFinishedStatus.distance = true
      RC.endDistance()
    }

    unbindKeys(bindKeysFunction)
  }

  const finishFunction = () => {
    if (offsetPixel !== -100) {
      const newPDData = {
        value: (offsetPixel * 2.54) / screenPpi,
        timestamp: performance.now(),
      }
      this.newPDData = newPDData

      breakFunction(false)
      return safeExecuteFunc(callback, newPDData)
    }
  }

  const bindKeysFunction = bindKeys({
    Escape: breakFunction,
    Enter: finishFunction,
    ' ': finishFunction,
  })
  addButtons(
    this.L,
    this.background,
    {
      go: finishFunction,
      cancel: breakFunction,
    },
    this.params.showCancelButton,
  )

  // TODO To be removed
  setTimeout(() => {
    Swal.fire({
      ...swalInfoOptions(this, { showIcon: false }),
      icon: undefined,
      imageUrl: PD,
      imageWidth: 480,
      imageAlt: 'Measurement Instruction',
      html: options.description,
    })
  }, 700)
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
      document.querySelector('#webgazerVideoContainer'),
    )
  }
}

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
  const newContainerStyle = {
    height: Math.round(h) + 'px',
    width: Math.round(window.innerWidth * videoWidthFactor) + 'px',
    opacity: 1,
    borderRadius: '15px',
  }
  Object.assign(container.style, newContainerStyle)

  if (RC.isMobile.value) {
    Object.assign(container.style, {
      right:
        Math.round(0.5 * window.innerWidth * (1 - videoWidthFactor)) + 'px',
      top: Math.round(0.5 * (window.innerHeight - h)) + 'px',
    })
  } else {
    Object.assign(container.style, {
      left: Math.round(0.5 * window.innerWidth * (1 - videoWidthFactor)) + 'px',
      bottom: Math.round(0.5 * (window.innerHeight - h)) + 'px',
    })
  }

  // Canvas
  // Object.assign(canvas.style, {
  //   height: h + 'px',
  //   width: window.innerWidth / 2 + 'px',
  // })

  // Video feed
  const newVideoStyle = {
    height: Math.round((h * videoWidthFactor) / videoHeightFactor) + 'px',
    width: Math.round(window.innerWidth * videoWidthFactor) + 'px',
    top: Math.round(-h * (videoWidthFactor - videoHeightFactor)) + 'px',
    transform: 'scale(-2, 2)',
    transformOrigin: 'center',
  }
  Object.assign(video.style, newVideoStyle)

  originalStyles.video = RC.gazeTracker.webgazer.params.showVideo
  originalStyles.gaze = RC.gazeTracker.webgazer.params.showGazeDot
  originalStyles.faceOverlay = RC.gazeTracker.webgazer.params.showFaceOverlay

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

const setupRuler = (RC, screenPpi, vWidth, vHeight) => {
  const rulerElement = document.createElement('div')
  rulerElement.id = 'rc-ruler'
  Object.assign(rulerElement.style, {
    height: (0.9 * (window.innerHeight - vHeight)) / 2 + 'px',
    width: 2 * window.innerWidth + 'px',
    left: 0.25 * (window.innerWidth - vWidth) + 'px',
    bottom: 0,
    backgroundColor: '#FFD523dd',
    borderRadius: '7px 0 0 0',
    boxSizing: 'border-box',
    borderBottom: '5px solid #bb6600',
  })

  RC.background.appendChild(rulerElement)

  const scales = document.createElement('div')
  scales.id = 'rc-ruler-scales'
  rulerElement.appendChild(scales)

  const totalCm =
    ((rulerElement.clientWidth - sidePadding * 2) * 2.54) / screenPpi
  for (let i = 0; i <= toFixedNumber(totalCm, 1) * 10; i++) {
    let thisScale = document.createElement('div')
    let left = (0.1 * i * screenPpi) / 2.54 + 'px' // Offset from zero
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

      if (i === 0) thisText.style.color = RC._CONST.COLOR.DARK_RED
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

  document
    .getElementById('size-arrow-fill')
    .setAttribute('fill', RC._CONST.COLOR.DARK_RED)

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

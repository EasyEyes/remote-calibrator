import webgazer from './WebGazer/src/index.mjs'

import RemoteCalibrator from './core'

import {
  addBackground,
  constructInstructions,
  getFullscreen,
  removeBackground,
  shuffle,
  toFixedNumber,
} from './helpers'
import { gazeCalibrationDotDefault, debug } from './constants'
import { checkWebgazerReady } from './video'

// [Wait!], etc.
const instPOutsideWarning = 'Keep your face centered in the video feed.'

RemoteCalibrator.prototype.trackGaze = function (options = {}, callback) {
  /**
   * options -
   *
   * fullscreen: [Boolean]
   * showGazer: [Boolean]
   * greedyLearner: [Boolean] If false, stop learning after calibration process // TODO
   * showVideo: [Boolean]
   * pipWidthPX: [208]
   * showFaceOverlay: [Boolean]
   * calibrationCount: [Number] Default 5
   * decimalPlace: [Number] Default 2
   * checkAccuracy: [Boolean] // TODO
   * leastRequiredAccuracy: [Boolean] // TODO
   * headline: [String]
   * description: [String]
   *
   */

  const that = this

  options = Object.assign(
    {
      fullscreen: true,
      showGazer: true,
      pipWidthPX: 208,
      greedyLearner: true,
      showVideo: true,
      showFaceOverlay: false,
      calibrationCount: 5,
      decimalPlace: 1, // As the system itself has a high prediction error, it's not necessary to be too precise here
      headline: '👀 Live Gaze Tracking',
      description:
        'With your help, we’ll track your gaze. When asked, please grant permission to access your camera. \nPlease try to keep your face centered in the live video feed. \nFollow the instructions below.',
    },
    options
  )
  // Fullscreen
  if (options.fullscreen && !debug) getFullscreen()

  const toFixedN = options.decimalPlace

  const background = addBackground(
    constructInstructions(options.headline, options.description)
  )

  /* Video - using native WebGazer video element right now */
  // const [video, vC, vCtx] = addVideoElementsToBody()
  // const projectVideoToCanvas = () => {
  //   drawVideoOnCanvas(video, vCtx, vC.width, vC.height)
  //   requestAnimationFrame(projectVideoToCanvas)
  // }
  // startVideo(video, (stream) => {
  //   formatVideoCanvas(vC, stream, options.pipWidthPX)
  //   requestAnimationFrame(projectVideoToCanvas)
  // })

  // Add instructions
  const instP = document.createElement('p')
  instP.id = 'gaze-system-instruction'
  instP.className = 'float-instruction'
  instP.innerHTML = 'Loading... Please wait.' // Init
  background.appendChild(instP)

  // TODO Handle the second entry of the program
  // ! WebGazer
  ////
  webgazer.clearData()
  window.saveDataAcrossSessions = false
  ////
  webgazer.showVideo(options.showVideo)
  webgazer.showFaceOverlay(options.showFaceOverlay)
  webgazer.showPredictionPoints(options.showGazer)

  webgazer
    .setGazeListener(d => {
      // ! Put data into data and callback function
      if (d) {
        if (callback)
          callback(
            (that.gazePositionData = {
              value: {
                x: toFixedNumber(d.x, toFixedN),
                y: toFixedNumber(d.y, toFixedN),
              },
              timestamp: new Date(),
            })
          )
      }
    })
    .begin()

  checkWebgazerReady(options, webgazer, () => {
    // instP
    instP.innerHTML = instPOutsideWarning
    startCalibration(background, instP, options, onCalibrationEnded)
  })

  const onCalibrationEnded = () => {
    // TODO Check accuracy and re-calibrate if needed
    removeBackground()
    // webgazer.end()
  }
}

const startCalibration = (bg, p, options, onCalibrationEnded) => {
  p.innerHTML += `\nTo calibrate the system for your eyes, please click on the <b style="color: #ff005c">Pink</b> dot at each location that it visits until the dot disappears.`
  new GazeCalibrationDot(document.body, options, onCalibrationEnded)
}

class GazeCalibrationDot {
  constructor(parent, options, endCalibrationCallback) {
    // Order
    this._randomOrder()

    this.position = this.order.shift()
    this.r = gazeCalibrationDotDefault.r

    // HTML div
    this.div = document.createElement('div')
    this.div.className = 'gaze-calibration-dot'
    this.clickDiv = document.createElement('div')
    this.clickDiv.className = 'gaze-calibration-dot-click'
    this.div.appendChild(this.clickDiv)

    Object.assign(this.div.style, {
      width: this.r + 'px',
      height: this.r + 'px',
      borderRadius: this.r / 2 + 'px',
    })
    Object.assign(this.clickDiv.style, {
      width: this.r - gazeCalibrationDotDefault.border + 'px',
      height: this.r - gazeCalibrationDotDefault.border + 'px',
      borderRadius: (this.r - gazeCalibrationDotDefault.border) / 2 + 'px',
      top: `${gazeCalibrationDotDefault.border / 2}px`,
      left: `${gazeCalibrationDotDefault.border / 2}px`,
    })

    this.parent = parent
    parent.appendChild(this.div)
    this.placeDot()

    this.clickThreshold = debug ? 1 : options.calibrationCount // How many times required to click for each position
    this.clicks = 0

    this.clickDiv.addEventListener('click', this.takeClick.bind(this), false)
    this.endCalibrationCallback = endCalibrationCallback
  }

  placeDot() {
    // Width
    Object.assign(
      this.div.style,
      [
        { left: gazeCalibrationDotDefault.margin + 'px', right: 'unset' }, // 0
        {
          left: `calc(50% - ${gazeCalibrationDotDefault.r / 2}px)`,
          right: 'unset',
        }, // 1
        { right: gazeCalibrationDotDefault.margin + 'px', left: 'unset' }, // 2
      ][this.position[0]],
      [
        { top: gazeCalibrationDotDefault.margin + 'px', bottom: 'unset' }, // 0
        {
          top: `calc(50% - ${gazeCalibrationDotDefault.r / 2}px)`,
          bottom: 'unset',
        }, // 1
        { bottom: gazeCalibrationDotDefault.margin + 'px', top: 'unset' }, // 2
      ][this.position[1]]
    )
  }

  takeClick() {
    this.clicks++
    if (this.clicks >= this.clickThreshold) {
      if (this.order.length) {
        this.position = this.order.shift()
        this.placeDot()
        this.clicks = 0
      } else {
        // Finish calibration
        this.deleteSelf()
      }
    }
  }

  deleteSelf() {
    this.clickDiv.removeEventListener('click', this.takeClick, false)
    this.parent.removeChild(this.div)

    // onCalibrationEnded
    this.endCalibrationCallback()
  }

  _randomOrder() {
    this.order = []
    for (let i of [0, 1, 2]) for (let j of [0, 1, 2]) this.order.push([i, j])
    shuffle(this.order)
  }
}

/* -------------------------------------------------------------------------- */

class GazeTracker {
  constructor(WG) {
    this.webgazer = WG
  }

  begin() {
    this.webgazer.begin()
  }

  end() {
    this.webgazer.end()
  }
}

// Export for interacting with WebGazer outside
RemoteCalibrator.gazeTracker = new GazeTracker(webgazer) // TODO

/* -------------------------------------------------------------------------- */

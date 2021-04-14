import RemoteCalibrator from '../core'

import { constructInstructions, shuffle, blurAll } from '../helpers'
import { gazeCalibrationDotDefault, debug } from '../constants'

// [Wait!], etc.
const instPOutsideWarning = 'Keep your face centered in the video feed.'

export function gazeCalibrationPrepare(RC, options) {
  RC._addBackground(
    constructInstructions(options.headline, options.description)
  )
  RC._constructInstructionElement(
    'gaze-system-instruction',
    'Loading... Please wait.'
  )
}

/**
 * Pop an interface for users to calibrate the gazeTracker
 */
RemoteCalibrator.prototype.calibrateGaze = function (options = {}, callback) {
  ////
  if (!this.gazeTracker.checkInitialized(true)) return
  blurAll()
  ////

  options = Object.assign(
    {
      calibrationCount: 5,
      headline: '👀 Calibrate Gaze',
      description:
        'With your help, we’ll track your gaze. When asked, please grant permission to access your camera. \nPlease try to keep your face centered in the live video feed. \nFollow the instructions below.',
    },
    options
  )

  gazeCalibrationPrepare(this, options)

  this.instructionElement.innerHTML = instPOutsideWarning
  startCalibration(this.instructionElement, options, () => {
    this._removeBackground() // Remove calibration background when the calibration finished
    if (callback && typeof callback === 'function') callback()
  })
}

const startCalibration = (p, options, onCalibrationEnded) => {
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

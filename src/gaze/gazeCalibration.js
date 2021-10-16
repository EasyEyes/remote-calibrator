import RemoteCalibrator from '../core'

import {
  constructInstructions,
  shuffle,
  blurAll,
  safeExecuteFunc,
} from '../components/utils'
import { debug } from '../debug'
import { bindKeys, unbindKeys } from '../components/keyBinder'
import { phrases } from '../i18n'

// [Wait!], etc.
// const instPOutsideWarning = 'Keep your face centered in the video feed.'

const originalStyles = {
  video: false,
  gazer: false,
}

export function gazeCalibrationPrepare(RC, options) {
  if (RC.background)
    RC._replaceBackground(
      constructInstructions(options.headline, options.description)
    )
  else
    RC._addBackground(
      constructInstructions(options.headline, options.description)
    )
  RC._constructFloatInstructionElement(
    'gaze-system-instruction',
    phrases.RC_starting[RC.L]
  )
}

/**
 * Pop an interface for users to calibrate the gazeTracker
 */
RemoteCalibrator.prototype.calibrateGaze = function (options = {}, callback) {
  ////
  if (!this.gazeTracker.checkInitialized('gaze', true)) return
  blurAll()
  ////

  options = Object.assign(
    {
      greedyLearner: false,
      calibrationCount: 5,
      headline: '👀 ' + phrases.RC_gazeTrackingTitle[this.L],
      description: phrases.RC_gazeTrackingIntro[this.L],
    },
    options
  )

  originalStyles.video = this.gazeTracker.webgazer.params.showVideo
  originalStyles.gazer = this.gazeTracker.webgazer.params.showGazeDot
  if (!originalStyles.video) this.showVideo(true)
  if (!originalStyles.gazer) this.showGazer(true)

  this.gazeTracker.webgazer.params.greedyLearner = options.greedyLearner
  gazeCalibrationPrepare(this, options)

  // this.instructionElement.innerHTML = instPOutsideWarning
  const calibrationDot = startCalibration(this, options, () => {
    this._removeBackground() // Remove calibration background when the calibration finished
    unbindKeys(bindKeysFunction)

    safeExecuteFunc(callback, { timestamp: new Date() })
  })

  const breakFunction = () => {
    calibrationDot.deleteSelf(false)
    this._removeBackground()

    this.showVideo(originalStyles.video)
    this.showGazer(originalStyles.gazer)
    originalStyles.video = false
    originalStyles.gazer = false

    if (!this._trackingSetupFinishedStatus.gaze) {
      this._trackingSetupFinishedStatus.gaze = true
      this.endGaze()
    }

    unbindKeys(bindKeysFunction)
  }

  const bindKeysFunction = bindKeys({
    Escape: breakFunction,
  })
}

const startCalibration = (RC, options, onCalibrationEnded) => {
  RC._removeFloatInstructionElement()
  return new GazeCalibrationDot(RC, document.body, options, onCalibrationEnded)
}

class GazeCalibrationDot {
  constructor(RC, parent, options, endCalibrationCallback) {
    // Order
    this._randomOrder()

    this.RC = RC

    this.clickThreshold = debug ? 1 : options.calibrationCount // How many times required to click for each position
    this.clicks = 0

    this.position = this.order.shift()
    this.r = this.RC._CONST.N.GAZE_CALIBRATION.R

    // HTML div
    this.div = document.createElement('div')
    this.div.className = 'gaze-calibration-dot'
    this.clickDiv = document.createElement('div')
    this.clickDiv.className = 'gaze-calibration-dot-click'
    this.div.appendChild(this.clickDiv)

    this.clickText = document.createElement('span')
    this.clickText.className = 'gaze-calibration-dot-text'
    this.clickDiv.appendChild(this.clickText)
    this.clickText.innerHTML = this.clickThreshold

    Object.assign(this.div.style, {
      width: this.r + 'px',
      height: this.r + 'px',
      borderRadius: this.r / 2 + 'px',
    })

    const _b = this.RC._CONST.N.GAZE_CALIBRATION.BORDER
    Object.assign(this.clickDiv.style, {
      width: this.r - _b + 'px',
      height: this.r - _b + 'px',
      borderRadius: (this.r - _b) / 2 + 'px',
      top: `${_b / 2}px`,
      left: `${_b / 2}px`,
    })

    this.parent = parent
    parent.appendChild(this.div)
    this.placeDot()

    this.clickDiv.addEventListener('click', this.takeClick.bind(this), false)
    this.endCalibrationCallback = endCalibrationCallback
  }

  placeDot() {
    // Width
    Object.assign(
      this.div.style,
      [
        {
          left: this.RC._CONST.N.GAZE_CALIBRATION.MARGIN + 'px',
          right: 'unset',
        }, // 0
        {
          left: `calc(50% - ${this.RC._CONST.N.GAZE_CALIBRATION.R / 2}px)`,
          right: 'unset',
        }, // 1
        // { right: this.RC._CONST.N.GAZE_CALIBRATION.MARGIN + 'px', left: 'unset' }, // 2
        {
          left:
            window.innerWidth -
            this.RC._CONST.N.GAZE_CALIBRATION.R -
            this.RC._CONST.N.GAZE_CALIBRATION.MARGIN +
            'px',
          right: 'unset',
        }, // 2
      ][this.position[0]],
      [
        {
          top: this.RC._CONST.N.GAZE_CALIBRATION.MARGIN + 'px',
          bottom: 'unset',
        }, // 0
        {
          top: `calc(50% - ${this.RC._CONST.N.GAZE_CALIBRATION.R / 2}px)`,
          bottom: 'unset',
        }, // 1
        // { bottom: this.RC._CONST.N.GAZE_CALIBRATION.MARGIN + 'px', top: 'unset' }, // 2
        {
          top:
            window.innerHeight -
            this.RC._CONST.N.GAZE_CALIBRATION.R -
            this.RC._CONST.N.GAZE_CALIBRATION.MARGIN +
            'px',
          bottom: 'unset',
        }, // 2
      ][this.position[1]]
    )
  }

  takeClick() {
    this.clicks++
    this.clickText.innerHTML = Number(this.clickText.innerHTML) - 1
    if (this.clicks >= this.clickThreshold) {
      if (this.order.length) {
        this.position = this.order.shift()
        this.clickText.innerHTML = this.clickThreshold
        this.placeDot()
        this.clicks = 0
      } else {
        // Finish calibration
        this.deleteSelf(true)
      }
    }
  }

  deleteSelf(finished = true) {
    this.clickDiv.removeEventListener('click', this.takeClick, false)
    this.parent.removeChild(this.div)

    // onCalibrationEnded
    if (finished) {
      this.RC.showVideo(originalStyles.video)
      this.RC.showGazer(originalStyles.gazer)
      originalStyles.video = false
      originalStyles.gazer = false

      safeExecuteFunc(this.endCalibrationCallback)
      this.RC._trackingSetupFinishedStatus.gaze = true
    }
  }

  _randomOrder() {
    this.order = []
    for (let i of [0, 1, 2]) for (let j of [0, 1, 2]) this.order.push([i, j])
    shuffle(this.order)
  }
}

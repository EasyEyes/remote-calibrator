import tinycolor from 'tinycolor2'

import RemoteCalibrator from '../core'

// import isEqual from 'react-fast-compare'

import {
  constructInstructions,
  shuffle,
  blurAll,
  safeExecuteFunc,
  getClickOrTouchLocation,
} from '../components/utils'
import { debug } from '../debug'
import { bindKeys, unbindKeys } from '../components/keyBinder'
import { phrases } from '../i18n/schema'
import { degToPix } from '../components/converters'
import { crossLH, crossLW } from '../components/onCanvas'

// [Wait!], etc.
// const instPOutsideWarning = 'Keep your face centered in the video feed.'

const originalStyles = {
  video: false,
  gazer: false,
}

export function gazeCalibrationPrepare(RC, options) {
  if (RC.background)
    RC._replaceBackground(
      constructInstructions(options.headline, options.description),
    )
  else
    RC._addBackground(
      constructInstructions(options.headline, options.description),
    )
  RC._constructFloatInstructionElement(
    'gaze-system-instruction',
    phrases.RC_starting[RC.L],
  )
}

/**
 * Pop an interface for users to calibrate the gazeTracker
 */
RemoteCalibrator.prototype.calibrateGaze = function (
  calibrateGazeOptions = {},
  callback = undefined,
) {
  ////
  if (!this.gazeTracker.checkInitialized('gaze', true)) return
  blurAll()
  ////

  const options = Object.assign(
    {
      greedyLearner: false,
      calibrationCount: 1,
      headline: `👀 ${phrases.RC_gazeTrackingTitle[this.L]}`,
      description: phrases.RC_gazeTrackingIntro[this.L],
    },
    calibrateGazeOptions,
  )

  options.nudge = false

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

    safeExecuteFunc(callback, { timestamp: performance.now() })
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
  return new GazeCalibrationDot(
    RC,
    document.body,
    options,
    originalStyles,
    onCalibrationEnded,
  )
}

export class GazeCalibrationDot {
  constructor(RC, parent, options, originalStyles, endCalibrationCallback) {
    // Order
    this._sequentialOrder(options.nudge)
    this.nudge = options.nudge

    this.RC = RC

    this.clickThresholdBase = debug ? 1 : options.calibrationCount
    this.clicks = 0

    this.position = this.order.shift()
    // How many times required to click for each position
    // this.clickThreshold = isEqual(this.position, [1, 1])
    //   ? this.clickThresholdBase * 2
    //   : this.clickThresholdBase
    this.clickThreshold = this.clickThresholdBase

    this.r = this.RC._CONST.N.GAZE_CALIBRATION.R

    // HTML div
    // this.div = document.createElement('div')
    // this.div.className = 'gaze-calibration-dot'
    // this.clickDiv = document.createElement('div')
    // this.clickDiv.className = 'gaze-calibration-dot-click'
    // this.div.appendChild(this.clickDiv)
    // this.clickText = document.createElement('span')
    // this.clickText.className = 'gaze-calibration-dot-text'
    // this.clickDiv.appendChild(this.clickText)
    // this.clickText.innerHTML = this.clickThreshold
    this.div = document.createElement('div')
    const crosshairV = document.createElement('div')
    const crosshairH = document.createElement('div')
    this.div.className = 'rc-crosshair'
    this.div.id = 'rc-crosshair'
    crosshairV.className = 'rc-crosshair-component rc-crosshair-vertical'
    crosshairH.className = 'rc-crosshair-component rc-crosshair-horizontal'
    crosshairH.style.height = crosshairV.style.width = `${crossLH}px`
    crosshairH.style.width = crosshairV.style.height = `${crossLW}px`

    this.div.style.background = RC.params.backgroundColor
    const bgColor = tinycolor(RC.params.backgroundColor).toRgb()
    this.div.style.background = `rgba(${bgColor.r}, ${bgColor.g}, ${bgColor.b}, 0.75)`

    this.div.appendChild(crosshairV)
    this.div.appendChild(crosshairH)

    // Object.assign(this.div.style, {
    //   width: this.r + 'px',
    //   height: this.r + 'px',
    //   borderRadius: this.r / 2 + 'px',
    // })

    // const _b = this.RC._CONST.N.GAZE_CALIBRATION.BORDER
    // Object.assign(this.clickDiv.style, {
    //   width: this.r - _b + 'px',
    //   height: this.r - _b + 'px',
    //   borderRadius: (this.r - _b) / 2 + 'px',
    //   top: `${_b / 2}px`,
    //   left: `${_b / 2}px`,
    // })

    this.parent = parent
    this.parent.appendChild(this.div)
    this.placeDot()

    this.handleClick = this.takeClick.bind(this)
    this.div.addEventListener('click', this.handleClick, false)

    this.originalStyles = originalStyles
    this.endCalibrationCallback = endCalibrationCallback

    // return this.div
  }

  placeDot() {
    // Width
    Object.assign(
      this.div.style,
      // x
      [
        {
          left: `${this.RC._CONST.N.GAZE_CALIBRATION.MARGIN}px`,
          right: 'unset',
        }, // 0
        {
          left: `calc(50% - ${this.RC._CONST.N.GAZE_CALIBRATION.R / 2}px)`,
          right: 'unset',
        }, // 1
        // { right: this.RC._CONST.N.GAZE_CALIBRATION.MARGIN + 'px', left: 'unset' }, // 2
        {
          left: `${
            window.innerWidth -
            this.RC._CONST.N.GAZE_CALIBRATION.R -
            this.RC._CONST.N.GAZE_CALIBRATION.MARGIN
          }px`,
          right: 'unset',
        }, // 2
        {
          left: `calc(50% - ${
            this.RC._CONST.N.GAZE_CALIBRATION.R / 2
          }px - ${this.getOffsetPx(
            this.RC._CONST.N.GAZE_CALIBRATION.CENTER_EXTRA_CHECK_OFFSET,
          )}px)`,
          right: 'unset',
        }, // 3
        {
          left: `calc(50% - ${
            this.RC._CONST.N.GAZE_CALIBRATION.R / 2
          }px + ${this.getOffsetPx(
            this.RC._CONST.N.GAZE_CALIBRATION.CENTER_EXTRA_CHECK_OFFSET,
          )}px)`,
          right: 'unset',
        }, // 4
        {
          left: `calc(50% - ${
            this.RC._CONST.N.GAZE_CALIBRATION.R / 2
          }px - ${this.getOffsetPx(
            this.RC._CONST.N.GAZE_CALIBRATION.MID_EXTRA_CHECK_OFFSET,
            window.innerWidth * 0.3,
          )}px)`,
          right: 'unset',
        }, // 5
        {
          left: `calc(50% - ${
            this.RC._CONST.N.GAZE_CALIBRATION.R / 2
          }px + ${this.getOffsetPx(
            this.RC._CONST.N.GAZE_CALIBRATION.MID_EXTRA_CHECK_OFFSET,
            window.innerWidth * 0.3,
          )}px)`,
          right: 'unset',
        }, // 6
      ][this.position[0]],
      // y
      [
        {
          top: `${this.RC._CONST.N.GAZE_CALIBRATION.MARGIN}px`,
          bottom: 'unset',
        }, // 0
        {
          top: `calc(50% - ${this.RC._CONST.N.GAZE_CALIBRATION.R / 2}px)`,
          bottom: 'unset',
        }, // 1
        // { bottom: this.RC._CONST.N.GAZE_CALIBRATION.MARGIN + 'px', top: 'unset' }, // 2
        {
          top: `${
            window.innerHeight -
            this.RC._CONST.N.GAZE_CALIBRATION.R -
            this.RC._CONST.N.GAZE_CALIBRATION.MARGIN
          }px`,
          bottom: 'unset',
        }, // 2
        {
          top: `calc(50% - ${
            this.RC._CONST.N.GAZE_CALIBRATION.R / 2
          }px - ${this.getOffsetPx(
            this.RC._CONST.N.GAZE_CALIBRATION.CENTER_EXTRA_CHECK_OFFSET,
          )}px)`,
          bottom: 'unset',
        }, // 3
        {
          top: `calc(50% - ${
            this.RC._CONST.N.GAZE_CALIBRATION.R / 2
          }px + ${this.getOffsetPx(
            this.RC._CONST.N.GAZE_CALIBRATION.CENTER_EXTRA_CHECK_OFFSET,
          )}px)`,
          bottom: 'unset',
        }, // 4
        {
          top: `calc(50% - ${
            this.RC._CONST.N.GAZE_CALIBRATION.R / 2
          }px - ${this.getOffsetPx(
            this.RC._CONST.N.GAZE_CALIBRATION.MID_EXTRA_CHECK_OFFSET,
            window.innerHeight * 0.3,
          )}px)`,
          bottom: 'unset',
        }, // 5
        {
          top: `calc(50% - ${
            this.RC._CONST.N.GAZE_CALIBRATION.R / 2
          }px + ${this.getOffsetPx(
            this.RC._CONST.N.GAZE_CALIBRATION.MID_EXTRA_CHECK_OFFSET,
            window.innerHeight * 0.3,
          )}px)`,
          bottom: 'unset',
        }, // 6
      ][this.position[1]],
    )
  }

  takeClick(e) {
    if (this.clickAtCenter(e)) {
      this.clicks++
      // this.clickText.innerHTML = Number(this.clickText.innerHTML) - 1
      if (this.clicks >= this.clickThreshold) {
        if (this.order.length) {
          this.position = this.order.shift()

          // this.clickThreshold = isEqual(this.position, [1, 1])
          //   ? this.clickThresholdBase * 2
          //   : this.clickThresholdBase
          this.clickThreshold = this.clickThresholdBase
          // this.clickText.innerHTML = this.clickThreshold

          this.placeDot()
          this.clicks = 0
        } else {
          // Finish calibration
          this.deleteSelf(true)
        }
      }

      // try leader line
      const leaderLines = document.querySelectorAll('.leader-line')
      if (leaderLines)
        leaderLines.map(l => {
          l.style.opacity = 0
        })
    }
  }

  deleteSelf(finished = true) {
    this.div.removeEventListener('click', this.handleClick, false)
    this.parent.removeChild(this.div)

    // onCalibrationEnded
    if (finished) {
      if (!this.nudge) this.RC.showVideo(this.originalStyles.video)
      if (!this.nudge) this.originalStyles.video = false
      this.RC.showGazer(this.originalStyles.gazer)
      this.originalStyles.gazer = false

      safeExecuteFunc(this.endCalibrationCallback)
      if (!this.nudge) this.RC._trackingSetupFinishedStatus.gaze = true
    }
  }

  clickAtCenter(e) {
    const { x, y } = getClickOrTouchLocation(e)
    const { left, top, right, bottom } = this.div.getBoundingClientRect()
    const center = {
      x: (left + right) / 2,
      y: (top + bottom) / 2,
    }
    const offsetAllowed = 5
    return (
      x >= center.x - offsetAllowed &&
      x <= center.x + offsetAllowed &&
      y >= center.y - offsetAllowed &&
      y <= center.y + offsetAllowed
    )
  }

  _randomOrder() {
    this.order = []
    for (const i of [0, 1, 2])
      for (const j of [0, 1, 2]) this.order.push([i, j])
    shuffle(this.order)
  }

  _sequentialOrder(nudge = false) {
    /**
     * [0, 0]                    [1, 0]                    [2, 0]
     *
     * [0, 1]    [5, 5]          [1, 5]          [6, 5]
     *
     *                           [1, 3]
     * [0, 1]    [5, 1]    [3, 1][1, 1][4, 1]    [6, 1]    [2, 1]
     *                           [1, 4]
     *
     * [0, 1]    [5, 6]          [1, 6]          [6, 6]
     *
     * [0, 2]                    [1, 2]                    [2, 2]
     */

    if (nudge) {
      this.order = [
        [1, 1],
        [1, 3],
        [4, 1],
        [1, 4],
        [3, 1],
        [1, 1], // new round
        [1, 4],
        [4, 1],
        [1, 3],
        [3, 1],
        [1, 1],
      ]
      return
    }

    this.order = debug
      ? [
          [0, 0],
          [2, 0],
          [2, 2],
          [0, 2],
          [1, 1],
        ]
      : [
          [1, 1], // new round
          [1, 0],
          [2, 0],
          [2, 1],
          [2, 2],
          [1, 2],
          [0, 2],
          [0, 1],
          [0, 0],
          [1, 1], // new round
          [1, 2],
          [2, 2],
          [2, 1],
          [2, 0],
          [1, 0],
          [0, 0],
          [0, 1],
          [0, 2],
          [1, 1], // new round
          [1, 5],
          [6, 5],
          [6, 1],
          [6, 6],
          [1, 6],
          [5, 6],
          [5, 1],
          [5, 5],
          [1, 1], // new round
          [1, 6],
          [6, 6],
          [6, 1],
          [6, 5],
          [1, 5],
          [5, 5],
          [5, 1],
          [5, 6],
          [1, 1], // new round
          [1, 4],
          [4, 1],
          [1, 3],
          [3, 1],
          [1, 1], // new round
          [1, 3],
          [4, 1],
          [1, 4],
          [3, 1],
          [1, 1],
        ]
  }

  getOffsetPx(degFromCenter, cap = null) {
    const pix = degToPix(
      degFromCenter,
      this.RC.screenPpi
        ? this.RC.screenPpi.value
        : this.RC._CONST.N.PPI_DONT_USE,
      this.RC.viewingDistanceCm
        ? this.RC.viewingDistanceCm.value
        : this.RC._CONST.N.VIEW_DIST_DONT_USE,
    )

    if (cap) return Math.min(pix, cap)
    return pix
  }
}

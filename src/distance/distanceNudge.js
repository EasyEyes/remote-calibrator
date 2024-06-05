import RemoteCalibrator from '../core'
import { bindKeys, unbindKeys } from '../components/keyBinder'
import { phrases } from '../i18n/schema'
import { addButtons } from '../components/buttons'
import { sleep } from '../components/utils'

RemoteCalibrator.prototype.nudgeDistance = function (
  cancelable = false,
  allowRecalibrate = true,
  trackingConfig,
) {
  ////
  if (!this.checkInitialized()) return
  ////
  const { distanceDesired, distanceAllowedRatio } = this._distanceTrackNudging

  if (!distanceDesired) return

  if (
    this.viewingDistanceCm &&
    this.viewingDistanceCm.method === this._CONST.VIEW_METHOD.F
  ) {
    if (
      !withinRange(
        this.viewingDistanceCm.value,
        distanceDesired,
        distanceAllowedRatio,
      )
    ) {
      // ! Out of range
      const breakFunction = () => {
        // In range, remove the nudger, not break/end the whole system
        this._removeNudger()
        clearInterval(this._distanceTrackNudging.distanceCorrecting)
        this._distanceTrackNudging.distanceCorrecting = null

        unbindKeys(bindKeysFunction)
      }

      const restartViewingDistanceTracking = async () => {
        this.endDistance()
        this._addBackground()
        await sleep(2000)
        this.trackDistance(
          trackingConfig.options,
          trackingConfig.callbackStatic,
          trackingConfig.callbackTrack,
        )
      }

      // Bind keys
      const bindKeysFunction = bindKeys(
        cancelable
          ? {
              Escape: this.endNudger,
            }
          : {},
      )

      if (
        this._distanceTrackNudging.distanceCorrecting === null &&
        this._distanceTrackNudging.distanceCorrectEnabled
      ) {
        // ! Start
        const [moveElement, guideNumNow, guideNumDesired] =
          startCorrecting(this)

        let buttonConfig = cancelable
          ? {
              cancel: () => {
                this.endNudger()
              },
            }
          : {}

        if (allowRecalibrate) {
          buttonConfig = {
            ...buttonConfig,
            // TODO double check the callback function here
            custom: {
              callback: restartViewingDistanceTracking,
              content: phrases.RC_distanceTrackingRedo[this.L],
            },
          }
        }

        if (cancelable || allowRecalibrate)
          addButtons(
            this.L,
            this.nudger,
            buttonConfig,
            this.params.showCancelButton,
          )

        const _update = () => {
          moveElement.innerHTML = getMoveInner(
            this,
            this.viewingDistanceCm.value,
            distanceDesired,
          )
          guideNumNow.innerHTML = Math.round(this.viewingDistanceCm.value)
          guideNumDesired.innerHTML = Math.round(distanceDesired)
        }
        _update()

        this._distanceTrackNudging.distanceCorrecting = setInterval(() => {
          _update()

          // Check again
          if (
            withinRange(
              this.viewingDistanceCm.value,
              distanceDesired,
              distanceAllowedRatio,
            )
          ) {
            breakFunction()
            unbindKeys(bindKeysFunction)
          }
        }, 200)
      } else if (
        this._distanceTrackNudging.distanceCorrecting &&
        !this._distanceTrackNudging.distanceCorrectEnabled
      ) {
        breakFunction()
      }
      return false
    } else {
      // ! In range
      return true
    }
  } else {
    console.error(
      'You need to start tracking viewing distance before checking it.',
    )
    return false
  }
}

const withinRange = (value, target, toleranceRatio) => {
  if (!validateAllowedRatio(toleranceRatio)) return false
  const b1 = target * toleranceRatio
  const b2 = target / toleranceRatio
  return value <= Math.max(b1, b2) && value >= Math.min(b1, b2)
}

const startCorrecting = RC => {
  RC._addNudger(`<div id="rc-distance-correct">
  <p id="rc-distance-correct-instruction"></p>
  <p id="rc-distance-correct-guide">${phrases.RC_distanceTrackingGuide[RC.L]
    .replace(
      'xx1',
      `<span class="rc-distance-num rc-distance-now" id="rc-distance-now"></span>`,
    )
    .replace(
      'xx2',
      `<span class="rc-distance-num rc-distance-desired" id="rc-distance-desired"></span>`,
    )}</p>
</div>
  `)

  return [
    document.querySelector('#rc-distance-correct-instruction'),
    document.querySelector('#rc-distance-now'),
    document.querySelector('#rc-distance-desired'),
  ]
}

const getMoveInner = (RC, value, target) => {
  if (value >= target) return phrases.RC_distanceTrackingMoveCloser[RC.L]
  else return phrases.RC_distanceTrackingMoveFurther[RC.L]
}

const validateAllowedRatio = ratio => {
  if (isNaN(ratio)) return false
  return ratio > 0 && ratio !== 1
}

RemoteCalibrator.prototype.setDistanceDesired = function (
  d,
  allowedRatio = null,
) {
  this._distanceTrackNudging.distanceDesired = d
  if (allowedRatio && validateAllowedRatio(allowedRatio))
    this._distanceTrackNudging.distanceAllowedRatio = allowedRatio
  return d
}

RemoteCalibrator.prototype._addNudger = function (inner) {
  if (this.nudger !== null) return

  let b = document.getElementById('calibration-nudger')
  if (!b) {
    b = document.createElement('div')
    b.id = 'calibration-nudger'
    b.className = 'calibration-nudger' + ` rc-lang-${this.LD.toLowerCase()}`

    document.body.classList.add('lock-view')
    document.body.appendChild(b)

    b.style.background = this.params.backgroundColor
  }

  if (inner) b.innerHTML = inner
  this._nudger.element = b

  return this.nudger
}

RemoteCalibrator.prototype._removeNudger = function () {
  const b = document.getElementById('calibration-nudger')
  if (b) {
    document.body.classList.remove('lock-view')
    document.body.removeChild(b)

    this._nudger = {
      element: null,
    }
    // There is a nudger and remove successfully
    return true
  }
  // Cannot find the nudger
  return false
}

RemoteCalibrator.prototype.pauseNudger = function () {
  document.body.classList.add('hide-nudger')
}

RemoteCalibrator.prototype.resumeNudger = function () {
  document.body.classList.remove('hide-nudger')
}

RemoteCalibrator.prototype.endNudger = function () {
  if (!this._distanceTrackNudging.distanceCorrectEnabled) return false
  this._removeNudger()
  // NOT back to init state
  this._distanceTrackNudging.distanceCorrectEnabled = false
  // Back to init state
  if (this._distanceTrackNudging.distanceCorrecting)
    clearInterval(this._distanceTrackNudging.distanceCorrecting)
  this._distanceTrackNudging.distanceCorrecting = null
  this._distanceTrackNudging.distanceDesired = null
  this._distanceAllowedRatio = null

  return true
}

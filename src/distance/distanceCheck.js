import RemoteCalibrator from '../core'
import { bindKeys, unbindKeys } from '../components/keyBinder'
import { phrases } from '../i18n'
import { addButtons } from '../components/buttons'

RemoteCalibrator.prototype.checkDistance = function (
  desiredCm,
  errorTolerance
) {
  ////
  if (!this.checkInitialized()) return
  ////

  if (!desiredCm) return

  if (
    this.viewingDistanceCm &&
    this.viewingDistanceCm.method === this._CONST.VIEW_METHOD.F
  ) {
    if (!withinRange(this.viewingDistanceCm.value, desiredCm, errorTolerance)) {
      // ! Out of range
      if (this._trackingStatus.distanceCorrecting === null) {
        const breakFunction = () => {
          this._removeBackground()
          clearInterval(this._trackingStatus.distanceCorrecting)
          this._trackingStatus.distanceCorrecting = null

          unbindKeys(bindKeysFunction)
        }

        // Bind keys
        const bindKeysFunction = bindKeys({
          Escape: breakFunction,
        })

        // ! Start
        const [moveElement, guideNumNow, guideNumDesired] =
          startCorrecting(this)

        addButtons(
          this.L,
          this.background,
          {
            cancel: breakFunction,
          },
          this.params.showCancelButton
        )

        const _update = () => {
          moveElement.innerHTML = getMoveInner(
            this,
            this.viewingDistanceCm.value,
            desiredCm
          )
          guideNumNow.innerHTML = Math.round(this.viewingDistanceCm.value)
          guideNumDesired.innerHTML = Math.round(desiredCm)
        }
        _update()

        this._trackingStatus.distanceCorrecting = setInterval(() => {
          _update()

          // Check again
          if (
            withinRange(this.viewingDistanceCm.value, desiredCm, errorTolerance)
          ) {
            breakFunction()
            unbindKeys(bindKeysFunction)
          }
        }, 250)
      }
      return false
    } else {
      // ! In range
      return true
    }
  } else {
    console.error(
      'You need to start tracking viewing distance before checking it.'
    )
    return false
  }
}

const withinRange = (value, target, tolerance) => {
  tolerance = Math.max(Math.min(Number(tolerance), 1), 0.1)
  return value <= target * (1 + tolerance) && value >= target * (1 - tolerance)
}

const startCorrecting = RC => {
  RC._addBackground(`<div id="rc-distance-correct">
  <p id="rc-distance-correct-instruction"></p>
  <p id="rc-distance-correct-guide">${phrases.RC_distanceTrackingGuide[RC.L]
    .replace(
      'xx1',
      `<span class="rc-distance-num rc-distance-now" id="rc-distance-now"></span>`
    )
    .replace(
      'xx2',
      `<span class="rc-distance-num rc-distance-desired" id="rc-distance-desired"></span>`
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

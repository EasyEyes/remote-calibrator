import RemoteCalibrator from '../core'
import { bindKeys, unbindKeys } from '../components/keyBinder'
import { phrases } from '../i18n/schema'
import { addButtons } from '../components/buttons'
import { sleep } from '../components/utils'

// ── Input-blocking infrastructure for the nudger ──
// When the nudger is visible we intercept ALL user-input events during the
// capture phase so nothing reaches the page underneath (including EasyEyes'
// keypad handler or any other document-level listener).
const _blockedEvents = [
  'keydown',
  'keyup',
  'keypress',
  'mousedown',
  'mouseup',
  'click',
  'dblclick',
  'contextmenu',
  'touchstart',
  'touchend',
  'touchmove',
  'pointerdown',
  'pointerup',
  'pointermove',
  'wheel',
  'input',
  'focus',
  'blur',
]

let _inputBlockers = []

function _blockAllInput() {
  if (_inputBlockers.length > 0) return // already blocking

  _blockedEvents.forEach(eventName => {
    const handler = e => {
      const nudger = document.getElementById('calibration-nudger')
      // Allow events whose target lives inside the nudger (its own buttons)
      if (nudger && nudger.contains(e.target)) return
      e.stopPropagation()
      e.stopImmediatePropagation()
      e.preventDefault()
    }
    // Capture phase = fires before any bubble-phase listener on the page
    document.addEventListener(eventName, handler, true)
    _inputBlockers.push({ eventName, handler })
  })
}

function _unblockAllInput() {
  _inputBlockers.forEach(({ eventName, handler }) => {
    document.removeEventListener(eventName, handler, true)
  })
  _inputBlockers = []
}

RemoteCalibrator.prototype.nudgeDistance = function (
  cancelable, // = false
  allowRecalibrate, // = true
  trackingConfig,
) {
  ////
  if (!this.checkInitialized()) return
  ////
  // const { distanceDesired, distanceAllowedRatio } = this._distanceTrackNudging.

  if (!this._distanceTrackNudging.distanceDesired) return

  // Yaw has priority: if the head-rotation nudger is currently showing, do
  // NOT start (or try to update) a distance nudger on top of it. Tear down
  // any stale distance-nudger state so we cleanly start fresh once the
  // yaw nudger clears.
  if (this._distanceTrackNudging.headRotationCorrecting !== null) {
    if (this._distanceTrackNudging.distanceCorrecting !== null) {
      clearInterval(this._distanceTrackNudging.distanceCorrecting)
      this._distanceTrackNudging.distanceCorrecting = null
    }
    return false
  }

  if (
    this.viewingDistanceCm &&
    this.viewingDistanceCm.method === this._CONST.VIEW_METHOD.F
  ) {
    if (
      this._nudger &&
      !this._nudger.nudgerPaused &&
      !withinRange(
        this.viewingDistanceCm.value,
        this._distanceTrackNudging.distanceDesired,
        this._distanceTrackNudging.distanceAllowedRatio,
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
        const [moveElement, guideNumNow, guideNumDesired, canUseKeypad] =
          startCorrecting(this)

        let buttonConfig = cancelable
          ? {
              cancel: () => {
                this.endNudger()
              },
            }
          : {}

        // Temporarily hide recalibrate button while keeping code intact
        if (allowRecalibrate && false) {
          // Changed from: if (allowRecalibrate) {
          buttonConfig = {
            ...buttonConfig,
            // TODO double check the callback function here
            custom: {
              callback: restartViewingDistanceTracking,
              content: phrases.RC_distanceTrackingRedo[this.L],
            },
          }
        }

        if (cancelable || (allowRecalibrate && false))
          // Changed from: if (cancelable || allowRecalibrate)
          addButtons(
            this.L,
            this.nudger,
            buttonConfig,
            this.params.showCancelButton,
          )

        const _update = () => {
          // Defensive: another nudger (e.g. the yaw nudger) may have
          // replaced #calibration-nudger's contents since this interval
          // was created. Bail out silently rather than crashing.
          if (
            !moveElement ||
            !guideNumNow ||
            !guideNumDesired ||
            !canUseKeypad
          )
            return

          moveElement.innerHTML = getMoveInner(
            this,
            this.viewingDistanceCm.value,
            this._distanceTrackNudging.distanceDesired,
          )

          guideNumNow.innerHTML = !this.viewingDistanceAllowedPreciseBool
            ? Math.round(this.viewingDistanceCm.value)
            : this.viewingDistanceCm.value.toFixed(1)

          guideNumDesired.innerHTML = Math.round(
            this._distanceTrackNudging.distanceDesired,
          )

          if (
            this._distanceTrackNudging.needEasyEyesKeypadBeyondCm &&
            this._distanceTrackNudging.distanceDesired >
              this._distanceTrackNudging.needEasyEyesKeypadBeyondCm
          ) {
            canUseKeypad.innerHTML = ` ${phrases.RC_canUsePhoneKeypad[this.L]}`
          } else {
            canUseKeypad.innerHTML = ''
          }
        }
        _update()

        this._distanceTrackNudging.distanceCorrecting = setInterval(() => {
          _update()

          // Check again
          if (
            withinRange(
              this.viewingDistanceCm.value,
              this._distanceTrackNudging.distanceDesired,
              this._distanceTrackNudging.distanceAllowedRatio,
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
    }

    // ! In range
    return true
  }
  console.error(
    'You need to start tracking viewing distance before checking it.',
  )

  return false
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
  <p id="rc-distance-correct-guide">${phrases.RC_distanceTrackingGuide1[RC.L]
    .replace(
      '[[N11]]',
      `<span class="rc-distance-num rc-distance-now" id="rc-distance-now"></span>`,
    )
    .replace(
      '[[N22]]',
      `<span class="rc-distance-num rc-distance-desired" id="rc-distance-desired"></span>`,
    )}<span class="rc-distance-desired" id="rc-can-use-keypad"></span></p>
</div>
  `)

  return [
    document.querySelector('#rc-distance-correct-instruction'),
    document.querySelector('#rc-distance-now'),
    document.querySelector('#rc-distance-desired'),
    document.querySelector('#rc-can-use-keypad'),
  ]
}

const getMoveInner = (RC, value, target) => {
  if (value >= target) return phrases.RC_distanceTrackingMoveCloser[RC.L]
  return phrases.RC_distanceTrackingMoveFarther[RC.L]
}

const validateAllowedRatio = ratio => {
  if (Number.isNaN(ratio)) return false
  return ratio > 0 && ratio !== 1
}

RemoteCalibrator.prototype.setDistanceDesired = function (
  d,
  allowedRatio = null,
  needEasyEyesKeypadBeyondCm = null,
) {
  this._distanceTrackNudging.distanceDesired = d
  if (needEasyEyesKeypadBeyondCm)
    this._distanceTrackNudging.needEasyEyesKeypadBeyondCm =
      needEasyEyesKeypadBeyondCm
  if (allowedRatio && validateAllowedRatio(allowedRatio))
    this._distanceTrackNudging.distanceAllowedRatio = allowedRatio
  return d
}

/* -------------------------------------------------------------------------- */
/* Head rotation (yaw) nudging                                                 */
/* -------------------------------------------------------------------------- */

const withinAllowedYaw = (yawDeg, allowedDeg) => {
  if (!Number.isFinite(yawDeg) || !Number.isFinite(allowedDeg)) return true
  return Math.abs(yawDeg) <= allowedDeg
}

// Reuse the #rc-distance-correct markup so the head-rotation nudger has the
// exact same layout and typography as the distance nudger: big title on top
// and a localized guide sentence with two huge monospace numbers ([[N1]] =
// current yaw, [[N2]] = allowed yaw).
const startHeadRotationCorrecting = RC => {
  const template =
    (phrases.RC_distanceTrackingRotationGuide &&
      phrases.RC_distanceTrackingRotationGuide[RC.L]) ||
    'Eye tracking works best when you face the screen. Your head is turned [[N1]]° [[DDD]] from straight ahead and must be within [[N2]]°. The study will resume once you are facing the screen again.'

  const guideHTML = template
    .replace(
      '[[N1]]',
      `<span class="rc-distance-num rc-distance-now" id="rc-head-rotation-now"></span>`,
    )
    .replace(
      '[[N2]]',
      `<span class="rc-distance-num rc-distance-desired" id="rc-head-rotation-allowed"></span>`,
    )
    .replace(
      '[[DDD]]',
      `<span class="rc-head-rotation-side" id="rc-head-rotation-side"></span>`,
    )

  RC._addNudger(`<div id="rc-distance-correct">
  <p id="rc-distance-correct-instruction"></p>
  <p id="rc-distance-correct-guide">${guideHTML}</p>
</div>
  `)

  return {
    instructionEl: document.querySelector('#rc-distance-correct-instruction'),
    nowEl: document.querySelector('#rc-head-rotation-now'),
    allowedEl: document.querySelector('#rc-head-rotation-allowed'),
    sideEl: document.querySelector('#rc-head-rotation-side'),
  }
}

const getYawSideLabel = (RC, yawDeg) => {
  const sideKey = yawDeg >= 0 ? 'RC_right' : 'RC_left'
  return (
    (phrases[sideKey] && phrases[sideKey][RC.L]) ||
    (yawDeg >= 0 ? 'right' : 'left')
  )
}

RemoteCalibrator.prototype.nudgeHeadRotation = function (
  cancelable,
  trackingConfig,
) {
  if (!this.checkInitialized()) return
  const state = this._distanceTrackNudging
  if (!state.headRotationCorrectingEnabled) return true

  const allowedDeg = Number.isFinite(state.headRotationAllowedDeg)
    ? state.headRotationAllowedDeg
    : 180
  if (allowedDeg >= 180) return true

  const yawDeg = Number.isFinite(state.headYawDeg) ? state.headYawDeg : 0

  // Yaw has priority over the distance nudger: if the head is rotated too
  // far, always show the "face the screen" overlay — even if a distance
  // nudger is currently visible. In that case we tear the distance nudger
  // down first so this function can own the #calibration-nudger DOM.
  if (withinAllowedYaw(yawDeg, allowedDeg) || this._nudger?.nudgerPaused) {
    return true
  }

  // Nudger already running – nothing more to do; the setInterval keeps the
  // text in sync and tears it down once the head is back within range.
  if (state.headRotationCorrecting !== null) return false

  // If a distance nudger is currently up, dismiss it so we can show yaw.
  if (state.distanceCorrecting !== null) {
    clearInterval(state.distanceCorrecting)
    state.distanceCorrecting = null
  }
  if (this.nudger) {
    // Remove any existing nudger DOM so _addNudger creates fresh yaw markup.
    this._removeNudger()
  }

  // ! Start a new head-rotation nudger. _addNudger (called inside
  // startHeadRotationCorrecting) installs the global capture-phase input
  // blocker, so we don't need our own key blocker here.
  let bindKeysFunction = null

  const breakFunction = () => {
    this._removeNudger()
    if (state.headRotationCorrecting) {
      clearInterval(state.headRotationCorrecting)
      state.headRotationCorrecting = null
    }
    if (bindKeysFunction) unbindKeys(bindKeysFunction)
    state.headRotationCleanup = null
  }

  bindKeysFunction = bindKeys(cancelable ? { Escape: this.endNudger } : {})

  // Expose a cleanup hook so endNudger (and endDistance) can release the
  // key binding even if the nudger is torn down from outside.
  state.headRotationCleanup = () => {
    if (bindKeysFunction) unbindKeys(bindKeysFunction)
  }

  const { instructionEl, nowEl, allowedEl, sideEl } =
    startHeadRotationCorrecting(this)

  if (cancelable) {
    addButtons(
      this.L,
      this.nudger,
      {
        cancel: () => {
          this.endNudger()
        },
      },
      this.params.showCancelButton,
    )
  }

  const _update = () => {
    // Defensive: if the nudger DOM was swapped out (e.g. because another
    // nudger took over), bail silently rather than crashing on innerHTML.
    if (!instructionEl || !nowEl || !allowedEl || !sideEl) return

    const currentYaw = Number.isFinite(state.headYawDeg) ? state.headYawDeg : 0
    instructionEl.innerHTML =
      (phrases.RC_distanceTrackingFaceScreen &&
        phrases.RC_distanceTrackingFaceScreen[this.L]) ||
      'Face the screen'
    nowEl.innerHTML = String(Math.round(Math.abs(currentYaw)))
    allowedEl.innerHTML = String(Math.round(allowedDeg))
    sideEl.innerHTML = getYawSideLabel(this, currentYaw)
  }
  _update()

  state.headRotationCorrecting = setInterval(() => {
    _update()

    if (withinAllowedYaw(state.headYawDeg, allowedDeg)) {
      breakFunction()
    }
  }, 200)

  return false
}

RemoteCalibrator.prototype._addNudger = function (inner) {
  if (this.nudger !== null) return

  let b = document.getElementById('calibration-nudger')
  if (!b) {
    b = document.createElement('div')
    b.id = 'calibration-nudger'
    b.className = `calibration-nudger rc-lang-${this.LD.toLowerCase()}`

    document.body.classList.add('lock-view')
    document.body.appendChild(b)

    b.style.background = this.params.backgroundColor
  }

  if (inner) b.innerHTML = inner
  this._nudger.element = b

  _blockAllInput()

  return this.nudger
}

RemoteCalibrator.prototype._removeNudger = function () {
  _unblockAllInput()

  const b = document.getElementById('calibration-nudger')
  if (b) {
    document.body.classList.remove('lock-view')
    document.body.removeChild(b)

    this._nudger = {
      element: null,
      nudgerPaused: false,
    }
    // There is a nudger and remove successfully
    return true
  }
  // Cannot find the nudger
  return false
}

RemoteCalibrator.prototype.pauseNudger = function () {
  this._nudger.nudgerPaused = true
  document.body.classList.add('hide-nudger')
  _unblockAllInput()
}

RemoteCalibrator.prototype.resumeNudger = function () {
  this._nudger.nudgerPaused = false
  document.body.classList.remove('hide-nudger')
  if (this.nudger) _blockAllInput()
}

RemoteCalibrator.prototype.endNudger = function () {
  const state = this._distanceTrackNudging
  // End if either the distance nudger or the head-rotation nudger is active.
  if (!state.distanceCorrectEnabled && !state.headRotationCorrectingEnabled)
    return false

  this._removeNudger()
  // NOT back to init state
  state.distanceCorrectEnabled = false
  // Back to init state
  if (state.distanceCorrecting) clearInterval(state.distanceCorrecting)
  state.distanceCorrecting = null
  state.distanceDesired = null
  this._distanceAllowedRatio = null

  // Tear down the head-rotation nudger too.
  if (state.headRotationCorrecting) {
    clearInterval(state.headRotationCorrecting)
    state.headRotationCorrecting = null
  }
  if (typeof state.headRotationCleanup === 'function') {
    state.headRotationCleanup()
    state.headRotationCleanup = null
  }
  state.headRotationCorrectingEnabled = false

  return true
}

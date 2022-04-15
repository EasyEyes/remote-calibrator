import RemoteCalibrator from '../core'

import { crossLH, crossLW } from '../components/onCanvas'
import { safeExecuteFunc } from '../components/utils'
import { phrases } from '../i18n'

import Arrow from '../media/arrow.svg'

const originalStyles = {
  // video: false,
  gazer: false,
  gazeLearning: false,
  gazePaused: false,
}

RemoteCalibrator.prototype.nudgeGaze = function (callback) {
  ////
  if (
    !this.checkInitialized() ||
    !this.gazeTracker.checkInitialized('gaze', true)
  )
    return
  ////

  if (this._gazeTrackNudging.isCorrectingGaze) return
  this._gazeTrackNudging.isCorrectingGaze = true

  /* -------------------------------------------------------------------------- */
  let b = document.getElementById('gaze-nudger')
  if (!b) {
    b = document.createElement('div')
    b.id = 'gaze-nudger'
    b.className = 'gaze-nudger' + ` rc-lang-${this.LD.toLowerCase()}`

    document.body.classList.add('lock-view')
    document.body.appendChild(b)

    b.style.background = this.params.backgroundColor
  }

  // float instruction
  const instP = `<p class="float-instruction gaze-nudge-instruction" id="float-instruction">${
    phrases.RC_gazeTrackingNudge[this.L]
  }</p>`

  popNudgeElements(this, b)
  b.innerHTML += instP
  this._nudger.gazeElement = b
  /* -------------------------------------------------------------------------- */

  originalStyles.gazePaused = this._trackingPaused.gaze
  originalStyles.gazer = this.gazeTracker.webgazer.params.showGazeDot
  originalStyles.gazeLearning = this.gazeTracker._learning
  if (originalStyles.gazePaused) this.resumeGaze()
  if (!originalStyles.gazer) this.showGazer(true)
  if (!originalStyles.gazeLearning)
    this.gazeLearning(true, {
      click: true,
      move: false,
    })

  const that = this
  document
    .querySelector('#rc-crosshair')
    .addEventListener('click', function _() {
      if (b) {
        document.querySelector('#rc-crosshair').removeEventListener('click', _)
        b.remove()
        b = null
        that._nudger.gazeElement = null
        document.body.classList.remove('lock-view')

        that.showGazer(originalStyles.gazer)
        that.gazeLearning(originalStyles.gazeLearning)
        if (originalStyles.gazePaused) that.pauseGaze()

        originalStyles.gazer = false
        originalStyles.gazeLearning = false
        originalStyles.gazePaused = false

        that._gazeTrackNudging.isCorrectingGaze = false
        safeExecuteFunc(callback)
      }
    })
}

const popNudgeElements = (RC, parentBackground) => {
  const nE = document.createElement('div')
  nE.className = 'gaze-nudger-elements'

  // crosshair
  const crosshair = document.createElement('div')
  const crosshairV = document.createElement('div')
  const crosshairH = document.createElement('div')
  crosshair.className = 'rc-crosshair'
  crosshair.id = 'rc-crosshair'
  crosshairV.className = 'rc-crosshair-component rc-crosshair-vertical'
  crosshairH.className = 'rc-crosshair-component rc-crosshair-horizontal'
  crosshairH.style.height = crosshairV.style.width = `${crossLH}px`
  crosshairH.style.width = crosshairV.style.height = `${crossLW}px`
  crosshair.appendChild(crosshairV)
  crosshair.appendChild(crosshairH)
  nE.appendChild(crosshair)

  // arrows
  const arrows = document.createElement('div')
  arrows.className = 'rc-gaze-nudger-arrows'
  for (let i = 0; i < 4; i++) {
    const arrow = document.createElement('div')
    arrow.setAttribute('preserveAspectRatio', 'none')
    arrows.appendChild(arrow)
    arrow.outerHTML = Arrow
  }
  nE.appendChild(arrows)

  for (let a in arrows.children) {
    if (isNaN(a)) continue
    const thisArrow = arrows.children[Number(a)]
    thisArrow.style.width = `${crossLW}px`
    thisArrow.style.transform = `translate(0, -50%) rotate(${
      a * 90
    }deg) translate(${1.5 * crossLW}px, 0)`
    thisArrow.style.transformOrigin = `0 50%`
    thisArrow
      .getElementById('size-arrow-fill')
      .setAttribute('fill', RC._CONST.COLOR.DARK_RED)
  }

  parentBackground.appendChild(nE)

  return true
}

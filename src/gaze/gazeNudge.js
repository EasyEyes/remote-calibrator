import RemoteCalibrator from '../core'
import LeaderLine from 'leader-line-new'

// import { crossLH, crossLW } from '../components/onCanvas'
import { safeExecuteFunc } from '../components/utils'
import { phrases } from '../i18n'

// import Arrow from '../media/arrow.svg'
import { GazeCalibrationDot } from './gazeCalibration'

const originalStyles = {
  // video: false,
  gazer: false,
  gazeLearning: false,
  gazePaused: false,
}

const nudgeArrowLeaderLine = { current: null }

RemoteCalibrator.prototype.nudgeGaze = function (options = {}, callback) {
  ////
  if (
    !this.checkInitialized() ||
    !this.gazeTracker.checkInitialized('gaze', true)
  )
    return
  ////

  options = Object.assign(
    {
      showOffset: true,
    },
    options
  )

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
  b.innerHTML += instP

  // gaze fixation
  const calibrationDotEle = popNudgeElements(this, b, callback)

  this._nudger.gazeElement = b

  if (options.showOffset) {
    const fakeDotEle = document.createElement('div')
    fakeDotEle.id = 'fake-gaze-dot'
    fakeDotEle.style.position = 'absolute'
    fakeDotEle.style.left = `${this.gazePositionPx.value.x - 5}px`
    fakeDotEle.style.top = `${this.gazePositionPx.value.y - 5}px`
    fakeDotEle.style.width = '10px'
    fakeDotEle.style.height = '10px'
    fakeDotEle.style.borderRadius = '50%'
    fakeDotEle.style.background = 'transparent'
    fakeDotEle.style.zIndex = '9999999999'
    document.body.appendChild(fakeDotEle)

    nudgeArrowLeaderLine.current = new LeaderLine(
      LeaderLine.pointAnchor(fakeDotEle, {
        x: '50%',
        y: '50%',
      }),
      LeaderLine.pointAnchor(calibrationDotEle, {
        x: '50%',
        y: '50%',
      }),
      {
        path: 'straight',
        color: this._CONST.COLOR.DARK_RED,
        startPlug: 'disc',
      }
    )

    const theLeaderLine = document.querySelector('.leader-line')
    theLeaderLine.style.zIndex = 9999999999
    theLeaderLine.style.opacity = 0.7
    theLeaderLine.style.transitionDuration = '0.2s'
  }
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

  // const that = this
  // document
  //   .querySelector('#rc-crosshair')
  //   .addEventListener('click', function _() {
  //     if (b) {
  //       document.querySelector('#rc-crosshair').removeEventListener('click', _)
  //       b.remove()
  //       b = null
  //       that._nudger.gazeElement = null
  //       document.body.classList.remove('lock-view')

  //       that.showGazer(originalStyles.gazer)
  //       that.gazeLearning(originalStyles.gazeLearning)
  //       if (originalStyles.gazePaused) that.pauseGaze()

  //       originalStyles.gazer = false
  //       originalStyles.gazeLearning = false
  //       originalStyles.gazePaused = false

  //       that._gazeTrackNudging.isCorrectingGaze = false
  //       safeExecuteFunc(callback)
  //     }
  //   })
}

const popNudgeElements = (RC, parentBackground, callback) => {
  // const nE = document.createElement('div')
  // nE.className = 'gaze-nudger-elements'

  return new GazeCalibrationDot(
    RC,
    parentBackground,
    {
      greedyLearner: false,
      calibrationCount: 1,
      nudge: true,
    },
    originalStyles,
    () => {
      parentBackground.remove()
      parentBackground = null
      RC._nudgerElement = null
      document.body.classList.remove('lock-view')

      if (originalStyles.gazePaused) RC.pauseGaze()
      originalStyles.gazePaused = false

      if (nudgeArrowLeaderLine.current) {
        nudgeArrowLeaderLine.current.remove()
        nudgeArrowLeaderLine.current = null
      }

      RC._gazeTrackNudging.isCorrectingGaze = false
      safeExecuteFunc(callback)
    }
  )

  // arrows
  // const arrows = document.createElement('div')
  // arrows.className = 'rc-gaze-nudger-arrows'
  // for (let i = 0; i < 4; i++) {
  //   const arrow = document.createElement('div')
  //   arrow.setAttribute('preserveAspectRatio', 'none')
  //   arrows.appendChild(arrow)
  //   arrow.outerHTML = Arrow
  // }
  // nE.appendChild(arrows)

  // for (let a in arrows.children) {
  //   if (isNaN(a)) continue
  //   const thisArrow = arrows.children[Number(a)]
  //   thisArrow.style.width = `${crossLW}px`
  //   thisArrow.style.transform = `translate(0, -50%) rotate(${
  //     a * 90
  //   }deg) translate(${1.5 * crossLW}px, 0)`
  //   thisArrow.style.transformOrigin = `0 50%`
  //   thisArrow
  //     .getElementById('size-arrow-fill')
  //     .setAttribute('fill', RC._CONST.COLOR.DARK_RED)
  // }

  // parentBackground.appendChild(nE)
}

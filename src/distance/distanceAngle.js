import { checkPermissions } from '../components/mediaPermission'
import {
  average,
  blurAll,
  constructInstructions,
  safeExecuteFunc,
  safeGetVar,
} from '../components/utils'
import RemoteCalibrator from '../core'
import { phrases } from '../i18n'
import {
  getStdDist,
  originalStyles,
  setTrackingOptions,
  startTrackingPupils,
  trackingOptions,
  _tracking,
} from './trackingUtils'
import { debug } from '../debug'
import { LookAtGuide } from '../components/lookAtGuide'
import { iRepeat } from '../components/iRepeat'
import { bindKeys, unbindKeys } from '../components/keyBinder'
import { addButtons } from '../components/buttons'
import { soundFeedback } from '../components/sound'

RemoteCalibrator.prototype.angleDistance = async function (
  options = {},
  callbackStatic,
  callbackTrack = null
) {
  ////
  if (!this.checkInitialized()) return
  blurAll()
  ////

  // Check if there's any screen size data
  if (!this.screenPpi && !debug) {
    console.error('You must calibrate the physical screen size first.')
  }

  options = Object.assign(
    {
      fullscreen: false,
      repeatTesting: 1, // TODO
      pipWidthPx:
        this._CONST.N.VIDEO_W[this.isMobile.value ? 'MOBILE' : 'DESKTOP'],
      showVideo: true,
      showFaceOverlay: false,
      decimalPlace: 1,
      angleAsymmetryThresholdDeg: 5,
      ////
      nearPoint: false,
      showNearPoint: false,
      ////
      headline: '📏 ' + phrases.RC_angleDistanceTitle[this.L],
      description: phrases.RC_angleDistanceIntro[this.L],
      ////
      check: false, // TODO
      checkCallback: null, // TODO
      ////
      showCancelButton: true,
      ////
      track: true, // ! to track distance or just measure once
      framerate: 3, // tracking rate
      ////
      desiredDistanceCm: undefined,
      desiredDistanceTolerance: 1.2,
      desiredDistanceMonitor: false,
      desiredDistanceMonitorCancelable: false,
    },
    options
  )

  // Fullscreen
  this.getFullscreen(options.fullscreen)

  /* -------------------------------------------------------------------------- */

  if (this.gazeTracker.checkInitialized('distance')) {
    // ! Initialized
    this.gazeTracker._toFixedN = options.decimalPlace
    this.showNearPoint(options.showNearPoint)
    this.showVideo(options.showVideo)
    this.showFaceOverlay(options.showFaceOverlay)

    // TODO Attach new callbackTrack
    return
  }

  // Add UI
  this._addBackground()
  this._constructFloatInstructionElement(
    'gaze-system-instruction',
    phrases.RC_starting[this.L]
  )

  // Permissions
  await checkPermissions(this)

  // STEP 2 - Live estimate
  // function getStdDist() {}

  // STEP 1 - Turn around for the first estimate
  const originalGazer = this.gazeTracker.webgazer.params.showGazeDot
  setTrackingOptions(options)
  originalStyles.video = options.showVideo

  const _ = async () => {
    this._addBackground()
    this._replaceBackground(
      constructInstructions(options.headline, options.description, false)
    )

    if (this.gazeTracker.checkInitialized('gaze', false)) this.showGazer(false)

    await turningAroundTest(this, options, distData => {
      getStdDist(this, distData, originalGazer, callbackStatic)
    })
  }

  // init the tracker for later use
  this.gazeTracker._init(
    {
      toFixedN: 1,
      showVideo: true,
      showFaceOverlay: options.showFaceOverlay,
    },
    'distance'
  )

  this._trackingSetupFinishedStatus.distance = false

  const trackingConfig = {
    options: options,
    callbackStatic: callbackStatic,
    callbackTrack: callbackTrack,
  }

  if (options.nearPoint) {
    await startTrackingPupils(
      this,
      () => {
        return this._measurePD({}, _)
      },
      callbackTrack,
      trackingConfig,
      _tracking
    )
  } else {
    await startTrackingPupils(
      this,
      _, // beforeCallbackTrack
      callbackTrack, // callbackTrack
      trackingConfig, // trackingConfig
      _tracking // _tracking
    )
  }
}

// gain init result
const turningAroundTest = async (RC, options, callback) => {
  const video = document.querySelector('#webgazerVideoFeed')
  const model = await RC.gazeTracker.webgazer.getTracker().model

  const rawMeasures = []

  const targetCount = 5 // collecting 5 frames for ONE estimate
  let distCount = 1 // count for collected frames
  let averageAngleDeg = 0 // keep track of average of ONE estimate

  const iRepeatOptionsForAngleSetup = { framerate: 20, break: true }

  const ppi = RC.screenPpi ? RC.screenPpi.value : RC._CONST.N.PPI_DONT_USE

  const stages = [
    {
      name: 'center',
      position: [0.5, 0.5],
    },
    {
      name: 'left',
      position: [0, 0.5],
    },
    {
      name: 'center',
      position: [0.5, 0.5],
    },
    {
      name: 'right',
      position: [1, 0.5],
    },
  ]

  let currentStageIndex = 0
  let currentStage = stages[currentStageIndex]
  let startCollectingThisStage = false

  const lookAtGuide = new LookAtGuide(
    RC,
    RC.background,
    {
      x: currentStage.position[0],
      y: currentStage.position[1],
    },
    'Look<br />Here'
  )

  const resultsByStage = {}

  const readyInPosition = () => {
    startCollectingThisStage = true
  }

  // ! breakFunction
  const breakFunction = () => {
    // break the measuring loop
    iRepeatOptionsForAngleSetup.break = true
    iRepeatOptionsForAngleSetup.framerate = 20

    lookAtGuide.remove()
    RC._removeBackground()

    // always turn off video here as it's on every time
    RC._trackingSetupFinishedStatus.distance = true
    if (RC.gazeTracker.checkInitialized('distance', false)) RC.endDistance()

    unbindKeys(bindKeysFunction)
  }

  // ! finishFunction
  const finishFunction = async result => {
    iRepeatOptionsForAngleSetup.break = true
    iRepeatOptionsForAngleSetup.framerate = 20

    const data = (RC.newViewingDistanceData = {
      value: safeGetVar(result),
      timestamp: performance.now(),
      method: RC._CONST.VIEW_METHOD.T,
      raw: { ...rawMeasures },
    })

    if (!options.track) {
      breakFunction()
    } else {
      // no need to remove background, which will be removed
      // in _tracking()

      unbindKeys(bindKeysFunction)
    }

    if (options.check)
      await RC._checkDistance(
        callback,
        data,
        'angleDistance',
        options.track, // isTrackMethod
        options.checkCallback
      )
    // ! callback
    else safeExecuteFunc(callback, data)
  }

  // ! bindKeysFunction
  const bindKeysFunction = bindKeys({
    Escape: options.showCancelButton ? breakFunction : undefined,
    Enter: readyInPosition,
    ' ': readyInPosition,
  })

  addButtons(
    RC.L,
    RC.background,
    {
      go: readyInPosition,
      cancel: options.showCancelButton ? breakFunction : undefined,
    },
    RC.params.showCancelButton
  )

  const useNextStage = () => {
    soundFeedback()

    currentStage = stages[currentStageIndex]
    lookAtGuide.moveTo({
      x: currentStage.position[0],
      y: currentStage.position[1],
    })

    startCollectingThisStage = false
    distCount = 1
    averageAngleDeg = 0
  }

  const measuring = async () => {
    if (startCollectingThisStage) {
      const faces = await model.estimateFaces(video)

      if (faces.length) {
        const mesh = faces[0].mesh
        if (targetCount === distCount) {
          averageAngleDeg += _getAngleDeg(mesh[133], mesh[362])
          averageAngleDeg /= targetCount

          if (resultsByStage[currentStage.name] === undefined)
            resultsByStage[currentStage.name] = []
          resultsByStage[currentStage.name].push(averageAngleDeg)

          // record raw measures
          rawMeasures.push({
            averageAngleDeg: averageAngleDeg,
            targetDirection: currentStage.name,
            frameCount: targetCount,
            ppi: ppi,
            timestamp: performance.now(),
          })

          // go to next stage if unfinished
          currentStageIndex++
          if (currentStageIndex < stages.length) {
            useNextStage()
          } else {
            // check for asymmetric results
            if (!_validateAsymmetry(resultsByStage)) {
              // results from left turn and right turn are too different
              // keep collecting
              currentStageIndex = 0
              useNextStage()
            } else {
              // ! got dist data
              finishFunction(_getDistByAngle(RC, ppi, resultsByStage))
            }
          }
        } else {
          averageAngleDeg += _getAngleDeg(mesh[133], mesh[362])
          ++distCount
        }
      }
    }
  }

  iRepeatOptionsForAngleSetup.break = false
  iRepeatOptionsForAngleSetup.framerate =
    targetCount * trackingOptions.framerate // Default 5 * 3
  iRepeat(measuring, iRepeatOptionsForAngleSetup)
}

/* -------------------------------------------------------------------------- */

const _getAngleDeg = (a, b) => {
  return (
    (Math.atan(Math.abs(b[2] - a[2]) / Math.abs(b[0] - a[0])) * 180) / Math.PI
  )
}

const _getDistByAngle = (RC, ppi, resultsByStage) => {
  const aveAngle =
    (average(resultsByStage.left) + average(resultsByStage.right)) / 2
  return (
    (2.54 * (RC.windowWidthPx.value / 2)) /
    ppi /
    Math.tan((aveAngle * Math.PI) / 180)
  )
}

const _validateAsymmetry = (resultsByStage, angleAsymmetryThresholdDeg) => {
  if (debug) return true
  return (
    Math.abs(average(resultsByStage.left) - average(resultsByStage.right)) <
      angleAsymmetryThresholdDeg && Math.abs(average(resultsByStage.center)) < 1
  )
}

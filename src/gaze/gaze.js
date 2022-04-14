import RemoteCalibrator from '../core'

import { blurAll, safeExecuteFunc } from '../components/utils'
import { gazeCalibrationPrepare } from './gazeCalibration'
import { checkPermissions } from '../components/mediaPermission'
import { phrases } from '../i18n'

RemoteCalibrator.prototype.trackGaze = async function (
  options = {},
  callbackOnCalibrationEnd = null,
  callbackTrack = null
) {
  /**
   * options -
   *
   * fullscreen: [Boolean]
   * showGazer: [Boolean]
   * greedyLearner: [Boolean] If false, stop learning after calibration process // TODO
   * showVideo: [Boolean]
   * pipWidthPx: [208]
   * showFaceOverlay: [Boolean]
   * calibrationCount: [Number] Default 5
   * decimalPlace: [Number] Default 0
   * thresholdDeg: [Number] or 'none'
   * headline: [String]
   * description: [String]
   *
   */

  ////
  if (!this.checkInitialized()) return
  blurAll()
  ////

  options = Object.assign(
    {
      fullscreen: false,
      greedyLearner: false, // ! New 0.0.5
      framerate: 30, // ! New 0.0.5
      showGazer: true,
      showVideo: true,
      pipWidthPx:
        this._CONST.N.VIDEO_W[this.isMobile.value ? 'MOBILE' : 'DESKTOP'],
      showFaceOverlay: false,
      calibrationCount: 5,
      thresholdDeg: 10, // minAccuracy
      decimalPlace: 0, // As the system itself has a high prediction error, it's not necessary to be too precise here
      headline: '👀 ' + phrases.RC_gazeTrackingTitle[this.L],
      description: phrases.RC_gazeTrackingIntro[this.L],
    },
    options
  )

  // Fullscreen
  this.getFullscreen(options.fullscreen)

  if (this.gazeTracker.checkInitialized('gaze')) {
    // ! Initialized
    // e.g., called the function before
    // Just try to begin running again
    this.gazeTracker._toFixedN = options.decimalPlace
    this.showGazer(options.showGazer)
    this.showVideo(options.showVideo)
    this.showFaceOverlay(options.showFaceOverlay)

    this.gazeTracker.attachNewCallback(callbackTrack)
    this.gazeTracker.defaultGazeCallback = callbackTrack
    return
  }

  // ! Not initialized
  // Init - Begin -  Calibrate - Start running
  this._addBackground()

  // Permissions
  await checkPermissions(this)
  ////

  // Init
  this.gazeTracker._init(
    {
      greedyLearner: options.greedyLearner,
      framerate: options.framerate,
      toFixedN: options.decimalPlace,
      showVideo: options.showVideo,
      showFaceOverlay: options.showFaceOverlay,
      showGazer: options.showGazer,
    },
    'gaze'
  )

  gazeCalibrationPrepare(this, options)

  // Begin
  const gazeTrackerBeginOptions = {
    pipWidthPx: options.pipWidthPx,
  }
  const calibrateGazeOptions = {
    greedyLearner: options.greedyLearner,
    calibrationCount: options.calibrationCount,
    headline: options.headline,
    description: options.description,
  }
  this.gazeTracker.begin(gazeTrackerBeginOptions, () => {
    this._trackingSetupFinishedStatus.gaze = false
    this.calibrateGaze(calibrateGazeOptions, onCalibrationEnded)
  })

  // Calibration

  const onCalibrationEnded = data => {
    safeExecuteFunc(callbackOnCalibrationEnd, data)

    // ! greedyLearner
    if (!this.gazeTracker.webgazer.params.greedyLearner) {
      // stop all by default
      this.gazeTracker.stopLearning({ click: true, move: true })
    }

    // TODO Test accuracy
    const testAccuracy = false
    if (options.thresholdDeg === 'none' || !testAccuracy) {
      this.gazeTracker.attachNewCallback(callbackTrack)
      this.gazeTracker.defaultGazeCallback = callbackTrack
      return
    } else {
      if (
        !this.getGazeAccuracy(
          {
            thresholdDeg: options.thresholdDeg,
          },
          () => {
            // Success
            // Start running
            this.gazeTracker.attachNewCallback(callbackTrack)
            this.gazeTracker.defaultGazeCallback = callbackTrack
          },
          () => {
            // Fail to meet the min accuracy
            this.calibrateGaze(calibrateGazeOptions, onCalibrationEnded)
          }
        )
      ) {
        console.error(
          'Failed to finish gaze accuracy measurement due to error.'
        )
        this.gazeTracker.attachNewCallback(callbackTrack)
        this.gazeTracker.defaultGazeCallback = callbackTrack
      }
    }
  }
}

RemoteCalibrator.prototype.getGazeNow = async function (callback = null) {
  if (
    !this.checkInitialized() ||
    !this.gazeTracker.checkInitialized('gaze', true) ||
    !this.gazeTracker.webgazer.params.paused ||
    !this._trackingPaused.gaze
  )
    return

  let c = callback || this.gazeTracker.defaultGazeCallback

  return await this.gazeTracker.getGazeNow(c)
}

RemoteCalibrator.prototype.pauseGaze = function () {
  if (
    !this.gazeTracker.checkInitialized('gaze', true) &&
    this._trackingPaused.gaze
  )
    return
  this._trackingPaused.gaze = true
  this.gazeTracker.pause()
}

RemoteCalibrator.prototype.resumeGaze = function () {
  if (
    !this.gazeTracker.checkInitialized('gaze', true) &&
    !this._trackingPaused.gaze
  )
    return
  this._trackingPaused.gaze = false
  this.gazeTracker.resume()
}

RemoteCalibrator.prototype.endGaze = function (endAll = false) {
  if (!this.gazeTracker.checkInitialized('gaze', true)) return
  this._trackingPaused.gaze = false
  this.gazeTracker.end('gaze', endAll)
}

/* -------------------------------------------------------------------------- */

RemoteCalibrator.prototype.gazeLearning = function (learn = true, options) {
  options = Object.assign(
    {
      click: true,
      move: true,
    },
    options
  )
  learn
    ? this.gazeTracker.startLearning(options)
    : this.gazeTracker.stopLearning(options)
}

/* -------------------------------------------------------------------------- */

RemoteCalibrator.prototype.showGazer = function (show = true) {
  if (this.gazeTracker.checkInitialized('gaze', false)) {
    this.gazeTracker.showGazer(show)
  }
}

RemoteCalibrator.prototype.showVideo = function (show = true) {
  if (this.gazeTracker.checkInitialized('', false)) {
    this.gazeTracker.showVideo(show)
  }
}

RemoteCalibrator.prototype.showFaceOverlay = function (show = true) {
  if (this.gazeTracker.checkInitialized('gaze', false)) {
    this.gazeTracker.showFaceOverlay(show)
  }
}

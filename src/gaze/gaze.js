import RemoteCalibrator from '../core'

import { blurAll } from '../helpers'
import { gazeCalibrationPrepare } from './gazeCalibration'
import text from '../text.json'

RemoteCalibrator.prototype.trackGaze = function (options = {}, callback) {
  /**
   * options -
   *
   * fullscreen: [Boolean]
   * showGazer: [Boolean]
   * greedyLearner: [Boolean] If false, stop learning after calibration process // TODO
   * showVideo: [Boolean]
   * pipWidthPX: [208]
   * showFaceOverlay: [Boolean]
   * calibrationCount: [Number] Default 5
   * decimalPlace: [Number] Default 2
   * checkAccuracy: [Boolean] // TODO
   * leastRequiredAccuracy: [Boolean] // TODO
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
      fullscreen: true,
      showGazer: true,
      pipWidthPX: 208,
      greedyLearner: true,
      showVideo: true,
      showFaceOverlay: false,
      calibrationCount: 5,
      decimalPlace: 1, // As the system itself has a high prediction error, it's not necessary to be too precise here
      headline: text.trackGaze.headline,
      description: text.trackGaze.description,
    },
    options
  )

  // Fullscreen
  this.getFullscreen(options.fullscreen)

  if (this.gazeTracker.checkInitialized()) {
    // ! Initialized
    // e.g., called the function before
    // Just try to begin running again
    this.gazeTracker._toFixedN = options.decimalPlace
    this.showGazer(options.showGazer)
    this.showVideo(options.showVideo)
    this.showFaceOverlay(options.showFaceOverlay)

    this.gazeTracker.attachNewCallback(callback)
    return
  }

  // ! Not initialized
  // Init - Begin -  Calibrate - Start running

  // Init
  this.gazeTracker._init({
    toFixedN: options.decimalPlace,
    showVideo: options.showVideo,
    showFaceOverlay: options.showFaceOverlay,
    showGazer: options.showGazer,
  })

  gazeCalibrationPrepare(this, options)

  // Begin
  const gazeTrackerBeginOptions = {
    pipWidthPX: options.pipWidthPX,
  }
  this.gazeTracker.begin(gazeTrackerBeginOptions, () => {
    this.calibrateGaze(
      {
        calibrationCount: options.calibrationCount,
        headline: options.headline,
        description: options.description,
      },
      onCalibrationEnded
    )
  })

  // Calibration

  const onCalibrationEnded = () => {
    // TODO Check accuracy and re-calibrate if needed
    // Start running
    this.gazeTracker.attachNewCallback(callback)
  }
}

RemoteCalibrator.prototype.pauseGaze = function () {
  if (!this.gazeTracker.checkInitialized(true)) return
  this.gazeTracker.pause()
}

RemoteCalibrator.prototype.resumeGaze = function () {
  if (!this.gazeTracker.checkInitialized(true)) return
  this.gazeTracker.resume()
}

/* -------------------------------------------------------------------------- */

RemoteCalibrator.prototype.showGazer = function (show) {
  if (this.gazeTracker.checkInitialized(true)) {
    this.gazeTracker.showGazer(show)
  }
}

RemoteCalibrator.prototype.showVideo = function (show) {
  if (this.gazeTracker.checkInitialized(true)) {
    this.gazeTracker.showVideo(show)
  }
}

RemoteCalibrator.prototype.showFaceOverlay = function (show) {
  if (this.gazeTracker.checkInitialized(true)) {
    this.gazeTracker.showFaceOverlay(show)
  }
}

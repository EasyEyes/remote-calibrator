import RemoteCalibrator from '../core'

import { blurAll } from '../helpers'
import { gazeCalibrationPrepare } from './gazeCalibration'
import text from '../text.json'
import Swal from 'sweetalert2'
import { swalInfoOptions } from '../components/swalOptions'

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
      fullscreen: false,
      showGazer: true,
      pipWidthPX: 208,
      greedyLearner: false, // ! New 0.0.5
      framerate: 30, // ! New 0.0.5
      showVideo: true,
      showFaceOverlay: false,
      calibrationCount: 5,
      thresholdDEG: 10, // minAccuracy
      decimalPlace: 1, // As the system itself has a high prediction error, it's not necessary to be too precise here
      headline: text.calibrateGaze.headline,
      description: text.calibrateGaze.description,
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

    this.gazeTracker.attachNewCallback(callback)
    return
  }

  // ! Not initialized
  // Init - Begin -  Calibrate - Start running
  this._addBackground()
  Swal.fire({
    ...swalInfoOptions,
    html: options.description,
  }).then(() => {
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
      pipWidthPX: options.pipWidthPX,
    }
    const calibrateGazeOptions = {
      calibrationCount: options.calibrationCount,
      headline: options.headline,
      description: options.description,
    }
    this.gazeTracker.begin(gazeTrackerBeginOptions, () => {
      this.calibrateGaze(calibrateGazeOptions, onCalibrationEnded)
    })

    // Calibration

    const onCalibrationEnded = () => {
      if (!this.gazeTracker.webgazer.params.greedyLearner) {
        console.log('kk')
        this.gazeTracker.webgazer.stopLearning()
      }

      if (options.thresholdDEG === 'none') {
        this.gazeTracker.attachNewCallback(callback)
        return
      } else {
        if (
          !this.getGazeAccuracy(
            {
              thresholdDEG: options.thresholdDEG,
            },
            () => {
              // Success
              // Start running
              this.gazeTracker.attachNewCallback(callback)
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
          this.gazeTracker.attachNewCallback(callback)
        }
      }
    }
  })
}

RemoteCalibrator.prototype.pauseGaze = function () {
  if (!this.gazeTracker.checkInitialized('gaze', true)) return
  this.gazeTracker.pause()
}

RemoteCalibrator.prototype.resumeGaze = function () {
  if (!this.gazeTracker.checkInitialized('gaze', true)) return
  this.gazeTracker.resume()
}

/* -------------------------------------------------------------------------- */

RemoteCalibrator.prototype.showGazer = function (show) {
  if (this.gazeTracker.checkInitialized('gaze', true)) {
    this.gazeTracker.showGazer(show)
  }
}

RemoteCalibrator.prototype.showVideo = function (show) {
  if (this.gazeTracker.checkInitialized('gaze', true)) {
    this.gazeTracker.showVideo(show)
  }
}

RemoteCalibrator.prototype.showFaceOverlay = function (show) {
  if (this.gazeTracker.checkInitialized('gaze', true)) {
    this.gazeTracker.showFaceOverlay(show)
  }
}

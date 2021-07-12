import webgazer from '../WebGazer4RC/src/index.mjs'

import { toFixedNumber } from '../helpers'
import { checkWebgazerReady } from '../video'

/**
 * The gaze tracker object to wrap all gaze-related functions
 */
export default class GazeTracker {
  constructor(parent) {
    this.calibrator = parent
    this.webgazer = webgazer

    this.defaultCallback = null

    // ! STATUS
    this._initialized = {
      distance: false,
      gaze: false,
    } // Either viewing distance or gaze
    this._calibrated = false // Gaze only
    this._running = {
      distance: false,
      gaze: false,
    } // Either viewing distance or gaze
    this._runningVideo = false

    this._toFixedN = 1
  }

  begin({ pipWidthPX }, callback) {
    if (this.checkInitialized('gaze', true)) {
      if (!this._running.gaze) {
        this.webgazer.begin()
        this._running.gaze = true
        this._runningVideo = true
      }

      checkWebgazerReady(pipWidthPX, this.webgazer, callback)
    }
  }

  beginVideo({ pipWidthPX }, callback) {
    // Begin video only
    if (this.checkInitialized('distance', true)) {
      if (!this._runningVideo) {
        this.webgazer.beginVideo()
        this._runningVideo = true
      }

      checkWebgazerReady(pipWidthPX, this.webgazer, callback)
    }
  }

  attachNewCallback(callback) {
    if (this.checkInitialized('gaze', true)) {
      this.webgazer.setGazeListener(d => {
        if (d) {
          if (callback)
            callback((this.calibrator.gazePositionData = this.getData(d)))
        }
      })
    }
  }

  async getGazeNow(callback) {
    if (callback)
      callback(
        (this.calibrator.gazePositionData = this.getData(
          await this.webgazer.getCurrentPrediction()
        ))
      )
  }

  end() {
    this.webgazer.end()
  }
}

GazeTracker.prototype._init = function (
  { greedyLearner, framerate, toFixedN, showVideo, showFaceOverlay, showGazer },
  task
) {
  if (!this.checkInitialized(task)) {
    if (task === 'gaze') {
      this.webgazer.clearData()
      this.webgazer.saveDataAcrossSessions(false)
      this.webgazer.params.greedyLearner = greedyLearner
      this.webgazer.params.framerate = framerate
    }

    this._toFixedN = toFixedN
    this.showGazer(showGazer)
    this.showVideo(showVideo)
    this.showFaceOverlay(showFaceOverlay)

    this._initialized[task] = true
  }
}

GazeTracker.prototype.checkInitialized = function (task, warning = false) {
  if (this._initialized[task]) return true
  if (warning)
    console.error(
      'RemoteCalibrator.gazeTracker is not initialized. Use .trackGaze() to initialize.'
    )
  return false
}

GazeTracker.prototype.getData = function (d) {
  return {
    value: {
      x: toFixedNumber(d.x, this._toFixedN),
      y: toFixedNumber(d.y, this._toFixedN),
    },
    timestamp: new Date(),
  }
}

GazeTracker.prototype.pause = function () {
  this.webgazer.pause()
}

GazeTracker.prototype.resume = function () {
  this.webgazer.resume()
}

GazeTracker.prototype.end = function () {
  this.webgazer.end()
  this._runningVideo = false
  this._running.gaze = false
}

GazeTracker.prototype.startStoringPoints = function () {
  this.webgazer.params.storingPoints = true
}

GazeTracker.prototype.stopStoringPoints = function () {
  this.webgazer.params.storingPoints = false
}

/* -------------------------------------------------------------------------- */

GazeTracker.prototype.showGazer = function (show) {
  this.webgazer.showPredictionPoints(show)
}

GazeTracker.prototype.showVideo = function (show) {
  this.webgazer.showVideo(show)
}

GazeTracker.prototype.showFaceOverlay = function (show) {
  this.webgazer.showFaceOverlay(show)
}

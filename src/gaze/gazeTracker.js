import webgazer from '../WebGazer4RC/src/index.mjs'

import { safeExecuteFunc, toFixedNumber } from '../components/utils'
import { checkWebgazerReady } from '../components/video'

/**
 * The gaze tracker object to wrap all gaze-related functions
 */
export default class GazeTracker {
  constructor(parent) {
    this.calibrator = parent
    this.webgazer = webgazer

    this.defaultGazeCallback = null
    this.defaultDistanceTrackCallback = null

    // ! STATUS
    this._initialized = {
      distance: false,
      gaze: false,
    } // Either viewing distance or gaze
    this._learning = true
    this._running = {
      distance: false,
      gaze: false,
    } // Either viewing distance or gaze
    this._runningVideo = false

    this._toFixedN = 1
  }

  begin({ pipWidthPx }, callback) {
    if (this.checkInitialized('gaze', true)) {
      if (!this._running.gaze) {
        this.webgazer.begin()
        this._running.gaze = true
        this._runningVideo = true
      }

      checkWebgazerReady(
        this.calibrator,
        pipWidthPx,
        this.calibrator.params.videoOpacity,
        this.webgazer,
        callback
      )
    }
  }

  beginVideo({ pipWidthPx }, callback) {
    // Begin video only
    if (this.checkInitialized('distance', true)) {
      if (!this._runningVideo) {
        this.webgazer.beginVideo()
        this._runningVideo = true
      }

      checkWebgazerReady(
        this.calibrator,
        pipWidthPx,
        this.calibrator.params.videoOpacity,
        this.webgazer,
        callback
      )
    }
  }

  attachNewCallback(callback) {
    if (this.checkInitialized('gaze', true)) {
      this.webgazer.setGazeListener(d => {
        if (d) {
          const data = (this.calibrator.newGazePositionData = this.getData(d))
          safeExecuteFunc(callback, data)
        }
      })
    }
  }

  async getGazeNow(callback) {
    let data = (this.calibrator.newGazePositionData = this.getData(
      await this.webgazer.getCurrentPrediction()
    ))
    safeExecuteFunc(callback, data)
    return data
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
      // TODO Manually clear data
      // this.webgazer.clearData()
      // this.webgazer.saveDataAcrossSessions(false)
      this.webgazer.params.greedyLearner = greedyLearner
      this.webgazer.params.framerate = framerate
      this.showGazer(showGazer)
    }

    this._toFixedN = toFixedN

    this.showVideo(showVideo)
    this.showFaceOverlay(showFaceOverlay)

    this._initialized[task] = true
  }
}

GazeTracker.prototype.checkInitialized = function (task, warning = false) {
  if (
    task === ''
      ? this._initialized.gaze || this._initialized.distance
      : this._initialized[task]
  )
    return true
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

// Gaze
GazeTracker.prototype.pause = function () {
  this.webgazer.pause()
}

// Gaze
GazeTracker.prototype.resume = function () {
  this.webgazer.resume()
}

GazeTracker.prototype.end = function (type, endAll = false) {
  if (!this.checkInitialized(type, true)) return

  const endEverything =
    endAll || !this._initialized.gaze || !this._initialized.distance

  if (type === 'gaze') {
    this._endGaze()
    if (endEverything && this.checkInitialized('distance'))
      this.calibrator.endDistance(false, false)
  } else {
    // Distance
    this.defaultDistanceTrackCallback = null
    if (endEverything && this.checkInitialized('gaze')) this._endGaze()
  }

  if (endEverything) {
    this._initialized = {
      distance: false,
      gaze: false,
    }
    this._running = {
      distance: false,
      gaze: false,
    }
    this.webgazer.end(true)
    this._runningVideo = false
  } else {
    this._initialized[type] = false
    this._running[type] = false
  }
}

GazeTracker.prototype._endGaze = function () {
  this.webgazer.params.paused = true

  this._learning = true
  this.defaultGazeCallback = null
  this.webgazer.clearData()

  this.webgazer.params.greedyLearner = false
  this.webgazer.params.framerate = 60
}

GazeTracker.prototype.startStoringPoints = function () {
  this.webgazer.params.storingPoints = true
}

GazeTracker.prototype.stopStoringPoints = function () {
  this.webgazer.params.storingPoints = false
}

GazeTracker.prototype.startLearning = function () {
  if (!this._learning) {
    this.webgazer.startLearning()
    this._learning = true
  }
}

GazeTracker.prototype.stopLearning = function () {
  if (this._learning) {
    this.webgazer.stopLearning()
    this._learning = false
  }
}

/* -------------------------------------------------------------------------- */

GazeTracker.prototype.showGazer = function (show) {
  this.webgazer.showPredictionPoints(show)
}

GazeTracker.prototype.showVideo = function (show) {
  this.webgazer.showVideo(show, this.calibrator._params.videoOpacity)
}

GazeTracker.prototype.showFaceOverlay = function (show) {
  this.webgazer.showFaceOverlay(show)
}

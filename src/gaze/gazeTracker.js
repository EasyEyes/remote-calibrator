import webgazer from '../WebGazer/src/index.mjs'

import { toFixedNumber } from '../helpers'
import { checkWebgazerReady } from '../video'

/**
 * The gaze tracker object to wrap all gaze-related functions
 */
export default class GazeTracker {
  constructor(parent) {
    this.calibrator = parent
    this.webgazer = webgazer

    this._initialized = false
    this._calibrated = false
    this._running = false
    this._runningVideo = false

    this._toFixedN = 1
  }

  begin({ pipWidthPX }, callback) {
    if (this.checkInitialized(true)) {
      if (!this._running) {
        this.webgazer.begin()
        this._running = true
        this._runningVideo = true
      }

      checkWebgazerReady(pipWidthPX, this.webgazer, callback)
    }
  }

  beginVideo({ pipWidthPX }, callback) {
    // Begin video only
    if (this.checkInitialized(true)) {
      if (!this._runningVideo) {
        this.webgazer.beginVideo()
        this._runningVideo = true
      }

      checkWebgazerReady(pipWidthPX, this.webgazer, callback)
    }
  }

  attachNewCallback(callback) {
    if (this.checkInitialized(true)) {
      webgazer.setGazeListener(d => {
        if (d) {
          if (callback)
            callback((this.calibrator.gazePositionData = this.getData(d)))
        }
      })
    }
  }

  end() {
    this.webgazer.end()
  }
}

GazeTracker.prototype._init = function ({
  toFixedN,
  showVideo,
  showFaceOverlay,
  showGazer,
}) {
  if (!this.checkInitialized()) {
    this.webgazer.clearData()
    this.webgazer.saveDataAcrossSessions(false)

    this._toFixedN = toFixedN
    this.showGazer(showGazer)
    this.showVideo(showVideo)
    this.showFaceOverlay(showFaceOverlay)

    this._initialized = true
  }
}

GazeTracker.prototype.checkInitialized = function (warning = false) {
  if (this._initialized) return true
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

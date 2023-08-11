import webgazer from '../WebGazer4RC/src/index.mjs'

import { safeExecuteFunc, toFixedNumber } from '../components/utils'
import { checkWebgazerReady } from '../components/video'
import Swal from 'sweetalert2'
import { swalInfoOptions } from '../components/swalOptions'
import { phrases } from '../i18n'

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
        this.webgazer.begin(this.videoFailed.bind(this))
        this._running.gaze = true
        this._runningVideo = true
      }

      checkWebgazerReady(
        this.calibrator,
        pipWidthPx,
        this.calibrator.params.videoOpacity,
        this.webgazer,
        callback,
      )
    }
  }

  beginVideo({ pipWidthPx }, callback) {
    // Begin video only
    if (this.checkInitialized('distance', true)) {
      if (!this._runningVideo) {
        this.webgazer.beginVideo(this.videoFailed.bind(this))
        this._runningVideo = true
      }

      checkWebgazerReady(
        this.calibrator,
        pipWidthPx,
        this.calibrator.params.videoOpacity,
        this.webgazer,
        callback,
      )
    }
  }

  videoFailed(videoInputs) {
    const defaultSwalOptions = swalInfoOptions(this.calibrator, {
      showIcon: true,
    })
    // if (videoInputs.length === 0)
    //   defaultSwalOptions.customClass.htmlContainer =
    //     defaultSwalOptions.customClass.htmlContainer +
    //     ' my__swal2__html__center'

    Swal.fire({
      ...defaultSwalOptions,
      icon: 'error',
      iconColor: this.calibrator._CONST.COLOR.DARK_RED,
      showConfirmButton: false,
      html: videoInputs.length
        ? phrases.RC_errorCameraUseDenied[this.calibrator.L]
        : phrases.RC_errorNoCamera[this.calibrator.L],
    })
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

  async getGazeNow(options = {}, callback) {
    options = Object.assign(
      {
        wait: 0,
        frames: 5,
      },
      options,
    )

    let data = (this.calibrator.newGazePositionData = this.getData(
      await this.webgazer.getCurrentPrediction(0, options.wait, options.frames),
    ))
    this.webgazer.popPredictionPoints()

    safeExecuteFunc(callback, data)
    return data
  }

  end() {
    this.webgazer.end()
  }
}

GazeTracker.prototype._init = function (
  { greedyLearner, framerate, toFixedN, showVideo, showFaceOverlay, showGazer },
  task,
) {
  if (!this.checkInitialized(task)) {
    if (task === 'gaze') {
      // TODO Manually clear data
      // this.webgazer.clearData()
      // this.webgazer.saveDataAcrossSessions(false)
      this.webgazer.params.greedyLearner = greedyLearner
      this.webgazer.params.framerate = framerate
      this.webgazer.params.getLatestVideoFrameTimestamp =
        this._getLatestVideoTimestamp.bind(this)
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

  if (warning) {
    if (task === 'gaze')
      console.error(
        'RemoteCalibrator.gazeTracker is not initialized. Use .trackGaze() to initialize.',
      )
    else if (task === 'distance')
      console.error(
        'RemoteCalibrator.gazeTracker (for distance tracking) is not initialized. Use .trackDistance() to initialize.',
      )
  }

  return false
}

GazeTracker.prototype.getData = function (d) {
  let t = performance.now()
  return {
    value: {
      x: toFixedNumber(d.x, this._toFixedN),
      y: toFixedNumber(d.y, this._toFixedN),
      latencyMs: t - this.calibrator._trackingVideoFrameTimestamps.gaze, // latency
    },
    timestamp: t,
    raw: d.raw ? d.raw : undefined,
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

    this.calibrator._trackingVideoFrameTimestamps.gaze = 0
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

  this.webgazer.params.getLatestVideoFrameTimestamp = () => {}
}

GazeTracker.prototype._getLatestVideoTimestamp = function (t) {
  this.calibrator._trackingVideoFrameTimestamps.gaze = t
}

/* -------------------------------------------------------------------------- */

GazeTracker.prototype.startStoringPoints = function () {
  this.webgazer.params.storingPoints = true
}

GazeTracker.prototype.stopStoringPoints = function () {
  this.webgazer.params.storingPoints = false
}

GazeTracker.prototype.startLearning = function (options) {
  if (!this._learning) {
    this.webgazer.startLearning(options)
    this._learning = true
  }
}

GazeTracker.prototype.stopLearning = function (options) {
  if (this._learning) {
    this.webgazer.stopLearning(options)
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

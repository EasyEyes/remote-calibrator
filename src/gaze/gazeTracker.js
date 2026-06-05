import webgazer from '../WebGazer4RC/src/index.mjs'

import {
  safeExecuteFunc,
  toFixedNumber,
  getFullscreen,
  isFullscreen,
} from '../components/utils'
import { checkWebgazerReady } from '../components/video'
import Swal from 'sweetalert2'
import { swalInfoOptions } from '../components/swalOptions'
import { phrases } from '../i18n/schema'
import { _handlePostCameraResolution } from '../components/popup'

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

    this._cameraDisconnected = false
    this._cameraMonitoringSetUp = false
    this._onDisconnectCallbacks = new Set()
    this._onReconnectCallbacks = new Set()
  }

  begin({ pipWidthPx }, callback) {
    if (this.checkInitialized('gaze', true)) {
      if (!this._running.gaze) {
        this.webgazer.begin(this.videoFailed.bind(this))
        this._running.gaze = true
        this._runningVideo = true
        this.setupCameraMonitoring()
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
        this.setupCameraMonitoring()
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
          const data = this.getData(d)
          this.calibrator.newGazePositionData = data

          safeExecuteFunc(callback, data)
        }
      })
    }
  }

  async getGazeNow(getGazeNowOptions = {}, callback = undefined) {
    const options = Object.assign(
      {
        wait: 0,
        frames: 5,
      },
      getGazeNowOptions,
    )

    const data = this.getData(
      await this.webgazer.getCurrentPrediction(0, options.wait, options.frames),
    )
    this.calibrator.newGazePositionData = data
    this.webgazer.popPredictionPoints()

    safeExecuteFunc(callback, data)
    return data
  }

  end() {
    this.webgazer.end()
  }
}

GazeTracker.prototype._init = function (
  {
    greedyLearner,
    framerate,
    toFixedN,
    showVideo,
    showFaceOverlay,
    showGazer,
    desiredCameraResolution,
    desiredCameraHz,
  },
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

    // Set desired camera resolution and frame rate for both gaze and distance tasks.
    // These are used by findBestCameraMode() in _begin() and setCameraConstraints().
    if (desiredCameraResolution) {
      this.webgazer.params.desiredCameraResolution = desiredCameraResolution
    }
    if (desiredCameraHz != null) {
      this.webgazer.params.desiredCameraHz = desiredCameraHz
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
  const t = performance.now()
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

/* -------------------------------------------------------------------------- */
/*  Camera disconnect / reconnect monitoring                                  */
/* -------------------------------------------------------------------------- */

GazeTracker.prototype.setupCameraMonitoring = function () {
  if (this._cameraMonitoringSetUp) return
  this._cameraMonitoringSetUp = true

  this.webgazer.params.phrases = phrases
  this.webgazer.params.language = this.calibrator.L

  this.webgazer.setOnCameraDisconnected(message => {
    console.warn('GazeTracker: Camera disconnected -', message)
    this._cameraDisconnected = true

    // Remove any stale capture-phase key listener from popups (camera
    // selection, resolution, etc.) that may block keyboard events (e.g.
    // SPACE) after the camera reconnects and the page is restored.
    if (this.calibrator.popupKeydownListener) {
      document.removeEventListener(
        'keydown',
        this.calibrator.popupKeydownListener,
        true,
      )
      this.calibrator.popupKeydownListener = null
    }

    this._onDisconnectCallbacks.forEach(fn => fn(message))
  })

  this.webgazer.setOnCameraReconnected(async () => {
    const vc = document.getElementById('webgazerVideoContainer')
    console.log('GazeTracker: Camera reconnected', {
      showVideoParam: this.webgazer.params.showVideo,
      videoContainerDisplay: vc?.style?.display,
      videoContainerOpacity: vc?.style?.opacity,
      subscriberCount: this._onReconnectCallbacks.size,
    })
    this._cameraDisconnected = false

    // Capture whether a popup (showTestPopup / _handlePostCameraResolution
    // retry) is already waiting for this reconnection. If so, that popup
    // will re-run the camera-selection / resolution flow itself, and we
    // must NOT trigger _handlePostCameraResolution again here, or we'd
    // end up showing the Camera Resolution page twice.
    const popupWillHandle =
      this.calibrator._isWaitingForCameraReconnect === true

    this._onReconnectCallbacks.forEach(fn => fn())

    if (!isFullscreen()) {
      console.log('GazeTracker: Restoring fullscreen after camera reconnection')
      await getFullscreen(this.calibrator.L, this.calibrator)
    }

    // Re-run the resolution-setting code (and re-show the "Camera resolution"
    // page if `_showCameraResolutionBool === true`) on every reconnect, so
    // that the camera ends up at the correct resolution even when the
    // reconnection happens AFTER the participant has already moved past the
    // initial resolution page.
    if (
      !popupWillHandle &&
      this.calibrator._cameraSelectionOptions &&
      typeof _handlePostCameraResolution === 'function'
    ) {
      // Wait for any open Swal (e.g. the reconnection spinner from
      // showCameraReconnectionPopup) to close, so our resolution page
      // does not collide with it.
      let waitedMs = 0
      while (Swal.isVisible() && waitedMs < 5000) {
        await new Promise(r => setTimeout(r, 100))
        waitedMs += 100
      }

      try {
        await _handlePostCameraResolution(
          this.calibrator,
          this.calibrator._cameraSelectionOptions,
        )
      } catch (error) {
        console.error(
          'GazeTracker: _handlePostCameraResolution after reconnect failed',
          error,
        )
      }
    }
  })

  this.webgazer.setOnQuit(() => {
    console.log('GazeTracker: Quit requested from camera reconnect popup')
    if (typeof this.calibrator._onQuitCallback === 'function') {
      this.calibrator._cleanupAllRC()
      this.calibrator._onQuitCallback()
    }
  })
}

/**
 * Register a callback for camera disconnection.
 * @param {Function} fn - Called with (message) when camera disconnects
 * @returns {Function} Unsubscribe function
 */
GazeTracker.prototype.onCameraDisconnected = function (fn) {
  this._onDisconnectCallbacks.add(fn)
  return () => this._onDisconnectCallbacks.delete(fn)
}

/**
 * Register a callback for successful camera reconnection.
 * @param {Function} fn - Called with no args when camera reconnects
 * @returns {Function} Unsubscribe function
 */
GazeTracker.prototype.onCameraReconnected = function (fn) {
  this._onReconnectCallbacks.add(fn)
  return () => this._onReconnectCallbacks.delete(fn)
}

GazeTracker.prototype.isCameraDisconnected = function () {
  return this._cameraDisconnected
}

import RemoteCalibrator from '../core'

import { blindSpotTest } from './distance'
import {
  toFixedNumber,
  constructInstructions,
  blurAll,
  safeExecuteFunc,
} from '../components/utils'
import { iRepeat } from '../components/iRepeat'
import { phrases } from '../i18n'
import { spaceForLanguage } from '../components/language'
import { checkPermissions } from '../components/mediaPermission'
import {
  averageDist,
  distCount,
  eyeDist,
  getStdDist,
  iRepeatOptions,
  nearPointDot,
  originalStyles,
  readyToGetFirstData,
  resetTrackingOptions,
  setTrackingOptions,
  startTrackingPupils,
  stdDist,
  stdFactor,
  trackingOptions,
  viewingDistanceTrackingFunction,
  _getNearPoint,
  _tracking,
} from './trackingUtils'

RemoteCalibrator.prototype.trackDistance = async function (
  options = {},
  callbackStatic,
  callbackTrack
) {
  /**
   * options -
   *
   * fullscreen: [Boolean]
   * repeatTesting: 1
   * pipWidthPx: [208]
   *
   * (Interface)
   * headline: [String]
   * description: [String]
   *
   */

  ////
  if (!this.checkInitialized()) return
  blurAll()
  ////

  let description
  if (options.control !== undefined && options.control === false)
    description = phrases.RC_viewingDistanceIntroLiMethod[this.L]
  else description = phrases.RC_viewingDistanceIntro[this.L]

  options = Object.assign(
    {
      fullscreen: false,
      repeatTesting: 1,
      sparkle: false,
      pipWidthPx:
        this._CONST.N.VIDEO_W[this.isMobile.value ? 'MOBILE' : 'DESKTOP'],
      showVideo: true,
      showFaceOverlay: false,
      decimalPlace: 1,
      framerate: 3, // tracking rate
      desiredDistanceCm: undefined,
      desiredDistanceTolerance: 1.2,
      desiredDistanceMonitor: false,
      desiredDistanceMonitorCancelable: false,
      nearPoint: false,
      showNearPoint: false,
      control: true, // CONTROL (EasyEyes) or AUTOMATIC (Li et al., 2018)
      headline: '📏 ' + phrases.RC_distanceTrackingTitle[this.L],
      description:
        phrases.RC_distanceTrackingIntroStart[this.L] +
        spaceForLanguage(this.L) +
        description +
        spaceForLanguage(this.L) +
        phrases.RC_distanceTrackingIntroEnd[this.L],
      showDescription: false,
      check: false,
      checkCallback: null,
      showCancelButton: true,
    },
    options
  )

  /* -------------------------------------------------------------------------- */

  this.getFullscreen(options.fullscreen)

  if (this.gazeTracker.checkInitialized('distance')) {
    // ! Initialized
    this.gazeTracker._toFixedN = options.decimalPlace
    this.showNearPoint(options.showNearPoint)
    this.showVideo(options.showVideo)
    this.showFaceOverlay(options.showFaceOverlay)

    // TODO Attach new callbackTrack
    return
  }

  this._addBackground()
  this._constructFloatInstructionElement(
    'gaze-system-instruction',
    phrases.RC_starting[this.L]
  )

  // Permissions
  await checkPermissions(this)
  ////

  // STEP 2 - Live estimate
  // function getStdDist() {}

  /* -------------------------------------------------------------------------- */

  // STEP 1 - Calibrate for live estimate
  const originalGazer = this.gazeTracker.webgazer.params.showGazeDot
  const _ = async () => {
    this._addBackground()
    this._replaceBackground(
      constructInstructions(
        options.headline,
        options.showDescription ? options.description : null,
        true,
        'rc-hang-description'
      )
    )

    if (this.gazeTracker.checkInitialized('gaze', false)) this.showGazer(false)
    blindSpotTest(this, options, true, distData => {
      getStdDist(this, distData, originalGazer, callbackStatic)
    })
  }

  setTrackingOptions(options)

  originalStyles.video = options.showVideo

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
    startTrackingPupils(
      this,
      () => {
        return this._measurePD({}, _)
      },
      callbackTrack,
      trackingConfig,
      _tracking
    )
  } else {
    startTrackingPupils(this, _, callbackTrack, trackingConfig, _tracking)
  }
}

/* -------------------------------------------------------------------------- */

RemoteCalibrator.prototype.pauseDistance = function () {
  if (
    this.gazeTracker.checkInitialized('distance', true) &&
    !this._trackingPaused.distance
  ) {
    iRepeatOptions.break = true
    if (nearPointDot.current) nearPointDot.current.style.display = 'none'
    this._trackingVideoFrameTimestamps.distance = 0

    this._trackingPaused.distance = true
    this.pauseNudger() // 0.6.0

    return this
  }
  return null
}

RemoteCalibrator.prototype.resumeDistance = function () {
  if (
    this.gazeTracker.checkInitialized('distance', true) &&
    this._trackingPaused.distance
  ) {
    iRepeatOptions.break = false
    if (nearPointDot.current) nearPointDot.current.style.display = 'block'

    averageDist.current = 0
    distCount.current = 1
    this._trackingVideoFrameTimestamps.distance = 0

    iRepeat(viewingDistanceTrackingFunction.current, iRepeatOptions)

    this._trackingPaused.distance = false
    this.resumeNudger() // 0.6.0

    return this
  }
  return null
}

RemoteCalibrator.prototype.endDistance = function (endAll = false, _r = true) {
  if (this.gazeTracker.checkInitialized('distance', true)) {
    iRepeatOptions.break = true
    iRepeatOptions.framerate = 20

    resetTrackingOptions()

    stdDist.current = null
    stdFactor.current = null
    viewingDistanceTrackingFunction.current = null

    readyToGetFirstData.current = false
    this._trackingVideoFrameTimestamps.distance = 0
    this._trackingPaused.distance = false

    // Near point
    if (nearPointDot.current) {
      document.body.removeChild(nearPointDot.current)
      nearPointDot.current = null
    }

    // Nudger
    this.endNudger()

    if (_r) this.gazeTracker.end('distance', endAll)
    return this
  }
  return null
}

RemoteCalibrator.prototype.getDistanceNow = async function (callback = null) {
  if (
    !this.checkInitialized() ||
    !this.gazeTracker.checkInitialized('distance', true) ||
    !iRepeatOptions.break
  )
    return

  let c = callback || this.gazeTracker.defaultDistanceTrackCallback

  let v = document.querySelector('#webgazerVideoFeed')
  let m = await this.gazeTracker.webgazer.getTracker().model
  const videoTimestamp = performance.now()
  let f = await m.estimateFaces(v)

  if (f.length) {
    const mesh = f[0].scaledMesh
    const dist = eyeDist(mesh[133], mesh[362])

    let timestamp = performance.now()
    //
    const latency = toFixedNumber(timestamp - videoTimestamp, 0)
    //

    const data = (this.newViewingDistanceData = {
      value: toFixedNumber(
        stdFactor.current / dist,
        trackingOptions.decimalPlace
      ),
      timestamp: timestamp,
      method: this._CONST.VIEW_METHOD.F,
      latencyMs: latency,
    })

    let nPData
    if (trackingOptions.nearPoint) {
      nPData = _getNearPoint(
        this,
        trackingOptions,
        v,
        mesh,
        dist,
        timestamp,
        this.screenPpi ? this.screenPpi.value : this._CONST.N.PPI_DONT_USE,
        latency
      )
    }

    safeExecuteFunc(c, {
      value: {
        viewingDistanceCm: data.value,
        nearPointCm: nPData
          ? {
              x: nPData.value.x,
              y: nPData.value.y,
            }
          : {
              x: null,
              y: null,
            },
        latencyMs: latency,
      },
      timestamp: timestamp,
      method: this._CONST.VIEW_METHOD.F,
    })
    return data
  }

  return null
}

RemoteCalibrator.prototype.showNearPoint = function (show = true) {
  if (this.gazeTracker.checkInitialized('distance', false)) {
    const n = document.querySelector('#rc-near-point-dot')
    if (n) n.display = show ? 'block' : 'none'
  }
}

/**
 * Public RC.selectCamera(options) method.
 *
 * Lets the consumer app (e.g. EasyEyes) run the camera-selection pipeline
 * — Choose Camera → Choose Screen → Camera Resolution — at any point in
 * its own flow, typically immediately after the Device Compatibility
 * page. This way the participant gets the camera prompt up-front instead
 * of midway through calibration.
 *
 * Mirrors the init sequence that trackDistance / objectTestNew /
 * blindSpotTestNew perform internally:
 *   gazeTracker._init('distance')  →  checkPermissions
 *   →  loadModel  →  beginVideo  →  showTestPopup
 *
 * Sets `RC._cameraSelectionDone = true` on success so the panel
 * pre-flight (`_runCameraSelectionBeforePanel`) and the in-task
 * `showTestPopup` calls in trackDistance / object tests will all skip
 * and avoid double-prompting the user.
 */
import RemoteCalibrator from './core'

import { phrases } from './i18n/schema'
import { checkPermissions } from './components/mediaPermission'
import { showTestPopup, hideResolutionSettingMessage } from './components/popup'
import { logCameraFindResults } from './cameraFindTiming.js'

RemoteCalibrator.prototype.selectCamera = async function (options = {}) {
  if (!this.checkInitialized()) return null

  // Idempotent: if camera selection already ran (e.g. from the panel
  // pre-flight) just return.
  if (this._cameraSelectionDone) {
    console.log(
      '[RC.selectCamera] Camera selection already completed — skipping',
    )
    return { selectedCamera: this.selectedCamera || null, alreadyDone: true }
  }

  const opts = Object.assign(
    {
      // Camera resolution / framerate the experiment wants.
      calibrateDistanceCameraResolution: [640, 480],
      calibrateDistanceCameraHz: 60,
      // Whether to show the Camera Resolution page after Choose Camera /
      // Choose Screen.
      _showCameraResolutionBool: true,
      // Whether the bottom-row preview is shown on Choose Camera.
      calibrateDistanceAcceptBottomCameraBool: false,
      calibrateDistanceAllowExternalCameraBool: false,
      calibrateDistanceCameraKindOverride: 'assess',
      // Forwarded to checkPermissions to hide the privacy line when the
      // experiment is recording snapshots.
      saveSnapshots: false,
      // Forwarded to showTestPopup → checkResolutionAfterSelection.
      resolutionWarningThreshold: undefined,
      // Whether to request fullscreen before showing Choose Camera
      fullscreen: true,
    },
    options,
  )

  await this.getFullscreen(opts.fullscreen)

  if (!this.gazeTracker.checkInitialized('distance')) {
    this.gazeTracker._init(
      {
        toFixedN: 1,
        showVideo: true,
        showFaceOverlay: false,
        desiredCameraResolution: opts.calibrateDistanceCameraResolution,
        desiredCameraHz: opts.calibrateDistanceCameraHz,
      },
      'distance',
    )
  }

  let permMessage = `${phrases.RC_requestCamera[this.L]}`
  if (!opts.saveSnapshots) {
    permMessage += `<br />${phrases.RC_privacyCamera[this.L]}`
  }

  // Time spent waiting for the participant to grant camera permission is
  // theirs, not ours, so it is measured separately and excluded from
  // cameraFindSec below.
  const permissionStart = performance.now()
  await checkPermissions(this, permMessage)
  const cameraPermissionSec = (performance.now() - permissionStart) / 1000

  // Clock for "how long did EasyEyes take to find the camera?", reported in
  // the results so the distribution can be compared across computers.
  // Final cameraFindSec is set in showTestPopup when Choose Camera appears.
  this._cameraFindStartMs = performance.now()

  const _backgroundAddedHere = this.background === null
  if (_backgroundAddedHere) this._addBackground()
  const startingMsg = document.createElement('div')
  startingMsg.id = 'rc-starting-message'
  startingMsg.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 9999999999;
    text-align: center;
    color: #666;
    font-style: normal;
    font-size: 1.6rem;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
    pointer-events: none;
    user-select: none;
  `
  startingMsg.innerHTML = phrases.RC_starting[this.L]
  document.body.appendChild(startingMsg)

  // Load FaceMesh model + start video. Both steps can fail (a flaky model
  // download, a camera the OS won't hand over), and both used to leave this
  // promise unsettled or reject into the consumer's global handler, which
  // ends the study. Failures are surfaced as the standard no-camera page
  // instead, so the participant can retry or quit.
  let startupError = null
  const modelStart = performance.now()
  try {
    await this.gazeTracker.webgazer.getTracker().loadModel()
  } catch (error) {
    startupError = error
    console.error('[RC.selectCamera] Face model failed to load:', error)
  }
  const cameraModelLoadSec = (performance.now() - modelStart) / 1000

  // The video is started even when the model failed: the camera itself may
  // be fine, and beginVideo retries the model download, so a network blip
  // during the first attempt does not have to end the session.
  const videoStart = performance.now()
  await new Promise(resolve => {
    const pipWidthPx =
      this._CONST.N.VIDEO_W[this.isMobile.value ? 'MOBILE' : 'DESKTOP']
    this.gazeTracker.beginVideo(
      { pipWidthPx },
      () => {
        startupError = null
        resolve()
      },
      error => {
        startupError = error
        console.error('[RC.selectCamera] Camera video failed to start:', error)
        resolve()
      },
    )
  })
  const cameraVideoStartSec = (performance.now() - videoStart) / 1000

  startingMsg.remove()

  // Partial timings (cameraFindSec finalized when Choose Camera is visible).
  const probeTiming = this.gazeTracker?.webgazer?.cameraTiming || {}
  this.cameraFindTiming = {
    cameraFindSec: null,
    cameraPermissionSec: Number(cameraPermissionSec.toFixed(3)),
    cameraModelLoadSec: Number(cameraModelLoadSec.toFixed(3)),
    cameraVideoStartSec: Number(cameraVideoStartSec.toFixed(3)),
    cameraEnumerateSec:
      typeof probeTiming.enumerateMs === 'number'
        ? Number((probeTiming.enumerateMs / 1000).toFixed(3))
        : null,
    cameraFirstStreamSec:
      typeof probeTiming.firstStreamMs === 'number'
        ? Number((probeTiming.firstStreamMs / 1000).toFixed(3))
        : null,
    cameraProbeSec:
      typeof probeTiming.probeMs === 'number'
        ? Number((probeTiming.probeMs / 1000).toFixed(3))
        : null,
    cameraProbeCount: probeTiming.probeCount ?? null,
    cameraProbeMethod: probeTiming.probeMethod ?? null,
    cameraStartupError: startupError
      ? startupError.name || String(startupError.message || startupError)
      : null,
  }

  const cameraResult = await showTestPopup(this, null, opts)
  if (cameraResult?.experimentEnded) {
    console.log('[RC.selectCamera] Experiment ended — no cameras detected')
  }

  if (!cameraResult?.experimentEnded) {
    this._cameraSelectionDone = true
  }

  // Log final timing again after Choose Camera flow (cameraFindSec set in popup).
  if (this.cameraFindTiming?.cameraFindSec != null) {
    logCameraFindResults(this)
  }

  // clean up any leftover loading text from the popup flow.
  const leftoverLoading = document.getElementById('camera-loading-text')
  if (leftoverLoading) leftoverLoading.remove()
  hideResolutionSettingMessage()

  // Tear down the gray background we added before "Starting..." so the
  // consumer app's next page renders against its own page.
  if (_backgroundAddedHere) this._removeBackground()

  // hide the live video feed so it doesn't bleed into whatever page
  this.showVideo(false)
  const vc = document.getElementById('webgazerVideoContainer')
  if (vc) vc.style.display = 'none'

  const realIncorporation =
    this.cameraIncorporationReal != null
      ? this.cameraIncorporationReal
      : this.cameraIncorporation || null
  return {
    ...cameraResult,
    ...this.cameraFindTiming,
    cameraArray: Array.isArray(this.cameraArray)
      ? this.cameraArray.map(entry => ({
          ...entry,
          kindOverrideApplied: false,
        }))
      : [],
    cameraIncorporation: realIncorporation,
    cameraIncorporationReported: this.cameraIncorporationReported || null,
    calibrateDistanceCameraKindOverride:
      this.calibrateDistanceCameraKindOverride ||
      this._calibrateDistanceCameraKindOverride ||
      opts.calibrateDistanceCameraKindOverride ||
      opts._calibrateDistanceCameraKindOverride ||
      'assess',
  }
}

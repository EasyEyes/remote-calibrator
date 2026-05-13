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
      // Camera resolution / framerate the experiment wants. Forwarded to
      // gazeTracker._init so findBestCameraMode / setCameraConstraints use
      // them, and to showTestPopup so the Camera Resolution page can show
      // the requested vs achieved values.
      calibrateDistanceCameraResolution: [640, 480],
      calibrateDistanceCameraHz: 60,
      // Whether to show the Camera Resolution page after Choose Camera /
      // Choose Screen.
      _showCameraResolutionBool: true,
      // Whether the bottom-row preview is shown on Choose Camera.
      calibrateDistanceAcceptBottomCameraBool: false,
      // EasyEyes glossary: when TRUE, allow the required camera to be
      // external (built-in, external, or unknown will all be shown).
      // Default FALSE means only built-in / unknown cameras appear in
      // Choose Camera. See popup.js _filterCamerasByExternalPolicy and
      // cameraClassifier.js for label-based built-in / external / unknown.
      calibrateDistanceAllowExternalCameraBool: false,
      // FOR TESTING. `calibrateDistanceCameraKindOverride` (glossary
      // name `_calibrateDistanceCameraKindOverride`; either spelling
      // is accepted) lets the scientist override the kind
      // classification of the selected camera so EasyEyes' handling
      // of the three kinds can be tested without physically having
      // one of each. Default 'assess'. Allowed values:
      //   'assess'   = classify as usual based on the camera name.
      //   'built-in' = skip assessment, force kind to 'built-in'.
      //   'external' = skip assessment, force kind to 'external'.
      //   'unknown'  = skip assessment, force kind to 'unknown'.
      // NOTE: When tabulating camera-kind data, exclude results
      // collected with this set to anything but 'assess'.
      calibrateDistanceCameraKindOverride: 'assess',
      // Forwarded to checkPermissions to hide the privacy line when the
      // experiment is recording snapshots.
      saveSnapshots: false,
      // Forwarded to showTestPopup → checkResolutionAfterSelection.
      resolutionWarningThreshold: undefined,
      // Whether to request fullscreen before showing Choose Camera. The
      // popup's click + Enter-to-proceed handlers in
      // showCameraSelectionPopup short-circuit when !isFullscreen(), so
      // we must enter fullscreen first or every click on a camera tile
      // will be silently ignored. Defaults to true to match the panel
      // flow (panel.js sets fullscreen: true and calls getFullscreen
      // before running camera selection).
      fullscreen: true,
    },
    options,
  )

  // 1. Enter fullscreen FIRST. The Choose Camera popup's click and
  // Enter-key handlers gate on isFullscreen(); if we open the popup
  // outside fullscreen the participant can't proceed. We do this before
  // gazeTracker init so the popup that getFullscreen may briefly show
  // doesn't race with the camera permission prompt.
  await this.getFullscreen(opts.fullscreen)

  // 2. gazeTracker init (distance mode) — sets desired resolution / Hz.
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

  // 3. Camera permissions.
  let permMessage = `${phrases.RC_requestCamera[this.L]}`
  if (!opts.saveSnapshots) {
    permMessage += `<br />${phrases.RC_privacyCamera[this.L]}`
  }
  await checkPermissions(this, permMessage)

  // 4. "Starting..." message in the same style as the resolution message.
  // Ensure the standard EasyEyes gray (#eee) background is painted under
  // the message so this page matches every other RC page. Without this
  // the body's default (white) shows through and "Connecting to your
  // webcam(s) ..." looks noticeably lighter than neighboring pages.
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
  startingMsg.textContent = phrases.RC_starting[this.L]
  document.body.appendChild(startingMsg)

  // 5. Load FaceMesh model + start video.
  await this.gazeTracker.webgazer.getTracker().loadModel()
  await new Promise(resolve => {
    const pipWidthPx =
      this._CONST.N.VIDEO_W[this.isMobile.value ? 'MOBILE' : 'DESKTOP']
    this.gazeTracker.beginVideo({ pipWidthPx }, () => {
      resolve()
    })
  })

  // Remove "Starting..." message before the popup opens.
  startingMsg.remove()

  // 6. Camera selection + (optionally) Camera Resolution page.
  const cameraResult = await showTestPopup(this, null, opts)
  if (cameraResult?.experimentEnded) {
    console.log('[RC.selectCamera] Experiment ended — no cameras detected')
  }

  // 7. Only mark done if a camera was actually selected. If the
  // participant ended the experiment from the no-camera popup we leave
  // _cameraSelectionDone false so a downstream caller could retry.
  if (!cameraResult?.experimentEnded) {
    this._cameraSelectionDone = true
  }

  // Clean up any leftover loading text from the popup flow.
  const leftoverLoading = document.getElementById('camera-loading-text')
  if (leftoverLoading) leftoverLoading.remove()
  hideResolutionSettingMessage()

  // Tear down the gray background we added before "Starting..." so the
  // consumer app's next page renders against its own page.
  if (_backgroundAddedHere) this._removeBackground()

  // 8. Hide the live video feed so it doesn't bleed into whatever page
  // the consumer app shows next (e.g. consent form, screen-size step).
  // The video container is re-shown when trackDistance / objectTestNew
  // start.
  this.showVideo(false)
  const vc = document.getElementById('webgazerVideoContainer')
  if (vc) vc.style.display = 'none'

  // Surface camera-classification stats alongside the existing result.
  return {
    ...cameraResult,
    cameraArray: this.cameraArray || [],
    cameraIncorporation: this.cameraIncorporation || null,
    cameraIncorporationReported: this.cameraIncorporationReported || null,
    calibrateDistanceCameraKindOverride:
      this.calibrateDistanceCameraKindOverride ||
      this._calibrateDistanceCameraKindOverride ||
      opts.calibrateDistanceCameraKindOverride ||
      opts._calibrateDistanceCameraKindOverride ||
      'assess',
  }
}

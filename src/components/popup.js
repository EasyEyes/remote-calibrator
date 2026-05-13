import Swal from 'sweetalert2'
import { phrases } from '../i18n/schema'
import { swalInfoOptions } from './swalOptions'
import { setUpEasyEyesKeypadHandler } from '../extensions/keypadHandler'
import { exitFullscreen, getFullscreen, isFullscreen } from './utils'
import { processInlineFormatting } from '../distance/markdownInstructionParser'
import { likelyBuiltIn } from './cameraClassifier'

/**
 * Remove parenthesized hex device IDs from camera labels.
 * e.g. "FaceTime HD Camera (0x1400000005ac8514)" → "FaceTime HD Camera"
 */
const _stripHexId = label =>
  String(label)
    .replace(/\s*\([0-9a-fA-Fx:]+\)\s*/g, '')
    .trim()

// Localized "built-in" / "external" / "unknown" tag for a caption.
const _incorporationLabel = (RC, incorporation) => {
  if (!incorporation) return ''
  const lang = RC?.L
  if (incorporation === 'built-in')
    return phrases?.RC_builtIn?.[lang] || 'built-in'
  if (incorporation === 'external')
    return phrases?.RC_external?.[lang] || 'external'
  return phrases?.RC_unknown?.[lang] || 'unknown'
}

// Resolve whether external cameras may be shown.
//
// Source of truth is `calibrateDistanceAllowExternalCameraBool`
// (default FALSE per the EasyEyes glossary). When TRUE we show every
// camera (built-in, external, unknown); when FALSE only built-in /
// unknown are shown. The legacy `calibrateDistanceExcludeExternalCamerasBool`
// (default TRUE) is still honored as a fallback so consumers that
// haven't migrated keep working.
const _isExternalCameraAllowed = options => {
  if (
    options &&
    typeof options.calibrateDistanceAllowExternalCameraBool === 'boolean'
  ) {
    return options.calibrateDistanceAllowExternalCameraBool === true
  }
  if (
    options &&
    typeof options.calibrateDistanceExcludeExternalCamerasBool === 'boolean'
  ) {
    return options.calibrateDistanceExcludeExternalCamerasBool === false
  }
  return false
}

// Apply the external-camera filter to a list returned by
// getAvailableCameras(). Externals come back from cameraClassifier with
// `likelyBuiltIn < 0` (built-in >= 0.5, unknown otherwise).
const _filterCamerasByExternalPolicy = (cameras, options) =>
  _isExternalCameraAllowed(options)
    ? cameras
    : cameras.filter(c => c.likelyBuiltIn >= 0)

/** Returned by `askCameraIncorporationOpinion` when the participant picks "choose another camera". */
const RC_CAMERA_OPINION_CHOOSE_AGAIN = 'choose-again'

const _cameraCaptionHTML = (label, resolution, RC, incorporation) => {
  const clean = _stripHexId(label)
  const tag = _incorporationLabel(RC, incorporation)
  if (!resolution || !resolution.width) {
    return tag
      ? `<div>${clean}</div><div>${tag}</div>`
      : `<div>${clean}</div>`
  }
  const hz = resolution.frameRate
    ? `, ${Math.round(resolution.frameRate)} Hz`
    : ''
  const tagSuffix = tag ? `, ${tag}` : ''
  return `<div>${clean}</div><div>${resolution.width}×${resolution.height}${hz}${tagSuffix}</div>`
}

const _updateCaptionInContainer = (container, camera, index, RC) => {
  const caption = container.querySelector('.rc-camera-caption')
  if (caption) {
    caption.innerHTML = _cameraCaptionHTML(
      camera.label || `Camera ${index + 1}`,
      camera.resolution,
      RC,
      camera.incorporation,
    )
  }
}

/* ------------------------------------------------------------------ */
/*   Helpers for the optional bottom-row camera previews (Feature B)  */
/* ------------------------------------------------------------------ */

/**
 * Returns both the top-row and bottom-row preview containers for a
 * camera index, filtering out any that don't exist. The bottom row only
 * exists when the experiment is built with
 * `calibrateDistanceAcceptBottomCameraBool === true`.
 */
const _getCameraContainersForIndex = index =>
  [
    document.getElementById(`camera-preview-container-${index}`),
    document.getElementById(`camera-preview-container-bottom-${index}`),
  ].filter(Boolean)

/**
 * Sets the visual highlight state for the given camera index. By default
 * the state is applied to BOTH the top-row and bottom-row containers
 * (when the bottom row is shown under
 * `calibrateDistanceAcceptBottomCameraBool`), e.g. when clearing all
 * tiles to 'normal'. Pass `row = 'top'` or `row = 'bottom'` to target
 * only one of the two rows (used by the hover handler so only the tile
 * the participant is actually pointing at lights up, while the matching
 * tile in the other row stays neutral).
 *
 * The highlighted device is tracked separately via
 * `RC.highlightedCameraDeviceId` / `RC.selectedCamera`, so RETURN/click
 * still commit the correct camera regardless of which row's tile is lit.
 *
 * @param {number} index - camera index
 * @param {'highlight'|'normal'} state
 * @param {'top'|'bottom'|'both'} [row='both']
 */
const _applyCameraContainerState = (index, state, row = 'both') => {
  const top =
    row === 'top' || row === 'both'
      ? document.getElementById(`camera-preview-container-${index}`)
      : null
  const bot =
    row === 'bottom' || row === 'both'
      ? document.getElementById(`camera-preview-container-bottom-${index}`)
      : null
  for (const el of [top, bot]) {
    if (!el) continue
    if (state === 'highlight') {
      el.style.backgroundColor = '#e8f5e8'
      el.style.border = '2px solid #28a745'
      const cap = el.querySelector('.rc-camera-caption')
      if (cap) {
        cap.style.color = '#28a745'
        cap.style.fontWeight = 'bold'
      }
    } else {
      el.style.backgroundColor = 'transparent'
      el.style.border = '2px solid transparent'
      const cap = el.querySelector('.rc-camera-caption')
      if (cap) {
        cap.style.color = '#666'
        cap.style.fontWeight = 'normal'
      }
    }
  }
}

/**
 * Green "committed selection" styling: only the row the participant
 * chose (RC.selectedCameraRow) is highlighted for the active device;
 * the duplicate tile in the other row stays neutral.
 */
const _applyCommittedCameraHighlight = (cameras, selectedCamera, RC) => {
  const activeRow = RC.selectedCameraRow === 'bottom' ? 'bottom' : 'top'
  cameras.forEach((camera, index) => {
    const isActive = camera.deviceId === selectedCamera.deviceId
    if (isActive) {
      _applyCameraContainerState(index, 'highlight', activeRow)
    } else {
      _applyCameraContainerState(index, 'normal', 'both')
    }
  })
}

/**
 * Disables (or re-enables) all preview containers in both rows during
 * loading.
 */
const _setAllCameraContainersDisabled = (cameras, disabled) => {
  for (let i = 0; i < cameras.length; i++) {
    const containers = _getCameraContainersForIndex(i)
    for (const c of containers) {
      c.style.pointerEvents = disabled ? 'none' : 'auto'
      c.style.opacity = disabled ? '0.6' : '1'
    }
  }
}

const _resumeChooseCameraAfterUnknownOpinionDismiss = RC => {
  RC.cameraSelectionLoading = false
  const list = RC._visibleCameras
  if (Array.isArray(list) && list.length > 0) {
    _setAllCameraContainersDisabled(list, false)
  }
}

/**
 * Moves the bottom-row preview wrapper from inside the Swal popup to
 * `document.body`.
 *
 * The bottom row uses `position: fixed; bottom: 0` so it can sit at the
 * very bottom of the viewport. However, when the wrapper lives inside a
 * SweetAlert2 popup, Swal's CSS (transforms / containment / stacking
 * context) makes `position: fixed` resolve relative to the popup
 * rather than the viewport, which causes the bottom row to render
 * somewhere in the middle of the page. Promoting the wrapper to a
 * direct child of <body> ensures it is truly viewport-fixed.
 */
const _promoteCameraPreviewsBottomToBody = () => {
  const bottomOuter = document.getElementById(
    'rc-camera-previews-bottom-outer',
  )
  if (bottomOuter && bottomOuter.parentElement !== document.body) {
    document.body.appendChild(bottomOuter)
  }
}

/**
 * Removes the bottom-row preview wrapper (whether it currently lives in
 * the Swal popup or has been promoted to <body>).
 *
 * Robust to the case where multiple stale copies exist with the same id
 * (can happen if the Choose Camera popup is opened, closed, then
 * reopened across a reconnect cycle and willClose timing was off):
 * loops while any element with the id is present.
 */
const _removeCameraPreviewsBottom = () => {
  let removed = 0
  let bottomOuter = document.getElementById('rc-camera-previews-bottom-outer')
  while (bottomOuter) {
    bottomOuter.remove()
    removed++
    bottomOuter = document.getElementById('rc-camera-previews-bottom-outer')
  }
  if (removed > 0) {
    console.log(
      `[CameraSelectionPopup] _removeCameraPreviewsBottom removed ${removed} element(s)`,
    )
  }
}

/**
 * Make the bottom instructional caption use the same rendered content
 * width as the top instruction/privacy area, so left/right margins line
 * up in both Choose Camera and Choose Screen modes.
 */
const _syncBottomCaptionWidthWithTopLayout = () => {
  const bottomCaption = document.getElementById('rc-bottom-cameras-caption')
  if (!bottomCaption) return

  // Prefer the instruction block as the source of truth for horizontal
  // text margins (this is what the user visually compares against).
  const instructionBlock = document.getElementById('rc-camera-instruction-text')
  const topOuter = document.getElementById('rc-camera-previews-outer')
  const referenceElement = instructionBlock || topOuter
  if (!referenceElement) return

  const topWidth = Math.round(referenceElement.getBoundingClientRect().width)
  if (!Number.isFinite(topWidth) || topWidth <= 0) return

  bottomCaption.style.width = `${topWidth}px`
  bottomCaption.style.maxWidth = 'calc(100vw - 2rem)'
  bottomCaption.style.marginLeft = 'auto'
  bottomCaption.style.marginRight = 'auto'

  // Keep horizontal padding identical to the top instruction/privacy
  // blocks so the text starts/ends on the same x positions.
  if (instructionBlock) {
    bottomCaption.style.paddingLeft = instructionBlock.style.paddingLeft || '30px'
    bottomCaption.style.paddingRight =
      instructionBlock.style.paddingRight || '30px'
  }
}

// Enforce LTR/RTL alignment for camera/screen/resolution body text blocks,
// including nested nodes produced by inline formatting.
const _applyDirectionalTextAlignment = (element, isRTL) => {
  if (!element) return
  const textAlign = isRTL ? 'right' : 'left'
  const direction = isRTL ? 'rtl' : 'ltr'
  element.style.textAlign = textAlign
  element.style.direction = direction
  element.style.unicodeBidi = 'plaintext'

  const descendants = element.querySelectorAll(
    'p, li, ul, ol, div, span, blockquote',
  )
  descendants.forEach(node => {
    node.style.textAlign = textAlign
    node.style.direction = direction
    node.style.unicodeBidi = 'plaintext'
  })
}

const _applyChooseCameraPageTextDirection = RC => {
  const isRTL = RC.LD === RC._CONST.RTL
  _applyDirectionalTextAlignment(
    document.getElementById('rc-camera-instruction-text'),
    isRTL,
  )
  _applyDirectionalTextAlignment(
    document.getElementById('rc-camera-privacy-text'),
    isRTL,
  )
  _applyDirectionalTextAlignment(
    document.getElementById('rc-bottom-cameras-caption'),
    isRTL,
  )
}

/**
 * Shows the camera selection title in the top right of the webpage
 * @param {Object} RC - RemoteCalibrator instance
 * @param {string} titleKey - title key to retrieve the phrase
 */
export const showCameraTitleInTopRight = (
  RC,
  titleKey = 'RC_ChooseCameraTitle',
) => {
  // Remove any existing camera title
  const existingTitle = document.getElementById('rc-camera-title-top-right')
  if (existingTitle) {
    existingTitle.remove()
  }

  const isRTL = RC.LD === RC._CONST.RTL

  // Choose Camera / Choose Screen / Camera resolution all share the
  // "Device compatibility" eyebrow as the page header.
  const showEyebrow =
    titleKey === 'RC_ChooseCameraTitle' ||
    titleKey === 'RC_ChooseScreenTitle' ||
    titleKey === 'RC_CameraResolutionTitle'
  const eyebrowText = showEyebrow
    ? phrases?.EE_DeviceCompatibility?.[RC.L] || 'Device compatibility'
    : ''

  const titleElement = document.createElement('div')
  titleElement.id = 'rc-camera-title-top-right'
  titleElement.dir = isRTL ? 'rtl' : 'ltr'
  titleElement.innerHTML = `${
    showEyebrow
      ? `<div class="rc-camera-title-eyebrow">${processInlineFormatting(eyebrowText)}</div>`
      : ''
  }<h1>${processInlineFormatting(phrases[titleKey][RC.L])}</h1>`

  // Match the system font used by the Size (1 of 2) page title (which
  // inherits from `#calibration-background *` in src/css/main.css).
  const titleFontFamily =
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif"
  const smallScreen = window.matchMedia('(max-width: 480px)').matches
  // Match Size-page heading sizes from src/css/main.css:
  // desktop 2.5rem, mobile 1.8rem.
  const sizePageTitleSize = smallScreen ? '1.8rem' : '2.5rem'

  titleElement.style.cssText = `
    position: fixed;
    top: 2rem;
    ${isRTL ? 'right' : 'left'}: 3rem;
    z-index: 9999999999;
    color: #000;
    margin: 0;
    text-align: ${isRTL ? 'right' : 'left'};
    direction: ${isRTL ? 'rtl' : 'ltr'};
    pointer-events: none;
    font-family: ${titleFontFamily};
  `

  // Eyebrow ("Device compatibility") is a small label above the main
  // page title (Choose camera / Choose screen / Camera resolution).
  const eyebrow = titleElement.querySelector('.rc-camera-title-eyebrow')
  if (eyebrow) {
    eyebrow.style.cssText = `
      margin: 0 0 0.15em 0;
      padding: 0;
      font-family: ${titleFontFamily};
      font-size: 1.4rem;
      font-weight: 400;
      color: #000;
      line-height: 1.6;
    `
  }

  // Page title (Choose camera / Choose screen / Camera resolution) is
  // the large heading when the eyebrow is present.
  const titleH1 = titleElement.querySelector('h1')
  if (titleH1) {
    const subtitle = !!eyebrow
    titleH1.style.cssText = subtitle
      ? `
        margin: 0;
        padding: 0;
        font-family: ${titleFontFamily};
        font-size: ${sizePageTitleSize};
        font-weight: 400;
        color: #000;
        line-height: ${smallScreen ? '120%' : '100%'};
      `
      : `
        margin: 0;
        padding: 0;
        font-family: ${titleFontFamily};
        font-size: ${sizePageTitleSize};
        font-weight: 400;
        color: #000;
        line-height: ${smallScreen ? '120%' : '100%'};
      `
  }

  document.body.appendChild(titleElement)
}

/**
 * Hides the camera selection title from the top right of the webpage
 */
export const hideCameraTitleFromTopRight = () => {
  const titleElement = document.getElementById('rc-camera-title-top-right')
  if (titleElement) {
    titleElement.remove()
  }
}

// Push camera-selection result into RC._cameraData (see src/core.js).
// Idempotent: guarded by RC._cameraDataPushed against retry loops.
const _recordCameraData = RC => {
  if (RC._cameraDataPushed) return
  RC.newCameraData = {
    value: {
      selectedCameraName: RC.selectedCamera?.label || null,
      cameraIncorporation: RC.cameraIncorporation || null,
      cameraIncorporationReported: RC.cameraIncorporationReported || null,
      cameraArray: Array.isArray(RC.cameraArray) ? RC.cameraArray : [],
    },
    timestamp: performance.now(),
  }
  RC._cameraDataPushed = true
}

// Ask the participant whether an "unknown"-classified camera is built-in.
// Sets RC.cameraIncorporationReported and back-fills RC.cameraArray.opinion.
// Resolves with `RC_CAMERA_OPINION_CHOOSE_AGAIN` when the participant picks
// "choose another camera" (overlay on Choose Camera, or legacy Swal).
const askCameraIncorporationOpinion = async (
  RC,
  { renderAboveChooseCamera = false } = {},
) => {
  const Q = phrases?.RC_IsCameraBuiltIn?.[RC.L] ||
    'Check the video. Is its camera built-into this screen?'
  const yesText = phrases?.RC_YesHasLight?.[RC.L] || 'Yes'
  const noText = phrases?.RC_NoNoLight?.[RC.L] || 'No'
  const dontKnowText =
    phrases?.RC_DontKnow?.[RC.L] ||
    "Don't know. (All answers are OK -- this won't affect your participation.)"
  const chooseAgainText =
    phrases?.RC_ChooseAnotherCamera?.[RC.L] || 'Oops. Let me choose again.'
  const proceedText = phrases?.T_proceed?.[RC.L] || 'Proceed'
  const isRTL = RC.LD === RC._CONST.RTL

  // Flex row + explicit label-for pairing so radio and text always
  // align and a single click reliably toggles the radio.
  const rowStyle = `display: flex; align-items: center; gap: 0.6rem; margin: 0.6rem 0; ${isRTL ? 'flex-direction: row-reverse; justify-content: flex-end;' : ''}`
  const inputStyle =
    'margin: 0; flex: 0 0 auto; width: 1.1rem; height: 1.1rem; cursor: pointer;'
  const labelStyle =
    'margin: 0; font-size: 1.05rem; line-height: 1.4; cursor: pointer; user-select: none;'

  const optionsHTML = `
    <div id="rc-camera-opinion" style="text-align: ${isRTL ? 'right' : 'left'}; direction: ${isRTL ? 'rtl' : 'ltr'}; margin-top: 1rem;">
      <p style="margin: 0 0 1rem 0; font-size: 1.2rem; line-height: 1.5;">${processInlineFormatting(Q)}</p>
      <div style="${rowStyle}">
        <input id="rc-opinion-built-in" type="radio" name="rc-camera-opinion" value="built-in" style="${inputStyle}" />
        <label for="rc-opinion-built-in" style="${labelStyle}">${processInlineFormatting(yesText)}</label>
      </div>
      <div style="${rowStyle}">
        <input id="rc-opinion-external" type="radio" name="rc-camera-opinion" value="external" style="${inputStyle}" />
        <label for="rc-opinion-external" style="${labelStyle}">${processInlineFormatting(noText)}</label>
      </div>
      <div style="${rowStyle}">
        <input id="rc-opinion-dont-know" type="radio" name="rc-camera-opinion" value="dontKnow" style="${inputStyle}" />
        <label for="rc-opinion-dont-know" style="${labelStyle}">${processInlineFormatting(dontKnowText)}</label>
      </div>
      <div style="${rowStyle}">
        <input id="rc-opinion-choose-again" type="radio" name="rc-camera-opinion" value="chooseAgain" style="${inputStyle}" />
        <label for="rc-opinion-choose-again" style="${labelStyle}">${processInlineFormatting(chooseAgainText)}</label>
      </div>
    </div>
  `

  let chosenAnswer = null

  if (renderAboveChooseCamera) {
    console.log(
      '[UnknownCamPopup] Opening overlay above Choose Camera page for camera:',
      RC?.selectedCamera?.label,
      'classification:',
      RC?.cameraIncorporation,
    )
    const existing = document.getElementById('rc-camera-opinion-overlay')
    if (existing) {
      console.log(
        '[UnknownCamPopup] Removing stale overlay before opening new one',
      )
      existing.remove()
    }

    const overlay = document.createElement('div')
    overlay.id = 'rc-camera-opinion-overlay'
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 10000000002;
      background: rgba(0, 0, 0, 0.35);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
    `

    const panel = document.createElement('div')
    panel.style.cssText = `
      width: min(860px, 96vw);
      max-height: 90vh;
      overflow: auto;
      background: #fff;
      border-radius: 10px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
      padding: 1.25rem 1.5rem;
      direction: ${isRTL ? 'rtl' : 'ltr'};
      text-align: ${isRTL ? 'right' : 'left'};
    `
    panel.innerHTML = optionsHTML

    const actions = document.createElement('div')
    actions.style.cssText = 'display: flex; justify-content: center; margin-top: 1rem;'
    const proceedBtn = document.createElement('button')
    proceedBtn.className = 'rc-button'
    proceedBtn.textContent = proceedText
    proceedBtn.disabled = true
    proceedBtn.style.background = '#999'
    proceedBtn.style.cursor = 'not-allowed'
    actions.appendChild(proceedBtn)
    panel.appendChild(actions)
    overlay.appendChild(panel)
    document.body.appendChild(overlay)

    const opinionContainer = overlay.querySelector('#rc-camera-opinion')
    const handler = () => {
      const checked = opinionContainer?.querySelector(
        'input[name="rc-camera-opinion"]:checked',
      )
      if (!checked) return
      chosenAnswer = checked.value
      proceedBtn.disabled = false
      proceedBtn.style.background = '#019267'
      proceedBtn.style.cursor = 'pointer'
      proceedBtn.classList.add('rc-go-button')
    }
    opinionContainer?.addEventListener('change', handler)
    opinionContainer?.addEventListener('click', handler)

    let disconnectUnsub = null
    let disconnectedDuringOverlay = false
    let trackEndedHandler = null
    let monitoredTrack = null
    const overlayResult = await new Promise(resolve => {
      const keydown = event => {
        if ((event.key === 'Enter' || event.key === 'Return') && chosenAnswer) {
          event.preventDefault()
          event.stopPropagation()
          resolve('answered')
        }
      }
      document.addEventListener('keydown', keydown, true)
      proceedBtn.addEventListener('click', () => {
        if (chosenAnswer) resolve('answered')
      })

      // Primary disconnect signal: subscribe to GazeTracker's
      // disconnect callback. Fires when WebGazer's liveMonitor detects
      // the disconnect and runs showCameraReconnectionPopup.
      if (RC.gazeTracker?.onCameraDisconnected) {
        console.log(
          '[UnknownCamPopup] Subscribing to gazeTracker.onCameraDisconnected',
        )
        disconnectUnsub = RC.gazeTracker.onCameraDisconnected(message => {
          console.log(
            '[UnknownCamPopup] gazeTracker disconnect callback fired:',
            message,
          )
          disconnectedDuringOverlay = true
          resolve('disconnected')
        })
      } else {
        console.warn(
          '[UnknownCamPopup] No gazeTracker.onCameraDisconnected available — cannot subscribe',
        )
      }

      // Secondary disconnect signal: listen directly on the active
      // video track's `ended` event. WebGazer's liveMonitor has a 5s
      // grace period after a camera switch during which it suppresses
      // disconnect events; if the participant pulls the unknown
      // camera within that window we must still react. The track
      // 'ended' event fires immediately regardless of grace periods.
      try {
        const videoEl = document.getElementById('webgazerVideoFeed')
        const stream = videoEl?.srcObject
        const track = stream?.getVideoTracks?.()[0]
        if (track) {
          monitoredTrack = track
          trackEndedHandler = () => {
            console.warn(
              '[UnknownCamPopup] Active video track "ended" fired directly. readyState:',
              track.readyState,
              'gazeTracker.isCameraDisconnected:',
              RC.gazeTracker?.isCameraDisconnected?.(),
            )
            disconnectedDuringOverlay = true
            resolve('disconnected')
          }
          track.addEventListener('ended', trackEndedHandler, { once: true })
          console.log(
            '[UnknownCamPopup] Attached track.ended listener; track readyState:',
            track.readyState,
          )
        } else {
          console.warn(
            '[UnknownCamPopup] No active video track found to monitor',
          )
        }
      } catch (error) {
        console.warn(
          '[UnknownCamPopup] Failed to attach track.ended listener:',
          error,
        )
      }

      overlay._cleanup = () => {
        document.removeEventListener('keydown', keydown, true)
        if (disconnectUnsub) {
          disconnectUnsub()
          disconnectUnsub = null
        }
        if (monitoredTrack && trackEndedHandler) {
          monitoredTrack.removeEventListener('ended', trackEndedHandler)
          trackEndedHandler = null
          monitoredTrack = null
        }
      }
    })

    console.log(
      '[UnknownCamPopup] Overlay promise resolved. result:',
      overlayResult,
      'disconnectedDuringOverlay:',
      disconnectedDuringOverlay,
      'isCameraDisconnected:',
      RC.gazeTracker?.isCameraDisconnected?.(),
    )

    if (overlay._cleanup) overlay._cleanup()
    overlay.remove()

    if (overlayResult === 'disconnected' || disconnectedDuringOverlay) {
      // The parent Choose Camera Swal is closed by
      // showCameraReconnectionPopup (via Swal.close()) at almost the
      // same instant our overlay's disconnect callback fires. We
      // CANNOT keep awaiting reconnect inside this overlay: the
      // parent's `await Swal.fire(...)` resolves on the same
      // microtask tick and showTestPopup's post-selection logic would
      // run before our recursion finishes — that path then calls
      // _handlePostCameraResolution against a disconnected camera and
      // crashes EasyEyes.
      //
      // Instead, hand control back to the existing disconnect handler
      // in showTestPopup by clearing the selection state. That branch
      // (`!result.selectedCamera && isCameraDisconnected()`) already
      // waits for onCameraReconnected, lets the reconnection spinner
      // close, then restarts the Choose Camera flow — which will
      // re-show this overlay naturally once the unknown camera is
      // re-selected.
      console.log(
        '[UnknownCamPopup] Disconnect path: clearing RC.selectedCamera /',
        'cameraIncorporation / cameraIncorporationReported so the',
        'parent Choose Camera flow restarts after reconnect.',
        'Previous selectedCamera:',
        RC.selectedCamera?.label,
      )
      RC.selectedCamera = null
      RC.cameraIncorporation = null
      RC.cameraIncorporationReported = null
      return
    }
    console.log(
      '[UnknownCamPopup] User answered:',
      chosenAnswer,
      'for camera:',
      RC?.selectedCamera?.label,
    )
  } else {

  // We handle Enter ourselves -- Swal.update re-renders the body and
  // would visually reset the radios.
  let opinionKeydownListener = null

    const result = await Swal.fire({
    ...swalInfoOptions(RC, { showIcon: false }),
    icon: undefined,
    title: '',
    html: optionsHTML,
    background: 'rgba(255, 255, 255, 0.96)',
    backdrop: 'rgba(0, 0, 0, 0.15)',
    confirmButtonText: proceedText,
    showCancelButton: false,
    allowEnterKey: false,
    allowOutsideClick: false,
    allowEscapeKey: false,
    customClass: {
      popup: 'my__swal2__container',
      htmlContainer: `my__swal2__html rc-lang-${RC.LD.toLowerCase()}`,
      confirmButton: 'rc-button',
    },
    didOpen: () => {
      const confirmBtn = Swal.getConfirmButton()
      if (confirmBtn) {
        confirmBtn.disabled = true
        confirmBtn.style.background = '#999'
        confirmBtn.style.cursor = 'not-allowed'
      }

      // Delegated listener handles click / keyboard / label clicks alike.
      const enableProceed = value => {
        chosenAnswer = value
        if (confirmBtn) {
          confirmBtn.disabled = false
          confirmBtn.style.background = '#019267'
          confirmBtn.style.cursor = 'pointer'
          confirmBtn.classList.add('rc-go-button')
        }
      }
      const opinionContainer = document.getElementById('rc-camera-opinion')
      if (opinionContainer) {
        const handler = () => {
          const checked = opinionContainer.querySelector(
            'input[name="rc-camera-opinion"]:checked',
          )
          if (checked) enableProceed(checked.value)
        }
        opinionContainer.addEventListener('change', handler)
        opinionContainer.addEventListener('click', handler)
      }

      // Enter commits only after a radio has been picked.
      opinionKeydownListener = event => {
        if (event.key !== 'Enter' && event.key !== 'Return') return
        if (!chosenAnswer) return
        event.preventDefault()
        event.stopPropagation()
        Swal.clickConfirm()
      }
      document.addEventListener('keydown', opinionKeydownListener, true)

      // EasyEyes keypad support (matches the rest of the camera flow).
      if (RC.keypadHandler) {
        const removeKeypadHandler = setUpEasyEyesKeypadHandler(
          null,
          RC.keypadHandler,
          () => {
            if (!chosenAnswer) return
            removeKeypadHandler()
            Swal.clickConfirm()
          },
          false,
          ['return'],
          RC,
        )
      }
    },
    willClose: () => {
      if (opinionKeydownListener) {
        document.removeEventListener('keydown', opinionKeydownListener, true)
        opinionKeydownListener = null
      }
    },
  })

    // Camera disconnected -- wait for reconnect, then re-show the popup.
  // Mirrors the pattern in showCameraSelectionPopup / _handlePostCameraResolution.
    if (!chosenAnswer && RC.gazeTracker?.isCameraDisconnected()) {
      RC._isWaitingForCameraReconnect = true
      await new Promise(resolve => {
        const unsub = RC.gazeTracker.onCameraReconnected(() => {
          unsub()
          RC._isWaitingForCameraReconnect = false
          resolve()
        })
      })
      // Let the reconnection spinner close before we re-open.
      let waitedMs = 0
      while (Swal.isVisible() && waitedMs < 5000) {
        await new Promise(r => setTimeout(r, 100))
        waitedMs += 100
      }
      return await askCameraIncorporationOpinion(RC)
    }
  }

  if (!chosenAnswer) return

  if (chosenAnswer === 'chooseAgain') {
    if (renderAboveChooseCamera) {
      _resumeChooseCameraAfterUnknownOpinionDismiss(RC)
    }
    return RC_CAMERA_OPINION_CHOOSE_AGAIN
  }

  const reportedMap = {
    'built-in': 'built-in',
    external: 'external',
    dontKnow: "Don't know",
  }
  RC.cameraIncorporationReported = reportedMap[chosenAnswer]

  // Back-fill the chosen camera's opinion in the stats array.
  if (Array.isArray(RC.cameraArray) && RC.selectedCamera?.label) {
    const idx = RC.cameraArray.findIndex(
      c => c.name === RC.selectedCamera.label,
    )
    if (idx !== -1) RC.cameraArray[idx].opinion = chosenAnswer
  }
}

/**
 * Gets the current camera info (name, resolution, frame rate) from the video stream
 * with fallbacks so resolution/Hz are available when stream is not yet ready.
 * @param {Object} RC - RemoteCalibrator instance
 * @returns {Object} - Camera info with name, width, height, frameRate
 */
const getCameraInfo = RC => {
  const info = {
    name: '',
    width: 0,
    height: 0,
    frameRate: 0,
  }

  try {
    const activeCamera = RC?.gazeTracker?.webgazer?.params?.activeCamera
    if (activeCamera?.label) info.name = activeCamera.label

    const video = document.getElementById('webgazerVideoFeed')
    if (video && video.srcObject) {
      const stream = video.srcObject
      const videoTrack = stream.getVideoTracks()[0]
      if (videoTrack) {
        const settings = videoTrack.getSettings()
        info.width = settings.width || video.videoWidth || 0
        info.height = settings.height || video.videoHeight || 0
        info.frameRate = settings.frameRate ? Math.round(settings.frameRate) : 0
      }
    }
    if (
      (!info.width || !info.height) &&
      RC?.gazeTracker?.webgazer?.videoParamsToReport
    ) {
      const vp = RC.gazeTracker.webgazer.videoParamsToReport
      if (vp.width) info.width = info.width || vp.width
      if (vp.height) info.height = info.height || vp.height
    }
    if ((!info.width || !info.height) && activeCamera?.resolution) {
      const r = activeCamera.resolution
      if (r.width) info.width = info.width || r.width
      if (r.height) info.height = info.height || r.height
    }
  } catch (error) {
    console.warn('Could not get camera info:', error)
  }

  return info
}

/**
 * Shows the "Setting webcam resolution" message below the video
 * Displays camera name, resolution, and frame rate
 * @param {Object} RC - RemoteCalibrator instance
 */
export const showResolutionSettingMessage = RC => {
  try {
    hideResolutionSettingMessage()

    const cameraInfo = getCameraInfo(RC)

    // Requested values come from the EasyEyes parameters, not the camera.
    const desiredRes =
      RC?.gazeTracker?.webgazer?.params?.desiredCameraResolution
    const desiredHz = RC?.gazeTracker?.webgazer?.params?.desiredCameraHz
    const requestedWidth = Array.isArray(desiredRes) ? desiredRes[0] : '?'
    const requestedHeight = Array.isArray(desiredRes) ? desiredRes[1] : '?'
    const requestedFrameRate = desiredHz != null ? desiredHz : '?'

    const messageContainer = document.createElement('div')
    messageContainer.id = 'rc-resolution-setting-message'
    messageContainer.style.cssText = `
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

    const lang = RC?.L || RC?.language?.value || 'en-US'
    let text =
      phrases?.RC_SettingWebcamResolution?.[lang] ||
      phrases?.RC_SettingWebcamResolution?.['en-US'] ||
      'Setting webcam resolution ...\nCurrently [[M11]]×[[M22]], [[M33]] Hz\nRequested [[M44]]×[[M55]], [[M66]] Hz'

    // M11-M33: current camera values; M44-M66: requested values
    text = text
      .replace('[[M11]]', cameraInfo.width || '?')
      .replace('[[M22]]', cameraInfo.height || '?')
      .replace('[[M33]]', cameraInfo.frameRate || '?')
      .replace('[[M44]]', requestedWidth)
      .replace('[[M55]]', requestedHeight)
      .replace('[[M66]]', requestedFrameRate)

    messageContainer.innerHTML = processInlineFormatting(text).replace(
      /\n/g,
      '<br>',
    )

    document.body.appendChild(messageContainer)
    console.log(
      '📹 Showing resolution setting message:',
      'current=',
      cameraInfo,
      'requested=',
      {
        width: requestedWidth,
        height: requestedHeight,
        frameRate: requestedFrameRate,
      },
    )
  } catch (error) {
    console.error('📹 Error showing resolution setting message:', error)
  }
}

/**
 * Hides the "Setting webcam resolution" message from the page
 */
export const hideResolutionSettingMessage = () => {
  const messageElement = document.getElementById(
    'rc-resolution-setting-message',
  )
  if (messageElement) {
    messageElement.remove()
    console.log('📹 Hiding resolution setting message')
  }
}

const RC_VIDEO_RESOLUTION_LABEL_ID = 'rc-video-resolution-label'

/**
 * Shows achieved resolution and frame rate in small text immediately below the video.
 * Label is appended inside the video container so it always stays directly under the video
 * (avoids wrong placement after layout changes, e.g. after rejecting a pair of settings).
 * Call when the video is shown on the next page (e.g. distance page) so the user still sees what resolution/Hz was set.
 */
export const showVideoResolutionLabel = RC => {
  try {
    const existing = document.getElementById(RC_VIDEO_RESOLUTION_LABEL_ID)
    if (existing) existing.remove()

    const container = document.getElementById('webgazerVideoContainer')
    if (!container) return

    const cameraInfo = getCameraInfo(RC)
    const w = cameraInfo.width || '?'
    const h = cameraInfo.height || '?'
    const hz = cameraInfo.frameRate || '?'
    const text = `${w}×${h}, ${hz} Hz`

    const label = document.createElement('div')
    label.id = RC_VIDEO_RESOLUTION_LABEL_ID
    label.textContent = text
    label.style.cssText = `
      position: absolute;
      top: 100%;
      left: 0;
      width: 100%;
      margin-top: 4px;
      box-sizing: border-box;
      z-index: 9999999998;
      font-size: 0.7rem;
      line-height: 1.2;
      color: #555;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      pointer-events: none;
      user-select: none;
      white-space: nowrap;
      text-align: center;
    `
    // Ensure label below container is not clipped
    if (getComputedStyle(container).overflow !== 'visible') {
      container.style.overflow = 'visible'
    }
    container.appendChild(label)
  } catch (error) {
    console.warn('Could not show video resolution label:', error)
  }
}

/**
 * Hides the resolution/frame rate label below the video.
 */
export const hideVideoResolutionLabel = () => {
  const label = document.getElementById(RC_VIDEO_RESOLUTION_LABEL_ID)
  if (label) {
    if (label._cleanupResize) label._cleanupResize()
    label.remove()
  }
}

/**
 * Shows a simple popup with an OK button
 * @param {Object} RC - RemoteCalibrator instance
 * @param {string} title - Popup title
 * @param {string} message - Popup message
 * @param {Function} onClose - Callback function when popup is closed
 * @returns {Promise} - Promise that resolves when popup is closed
 */
export const showPopup = async (RC, title, message, onClose = null) => {
  // Store current video visibility state
  const originalVideoState = {
    showVideo: RC.gazeTracker?.webgazer?.params?.showVideo ?? true,
    showFaceOverlay: RC.gazeTracker?.webgazer?.params?.showFaceOverlay ?? true,
    showFaceFeedbackBox:
      RC.gazeTracker?.webgazer?.params?.showFaceFeedbackBox ?? true,
  }

  // Store original z-index of video container
  const videoContainer = document.getElementById('webgazerVideoContainer')
  const originalZIndex = videoContainer?.style?.zIndex || '999999997'

  // Ensure video preview is visible during popup
  if (RC.gazeTracker?.webgazer) {
    RC.gazeTracker.webgazer.showVideo(true)
    RC.gazeTracker.webgazer.showFaceOverlay(true)
    RC.gazeTracker.webgazer.showFaceFeedbackBox(true)
  }

  // Temporarily increase z-index of video container to ensure it stays above popup
  if (videoContainer) {
    videoContainer.style.zIndex = '9999999999'
  }

  const result = await Swal.fire({
    ...swalInfoOptions(RC, { showIcon: false }),
    icon: undefined,
    title,
    html: processInlineFormatting(message || ''),
    confirmButtonText: phrases.T_ok ? phrases.T_ok[RC.L] : 'OK',
    allowEnterKey: true,
    didOpen: () => {
      // Handle keyboard events
      const keydownListener = event => {
        // Prevent space key from triggering other functions
        if (event.key === ' ') {
          event.preventDefault()
          event.stopPropagation()
          return
        }

        if (event.key === 'Enter' || event.key === 'Return') {
          Swal.clickConfirm()
        }
      }

      // Add keyboard listener
      document.addEventListener('keydown', keydownListener, true) // Use capture phase to intercept early

      // Handle EasyEyes keypad if available
      if (RC.keypadHandler) {
        const removeKeypadHandler = setUpEasyEyesKeypadHandler(
          null,
          RC.keypadHandler,
          () => {
            removeKeypadHandler()
            Swal.clickConfirm()
          },
          false,
          ['return'],
          RC,
        )
      }

      // Store listener for cleanup
      RC.popupKeydownListener = keydownListener
    },
    willClose: () => {
      // Remove keyboard event listener
      if (RC.popupKeydownListener) {
        document.removeEventListener('keydown', RC.popupKeydownListener, true) // Use capture phase to match how it was added
        RC.popupKeydownListener = null
      }
    },
  })

  // Restore original z-index of video container
  if (videoContainer) {
    videoContainer.style.zIndex = originalZIndex
  }

  // Restore original video visibility state
  if (RC.gazeTracker?.webgazer) {
    RC.gazeTracker.webgazer.showVideo(originalVideoState.showVideo)
    RC.gazeTracker.webgazer.showFaceOverlay(originalVideoState.showFaceOverlay)
    // Don't restore feedback box - keep it hidden for cleaner preview
    RC.gazeTracker.webgazer.showFaceFeedbackBox(false)
  }

  // Call onClose callback if provided
  if (onClose && typeof onClose === 'function') {
    onClose()
  }

  return result
}

// Resolve the camera-kind override from the options bag and/or the RC
// instance. Defaults to 'assess'.
const _resolveCameraKindOverride = (RC, options) => {
  const fromOptionsUnderscore =
    options && options._calibrateDistanceCameraKindOverride
  const fromOptions =
    options && options.calibrateDistanceCameraKindOverride
  const fromRCUnderscore = RC && RC._calibrateDistanceCameraKindOverride
  const fromRC = RC && RC.calibrateDistanceCameraKindOverride
  return (
    fromOptionsUnderscore ||
    fromOptions ||
    fromRCUnderscore ||
    fromRC ||
    'assess'
  )
}

// Enumerate cameras and tag each with likelyBuiltIn + incorporation.
// Labels are only populated after getUserMedia permission is granted.
//
// `kindOverride` is `_calibrateDistanceCameraKindOverride` (default
// 'assess'). When not 'assess', every camera's incorporation is forced
// to the override value.
const getAvailableCameras = async (kindOverride = 'assess') => {
  try {
    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const cameras = devices.filter(device => device.kind === 'videoinput')
      return cameras.map(cam => {
        // MediaDeviceInfo is read-only -- wrap in a plain object.
        const {
          score,
          classification,
          builtInScore,
          externalScore,
          overrideApplied,
        } = likelyBuiltIn(cam, cameras, kindOverride)
        return {
          deviceId: cam.deviceId,
          kind: cam.kind,
          label: cam.label,
          groupId: cam.groupId,
          likelyBuiltIn: score,
          incorporation: classification,
          builtInScore,
          externalScore,
          kindOverrideApplied: overrideApplied === true,
        }
      })
    }
    return []
  } catch (error) {
    console.error('Error getting camera devices:', error)
    return []
  }
}

/**
 * Applies ideal resolution constraints to the specified camera device only.
 * When desiredCameraResolution and desiredCameraHz are set in webgazer.params,
 * setCameraConstraints will automatically use findBestCameraMode for cost-function-based probing.
 * Otherwise falls back to the original progressive fallback strategy.
 * @param {Object} RC - RemoteCalibrator instance
 * @param {string} deviceId - Camera device ID to apply constraints to
 * @returns {Promise<boolean>} - True if successful, false otherwise
 */
const applyIdealResolutionConstraints = async (RC, deviceId) => {
  if (!RC.gazeTracker?.webgazer) {
    return false
  }

  try {
    const desiredRes = RC.gazeTracker.webgazer.params.desiredCameraResolution
    const desiredHz = RC.gazeTracker.webgazer.params.desiredCameraHz

    if (desiredRes && desiredHz) {
      console.log(
        `Applying resolution constraints via cost-function probing: desired ${desiredRes[0]}x${desiredRes[1]} @ ${desiredHz}Hz`,
      )
    } else {
      console.log(
        `Applying optimized resolution constraints to device ${deviceId}...`,
      )
    }

    // setCameraConstraints will use findBestCameraMode when desiredCameraResolution/Hz are set,
    // or fall back to progressive min/ideal strategy otherwise.
    await RC.gazeTracker.webgazer.setCameraConstraints({
      video: {
        deviceId: { exact: deviceId },
        facingMode: 'user',
      },
    })

    // Check what resolution we actually got
    const videoParams = RC.gazeTracker.webgazer.videoParamsToReport
    if (videoParams && videoParams.width && videoParams.height) {
      console.log(
        `Resolution constraint result: ${videoParams.width}x${videoParams.height}`,
      )

      // When using cost-function probing, any result is acceptable (no error thrown)
      if (desiredRes && desiredHz) {
        return true
      }

      // Original threshold: consider successful if at least 1280x720
      return videoParams.width >= 1280 && videoParams.height >= 720
    }

    return false
  } catch (error) {
    console.warn('Failed to apply optimized resolution constraints:', error)
    return false
  }
}

/**
 * Checks camera resolution and shows popup if needed
 * @param {Object} RC - RemoteCalibrator instance
 * @param {Object} options - Options object with resolutionWarningThreshold
 * @returns {Promise<boolean>} - True to continue
 */
const checkResolutionAfterSelection = async (RC, options = {}) => {
  // Hide the grey face feedback box immediately when checking resolution
  const webgazerFaceFeedbackBox = document.getElementById(
    'webgazerFaceFeedbackBox',
  )
  if (webgazerFaceFeedbackBox) {
    webgazerFaceFeedbackBox.style.display = 'none'
  }

  // Skip resolution warning entirely when the user has explicitly requested a
  // camera resolution via calibrateDistanceCameraResolution / calibrateDistanceCameraHz.
  // The user chose their resolution on purpose, so no warning is appropriate.
  const desiredRes = RC.gazeTracker?.webgazer?.params?.desiredCameraResolution
  const desiredHz = RC.gazeTracker?.webgazer?.params?.desiredCameraHz
  if (desiredRes && desiredHz) {
    const videoParams = RC.gazeTracker?.webgazer?.videoParamsToReport
    if (videoParams) {
      console.log(
        `Skipping resolution warning — user requested ${desiredRes[0]}x${desiredRes[1]} @ ${desiredHz}Hz, ` +
          `got ${videoParams.width}x${videoParams.height}`,
      )
    }
    return true
  }

  // Resolution is already optimized during preview loading - just check the result
  const videoParams = RC.gazeTracker?.webgazer?.videoParamsToReport
  if (videoParams && videoParams.width && videoParams.height) {
    const { width, height } = videoParams
    console.log(`Selected camera resolution: ${width}x${height}`)

    // Get threshold from options (if undefined, don't show popup)
    const threshold = options.resolutionWarningThreshold

    // Show popup if threshold is defined AND width < threshold AND we haven't shown it before
    if (
      threshold !== undefined &&
      width < threshold &&
      !RC.resolutionWarningShown
    ) {
      console.log(`Low resolution detected: ${width}x${height}. Showing popup.`)

      // Mark that we've shown the warning
      RC.resolutionWarningShown = true

      // Hide the resolution setting message before showing the popup
      hideResolutionSettingMessage()

      // Store fullscreen state and exit fullscreen before showing popup
      const wasInFullscreen = isFullscreen()
      if (wasInFullscreen) {
        console.log('Exiting fullscreen before showing resolution popup')
        await exitFullscreen()
        // Minimal wait for fullscreen to exit
        await new Promise(resolve => setTimeout(resolve, 50))
      }

      // Hide the grey face feedback box BEFORE showing the popup
      const webgazerFaceFeedbackBox = document.getElementById(
        'webgazerFaceFeedbackBox',
      )
      if (webgazerFaceFeedbackBox) {
        webgazerFaceFeedbackBox.style.display = 'none'
      }

      const popupTextAlign = RC.LD === RC._CONST.RTL ? 'right' : 'left'

      await Swal.fire({
        ...swalInfoOptions(RC, { showIcon: false }),
        title: processInlineFormatting(
          phrases.RC_ImprovingCameraResolutionTitle[RC.L],
        ),
        html: `
            <div style="text-align: ${popupTextAlign}; direction: ${RC.LD === RC._CONST.RTL ? 'rtl' : 'ltr'}; margin: 1rem 0; padding: 0;">
              <p style="margin: 0; padding: 0; text-align: ${popupTextAlign}; font-style: normal;"> ${processInlineFormatting(phrases.RC_ImprovingCameraResolution[RC.L].replace('𝟙𝟙𝟙', width).replace('𝟚𝟚𝟚', height))}</p>
            </div>
          `,
        showCancelButton: false,
        confirmButtonText: phrases.RC_OK[RC.L],
        customClass: {
          popup: 'my__swal2__container',
          title: 'my__swal2__title',
          htmlContainer: `my__swal2__html rc-lang-${RC.LD.toLowerCase()}`,
          confirmButton: 'rc-button rc-go-button',
        },
        didOpen: () => {
          // Force left alignment for title and content while keeping vertical margins
          const titleElement = document.querySelector('.swal2-title')
          const htmlContainer = document.querySelector('.swal2-html-container')
          if (titleElement) {
            titleElement.style.textAlign = 'left'
            // Keep original vertical margins for title
            titleElement.style.marginLeft = '0'
            titleElement.style.marginRight = '0'
            titleElement.style.padding = '0'
          }
          if (htmlContainer) {
            htmlContainer.style.textAlign = popupTextAlign
            // Keep original vertical margins for content
            htmlContainer.style.marginLeft = '0'
            htmlContainer.style.marginRight = '0'
            htmlContainer.style.padding = '0'
          }
        },
        allowOutsideClick: false,
        allowEscapeKey: false,
      })

      // After user clicks OK, prioritize fullscreen re-entry and run resolution improvement in parallel
      console.log('User clicked OK, processing...')

      // Start both operations in parallel for better performance
      const operations = []

      // Priority 1: Re-enter fullscreen immediately if needed
      if (wasInFullscreen) {
        console.log('Re-entering fullscreen after resolution popup')
        operations.push(
          getFullscreen(RC.L, RC)
            .then(() => console.log('Successfully re-entered fullscreen'))
            .catch(error =>
              console.error('Failed to re-enter fullscreen:', error),
            ),
        )
      }

      // Priority 2: Attempt resolution improvement in parallel
      const activeCamera = RC.gazeTracker?.webgazer?.params?.activeCamera
      if (activeCamera?.id) {
        console.log('Attempting to apply ideal resolution constraints again...')
        operations.push(
          applyIdealResolutionConstraints(RC, activeCamera.id)
            .then(() => console.log('Resolution improvement completed'))
            .catch(error =>
              console.error('Resolution improvement failed:', error),
            ),
        )
      }

      // Wait for all operations to complete (but don't block on resolution improvement)
      if (operations.length > 0) {
        await Promise.allSettled(operations)
      }

      // Re-show the resolution setting message after the popup closes
      // only if _showCameraResolutionBool is not explicitly false
      if (options._showCameraResolutionBool === true) {
        showResolutionSettingMessage(RC)
      }
    }
  }

  return true // Continue normally
}

/**
 * Gets the currently active camera from webgazer
 * @param {Object} RC - RemoteCalibrator instance
 * @returns {Object|null} - Current active camera or null
 */
const getCurrentActiveCamera = RC => {
  if (!RC.gazeTracker?.webgazer?.params?.activeCamera) {
    return null
  }

  return {
    deviceId: RC.gazeTracker.webgazer.params.activeCamera.id,
    label: RC.gazeTracker.webgazer.params.activeCamera.label,
  }
}

/**
 * Attempts to switch to a new camera with error handling and ideal resolution optimization
 * @param {Object} RC - RemoteCalibrator instance
 * @param {Object} selectedCamera - Camera to switch to
 * @returns {Promise<boolean>} - True if successful, false otherwise
 */
const switchToCamera = async (RC, selectedCamera) => {
  if (!RC.gazeTracker?.webgazer || !selectedCamera) {
    return false
  }

  try {
    // Update webgazer camera parameters
    RC.gazeTracker.webgazer.params.activeCamera.label = selectedCamera.label
    RC.gazeTracker.webgazer.params.activeCamera.id = selectedCamera.deviceId

    // Update camera constraints if webgazer is already running
    if (RC.gazeTracker.webgazer.params.videoIsOn) {
      // Use known resolution from preview to skip re-probing
      const knownRes = selectedCamera.resolution || null

      console.log(
        `Switching to camera: ${selectedCamera.label}` +
          (knownRes
            ? ` (known: ${knownRes.width}x${knownRes.height})`
            : ' (probing)'),
      )

      await RC.gazeTracker.webgazer.setCameraConstraints(
        {
          video: {
            deviceId: { exact: selectedCamera.deviceId },
            facingMode: 'user',
          },
        },
        knownRes, // Pass known resolution to skip probing
      )
    }

    return true
  } catch (error) {
    console.error('Failed to switch camera:', error)
    return false
  }
}

/**
 * Creates video previews for all available cameras
 * @param {Array} cameras - Array of camera devices
 * @param {Object} RC - RemoteCalibrator instance
 * @param {Function} onCameraSelect - Callback when camera is selected
 * @param {Object} currentActiveCamera - Currently active camera
 * @returns {Promise<string>} - HTML string with video previews
 */
const createCameraPreviews = async (
  cameras,
  RC,
  onCameraSelect,
  currentActiveCamera,
  acceptBottomBool = false,
) => {
  if (cameras.length === 0) {
    return '<p style="color: #666; font-style: italic;">No cameras detected</p>'
  }

  // Responsive preview sizing: max matches original, scales down for small windows.
  //
  // We resolve the size to CONCRETE PIXEL VALUES at render time (rather
  // than using `clamp(... 18vw ...)`) so the top-row and bottom-row
  // previews are guaranteed to render at exactly the same dimensions.
  // The bottom row is promoted to <body> after the popup opens, which
  // can change how CSS units / parent containing blocks resolve --
  // using fixed pixels keeps both rows identical no matter where the
  // wrapper ends up living.
  const videoContainer = document.getElementById('webgazerVideoContainer')
  const maxW = videoContainer
    ? Math.round(Number.parseInt(videoContainer.style.width || '320') * 0.85)
    : 272
  const maxH = videoContainer
    ? Number.parseInt(videoContainer.style.height || '240')
    : 240
  const viewportW =
    window.innerWidth ||
    document.documentElement?.clientWidth ||
    1024
  const previewWidthPx = Math.round(
    Math.min(maxW, Math.max(120, viewportW * 0.18)),
  )
  const previewHeightPx = Math.round(
    Math.min(maxH, Math.max(90, viewportW * 0.135)),
  )
  const previewSize = {
    width: `${previewWidthPx}px`,
    height: `${previewHeightPx}px`,
  }

  const isRTL = RC.LD === RC._CONST.RTL

  // Outer wrapper centers the video group
  let previewsHTML = `<div id="rc-camera-previews-outer" style="display: flex; justify-content: center; width: 100%;">`

  // Inner wrapper holds the video group.
  previewsHTML += `<div style="display: inline-flex; overflow: visible;">`

  // Videos row
  previewsHTML += `<div style="display: flex; flex-wrap: nowrap; gap: 10px; align-items: center;">`

  for (let i = 0; i < cameras.length; i++) {
    const camera = cameras[i]
    const previewId = `camera-preview-${i}`
    const isActive =
      currentActiveCamera && currentActiveCamera.deviceId === camera.deviceId

    const cleanLabel = _stripHexId(camera.label || `Camera ${i + 1}`)
    const initialCaption = _cameraCaptionHTML(
      camera.label || `Camera ${i + 1}`,
      camera.resolution,
      RC,
      camera.incorporation,
    )

    previewsHTML += `
      <div 
        id="camera-preview-container-${i}"
        class="camera-preview-container"
        data-device-id="${camera.deviceId}"
        data-camera-label="${cleanLabel}"
        data-camera-row="top"
        style="display: flex; flex-direction: column; align-items: center; margin: 0; padding: 5px; border-radius: 8px; transition: all 0.2s ease; box-sizing: border-box; ${isActive ? 'background-color: #e8f5e8; border: 2px solid #28a745;' : 'border: 2px solid transparent;'}"
      >
        <video 
          id="${previewId}" 
          style="width: ${previewSize.width}; height: ${previewSize.height}; border: 2px solid #ccc; border-radius: 4px; object-fit: cover; pointer-events: none; box-sizing: border-box;"
          autoplay 
          muted 
          playsinline
        ></video>
        <div class="rc-camera-caption" style="margin-top: 5px; font-size: 12px; text-align: center; max-width: ${previewSize.width}; word-wrap: break-word; white-space: normal; color: ${isActive ? '#28a745' : '#666'}; font-weight: ${isActive ? 'bold' : 'normal'}; line-height: 1.4;">
          ${initialCaption}
        </div>
      </div>
    `
  }

  // Close the videos flex row
  previewsHTML += '</div>'

  // Close inner relative wrapper + outer centering wrapper
  previewsHTML += '</div></div>'

  // ---- Optional bottom row of camera previews (Feature B) ----
  // Only rendered when the experiment opts in via
  // `calibrateDistanceAcceptBottomCameraBool === true`. Mirrors the
  // top row with the same set of cameras. Anchored to the bottom of the
  // viewport via `position: fixed` so participants whose built-in
  // camera is at the bottom of the screen can pick the video they see
  // themselves looking at.
  //
  // High z-index keeps the row above any other UI on the page. The
  // wrapper is later promoted to <body> via
  // `_promoteCameraPreviewsBottomToBody()` so its `position: fixed`
  // resolves relative to the viewport.
  if (acceptBottomBool) {
    // Column flex so the explanation sits centered above the videos.
    const bottomCaptionText =
      phrases?.RC_BottomCameras?.[RC.L];
    previewsHTML += `<div id="rc-camera-previews-bottom-outer" style="position: fixed; bottom: 0; left: 0; right: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; padding: 0; box-sizing: border-box; z-index: 9147483649; pointer-events: auto;">`
    previewsHTML += `
      <div id="rc-bottom-cameras-caption" style="width: 100%; box-sizing: border-box; padding: 0 30px; text-align: ${isRTL ? 'right' : 'left'}; color: #444; font-size: clamp(12px, 1.6vw, 16px); font-weight: 300; line-height: 1.4; margin: 0 0 0.5rem 0; direction: ${isRTL ? 'rtl' : 'ltr'};">
        ${processInlineFormatting(bottomCaptionText)}
      </div>
    `
    previewsHTML += `<div style="display: flex; flex-wrap: nowrap; gap: 10px; align-items: center;">`

    for (let i = 0; i < cameras.length; i++) {
      const camera = cameras[i]
      const previewBottomId = `camera-preview-bottom-${i}`
      // Bottom tile renders neutral by default -- only the matching
      // top tile shows the green active-camera highlight on initial
      // render. Hover highlights only the tile under the cursor; after a
      // committed click, `_applyCommittedCameraHighlight` greens only
      // the chosen row.
      const cleanLabel = _stripHexId(camera.label || `Camera ${i + 1}`)
      const initialCaption = _cameraCaptionHTML(
        camera.label || `Camera ${i + 1}`,
        camera.resolution,
        RC,
        camera.incorporation,
      )

      previewsHTML += `
        <div 
          id="camera-preview-container-bottom-${i}"
          class="camera-preview-container camera-preview-container-bottom"
          data-device-id="${camera.deviceId}"
          data-camera-label="${cleanLabel}"
          data-camera-row="bottom"
          style="display: flex; flex-direction: column-reverse; align-items: center; margin: 0; padding: 5px 5px 0 5px; border-radius: 8px; transition: all 0.2s ease; box-sizing: border-box; border: 2px solid transparent;"
        >
          <video 
            id="${previewBottomId}" 
            style="width: ${previewSize.width}; height: ${previewSize.height}; border: 2px solid #ccc; border-radius: 4px; object-fit: cover; pointer-events: none; box-sizing: border-box; transform: scaleX(-1);"
            autoplay 
            muted 
            playsinline
          ></video>
          <div class="rc-camera-caption" style="margin-top: 5px; font-size: 12px; text-align: center; max-width: ${previewSize.width}; word-wrap: break-word; white-space: normal; color: #666; font-weight: normal; line-height: 1.4;">
            ${initialCaption}
          </div>
        </div>
      `
    }

    previewsHTML += '</div></div>'
  }

  // Start video streams for all cameras in PARALLEL with optimized
  // resolution. The same MediaStream object is shared with the bottom
  // row's <video> when the bottom row is rendered, to avoid opening a
  // second getUserMedia per camera.
  //
  // Read the experiment-requested frame rate from webgazer.params and
  // forward it to getUserMedia as `frameRate: { ideal: desiredHz }`
  // (when set). Without this, the browser opens the tile preview at
  // whatever the camera's default rate is (typically 30 Hz) and the
  // tile caption shows 30 Hz even when the study spreadsheet asked for
  // a different rate. With the constraint, the browser snaps to the
  // closest supported value and the caption shows it.
  const desiredHz = RC?.gazeTracker?.webgazer?.params?.desiredCameraHz
  const frameRateConstraint =
    typeof desiredHz === 'number' && desiredHz > 0
      ? { frameRate: { ideal: desiredHz } }
      : {}
  setTimeout(() => {
    cameras.forEach(async (camera, i) => {
      const videoElement = document.getElementById(`camera-preview-${i}`)
      const bottomVideoElement = acceptBottomBool
        ? document.getElementById(`camera-preview-bottom-${i}`)
        : null
      const container = document.getElementById(`camera-preview-container-${i}`)
      const bottomContainer = acceptBottomBool
        ? document.getElementById(`camera-preview-container-bottom-${i}`)
        : null
      const captionDiv = container?.querySelector('.rc-camera-caption')
      const bottomCaptionDiv = bottomContainer?.querySelector(
        '.rc-camera-caption',
      )

      if (videoElement) {
        try {
          // Use optimized constraints: min 1920, fallback to 1280, then ideal-only
          let stream
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: {
                deviceId: { exact: camera.deviceId },
                width: { min: 1920, ideal: 7680 },
                height: { min: 1080, ideal: 4320 },
                aspectRatio: { min: 1.33, ideal: 1.78, max: 2.33 },
                ...frameRateConstraint,
              },
            })
          } catch (fullHDError) {
            try {
              stream = await navigator.mediaDevices.getUserMedia({
                video: {
                  deviceId: { exact: camera.deviceId },
                  width: { min: 1280, ideal: 7680 },
                  height: { min: 720, ideal: 4320 },
                  aspectRatio: { min: 1.33, ideal: 1.78, max: 2.33 },
                  ...frameRateConstraint,
                },
              })
            } catch (hdError) {
              stream = await navigator.mediaDevices.getUserMedia({
                video: {
                  deviceId: { exact: camera.deviceId },
                  width: { ideal: 1920 },
                  height: { ideal: 1080 },
                  ...frameRateConstraint,
                },
              })
            }
          }

          videoElement.srcObject = stream
          // Share the same stream with the bottom row.
          if (bottomVideoElement) {
            bottomVideoElement.srcObject = stream
          }

          // Get resolution + frame rate and update caption
          const videoTrack = stream.getVideoTracks()[0]
          if (videoTrack) {
            const settings = videoTrack.getSettings()
            const width = settings.width || 0
            const height = settings.height || 0
            const frameRate = settings.frameRate
              ? Math.round(settings.frameRate)
              : 0
            camera.resolution = { width, height, frameRate }
            const captionHTML = _cameraCaptionHTML(
              camera.label || `Camera ${i + 1}`,
              camera.resolution,
              RC,
              camera.incorporation,
            )
            if (captionDiv) captionDiv.innerHTML = captionHTML
            if (bottomCaptionDiv) bottomCaptionDiv.innerHTML = captionHTML
          }
        } catch (error) {
          console.error(
            `Failed to get stream for camera ${camera.label}:`,
            error,
          )
          videoElement.style.border = '2px solid #dc3545'
          videoElement.style.backgroundColor = '#f8d7da'
          if (bottomVideoElement) {
            bottomVideoElement.style.border = '2px solid #dc3545'
            bottomVideoElement.style.backgroundColor = '#f8d7da'
          }
        }
      }
    })
  }, 100)

  return previewsHTML
}

/**
 * Updates title and description based on camera count
 * @param {Object} RC - RemoteCalibrator instance
 * @param {string} titleKey - titleKey to retrieve the phrase
 * @param {string} messageKey - messageKey to retrieve the phrase
 * @param {string} privacyMessage - privacyMessage
 */
const updateTitleAndDescription = (RC, titleKey, messageKey) => {
  showCameraTitleInTopRight(RC, titleKey)
  const messageDiv = document.getElementById('rc-camera-instruction-text')
  if (messageDiv) {
    messageDiv.innerHTML = processInlineFormatting(
      phrases[messageKey]?.[RC.L] ?? '',
    ).replace(/\n/g, '<br>')
  }
}

/**
 * Updates camera previews when camera list changes
 * @param {Array} newCameras - Updated array of camera devices
 * @param {Object} RC - RemoteCalibrator instance
 * @param {Object} currentActiveCamera - Currently active camera
 * @param {Array} oldCameras - Previous array of camera devices
 * @param {string} privacyMessage - privacy message
 */
const updateCameraPreviews = async (
  newCameras,
  RC,
  currentActiveCamera,
  oldCameras = [],
  privacyMessage,
) => {
  const previewContainer = document.querySelector(
    '.camera-selection-popup .swal2-html-container',
  )
  if (!previewContainer) return

  // Read whether the bottom row is enabled. We stored it on RC when the
  // popup first opened so updateCameraPreviews doesn't need a new
  // parameter.
  const acceptBottomBool = RC.calibrateDistanceAcceptBottomCameraBool === true

  // Stop old video streams (top row only -- the bottom row shares the
  // top row's stream object, so stopping the top tracks releases
  // everything). Detach any srcObject from the bottom video too so the
  // <video> doesn't keep a dangling reference.
  oldCameras.forEach((camera, index) => {
    const videoElement = document.getElementById(`camera-preview-${index}`)
    if (videoElement && videoElement.srcObject) {
      const stream = videoElement.srcObject
      stream.getTracks().forEach(track => track.stop())
    }
    const bottomVideoElement = document.getElementById(
      `camera-preview-bottom-${index}`,
    )
    if (bottomVideoElement) {
      bottomVideoElement.srcObject = null
    }
  })

  // Create new previews HTML (includes BOTH top and bottom row wrappers
  // when the bottom row is enabled).
  const newPreviewsHTML = await createCameraPreviews(
    newCameras,
    RC,
    null,
    currentActiveCamera,
    acceptBottomBool,
  )

  // Replace the entire previews outer wrapper (arrow + videos + button)
  // and the separate bottom-row wrapper. The new HTML contains both, so
  // we remove the old bottom wrapper first (it might be on <body> from
  // _promoteCameraPreviewsBottomToBody) and then swap the top wrapper's
  // outerHTML, which inserts both new wrappers as siblings in the same
  // parent the old top wrapper lived in.
  const oldBottomOuter = document.getElementById(
    'rc-camera-previews-bottom-outer',
  )
  if (oldBottomOuter) oldBottomOuter.remove()

  const oldPreviewsOuter = document.getElementById('rc-camera-previews-outer')
  if (oldPreviewsOuter) {
    oldPreviewsOuter.outerHTML = newPreviewsHTML
  }

  // Keep body text direction correct after re-rendering camera preview DOM.
  _applyChooseCameraPageTextDirection(RC)

  // Re-paint the instruction text using the same builders the initial
  // didOpen render uses, so the `[[BBB]]` placeholder gets substituted
  // with the live "Choose another screen" / "Choose this screen"
  // button. Calling the old updateTitleAndDescription here was the
  // source of the "button disappears, [[BBB]] becomes visible" bug:
  // it wrote the raw phrase straight into the DOM without performing
  // the placeholder substitution, so whenever camera-list polling
  // detected a transient change (hot-plug, deviceId churn after the
  // permission prompt resolves, etc.) the participant lost the button.
  const inChooseScreenMode = RC._inChooseScreenMode === true
  const titleKey = inChooseScreenMode
    ? 'RC_ChooseScreenTitle'
    : 'RC_ChooseCameraTitle'
  showCameraTitleInTopRight(RC, titleKey)
  const instructionDivForRepaint = document.getElementById(
    'rc-camera-instruction-text',
  )
  if (instructionDivForRepaint) {
    const buildInstruction = inChooseScreenMode
      ? RC._getChooseScreenInstructionHTML
      : RC._getChooseCameraInstructionHTML
    if (typeof buildInstruction === 'function') {
      instructionDivForRepaint.innerHTML = buildInstruction()
    } else {
      // Fallback: the builders should always be stashed by didOpen, but
      // if a re-render somehow races the first paint, still strip the
      // unresolved [[BBB]] token so a raw placeholder never reaches the
      // participant.
      const messageKey = inChooseScreenMode
        ? 'RC_ChooseScreen'
        : 'RC_ChooseCamera'
      instructionDivForRepaint.innerHTML = processInlineFormatting(
        phrases[messageKey]?.[RC.L] ?? '',
      )
        .replace(/\[\[BBB\]\]/g, '')
        .replace(/\n/g, '<br>')
    }
  }
  if (typeof RC._bindScreenToggleButton === 'function') {
    RC._bindScreenToggleButton()
  }

  // Re-add event listeners for new previews, on BOTH rows. Hover only
  // lights up the hovered tile (the one the participant is pointing
  // at) -- the matching tile in the other row stays neutral so a
  // single visual cue tracks the cursor.
  newCameras.forEach((camera, index) => {
    const containers = _getCameraContainersForIndex(index)

    for (const container of containers) {
      // Hover highlight - treat as tentative selection
      container.addEventListener('mouseenter', async () => {
        // The Choose screen page must not indicate any video
        // selection -- skip hover highlight + tentative camera switch
        // entirely while the participant is picking which screen.
        if (RC._inChooseScreenMode) return

        const deviceId = container.getAttribute('data-device-id')
        RC.highlightedCameraDeviceId = deviceId
        // Track which row the participant is interacting with so
        // Feature C can map the selection to top vs bottom cameraXYPx.
        const hoveredRow = container.getAttribute('data-camera-row') || 'top'
        RC.highlightedCameraRow = hoveredRow

        // Clear highlight on every tile in BOTH rows...
        for (let j = 0; j < newCameras.length; j++) {
          _applyCameraContainerState(j, 'normal', 'both')
        }
        // ...then highlight only the hovered tile (specific row).
        _applyCameraContainerState(index, 'highlight', hoveredRow)

        const selectedCamera = newCameras.find(
          cam => cam.deviceId === deviceId,
        )
        if (selectedCamera && RC.gazeTracker?.webgazer) {
          try {
            await switchToCamera(RC, selectedCamera)
          } catch (error) {
            console.error('Tentative camera switch error:', error)
          }
        }
      })

      // Click to commit (same as clicking OK).
      //
      // Mirrors the click handler installed in showCameraSelectionPopup's
      // didOpen for the initial camera list: when the chosen camera is
      // classified `unknown`, run the inline overlay
      // (askCameraIncorporationOpinion) BEFORE closing Choose Camera so
      // the question appears as a modal on top of this page. Without
      // this branch the post-selection fallback in showTestPopup runs
      // the legacy Swal version of the question, which is the
      // standalone popup that shouldn't appear here.
      container.addEventListener('click', async () => {
        if (RC.cameraSelectionLoading) {
          return
        }

        const deviceId = container.getAttribute('data-device-id')
        const label = container.getAttribute('data-camera-label')
        RC.selectedCameraRow =
          container.getAttribute('data-camera-row') || 'top'

        RC.cameraSelectionLoading = true
        _setAllCameraContainersDisabled(newCameras, true)

        console.log(
          '[ChooseCamera/Polled] Tile clicked (post-rerender). label:',
          label,
          'deviceId:',
          deviceId,
        )
        await window.selectCamera(deviceId, label)
        console.log(
          '[ChooseCamera/Polled] After selectCamera. RC.cameraIncorporation:',
          RC.cameraIncorporation,
        )
        if (RC.cameraIncorporation === 'unknown') {
          const opinionResult = await askCameraIncorporationOpinion(RC, {
            renderAboveChooseCamera: true,
          })
          if (opinionResult === RC_CAMERA_OPINION_CHOOSE_AGAIN) {
            return
          }
          console.log(
            '[ChooseCamera/Polled] Returned from unknown overlay.',
            'cameraIncorporationReported:',
            RC.cameraIncorporationReported,
            'RC.selectedCamera:',
            RC.selectedCamera?.label,
          )
        }
        Swal.clickConfirm()
      })
    }
  })

  // Defensive fallback: if RC._bindScreenToggleButton wasn't available
  // above (e.g. a polling tick raced the first didOpen paint), still
  // wire up the "Choose another screen" button so the toggle works.
  if (typeof RC._bindScreenToggleButton !== 'function') {
    const newScreenBtn = document.getElementById(
      'rc-choose-another-screen-btn',
    )
    if (newScreenBtn && window._rcScreenBtnHandler) {
      newScreenBtn.onclick = window._rcScreenBtnHandler
    }
  }

  // The bottom-row wrapper was just re-inserted as a sibling of the top
  // row inside the Swal popup. Promote it back to <body> so its
  // `position: fixed; bottom: 0` resolves relative to the viewport.
  if (acceptBottomBool) {
    _promoteCameraPreviewsBottomToBody()
    _syncBottomCaptionWidthWithTopLayout()
  }
}

/**
 * Shows a popup with camera selection dropdown
 * @param {Object} RC - RemoteCalibrator instance
 * @param {string} title - Popup title
 * @param {string} message - Popup message
 * @param {string} privacyMessage - privacy message
 * @param {Function} onClose - Callback function when popup is closed
 * @param {string} titleKey - titleKey to retrieve corresponding phrase
 * @returns {Promise} - Promise that resolves when popup is closed with selected camera
 */
export const showCameraSelectionPopup = async (
  RC,
  title,
  message,
  privacyMessage,
  onClose = null,
  titleKey = 'RC_ChooseCameraTitle',
  acceptBottomBool = false,
) => {
  // Defensive cleanup: if a previous Choose Camera popup left behind
  // stale body-level elements (camera title, bottom-row preview wrapper,
  // unknown-camera overlay), wipe them now BEFORE this new popup is
  // built. Without this, a reconnect cycle that restarts showTestPopup
  // can leave duplicate bottom-row tiles and overlapping captions on
  // the page. See bug report from 2026-05-08 (camera disconnected
  // during the unknown-camera modal).
  console.log(
    '[CameraSelectionPopup] Defensive cleanup of stale body-level elements before opening new popup',
  )
  hideCameraTitleFromTopRight()
  _removeCameraPreviewsBottom()
  const staleOpinionOverlay = document.getElementById(
    'rc-camera-opinion-overlay',
  )
  if (staleOpinionOverlay) staleOpinionOverlay.remove()

  // Title will be shown in didOpen callback to avoid flash before popup renders

  // Stash the bottom-camera support flag on RC so updateCameraPreviews
  // (called by polling when the camera list changes) and the rest of
  // this popup's helpers can read it without needing the parameter.
  RC.calibrateDistanceAcceptBottomCameraBool = acceptBottomBool === true
  // Default selectedCameraRow to 'top' until the participant clicks.
  if (RC.selectedCameraRow !== 'bottom') RC.selectedCameraRow = 'top'

  // Store current video visibility state
  const originalVideoState = {
    showVideo: RC.gazeTracker?.webgazer?.params?.showVideo ?? true,
    showFaceOverlay: RC.gazeTracker?.webgazer?.params?.showFaceOverlay ?? true,
    showFaceFeedbackBox:
      RC.gazeTracker?.webgazer?.params?.showFaceFeedbackBox ?? true,
  }

  // Store original z-index of video container
  const videoContainer = document.getElementById('webgazerVideoContainer')
  const originalZIndex = videoContainer?.style?.zIndex || '999999997'

  // Ensure video preview is visible during popup
  if (RC.gazeTracker?.webgazer) {
    RC.gazeTracker.webgazer.showVideo(true)
    RC.gazeTracker.webgazer.showFaceOverlay(true)
    RC.gazeTracker.webgazer.showFaceFeedbackBox(true)
  }

  // Temporarily increase z-index of video container to ensure it stays above popup
  if (videoContainer) {
    videoContainer.style.zIndex = '9999999999'
  }

  // Hide the main video preview when camera selection popup opens
  const mainVideoContainer = document.getElementById('webgazerVideoContainer')
  // Always restore to 'block' after popup closes (video may be hidden during init)
  const originalMainVideoDisplay = 'block'
  if (mainVideoContainer) {
    mainVideoContainer.style.display = 'none'
  }

  // Prefer the pre-filtered list from showTestPopup; enumerate as fallback.
  let cameras = RC._visibleCameras
  if (!cameras || cameras.length === 0) {
    const kindOverride = _resolveCameraKindOverride(
      RC,
      RC._cameraSelectionOptions,
    )
    const allCameras = await getAvailableCameras(kindOverride)
    if (!RC.availableCameras) RC.availableCameras = allCameras
    if (!RC.cameraArray) {
      RC.cameraArray = allCameras.map(c => ({
        name: c.label || '',
        class: c.incorporation,
        builtInScore: c.builtInScore,
        externalScore: c.externalScore,
        likelyBuiltIn: c.likelyBuiltIn,
        kindOverrideApplied: c.kindOverrideApplied === true,
        opinion: null,
      }))
    }
    cameras = allCameras
  }

  // Get current active camera
  const currentActiveCamera = getCurrentActiveCamera(RC)

  // Create camera previews (top row + optional bottom row)
  const cameraPreviewsHTML = await createCameraPreviews(
    cameras,
    RC,
    null,
    currentActiveCamera,
    RC.calibrateDistanceAcceptBottomCameraBool,
  )

  // Title will be shown in top right of webpage instead of popup

  // Calculate dynamic maxWidth based on number of cameras
  // Each camera preview is approximately 280px wide (272px + padding + margins)
  // Allow the popup to expand to fit all cameras without artificial width limits.
  const cameraPreviewWidth = 272 // Actual video width
  const cameraPadding = 10 // Padding around each camera
  const cameraMargin = 5 // Margin between cameras
  const totalCameraWidth = cameraPreviewWidth + cameraPadding * 2 + cameraMargin
  const minWidth = 600 // Minimum width for 2 cameras
  const calculatedWidth = Math.max(
    minWidth,
    totalCameraWidth * cameras.length + 100,
  )
  const dynamicMaxWidth = `${calculatedWidth}px`

  const result = await Swal.fire({
    ...swalInfoOptions(RC, { showIcon: false }),
    icon: undefined,
    title: '', // Remove the default title since we're adding our own
    html: `
      <div style="display: flex; flex-direction: column; align-items: center; height: 100%; max-height: 100vh; overflow: visible; box-sizing: border-box;">
        <div style="flex: 1 1 auto; min-height: 0; display: flex; align-items: center; justify-content: center; width: 100%;">
          ${cameraPreviewsHTML}
        </div>
        <div id="rc-camera-instruction-text" style="background: transparent; padding: 0.5rem 30px; margin-top: 0.5rem; flex-shrink: 0; text-align: ${RC.LD === RC._CONST.RTL ? 'right' : 'left'}; direction: ${RC.LD === RC._CONST.RTL ? 'rtl' : 'ltr'}; width: 100%; box-sizing: border-box; align-self: flex-start;">${processInlineFormatting(message || '').replace(/\n/g, '<br>')}</div>
        ${privacyMessage ? `<div id="rc-camera-privacy-text" style="font-size: ${(16 / 1.4) * 1.25}px; direction: ${RC.LD === RC._CONST.RTL ? 'rtl' : 'ltr'}; line-height: 1.4; white-space: pre-line; width: 100%; text-align: ${RC.LD === RC._CONST.RTL ? 'right' : 'left'}; flex-shrink: 0; margin-top: 12px; padding: 0 30px 0.5rem 30px; align-self: flex-start; box-sizing: border-box;">${processInlineFormatting(privacyMessage).replace(/\n/g, '<br>')}</div>` : ''}
      </div>
    `,
    showConfirmButton: false,
    allowEnterKey: false, // To be changed
    // Dynamic popup width based on number of cameras
    width: dynamicMaxWidth,
    background: 'transparent',
    backdrop: '#eee',
    showClass: { popup: '' },
    hideClass: { popup: '' },
    customClass: {
      popup: 'my__swal2__container camera-selection-popup camera-no-overlay',
      icon: 'my__swal2__icon',
      title: 'my__swal2__title',
      htmlContainer: `my__swal2__html rc-lang-${RC.LD.toLowerCase()}`,
      confirmButton: 'rc-button rc-go-button',
    },
    didOpen: () => {
      // Make popup seamless with background and responsive
      const popup = Swal.getPopup()
      if (popup) {
        popup.style.boxShadow = 'none'
        popup.style.border = 'none'
        popup.style.outline = 'none'
        popup.style.borderRadius = '0'
        popup.style.maxHeight = '100vh'
        popup.style.overflow = 'visible'
      }
      const htmlContainer = popup?.querySelector('.swal2-html-container')
      if (htmlContainer) {
        htmlContainer.style.maxHeight = 'calc(100vh - 2rem)'
        htmlContainer.style.overflow = 'visible'
      }

      // Move the bottom-row preview wrapper out of the Swal popup and
      // onto <body> so its `position: fixed; bottom: 0` resolves
      // relative to the viewport. Inside the Swal popup, Swal's own
      // CSS turns the popup into a containing block and the bottom row
      // ends up rendering somewhere in the middle of the page instead.
      // No-op when the bottom row was not rendered.
      if (RC.calibrateDistanceAcceptBottomCameraBool) {
        _promoteCameraPreviewsBottomToBody()
        _syncBottomCaptionWidthWithTopLayout()
      }

      // Show the camera title now that the popup is visible
      showCameraTitleInTopRight(RC, titleKey)
      _applyChooseCameraPageTextDirection(RC)

      // --- "Choose another screen" / "Choose this screen" toggle ---
      let isInChooseAnotherScreenMode = false

      // Title key currently painted into the top-right page header.
      // Mutated by the screen-toggle handler so the language-change
      // subscription below knows whether to re-translate as
      // "Choose camera" or "Choose screen".
      let currentTitleKey = titleKey

      // Re-derive the Choose-Camera instruction HTML at call time so a
      // language change that happens after this popup opens picks up
      // the new translation. The `message` parameter snapshot was the
      // bug -- it locked in whatever language was active at the moment
      // showTestPopup ran.
      const makeInlineActionButtonHTML = (id, label) => {
        const buttonLabel = processInlineFormatting(label || '')
        return `<button id="${id}" class="rc-button rc-go-button" style="font-size: 1rem !important; padding: 0.5rem 2rem !important; margin: 0 0.2rem;">${buttonLabel}</button>`
      }
      const getChooseCameraInstructionHTML = () => {
        const template =
          phrases.RC_ChooseCamera?.[RC.L] || message || ''
        const buttonHTML = makeInlineActionButtonHTML(
          'rc-choose-another-screen-btn',
          phrases.RC_ChooseAnotherScreenButton?.[RC.L] ||
            'Choose another screen',
        )
        return processInlineFormatting(template)
          .replace('[[BBB]]', buttonHTML)
          .replace(/\n/g, '<br>')
      }
      const getChooseScreenInstructionHTML = () => {
        const template =
          phrases.RC_ChooseScreen?.[RC.L] ||
          phrases.RC_DragToAnotherScreen?.[RC.L] ||
          'Drag this window to another screen.'
        const buttonHTML = makeInlineActionButtonHTML(
          'rc-choose-this-screen-btn',
          phrases.RC_ChooseThisScreenButton?.[RC.L] || 'Choose this screen',
        )
        return processInlineFormatting(template)
          .replace('[[BBB]]', buttonHTML)
          .replace(/\n/g, '<br>')
      }
      const bindScreenToggleButton = () => {
        const chooseAnotherScreenBtn = document.getElementById(
          'rc-choose-another-screen-btn',
        )
        if (chooseAnotherScreenBtn) {
          chooseAnotherScreenBtn.onclick = screenBtnHandler
        }
        const chooseThisScreenBtn = document.getElementById(
          'rc-choose-this-screen-btn',
        )
        if (chooseThisScreenBtn) {
          chooseThisScreenBtn.onclick = screenBtnHandler
        }
      }
      const screenBtnHandler = async () => {
        const instrDiv = document.getElementById('rc-camera-instruction-text')
        if (!instrDiv) return

        if (!isInChooseAnotherScreenMode) {
          isInChooseAnotherScreenMode = true
          // Stash on RC so the re-attached hover listeners inside
          // updateCameraPreviews (driven by camera-list polling) can
          // also see we're on the Choose screen page.
          RC._inChooseScreenMode = true
          await exitFullscreen()
          if (instrDiv) {
            instrDiv.innerHTML = getChooseScreenInstructionHTML()
          }
          bindScreenToggleButton()
          _applyChooseCameraPageTextDirection(RC)
          currentTitleKey = 'RC_ChooseScreenTitle'
          showCameraTitleInTopRight(RC, currentTitleKey)

          // The Choose screen page must not indicate any video
          // selection -- clear every highlight so no tile looks active
          // while the participant is choosing which screen to use. The
          // mouseenter handler below also short-circuits in this mode
          // so hover doesn't re-light a tile.
          for (let j = 0; j < cameras.length; j++) {
            _applyCameraContainerState(j, 'normal', 'both')
          }

          // Hide privacy text while on Choose Screen mode.
          const privacyText = document.getElementById('rc-camera-privacy-text')
          if (privacyText) privacyText.style.display = 'none'
        } else {
          isInChooseAnotherScreenMode = false
          RC._inChooseScreenMode = false
          await getFullscreen(RC.L, RC)
          if (instrDiv) {
            instrDiv.innerHTML = getChooseCameraInstructionHTML()
          }
          bindScreenToggleButton()
          _applyChooseCameraPageTextDirection(RC)
          const privacyText = document.getElementById('rc-camera-privacy-text')
          if (privacyText) privacyText.style.display = ''
          currentTitleKey = titleKey
          showCameraTitleInTopRight(RC, currentTitleKey)

          // Restore the default Choose Camera highlight: top tile of
          // the currently active camera, all other tiles neutral.
          if (currentActiveCamera) {
            const activeIndex = cameras.findIndex(
              c => c.deviceId === currentActiveCamera.deviceId,
            )
            if (activeIndex >= 0) {
              _applyCameraContainerState(activeIndex, 'highlight', 'top')
            }
          }
        }
      }

      const instructionDiv = document.getElementById('rc-camera-instruction-text')
      if (instructionDiv) {
        instructionDiv.innerHTML = getChooseCameraInstructionHTML()
      }

      // Store handler so updateCameraPreviews can re-attach it
      window._rcScreenBtnHandler = screenBtnHandler

      // Expose the same builders updateCameraPreviews needs to repaint
      // the instruction text with the button substituted in. Without
      // these, the camera-list polling path falls back to writing the
      // raw phrase (with the literal `[[BBB]]`) into the DOM.
      RC._getChooseCameraInstructionHTML = getChooseCameraInstructionHTML
      RC._getChooseScreenInstructionHTML = getChooseScreenInstructionHTML
      RC._bindScreenToggleButton = bindScreenToggleButton

      bindScreenToggleButton()

      // Store initial cameras for comparison
      let currentCameras = [...cameras]
      let cameraPollingInterval = null
      RC.highlightedCameraDeviceId = null // Track which camera is highlighted
      RC.cameraSelectionLoading = false // Store loading state on RC object for proper cleanup
      RC._inChooseScreenMode = false // Read by mouseenter handlers to suppress hover on Choose Screen page

      // ─── Live language re-translation ────────────────────────────────
      //
      // RC reads phrases[key][RC.L] only at render time, so any text we
      // already painted (top-right title, instruction, privacy notice,
      // "Choose another screen" button, per-tile captions) stays in the
      // old language even after `RC.newLanguage(...)` updates
      // `RC.language.value`. The Camera Resolution page works because it
      // re-renders after the language change; Choose Camera doesn't,
      // because it's already on screen.
      //
      // Fix: subscribe to `RC.onLanguageChange` (added in core.js) and
      // re-paint every translated DOM node from `phrases` using the
      // current RC.L. Cleanup happens in willClose so a closed popup
      // doesn't keep retranslating.
      const retranslateChooseCamera = () => {
        // Top-right title eyebrow + subtitle. showCameraTitleInTopRight
        // tears down and rebuilds the element each call, so passing the
        // current key picks up the new language directly.
        showCameraTitleInTopRight(RC, currentTitleKey)

        const instrDiv = document.getElementById('rc-camera-instruction-text')
        if (instrDiv) {
          instrDiv.innerHTML = isInChooseAnotherScreenMode
            ? getChooseScreenInstructionHTML()
            : getChooseCameraInstructionHTML()
          bindScreenToggleButton()
        }

        // Privacy notice is only rendered when the caller passed a
        // non-empty privacyMessage (i.e. when saveSnapshots is false).
        const privDiv = document.getElementById('rc-camera-privacy-text')
        if (privDiv) {
          privDiv.innerHTML = processInlineFormatting(
            phrases.RC_CameraPrivacyAssurance?.[RC.L] || privacyMessage || '',
          ).replace(/\n/g, '<br>')
        }

        // Per-tile captions: re-render with the localized
        // built-in / external / unknown tag for every camera in both
        // the top and bottom rows.
        for (let i = 0; i < currentCameras.length; i++) {
          const containers = _getCameraContainersForIndex(i)
          for (const container of containers) {
            _updateCaptionInContainer(container, currentCameras[i], i, RC)
          }
        }

        // Bottom-row explanatory caption ("These are the cameras at
        // the bottom of your screen, ..."). Only present when the
        // experiment opts in via calibrateDistanceAcceptBottomCameraBool.
        const bottomCaption = document.getElementById(
          'rc-bottom-cameras-caption',
        )
        if (bottomCaption) {
          bottomCaption.innerHTML = processInlineFormatting(
            phrases?.RC_BottomCameras?.[RC.L] || '',
          )
        }

        _applyChooseCameraPageTextDirection(RC)
      }

      RC._cameraSelectionLangUnsub = RC.onLanguageChange(
        retranslateChooseCamera,
      )

      // Force set the popup width via inline styles to ensure it takes effect
      const popupElement = document.querySelector('.camera-selection-popup')
      if (popupElement) {
        popupElement.style.maxWidth = 'none'
        popupElement.style.width = dynamicMaxWidth
        popupElement.style.minWidth = dynamicMaxWidth
        console.log('Applied inline width to popup:', dynamicMaxWidth)
        _syncBottomCaptionWidthWithTopLayout()
      }

      // Start polling for camera changes
      const startCameraPolling = () => {
        // Clear any existing interval first
        if (RC.cameraPollingInterval) {
          clearInterval(RC.cameraPollingInterval)
          RC.cameraPollingInterval = null
        }

        cameraPollingInterval = setInterval(async () => {
          try {
            const opts = RC._cameraSelectionOptions || {}
            const kindOverride = _resolveCameraKindOverride(RC, opts)
            const newCamerasAll = await getAvailableCameras(kindOverride)
            // Refresh the full-list stats (covers hot-plugged cameras).
            RC.availableCameras = newCamerasAll
            RC.cameraArray = newCamerasAll.map(c => ({
              name: c.label || '',
              class: c.incorporation,
              builtInScore: c.builtInScore,
              externalScore: c.externalScore,
              likelyBuiltIn: c.likelyBuiltIn,
              kindOverrideApplied: c.kindOverrideApplied === true,
              opinion:
                RC.cameraArray?.find(prev => prev.name === c.label)?.opinion ||
                null,
            }))
            // Re-apply the same external-camera filter (driven by
            // calibrateDistanceAllowExternalCameraBool).
            const newCameras = _filterCamerasByExternalPolicy(
              newCamerasAll,
              opts,
            )
            RC._visibleCameras = newCameras

            // Check if camera list has changed
            const hasChanged =
              newCameras.length !== currentCameras.length ||
              newCameras.some(
                (newCam, index) =>
                  !currentCameras[index] ||
                  newCam.deviceId !== currentCameras[index].deviceId,
              )

            if (hasChanged) {
              console.log('Camera list changed, updating UI...')
              const oldCameras = [...currentCameras]
              currentCameras = [...newCameras]

              // Update the UI with new cameras
              await updateCameraPreviews(
                newCameras,
                RC,
                currentActiveCamera,
                oldCameras,
                privacyMessage,
              )

              // Update global selectCamera function with new cameras
              window.selectCamera = async (deviceId, label) => {
                const selectedCamera = newCameras.find(
                  cam => cam.deviceId === deviceId,
                )

                if (selectedCamera && RC.gazeTracker?.webgazer) {
                  // Disable all preview containers during switching (both rows)
                  _setAllCameraContainersDisabled(newCameras, true)

                  try {
                    const success = await switchToCamera(RC, selectedCamera)

                    if (success) {
                      _applyCommittedCameraHighlight(
                        newCameras,
                        selectedCamera,
                        RC,
                      )
                      newCameras.forEach((camera, index) => {
                        for (const c of _getCameraContainersForIndex(index)) {
                          _updateCaptionInContainer(c, camera, index, RC)
                        }
                      })

                      RC.selectedCamera = selectedCamera
                      RC.cameraIncorporation =
                        selectedCamera.incorporation || 'unknown'
                    }
                  } catch (error) {
                    console.error('Camera switch error:', error)
                  }
                }
              }
            }
          } catch (error) {
            console.error('Error polling for camera changes:', error)
          }
        }, 100) // Check every 100ms

        // Store the interval reference for cleanup
        RC.cameraPollingInterval = cameraPollingInterval
      }

      // Start polling
      startCameraPolling()

      const commitCurrentlyHighlightedCamera = async () => {
        // Ignore while not in fullscreen (participant is dragging window)
        if (!isFullscreen()) return

        // Prevent action if already loading
        if (RC.cameraSelectionLoading) {
          return
        }

        // Find the currently highlighted camera using stored deviceId
        let hoveredCamera = null
        if (RC.highlightedCameraDeviceId) {
          hoveredCamera = cameras.find(
            cam => cam.deviceId === RC.highlightedCameraDeviceId,
          )
        }

        // If no camera is highlighted, use the first camera as default
        if (!hoveredCamera && cameras.length > 0) {
          hoveredCamera = cameras[0]
        }

        if (hoveredCamera) {
          // Persist which row the participant is committing from. This
          // is read later to place cameraXYPx at top vs bottom center.
          RC.selectedCameraRow = RC.highlightedCameraRow || 'top'

          // Set loading state
          RC.cameraSelectionLoading = true

          // Disable all camera previews during loading (both rows)
          _setAllCameraContainersDisabled(cameras, true)

          // Call selectCamera and wait for it to complete (same as click handler)
          try {
            await window.selectCamera(hoveredCamera.deviceId, hoveredCamera.label)
            if (RC.cameraIncorporation === 'unknown') {
              const opinionResult = await askCameraIncorporationOpinion(RC, {
                renderAboveChooseCamera: true,
              })
              if (opinionResult === RC_CAMERA_OPINION_CHOOSE_AGAIN) {
                return
              }
            }
            Swal.clickConfirm()
          } catch (error) {
            console.error('Error selecting camera via Enter key:', error)
            Swal.clickConfirm()
          }
        } else {
          // No camera available, just close
          Swal.clickConfirm()
        }
      }

      // Handle keyboard events
      const keydownListener = event => {
        // Prevent space key from triggering other functions
        if (event.key === ' ') {
          event.preventDefault()
          event.stopPropagation()
          return
        }

        if (event.key === 'Enter' || event.key === 'Return') {
          commitCurrentlyHighlightedCamera()
        }
      }

      // Add keyboard listener
      document.addEventListener('keydown', keydownListener, true) // Use capture phase to intercept early

      // Handle EasyEyes keypad if available
      if (RC.keypadHandler) {
        const removeKeypadHandler = setUpEasyEyesKeypadHandler(
          null,
          RC.keypadHandler,
          () => {
            removeKeypadHandler()
            commitCurrentlyHighlightedCamera()
          },
          false,
          ['return'],
          RC,
        )
      }

      // Store listener for cleanup
      RC.popupKeydownListener = keydownListener

      // Create global camera selection function
      window.selectCamera = async (deviceId, label) => {
        const selectedCamera = cameras.find(cam => cam.deviceId === deviceId)

        if (selectedCamera && RC.gazeTracker?.webgazer) {
          // Disable all preview containers during switching (both rows)
          _setAllCameraContainersDisabled(cameras, true)

          try {
            const success = await switchToCamera(RC, selectedCamera)

            if (success) {
              _applyCommittedCameraHighlight(cameras, selectedCamera, RC)
              cameras.forEach((camera, index) => {
                for (const c of _getCameraContainersForIndex(index)) {
                  _updateCaptionInContainer(c, camera, index, RC)
                }
              })

              RC.selectedCamera = selectedCamera
              RC.cameraIncorporation =
                selectedCamera.incorporation || 'unknown'
            }
          } catch (error) {
            console.error('Camera switch error:', error)
          }
          // Remove the finally block that re-enables containers - let the timeout handle it
        }
      }

      // Add event listeners for hover and click behavior on BOTH rows
      // (top + bottom). The bottom row mirrors the top row for
      // participants whose camera is at the bottom of the screen; both
      // rows behave identically except that the click handler records
      // which row was chosen via `data-camera-row` (used by Feature C
      // to set cameraXYPx to top vs bottom centre). On hover, only the
      // hovered tile lights up -- the matching tile in the other row
      // stays neutral so the green highlight tracks the participant's
      // cursor as a single visual cue.
      cameras.forEach((camera, index) => {
        const containers = _getCameraContainersForIndex(index)

        for (const container of containers) {
          // Hover highlight - treat as tentative selection
          container.addEventListener('mouseenter', async () => {
            // The Choose screen page must not indicate any video
            // selection -- skip hover highlight + tentative camera
            // switch entirely while the participant is picking which
            // screen to use.
            if (isInChooseAnotherScreenMode || RC._inChooseScreenMode) return

            const deviceId = container.getAttribute('data-device-id')
            RC.highlightedCameraDeviceId = deviceId
            const hoveredRow =
              container.getAttribute('data-camera-row') || 'top'
            RC.highlightedCameraRow = hoveredRow

            // Clear highlight on every tile in BOTH rows...
            for (let j = 0; j < cameras.length; j++) {
              _applyCameraContainerState(j, 'normal', 'both')
            }
            // ...then highlight only the hovered tile (specific row),
            // so the green cue follows the cursor instead of also
            // lighting up the matching tile in the opposite row.
            _applyCameraContainerState(index, 'highlight', hoveredRow)

            // Actually switch to this camera temporarily
            const selectedCamera = cameras.find(
              cam => cam.deviceId === deviceId,
            )
            if (selectedCamera && RC.gazeTracker?.webgazer) {
              try {
                await switchToCamera(RC, selectedCamera)
              } catch (error) {
                console.error('Tentative camera switch error:', error)
              }
            }
          })

          // No mouseleave handler - highlighting persists until hovering over something else

          // Click to commit (same as clicking OK)
          container.addEventListener('click', async () => {
            // Ignore clicks while not in fullscreen (participant is dragging window)
            if (!isFullscreen()) return

            // Prevent action if already loading
            if (RC.cameraSelectionLoading) {
              return
            }

            const deviceId = container.getAttribute('data-device-id')
            const label = container.getAttribute('data-camera-label')
            // Record whether the user clicked the top or bottom row.
            // Feature C reads RC.selectedCameraRow to set cameraXYPx
            // accordingly.
            RC.selectedCameraRow =
              container.getAttribute('data-camera-row') || 'top'

            // Set loading state
            RC.cameraSelectionLoading = true

            // Disable all camera previews during loading (both rows)
            _setAllCameraContainersDisabled(cameras, true)

            // Call the same function that OK button would call
            console.log(
              '[ChooseCamera] Tile clicked. label:',
              label,
              'deviceId:',
              deviceId,
            )
            await window.selectCamera(deviceId, label)
            console.log(
              '[ChooseCamera] After selectCamera. RC.cameraIncorporation:',
              RC.cameraIncorporation,
              'RC.selectedCamera:',
              RC.selectedCamera?.label,
            )
            if (RC.cameraIncorporation === 'unknown') {
              const opinionResult = await askCameraIncorporationOpinion(RC, {
                renderAboveChooseCamera: true,
              })
              if (opinionResult === RC_CAMERA_OPINION_CHOOSE_AGAIN) {
                return
              }
              console.log(
                '[ChooseCamera] Returned from unknown overlay.',
                'RC.selectedCamera:',
                RC.selectedCamera?.label,
                'cameraIncorporationReported:',
                RC.cameraIncorporationReported,
                'isCameraDisconnected:',
                RC.gazeTracker?.isCameraDisconnected?.(),
              )
            }

            console.log(
              '[ChooseCamera] Closing Choose Camera Swal via clickConfirm()',
            )
            Swal.clickConfirm()
          })
        }
      })

      // Create global camera hover highlighting functions
      window.highlightCamera = deviceId => {
        const cameraIndex = cameras.findIndex(cam => cam.deviceId === deviceId)
        if (cameraIndex !== -1) {
          // Apply the alternative blue highlight to BOTH top and bottom
          // containers for this camera so they stay visually in sync.
          for (const container of _getCameraContainersForIndex(cameraIndex)) {
            container.style.backgroundColor = '#f0f8ff'
            container.style.border = '2px solid #007bff'
            container.style.transform = 'scale(1.02)'
          }
        }
      }

      window.unhighlightCamera = deviceId => {
        const cameraIndex = cameras.findIndex(cam => cam.deviceId === deviceId)
        if (cameraIndex === -1) return
        const isActive =
          currentActiveCamera && currentActiveCamera.deviceId === deviceId
        const activeRow = RC.selectedCameraRow === 'bottom' ? 'bottom' : 'top'
        for (const container of _getCameraContainersForIndex(cameraIndex)) {
          const row =
            container.getAttribute('data-camera-row') === 'bottom'
              ? 'bottom'
              : 'top'
          const showGreen = isActive && row === activeRow
          container.style.backgroundColor = showGreen ? '#e8f5e8' : 'transparent'
          container.style.border = showGreen
            ? '2px solid #28a745'
            : '2px solid transparent'
          container.style.transform = 'scale(1)'
        }
      }

      // Create global camera selection and commit function
      window.selectAndCommitCamera = async (deviceId, label) => {
        // Prevent action if already loading
        if (RC.cameraSelectionLoading) {
          return
        }

        const selectedCamera = cameras.find(cam => cam.deviceId === deviceId)

        if (selectedCamera && RC.gazeTracker?.webgazer) {
          // Set loading state
          RC.cameraSelectionLoading = true

          // Disable all preview containers during switching (both rows)
          _setAllCameraContainersDisabled(cameras, true)

          try {
            const success = await switchToCamera(RC, selectedCamera)

            if (success) {
              RC.selectedCamera = selectedCamera
              RC.cameraIncorporation = selectedCamera.incorporation || 'unknown'
              if (RC.cameraIncorporation === 'unknown') {
                const opinionResult = await askCameraIncorporationOpinion(RC, {
                  renderAboveChooseCamera: true,
                })
                if (opinionResult === RC_CAMERA_OPINION_CHOOSE_AGAIN) {
                  return
                }
              }
              Swal.clickConfirm()
            }
          } catch (error) {
            console.error('Camera switch error:', error)
          }
        }
      }
    },
    willClose: () => {
      console.log(
        '[ChooseCamera] willClose firing.',
        'RC.selectedCamera:',
        RC.selectedCamera?.label,
        'isCameraDisconnected:',
        RC.gazeTracker?.isCameraDisconnected?.(),
      )
      // Drop the language-change subscription before tearing down the
      // popup so a stale listener can't try to retranslate a DOM that
      // no longer exists.
      if (RC._cameraSelectionLangUnsub) {
        RC._cameraSelectionLangUnsub()
        RC._cameraSelectionLangUnsub = null
      }

      // Hide the camera title from the top right
      hideCameraTitleFromTopRight()

      // Clear camera polling interval - clean up both local and global references
      if (RC.cameraPollingInterval) {
        clearInterval(RC.cameraPollingInterval)
        RC.cameraPollingInterval = null
      }

      // Remove keyboard event listener
      if (RC.popupKeydownListener) {
        document.removeEventListener('keydown', RC.popupKeydownListener, true) // Use capture phase to match how it was added
        RC.popupKeydownListener = null
      }

      // Reset loading state to ensure no lingering state affects next page
      if (typeof RC.cameraSelectionLoading !== 'undefined') {
        RC.cameraSelectionLoading = false
      }

      // Clear the Choose Screen mode flag so a stale value can't
      // suppress hover on the next popup.
      RC._inChooseScreenMode = false

      // Remove any existing loading text
      const loadingTextElement = document.getElementById('camera-loading-text')
      if (loadingTextElement) {
        loadingTextElement.remove()
      }

      // Remove global camera selection function
      if (window.selectCamera) {
        delete window.selectCamera
      }

      // Remove other global functions that might have been created
      if (window.highlightCamera) {
        delete window.highlightCamera
      }
      if (window.unhighlightCamera) {
        delete window.unhighlightCamera
      }
      if (window.selectAndCommitCamera) {
        delete window.selectAndCommitCamera
      }
      if (window._rcScreenBtnHandler) {
        delete window._rcScreenBtnHandler
      }
      // Drop the instruction-builder references so a stray repaint
      // (e.g. a polling tick that fires while teardown is in flight)
      // can't write into a popup that's already gone.
      RC._getChooseCameraInstructionHTML = null
      RC._getChooseScreenInstructionHTML = null
      RC._bindScreenToggleButton = null

      // DON'T restore video container here - let the next step handle it
      // This prevents the blank page flash between popup close and next UI render

      // If no camera was explicitly selected, restore the original camera.
      // Skip if camera is disconnected — the reconnection flow handles it.
      if (
        !RC.selectedCamera &&
        RC.gazeTracker?.webgazer &&
        !RC.gazeTracker?.isCameraDisconnected()
      ) {
        const originalCamera = getCurrentActiveCamera(RC)
        if (originalCamera) {
          const originalCameraObj = cameras.find(
            cam => cam.deviceId === originalCamera.deviceId,
          )
          if (originalCameraObj) {
            switchToCamera(RC, originalCameraObj).catch(error => {
              console.error('Failed to restore original camera:', error)
            })
          }
        }
      }

      // Stop all preview video streams (the bottom row shares the top
      // row's stream object, so stopping the top row's tracks releases
      // both -- but we still detach the bottom video's srcObject so the
      // <video> element doesn't keep a dangling reference).
      cameras.forEach((camera, index) => {
        const videoElement = document.getElementById(`camera-preview-${index}`)
        if (videoElement && videoElement.srcObject) {
          const stream = videoElement.srcObject
          stream.getTracks().forEach(track => track.stop())
        }
        const bottomVideoElement = document.getElementById(
          `camera-preview-bottom-${index}`,
        )
        if (bottomVideoElement) {
          bottomVideoElement.srcObject = null
        }
      })

      // Remove the bottom-row wrapper that was promoted to <body> so it
      // doesn't outlive the popup.
      _removeCameraPreviewsBottom()

      // DON'T restore video container here - let the next step handle it
      // This prevents the blank page flash between popup close and next UI render
    },
  })

  // Restore original z-index of video container
  if (videoContainer) {
    videoContainer.style.zIndex = originalZIndex
  }

  // Restore original video visibility state
  if (RC.gazeTracker?.webgazer) {
    RC.gazeTracker.webgazer.showVideo(originalVideoState.showVideo)
    RC.gazeTracker.webgazer.showFaceOverlay(originalVideoState.showFaceOverlay)
    // Don't restore feedback box - keep it hidden for cleaner preview
    RC.gazeTracker.webgazer.showFaceFeedbackBox(false)
  }

  // Get selected camera (only from user selection, no fallback)
  const selectedCamera = RC.selectedCamera

  // Skip onClose if popup was interrupted by camera disconnection — the
  // caller (showTestPopup) will wait for reconnection and retry, at which
  // point onClose will be called with the definitive result.
  if (
    onClose &&
    typeof onClose === 'function' &&
    !RC.gazeTracker?.isCameraDisconnected()
  ) {
    onClose(selectedCamera)
  }

  // Final safety cleanup - ensure camera polling is stopped
  if (RC.cameraPollingInterval) {
    clearInterval(RC.cameraPollingInterval)
    RC.cameraPollingInterval = null
  }

  return { ...result, selectedCamera }
}

/**
 * Shows a popup when no cameras are detected
 * @param {Object} RC - RemoteCalibrator instance
 * @param {Element} mainVideoContainer - Main video container element
 * @param {string} originalMainVideoDisplay - Original display style
 * @returns {Promise<string>} - 'retry' or 'end'
 */
const showNoCameraPopup = async (
  RC,
  mainVideoContainer,
  originalMainVideoDisplay,
) => {
  const textAlign = RC.LD === RC._CONST.RTL ? 'right' : 'left'

  // Restore video container display for the popup
  if (mainVideoContainer) {
    mainVideoContainer.style.display = originalMainVideoDisplay
  }

  const result = await Swal.fire({
    ...swalInfoOptions(RC, { showIcon: false }),
    html: `
      <p style="text-align: ${textAlign}; direction: ${RC.LD === RC._CONST.RTL ? 'rtl' : 'ltr'}; margin-top: 1rem; font-size: 1.2rem; line-height: 1.6;">
        ${processInlineFormatting(phrases.RC_CameraNotFound[RC.L]).replace('\n', '<br />')}
      </p>
    `,
    showCancelButton: true,
    confirmButtonText: phrases.RC_TryAgain[RC.L],
    cancelButtonText: phrases.RC_OK[RC.L],
    allowEnterKey: true,
    didOpen: () => {
      // Handle keyboard events
      const keydownListener = event => {
        if (event.key === 'Enter' || event.key === 'Return') {
          Swal.clickConfirm() // Try Again
        } else if (event.key === 'Escape') {
          Swal.clickCancel() // End Experiment
        }
      }

      // Add keyboard listener
      document.addEventListener('keydown', keydownListener, true)

      // Handle EasyEyes keypad if available
      if (RC.keypadHandler) {
        const removeKeypadHandler = setUpEasyEyesKeypadHandler(
          null,
          RC.keypadHandler,
          () => {
            removeKeypadHandler()
            Swal.clickConfirm()
          },
          false,
          ['return'],
          RC,
        )
      }

      // Store listener for cleanup
      RC.popupKeydownListener = keydownListener
    },
    willClose: () => {
      // Remove keyboard event listener
      if (RC.popupKeydownListener) {
        document.removeEventListener('keydown', RC.popupKeydownListener, true)
        RC.popupKeydownListener = null
      }
    },
  })

  return result.isConfirmed ? 'retry' : 'end'
}

/**
 * After camera is selected: enter fullscreen, apply resolution constraints,
 * and optionally show the resolution page with video preview.
 */
export const _handlePostCameraResolution = async (RC, options) => {
  // Force fullscreen
  try {
    await getFullscreen(RC.L, RC)
  } catch (error) {
    console.warn('Failed to enter fullscreen after camera selection:', error)
  }

  if (options._showCameraResolutionBool) {
    const origInfo = getCameraInfo(RC)
    const selectedCameraLabel = _stripHexId(
      RC.selectedCamera?.label || origInfo.name || 'Camera',
    )
    const selectedIncorporation =
      RC.selectedCamera?.incorporation || RC.cameraIncorporation || null
    const origCaptionHTML = _cameraCaptionHTML(
      selectedCameraLabel,
      {
        width: origInfo.width,
        height: origInfo.height,
        frameRate: origInfo.frameRate,
      },
      RC,
      selectedIncorporation,
    )

    const lang = RC?.L || RC?.language?.value || 'en-US'
    const settingText =
      phrases?.RC_SettingWebcamResolution?.[lang] ||
      phrases?.RC_SettingWebcamResolution?.['en-US'] ||
      'Setting webcam resolution ...'

    const resolutionResult = await Swal.fire({
      ...swalInfoOptions(RC, { showIcon: false }),
      icon: undefined,
      title: '',
      html: '',
      confirmButtonText: phrases.T_proceed?.[RC.L] || 'Proceed',
      allowEnterKey: false,
      allowOutsideClick: false,
      allowEscapeKey: false,
      background: 'transparent',
      backdrop: '#eee',
      showClass: { popup: '' },
      hideClass: { popup: '' },
      customClass: {
        popup: 'my__swal2__container',
        confirmButton: 'rc-button',
      },
      didOpen: async () => {
        showCameraTitleInTopRight(RC, 'RC_CameraResolutionTitle')

        const popup = Swal.getPopup()
        if (popup) {
          popup.style.boxShadow = 'none'
          popup.style.border = 'none'
          popup.style.padding = '0'
        }

        // Position button horizontally centered, shifted down by ~1/3
        const actions = popup?.querySelector('.swal2-actions')
        if (actions) {
          actions.style.cssText = 'position: fixed; top: 66%; left: 50%; transform: translateX(-50%); margin: 0;'
        }

        const confirmBtn = Swal.getConfirmButton()
        if (confirmBtn) {
          confirmBtn.disabled = true
          confirmBtn.style.background = '#999'
          confirmBtn.style.cursor = 'not-allowed'
        }

        // Create fixed video preview at the camera edge: top for
        // top-camera setups, bottom for bottom-camera setups (driven
        // by RC.selectedCameraRow set on the Choose Camera page when
        // calibrateDistanceAcceptBottomCameraBool is true).
        const isBottomCam = RC?.selectedCameraRow === 'bottom'
        const wrapper = document.createElement('div')
        wrapper.id = 'rc-resolution-video-wrapper'
        wrapper.style.cssText = `
          position: fixed;
          ${isBottomCam ? 'bottom: 0;' : 'top: 0;'}
          left: 50%;
          transform: translateX(-50%);
          z-index: 9999999999;
          display: flex;
          flex-direction: ${isBottomCam ? 'column-reverse' : 'column'};
          align-items: center;
        `
        const pipW =
          RC._CONST.N.VIDEO_W[RC.isMobile.value ? 'MOBILE' : 'DESKTOP']
        const vc = document.getElementById('webgazerVideoContainer')
        const pipH = vc
          ? Math.round(
              (pipW / Number.parseInt(vc.style.width || pipW)) *
                Number.parseInt(vc.style.height || Math.round(pipW * 0.75)),
            )
          : Math.round(pipW * 0.75)

        const preview = document.createElement('video')
        preview.id = 'rc-resolution-preview'
        preview.autoplay = true
        preview.muted = true
        preview.playsInline = true
        preview.style.cssText = `
          width: ${pipW}px;
          height: ${pipH}px;
          border: 2px solid #ccc;
          border-radius: 4px;
          object-fit: cover;
          transform: scaleX(-1);
        `
        const captionDiv = document.createElement('div')
        captionDiv.id = 'rc-resolution-caption'
        captionDiv.style.cssText =
          'margin-top: 5px; font-size: 12px; text-align: center; color: #666; line-height: 1.4;'
        captionDiv.innerHTML = origCaptionHTML

        wrapper.appendChild(preview)
        wrapper.appendChild(captionDiv)
        document.body.appendChild(wrapper)

        const webgazerVideo = document.getElementById('webgazerVideoFeed')
        if (webgazerVideo && webgazerVideo.srcObject) {
          preview.srcObject = webgazerVideo.srcObject
        }

        // Apply resolution in the background
        await checkResolutionAfterSelection(RC, options)
        hideResolutionSettingMessage()

        // Update caption with final resolution
        const finalInfo = getCameraInfo(RC)
        const finalCaptionHTML = _cameraCaptionHTML(
          selectedCameraLabel,
          {
            width: finalInfo.width,
            height: finalInfo.height,
            frameRate: finalInfo.frameRate,
          },
          RC,
          selectedIncorporation,
        )
        const capDiv = document.getElementById('rc-resolution-caption')
        if (capDiv) capDiv.innerHTML = finalCaptionHTML

        // Enable Proceed button (green)
        if (confirmBtn) {
          confirmBtn.disabled = false
          confirmBtn.style.background = '#019267'
          confirmBtn.style.cursor = 'pointer'
          confirmBtn.classList.add('rc-go-button')
          confirmBtn.focus()
          Swal.update({ allowEnterKey: true })
        }
      },
      willClose: () => {
        hideCameraTitleFromTopRight()

        const wrapper = document.getElementById('rc-resolution-video-wrapper')
        if (wrapper) {
          const preview = wrapper.querySelector('video')
          if (preview) preview.srcObject = null
          wrapper.remove()
        }
      },
    })

    // If the resolution Swal was interrupted by camera disconnection,
    // wait for reconnection and then re-show the resolution page.
    // Set _isWaitingForCameraReconnect so GazeTracker's reconnect
    // handler knows we are going to re-run the resolution flow
    // ourselves and should NOT also re-run _handlePostCameraResolution.
    if (
      !resolutionResult.isConfirmed &&
      RC.gazeTracker?.isCameraDisconnected()
    ) {
      RC._isWaitingForCameraReconnect = true
      await new Promise(resolve => {
        const unsub = RC.gazeTracker.onCameraReconnected(() => {
          unsub()
          RC._isWaitingForCameraReconnect = false
          resolve()
        })
      })
      // Wait for any open Swal (the reconnection spinner from
      // showCameraReconnectionPopup) to close before re-opening the
      // Camera Resolution page. Otherwise the spinner's pending
      // `Swal.close()` (fired after a 2-second min display) will close
      // OUR new resolution Swal and the participant lands on the next
      // step without ever seeing or pressing Proceed.
      let waitedMs = 0
      while (Swal.isVisible() && waitedMs < 5000) {
        await new Promise(r => setTimeout(r, 100))
        waitedMs += 100
      }
      return await _handlePostCameraResolution(RC, options)
    }
  } else {
    // Silent resolution setting — no UI
    await checkResolutionAfterSelection(RC, options)
    hideResolutionSettingMessage()
  }
}

/**
 * Shows a unified popup for all tests with camera selection
 * @param {Object} RC - RemoteCalibrator instance
 * @param {Function} onClose - Callback function when popup is closed
 * @param {Object} options - Options object with configuration settings
 * @returns {Promise} - Promise that resolves when popup is closed with selected camera
 */
export const showTestPopup = async (RC, onClose = null, options = {}) => {
  // Initialize the flag only if it doesn't exist yet (first time)
  if (RC.resolutionWarningShown === undefined) {
    RC.resolutionWarningShown = false
  }
  // Don't reset it on retries - this prevents the loop

  // Stash the camera-selection options on RC so the reconnection handler
  // in GazeTracker can re-run resolution setting / re-show the Camera
  // Resolution page if the camera reconnects later in the session
  // (Feature A).
  RC._cameraSelectionOptions = options

  // Hide the main video preview immediately to prevent flash
  const mainVideoContainer = document.getElementById('webgazerVideoContainer')
  // Always restore to 'block' after popup closes (video may be hidden during init)
  const originalMainVideoDisplay = 'block'
  if (mainVideoContainer) {
    mainVideoContainer.style.display = 'none'
  }

  // Enumerate + classify ALL cameras (full list goes to RC.cameraArray
  // for CSV stats, regardless of the visible filter below).
  //
  // `_calibrateDistanceCameraKindOverride` (FOR TESTING, default
  // 'assess') lets a scientist force the kind to 'built-in',
  // 'external', or 'unknown' regardless of label. Results gathered
  // with anything other than 'assess' should be excluded from
  // camera-kind tabulation.
  const kindOverride = _resolveCameraKindOverride(RC, options)
  RC.calibrateDistanceCameraKindOverride = kindOverride
  // Keep the underscored alias for back-compat with anything reading the
  // glossary name directly.
  RC._calibrateDistanceCameraKindOverride = kindOverride
  if (kindOverride && kindOverride !== 'assess') {
    console.log(
      `[showTestPopup] TESTING: _calibrateDistanceCameraKindOverride = "${kindOverride}". Forcing every camera's kind to "${kindOverride}". Exclude these results from camera-kind tabulation.`,
    )
  }
  const allCameras = await getAvailableCameras(kindOverride)
  RC.cameraArray = allCameras.map(c => ({
    name: c.label || '',
    class: c.incorporation,
    builtInScore: c.builtInScore,
    externalScore: c.externalScore,
    likelyBuiltIn: c.likelyBuiltIn,
    kindOverrideApplied: c.kindOverrideApplied === true,
    opinion: null,
  }))

  // Default FALSE: hide externals; built-in and unknown stay visible.
  // Set calibrateDistanceAllowExternalCameraBool to true to include
  // external cameras alongside built-in / unknown.
  const cameras = _filterCamerasByExternalPolicy(allCameras, options)
  RC.availableCameras = allCameras
  RC._visibleCameras = cameras

  let conditionalPrivacyCamera = ''
  if (!options.saveSnapshots) {
    conditionalPrivacyCamera = phrases.RC_CameraPrivacyAssurance[RC.L]
  }

  // Handle different camera scenarios (after exclude-external filter)
  if (cameras.length === 0) {
    // No cameras detected - show retry popup
    // Make sure no title is shown since we're not showing camera selection
    hideCameraTitleFromTopRight()

    const noCameraResult = await showNoCameraPopup(
      RC,
      mainVideoContainer,
      originalMainVideoDisplay,
    )
    if (noCameraResult === 'retry') {
      // Recursively call showTestPopup to retry camera detection
      return await showTestPopup(RC, onClose, options)
    } else {
      // User chose to end experiment
      if (onClose && typeof onClose === 'function') {
        onClose('experiment_ended')
      }
      return { selectedCamera: null, experimentEnded: true }
    }
  } else if (cameras.length === 1) {
    // Only one camera - show popup with different title and message
    const result = await showCameraSelectionPopup(
      RC,
      '',
      phrases.RC_ChooseCamera[RC.L],
      conditionalPrivacyCamera,
      onClose,
      'RC_ChooseCameraTitle',
      options.calibrateDistanceAcceptBottomCameraBool === true,
    )

    // If popup was interrupted by camera disconnection, wait for the
    // reconnection flow to finish and then re-show camera selection.
    // Set _isWaitingForCameraReconnect so GazeTracker's reconnect
    // handler knows we are going to re-run the camera flow ourselves
    // and should NOT also re-run _handlePostCameraResolution.
    if (!result.selectedCamera && RC.gazeTracker?.isCameraDisconnected()) {
      console.log(
        '[showTestPopup/single] Disconnect path triggered.',
        'Awaiting onCameraReconnected then restarting Choose Camera...',
      )
      RC._isWaitingForCameraReconnect = true
      await new Promise(resolve => {
        const unsub = RC.gazeTracker.onCameraReconnected(() => {
          console.log('[showTestPopup/single] onCameraReconnected fired')
          unsub()
          RC._isWaitingForCameraReconnect = false
          resolve()
        })
      })
      // Wait for the reconnection spinner Swal to close before
      // re-opening Choose Camera, otherwise the spinner's pending
      // `Swal.close()` will close our new popup.
      let waitedMs = 0
      while (Swal.isVisible() && waitedMs < 5000) {
        await new Promise(r => setTimeout(r, 100))
        waitedMs += 100
      }
      console.log(
        '[showTestPopup/single] Restarting showTestPopup after reconnect',
      )
      RC.selectedCamera = null
      RC.cameraIncorporation = null
      RC.cameraIncorporationReported = null
      return await showTestPopup(RC, onClose, options)
    }

    // Ask opinion when classification is unknown, then run resolution.
    if (result.selectedCamera) {
      if (
        RC.cameraIncorporation === 'unknown' &&
        !RC.cameraIncorporationReported
      ) {
        console.log(
          '[showTestPopup/single] Falling back to legacy unknown popup',
          '(should NOT happen if overlay flow worked)',
        )
        // Keep a live feed visible behind the unknown-camera question.
        if (mainVideoContainer) {
          mainVideoContainer.style.display = originalMainVideoDisplay
        }
        const opinionResultSingle = await askCameraIncorporationOpinion(RC)
        if (opinionResultSingle === RC_CAMERA_OPINION_CHOOSE_AGAIN) {
          if (RC.cameraPollingInterval) {
            clearInterval(RC.cameraPollingInterval)
            RC.cameraPollingInterval = null
          }
          RC.selectedCamera = null
          RC.cameraIncorporation = null
          RC.cameraIncorporationReported = null
          return await showTestPopup(RC, onClose, options)
        }
      }
      _recordCameraData(RC)
      await _handlePostCameraResolution(RC, options)
    }

    if (RC.cameraPollingInterval) {
      clearInterval(RC.cameraPollingInterval)
      RC.cameraPollingInterval = null
    }

    return result
  }

  // 2+ cameras
  const result = await showCameraSelectionPopup(
    RC,
    '',
    phrases.RC_ChooseCamera[RC.L],
    conditionalPrivacyCamera,
    onClose,
    'RC_ChooseCameraTitle',
    options.calibrateDistanceAcceptBottomCameraBool === true,
  )
  console.log(
    '[showTestPopup] showCameraSelectionPopup returned. selectedCamera:',
    result?.selectedCamera?.label,
    'isCameraDisconnected:',
    RC.gazeTracker?.isCameraDisconnected?.(),
    'RC.cameraIncorporation:',
    RC.cameraIncorporation,
    'RC.cameraIncorporationReported:',
    RC.cameraIncorporationReported,
  )

  // If popup was interrupted by camera disconnection, wait for the
  // reconnection flow to finish and then re-show camera selection.
  // Set _isWaitingForCameraReconnect so GazeTracker's reconnect handler
  // knows we are going to re-run the camera flow ourselves and should
  // NOT also re-run _handlePostCameraResolution.
  if (!result.selectedCamera && RC.gazeTracker?.isCameraDisconnected()) {
    console.log(
      '[showTestPopup] Disconnect path: awaiting reconnect, then',
      'restarting Choose Camera (selection ignored).',
    )
    RC._isWaitingForCameraReconnect = true
    await new Promise(resolve => {
      const unsub = RC.gazeTracker.onCameraReconnected(() => {
        console.log('[showTestPopup] onCameraReconnected fired')
        unsub()
        RC._isWaitingForCameraReconnect = false
        resolve()
      })
    })
    // Wait for the reconnection spinner Swal to close before re-opening
    // Choose Camera, otherwise the spinner's pending `Swal.close()` will
    // close our new popup.
    let waitedMs = 0
    while (Swal.isVisible() && waitedMs < 5000) {
      await new Promise(r => setTimeout(r, 100))
      waitedMs += 100
    }
    console.log('[showTestPopup] Restarting showTestPopup after reconnect')
    RC.selectedCamera = null
    RC.cameraIncorporation = null
    RC.cameraIncorporationReported = null
    return await showTestPopup(RC, onClose, options)
  }

  // Ask opinion when classification is unknown, then run resolution.
  if (result.selectedCamera) {
    if (
      RC.cameraIncorporation === 'unknown' &&
      !RC.cameraIncorporationReported
    ) {
      console.log(
        '[showTestPopup] Falling back to legacy unknown popup',
        '(should NOT happen if overlay flow worked)',
      )
      // Keep a live feed visible behind the unknown-camera question.
      if (mainVideoContainer) {
        mainVideoContainer.style.display = originalMainVideoDisplay
      }
      const opinionResultMulti = await askCameraIncorporationOpinion(RC)
      if (opinionResultMulti === RC_CAMERA_OPINION_CHOOSE_AGAIN) {
        if (RC.cameraPollingInterval) {
          clearInterval(RC.cameraPollingInterval)
          RC.cameraPollingInterval = null
        }
        RC.selectedCamera = null
        RC.cameraIncorporation = null
        RC.cameraIncorporationReported = null
        return await showTestPopup(RC, onClose, options)
      }
    }
    _recordCameraData(RC)
    await _handlePostCameraResolution(RC, options)
  }

  if (RC.cameraPollingInterval) {
    clearInterval(RC.cameraPollingInterval)
    RC.cameraPollingInterval = null
  }

  return result
}

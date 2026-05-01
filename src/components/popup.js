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
 * Sets the visual state of all containers (top + bottom rows, if the
 * bottom row exists) for the given camera index.
 *
 * @param {number} index - camera index
 * @param {'highlight'|'normal'} state
 */
const _applyCameraContainerState = (index, state) => {
  const containers = _getCameraContainersForIndex(index)
  for (const c of containers) {
    if (state === 'highlight') {
      c.style.backgroundColor = '#e8f5e8'
      c.style.border = '2px solid #28a745'
      const cap = c.querySelector('.rc-camera-caption')
      if (cap) {
        cap.style.color = '#28a745'
        cap.style.fontWeight = 'bold'
      }
    } else {
      c.style.backgroundColor = 'transparent'
      c.style.border = '2px solid transparent'
      const cap = c.querySelector('.rc-camera-caption')
      if (cap) {
        cap.style.color = '#666'
        cap.style.fontWeight = 'normal'
      }
    }
  }
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
 */
const _removeCameraPreviewsBottom = () => {
  const bottomOuter = document.getElementById(
    'rc-camera-previews-bottom-outer',
  )
  if (bottomOuter) bottomOuter.remove()
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

  // Choose Camera / Choose Screen show a "Device compatibility" eyebrow.
  const showEyebrow =
    titleKey === 'RC_ChooseCameraTitle' || titleKey === 'RC_ChooseScreenTitle'
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
  `

  // Eyebrow is the page header; H1 below it is a slightly smaller subtitle.
  const eyebrow = titleElement.querySelector('.rc-camera-title-eyebrow')
  if (eyebrow) {
    eyebrow.style.cssText = `
      margin: 0 0 0.15em 0;
      padding: 0;
      font-size: clamp(16px, 4vw, 36px);
      font-weight: 350;
      color: #000;
      line-height: 1.1;
    `
  }

  const titleH1 = titleElement.querySelector('h1')
  if (titleH1) {
    const subtitle = !!eyebrow
    titleH1.style.cssText = subtitle
      ? `
        margin: 0;
        padding: 0;
        font-size: clamp(14px, 3vw, 28px);
        font-weight: 300;
        color: #444;
        line-height: 1.15;
      `
      : `
        margin: 0;
        padding: 0;
        font-size: clamp(16px, 4vw, 36px);
        font-weight: 350;
        line-height: 1.1;
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
const askCameraIncorporationOpinion = async RC => {
  const Q = phrases?.RC_IsCameraBuiltIn?.[RC.L] ||
    'Check the video. Is its camera built-into this screen?'
  const yesText = phrases?.RC_Yes?.[RC.L] || 'Yes'
  const noText = phrases?.RC_No?.[RC.L] || 'No'
  const dontKnowText =
    phrases?.RC_DontKnow?.[RC.L] ||
    "Don't know. (All answers are OK -- this won't affect your participation.)"
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
    </div>
  `

  let chosenAnswer = null

  // We handle Enter ourselves -- Swal.update re-renders the body and
  // would visually reset the radios.
  let opinionKeydownListener = null

  const result = await Swal.fire({
    ...swalInfoOptions(RC, { showIcon: false }),
    icon: undefined,
    title: '',
    html: optionsHTML,
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

  if (!chosenAnswer) return

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

// Enumerate cameras and tag each with likelyBuiltIn + incorporation.
// Labels are only populated after getUserMedia permission is granted.
const getAvailableCameras = async () => {
  try {
    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const cameras = devices.filter(device => device.kind === 'videoinput')
      return cameras.map(cam => {
        // MediaDeviceInfo is read-only -- wrap in a plain object.
        const { score, classification } = likelyBuiltIn(cam)
        return {
          deviceId: cam.deviceId,
          kind: cam.kind,
          label: cam.label,
          groupId: cam.groupId,
          likelyBuiltIn: score,
          incorporation: classification,
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

      await Swal.fire({
        ...swalInfoOptions(RC, { showIcon: false }),
        title: processInlineFormatting(
          phrases.RC_ImprovingCameraResolutionTitle[RC.L],
        ),
        html: `
            <div style="text-align: left; margin: 1rem 0; padding: 0;">
              <p style="margin: 0; padding: 0; text-align: left; font-style: normal;"> ${processInlineFormatting(phrases.RC_ImprovingCameraResolution[RC.L].replace('𝟙𝟙𝟙', width).replace('𝟚𝟚𝟚', height))}</p>
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
            htmlContainer.style.textAlign = 'left'
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
  const arrowChar = isRTL ? '←' : '→'

  // Outer wrapper centers the video group
  let previewsHTML = `<div id="rc-camera-previews-outer" style="display: flex; justify-content: center; width: 100%;">`

  // Inner wrapper: relative, so arrow + button are positioned relative to the video group
  previewsHTML += `<div style="position: relative; display: inline-flex; overflow: visible;">`

  // Arrow positioned just outside the left (LTR) or right (RTL) of the video group
  previewsHTML += `
    <div id="rc-camera-arrow" style="position: absolute; ${isRTL ? 'right' : 'left'}: 0; top: 50%; transform: translate(${isRTL ? '100%' : '-100%'}, -50%); font-size: clamp(36pt, 8vw, 72pt); color: #000; user-select: none; pointer-events: none; line-height: 1; z-index: 1;">${arrowChar}</div>
  `

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

  // "Choose another screen" button positioned just outside the right (LTR) or left (RTL) of videos
  previewsHTML += `
    <div id="rc-choose-screen-btn-wrapper" style="position: absolute; ${isRTL ? 'left' : 'right'}: 0; top: 50%; transform: translate(${isRTL ? '-100%' : '100%'}, -50%); display: flex; align-items: center; justify-content: center; padding: 5px; z-index: 1;">
      <button id="rc-choose-another-screen-btn" class="rc-button" style="
        min-width: clamp(120px, 18vw, ${maxW} * 1.35px);
        width: auto;
        height: calc(${previewSize.height} / 3 * 1.15 * 0.75);
        background: #999 !important;
        border: 2px solid #ccc !important;
        border-radius: 24px !important;
        font-size: clamp(0.8rem, 1.2vw, 1rem) !important;
        padding: 0.5rem 1rem !important;
        margin: 0 !important;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        text-align: center;
        line-height: 1.3;
        word-wrap: break-word;
        ${isRTL ? 'word-break: break-all;' : ''}
        box-sizing: border-box;
      ">${processInlineFormatting(phrases.RC_ChooseAnotherScreenButton?.[RC.L] || 'Choose another screen')}</button>
    </div>
  `

  // Close inner relative wrapper + outer centering wrapper
  previewsHTML += '</div></div>'

  // ---- Optional bottom row of camera previews (Feature B) ----
  // Only rendered when the experiment opts in via
  // `calibrateDistanceAcceptBottomCameraBool === true`. Mirrors the
  // top row with the same set of cameras. Anchored to the bottom of the
  // viewport via `position: fixed` so participants whose built-in
  // camera is at the bottom of the screen can pick the video they see
  // themselves looking at. No arrow / "Choose another screen" button is
  // duplicated here -- those belong to the top row only.
  //
  // High z-index keeps the row above any other UI on the page. The
  // wrapper is later promoted to <body> via
  // `_promoteCameraPreviewsBottomToBody()` so its `position: fixed`
  // resolves relative to the viewport.
  if (acceptBottomBool) {
    // Column flex so the explanation sits centered above the videos.
    const bottomCaptionText =
      phrases?.RC_BottomCameras?.[RC.L] ||
      'Before 2020, some laptop screens had a camera built into the bottom of the screen.'
    previewsHTML += `<div id="rc-camera-previews-bottom-outer" style="position: fixed; bottom: 0; left: 0; right: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; padding: 0 1rem 1rem 1rem; box-sizing: border-box; z-index: 9147483649; pointer-events: auto;">`
    previewsHTML += `
      <div id="rc-bottom-cameras-caption" style="text-align: center; color: #444; font-size: clamp(12px, 1.6vw, 16px); font-weight: 300; line-height: 1.4; max-width: 70vw; margin: 0 0 0.5rem 0; direction: ${isRTL ? 'rtl' : 'ltr'};">
        ${processInlineFormatting(bottomCaptionText)}
      </div>
    `
    previewsHTML += `<div style="display: flex; flex-wrap: nowrap; gap: 10px; align-items: center;">`

    for (let i = 0; i < cameras.length; i++) {
      const camera = cameras[i]
      const previewBottomId = `camera-preview-bottom-${i}`
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
          id="camera-preview-container-bottom-${i}"
          class="camera-preview-container camera-preview-container-bottom"
          data-device-id="${camera.deviceId}"
          data-camera-label="${cleanLabel}"
          data-camera-row="bottom"
          style="display: flex; flex-direction: column; align-items: center; margin: 0; padding: 5px; border-radius: 8px; transition: all 0.2s ease; box-sizing: border-box; ${isActive ? 'background-color: #e8f5e8; border: 2px solid #28a745;' : 'border: 2px solid transparent;'}"
        >
          <video 
            id="${previewBottomId}" 
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

    previewsHTML += '</div></div>'
  }

  // Start video streams for all cameras in PARALLEL with optimized
  // resolution. The same MediaStream object is shared with the bottom
  // row's <video> when the bottom row is rendered, to avoid opening a
  // second getUserMedia per camera.
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
                },
              })
            } catch (hdError) {
              stream = await navigator.mediaDevices.getUserMedia({
                video: {
                  deviceId: { exact: camera.deviceId },
                  width: { ideal: 1920 },
                  height: { ideal: 1080 },
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
      phrases[messageKey][RC.L],
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

  const titleKey = 'RC_ChooseCameraTitle'
  const messageKey = 'RC_ChooseCamera'
  updateTitleAndDescription(RC, titleKey, messageKey)

  // Re-add event listeners for new previews, on BOTH rows. Hover/click
  // state is mirrored across rows so the visual cue is consistent
  // regardless of which row the participant is interacting with.
  newCameras.forEach((camera, index) => {
    const containers = _getCameraContainersForIndex(index)

    for (const container of containers) {
      // Hover highlight - treat as tentative selection
      container.addEventListener('mouseenter', async () => {
        const deviceId = container.getAttribute('data-device-id')
        RC.highlightedCameraDeviceId = deviceId
        // Track which row the participant is interacting with so
        // Feature C can map the selection to top vs bottom cameraXYPx.
        RC.highlightedCameraRow =
          container.getAttribute('data-camera-row') || 'top'

        // Unhighlight every container in BOTH rows...
        for (let j = 0; j < newCameras.length; j++) {
          _applyCameraContainerState(j, 'normal')
        }
        // ...then highlight the matching device in BOTH rows.
        _applyCameraContainerState(index, 'highlight')

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

      // Click to commit (same as clicking OK)
      container.addEventListener('click', async () => {
        // Prevent action if already loading
        if (RC.cameraSelectionLoading) {
          return
        }

        const deviceId = container.getAttribute('data-device-id')
        const label = container.getAttribute('data-camera-label')
        // Record whether the user clicked the top or bottom row.
        // Feature C reads this to set cameraXYPx accordingly.
        RC.selectedCameraRow =
          container.getAttribute('data-camera-row') || 'top'

        RC.cameraSelectionLoading = true
        _setAllCameraContainersDisabled(newCameras, true)

        await window.selectCamera(deviceId, label)
        Swal.clickConfirm()
      })
    }
  })

  // Re-attach "Choose another screen" button listener if it exists
  const newScreenBtn = document.getElementById('rc-choose-another-screen-btn')
  if (newScreenBtn && window._rcScreenBtnHandler) {
    newScreenBtn.onclick = window._rcScreenBtnHandler
  }

  // The bottom-row wrapper was just re-inserted as a sibling of the top
  // row inside the Swal popup. Promote it back to <body> so its
  // `position: fixed; bottom: 0` resolves relative to the viewport.
  if (acceptBottomBool) _promoteCameraPreviewsBottomToBody()
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
    const allCameras = await getAvailableCameras()
    if (!RC.availableCameras) RC.availableCameras = allCameras
    if (!RC.cameraArray) {
      RC.cameraArray = allCameras.map(c => ({
        name: c.label || '',
        likelyBuiltIn: c.likelyBuiltIn,
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
  // Allow the popup to expand to fit all cameras without artificial width limits
  const cameraPreviewWidth = 272 // Actual video width
  const cameraPadding = 10 // Padding around each camera
  const cameraMargin = 5 // Margin between cameras
  const totalCameraWidth = cameraPreviewWidth + cameraPadding * 2 + cameraMargin
  const minWidth = 600 // Minimum width for 2 cameras
  const calculatedWidth = Math.max(
    minWidth,
    totalCameraWidth * (cameras.length + 1) + 100, // +1 for the "Choose another screen" button
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
        ${privacyMessage ? `<div id="rc-camera-privacy-text" style="font-size: ${(16 / 1.4) * 1.25}px; direction: ${RC.LD === RC._CONST.RTL ? 'rtl' : 'ltr'}; line-height: 1.4; white-space: pre-line; max-width: 500px; text-align: ${RC.LD === RC._CONST.RTL ? 'right' : 'left'}; flex-shrink: 0; margin-top: 12px; padding: 0 30px 0.5rem 30px; align-self: flex-start; box-sizing: border-box;">${processInlineFormatting(privacyMessage).replace(/\n/g, '<br>')}</div>` : ''}
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
      }

      // Show the camera title now that the popup is visible
      showCameraTitleInTopRight(RC, titleKey)

      // --- "Choose another screen" / "Choose this screen" toggle ---
      let isInChooseAnotherScreenMode = false
      const originalMessage = processInlineFormatting(message || '').replace(
        /\n/g,
        '<br>',
      )

      const screenBtnHandler = async () => {
        const btn = document.getElementById('rc-choose-another-screen-btn')
        const instrDiv = document.getElementById('rc-camera-instruction-text')
        if (!btn) return

        if (!isInChooseAnotherScreenMode) {
          isInChooseAnotherScreenMode = true
          await exitFullscreen()
          if (instrDiv) {
            instrDiv.innerHTML = processInlineFormatting(
              phrases.RC_DragToAnotherScreen?.[RC.L] ||
                'Drag this window to another screen.',
            ).replace(/\n/g, '<br>')
          }
          showCameraTitleInTopRight(RC, 'RC_ChooseScreenTitle')

          // Hide the original button wrapper, camera arrow, and privacy text
          const btnWrapper = document.getElementById(
            'rc-choose-screen-btn-wrapper',
          )
          if (btnWrapper) btnWrapper.style.display = 'none'
          const cameraArrow = document.getElementById('rc-camera-arrow')
          if (cameraArrow) cameraArrow.style.display = 'none'
          const privacyText = document.getElementById('rc-camera-privacy-text')
          if (privacyText) privacyText.style.display = 'none'

          const isRTL = RC.LD === RC._CONST.RTL
          const screenArrow = isRTL ? '←' : '→'
          const belowDiv = document.createElement('div')
          belowDiv.id = 'rc-choose-screen-btn-below'
          belowDiv.style.cssText =
            'display: flex; align-items: center; justify-content: center; margin-top: 0.75rem; flex-shrink: 0; padding-bottom: 0.5rem;'
          if (isRTL) belowDiv.style.direction = 'rtl'

          const arrowSpan = document.createElement('span')
          arrowSpan.style.cssText =
            'font-size: clamp(36pt, 8vw, 72pt); color: #000; user-select: none; pointer-events: none; line-height: 1; flex-shrink: 0;'
          arrowSpan.textContent = screenArrow

          const belowBtn = document.createElement('button')
          belowBtn.id = 'rc-choose-another-screen-btn'
          belowBtn.className = 'rc-button rc-go-button'
          belowBtn.style.cssText =
            'font-size: 1rem !important; padding: 0.5rem 2rem !important;'
          belowBtn.innerHTML = processInlineFormatting(
            phrases.RC_ChooseThisScreenButton?.[RC.L] || 'Choose this screen',
          )

          // Invisible spacer to balance the arrow so button stays centered
          const spacer = document.createElement('span')
          spacer.style.cssText =
            'font-size: clamp(36pt, 8vw, 72pt); visibility: hidden; flex-shrink: 0; line-height: 1;'
          spacer.textContent = screenArrow

          belowDiv.appendChild(arrowSpan)
          belowDiv.appendChild(belowBtn)
          belowDiv.appendChild(spacer)
          instrDiv.parentElement.appendChild(belowDiv)
          belowBtn.onclick = screenBtnHandler
        } else {
          isInChooseAnotherScreenMode = false
          await getFullscreen(RC.L, RC)
          if (instrDiv) {
            instrDiv.innerHTML = originalMessage
          }
          // Remove the below-text button + arrow and restore the in-row ones
          const belowDiv = document.getElementById('rc-choose-screen-btn-below')
          if (belowDiv) belowDiv.remove()
          const cameraArrow = document.getElementById('rc-camera-arrow')
          if (cameraArrow) cameraArrow.style.display = ''
          const privacyText = document.getElementById('rc-camera-privacy-text')
          if (privacyText) privacyText.style.display = ''
          const btnWrapper = document.getElementById(
            'rc-choose-screen-btn-wrapper',
          )
          if (btnWrapper) {
            btnWrapper.style.display = ''
            const rowBtn = btnWrapper.querySelector('button')
            if (rowBtn) {
              rowBtn.innerHTML = processInlineFormatting(
                phrases.RC_ChooseAnotherScreenButton?.[RC.L] ||
                  'Choose another screen',
              )
              rowBtn.style.background = '#999'
              rowBtn.onclick = screenBtnHandler
            }
          }
          showCameraTitleInTopRight(RC, titleKey)
        }
      }

      // Store handler so updateCameraPreviews can re-attach it
      window._rcScreenBtnHandler = screenBtnHandler

      const screenBtn = document.getElementById('rc-choose-another-screen-btn')
      if (screenBtn) {
        screenBtn.onclick = screenBtnHandler
      }

      // Store initial cameras for comparison
      let currentCameras = [...cameras]
      let cameraPollingInterval = null
      RC.highlightedCameraDeviceId = null // Track which camera is highlighted
      RC.cameraSelectionLoading = false // Store loading state on RC object for proper cleanup

      // Force set the popup width via inline styles to ensure it takes effect
      const popupElement = document.querySelector('.camera-selection-popup')
      if (popupElement) {
        popupElement.style.maxWidth = 'none'
        popupElement.style.width = dynamicMaxWidth
        popupElement.style.minWidth = dynamicMaxWidth
        console.log('Applied inline width to popup:', dynamicMaxWidth)
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
            const newCamerasAll = await getAvailableCameras()
            // Refresh the full-list stats (covers hot-plugged cameras).
            RC.availableCameras = newCamerasAll
            RC.cameraArray = newCamerasAll.map(c => ({
              name: c.label || '',
              likelyBuiltIn: c.likelyBuiltIn,
              opinion:
                RC.cameraArray?.find(prev => prev.name === c.label)?.opinion ||
                null,
            }))
            // Re-apply the same exclude-external filter.
            const opts = RC._cameraSelectionOptions || {}
            const excludeExternalPoll =
              opts.calibrateDistanceExcludeExternalCamerasBool !== false
            const newCameras = excludeExternalPoll
              ? newCamerasAll.filter(c => c.likelyBuiltIn >= 0)
              : newCamerasAll
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
                      // Update visual state of all previews immediately
                      // (in both top and bottom rows, kept in sync).
                      newCameras.forEach((camera, index) => {
                        const isActive =
                          camera.deviceId === selectedCamera.deviceId
                        _applyCameraContainerState(
                          index,
                          isActive ? 'highlight' : 'normal',
                        )
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

      // Handle keyboard events
      const keydownListener = event => {
        // Prevent space key from triggering other functions
        if (event.key === ' ') {
          event.preventDefault()
          event.stopPropagation()
          return
        }

        if (event.key === 'Enter' || event.key === 'Return') {
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
            // Set loading state
            RC.cameraSelectionLoading = true

            // Disable all camera previews during loading (both rows)
            _setAllCameraContainersDisabled(cameras, true)

            // Call selectCamera and wait for it to complete (same as click handler)
            window
              .selectCamera(hoveredCamera.deviceId, hoveredCamera.label)
              .then(() => {
                Swal.clickConfirm()
              })
              .catch(error => {
                console.error('Error selecting camera via Enter key:', error)
                Swal.clickConfirm()
              })
          } else {
            // No camera available, just close
            Swal.clickConfirm()
          }
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

      // Create global camera selection function
      window.selectCamera = async (deviceId, label) => {
        const selectedCamera = cameras.find(cam => cam.deviceId === deviceId)

        if (selectedCamera && RC.gazeTracker?.webgazer) {
          // Disable all preview containers during switching (both rows)
          _setAllCameraContainersDisabled(cameras, true)

          try {
            const success = await switchToCamera(RC, selectedCamera)

            if (success) {
              // Update visual state of all previews immediately
              // (kept in sync across top and bottom rows).
              cameras.forEach((camera, index) => {
                const isActive = camera.deviceId === selectedCamera.deviceId
                _applyCameraContainerState(
                  index,
                  isActive ? 'highlight' : 'normal',
                )
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
      // to set cameraXYPx to top vs bottom centre).
      cameras.forEach((camera, index) => {
        const containers = _getCameraContainersForIndex(index)

        for (const container of containers) {
          // Hover highlight - treat as tentative selection
          container.addEventListener('mouseenter', async () => {
            const deviceId = container.getAttribute('data-device-id')
            RC.highlightedCameraDeviceId = deviceId
            RC.highlightedCameraRow =
              container.getAttribute('data-camera-row') || 'top'

            // Unhighlight every container in BOTH rows...
            for (let j = 0; j < cameras.length; j++) {
              _applyCameraContainerState(j, 'normal')
            }
            // ...then highlight the matching device in BOTH rows so the
            // visual state is consistent regardless of which row is hovered.
            _applyCameraContainerState(index, 'highlight')

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
            await window.selectCamera(deviceId, label)

            // Close the popup (same as clicking OK)
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
        if (cameraIndex !== -1) {
          const isActive =
            currentActiveCamera && currentActiveCamera.deviceId === deviceId
          for (const container of _getCameraContainersForIndex(cameraIndex)) {
            container.style.backgroundColor = isActive
              ? '#e8f5e8'
              : 'transparent'
            container.style.border = isActive
              ? '2px solid #28a745'
              : '2px solid transparent'
            container.style.transform = 'scale(1)'
          }
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
              Swal.clickConfirm()
            }
          } catch (error) {
            console.error('Camera switch error:', error)
          }
        }
      }
    },
    willClose: () => {
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
  // Restore video container display for the popup
  if (mainVideoContainer) {
    mainVideoContainer.style.display = originalMainVideoDisplay
  }

  const result = await Swal.fire({
    ...swalInfoOptions(RC, { showIcon: false }),
    html: `
      <p style="text-align: left; margin-top: 1rem; font-size: 1.2rem; line-height: 1.6;">
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
  const allCameras = await getAvailableCameras()
  RC.cameraArray = allCameras.map(c => ({
    name: c.label || '',
    likelyBuiltIn: c.likelyBuiltIn,
    opinion: null,
  }))

  // Default TRUE: hide externals; built-in and unknown stay visible.
  const excludeExternal =
    options.calibrateDistanceExcludeExternalCamerasBool !== false
  const cameras = excludeExternal
    ? allCameras.filter(c => c.likelyBuiltIn >= 0)
    : allCameras
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
      RC._isWaitingForCameraReconnect = true
      await new Promise(resolve => {
        const unsub = RC.gazeTracker.onCameraReconnected(() => {
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
      RC.selectedCamera = null
      RC.cameraIncorporation = null
      RC.cameraIncorporationReported = null
      return await showTestPopup(RC, onClose, options)
    }

    // Ask opinion when classification is unknown, then run resolution.
    if (result.selectedCamera) {
      if (RC.cameraIncorporation === 'unknown') {
        await askCameraIncorporationOpinion(RC)
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

  // If popup was interrupted by camera disconnection, wait for the
  // reconnection flow to finish and then re-show camera selection.
  // Set _isWaitingForCameraReconnect so GazeTracker's reconnect handler
  // knows we are going to re-run the camera flow ourselves and should
  // NOT also re-run _handlePostCameraResolution.
  if (!result.selectedCamera && RC.gazeTracker?.isCameraDisconnected()) {
    RC._isWaitingForCameraReconnect = true
    await new Promise(resolve => {
      const unsub = RC.gazeTracker.onCameraReconnected(() => {
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
    RC.selectedCamera = null
    RC.cameraIncorporation = null
    RC.cameraIncorporationReported = null
    return await showTestPopup(RC, onClose, options)
  }

  // Ask opinion when classification is unknown, then run resolution.
  if (result.selectedCamera) {
    if (RC.cameraIncorporation === 'unknown') {
      await askCameraIncorporationOpinion(RC)
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

import Swal from 'sweetalert2'
import { phrases } from '../i18n/schema'
import { swalInfoOptions } from './swalOptions'
import { setUpEasyEyesKeypadHandler } from '../extensions/keypadHandler'
import { exitFullscreen, getFullscreen, isFullscreen } from './utils'
import { processInlineFormatting } from '../distance/markdownInstructionParser'

/**
 * Remove parenthesized hex device IDs from camera labels.
 * e.g. "FaceTime HD Camera (0x1400000005ac8514)" → "FaceTime HD Camera"
 */
const _stripHexId = label =>
  String(label)
    .replace(/\s*\([0-9a-fA-Fx:]+\)\s*/g, '')
    .trim()

const _cameraCaptionHTML = (label, resolution) => {
  const clean = _stripHexId(label)
  if (!resolution || !resolution.width) return `<div>${clean}</div>`
  const hz = resolution.frameRate ? `, ${Math.round(resolution.frameRate)} Hz` : ''
  return `<div>${clean}</div><div>${resolution.width}×${resolution.height}${hz}</div>`
}

const _updateCaptionInContainer = (container, camera, index) => {
  const caption = container.querySelector('.rc-camera-caption')
  if (caption) {
    caption.innerHTML = _cameraCaptionHTML(
      camera.label || `Camera ${index + 1}`,
      camera.resolution,
    )
  }
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

  // Create the title element
  const titleElement = document.createElement('div')
  titleElement.id = 'rc-camera-title-top-right'
  titleElement.dir = isRTL ? 'rtl' : 'ltr'
  titleElement.innerHTML = `<h1>${processInlineFormatting(phrases[titleKey][RC.L])}</h1>`

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

  const titleH1 = titleElement.querySelector('h1')
  if (titleH1) {
    titleH1.style.cssText = `
      margin: 0;
      padding: 0;
      font-size: clamp(16px, 4vw, 36px);
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

/**
 * Gets available camera devices
 * @returns {Promise<Array>} - Array of camera devices
 */
const getAvailableCameras = async () => {
  try {
    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      const devices = await navigator.mediaDevices.enumerateDevices()
      return devices.filter(device => device.kind === 'videoinput')
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
) => {
  if (cameras.length === 0) {
    return '<p style="color: #666; font-style: italic;">No cameras detected</p>'
  }

  // Responsive preview sizing: max matches original, scales down for small windows
  const videoContainer = document.getElementById('webgazerVideoContainer')
  const maxW = videoContainer
    ? Math.round(parseInt(videoContainer.style.width || '320') * 0.85)
    : 272
  const maxH = videoContainer
    ? parseInt(videoContainer.style.height || '240')
    : 240
  const previewSize = {
    width: `clamp(120px, 18vw, ${maxW}px)`,
    height: `clamp(90px, 13.5vw, ${maxH}px)`,
  }

  let previewsHTML =
    '<div style="display: flex; flex-wrap: wrap; gap: 10px; margin: 0; justify-content: center; align-items: center; width: 100%;">'

  for (let i = 0; i < cameras.length; i++) {
    const camera = cameras[i]
    const previewId = `camera-preview-${i}`
    const isActive =
      currentActiveCamera && currentActiveCamera.deviceId === camera.deviceId

    const cleanLabel = _stripHexId(camera.label || `Camera ${i + 1}`)

    previewsHTML += `
      <div 
        id="camera-preview-container-${i}"
        class="camera-preview-container"
        data-device-id="${camera.deviceId}"
        data-camera-label="${cleanLabel}"
        style="display: flex; flex-direction: column; align-items: center; margin: 0; padding: 5px; border-radius: 8px; transition: all 0.2s ease; ${isActive ? 'background-color: #e8f5e8; border: 2px solid #28a745;' : 'border: 2px solid transparent;'}"
      >
        <video 
          id="${previewId}" 
          style="width: ${previewSize.width}; height: ${previewSize.height}; border: 2px solid #ccc; border-radius: 4px; object-fit: cover; pointer-events: none;"
          autoplay 
          muted 
          playsinline
        ></video>
        <div class="rc-camera-caption" style="margin-top: 5px; font-size: 12px; text-align: center; max-width: ${previewSize.width}; word-wrap: break-word; white-space: normal; color: ${isActive ? '#28a745' : '#666'}; font-weight: ${isActive ? 'bold' : 'normal'}; line-height: 1.4;">
          <div>${cleanLabel}</div>
        </div>
      </div>
    `
  }

  previewsHTML += '</div>'

  // Start video streams for all cameras in PARALLEL with optimized resolution
  setTimeout(() => {
    cameras.forEach(async (camera, i) => {
      const videoElement = document.getElementById(`camera-preview-${i}`)
      const container = document.getElementById(`camera-preview-container-${i}`)
      const captionDiv = container?.querySelector('.rc-camera-caption')

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

          // Get resolution + frame rate and update caption
          const videoTrack = stream.getVideoTracks()[0]
          if (videoTrack && captionDiv) {
            const settings = videoTrack.getSettings()
            const width = settings.width || 0
            const height = settings.height || 0
            const frameRate = settings.frameRate
              ? Math.round(settings.frameRate)
              : 0
            const cleanLabel = _stripHexId(camera.label || `Camera ${i + 1}`)
            captionDiv.innerHTML =
              `<div>${cleanLabel}</div>` +
              `<div>${width}×${height}${frameRate ? `, ${frameRate} Hz` : ''}</div>`

            camera.resolution = { width, height }
          }
        } catch (error) {
          console.error(
            `Failed to get stream for camera ${camera.label}:`,
            error,
          )
          videoElement.style.border = '2px solid #dc3545'
          videoElement.style.backgroundColor = '#f8d7da'
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
const updateTitleAndDescription = (
  RC,
  titleKey,
  messageKey,
  privacyMessage,
) => {
  showCameraTitleInTopRight(RC, titleKey)
  const messageDiv = document.querySelector(
    '.camera-selection-popup .swal2-html-container div[style*="background: white"]',
  )
  if (messageDiv) {
    let messageHtml = phrases[messageKey][RC.L]
    if (privacyMessage) {
      messageHtml += `<br><br>${phrases.RC_privacyCamera[RC.L]}`
    }
    messageDiv.innerHTML = processInlineFormatting(messageHtml)
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

  // Stop old video streams
  oldCameras.forEach((camera, index) => {
    const videoElement = document.getElementById(`camera-preview-${index}`)
    if (videoElement && videoElement.srcObject) {
      const stream = videoElement.srcObject
      stream.getTracks().forEach(track => track.stop())
    }
  })

  // Create new previews HTML
  const newPreviewsHTML = await createCameraPreviews(
    newCameras,
    RC,
    null,
    currentActiveCamera,
  )

  // Replace the previews section
  const oldPreviewsDiv = previewContainer.querySelector(
    'div[style*="display: flex"]',
  )
  if (oldPreviewsDiv) {
    oldPreviewsDiv.outerHTML = newPreviewsHTML
  }

  const isSingleCamera = newCameras.length === 1
  const titleKey = isSingleCamera
    ? 'RC_NeedCameraTitle'
    : 'RC_ChooseCameraTitle'
  const messageKey = isSingleCamera ? 'RC_NeedCamera' : 'RC_ChooseCamera'
  updateTitleAndDescription(RC, titleKey, messageKey, privacyMessage)

  // Re-add event listeners for new previews
  newCameras.forEach((camera, index) => {
    const container = document.getElementById(
      `camera-preview-container-${index}`,
    )
    if (container) {
      // Hover highlight - treat as tentative selection
      container.addEventListener('mouseenter', async () => {
        const deviceId = container.getAttribute('data-device-id')
        const label = container.getAttribute('data-camera-label')
        RC.highlightedCameraDeviceId = deviceId // Store highlighted camera

        // Unhighlight all containers first (including active ones)
        newCameras.forEach((otherCamera, otherIndex) => {
          const otherContainer = document.getElementById(
            `camera-preview-container-${otherIndex}`,
          )
          if (otherContainer) {
            otherContainer.style.backgroundColor = 'transparent'
            otherContainer.style.border = '2px solid transparent'
            const cap = otherContainer.querySelector('.rc-camera-caption')
            if (cap) { cap.style.color = '#666'; cap.style.fontWeight = 'normal' }
          }
        })

        // Highlight current container as tentative selection
        container.style.backgroundColor = '#e8f5e8'
        container.style.border = '2px solid #28a745'
        const cap = container.querySelector('.rc-camera-caption')
        if (cap) { cap.style.color = '#28a745'; cap.style.fontWeight = 'bold' }

        // Actually switch to this camera temporarily
        const selectedCamera = newCameras.find(cam => cam.deviceId === deviceId)
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

        // Set loading state
        RC.cameraSelectionLoading = true

        // Disable all camera previews during loading
        newCameras.forEach((camera, index) => {
          const container = document.getElementById(
            `camera-preview-container-${index}`,
          )
          if (container) {
            container.style.pointerEvents = 'none'
            container.style.opacity = '0.6'
          }
        })

        // Call the same function that OK button would call
        await window.selectCamera(deviceId, label)

        // Close the popup (same as clicking OK)
        Swal.clickConfirm()
      })
    }
  })
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
) => {
  // Title will be shown in didOpen callback to avoid flash before popup renders

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

  // Get available cameras
  const cameras = await getAvailableCameras()

  // Store available cameras on RC object
  RC.availableCameras = cameras

  // Get current active camera
  const currentActiveCamera = getCurrentActiveCamera(RC)

  // Create camera previews
  const cameraPreviewsHTML = await createCameraPreviews(
    cameras,
    RC,
    null,
    currentActiveCamera,
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
    totalCameraWidth * cameras.length + 100,
  )
  const dynamicMaxWidth = `${calculatedWidth}px`

  const result = await Swal.fire({
    ...swalInfoOptions(RC, { showIcon: false }),
    icon: undefined,
    title: '', // Remove the default title since we're adding our own
    html: `
      <div style="display: flex; flex-direction: column; align-items: center; height: 100%; max-height: 100vh; overflow: hidden; box-sizing: border-box;">
        <div style="flex: 1 1 auto; min-height: 0; display: flex; align-items: center; justify-content: center; width: 100%;">
          ${cameraPreviewsHTML}
        </div>
        <div id="rc-camera-instruction-text" style="background: transparent; padding: 0.5rem 1rem; margin-top: 0.5rem; flex-shrink: 0; text-align: center;">${processInlineFormatting(message || '')}</div>
        <div style="text-align: center; margin-top: 0.5rem; flex-shrink: 0; padding-bottom: 0.5rem;">
          <button id="rc-choose-another-screen-btn" class="rc-button" style="font-size: 0.85rem !important; padding: 0.35rem 1rem !important; background: #999 !important;">
            ${phrases.RC_ChooseAnotherScreenButton?.[RC.L]}
          </button>
        </div>
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
        popup.style.overflow = 'hidden'
      }
      const htmlContainer = popup?.querySelector('.swal2-html-container')
      if (htmlContainer) {
        htmlContainer.style.maxHeight = 'calc(100vh - 2rem)'
        htmlContainer.style.overflow = 'hidden'
      }

      // Show the camera title now that the popup is visible
      showCameraTitleInTopRight(RC, titleKey)

      // --- "Choose another screen" / "Choose this screen" toggle ---
      let isInChooseAnotherScreenMode = false
      const screenBtn = document.getElementById('rc-choose-another-screen-btn')
      const instructionDiv = document.getElementById('rc-camera-instruction-text')
      const originalMessage = processInlineFormatting(message || '')

      if (screenBtn) {
        screenBtn.onclick = async () => {
          if (!isInChooseAnotherScreenMode) {
            // Switch to "drag to another screen" mode
            isInChooseAnotherScreenMode = true
            await exitFullscreen()
            if (instructionDiv) {
              instructionDiv.innerHTML = processInlineFormatting(
                phrases.RC_DragToAnotherScreen?.[RC.L]
              )
            }
            screenBtn.textContent =
              phrases.RC_ChooseThisScreenButton?.[RC.L]
            screenBtn.style.background = '#019267'
          } else {
            // Restore to camera selection mode
            isInChooseAnotherScreenMode = false
            await getFullscreen(RC.L, RC)
            if (instructionDiv) {
              instructionDiv.innerHTML = originalMessage
            }
            screenBtn.textContent =
              phrases.RC_ChooseAnotherScreenButton?.[RC.L]
            screenBtn.style.background = '#999'
          }
        }
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
            const newCameras = await getAvailableCameras()

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
                  // Disable all preview containers during switching
                  newCameras.forEach((camera, index) => {
                    const container = document.getElementById(
                      `camera-preview-container-${index}`,
                    )
                    if (container) {
                      container.style.pointerEvents = 'none'
                      container.style.opacity = '0.6'
                    }
                  })

                  try {
                    const success = await switchToCamera(RC, selectedCamera)

                    if (success) {
                      // Update visual state of all previews immediately
                      newCameras.forEach((camera, index) => {
                        const container = document.getElementById(
                          `camera-preview-container-${index}`,
                        )
                        const isActive =
                          camera.deviceId === selectedCamera.deviceId

                        if (container) {
                          if (isActive) {
                            container.style.backgroundColor = '#e8f5e8'
                            container.style.border = '2px solid #28a745'
                            const cap = container.querySelector('.rc-camera-caption')
                            if (cap) { cap.style.color = '#28a745'; cap.style.fontWeight = 'bold' }
                          } else {
                            container.style.backgroundColor = 'transparent'
                            container.style.border = '2px solid transparent'
                            const cap = container.querySelector('.rc-camera-caption')
                            if (cap) { cap.style.color = '#666'; cap.style.fontWeight = 'normal' }
                          }
                          _updateCaptionInContainer(container, camera, index)
                        }
                      })

                      // Store the selected camera for return
                      RC.selectedCamera = selectedCamera
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

            // Disable all camera previews during loading
            cameras.forEach((camera, index) => {
              const container = document.getElementById(
                `camera-preview-container-${index}`,
              )
              if (container) {
                container.style.pointerEvents = 'none'
                container.style.opacity = '0.6'
              }
            })

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
          // Disable all preview containers during switching
          cameras.forEach((camera, index) => {
            const container = document.getElementById(
              `camera-preview-container-${index}`,
            )
            if (container) {
              container.style.pointerEvents = 'none'
              container.style.opacity = '0.6'
            }
          })

          try {
            const success = await switchToCamera(RC, selectedCamera)

            if (success) {
              // Update visual state of all previews immediately
              cameras.forEach((camera, index) => {
                const container = document.getElementById(
                  `camera-preview-container-${index}`,
                )
                const isActive = camera.deviceId === selectedCamera.deviceId

                if (container) {
                  if (isActive) {
                    container.style.backgroundColor = '#e8f5e8'
                    container.style.border = '2px solid #28a745'
                    const cap = container.querySelector('.rc-camera-caption')
                    if (cap) { cap.style.color = '#28a745'; cap.style.fontWeight = 'bold' }
                  } else {
                    container.style.backgroundColor = 'transparent'
                    container.style.border = '2px solid transparent'
                    const cap = container.querySelector('.rc-camera-caption')
                    if (cap) { cap.style.color = '#666'; cap.style.fontWeight = 'normal' }
                  }
                  _updateCaptionInContainer(container, camera, index)
                }
              })

              // Store the selected camera for return
              RC.selectedCamera = selectedCamera
            }
          } catch (error) {
            console.error('Camera switch error:', error)
          }
          // Remove the finally block that re-enables containers - let the timeout handle it
        }
      }

      // Add event listeners for hover and click behavior
      cameras.forEach((camera, index) => {
        const container = document.getElementById(
          `camera-preview-container-${index}`,
        )
        if (container) {
          // Hover highlight - treat as tentative selection
          container.addEventListener('mouseenter', async () => {
            const deviceId = container.getAttribute('data-device-id')
            const label = container.getAttribute('data-camera-label')
            RC.highlightedCameraDeviceId = deviceId // Store highlighted camera

            // Unhighlight all containers first (including active ones)
            cameras.forEach((otherCamera, otherIndex) => {
              const otherContainer = document.getElementById(
                `camera-preview-container-${otherIndex}`,
              )
              if (otherContainer) {
                otherContainer.style.backgroundColor = 'transparent'
                otherContainer.style.border = '2px solid transparent'
                const cap = otherContainer.querySelector('.rc-camera-caption')
                if (cap) { cap.style.color = '#666'; cap.style.fontWeight = 'normal' }
              }
            })

            // Highlight current container as tentative selection
            container.style.backgroundColor = '#e8f5e8'
            container.style.border = '2px solid #28a745'
            const cap = container.querySelector('.rc-camera-caption')
            if (cap) { cap.style.color = '#28a745'; cap.style.fontWeight = 'bold' }

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

            // Set loading state
            RC.cameraSelectionLoading = true

            // Disable all camera previews during loading
            cameras.forEach((camera, index) => {
              const container = document.getElementById(
                `camera-preview-container-${index}`,
              )
              if (container) {
                container.style.pointerEvents = 'none'
                container.style.opacity = '0.6'
              }
            })

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
          const container = document.getElementById(
            `camera-preview-container-${cameraIndex}`,
          )
          if (container) {
            container.style.backgroundColor = '#f0f8ff'
            container.style.border = '2px solid #007bff'
            container.style.transform = 'scale(1.02)'
          }
        }
      }

      window.unhighlightCamera = deviceId => {
        const cameraIndex = cameras.findIndex(cam => cam.deviceId === deviceId)
        if (cameraIndex !== -1) {
          const container = document.getElementById(
            `camera-preview-container-${cameraIndex}`,
          )
          if (container) {
            const isActive =
              currentActiveCamera && currentActiveCamera.deviceId === deviceId
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

          // Disable all preview containers during switching
          cameras.forEach((camera, index) => {
            const container = document.getElementById(
              `camera-preview-container-${index}`,
            )
            if (container) {
              container.style.pointerEvents = 'none'
              container.style.opacity = '0.6'
            }
          })

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

      // DON'T restore video container here - let the next step handle it
      // This prevents the blank page flash between popup close and next UI render

      // If no camera was explicitly selected, restore the original camera
      if (!RC.selectedCamera && RC.gazeTracker?.webgazer) {
        // Restore to the original active camera
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

      // Stop all preview video streams
      cameras.forEach((camera, index) => {
        const videoElement = document.getElementById(`camera-preview-${index}`)
        if (videoElement && videoElement.srcObject) {
          const stream = videoElement.srcObject
          stream.getTracks().forEach(track => track.stop())
        }
      })

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

  // Call onClose callback if provided
  if (onClose && typeof onClose === 'function') {
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
 * and optionally show the original/final resolution with an OK button.
 */
const _handlePostCameraResolution = async (RC, options) => {
  // Capture original resolution BEFORE applying constraints
  const origInfo = getCameraInfo(RC)

  // Brief "Setting..." message while resolution is being applied
  // (only shown when _showCameraResolutionBool is true, so the participant
  //  knows something is happening)
  if (options._showCameraResolutionBool) {
    showResolutionSettingMessage(RC)
  }

  // Force fullscreen
  try {
    await getFullscreen(RC.L, RC)
  } catch (error) {
    console.warn('Failed to enter fullscreen after camera selection:', error)
  }

  // Apply resolution constraints
  await checkResolutionAfterSelection(RC, options)

  // Now get the FINAL resolution after constraints are applied
  const finalInfo = getCameraInfo(RC)

  // Always hide the brief "Setting..." message
  hideResolutionSettingMessage()

  if (options._showCameraResolutionBool) {
    const lang = RC?.L || RC?.language?.value || 'en-US'
    let text =
      phrases?.RC_SettingWebcamResolution?.[lang] ||
      phrases?.RC_SettingWebcamResolution?.['en-US'] ||
      'Setting webcam resolution ...\nCurrently [[M11]]×[[M22]], [[M33]] Hz\nRequested [[M44]]×[[M55]], [[M66]] Hz'

    text = text
      .replace('[[M11]]', origInfo.width || '?')
      .replace('[[M22]]', origInfo.height || '?')
      .replace('[[M33]]', origInfo.frameRate || '?')
      .replace('[[M44]]', finalInfo.width || '?')
      .replace('[[M55]]', finalInfo.height || '?')
      .replace('[[M66]]', finalInfo.frameRate || '?')

    await Swal.fire({
      ...swalInfoOptions(RC, { showIcon: false }),
      icon: undefined,
      title: '',
      html: `<div style="text-align: center; color: #666; font-style: normal; font-size: 1.6rem; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif; line-height: 1.6;">${processInlineFormatting(text).replace(/\n/g, '<br>')}</div>`,
      confirmButtonText: phrases.RC_ok?.[RC.L] || 'OK',
      allowEnterKey: true,
      allowOutsideClick: false,
      allowEscapeKey: false,
      background: 'transparent',
      backdrop: '#eee',
      showClass: { popup: '' },
      hideClass: { popup: '' },
      customClass: {
        popup: 'my__swal2__container',
        confirmButton: 'rc-button rc-go-button',
      },
      didOpen: () => {
        const popup = Swal.getPopup()
        if (popup) {
          popup.style.boxShadow = 'none'
          popup.style.border = 'none'
          popup.style.padding = '0'
        }
        const confirmBtn = Swal.getConfirmButton()
        if (confirmBtn) confirmBtn.focus()
      },
    })
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

  // Hide the main video preview immediately to prevent flash
  const mainVideoContainer = document.getElementById('webgazerVideoContainer')
  // Always restore to 'block' after popup closes (video may be hidden during init)
  const originalMainVideoDisplay = 'block'
  if (mainVideoContainer) {
    mainVideoContainer.style.display = 'none'
  }

  // Check if there are cameras available
  const cameras = await getAvailableCameras()

  let conditionalPrivacyCamera = ''
  if (!options.saveSnapshots) {
    conditionalPrivacyCamera = phrases.RC_privacyCamera[RC.L]
  }

  // Handle different camera scenarios
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
      phrases.RC_NeedCamera[RC.L],
      conditionalPrivacyCamera,
      onClose,
      'RC_ChooseCameraTitle',
    )

    // After camera selection, force fullscreen and check resolution if a camera was selected
    if (result.selectedCamera) {
      await _handlePostCameraResolution(RC, options)
    }

    // Final safety cleanup - ensure camera polling is stopped
    if (RC.cameraPollingInterval) {
      clearInterval(RC.cameraPollingInterval)
      RC.cameraPollingInterval = null
    }

    return result
  }

  // Show popup for 2 or more cameras
  const result = await showCameraSelectionPopup(
    RC,
    '',
    phrases.RC_ImprovingCameraResolution[RC.L],
    conditionalPrivacyCamera,
    onClose,
    'RC_ChooseCameraTitle',
  )

  // After camera selection, force fullscreen and check resolution if a camera was selected
  if (result.selectedCamera) {
    await _handlePostCameraResolution(RC, options)
  }

  // Final safety cleanup - ensure camera polling is stopped
  if (RC.cameraPollingInterval) {
    clearInterval(RC.cameraPollingInterval)
    RC.cameraPollingInterval = null
  }

  return result
}

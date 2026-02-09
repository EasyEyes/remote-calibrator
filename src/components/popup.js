import Swal from 'sweetalert2'
import { phrases } from '../i18n/schema'
import { swalInfoOptions } from './swalOptions'
import { setUpEasyEyesKeypadHandler } from '../extensions/keypadHandler'
import { exitFullscreen, getFullscreen, isFullscreen } from './utils'

/**
 * Shows the camera selection title in the top right of the webpage
 * @param {Object} RC - RemoteCalibrator instance
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

  // Create the title element
  const titleElement = document.createElement('div')
  titleElement.id = 'rc-camera-title-top-right'
  titleElement.innerHTML = `<h1>${phrases[titleKey][RC.L]}</h1>`

  // Add CSS styling - no background, high z-index to appear above popup, positioned on left
  titleElement.style.cssText = `
    position: fixed;
    top: 2rem;
    left: 3rem;
    z-index: 9999999999;
    color: #000;
    margin: 0;
    text-align: left;
    pointer-events: none;
  `

  // Style the inner h1
  const titleH1 = titleElement.querySelector('h1')
  if (titleH1) {
    titleH1.style.cssText = `
      margin: 0;
      padding: 0;
    `
  }

  // Add to the page
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
    // Remove any existing message first
    hideResolutionSettingMessage()

    // Get camera info
    const cameraInfo = getCameraInfo(RC)

    // Create the message container - plain text, centered on screen
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
      font-size: 1.875em;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
      pointer-events: none;
      user-select: none;
    `

    // Build the text with camera info
    const lang = RC?.L || RC?.language?.value || 'en-US'
    let text =
      phrases?.RC_SettingWebcamResolution?.[lang] ||
      phrases?.RC_SettingWebcamResolution?.['en-US'] ||
      'Setting webcam resolution → [[M11]]×[[M22]], [[M33]] Hz ...'

    // Replace placeholders with actual values
    text = text
      .replace('[[M11]]', cameraInfo.width || '?')
      .replace('[[M22]]', cameraInfo.height || '?')
      .replace('[[M33]]', cameraInfo.frameRate || '?')

    // Add camera name on a separate line if available
    if (cameraInfo.name) {
      messageContainer.innerHTML = `${cameraInfo.name}<br>${text}`
    } else {
      messageContainer.textContent = text
    }

    // Always append to body to ensure highest z-index stacking context
    document.body.appendChild(messageContainer)
    console.log('📹 Showing resolution setting message:', cameraInfo)
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
    html: message,
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
 * Applies ideal resolution constraints to the specified camera device only
 * @param {Object} RC - RemoteCalibrator instance
 * @param {string} deviceId - Camera device ID to apply constraints to
 * @returns {Promise<boolean>} - True if successful, false otherwise
 */
const applyIdealResolutionConstraints = async (RC, deviceId) => {
  if (!RC.gazeTracker?.webgazer) {
    return false
  }

  try {
    console.log(
      `Applying optimized resolution constraints to device ${deviceId}...`,
    )

    // Use min constraints to force best resolution (same technique as preview loading)
    // setCameraConstraints will use progressive fallback: min 1920 → 1280 → ideal-only
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

      // Consider it successful if we got at least 1280x720 or higher
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
        title: phrases.RC_ImprovingCameraResolutionTitle[RC.L],
        html: `
            <div style="text-align: left; margin: 1rem 0; padding: 0;">
              <p style="margin: 0; padding: 0; text-align: left; font-style: normal;"> ${phrases.RC_ImprovingCameraResolution[RC.L].replace('𝟙𝟙𝟙', width).replace('𝟚𝟚𝟚', height)}</p>
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
      // This will stay visible until the calling code hides it
      showResolutionSettingMessage(RC)
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

  // Get the size of the main video preview for reference
  const videoContainer = document.getElementById('webgazerVideoContainer')
  const previewSize = videoContainer
    ? {
        width: `calc(${videoContainer.style.width || '320px'} * 0.85)`,
        height: videoContainer.style.height || '240px',
      }
    : { width: '272px', height: '240px' } // 320px * 0.85 = 272px

  let previewsHTML =
    '<div style="display: flex; flex-wrap: wrap; gap: 10px; margin: 0; justify-content: center; align-items: center; width: 100%;">'

  for (let i = 0; i < cameras.length; i++) {
    const camera = cameras[i]
    const previewId = `camera-preview-${i}`
    const isActive =
      currentActiveCamera && currentActiveCamera.deviceId === camera.deviceId

    previewsHTML += `
      <div 
        id="camera-preview-container-${i}"
        class="camera-preview-container"
        data-device-id="${camera.deviceId}"
        data-camera-label="${camera.label || `Camera ${i + 1}`}"
        style="display: flex; flex-direction: column; align-items: center; margin: 0; padding: 5px; border-radius: 8px; transition: all 0.2s ease; ${isActive ? 'background-color: #e8f5e8; border: 2px solid #28a745;' : 'border: 2px solid transparent;'}"
      >
        <video 
          id="${previewId}" 
          style="width: ${previewSize.width}; height: ${previewSize.height}; border: 2px solid #ccc; border-radius: 4px; object-fit: cover; pointer-events: none;"
          autoplay 
          muted 
          playsinline
        ></video>
        <div style="margin-top: 5px; font-size: 12px; text-align: center; max-width: ${previewSize.width}; word-wrap: break-word; white-space: normal; color: ${isActive ? '#28a745' : '#666'}; font-weight: ${isActive ? 'bold' : 'normal'};">
          ${camera.label || `Camera ${i + 1}`}
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
      const labelDiv = container?.querySelector('div[style*="font-size: 12px"]')

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

          // Get resolution and update label
          const videoTrack = stream.getVideoTracks()[0]
          if (videoTrack && labelDiv) {
            const settings = videoTrack.getSettings()
            const width = settings.width || 0
            const height = settings.height || 0
            const currentLabel = camera.label || `Camera ${i + 1}`
            labelDiv.textContent = `${currentLabel}, ${width}×${height}`

            // Store resolution for camera switching (skip re-probing)
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
 * @param {number} cameraCount - Number of available cameras
 */
const updateTitleAndDescription = (RC, cameraCount) => {
  // Update the title in top right
  const titleKey =
    cameraCount === 1 ? 'RC_NeedCameraTitle' : 'RC_ChooseCameraTitle'
  showCameraTitleInTopRight(RC, titleKey)

  // Update the description in the popup
  const messageKey = cameraCount === 1 ? 'RC_NeedCamera' : 'RC_ChooseCamera'
  const messageDiv = document.querySelector(
    '.camera-selection-popup .swal2-html-container div[style*="background: white"]',
  )
  if (messageDiv) {
    const privacyText = phrases.RC_privacyCamera[RC.L]
    messageDiv.innerHTML = `${phrases[messageKey][RC.L]}<br><br>${privacyText}`
  }
}

/**
 * Updates camera previews when camera list changes
 * @param {Array} newCameras - Updated array of camera devices
 * @param {Object} RC - RemoteCalibrator instance
 * @param {Object} currentActiveCamera - Currently active camera
 * @param {Array} oldCameras - Previous array of camera devices
 */
const updateCameraPreviews = async (
  newCameras,
  RC,
  currentActiveCamera,
  oldCameras = [],
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

  // Update title and description based on camera count
  updateTitleAndDescription(RC, newCameras.length)

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
            const otherDiv = otherContainer.querySelector('div')
            if (otherDiv) {
              otherDiv.style.color = '#666'
              otherDiv.style.fontWeight = 'normal'
            }
          }
        })

        // Highlight current container as tentative selection
        container.style.backgroundColor = '#e8f5e8'
        container.style.border = '2px solid #28a745'
        const div = container.querySelector('div')
        if (div) {
          div.style.color = '#28a745'
          div.style.fontWeight = 'bold'
        }

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

        // Add loading text between preview and instruction
        const loadingText = document.createElement('div')
        loadingText.id = 'camera-loading-text'
        loadingText.style.cssText = `
          text-align: center;
          color: #666;
          font-style: italic;
          margin: 10px 0;
          font-size: 14px;
        `
        loadingText.textContent = phrases.RC_LoadingVideo[RC.L]

        // Insert loading text after the preview container
        const previewContainer = document.querySelector(
          '.camera-selection-popup .swal2-html-container',
        )
        if (previewContainer) {
          previewContainer.appendChild(loadingText)
        }

        // Call the same function that OK button would call
        await window.selectCamera(deviceId, label)

        // Remove loading text
        const loadingTextElement = document.getElementById(
          'camera-loading-text',
        )
        if (loadingTextElement) {
          loadingTextElement.remove()
        }

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
 * @param {Function} onClose - Callback function when popup is closed
 * @returns {Promise} - Promise that resolves when popup is closed with selected camera
 */
export const showCameraSelectionPopup = async (
  RC,
  title,
  message,
  onClose = null,
  titleKey = 'RC_ChooseCameraTitle',
) => {
  // Show the camera title in the top right of the webpage
  showCameraTitleInTopRight(RC, titleKey)

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
    html: `${cameraPreviewsHTML}<br><div style="background: white; padding: 1rem; border-radius: 6px; margin-top: 1rem;">${message}<br><br>${phrases.RC_privacyCamera[RC.L]}</div>`,
    showConfirmButton: false,
    allowEnterKey: false, // To be changed
    // Dynamic popup width based on number of cameras
    width: dynamicMaxWidth,
    background: '#eee', // Match standard RC background color
    backdrop: '#eee',
    customClass: {
      popup: 'my__swal2__container camera-selection-popup camera-no-overlay',
      icon: 'my__swal2__icon',
      title: 'my__swal2__title',
      htmlContainer: `my__swal2__html rc-lang-${RC.LD.toLowerCase()}`,
      confirmButton: 'rc-button rc-go-button',
    },
    didOpen: () => {
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
                          const label = camera.label || `Camera ${index + 1}`
                          const res = camera.resolution
                            ? `, ${camera.resolution.width}×${camera.resolution.height}`
                            : ''

                          if (isActive) {
                            container.style.backgroundColor = '#e8f5e8'
                            container.style.border = '2px solid #28a745'
                            container.querySelector('div').style.color =
                              '#28a745'
                            container.querySelector('div').style.fontWeight =
                              'bold'
                            container.querySelector('div').textContent =
                              `${label}${res}`
                          } else {
                            container.style.backgroundColor = 'transparent'
                            container.style.border = '2px solid transparent'
                            container.querySelector('div').style.color = '#666'
                            container.querySelector('div').style.fontWeight =
                              'normal'
                            container.querySelector('div').textContent =
                              `${label}${res}`
                          }
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

            // Add loading text between preview and instruction
            const loadingText = document.createElement('div')
            loadingText.id = 'camera-loading-text'
            loadingText.style.cssText = `
              text-align: center;
              color: #666;
              font-style: italic;
              margin: 10px 0;
              font-size: 14px;
            `
            loadingText.textContent = phrases.RC_LoadingVideo[RC.L]

            // Insert loading text after the preview container
            const previewContainer = document.querySelector(
              '.camera-selection-popup .swal2-html-container',
            )
            if (previewContainer) {
              previewContainer.appendChild(loadingText)
            }

            // Call selectCamera and wait for it to complete (same as click handler)
            window
              .selectCamera(hoveredCamera.deviceId, hoveredCamera.label)
              .then(() => {
                // Remove loading text
                const loadingTextElement = document.getElementById(
                  'camera-loading-text',
                )
                if (loadingTextElement) {
                  loadingTextElement.remove()
                }

                // Close the popup
                Swal.clickConfirm()
              })
              .catch(error => {
                console.error('Error selecting camera via Enter key:', error)
                // Still close the popup on error
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
                  const label = camera.label || `Camera ${index + 1}`
                  const res = camera.resolution
                    ? `, ${camera.resolution.width}×${camera.resolution.height}`
                    : ''

                  if (isActive) {
                    container.style.backgroundColor = '#e8f5e8'
                    container.style.border = '2px solid #28a745'
                    container.querySelector('div').style.color = '#28a745'
                    container.querySelector('div').style.fontWeight = 'bold'
                    container.querySelector('div').textContent =
                      `${label}${res}`
                  } else {
                    container.style.backgroundColor = 'transparent'
                    container.style.border = '2px solid transparent'
                    container.querySelector('div').style.color = '#666'
                    container.querySelector('div').style.fontWeight = 'normal'
                    container.querySelector('div').textContent =
                      `${label}${res}`
                  }
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
                const otherDiv = otherContainer.querySelector('div')
                if (otherDiv) {
                  otherDiv.style.color = '#666'
                  otherDiv.style.fontWeight = 'normal'
                }
              }
            })

            // Highlight current container as tentative selection
            container.style.backgroundColor = '#e8f5e8'
            container.style.border = '2px solid #28a745'
            const div = container.querySelector('div')
            if (div) {
              div.style.color = '#28a745'
              div.style.fontWeight = 'bold'
            }

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

            // Add loading text between preview and instruction
            const loadingText = document.createElement('div')
            loadingText.id = 'camera-loading-text'
            loadingText.style.cssText = `
              text-align: center;
              color: #666;
              font-style: italic;
              margin: 10px 0;
              font-size: 14px;
            `
            loadingText.textContent = phrases.RC_LoadingVideo[RC.L]

            // Insert loading text after the preview container
            const previewContainer = document.querySelector(
              '.camera-selection-popup .swal2-html-container',
            )
            if (previewContainer) {
              previewContainer.appendChild(loadingText)
            }

            // Call the same function that OK button would call
            await window.selectCamera(deviceId, label)

            // Remove loading text
            const loadingTextElement = document.getElementById(
              'camera-loading-text',
            )
            if (loadingTextElement) {
              loadingTextElement.remove()
            }

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

          // Add loading text between preview and instruction
          const loadingText = document.createElement('div')
          loadingText.id = 'camera-loading-text'
          loadingText.style.cssText = `
            text-align: center;
            color: #666;
            font-style: italic;
            margin: 10px 0;
            font-size: 14px;
          `
          loadingText.textContent = phrases.RC_LoadingVideo[RC.L]

          // Insert loading text after the preview container
          const previewContainer = document.querySelector(
            '.camera-selection-popup .swal2-html-container',
          )
          if (previewContainer) {
            previewContainer.appendChild(loadingText)
          }

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
              // Store the selected camera for return
              RC.selectedCamera = selectedCamera

              // Remove loading text
              const loadingTextElement = document.getElementById(
                'camera-loading-text',
              )
              if (loadingTextElement) {
                loadingTextElement.remove()
              }

              // Close the popup immediately after successful switch
              Swal.clickConfirm()
            } else {
              // Remove loading text on error
              const loadingTextElement = document.getElementById(
                'camera-loading-text',
              )
              if (loadingTextElement) {
                loadingTextElement.remove()
              }

              // Show error status immediately
              if (statusDiv) {
                statusDiv.innerHTML = '✗ Failed to switch camera'
                statusDiv.style.color = '#dc3545'
              }
            }
          } catch (error) {
            console.error('Camera switch error:', error)

            // Remove loading text on error
            const loadingTextElement = document.getElementById(
              'camera-loading-text',
            )
            if (loadingTextElement) {
              loadingTextElement.remove()
            }

            // Show error status immediately
            if (statusDiv) {
              statusDiv.innerHTML = '✗ Failed to switch camera'
              statusDiv.style.color = '#dc3545'
            }
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
        ${phrases.RC_CameraNotFound[RC.L].replace('\n', '<br />')}
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
      return await showTestPopup(RC, onClose)
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
      onClose,
      'RC_NeedCameraTitle',
    )

    // After camera selection, force fullscreen and check resolution if a camera was selected
    if (result.selectedCamera) {
      // Show the resolution setting message on the white page
      // This message will stay visible until the calling code (e.g., objectTest, blindSpotTestNew)
      // explicitly hides it when they're ready to display their UI
      showResolutionSettingMessage(RC)

      // Force fullscreen when camera is selected
      try {
        await getFullscreen(RC.L, RC)
        console.log('Entered fullscreen after camera selection')
      } catch (error) {
        console.warn(
          'Failed to enter fullscreen after camera selection:',
          error,
        )
      }

      await checkResolutionAfterSelection(RC, options)
      // Note: Resolution message is intentionally NOT hidden here
      // It will be hidden by the calling code when they're ready to display UI
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
    phrases.RC_ChooseCamera[RC.L],
    onClose,
    'RC_ChooseCameraTitle',
  )

  // After camera selection, force fullscreen and check resolution if a camera was selected
  if (result.selectedCamera) {
    // Show the resolution setting message on the white page
    // This message will stay visible until the calling code (e.g., objectTest, blindSpotTestNew)
    // explicitly hides it when they're ready to display their UI
    showResolutionSettingMessage(RC)

    // Force fullscreen when camera is selected
    try {
      await getFullscreen(RC.L, RC)
      console.log('Entered fullscreen after camera selection')
    } catch (error) {
      console.warn('Failed to enter fullscreen after camera selection:', error)
    }

    await checkResolutionAfterSelection(RC, options)
    // Note: Resolution message is intentionally NOT hidden here
    // It will be hidden by the calling code when they're ready to display UI
  }

  // Final safety cleanup - ensure camera polling is stopped
  if (RC.cameraPollingInterval) {
    clearInterval(RC.cameraPollingInterval)
    RC.cameraPollingInterval = null
  }

  return result
}

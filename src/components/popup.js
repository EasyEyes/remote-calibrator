import Swal from 'sweetalert2'
import { phrases } from '../i18n/schema'
import { swalInfoOptions } from './swalOptions'
import { setUpEasyEyesKeypadHandler } from '../extensions/keypadHandler'
import { exitFullscreen, getFullscreen, isFullscreen } from './utils'

/**
 * Shows the camera selection title in the top right of the webpage
 * @param {Object} RC - RemoteCalibrator instance
 */
export const showCameraTitleInTopRight = RC => {
  // Remove any existing camera title
  const existingTitle = document.getElementById('rc-camera-title-top-right')
  if (existingTitle) {
    existingTitle.remove()
  }

  // Create the title element
  const titleElement = document.createElement('div')
  titleElement.id = 'rc-camera-title-top-right'
  titleElement.innerHTML = `<h1>${phrases.RC_ChooseCameraTitle[RC.L]}</h1>`

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
    RC.gazeTracker.webgazer.showFaceFeedbackBox(
      originalVideoState.showFaceFeedbackBox,
    )
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
      `Applying ideal resolution constraints to device ${deviceId}...`,
    )

    // Use webgazer constraints with explicit deviceId to prevent camera switching
    const idealConstraints = {
      video: {
        deviceId: { exact: deviceId },
        width: { ideal: 1920, max: 1920 },
        height: { ideal: 1080, max: 1080 },
        aspectRatio: { ideal: 1.77778 }, // 16:9 ratio
        frameRate: { ideal: 30, max: 30 },
        facingMode: 'user',
      },
    }

    // Apply constraints through webgazer
    await RC.gazeTracker.webgazer.setCameraConstraints(idealConstraints)

    // Give time for constraints to take effect
    await new Promise(resolve => setTimeout(resolve, 800))

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
    console.warn('Failed to apply ideal resolution constraints:', error)
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
  // Give minimal time for camera to initialize after selection
  await new Promise(resolve => setTimeout(resolve, 300))

  // Check current resolution
  let videoParams = RC.gazeTracker?.webgazer?.videoParamsToReport
  if (videoParams && videoParams.width && videoParams.height) {
    let { width, height } = videoParams
    console.log(`Selected camera resolution: ${width}x${height}`)

    // Get threshold from options (if undefined, don't show popup)
    const threshold = options.resolutionWarningThreshold

    // If threshold is defined and resolution is low, try to improve it automatically first
    if (
      threshold !== undefined &&
      width < threshold &&
      !RC.resolutionWarningShown
    ) {
      console.log(
        `Resolution ${width}x${height} is below threshold ${threshold}. Attempting automatic improvement...`,
      )

      // Get current camera info for improvement attempt
      const activeCamera = RC.gazeTracker?.webgazer?.params?.activeCamera
      if (activeCamera?.id) {
        const improved = await applyIdealResolutionConstraints(
          RC,
          activeCamera.id,
        )

        if (improved) {
          // Re-check resolution after improvement
          videoParams = RC.gazeTracker?.webgazer?.videoParamsToReport
          if (videoParams && videoParams.width && videoParams.height) {
            width = videoParams.width
            height = videoParams.height
            console.log(`After automatic improvement: ${width}x${height}`)

            // If we now meet the threshold, no need to show popup
            if (width >= threshold) {
              console.log('Automatic improvement successful, no popup needed')
              return true
            }
          }
        }
      }
    }

    // Show popup if threshold is defined AND width < threshold AND we haven't shown it before
    if (
      threshold !== undefined &&
      width < threshold &&
      !RC.resolutionWarningShown
    ) {
      console.log(`Low resolution detected: ${width}x${height}. Showing popup.`)

      // Mark that we've shown the warning
      RC.resolutionWarningShown = true

      // Store fullscreen state and exit fullscreen before showing popup
      const wasInFullscreen = isFullscreen()
      if (wasInFullscreen) {
        console.log('Exiting fullscreen before showing resolution popup')
        await exitFullscreen()
        // Minimal wait for fullscreen to exit
        await new Promise(resolve => setTimeout(resolve, 50))
      }

      await Swal.fire({
        ...swalInfoOptions(RC, { showIcon: false }),
        title: phrases.RC_ImprovingCameraResolutionTitle[RC.L],
        html: `
            <div style="text-align: left; margin: 1rem 0; padding: 0;">
              <p style="margin: 0; padding: 0; text-align: left;"> ${phrases.RC_ImprovingCameraResolution[RC.L].replace('𝟙𝟙𝟙', width).replace('𝟚𝟚𝟚', height)}</p>
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
            .catch(error => console.error('Failed to re-enter fullscreen:', error))
        )
      }
      
      // Priority 2: Attempt resolution improvement in parallel
      const activeCamera = RC.gazeTracker?.webgazer?.params?.activeCamera
      if (activeCamera?.id) {
        console.log('Attempting to apply ideal resolution constraints again...')
        operations.push(
          applyIdealResolutionConstraints(RC, activeCamera.id)
            .then(() => console.log('Resolution improvement completed'))
            .catch(error => console.error('Resolution improvement failed:', error))
        )
      }
      
      // Wait for all operations to complete (but don't block on resolution improvement)
      if (operations.length > 0) {
        await Promise.allSettled(operations)
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
    console.log(
      `Switching to camera: ${selectedCamera.label} with ideal resolution optimization`,
    )

    // Update webgazer camera parameters
    RC.gazeTracker.webgazer.params.activeCamera.label = selectedCamera.label
    RC.gazeTracker.webgazer.params.activeCamera.id = selectedCamera.deviceId

    // Update camera constraints if webgazer is already running
    if (RC.gazeTracker.webgazer.params.videoIsOn) {
      // Apply ideal resolution constraints to get 1920x1080 and prevent zooming/cropping
      const constraintsApplied = await applyIdealResolutionConstraints(
        RC,
        selectedCamera.deviceId,
      )

      if (!constraintsApplied) {
        // Fallback to basic constraints if ideal constraints failed
        console.log('Ideal constraints failed, applying basic constraints...')
        await RC.gazeTracker.webgazer.setCameraConstraints({
          video: {
            deviceId: { exact: selectedCamera.deviceId },
          },
        })
      }
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
        <div style="margin-top: 5px; font-size: 12px; text-align: center; max-width: ${previewSize.width}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: ${isActive ? '#28a745' : '#666'}; font-weight: ${isActive ? 'bold' : 'normal'};">
          ${camera.label || `Camera ${i + 1}`} ${isActive ? '(Current)' : ''}
        </div>
      </div>
    `
  }

  previewsHTML += '</div>'

  // Start video streams for all cameras
  setTimeout(async () => {
    for (let i = 0; i < cameras.length; i++) {
      const camera = cameras[i]
      const videoElement = document.getElementById(`camera-preview-${i}`)

      if (videoElement) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: {
              deviceId: { exact: camera.deviceId },
            },
          })
          videoElement.srcObject = stream
        } catch (error) {
          console.error(
            `Failed to get stream for camera ${camera.label}:`,
            error,
          )
          // Show error state
          videoElement.style.border = '2px solid #dc3545'
          videoElement.style.backgroundColor = '#f8d7da'
        }
      }
    }
  }, 100)

  return previewsHTML
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

        // Add delay to account for video switching time
        await new Promise(resolve => setTimeout(resolve, 800))

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
) => {
  // Show the camera title in the top right of the webpage
  showCameraTitleInTopRight(RC)

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
  const originalMainVideoDisplay = mainVideoContainer?.style?.display || 'block'
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
    html: `${cameraPreviewsHTML}<br><div style="background: white; padding: 1rem; border-radius: 6px; margin-top: 1rem;">${message}</div>`,
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
                          if (isActive) {
                            container.style.backgroundColor = '#e8f5e8'
                            container.style.border = '2px solid #28a745'
                            container.querySelector('div').style.color =
                              '#28a745'
                            container.querySelector('div').style.fontWeight =
                              'bold'
                            container.querySelector('div').textContent =
                              `${camera.label || `Camera ${index + 1}`} (Current)`
                          } else {
                            container.style.backgroundColor = 'transparent'
                            container.style.border = '2px solid transparent'
                            container.querySelector('div').style.color = '#666'
                            container.querySelector('div').style.fontWeight =
                              'normal'
                            container.querySelector('div').textContent =
                              camera.label || `Camera ${index + 1}`
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

          // Store the hovered camera as selected
          if (hoveredCamera) {
            RC.selectedCamera = hoveredCamera
          }

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

          // Add 1500ms delay to account for video switching time
          setTimeout(async () => {
            // Remove loading text
            const loadingTextElement = document.getElementById(
              'camera-loading-text',
            )
            if (loadingTextElement) {
              loadingTextElement.remove()
            }

            // Close the popup
            Swal.clickConfirm()
          }, 1500)
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
                    container.querySelector('div').style.color = '#28a745'
                    container.querySelector('div').style.fontWeight = 'bold'
                    container.querySelector('div').textContent =
                      `${camera.label || `Camera ${index + 1}`} (Current)`
                  } else {
                    container.style.backgroundColor = 'transparent'
                    container.style.border = '2px solid transparent'
                    container.querySelector('div').style.color = '#666'
                    container.querySelector('div').style.fontWeight = 'normal'
                    container.querySelector('div').textContent =
                      camera.label || `Camera ${index + 1}`
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

            // Add delay to account for video switching time
            await new Promise(resolve => setTimeout(resolve, 800))

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

              // Add delay to account for video switching time
              await new Promise(resolve => setTimeout(resolve, 800))

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

      // Show the main video preview again when the popup closes
      if (mainVideoContainer) {
        mainVideoContainer.style.display = originalMainVideoDisplay
      }

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

      // Show the main video preview again when the popup closes
      if (mainVideoContainer) {
        mainVideoContainer.style.display = originalMainVideoDisplay
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
    RC.gazeTracker.webgazer.showFaceFeedbackBox(
      originalVideoState.showFaceFeedbackBox,
    )
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
  const originalMainVideoDisplay = mainVideoContainer?.style?.display || 'block'
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
    // Only one camera - skip popup but check resolution
    // Make sure no title is shown since we're not showing the popup
    hideCameraTitleFromTopRight()

    if (mainVideoContainer) {
      mainVideoContainer.style.display = originalMainVideoDisplay
    }

    // Check resolution for the single auto-selected camera
    await checkResolutionAfterSelection(RC, options)

    // Call onClose callback if provided
    if (onClose && typeof onClose === 'function') {
      onClose(null)
    }
    return { selectedCamera: null }
  }

  // Show popup only if there are 2 or more cameras
  const result = await showCameraSelectionPopup(
    RC,
    '',
    phrases.RC_ChooseCamera[RC.L],
    onClose,
  )

  // After camera selection, check resolution if a camera was selected
  if (result.selectedCamera) {
    await checkResolutionAfterSelection(RC, options)
  }

  // Final safety cleanup - ensure camera polling is stopped
  if (RC.cameraPollingInterval) {
    clearInterval(RC.cameraPollingInterval)
    RC.cameraPollingInterval = null
  }

  return result
}

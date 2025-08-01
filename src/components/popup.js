import Swal from 'sweetalert2'
import { phrases } from '../i18n/schema'
import { swalInfoOptions } from './swalOptions'
import { setUpEasyEyesKeypadHandler } from '../extensions/keypadHandler'

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
        if (event.key === 'Enter' || event.key === 'Return') {
          Swal.clickConfirm()
        }
      }

      // Add keyboard listener
      document.addEventListener('keydown', keydownListener)

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
        document.removeEventListener('keydown', RC.popupKeydownListener)
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
 * Attempts to switch to a new camera with error handling
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
      await RC.gazeTracker.webgazer.setCameraConstraints({
        video: {
          deviceId: { exact: selectedCamera.deviceId },
        },
      })
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
        width: videoContainer.style.width || '320px',
        height: videoContainer.style.height || '240px',
      }
    : { width: '320px', height: '240px' }

  let previewsHTML =
    '<div style="display: flex; flex-wrap: wrap; gap: 10px; margin: 20px 0; justify-content: center; align-items: center;">'

  for (let i = 0; i < cameras.length; i++) {
    const camera = cameras[i]
    const previewId = `camera-preview-${i}`
    const isActive =
      currentActiveCamera && currentActiveCamera.deviceId === camera.deviceId

    previewsHTML += `
      <div 
        id="camera-preview-container-${i}"
        style="display: flex; flex-direction: column; align-items: center; margin-bottom: 10px; cursor: pointer; padding: 5px; border-radius: 8px; transition: all 0.2s ease; ${isActive ? 'background-color: #e8f5e8; border: 2px solid #28a745;' : 'border: 2px solid transparent;'}"
        onclick="window.selectCamera('${camera.deviceId}', '${camera.label || `Camera ${i + 1}`}')"
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

  // Get available cameras
  const cameras = await getAvailableCameras()

  // Get current active camera
  const currentActiveCamera = getCurrentActiveCamera(RC)

  // Create camera previews
  const cameraPreviewsHTML = await createCameraPreviews(
    cameras,
    RC,
    null,
    currentActiveCamera,
  )

  // Create status div for feedback
  const statusHTML =
    '<div id="camera-status" style="margin-top: 10px; font-size: 12px; color: #666; text-align: center;"></div>'

  const result = await Swal.fire({
    ...swalInfoOptions(RC, { showIcon: false }),
    icon: undefined,
    title,
    html: `${message}<br><br>${cameraPreviewsHTML}<br><br>${statusHTML}`,
    confirmButtonText: phrases.RC_ok[RC.L],
    allowEnterKey: true,
    // Reduce popup width to fit content
    width: 'auto',
    maxWidth: '600px',
    didOpen: () => {
      // Handle keyboard events
      const keydownListener = event => {
        if (event.key === 'Enter' || event.key === 'Return') {
          Swal.clickConfirm()
        }
      }

      // Add keyboard listener
      document.addEventListener('keydown', keydownListener)

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

      // Initialize status with current camera
      const statusDiv = document.getElementById('camera-status')
      if (statusDiv && currentActiveCamera) {
        statusDiv.innerHTML = `Current: ${currentActiveCamera.label || 'camera'}`
        statusDiv.style.color = '#666'
      }

      // Create global camera selection function
      window.selectCamera = async (deviceId, label) => {
        const selectedCamera = cameras.find(cam => cam.deviceId === deviceId)

        if (selectedCamera && RC.gazeTracker?.webgazer) {
          const statusDiv = document.getElementById('camera-status')

          // Show loading status
          if (statusDiv) {
            statusDiv.innerHTML = 'Switching camera...'
            statusDiv.style.color = '#666'
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
              // Keep "Switching camera..." message for 1.5 seconds before showing success
              setTimeout(() => {
                if (statusDiv) {
                  statusDiv.innerHTML = `✓ Switched to ${selectedCamera.label || 'camera'}`
                  statusDiv.style.color = '#28a745'
                }
              }, 1500)

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
            } else {
              // Show error status immediately
              if (statusDiv) {
                statusDiv.innerHTML = '✗ Failed to switch camera'
                statusDiv.style.color = '#dc3545'
              }
            }
          } catch (error) {
            console.error('Camera switch error:', error)

            // Show error status immediately
            if (statusDiv) {
              statusDiv.innerHTML = '✗ Failed to switch camera'
              statusDiv.style.color = '#dc3545'
            }
          } finally {
            // Re-enable all preview containers
            cameras.forEach((camera, index) => {
              const container = document.getElementById(
                `camera-preview-container-${index}`,
              )
              if (container) {
                container.style.pointerEvents = 'auto'
                container.style.opacity = '1'
              }
            })
          }
        }
      }
    },
    willClose: () => {
      // Remove keyboard event listener
      if (RC.popupKeydownListener) {
        document.removeEventListener('keydown', RC.popupKeydownListener)
        RC.popupKeydownListener = null
      }

      // Remove global camera selection function
      if (window.selectCamera) {
        delete window.selectCamera
      }

      // Stop all preview video streams
      cameras.forEach((camera, index) => {
        const videoElement = document.getElementById(`camera-preview-${index}`)
        if (videoElement && videoElement.srcObject) {
          const stream = videoElement.srcObject
          stream.getTracks().forEach(track => track.stop())
        }
      })
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

  // Get selected camera (either from user selection or current active)
  const selectedCamera = RC.selectedCamera || currentActiveCamera

  // Call onClose callback if provided
  if (onClose && typeof onClose === 'function') {
    onClose(selectedCamera)
  }

  return { ...result, selectedCamera }
}

/**
 * Shows a unified popup for all tests with camera selection
 * @param {Object} RC - RemoteCalibrator instance
 * @param {Function} onClose - Callback function when popup is closed
 * @returns {Promise} - Promise that resolves when popup is closed with selected camera
 */
export const showTestPopup = async (RC, onClose = null) => {
  // Check if there are at least 2 cameras available
  const cameras = await getAvailableCameras()

  // If less than 2 cameras, skip the popup
  if (cameras.length < 2) {
    // Call onClose callback if provided
    if (onClose && typeof onClose === 'function') {
      onClose(null)
    }
    return { selectedCamera: null }
  }

  // Show popup only if there are 2 or more cameras
  return await showCameraSelectionPopup(
    RC,
    '',
    phrases.RC_ChooseCamera[RC.L],
    onClose,
  )
}

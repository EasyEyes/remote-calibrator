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
    showFaceFeedbackBox: RC.gazeTracker?.webgazer?.params?.showFaceFeedbackBox ?? true,
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
    RC.gazeTracker.webgazer.showFaceFeedbackBox(originalVideoState.showFaceFeedbackBox)
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
 * Shows a popup with camera selection dropdown
 * @param {Object} RC - RemoteCalibrator instance
 * @param {string} title - Popup title
 * @param {string} message - Popup message
 * @param {Function} onClose - Callback function when popup is closed
 * @returns {Promise} - Promise that resolves when popup is closed with selected camera
 */
export const showCameraSelectionPopup = async (RC, title, message, onClose = null) => {
  // Store current video visibility state
  const originalVideoState = {
    showVideo: RC.gazeTracker?.webgazer?.params?.showVideo ?? true,
    showFaceOverlay: RC.gazeTracker?.webgazer?.params?.showFaceOverlay ?? true,
    showFaceFeedbackBox: RC.gazeTracker?.webgazer?.params?.showFaceFeedbackBox ?? true,
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
  
  // Create camera selection HTML
  const cameraSelectHTML = cameras.length > 0
    ? `<div style="margin: 20px 0;">
         <select id="camera-select" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
           ${cameras.map((camera, index) => 
             `<option value="${camera.deviceId}" ${index === 0 ? 'selected' : ''}>
                ${camera.label || `Camera ${index + 1}`}
              </option>`
           ).join('')}
         </select>
       </div>`
    : '<p style="color: #666; font-style: italic;">No cameras detected</p>'

  const result = await Swal.fire({
    ...swalInfoOptions(RC, { showIcon: false }),
    icon: undefined,
    title,
    html: `${message}<br><br>${cameraSelectHTML}`,
    confirmButtonText: phrases.RC_ok[RC.L],
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

      // Add camera change listener
      const cameraSelect = document.getElementById('camera-select')
      if (cameraSelect && cameras.length > 0) {
        const cameraChangeListener = (event) => {
          const selectedCamera = cameras.find(cam => cam.deviceId === event.target.value)
          if (selectedCamera && RC.gazeTracker?.webgazer) {
            // Update webgazer camera immediately
            RC.gazeTracker.webgazer.params.activeCamera.label = selectedCamera.label
            RC.gazeTracker.webgazer.params.activeCamera.id = selectedCamera.deviceId
            
            // Update camera constraints if webgazer is already running
            if (RC.gazeTracker.webgazer.params.videoIsOn) {
              RC.gazeTracker.webgazer.setCameraConstraints({
                video: {
                  deviceId: selectedCamera.deviceId
                }
              })
            }
          }
        }
        
        cameraSelect.addEventListener('change', cameraChangeListener)
        
        // Store the listener for cleanup
        RC.cameraChangeListener = cameraChangeListener
      }
    },
    willClose: () => {
      // Remove keyboard event listener
      if (RC.popupKeydownListener) {
        document.removeEventListener('keydown', RC.popupKeydownListener)
        RC.popupKeydownListener = null
      }
      
      // Remove camera change listener
      if (RC.cameraChangeListener) {
        const cameraSelect = document.getElementById('camera-select')
        if (cameraSelect) {
          cameraSelect.removeEventListener('change', RC.cameraChangeListener)
        }
        RC.cameraChangeListener = null
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
    RC.gazeTracker.webgazer.showFaceFeedbackBox(originalVideoState.showFaceFeedbackBox)
  }

  // Get selected camera
  const cameraSelect = document.getElementById('camera-select')
  const selectedCamera = cameraSelect ? cameras.find(cam => cam.deviceId === cameraSelect.value) : null

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
    phrases.RC_SelectCamera[RC.L],
    onClose
  )
} 
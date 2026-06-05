import { setDefaultVideoPosition } from '../components/video'
import {
  getCameraXYPxViewport,
  isBottomCenterCamera,
} from '../components/utils'

export const createFixationCrossOnVideo = () => {
  // Remove existing cross if any
  const existingCross = document.getElementById('video-fixation-cross')
  if (existingCross) {
    existingCross.parentNode.removeChild(existingCross)
  }

  const videoContainer = document.getElementById('webgazerVideoContainer')
  if (!videoContainer) return null

  // Create cross container
  const crossContainer = document.createElement('div')
  crossContainer.id = 'video-fixation-cross'
  crossContainer.style.position = 'absolute'
  crossContainer.style.top = '50%'
  crossContainer.style.left = '50%'
  crossContainer.style.transform = 'translate(-50%, -50%)'
  crossContainer.style.pointerEvents = 'none'
  crossContainer.style.zIndex = '999999999999'

  // Create horizontal line
  const horizontalLine = document.createElement('div')
  horizontalLine.style.position = 'absolute'
  horizontalLine.style.width = '32px'
  horizontalLine.style.height = '3px'
  horizontalLine.style.backgroundColor = '#ac0d0d'
  horizontalLine.style.left = '50%'
  horizontalLine.style.top = '50%'
  horizontalLine.style.transform = 'translate(-50%, -50%)'

  // Create vertical line
  const verticalLine = document.createElement('div')
  verticalLine.style.position = 'absolute'
  verticalLine.style.width = '3px'
  verticalLine.style.height = '32px'
  verticalLine.style.backgroundColor = '#ac0d0d'
  verticalLine.style.left = '50%'
  verticalLine.style.top = '50%'
  verticalLine.style.transform = 'translate(-50%, -50%)'

  crossContainer.appendChild(horizontalLine)
  crossContainer.appendChild(verticalLine)
  videoContainer.appendChild(crossContainer)

  return crossContainer
}

export const removeFixationCrossFromVideo = () => {
  const cross = document.getElementById('video-fixation-cross')
  if (cross && cross.parentNode) {
    cross.parentNode.removeChild(cross)
  }
}

export const removeDistancePageArrowIndicators = () => {
  const ids = [
    'object-test-arrow-indicators',
    'known-distance-test-arrow-indicators',
  ]
  ids.forEach(id => {
    const el = document.getElementById(id)
    if (el) el.remove()
  })
}

export const repositionVideoForCameraMonitoring = (
  RC,
  calibrateDistanceChecking,
) => {
  if (!RC || !calibrateDistanceChecking) return

  const videoContainer = document.getElementById('webgazerVideoContainer')
  if (!videoContainer) return

  const checkingOptions = calibrateDistanceChecking
  let shouldPositionAtCamera = false
  let shouldShowCross = false

  if (checkingOptions && typeof checkingOptions === 'string') {
    const optionsArray = checkingOptions
      .toLowerCase()
      .split(',')
      .map(s => s.trim())
    const hasCamera = optionsArray.includes('camera')
    const hasCenter = optionsArray.includes('center')
    shouldPositionAtCamera = hasCamera && !hasCenter
    shouldShowCross = optionsArray.includes('tiltandswivel')
  }

  if (shouldPositionAtCamera) {
    // Mark video container as being in camera mode (prevents setDefaultVideoPosition from overriding)
    videoContainer.dataset.cameraMode = 'true'
    delete videoContainer.dataset.screenCenterMode

    // Unbind the default video resize listener so it cannot move video to center on resize/fullscreen exit
    if (videoContainer._resizeHandler) {
      window.removeEventListener('resize', videoContainer._resizeHandler)
      videoContainer._resizeHandler = null
      videoContainer._hasResizeListener = false
    }

    // Position the PiP video at the camera anchor on the current
    // viewport. Top-camera setups: anchor at viewport top.
    // Bottom-camera setups: anchor at viewport bottom. (Use
    // innerWidth/innerHeight so the position survives
    // resize / fullscreen-exit.)
    const cameraXYPx = getCameraXYPxViewport(RC)
    const isBottom = isBottomCenterCamera(RC)

    videoContainer.style.zIndex = '999999999999'
    videoContainer.style.position = 'fixed'

    if (RC.isMobile.value) {
      // Mobile - keep PiP in the corner closest to the camera.
      videoContainer.style.left = 'unset'
      videoContainer.style.right = RC._CONST.N.VIDEO_MARGIN
      if (isBottom) {
        videoContainer.style.top = 'unset'
        videoContainer.style.bottom = '0px'
      } else {
        videoContainer.style.top = '0px'
        videoContainer.style.bottom = 'unset'
      }
    } else {
      // Desktop - center horizontally at cameraXYPx[0]; anchor
      // vertically at top (y=0) for top cameras, at bottom
      // (y=innerHeight) for bottom cameras.
      const videoWidth =
        parseInt(videoContainer.style.width) || videoContainer.offsetWidth || 0

      videoContainer.style.left = `${cameraXYPx[0] - videoWidth / 2}px`
      videoContainer.style.right = 'unset'

      if (isBottom) {
        videoContainer.style.top = 'unset'
        videoContainer.style.bottom = '0px'
      } else {
        videoContainer.style.top = `${cameraXYPx[1]}px`
        videoContainer.style.bottom = 'unset'
      }
      videoContainer.style.transform = 'none'
    }

    // Add fixation cross centered on video only if tiltandswivel is included
    if (shouldShowCross) {
      createFixationCrossOnVideo()
    } else {
      removeFixationCrossFromVideo()
    }
  } else {
    // Clear mode flags so setDefaultVideoPosition doesn't skip
    delete videoContainer.dataset.cameraMode
    delete videoContainer.dataset.screenCenterMode

    // Default positioning (centered on screen)
    setDefaultVideoPosition(RC, videoContainer)
    // Show red cross when tiltandswivel is on (same as camera-on-top case), otherwise remove
    if (shouldShowCross) {
      createFixationCrossOnVideo()
    } else {
      removeFixationCrossFromVideo()
    }
  }
}

export const trimVideoFeedbackDisplay = (
  videoId,
  videoCanvasId,
  cameraDownshiftFraction = 0,
  RC,
) => {
  if (!videoId) {
    console.warn('//.No videoId provided')
    return
  }

  const video = document.getElementById(videoId)
  if (!video) {
    console.warn('//.Video element not found:', videoId)
    return
  }

  const videoContainer = document.getElementById('webgazerVideoContainer')
  if (!videoContainer) {
    console.warn('//.Video container not found')
    return
  }

  const webgazerFaceFeedbackBox = document.getElementById(
    'webgazerFaceFeedbackBox',
  )

  // Calculate the trim amount as percentage of video height
  const trimTopPercent = (2 * cameraDownshiftFraction * 100).toFixed(2)
  // Apply CSS clipping to trim the top of the video
  // clip-path: inset(top right bottom left)
  videoContainer.style.clipPath = `inset(${trimTopPercent}% 0% 0% 0%)`

  // Center the cropped video container on the screen
  // We need to adjust positioning to account for the clipped top portion
  const containerRect = videoContainer.getBoundingClientRect()
  const originalHeight = containerRect.height
  const trimTopFraction = parseFloat(trimTopPercent) / 100
  const clippedHeight = originalHeight * (1 - trimTopFraction)
  const clippedTopOffset = originalHeight * trimTopFraction

  videoContainer.style.position = 'fixed'
  videoContainer.style.left = '50%'
  // Adjust top position to center the visible clipped area
  videoContainer.style.top = `calc(50% - ${clippedTopOffset / 2}px)`
  videoContainer.style.transform = 'translate(-50%, -50%)'
  // videoContainer.style.zIndex = '1000'

  if (webgazerFaceFeedbackBox) {
    // Get the original container dimensions
    const containerRect = videoContainer.getBoundingClientRect()
    const originalHeight = containerRect.height

    // Calculate the effective height after clipping
    const trimTopFraction = parseFloat(trimTopPercent) / 100
    const effectiveHeight = originalHeight * (1 - trimTopFraction)

    // Calculate the center position within the clipped area
    // The clipped area starts at trimTopFraction of the original height
    const clippedAreaTop = originalHeight * trimTopFraction
    const centerYWithinClipped = clippedAreaTop + effectiveHeight / 2

    // Convert to percentage of the original container height for positioning
    const centerYPercent = (centerYWithinClipped / originalHeight) * 100

    // Set the feedback box height to 60% of the trimmed height
    const feedbackBoxHeight = effectiveHeight * 0.66

    //center the feedback box inside the video container AFTER clip-path is applied
    webgazerFaceFeedbackBox.style.left = '50%'
    webgazerFaceFeedbackBox.style.top = `${centerYPercent}%`
    webgazerFaceFeedbackBox.style.height = `${feedbackBoxHeight}px`
    webgazerFaceFeedbackBox.style.transform = 'translate(-50%, -50%)'
  }
}

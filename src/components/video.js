/* Only one video for all functions */

import { isBottomCenterCamera, safeExecuteFunc } from './utils'

export function addVideoElementsToBody() {
  let v = document.querySelector('video')
  if (!v) {
    v = document.createElement('video')
    v.id = 'pip-video'
    document.body.appendChild(v)
  }

  const vC = document.createElement('canvas')
  vC.id = 'video-canvas'
  document.body.appendChild(vC)

  return [v, vC, vC.getContext('2d', { willReadFrequently: true })]
  // ? Should return the already existed elements if already has video
}

export function drawVideoOnCanvas(video, vCtx, canvasWidth, canvasHeight) {
  vCtx.save()
  vCtx.translate(canvasWidth, 0)
  vCtx.scale(-1, 1)
  vCtx.drawImage(video, 0, 0, canvasWidth, canvasHeight) // DRAW
  vCtx.restore()
}

export function startVideo(videoElement, callback) {
  // TODO Check if there's already a video running
  navigator.getUserMedia(
    { video: {} },
    stream => {
      videoElement.srcObject = stream
      videoElement.play()

      // ! CALLBACK
      safeExecuteFunc(callback, stream)
    },
    err => console.error(err),
  )
}

export function formatVideoCanvas(video, vC, stream, targetWidth) {
  const { width, height } = stream
    ? stream.getTracks()[0].getSettings()
    : [video.videoWidth, video.videoHeight]
  vC.style.width = video.style.width = vC.width = `${targetWidth}px`
  vC.style.height =
    video.style.height =
    vC.height =
      `${(targetWidth / width) * height}px`

  return [width, height]
}

/**
 * Check if the webcam is already running
 * Return true if it is already occupied
 *
 */
export function checkWebcamStatus() {
  navigator.mediaDevices.getUserMedia({ video: true }, stream => {
    if (stream.getVideoTracks().length) return true
    return false
  })
}

/* ----------------------------- WebGazer Video ----------------------------- */

/**
 *
 * Check if WebGazer video is ready. If so, set the style for it.
 *
 */
export function checkWebgazerReady(RC, pipWidthPx, opacity, WG, callback) {
  const c = setInterval(() => {
    const v = document.getElementById('webgazerVideoContainer')
    if (v) {
      clearInterval(c)

      // Hide video container initially - popup or next step will show it when ready
      // This prevents the blank page with just video on top
      v.style.display = 'none'

      v.style.height = `${
        (pipWidthPx / Number.parseInt(v.style.width)) *
        Number.parseInt(v.style.height)
      }px`
      v.style.width = `${pipWidthPx}px`
      v.style.opacity = opacity
      WG.setVideoViewerSize(
        Number.parseInt(v.style.width),
        Number.parseInt(v.style.height),
      )

      // Set position
      setDefaultVideoPosition(RC, v)

      // Set video opacity and transitions
      RC.videoOpacity()
      if (RC.isMobile.value)
        v.style.transition =
          'right 0.5s, top 0.5s, width 0.5s, height 0.5s, border-radius 0.5s'
      else
        v.style.transition =
          'left 0.5s, bottom 0.5s, width 0.5s, height 0.5s, border-radius 0.5s'

      // Call callback immediately (was 700ms delay)
      safeExecuteFunc(callback)
    }
  }, 100)
}

export function setDefaultVideoPosition(RC, v) {
  // Skip repositioning if video is in camera mode (managed by repositionVideoForCameraMonitoring)
  if (v.dataset.cameraMode === 'true') {
    return
  }

  // Skip repositioning if video is in screen-center mode (managed by custom positioning)
  if (v.dataset.screenCenterMode === 'true') {
    return
  }

  // Anchor the PiP at the camera edge: top for top-center cameras,
  // bottom for bottom-center cameras (driven by RC.selectedCameraRow
  // set on the Choose Camera page when
  // calibrateDistanceAcceptBottomCameraBool is true).
  const isBottom = isBottomCenterCamera(RC)

  // Check if we're on a page with progress bar (distance check pages)
  const hasProgressBar = document.getElementById('custom-progress-bar') !== null
  v.style.zIndex = 999999999999
  if (RC.isMobile.value) {
    // Mobile - keep PiP in the corner closest to the camera.
    v.style.left = 'unset'
    v.style.right = RC._CONST.N.VIDEO_MARGIN
    if (isBottom) {
      v.style.top = 'unset'
      v.style.bottom = '0px'
    } else {
      v.style.top = '0px'
      v.style.bottom = 'unset'
    }
  } else {
    // Desktop - horizontally centered; vertically positioned to abut
    // the camera edge, unless the distance-check progress bar is
    // present in which case we keep the historic behaviour of
    // vertically centring the PiP (this is screen-center mode,
    // independent of camera edge).
    const videoWidth = parseInt(v.style.width) || parseInt(v.offsetWidth) || 0
    const videoHeight =
      parseInt(v.style.height) || parseInt(v.offsetHeight) || 0
    const viewportWidth =
      window.innerWidth || document.documentElement.clientWidth
    const viewportHeight =
      window.innerHeight || document.documentElement.clientHeight

    const leftPositionPx = viewportWidth / 2 - videoWidth / 2

    v.style.left = `${leftPositionPx}px`
    v.style.right = 'unset'
    v.style.transform = 'none'

    if (hasProgressBar) {
      // Center vertically when progress bar is present (independent of
      // camera edge -- the page itself is forcing screen-center layout).
      const topPositionPx = (viewportHeight - videoHeight) / 2
      v.style.top = `${topPositionPx}px`
      v.style.bottom = 'unset'
    } else if (isBottom) {
      // Bottom-camera: push PiP to bottom edge with no gap.
      v.style.top = 'unset'
      v.style.bottom = '0px'
    } else {
      // Top-camera: push PiP to top edge with no gap.
      v.style.top = '0px'
      v.style.bottom = 'unset'
    }
  }

  // Add window resize listener to reposition video when window size changes
  // This ensures video stays centered even when console opens
  if (!v._hasResizeListener) {
    v._hasResizeListener = true
    const resizeHandler = () => {
      setDefaultVideoPosition(RC, v)
    }
    window.addEventListener('resize', resizeHandler)

    // Store the handler for cleanup
    v._resizeHandler = resizeHandler
  }
}

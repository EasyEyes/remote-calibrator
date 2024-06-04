/* Only one video for all functions */

import { safeExecuteFunc } from './utils'

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

  return [v, vC, vC.getContext('2d')]
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

      // Give callback after 0.7 sec
      setTimeout(() => {
        RC.videoOpacity()
        if (RC.isMobile.value)
          v.style.transition =
            'right 0.5s, top 0.5s, width 0.5s, height 0.5s, border-radius 0.5s'
        else
          v.style.transition =
            'left 0.5s, bottom 0.5s, width 0.5s, height 0.5s, border-radius 0.5s'
        safeExecuteFunc(callback)
      }, 700)
    }
  }, 100)
}

export function setDefaultVideoPosition(RC, v) {
  if (RC.isMobile.value) {
    // Mobile
    v.style.left = 'unset'
    v.style.right = RC._CONST.N.VIDEO_MARGIN
    v.style.top = RC._CONST.N.VIDEO_MARGIN
    v.style.bottom = 'unset'
  } else {
    v.style.left = RC._CONST.N.VIDEO_MARGIN
    v.style.right = 'unset'
    v.style.top = 'unset'
    v.style.bottom = RC._CONST.N.VIDEO_MARGIN
  }
}

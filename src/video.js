// Only one video for all functions

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
      callback(stream)
    },
    err => console.error(err)
  )
}

export function formatVideoCanvas(vC, stream, targetWidth) {
  const { width, height } = stream.getTracks()[0].getSettings()
  vC.style.width = (vC.width = targetWidth) + 'px'
  vC.style.height = (vC.height = (targetWidth / width) * height) + 'px'

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
export function checkWebgazerReady(pipWidthPX, opacity, WG, callback) {
  let c = setInterval(() => {
    let v = document.getElementById('webgazerVideoContainer')
    if (v) {
      v.style.height =
        (pipWidthPX / parseInt(v.style.width)) * parseInt(v.style.height) + 'px'
      v.style.width = pipWidthPX + 'px'
      v.style.opacity = opacity
      WG.setVideoViewerSize(parseInt(v.style.width), parseInt(v.style.height))
      v.style.left = '10px'
      v.style.bottom = '10px'

      // Give callback after 3 sec
      setTimeout(() => {
        callback()
      }, 3000)
      clearInterval(c)
    }
  }, 200)
}

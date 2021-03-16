// Only one video for all functions

export function addVideoElementToBody() {
  const v = document.createElement('video')
  v.id = 'pip-video'
  document.body.appendChild(v)

  const vC = document.createElement('canvas')
  vC.id = 'video-canvas'
  document.body.appendChild(vC)
  return [v, vC]
  // ? Should return the already existed elements if already has video
}

export function startVideo(videoElement, callback) {
  // TODO Check if there's already a video running
  navigator.getUserMedia(
    { video: {} },
    stream => {
      videoElement.srcObject = stream
      videoElement.play()

      // ! CALLBACK
      callback(stream, videoElement)
    },
    err => console.error(err)
  )
}

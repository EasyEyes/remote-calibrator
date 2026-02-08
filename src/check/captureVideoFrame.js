
// Helper function to capture current video frame as base64 image
export const captureVideoFrame = RC => {
  try {
    const video = document.getElementById('webgazerVideoCanvas')
    if (!video) return null

    // Create a canvas to capture the frame
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')

    // Set canvas size to match video
    canvas.width = video.videoWidth || video.width
    canvas.height = video.videoHeight || video.height

    // Mirror the image to match the video display (since video is mirrored by default)
    ctx.save()
    ctx.translate(canvas.width, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    ctx.restore()

    // Convert to base64 data URL
    const capturedImage = canvas.toDataURL('image/jpeg')

    // Dispatch custom event with the captured image
    const event = new CustomEvent('rc-video-frame-captured', {
      detail: {
        image: capturedImage,
        timestamp: Date.now(),
      },
    })
    document.dispatchEvent(event)

    return capturedImage
  } catch (error) {
    console.warn('Failed to capture video frame:', error)
    return null
  }
}
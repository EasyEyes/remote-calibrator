/**
 * Auto-resume the webgazer video element while distance tracking runs.
 *
 * Browsers can implicitly pause the element (no .pause() call) e.g. after
 * its srcObject stream is swapped during camera re-setup on recalibration.
 * Nothing else ever calls play() again, so the canvas repaints the last
 * frame and tracked distance freezes. Called every tracking frame; cheap
 * when the video is already playing.
 */
export const ensureVideoPlaying = videoEl => {
  if (!videoEl || !videoEl.paused) return
  try {
    const p = videoEl.play()
    if (p && typeof p.catch === 'function') p.catch(() => {})
  } catch (e) {
    // Retry next frame
  }
}
